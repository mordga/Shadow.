import { storage } from "../storage";
import { claudeService } from "./claude-ai";
import { type InsertThreat, type InsertBypassPattern, type UserSecurityOverride, type SecurityConfig } from "@shared/schema";
import { ResilientModule } from "./failover-manager";
import type { HealthCheckResult } from "./health-monitor";
import { initializeAdaptiveProtection, getAdaptiveProtection } from "./adaptive-protection";
import { fileLogger } from "./file-logger";
import { shadowMode } from "./shadow-mode";

export interface ThreatEvidence {
  [key: string]: unknown;
}

export interface SecurityCheck {
  action: 'allow' | 'warn' | 'mute' | 'kick' | 'ban' | 'delete' | 'sanitize_mentions';
  reason: string;
  confidence: number;
  threatType: string;
  evidence?: ThreatEvidence;
}

export interface RaidDetectionConfig {
  maxJoinsPerMinute: number;
  maxJoinsPerHour: number;
  suspiciousPatterns: string[];
  minAccountAge: number; // days
}

export interface SpamDetectionConfig {
  maxMessagesPerMinute: number;
  maxDuplicateMessages: number;
  maxMentionsPerMessage: number;
  maxLinksPerMessage: number;
  cooldownPeriod: number; // seconds
}

interface MessageRecord {
  content: string;
  timestamp: number;
  serverId: string;
}

interface AggressivenessProfile {
  aiThreshold: number;
  spam: {
    maxMsgs: number;
    maxDuplicates: number;
    maxMentions: number;
    maxLinks: number;
    cooldownPeriod: number;
  };
  raid: {
    maxJoins: number;
    minAccountAge: number;
  };
}

// Unicode normalization: Remove diacritics and normalize text for consistent matching
function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, match => match === '@' || match === '$' || match === '!' ? match : ' ');
}

// Word filters for profanity and attack-related content
const VULGAR_WORDS_BASE = [
  // Spanish vulgar words
  'puta', 'puto', 'mierda', 'hijo de puta', 'cabron', 'cono', 'verga', 'gilipollas',
  'mamon', 'pendejo', 'culero', 'pendeja', 'boludo', 'pelotudo', 'boludez',
  'basura', 'idiota', 'imbecil', 'retrasado', 'retard', 'nino de papa',
  'pene', 'concha', 'culo', 'teta', 'polla', 'nalga', 'cornudo', 'desgraciado',
  'maldito', 'jodido', 'chingada', 'pinche', 'cabrona', 'malparida',
  // Drugs and substances
  'cocaina', 'coca', 'heroina', 'marihuana', 'marijuana',
  'hierba', 'mota', 'porro', 'crack', 'cristal', 'metanfetamina', 'meth',
  'extasis', 'mdma', 'lsd', 'acido', 'drogas', 'droga',
  'narcotrafico', 'narcotraficante', 'dealer', 'vender droga',
  'fentanilo', 'fentanyl', 'opio', 'morfina', 'ketamina', 'speed', 'anfetaminas',
  // English vulgar words
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cock', 'cunt',
  'nigger', 'nigga', 'faggot', 'whore', 'slut', 'bastard', 'ass'
];

// Generate abbreviations and variations for words (leet speak + common evasion patterns)
function generateVariations(word: string): string[] {
  const variations: string[] = [word];
  
  // Common letter substitutions (leet speak)
  const substitutions: Record<string, string[]> = {
    'a': ['4', '@'],
    'e': ['3'],
    'i': ['1', '!'],
    'o': ['0'],
    's': ['5', '$'],
    't': ['7'],
    'b': ['8'],
    'g': ['9'],
    'l': ['1'],
  };
  
  // Generate primary leet speak variation
  let leetWord = word;
  for (const [letter, subs] of Object.entries(substitutions)) {
    if (word.includes(letter)) {
      leetWord = leetWord.replace(new RegExp(letter, 'g'), subs[0]);
    }
  }
  if (leetWord !== word) {
    variations.push(leetWord);
  }
  
  // Generate secondary leet variation (alternate substitutions) for words >= 4 chars
  if (word.length >= 4) {
    let leetWord2 = word;
    for (const [letter, subs] of Object.entries(substitutions)) {
      if (word.includes(letter) && subs.length > 1) {
        leetWord2 = leetWord2.replace(new RegExp(letter, 'g'), subs[1]);
      }
    }
    if (leetWord2 !== word && leetWord2 !== leetWord) {
      variations.push(leetWord2);
    }
  }
  
  return Array.from(new Set(variations));
}

// Pre-compiled and cached vulgar words set for O(1) lookup performance
const VULGAR_WORDS_SET: Set<string> = new Set();
const VULGAR_WORDS: string[] = [];

// Initialize word lists once at module load
(function initializeVulgarWords() {
  for (const word of VULGAR_WORDS_BASE) {
    const normalizedWord = normalizeText(word);
    const variations = generateVariations(normalizedWord);
    for (const variation of variations) {
      if (!VULGAR_WORDS_SET.has(variation)) {
        VULGAR_WORDS_SET.add(variation);
        VULGAR_WORDS.push(variation);
      }
    }
  }
  console.log(`[SecurityEngine] Initialized ${VULGAR_WORDS.length} vulgar word variations from ${VULGAR_WORDS_BASE.length} base words`);
})();

// Compiled regex cache for performance
const regexCache = new Map<string, RegExp>();
const MAX_REGEX_CACHE_SIZE = 500;

function getCompiledRegex(pattern: string, flags: string): RegExp {
  const key = `${pattern}::${flags}`;
  let regex = regexCache.get(key);
  if (!regex) {
    if (regexCache.size >= MAX_REGEX_CACHE_SIZE) {
      const firstKey = regexCache.keys().next().value;
      if (firstKey) regexCache.delete(firstKey);
    }
    regex = new RegExp(pattern, flags);
    regexCache.set(key, regex);
  }
  return regex;
}

// Improved function to check if word matches with proper word boundaries
// Handles short words followed by punctuation (e.g., "ass!", "fuck.")
function matchesWithBoundary(content: string, word: string): boolean {
  const normalizedContent = normalizeText(content);
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Use non-word character boundaries that work for all word lengths
  // This correctly handles: "ass!", "fuck.", "shit?", etc.
  const pattern = `(^|[^a-z0-9])${escapedWord}($|[^a-z0-9])`;
  const regex = getCompiledRegex(pattern, 'i');
  
  return regex.test(normalizedContent);
}

// Fast check using Set for O(1) word existence lookup
function containsVulgarWord(content: string): { found: boolean; word: string | null } {
  const normalizedContent = normalizeText(content);
  const words = normalizedContent.split(/\s+/);
  
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z0-9@$!]/g, '');
    if (VULGAR_WORDS_SET.has(cleanWord)) {
      return { found: true, word: cleanWord };
    }
  }
  
  // Fallback to regex matching for compound phrases
  for (const vulgarWord of VULGAR_WORDS) {
    if (vulgarWord.includes(' ')) {
      if (normalizedContent.includes(vulgarWord)) {
        return { found: true, word: vulgarWord };
      }
    }
  }
  
  return { found: false, word: null };
}

const ATTACK_KEYWORDS = [
  // Raid/Nuke/Spam attack coordination
  'raid', 'nuke', 'spam', 'mass ban', 'mass kick', 'mass mute', 'flood',
  'ddos', 'bot raid', 'selfbot', 'massban', 'masskick', 'token grabber',
  'exploit', 'vulnerability', 'breach', 'hack', 'deface', 'griefing',
  'raid server', 'nuke server', 'destroy server', 'raid discord'
];

// User warnings tracker: Map<`${serverId}-${userId}`, { count: number, lastWarning: number }>
interface UserWarning {
  count: number;
  lastWarning: number;
  mutedUntil?: number;
}
const userWarnings = new Map<string, UserWarning>();

// Warning decay time (warnings reset after 24 hours of no infractions)
const WARNING_DECAY_MS = 24 * 60 * 60 * 1000;
// Mute duration after 3 warnings (10 minutes)
const MUTE_DURATION_MS = 10 * 60 * 1000;

const aggressivenessProfiles: Record<number, AggressivenessProfile> = {
  1: { aiThreshold: 0.95, spam: {maxMsgs: 15, maxDuplicates: 5, maxMentions: 8, maxLinks: 5, cooldownPeriod: 5}, raid: {maxJoins: 12, minAccountAge: 7} },
  2: { aiThreshold: 0.90, spam: {maxMsgs: 12, maxDuplicates: 4, maxMentions: 7, maxLinks: 4, cooldownPeriod: 5}, raid: {maxJoins: 10, minAccountAge: 10} },
  3: { aiThreshold: 0.85, spam: {maxMsgs: 10, maxDuplicates: 4, maxMentions: 6, maxLinks: 3, cooldownPeriod: 6}, raid: {maxJoins: 8, minAccountAge: 12} },
  4: { aiThreshold: 0.80, spam: {maxMsgs: 8, maxDuplicates: 3, maxMentions: 5, maxLinks: 3, cooldownPeriod: 8}, raid: {maxJoins: 7, minAccountAge: 13} },
  5: { aiThreshold: 0.75, spam: {maxMsgs: 7, maxDuplicates: 3, maxMentions: 4, maxLinks: 2, cooldownPeriod: 9}, raid: {maxJoins: 6, minAccountAge: 14} },
  6: { aiThreshold: 0.70, spam: {maxMsgs: 6, maxDuplicates: 2, maxMentions: 4, maxLinks: 2, cooldownPeriod: 10}, raid: {maxJoins: 5, minAccountAge: 16} },
  7: { aiThreshold: 0.65, spam: {maxMsgs: 5, maxDuplicates: 2, maxMentions: 3, maxLinks: 1, cooldownPeriod: 12}, raid: {maxJoins: 4, minAccountAge: 18} },
  8: { aiThreshold: 0.60, spam: {maxMsgs: 4, maxDuplicates: 2, maxMentions: 3, maxLinks: 1, cooldownPeriod: 15}, raid: {maxJoins: 4, minAccountAge: 21} },
  9: { aiThreshold: 0.57, spam: {maxMsgs: 3, maxDuplicates: 1, maxMentions: 2, maxLinks: 1, cooldownPeriod: 20}, raid: {maxJoins: 3, minAccountAge: 25} },
  10: { aiThreshold: 0.55, spam: {maxMsgs: 3, maxDuplicates: 1, maxMentions: 2, maxLinks: 0, cooldownPeriod: 20}, raid: {maxJoins: 3, minAccountAge: 30} }
};

function getAggressivenessConfig(
  level: number, 
  aiConfidenceFloor?: number | null, 
  userOverride?: UserSecurityOverride | null
): AggressivenessProfile {
  const clampedLevel = Math.max(1, Math.min(10, Math.round(level)));
  const baseProfile = aggressivenessProfiles[clampedLevel] || aggressivenessProfiles[5];
  
  // Create a copy of the profile to avoid mutating the original
  const profile: AggressivenessProfile = {
    aiThreshold: baseProfile.aiThreshold,
    spam: { ...baseProfile.spam },
    raid: { ...baseProfile.raid }
  };
  
  // Apply aiConfidenceFloor if it exists and is higher than base threshold
  // aiConfidenceFloor is the MINIMUM threshold allowed - prevents system from being TOO aggressive
  // Higher threshold = MORE PERMISSIVE (only acts if highly confident it's a threat)
  if (aiConfidenceFloor !== null && aiConfidenceFloor !== undefined) {
    // Convert from integer (stored as 0-100) to decimal (0.0-1.0) if needed
    const normalizedFloor = aiConfidenceFloor > 1 ? aiConfidenceFloor / 100 : aiConfidenceFloor;
    // Use Math.max to ensure we never go below the floor (never more aggressive than floor allows)
    const previousThreshold = profile.aiThreshold;
    profile.aiThreshold = Math.max(profile.aiThreshold, normalizedFloor);
    if (profile.aiThreshold !== previousThreshold) {
      console.log(`[Security] Applying aiConfidenceFloor: ${normalizedFloor} (was ${previousThreshold}, now ${profile.aiThreshold}) - enforcing minimum threshold`);
    }
  }
  
  // Apply user-specific overrides if they exist
  if (userOverride) {
    // Apply AI threshold override with validation
    if (userOverride.aiThresholdOverride !== null && userOverride.aiThresholdOverride !== undefined) {
      // Convert from integer (stored as 0-100) to decimal (0.0-1.0) if needed
      const normalizedOverride = userOverride.aiThresholdOverride > 1 
        ? userOverride.aiThresholdOverride / 100 
        : userOverride.aiThresholdOverride;
      
      // Validate range (0.1-1.0)
      if (normalizedOverride >= 0.1 && normalizedOverride <= 1.0) {
        console.log(`[Security] Applying user AI threshold override: ${normalizedOverride} (was ${profile.aiThreshold})`);
        profile.aiThreshold = normalizedOverride;
      } else {
        console.warn(`[Security] Invalid aiThresholdOverride ${normalizedOverride}, must be 0.1-1.0, ignoring`);
      }
    }
    
    // Apply spam overrides with validation
    if (userOverride.spamOverride && typeof userOverride.spamOverride === 'object') {
      const spamOv = userOverride.spamOverride as any;
      const appliedOverrides: string[] = [];
      
      if (spamOv.maxMsgs !== undefined) {
        const val = parseInt(spamOv.maxMsgs);
        if (!isNaN(val) && val >= 1) {
          profile.spam.maxMsgs = val;
          appliedOverrides.push(`maxMsgs=${val}`);
        } else {
          console.warn(`[Security] Invalid spamOverride.maxMsgs (${spamOv.maxMsgs}), ignoring`);
        }
      }
      
      if (spamOv.maxDuplicates !== undefined) {
        const val = parseInt(spamOv.maxDuplicates);
        if (!isNaN(val) && val >= 1) {
          profile.spam.maxDuplicates = val;
          appliedOverrides.push(`maxDuplicates=${val}`);
        } else {
          console.warn(`[Security] Invalid spamOverride.maxDuplicates (${spamOv.maxDuplicates}), ignoring`);
        }
      }
      
      if (spamOv.maxMentions !== undefined) {
        const val = parseInt(spamOv.maxMentions);
        if (!isNaN(val) && val >= 0) {
          profile.spam.maxMentions = val;
          appliedOverrides.push(`maxMentions=${val}`);
        } else {
          console.warn(`[Security] Invalid spamOverride.maxMentions (${spamOv.maxMentions}), ignoring`);
        }
      }
      
      if (spamOv.maxLinks !== undefined) {
        const val = parseInt(spamOv.maxLinks);
        if (!isNaN(val) && val >= 0) {
          profile.spam.maxLinks = val;
          appliedOverrides.push(`maxLinks=${val}`);
        } else {
          console.warn(`[Security] Invalid spamOverride.maxLinks (${spamOv.maxLinks}), ignoring`);
        }
      }
      
      // Recalculate cooldownPeriod based on maxMsgs if it changed
      profile.spam.cooldownPeriod = Math.max(5, Math.floor(60 / profile.spam.maxMsgs));
      
      if (appliedOverrides.length > 0) {
        console.log(`[Security] Applied user spam overrides: ${appliedOverrides.join(', ')}, cooldownPeriod=${profile.spam.cooldownPeriod}`);
      }
    }
    
    // Apply raid overrides with validation
    if (userOverride.raidOverride && typeof userOverride.raidOverride === 'object') {
      const raidOv = userOverride.raidOverride as any;
      const appliedOverrides: string[] = [];
      
      if (raidOv.maxJoins !== undefined) {
        const val = parseInt(raidOv.maxJoins);
        if (!isNaN(val) && val >= 1) {
          profile.raid.maxJoins = val;
          appliedOverrides.push(`maxJoins=${val}`);
        } else {
          console.warn(`[Security] Invalid raidOverride.maxJoins (${raidOv.maxJoins}), ignoring`);
        }
      }
      
      if (raidOv.minAccountAge !== undefined) {
        const val = parseInt(raidOv.minAccountAge);
        if (!isNaN(val) && val >= 0) {
          profile.raid.minAccountAge = val;
          appliedOverrides.push(`minAccountAge=${val}`);
        } else {
          console.warn(`[Security] Invalid raidOverride.minAccountAge (${raidOv.minAccountAge}), ignoring`);
        }
      }
      
      if (appliedOverrides.length > 0) {
        console.log(`[Security] Applied user raid overrides: ${appliedOverrides.join(', ')}`);
      }
    }
  }
  
  return profile;
}

export class SecurityEngine {
  private userActivity: Map<string, MessageRecord[]> = new Map();
  private joinTimes: Map<string, number[]> = new Map();
  private messageHistory: Map<string, MessageRecord[]> = new Map();
  private memberJoinDates: Map<string, number> = new Map(); // Tracks when users joined servers (key: userId:serverId)
  private cleanupInterval?: NodeJS.Timeout;
  private readonly MAX_MAP_SIZE = 10000;
  private readonly NEW_MEMBER_COOLDOWN = 30 * 1000; // 30 seconds in milliseconds
  private readonly MAX_CONTENT_LENGTH = 2000;
  private readonly MAX_USERNAME_LENGTH = 100;
  private readonly MAX_SERVER_NAME_LENGTH = 200;
  private readonly ALLOWED_IMAGE_MIMES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 5 * 60 * 1000);
  }

  private cleanupOldData(): void {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Cleanup message history
    Array.from(this.messageHistory.entries()).forEach(([userId, messages]: [string, MessageRecord[]]) => {
      const recentMessages = messages.filter(msg => now - msg.timestamp < oneHour);
      if (recentMessages.length === 0) {
        this.messageHistory.delete(userId);
      } else {
        this.messageHistory.set(userId, recentMessages);
      }
    });

    // Cleanup user activity
    Array.from(this.userActivity.entries()).forEach(([userId, activity]: [string, MessageRecord[]]) => {
      const recentActivity = activity.filter(msg => now - msg.timestamp < oneHour);
      if (recentActivity.length === 0) {
        this.userActivity.delete(userId);
      } else {
        this.userActivity.set(userId, recentActivity);
      }
    });

    // Cleanup join times
    Array.from(this.joinTimes.entries()).forEach(([serverId, times]: [string, number[]]) => {
      const recentTimes = times.filter(time => now - time < oneHour);
      if (recentTimes.length === 0) {
        this.joinTimes.delete(serverId);
      } else {
        this.joinTimes.set(serverId, recentTimes);
      }
    });

    // Cleanup member join dates (keep for 24 hours)
    const twentyFourHours = 24 * 60 * 60 * 1000;
    Array.from(this.memberJoinDates.entries()).forEach(([key, joinTime]: [string, number]) => {
      if (now - joinTime > twentyFourHours) {
        this.memberJoinDates.delete(key);
      }
    });

    // Enforce maximum Map sizes to prevent unbounded growth
    if (this.messageHistory.size > this.MAX_MAP_SIZE) {
      const entriesToDelete = this.messageHistory.size - this.MAX_MAP_SIZE;
      const keys = Array.from(this.messageHistory.keys()).slice(0, entriesToDelete);
      keys.forEach(key => this.messageHistory.delete(key));
    }

    if (this.userActivity.size > this.MAX_MAP_SIZE) {
      const entriesToDelete = this.userActivity.size - this.MAX_MAP_SIZE;
      const keys = Array.from(this.userActivity.keys()).slice(0, entriesToDelete);
      keys.forEach(key => this.userActivity.delete(key));
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.userActivity.clear();
    this.joinTimes.clear();
    this.messageHistory.clear();
    this.memberJoinDates.clear();
  }

  private raidConfig: RaidDetectionConfig = {
    maxJoinsPerMinute: 5, // 🔥 BALANCED AGGRESSION: 5 joins per minute (for large servers)
    maxJoinsPerHour: 20,  // 🔥 BALANCED AGGRESSION: 20 joins per hour maximum
    suspiciousPatterns: [
      'raid', 'nuke', 'hack', 'attack', 'troll', 'scam', 'phish', 'leak', 'dox', 
      'gore', 'porn', 'nsfw', 'cp', 'child', 'discord.gg', 'bit.ly', 'tinyurl', 
      'sellbot', 'gen', 'cracked', 'checker', 'stealer', 'grabber', 'logger', 'selfbot',
      'nuker', 'raider', 'spammer', 'ddos', 'dos', 'flood'
    ],
    minAccountAge: 14  // 💀 MAXIMUM AGGRESSION: 14 days minimum account age
  };

  private spamConfig: SpamDetectionConfig = {
    maxMessagesPerMinute: 8,  // Allow normal conversation: 8 messages per minute
    maxDuplicateMessages: 3,  // Allow some repetition: 3 duplicate messages before action
    maxMentionsPerMessage: 5, // Allow multiple mentions: 5 mentions per message
    maxLinksPerMessage: 3,    // Allow sharing links: 3 links per message
    cooldownPeriod: 10        // Short cooldown: 10 seconds between messages
  };

  private async computeEffectiveAggressionLevel(userId: string, serverId: string): Promise<number> {
    try {
      const isProtected = await storage.isUserProtected(userId, serverId);
      if (isProtected) {
        console.log(`[Security] User ${userId} is protected - using minimum aggressiveness level 1`);
        return 1;
      }

      const serverConfig = await storage.getSecurityConfig(serverId);
      const globalLevel = serverConfig?.aggressivenessLevel ?? 5;

      const userOverride = await storage.getUserSecurityOverride(userId, serverId);
      if (userOverride && userOverride.aggressionLevel !== null) {
        const level = Math.max(1, Math.min(10, userOverride.aggressionLevel));
        console.log(`[Security] User ${userId} has override level ${level}`);
        return level;
      }

      const reputation = await storage.getUserReputation(userId, serverId);
      let adjustment = 0;
      
      if (reputation) {
        if (reputation.score >= 70) {
          adjustment = -2;
          console.log(`[Security] User ${userId} is trusted (score: ${reputation.score}) - reducing aggressiveness by 2`);
        } else if (reputation.score < 40) {
          adjustment = +1;
          console.log(`[Security] User ${userId} is untrusted (score: ${reputation.score}) - increasing aggressiveness by 1`);
        }
      }

      const effectiveLevel = Math.max(1, Math.min(10, globalLevel + adjustment));
      console.log(`[Security] Computed effective aggressiveness level for user ${userId}: ${effectiveLevel} (global: ${globalLevel}, adjustment: ${adjustment})`);
      
      // NOTE: Adaptive Protection modifies security configs directly via updateSpamConfig/updateRaidConfig
      // It does not provide a delta API for temporary level adjustments, so we don't integrate it here.
      // The adaptive protection system operates independently by adjusting the base configurations.
      
      return effectiveLevel;
    } catch (error) {
      console.error('[Security] Error computing aggressiveness level, defaulting to 5:', error);
      return 5;
    }
  }

  private async applyShadowMode(
    check: SecurityCheck,
    serverId: string,
    serverName: string,
    userId: string,
    username: string,
    content: string
  ): Promise<SecurityCheck> {
    if (!shadowMode.isShadowModeActive(serverId) || check.action === 'allow') {
      return check;
    }

    console.log(`[ShadowMode] 👁️ Threat detected but suppressed by Shadow Mode: ${check.threatType} (${check.action})`);

    await fileLogger.threat('shadow-mode', `👁️ Shadow Mode: ${check.threatType} detected but not acted upon`, {
      shadowMode: true,
      serverId,
      serverName,
      userId,
      username,
      originalAction: check.action,
      threatType: check.threatType,
      reason: check.reason,
      confidence: check.confidence,
      evidence: check.evidence,
      content: content.substring(0, 200)
    });

    try {
      await this.recordThreat({
        type: check.threatType,
        severity: check.action === 'ban' || check.action === 'kick' ? 'high' : 'medium',
        description: `👁️ [SHADOW MODE] ${check.reason}`,
        serverId,
        serverName,
        userId,
        username,
        action: 'observed',
        metadata: {
          shadowMode: true,
          originalAction: check.action,
          confidence: check.confidence,
          evidence: check.evidence,
          content: content.substring(0, 200)
        }
      });
    } catch (error) {
      console.error('[ShadowMode] Failed to record threat in shadow mode:', error);
    }

    return {
      action: 'allow',
      reason: `👁️ [SHADOW MODE] Threat detected: ${check.reason} | Original action: ${check.action} (${Math.round(check.confidence * 100)}%) - OBSERVATION ONLY`,
      confidence: check.confidence,
      threatType: check.threatType,
      evidence: { ...check.evidence, shadowMode: true, originalAction: check.action }
    };
  }

  async checkMessage(
    userId: string, 
    username: string, 
    content: string, 
    serverId: string, 
    serverName: string,
    attachments?: Array<{ url: string; contentType?: string }>
  ): Promise<SecurityCheck> {
    if (!userId || typeof userId !== 'string' || userId.length === 0) {
      throw new Error('Invalid userId provided');
    }
    if (!serverId || typeof serverId !== 'string' || serverId.length === 0) {
      throw new Error('Invalid serverId provided');
    }

    content = content.substring(0, this.MAX_CONTENT_LENGTH);
    username = username.substring(0, this.MAX_USERNAME_LENGTH);
    serverName = serverName.substring(0, this.MAX_SERVER_NAME_LENGTH);

    const effectiveLevel = await this.computeEffectiveAggressionLevel(userId, serverId);
    const serverConfig = await storage.getSecurityConfig(serverId);
    const userOverride = await storage.getUserSecurityOverride(userId, serverId);
    const profile = getAggressivenessConfig(effectiveLevel, serverConfig?.aiConfidenceFloor, userOverride);
    console.log(`[Security] checkMessage - effectiveLevel: ${effectiveLevel}, aiThreshold: ${profile.aiThreshold}`);

    if (this.userActivity.size >= this.MAX_MAP_SIZE) {
      console.warn('[Security] User activity map at capacity, cleaning up old entries');
      this.cleanupOldData();
    }
    
    if (!this.userActivity.has(userId)) {
      this.userActivity.set(userId, []);
    }
    if (!this.messageHistory.has(userId)) {
      this.messageHistory.set(userId, []);
    }

    const userMessages = this.messageHistory.get(userId)!;
    const now = Date.now();

    // Add current message to history
    userMessages.push({ content, timestamp: now, serverId });
    
    // Clean old messages (keep last hour)
    const oneHour = 60 * 60 * 1000;
    this.messageHistory.set(userId, userMessages.filter(msg => now - msg.timestamp < oneHour));

    // Check for forbidden words (vulgar and attack-related keywords) with warning system
    const wordFilterCheck = this.checkForbiddenWords(content, userId, serverId);
    if (wordFilterCheck.action !== 'allow') {
      const shadowModeResult = await this.applyShadowMode(wordFilterCheck, serverId, serverName, userId, username, content);
      
      if (shadowModeResult.action === 'allow' && shadowModeResult.evidence?.shadowMode) {
        return shadowModeResult;
      }
      
      try {
        await this.recordThreat({
          type: wordFilterCheck.threatType,
          severity: wordFilterCheck.threatType === 'attack_keywords' ? 'high' : 'medium',
          description: wordFilterCheck.reason,
          serverId,
          serverName,
          userId,
          username,
          action: wordFilterCheck.action,
          metadata: { content, detectedWords: wordFilterCheck.evidence?.detectedWords }
        });
        
        // Record in audit log
        if (wordFilterCheck.action === 'delete') {
          try {
            // Generate a pseudo message ID for tracking
            const pseudoMessageId = `filtered-${userId}-${Date.now()}`;
            const pseudoChannelId = `system-filter-${serverId}`;
            
            await storage.createMessageDeletion({
              messageId: pseudoMessageId,
              userId,
              username,
              serverId,
              serverName,
              channelId: pseudoChannelId,
              channelName: 'system-filter',
              reason: wordFilterCheck.reason,
              threatType: wordFilterCheck.threatType,
              confidence: wordFilterCheck.confidence,
              content: content.substring(0, 100),
              metadata: { 
                detectedWords: wordFilterCheck.evidence?.detectedWords,
                filterType: 'word_filter'
              }
            });

            // Also log as command for audit trail
            await storage.createCommandLog({
              commandName: 'word_filter_action',
              executedBy: 'bot',
              userId,
              username,
              serverId,
              serverName,
              parameters: { action: 'delete', reason: wordFilterCheck.reason },
              result: `Message deleted: ${wordFilterCheck.reason}`,
              success: true,
              duration: 0,
              metadata: { 
                threatType: wordFilterCheck.threatType,
                detectedWords: wordFilterCheck.evidence?.detectedWords
              }
            });
          } catch (auditError) {
            console.warn('Failed to record audit entry for word filter:', auditError);
          }
        }
        
        let reputationPenalty = 0;
        switch (wordFilterCheck.action) {
          case 'warn': reputationPenalty = -5; break;
          case 'delete': reputationPenalty = -10; break;
          case 'mute': reputationPenalty = -15; break;
          case 'kick': reputationPenalty = -25; break;
          case 'ban': reputationPenalty = -40; break;
          default: reputationPenalty = -20; break;
        }
        await storage.updateUserReputationScore(userId, serverId, reputationPenalty, true);
      } catch (error) {
        console.error('Failed to record threat:', error);
      }
      return wordFilterCheck;
    }

    // Check for spam using dynamic profile
    const spamCheck = await this.checkSpam(userId, content, userMessages, profile);
    if (spamCheck.action !== 'allow') {
      const shadowModeResult = await this.applyShadowMode(spamCheck, serverId, serverName, userId, username, content);
      
      if (shadowModeResult.action === 'allow' && shadowModeResult.evidence?.shadowMode) {
        return shadowModeResult;
      }
      
      try {
        await this.recordThreat({
          type: 'spam',
          severity: spamCheck.action === 'ban' ? 'high' : 'medium',
          description: spamCheck.reason,
          serverId,
          serverName,
          userId,
          username,
          action: spamCheck.action,
          metadata: { content, evidence: spamCheck.evidence }
        });
        
        let reputationPenalty = 0;
        switch (spamCheck.action) {
          case 'warn': reputationPenalty = -5; break;
          case 'delete': reputationPenalty = -10; break;
          case 'mute': reputationPenalty = -15; break;
          case 'kick': reputationPenalty = -25; break;
          case 'ban': reputationPenalty = -40; break;
          default: reputationPenalty = -20; break;
        }
        await storage.updateUserReputationScore(userId, serverId, reputationPenalty, true);
      } catch (error) {
        console.error('Failed to record threat:', error);
      }
      return spamCheck;
    }

    // Check for bypass attempts
    const bypassCheck = await this.checkBypass(content);
    if (bypassCheck.action !== 'allow') {
      const shadowModeResult = await this.applyShadowMode(bypassCheck, serverId, serverName, userId, username, content);
      
      if (shadowModeResult.action === 'allow' && shadowModeResult.evidence?.shadowMode) {
        return shadowModeResult;
      }
      
      try {
        await this.recordThreat({
          type: 'bypass',
          severity: 'high',
          description: bypassCheck.reason,
          serverId,
          serverName,
          userId,
          username,
          action: bypassCheck.action,
          metadata: { content, technique: bypassCheck.evidence?.technique }
        });
      } catch (error) {
        console.error('Failed to record threat:', error);
      }
      return bypassCheck;
    }

    if (attachments && attachments.length > 0) {
      if (attachments.length > 10) {
        const tooManyAttachmentsCheck = {
          action: 'ban' as const,
          reason: '🚨 SUSPICIOUS: Too many attachments (>10) - IMMEDIATE BAN',
          confidence: 0.95,
          threatType: 'spam',
          evidence: { attachmentCount: attachments.length }
        };
        return await this.applyShadowMode(tooManyAttachmentsCheck, serverId, serverName, userId, username, content);
      }

      for (const attachment of attachments) {
        if (!attachment.url || typeof attachment.url !== 'string') {
          console.warn('[Security] Invalid attachment URL detected');
          continue;
        }

        if (attachment.url.length > 2000) {
          const suspiciousUrlCheck = {
            action: 'ban' as const,
            reason: '🚨 MALICIOUS: Suspicious attachment URL length - IMMEDIATE BAN',
            confidence: 0.9,
            threatType: 'malicious',
            evidence: { urlLength: attachment.url.length }
          };
          return await this.applyShadowMode(suspiciousUrlCheck, serverId, serverName, userId, username, content);
        }

        if (attachment.contentType?.startsWith('image/')) {
          if (!this.ALLOWED_IMAGE_MIMES.includes(attachment.contentType.toLowerCase())) {
            return {
              action: 'allow',
              reason: `✅ Image format allowed (${attachment.contentType}) - permissive mode`,
              confidence: 1.0,
              threatType: 'none',
              evidence: { contentType: attachment.contentType }
            };
          }

          const nsfwCheck = await this.checkNSFWImage(attachment.url);
          if (nsfwCheck.action !== 'allow') {
            const shadowModeResult = await this.applyShadowMode(nsfwCheck, serverId, serverName, userId, username, content);
            
            if (shadowModeResult.action === 'allow' && shadowModeResult.evidence?.shadowMode) {
              return shadowModeResult;
            }
            
            try {
              await this.recordThreat({
                type: 'nsfw',
                severity: 'high',
                description: nsfwCheck.reason,
                serverId,
                serverName,
                userId,
                username,
                action: nsfwCheck.action,
                metadata: { imageUrl: attachment.url, analysis: nsfwCheck.evidence }
              });
            } catch (error) {
              console.error('[Security] Failed to record threat:', error);
            }
            return nsfwCheck;
          }
        }
      }
    }

    // Use Distributed AI for advanced threat analysis - Dynamic threshold based on aggressiveness level
    try {
      const threatAnalysis = await claudeService.execute('analyzeThreatLevel', content, userMessages);
      if (threatAnalysis.confidence > 0.4) {
        let action: 'allow' | 'warn' | 'mute' | 'kick' | 'ban' = 'allow';
        
        // Dynamic threshold based on aggressiveness profile
        // If confidence < profile.aiThreshold, ALWAYS allow the message regardless of threat level
        if (threatAnalysis.confidence < profile.aiThreshold) {
          action = 'allow';
        }
        // Only if confidence >= profile.aiThreshold, take action based on threat level
        else if (threatAnalysis.threatLevel === 'critical') {
          action = 'ban';
        }
        else if (threatAnalysis.threatLevel === 'high') {
          action = 'kick';
        }
        else if (threatAnalysis.threatLevel === 'medium') {
          action = 'mute';
        }
        else if (threatAnalysis.threatLevel === 'low') {
          action = 'warn';
        }
        
        try {
          await this.recordThreat({
            type: threatAnalysis.threatType,
            severity: threatAnalysis.threatLevel,
            description: action === 'allow' 
              ? `✅ LOW CONFIDENCE: ${threatAnalysis.reasoning} (confidence: ${threatAnalysis.confidence.toFixed(2)}, threshold: ${profile.aiThreshold}, level: ${effectiveLevel})`
              : `🚨 AI THREAT DETECTED (Level ${effectiveLevel}): ${threatAnalysis.reasoning}`,
            serverId,
            serverName,
            userId,
            username,
            action,
            metadata: { content, aiAnalysis: threatAnalysis, effectiveLevel, aiThreshold: profile.aiThreshold, aiEngine: 'Distributed' }
          });
          
          // Only apply reputation penalty if action is NOT 'allow'
          if (action !== 'allow') {
            let reputationPenalty = 0;
            switch (action) {
              case 'warn': reputationPenalty = -5; break;
              case 'mute': reputationPenalty = -15; break;
              case 'kick': reputationPenalty = -25; break;
              case 'ban': reputationPenalty = -40; break;
              default: reputationPenalty = -20; break;
            }
            await storage.updateUserReputationScore(userId, serverId, reputationPenalty, true);
          }
        } catch (error) {
          console.error('Failed to record threat:', error);
        }
        const aiCheck = {
          action,
          reason: action === 'allow' 
            ? `✅ Content allowed - insufficient confidence (${(threatAnalysis.confidence * 100).toFixed(0)}% < ${(profile.aiThreshold * 100).toFixed(0)}% required, level ${effectiveLevel})` 
            : `🚨 ${threatAnalysis.reasoning} - AUTOMATIC ACTION TAKEN (Level ${effectiveLevel})`,
          confidence: threatAnalysis.confidence,
          threatType: threatAnalysis.threatType,
          evidence: threatAnalysis
        };
        return await this.applyShadowMode(aiCheck, serverId, serverName, userId, username, content);
      }
    } catch (error) {
      console.error('[Security] AI threat analysis failed - continuing with heuristic checks:', error);
      // Don't return an error action - just log it and continue
      // This prevents "BYPASS ANALYSIS ERROR" from showing up in status reports
    }

    return { action: 'allow', reason: 'Clean content', confidence: 1, threatType: 'none' };
  }

  async checkUserJoin(
    userId: string,
    username: string,
    serverId: string,
    serverName: string,
    accountCreated: Date
  ): Promise<SecurityCheck> {
    if (!userId || typeof userId !== 'string' || userId.length === 0) {
      throw new Error('Invalid userId provided');
    }
    if (!serverId || typeof serverId !== 'string' || serverId.length === 0) {
      throw new Error('Invalid serverId provided');
    }
    if (!(accountCreated instanceof Date) || isNaN(accountCreated.getTime())) {
      throw new Error('Invalid accountCreated date provided');
    }

    username = username.substring(0, this.MAX_USERNAME_LENGTH);
    serverName = serverName.substring(0, this.MAX_SERVER_NAME_LENGTH);

    const effectiveLevel = await this.computeEffectiveAggressionLevel(userId, serverId);
    const serverConfig = await storage.getSecurityConfig(serverId);
    const userOverride = await storage.getUserSecurityOverride(userId, serverId);
    const profile = getAggressivenessConfig(effectiveLevel, serverConfig?.aiConfidenceFloor, userOverride);
    console.log(`[Security] checkUserJoin - effectiveLevel: ${effectiveLevel}, minAccountAge: ${profile.raid.minAccountAge}, maxJoins: ${profile.raid.maxJoins}`);

    const now = Date.now();
    
    // 🔒 Register member join time for 2-minute cooldown
    const memberKey = `${userId}:${serverId}`;
    this.memberJoinDates.set(memberKey, now);
    
    if (this.joinTimes.size >= this.MAX_MAP_SIZE) {
      console.warn('[Security] Join times map at capacity, cleaning up old entries');
      this.cleanupOldData();
    }
    
    if (!this.joinTimes.has(serverId)) {
      this.joinTimes.set(serverId, []);
    }

    const serverJoins = this.joinTimes.get(serverId)!;
    serverJoins.push(now);

    // Clean old join times (keep last hour)
    const oneHour = 60 * 60 * 1000;
    const oneMinute = 60 * 1000;
    const recentJoins = serverJoins.filter(time => now - time < oneHour);
    const joinsLastMinute = recentJoins.filter(time => now - time < oneMinute);

    this.joinTimes.set(serverId, recentJoins);

    // Check account age - Dynamic thresholds based on aggressiveness profile
    const accountAge = (now - accountCreated.getTime()) / (1000 * 60 * 60 * 24); // days
    const isRaidSpike = joinsLastMinute.length > profile.raid.maxJoins || 
                        recentJoins.length > this.raidConfig.maxJoinsPerHour;
    
    if (accountAge < profile.raid.minAccountAge && isRaidSpike) {
      let action: 'kick' | 'ban';
      let confidence: number;
      let description: string;
      let severity: 'high' | 'critical';
      
      // Dynamic action based on account age and raid spike
      if (accountAge < 7) {
        action = 'ban';
        confidence = 0.99;
        severity = 'critical';
        description = `🚨 NEW ACCOUNT THREAT (Level ${effectiveLevel}): ${accountAge.toFixed(1)} days old with ${joinsLastMinute.length} joins/min (RAID SPIKE, min age: ${profile.raid.minAccountAge})`;
      } else {
        action = 'kick';
        confidence = 0.95;
        severity = 'high';
        description = `⚠️ NEW ACCOUNT + RAID SPIKE (Level ${effectiveLevel}): ${accountAge.toFixed(1)} days old with ${joinsLastMinute.length} joins/min (min age: ${profile.raid.minAccountAge})`;
      }
      
      try {
        await this.recordThreat({
          type: 'raid',
          severity,
          description,
          serverId,
          serverName,
          userId,
          username,
          action,
          metadata: { accountAge, joinTime: now, isRaidSpike, minRequired: profile.raid.minAccountAge, effectiveLevel }
        });
        
        const reputationPenalty = action === 'ban' ? -50 : -30;
        await storage.updateUserReputationScore(userId, serverId, reputationPenalty, true);
      } catch (error) {
        console.error('Failed to record threat:', error);
      }
      return {
        action,
        reason: action === 'ban'
          ? `🚨 NEW ACCOUNT THREAT (${accountAge.toFixed(1)} days, level ${effectiveLevel}) + RAID SPIKE - BAN FOR PROTECTION`
          : `⚠️ NEW ACCOUNT (${accountAge.toFixed(1)} days, level ${effectiveLevel}) + RAID SPIKE - KICKED`,
        confidence,
        threatType: 'raid',
        evidence: { accountAge, isRaidSpike, effectiveLevel }
      };
    }

    // Check for mass joins (raid detection) - Dynamic threshold
    if (joinsLastMinute.length > profile.raid.maxJoins) {
      try {
        await this.recordThreat({
          type: 'raid',
          severity: 'critical',
          description: `🚨 MASSIVE RAID (Level ${effectiveLevel}): ${joinsLastMinute.length} users in 1 minute (limit: ${profile.raid.maxJoins})`,
          serverId,
          serverName,
          userId,
          username,
          action: 'ban',
          metadata: { joinsPerMinute: joinsLastMinute.length, totalJoins: recentJoins.length, limit: profile.raid.maxJoins, effectiveLevel }
        });
      } catch (error) {
        console.error('Failed to record threat:', error);
      }
      return {
        action: 'ban',
        reason: `🔴 RAID DETECTED (Level ${effectiveLevel}): ${joinsLastMinute.length} joins in 1 minute (limit: ${profile.raid.maxJoins}) - PERMANENT BAN AUTOMATIC`,
        confidence: 0.99,
        threatType: 'raid',
        evidence: { joinsPerMinute: joinsLastMinute.length, effectiveLevel }
      };
    }

    if (recentJoins.length > this.raidConfig.maxJoinsPerHour) {
      try {
        await this.recordThreat({
          type: 'raid',
          severity: 'critical',
          description: `⚠️ SUSPICIOUS RAID (Level ${effectiveLevel}): ${recentJoins.length} users in 1 hour`,
          serverId,
          serverName,
          userId,
          username,
          action: 'ban',
          metadata: { joinsPerHour: recentJoins.length, effectiveLevel }
        });
      } catch (error) {
        console.error('Failed to record threat:', error);
      }
      return {
        action: 'ban',
        reason: `🚫 RAID PATTERN (Level ${effectiveLevel}): ${recentJoins.length} joins in 1 hour - PREVENTIVE BAN`,
        confidence: 0.95,
        threatType: 'raid',
        evidence: { joinsPerHour: recentJoins.length, effectiveLevel }
      };
    }

    // Check username for suspicious patterns - MAXIMUM PERMISSIVE MODE
    // ONLY ban/warn if username contains 2+ CRITICAL patterns (to eliminate false positives)
    const lowercaseUsername = username.toLowerCase();
    const criticalPatterns = ['cp', 'gore', 'nuke', 'raid', 'leak', 'dox'];
    
    const matchedCritical: string[] = [];
    
    for (const pattern of criticalPatterns) {
      if (lowercaseUsername.includes(pattern)) {
        matchedCritical.push(pattern);
      }
    }
    
    // ONLY act if 2+ critical patterns detected (e.g., "nukeraid", "leakdox")
    // Users like "BotFan", "GameHelper", "AdminSupport" will be ALLOWED
    if (matchedCritical.length >= 2) {
      try {
        await this.recordThreat({
          type: 'raid',
          severity: 'critical',
          description: `🚨 HIGHLY SUSPICIOUS USERNAME: contains multiple critical patterns: ${matchedCritical.join(', ')}`,
          serverId,
          serverName,
          userId,
          username,
          action: 'ban',
          metadata: { suspiciousPatterns: matchedCritical, patternCount: matchedCritical.length }
        });
      } catch (error) {
        console.error('Failed to record threat:', error);
      }
      return {
        action: 'ban',
        reason: `🔴 SUSPICIOUS USERNAME: Multiple critical patterns detected (${matchedCritical.join(', ')}) - BAN`,
        confidence: 0.98,
        threatType: 'raid',
        evidence: { patterns: matchedCritical }
      };
    }

    return { action: 'allow', reason: 'Clean join', confidence: 1, threatType: 'none' };
  }

  private checkMassMentions(content: string): { isMassMention: boolean; isAbusive: boolean; mentionCount: number } {
    const hasEveryone = /@everyone/gi.test(content);
    const hasHere = /@here/gi.test(content);
    const regularMentions = (content.match(/<@!?\d+>/g) || []).length;
    const roleMentions = (content.match(/<@&\d+>/g) || []).length;
    
    const isMassMention = hasEveryone || hasHere;
    const isAbusive = (hasEveryone || hasHere) && (regularMentions > 3 || roleMentions > 2);
    
    return {
      isMassMention,
      isAbusive,
      mentionCount: regularMentions + roleMentions + (hasEveryone ? 1 : 0) + (hasHere ? 1 : 0)
    };
  }

  private async checkSpam(userId: string, content: string, messageHistory: MessageRecord[], profile: AggressivenessProfile): Promise<SecurityCheck> {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    
    // BALANCED: Detect repeated characters (5+ consecutive) - warn only
    const repeatedCharsMatch = content.match(/(.)\1{4,}/g);
    if (repeatedCharsMatch) {
      return {
        action: 'warn',
        reason: `⚠️ REPEATED CHARACTER DETECTED: "${repeatedCharsMatch[0]}" - Please avoid excessive repetition`,
        confidence: 0.95,
        threatType: 'spam',
        evidence: { repeatedPattern: repeatedCharsMatch[0], fullMatches: repeatedCharsMatch }
      };
    }

    // BALANCED: Detect excessive uppercase (>50% of message) - warn only
    const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
    const letterCount = (content.match(/[A-Za-z]/g) || []).length;
    if (letterCount > 0 && (uppercaseCount / letterCount) > 0.5) {
      return {
        action: 'warn',
        reason: `⚠️ EXCESSIVE UPPERCASE: ${Math.round((uppercaseCount / letterCount) * 100)}% uppercase - Please use normal case`,
        confidence: 0.95,
        threatType: 'spam',
        evidence: { uppercasePercentage: (uppercaseCount / letterCount) * 100, uppercaseCount, letterCount }
      };
    }
    
    // Check message rate - Dynamic thresholds based on aggressiveness profile
    const recentMessages = messageHistory.filter(msg => now - msg.timestamp < oneMinute);
    if (recentMessages.length > profile.spam.maxMsgs) {
      return {
        action: 'mute',
        reason: `⚠️ MESSAGE SPAM: ${recentMessages.length} messages in 1 minute (limit: ${profile.spam.maxMsgs}) - TEMPORARY MUTE`,
        confidence: 0.98,
        threatType: 'spam',
        evidence: { messagesPerMinute: recentMessages.length, limit: profile.spam.maxMsgs }
      };
    }

    // Check for duplicate messages - Dynamic thresholds based on aggressiveness profile
    const duplicates = messageHistory.filter(msg => msg.content === content).length;
    const maxDuplicates = profile.spam.maxDuplicates;
    
    if (duplicates === 2 && maxDuplicates >= 2) {
      return {
        action: 'warn',
        reason: `⚠️ DUPLICATE MESSAGE: First warning - avoid repeating messages`,
        confidence: 0.92,
        threatType: 'spam',
        evidence: { duplicateCount: duplicates, limit: maxDuplicates }
      };
    }
    if (duplicates === 3 && maxDuplicates >= 3) {
      return {
        action: 'mute',
        reason: `🔇 DUPLICATE MESSAGE: Second offense - TEMPORARY MUTE`,
        confidence: 0.95,
        threatType: 'spam',
        evidence: { duplicateCount: duplicates, limit: maxDuplicates }
      };
    }
    if (duplicates > maxDuplicates) {
      return {
        action: 'kick',
        reason: `⛔ DUPLICATE MESSAGE: ${duplicates} times (limit: ${maxDuplicates}) - KICKED`,
        confidence: 0.98,
        threatType: 'spam',
        evidence: { duplicateCount: duplicates, limit: maxDuplicates }
      };
    }

    // Check mentions with mass mention handling
    const massMentionCheck = this.checkMassMentions(content);
    
    if (massMentionCheck.isMassMention && !massMentionCheck.isAbusive) {
      return {
        action: 'allow',
        reason: 'Mass mention (@everyone/@here) allowed - not abusive',
        confidence: 1,
        threatType: 'none',
        evidence: {
          isMassMention: true,
          isAbusive: false,
          massMentionType: content.match(/@everyone/gi) ? '@everyone' : '@here',
          regularMentions: (content.match(/<@!?\d+>/g) || []).length,
          roleMentions: (content.match(/<@&\d+>/g) || []).length,
          totalMentions: massMentionCheck.mentionCount
        }
      };
    }
    
    if (massMentionCheck.isAbusive) {
      return {
        action: 'ban',
        reason: `⚠️ ABUSIVE MASS MENTION: @everyone/@here + ${massMentionCheck.mentionCount - 1} additional mentions - PERMANENT BAN`,
        confidence: 0.95,
        threatType: 'spam',
        evidence: {
          isMassMention: true,
          isAbusive: true,
          totalMentions: massMentionCheck.mentionCount
        }
      };
    }
    
    const mentions = (content.match(/@/g) || []).length;
    if (mentions > profile.spam.maxMentions) {
      return {
        action: 'delete',
        reason: `⚠️ MENTION SPAM: ${mentions} mentions (limit: ${profile.spam.maxMentions}) - MESSAGE DELETED + WARNING`,
        confidence: 0.95,
        threatType: 'spam',
        evidence: { mentionCount: mentions, limit: profile.spam.maxMentions }
      };
    }

    // Check links - Dynamic thresholds based on aggressiveness profile
    const links = (content.match(/https?:\/\/[^\s]+/g) || []).length;
    if (links > profile.spam.maxLinks) {
      return {
        action: 'delete',
        reason: `🔗 LINK SPAM: ${links} links (limit: ${profile.spam.maxLinks}) - MESSAGE DELETED + WARNING`,
        confidence: 0.95,
        threatType: 'spam',
        evidence: { linkCount: links, limit: profile.spam.maxLinks }
      };
    }

    return { action: 'allow', reason: 'Not spam', confidence: 1, threatType: 'none' };
  }

  private async checkBypass(content: string): Promise<SecurityCheck> {
    try {
      const existingPatterns = (await storage.getBypassPatterns()).map(p => p.pattern);
      const analysis = await claudeService.execute('analyzeTextForBypass', content, existingPatterns);
      
      // ULTRA-CONSERVATIVE MODE: Only act on very high confidence (>= 0.9)
      if (analysis.isBypass && analysis.confidence >= 0.9) {
        // Create new bypass pattern if not exists
        if (analysis.pattern && !existingPatterns.includes(analysis.pattern)) {
          await storage.createBypassPattern({
            name: analysis.technique,
            pattern: analysis.pattern,
            severity: 'high',
            description: `🚨 CLAUDE AI BYPASS DETECTED: ${analysis.technique}`,
            countermeasure: analysis.countermeasure
          });
        }

        return {
          action: 'ban',
          reason: `🚨 BYPASS ATTEMPT DETECTED: ${analysis.technique} - HIGH CONFIDENCE BAN`,
          confidence: analysis.confidence,
          threatType: 'bypass',
          evidence: analysis
        };
      }

      return { action: 'allow', reason: 'No bypass detected', confidence: 1, threatType: 'none' };
    } catch (error) {
      console.error('AI bypass analysis failed:', error);
      return {
        action: 'allow',
        reason: '✅ Bypass analysis unavailable - content allowed',
        confidence: 1,
        threatType: 'none'
      };
    }
  }

  private async checkNSFWImage(imageUrl: string): Promise<SecurityCheck> {
    try {
      const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(imageUrl, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0)'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_IMAGE_SIZE) {
        return {
          action: 'delete',
          reason: '⚠️ Image too large (>10MB)',
          confidence: 0.95,
          threatType: 'oversized_content',
          evidence: { size: contentLength }
        };
      }

      const buffer = await response.arrayBuffer();
      
      if (buffer.byteLength > MAX_IMAGE_SIZE) {
        return {
          action: 'delete',
          reason: '⚠️ Image too large (>10MB)',
          confidence: 0.95,
          threatType: 'oversized_content',
          evidence: { size: buffer.byteLength }
        };
      }

      const base64 = Buffer.from(buffer).toString('base64');
      
      const analysis = await claudeService.execute('analyzeImageContent', base64);
      
      // ULTRA-CONSERVATIVE MODE: Only act on very high confidence (>= 0.9)
      if (analysis.isNSFW && analysis.confidence >= 0.9) {
        return {
          action: 'ban',
          reason: `🔞 NSFW CONTENT DETECTED: ${analysis.categories.join(', ')} - HIGH CONFIDENCE BAN`,
          confidence: analysis.confidence,
          threatType: 'nsfw',
          evidence: analysis
        };
      }
      
      return { action: 'allow', reason: 'Clean image', confidence: 1, threatType: 'none' };
    } catch (error) {
      console.error('AI NSFW check failed:', error);
      return { action: 'allow', reason: '✅ Image analysis unavailable - content allowed', confidence: 1, threatType: 'none' };
    }
  }

  private async recordThreat(threat: InsertThreat): Promise<void> {
    await storage.createThreat(threat);
    
    await fileLogger.threat('detection', threat.description, {
      type: threat.type,
      severity: threat.severity,
      serverId: threat.serverId,
      serverName: threat.serverName,
      userId: threat.userId,
      username: threat.username,
      action: threat.action,
      metadata: threat.metadata
    });
  }

  private mapThreatLevelToAction(level: string): SecurityCheck['action'] {
    switch (level) {
      case 'critical': return 'ban';
      case 'high': return 'kick';
      case 'medium': return 'mute';
      case 'low': return 'warn';
      default: return 'warn';
    }
  }

  async generateNewCountermeasures(): Promise<void> {
    const patterns = await storage.getBypassPatterns();
    const recentPatterns = patterns.filter(p => 
      Date.now() - p.lastSeen.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    for (const pattern of recentPatterns) {
      if (!pattern.countermeasure) {
        try {
          const existingCountermeasures = patterns
            .filter(p => p.countermeasure)
            .map(p => p.countermeasure!);
          
          const newCountermeasure = await claudeService.execute(
            'generateCountermeasure',
            pattern.name,
            existingCountermeasures
          );

          await storage.updateBypassPattern(pattern.id, {
            countermeasure: newCountermeasure
          });
        } catch (error) {
          console.error(`Failed to generate countermeasure for pattern ${pattern.id}:`, error);
        }
      }
    }
  }

  async emergencyLockdown(serverId: string): Promise<void> {
    // This would implement emergency lockdown procedures
    // For now, just record the incident
    await storage.createIncident({
      type: 'security',
      severity: 'critical',
      title: 'Emergency Lockdown Activated',
      description: 'Manual emergency lockdown triggered from dashboard',
      serverId,
      serverName: 'Unknown',
      affectedUsers: [],
      actionsPerformed: ['lockdown_activated'],
      evidence: { timestamp: new Date(), trigger: 'manual' }
    });
  }

  getSpamConfig(): SpamDetectionConfig {
    return { ...this.spamConfig };
  }

  updateSpamConfig(updates: Partial<SpamDetectionConfig>): void {
    this.spamConfig = { ...this.spamConfig, ...updates };
    console.log('[SecurityEngine] Spam config updated:', updates);
  }

  getRaidConfig(): RaidDetectionConfig {
    return { ...this.raidConfig };
  }

  updateRaidConfig(updates: Partial<RaidDetectionConfig>): void {
    this.raidConfig = { ...this.raidConfig, ...updates };
    console.log('[SecurityEngine] Raid config updated:', updates);
  }

  private checkForbiddenWords(content: string, userId?: string, serverId?: string): SecurityCheck {
    const lowerContent = content.toLowerCase();
    
    // Check for attack keywords (high severity - immediate kick)
    for (const keyword of ATTACK_KEYWORDS) {
      if (matchesWithBoundary(lowerContent, keyword.toLowerCase())) {
        return {
          action: 'kick',
          reason: `🚨 ATTACK COORDINATION DETECTED: "${keyword}" - attempting to organize raid/nuke/spam`,
          confidence: 0.95,
          threatType: 'attack_keywords',
          evidence: { detectedWords: [keyword], category: 'attack_keywords' }
        };
      }
    }
    
    // Check for vulgar words and drugs (warning system)
    for (const word of VULGAR_WORDS) {
      if (matchesWithBoundary(lowerContent, word.toLowerCase())) {
        // Get or create user warning record
        const warningKey = userId && serverId ? `${serverId}-${userId}` : null;
        let warningCount = 0;
        let shouldMute = false;
        
        if (warningKey) {
          const now = Date.now();
          let userWarning = userWarnings.get(warningKey);
          
          // Check if user is currently muted
          if (userWarning?.mutedUntil && userWarning.mutedUntil > now) {
            const remainingTime = Math.ceil((userWarning.mutedUntil - now) / 60000);
            return {
              action: 'mute',
              reason: `🔇 STILL MUTED: User is muted for ${remainingTime} more minutes due to repeated violations`,
              confidence: 1.0,
              threatType: 'profanity',
              evidence: { detectedWords: [word], category: 'profanity', warningCount: userWarning.count, mutedUntil: userWarning.mutedUntil }
            };
          }
          
          // Reset warnings if they've decayed
          if (userWarning && (now - userWarning.lastWarning) > WARNING_DECAY_MS) {
            userWarning = { count: 0, lastWarning: now };
          }
          
          // Increment warning count
          if (!userWarning) {
            userWarning = { count: 1, lastWarning: now };
          } else {
            userWarning.count++;
            userWarning.lastWarning = now;
          }
          
          warningCount = userWarning.count;
          
          // Check if should mute (3 warnings)
          if (warningCount >= 3) {
            shouldMute = true;
            userWarning.mutedUntil = now + MUTE_DURATION_MS;
            userWarning.count = 0; // Reset after mute
          }
          
          userWarnings.set(warningKey, userWarning);
        }
        
        if (shouldMute) {
          return {
            action: 'mute',
            reason: `🔇 3 WARNINGS REACHED: "${word}" detected - User muted for 10 minutes`,
            confidence: 0.95,
            threatType: 'profanity',
            evidence: { detectedWords: [word], category: 'profanity', warningCount: 3, muteDuration: '10 minutes' }
          };
        }
        
        // Return warning with delete action
        return {
          action: 'delete',
          reason: `⚠️ WARNING ${warningCount}/3: "${word}" detected - Inappropriate content deleted. ${3 - warningCount} warning(s) remaining before mute.`,
          confidence: 0.90,
          threatType: 'profanity',
          evidence: { detectedWords: [word], category: 'profanity', warningCount, warningsRemaining: 3 - warningCount }
        };
      }
    }
    
    return {
      action: 'allow',
      reason: 'Message contains no forbidden words',
      confidence: 1.0,
      threatType: 'none'
    };
  }
  
  // Method to get user warnings count
  getUserWarnings(userId: string, serverId: string): UserWarning | undefined {
    return userWarnings.get(`${serverId}-${userId}`);
  }
  
  // Method to reset user warnings
  resetUserWarnings(userId: string, serverId: string): void {
    userWarnings.delete(`${serverId}-${userId}`);
  }
}

const primarySecurityEngine = new SecurityEngine();
const backupSecurityEngine1 = new SecurityEngine();
const backupSecurityEngine2 = new SecurityEngine();

const resilientSecurityEngine = new ResilientModule({
  primary: primarySecurityEngine,
  backups: [backupSecurityEngine1, backupSecurityEngine2],
  errorThreshold: 3,
  timeout: 8000,
  resetTimeout: 30000,
  halfOpenMaxAttempts: 2,
  rollingWindowSize: 50,
  errorBudget: 0.15
});

resilientSecurityEngine.onFailover((from, to, reason) => {
  console.error(`[SecurityEngine] FAILOVER: ${from} -> backup[${to}] (Reason: ${reason})`);
  storage.createIncident({
    type: 'system',
    severity: 'high',
    title: 'SecurityEngine Failover',
    description: `SecurityEngine failed over from ${from} to backup ${to}`,
    serverId: 'system',
    serverName: 'System',
    affectedUsers: [],
    actionsPerformed: ['failover'],
    evidence: { from, to, reason, timestamp: new Date() }
  }).catch(err => console.error('Failed to log failover incident:', err));
});

resilientSecurityEngine.onRestore((instance) => {
  console.log(`[SecurityEngine] RESTORED to ${instance} instance`);
  storage.createIncident({
    type: 'system',
    severity: 'low',
    title: 'SecurityEngine Restored',
    description: `SecurityEngine successfully restored to ${instance} instance`,
    serverId: 'system',
    serverName: 'System',
    affectedUsers: [],
    actionsPerformed: ['restore'],
    evidence: { instance, timestamp: new Date() }
  }).catch(err => console.error('Failed to log restore incident:', err));
});

export const securityEngine = resilientSecurityEngine;

const adaptiveProtection = initializeAdaptiveProtection(primarySecurityEngine);
console.log('[SecurityEngine] 🧠 Adaptive Protection initialized and integrated');

export { adaptiveProtection, getAdaptiveProtection };

export async function checkSecurityEngineHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const testCheck = await resilientSecurityEngine.execute(
      'checkMessage',
      'test_user_id',
      'test_user',
      'test message',
      'test_server_id',
      'test_server'
    );
    
    const latency = Date.now() - startTime;
    
    if (testCheck && testCheck.action) {
      return {
        healthy: true,
        latency,
        message: 'SecurityEngine is operational',
        metadata: { testPassed: true, action: testCheck.action }
      };
    }
    
    return {
      healthy: false,
      latency,
      message: 'SecurityEngine returned invalid response'
    };
  } catch (error: any) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      message: `SecurityEngine health check failed: ${error?.message || 'Unknown error'}`
    };
  }
}
