import { storage } from '../storage';
import { aiService as claudeAI } from './claude-ai';
import * as crypto from 'crypto';
import { fileLogger } from './file-logger';

interface FirewallRule {
  id: string;
  type: 'ip_block' | 'rate_limit' | 'pattern_block' | 'user_block';
  pattern: string;
  action: 'block' | 'throttle' | 'challenge' | 'log';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  createdAt: Date;
  createdBy: string;
  metadata?: any;
}

interface AccessToken {
  token: string;
  createdAt: Date;
  expiresAt: Date;
  createdBy: string;
  serverId?: string;
  uses: number;
  maxUses?: number;
  active: boolean;
}

interface RateLimitEntry {
  identifier: string;
  count: number;
  firstRequest: Date;
  lastRequest: Date;
}

interface FirewallBlock {
  id: string;
  type: 'ip' | 'user' | 'pattern';
  value: string;
  reason: string;
  blockedAt: Date;
  expiresAt?: Date;
  permanent: boolean;
}

export class FirewallService {
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private blockedIPs: Set<string> = new Set();
  private blockedUsers: Set<string> = new Set();
  private rules: Map<string, FirewallRule> = new Map();
  private tokens: Map<string, AccessToken> = new Map();
  private tokenValidationAttempts: Map<string, number> = new Map();
  
  private readonly AGGRESSIVE_LIMITS = {
    maxRequestsPerMinute: 5,
    maxRequestsPerHour: 50,
    maxFailedAttemptsPerHour: 2,
    autoBlockThreshold: 3,
    rateLimitWindow: 60 * 1000,
    cleanupInterval: 5 * 60 * 1000
  };

  private readonly TOKEN_EXPIRY = 24 * 60 * 60 * 1000;
  private readonly TOKEN_LENGTH = 32;
  private readonly MAX_TOKEN_VALIDATION_ATTEMPTS = 10;

  constructor() {
    this.initializeDefaultRules();
    this.startCleanupInterval();
  }

  private initializeDefaultRules() {
    const defaultRules: Omit<FirewallRule, 'id' | 'createdAt'>[] = [
      {
        type: 'rate_limit',
        pattern: 'global',
        action: 'block',
        severity: 'critical',
        enabled: true,
        createdBy: 'system',
        metadata: { maxPerMinute: 5 }
      },
      {
        type: 'pattern_block',
        pattern: 'raid|nuke|spam|attack|ddos|exploit',
        action: 'block',
        severity: 'critical',
        enabled: true,
        createdBy: 'system',
        metadata: { aggressive: true }
      },
      {
        type: 'pattern_block',
        pattern: 'bot|automation|script|hack',
        action: 'block',
        severity: 'high',
        enabled: true,
        createdBy: 'system',
        metadata: { aggressive: true }
      }
    ];

    defaultRules.forEach((rule, index) => {
      const id = `default_${index + 1}`;
      this.rules.set(id, {
        ...rule,
        id,
        createdAt: new Date()
      });
    });
  }

  async checkRequest(data: {
    userId?: string;
    username?: string;
    ipAddress?: string;
    action: string;
    serverId: string;
    metadata?: any;
    token?: string;
  }): Promise<{ allowed: boolean; reason?: string; action?: string }> {
    if (data.token) {
      const tokenValidation = this.validateToken(data.token);
      
      if (tokenValidation.valid && tokenValidation.token) {
        const serverMatch = !tokenValidation.token.serverId || tokenValidation.token.serverId === data.serverId;
        
        if (serverMatch) {
          await this.logFirewallEvent({
            type: 'token_access',
            severity: 'low',
            details: `Valid token used for access by ${data.username || 'unknown'}`,
            userId: data.userId,
            serverId: data.serverId,
            metadata: { 
              tokenUses: tokenValidation.token.uses,
              tokenCreatedBy: tokenValidation.token.createdBy
            }
          });
          
          return { allowed: true, action: 'token_authenticated' };
        } else {
          await this.logFirewallEvent({
            type: 'token_mismatch',
            severity: 'medium',
            details: `Token server mismatch: token for ${tokenValidation.token.serverId}, used on ${data.serverId}`,
            userId: data.userId,
            serverId: data.serverId
          });
          
          return { 
            allowed: false, 
            reason: '❌ Token not valid for this server',
            action: 'token_rejected'
          };
        }
      } else {
        await this.logFirewallEvent({
          type: 'token_invalid',
          severity: 'high',
          details: `Invalid token attempt: ${tokenValidation.reason}`,
          userId: data.userId,
          serverId: data.serverId
        });
        
        return { 
          allowed: false, 
          reason: tokenValidation.reason || '❌ Invalid token',
          action: 'token_rejected'
        };
      }
    }
    
    if (data.ipAddress && this.blockedIPs.has(data.ipAddress)) {
      await this.logFirewallEvent({
        type: 'blocked_ip',
        severity: 'critical',
        details: `Blocked IP attempt: ${data.ipAddress}`,
        userId: data.userId,
        serverId: data.serverId
      });
      return { allowed: false, reason: '🚫 IP BLOCKED - Contact administrator', action: 'blocked' };
    }

    if (data.userId && this.blockedUsers.has(data.userId)) {
      await this.logFirewallEvent({
        type: 'blocked_user',
        severity: 'critical',
        details: `Blocked user attempt: ${data.username}`,
        userId: data.userId,
        serverId: data.serverId
      });
      return { allowed: false, reason: '🚫 USER BLOCKED - Permanent ban', action: 'blocked' };
    }

    const rateLimitCheck = this.checkRateLimit(data.userId || data.ipAddress || 'anonymous');
    if (!rateLimitCheck.allowed) {
      await this.logFirewallEvent({
        type: 'rate_limit_exceeded',
        severity: 'high',
        details: `Rate limit exceeded: ${data.username || data.ipAddress}`,
        userId: data.userId,
        serverId: data.serverId,
        metadata: { requests: rateLimitCheck.currentCount }
      });

      if (rateLimitCheck.currentCount! > this.AGGRESSIVE_LIMITS.autoBlockThreshold * this.AGGRESSIVE_LIMITS.maxRequestsPerMinute) {
        await this.blockEntity({
          type: data.userId ? 'user' : 'ip',
          value: data.userId || data.ipAddress || 'unknown',
          reason: '🚨 AUTOMATIC BLOCK - Extreme rate limit violation',
          permanent: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
      }

      return { 
        allowed: false, 
        reason: `⚠️ RATE LIMIT - Too many requests (${rateLimitCheck.currentCount}/${this.AGGRESSIVE_LIMITS.maxRequestsPerMinute} per minute)`,
        action: 'throttled' 
      };
    }

    const aiCheck = await claudeAI.detectFirewallThreat({
      ipAddress: data.ipAddress,
      requestPattern: data.action,
      requestCount: rateLimitCheck.currentCount,
      timeWindow: 60
    });

    if (aiCheck.shouldBlock && aiCheck.confidence > 0.7) {
      await this.logFirewallEvent({
        type: 'ai_threat_detected',
        severity: 'critical',
        details: `AI detected threat: ${aiCheck.reason}`,
        userId: data.userId,
        serverId: data.serverId,
        metadata: { confidence: aiCheck.confidence, threatType: aiCheck.threatType }
      });

      if (aiCheck.confidence > 0.9) {
        await this.blockEntity({
          type: data.userId ? 'user' : 'ip',
          value: data.userId || data.ipAddress || 'unknown',
          reason: `🤖 AI BLOCK - ${aiCheck.reason} (${(aiCheck.confidence * 100).toFixed(0)}% confidence)`,
          permanent: false,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
        });
      }

      return { 
        allowed: false, 
        reason: `🤖 AI SECURITY BLOCK - ${aiCheck.reason}`,
        action: 'ai_blocked'
      };
    }

    return { allowed: true };
  }

  private checkRateLimit(identifier: string): { allowed: boolean; currentCount?: number } {
    const now = Date.now();
    const entry = this.rateLimits.get(identifier);

    if (!entry) {
      this.rateLimits.set(identifier, {
        identifier,
        count: 1,
        firstRequest: new Date(now),
        lastRequest: new Date(now)
      });
      return { allowed: true, currentCount: 1 };
    }

    const timeSinceFirst = now - entry.firstRequest.getTime();
    
    if (timeSinceFirst > this.AGGRESSIVE_LIMITS.rateLimitWindow) {
      this.rateLimits.set(identifier, {
        identifier,
        count: 1,
        firstRequest: new Date(now),
        lastRequest: new Date(now)
      });
      return { allowed: true, currentCount: 1 };
    }

    entry.count++;
    entry.lastRequest = new Date(now);
    
    if (entry.count > this.AGGRESSIVE_LIMITS.maxRequestsPerMinute) {
      return { allowed: false, currentCount: entry.count };
    }

    return { allowed: true, currentCount: entry.count };
  }

  async blockEntity(block: {
    type: 'ip' | 'user' | 'pattern';
    value: string;
    reason: string;
    permanent: boolean;
    expiresAt?: Date;
  }): Promise<void> {
    if (block.type === 'ip') {
      this.blockedIPs.add(block.value);
    } else if (block.type === 'user') {
      this.blockedUsers.add(block.value);
    }

    console.log(`🚫 FIREWALL BLOCK: ${block.type} ${block.value} - ${block.reason}`);
  }

  async unblockEntity(type: 'ip' | 'user', value: string): Promise<void> {
    if (type === 'ip') {
      this.blockedIPs.delete(value);
    } else if (type === 'user') {
      this.blockedUsers.delete(value);
    }
  }

  getFirewallStats() {
    const tokenStats = this.getTokenStats();
    return {
      blockedIPs: this.blockedIPs.size,
      blockedUsers: this.blockedUsers.size,
      activeRateLimits: this.rateLimits.size,
      rulesActive: Array.from(this.rules.values()).filter(r => r.enabled).length,
      totalRules: this.rules.size,
      tokens: tokenStats,
      limits: this.AGGRESSIVE_LIMITS
    };
  }

  getRules(): FirewallRule[] {
    return Array.from(this.rules.values());
  }

  getBlockedEntities(): { ips: string[]; users: string[] } {
    return {
      ips: Array.from(this.blockedIPs),
      users: Array.from(this.blockedUsers)
    };
  }

  private async logFirewallEvent(event: {
    type: string;
    severity: string;
    details: string;
    userId?: string;
    serverId: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await storage.createThreat({
        type: 'firewall_event',
        severity: event.severity as any,
        description: `🔥 FIREWALL: ${event.details}`,
        serverId: event.serverId,
        serverName: 'Firewall System',
        userId: event.userId || 'system',
        username: 'Firewall',
        action: 'firewall',
        metadata: event.metadata
      });
    } catch (error) {
      console.error('Failed to log firewall event:', error);
    }
  }

  private startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      this.rateLimits.forEach((entry, identifier) => {
        if (now - entry.lastRequest.getTime() > this.AGGRESSIVE_LIMITS.cleanupInterval) {
          this.rateLimits.delete(identifier);
        }
      });
      
      this.cleanupExpiredTokens();
      
      this.tokenValidationAttempts.clear();
    }, this.AGGRESSIVE_LIMITS.cleanupInterval);
  }

  addRule(rule: Omit<FirewallRule, 'id' | 'createdAt'>): FirewallRule {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newRule: FirewallRule = {
      ...rule,
      id,
      createdAt: new Date()
    };
    this.rules.set(id, newRule);
    return newRule;
  }

  removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  toggleRule(id: string, enabled: boolean): boolean {
    const rule = this.rules.get(id);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  generateToken(createdBy: string, serverId?: string, expiresInHours?: number): AccessToken {
    const tokenBytes = crypto.randomBytes(this.TOKEN_LENGTH);
    const token = tokenBytes.toString('base64url');
    
    const expiryMs = expiresInHours 
      ? expiresInHours * 60 * 60 * 1000 
      : this.TOKEN_EXPIRY;
    
    const accessToken: AccessToken = {
      token,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + expiryMs),
      createdBy,
      serverId,
      uses: 0,
      active: true
    };
    
    this.tokens.set(token, accessToken);
    
    const maskedToken = `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
    fileLogger.log('info', `🔑 TOKEN GENERATED: ${maskedToken} by ${createdBy} (expires: ${accessToken.expiresAt.toISOString()})`);
    
    console.log(`🔑 TOKEN GENERATED: ${maskedToken} by ${createdBy}`);
    
    return accessToken;
  }

  validateToken(tokenString: string): { valid: boolean; token?: AccessToken; reason?: string } {
    const identifier = `token_validation_${tokenString}`;
    const attempts = this.tokenValidationAttempts.get(identifier) || 0;
    
    if (attempts > this.MAX_TOKEN_VALIDATION_ATTEMPTS) {
      fileLogger.log('warn', `🚫 TOKEN VALIDATION: Rate limit exceeded for token ...${tokenString.substring(tokenString.length - 4)}`);
      return { 
        valid: false, 
        reason: '⚠️ Too many validation attempts - Rate limited' 
      };
    }
    
    this.tokenValidationAttempts.set(identifier, attempts + 1);
    
    const token = this.tokens.get(tokenString);
    
    if (!token) {
      const maskedToken = tokenString.length > 8 
        ? `${tokenString.substring(0, 4)}...${tokenString.substring(tokenString.length - 4)}`
        : '****';
      fileLogger.log('warn', `🚫 TOKEN VALIDATION: Token not found ${maskedToken}`);
      return { valid: false, reason: '❌ Invalid token' };
    }
    
    if (!token.active) {
      const maskedToken = `${tokenString.substring(0, 4)}...${tokenString.substring(tokenString.length - 4)}`;
      fileLogger.log('warn', `🚫 TOKEN VALIDATION: Inactive token ${maskedToken}`);
      return { valid: false, reason: '❌ Token has been revoked', token };
    }
    
    if (new Date() > token.expiresAt) {
      const maskedToken = `${tokenString.substring(0, 4)}...${tokenString.substring(tokenString.length - 4)}`;
      fileLogger.log('warn', `🚫 TOKEN VALIDATION: Expired token ${maskedToken}`);
      return { valid: false, reason: '❌ Token has expired', token };
    }
    
    if (token.maxUses && token.uses >= token.maxUses) {
      const maskedToken = `${tokenString.substring(0, 4)}...${tokenString.substring(tokenString.length - 4)}`;
      fileLogger.log('warn', `🚫 TOKEN VALIDATION: Max uses exceeded ${maskedToken} (${token.uses}/${token.maxUses})`);
      return { valid: false, reason: '❌ Token usage limit exceeded', token };
    }
    
    token.uses++;
    
    const maskedToken = `${tokenString.substring(0, 4)}...${tokenString.substring(tokenString.length - 4)}`;
    fileLogger.log('info', `✅ TOKEN VALIDATED: ${maskedToken} (use #${token.uses})`);
    
    return { valid: true, token };
  }

  revokeToken(tokenString: string, revokedBy: string): boolean {
    const token = this.tokens.get(tokenString);
    
    if (!token) {
      return false;
    }
    
    token.active = false;
    
    const maskedToken = `${tokenString.substring(0, 4)}...${tokenString.substring(tokenString.length - 4)}`;
    fileLogger.log('info', `🚫 TOKEN REVOKED: ${maskedToken} by ${revokedBy}`);
    console.log(`🚫 TOKEN REVOKED: ${maskedToken} by ${revokedBy}`);
    
    return true;
  }

  rotateToken(oldToken: string, rotatedBy: string): AccessToken | null {
    const token = this.tokens.get(oldToken);
    
    if (!token) {
      return null;
    }
    
    this.revokeToken(oldToken, rotatedBy);
    
    const expiryMs = token.expiresAt.getTime() - token.createdAt.getTime();
    const expiresInHours = expiryMs / (60 * 60 * 1000);
    
    const newToken = this.generateToken(rotatedBy, token.serverId, expiresInHours);
    
    if (token.maxUses) {
      newToken.maxUses = token.maxUses;
    }
    
    const oldMasked = `${oldToken.substring(0, 4)}...${oldToken.substring(oldToken.length - 4)}`;
    const newMasked = `${newToken.token.substring(0, 4)}...${newToken.token.substring(newToken.token.length - 4)}`;
    fileLogger.log('info', `🔄 TOKEN ROTATED: ${oldMasked} -> ${newMasked} by ${rotatedBy}`);
    
    return newToken;
  }

  getActiveTokens(): AccessToken[] {
    const now = new Date();
    return Array.from(this.tokens.values())
      .filter(token => token.active && token.expiresAt > now);
  }

  cleanupExpiredTokens(): number {
    const now = new Date();
    let count = 0;
    
    this.tokens.forEach((token, key) => {
      if (token.expiresAt <= now) {
        this.tokens.delete(key);
        count++;
      }
    });
    
    if (count > 0) {
      fileLogger.log('info', `🧹 CLEANUP: Removed ${count} expired token(s)`);
      console.log(`🧹 Token cleanup: Removed ${count} expired token(s)`);
    }
    
    return count;
  }

  getTokenStats() {
    const now = new Date();
    const allTokens = Array.from(this.tokens.values());
    const activeTokens = allTokens.filter(t => t.active && t.expiresAt > now);
    const expiredTokens = allTokens.filter(t => t.expiresAt <= now);
    const revokedTokens = allTokens.filter(t => !t.active);
    
    return {
      total: this.tokens.size,
      active: activeTokens.length,
      expired: expiredTokens.length,
      revoked: revokedTokens.length
    };
  }
}

export const firewall = new FirewallService();
