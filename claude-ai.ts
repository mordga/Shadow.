import { ResilientModule } from './failover-manager';
import type { HealthCheckResult } from './health-monitor';
import { storage } from '../storage';
import { aiEngineManager, type AIEngine, type TaskType } from './ai-engine-manager';

console.log('[AIService] 🚀 Distributed AI Service Initialized - Using free AI engines (Mistral, HuggingFace, Gemma, Letta)');

export interface ThreatAnalysisResult {
  isThreat: boolean;
  confidence: number;
  threatType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  suggestedAction: 'monitor' | 'quarantine' | 'ban' | 'immediate_ban';
  patterns: string[];
}

export interface ContentModerationResult {
  isNSFW: boolean;
  confidence: number;
  categories: string[];
  reasoning: string;
}

export interface BypassAnalysisResult {
  isBypass: boolean;
  confidence: number;
  technique: string;
  pattern: string;
  countermeasure: string;
}

export interface LegacyThreatAnalysisResult {
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  threatType: 'spam' | 'raid' | 'toxicity' | 'scam' | 'other';
  confidence: number;
  reasoning: string;
  suggestedAction: 'warn' | 'mute' | 'kick' | 'ban';
}

export interface BehaviorAnalysisResult {
  trustScore: number;
  behaviorType: 'normal' | 'suspicious' | 'malicious';
  anomalies: string[];
  recommendation: string;
}

export class AIService {
  private async callAI(prompt: string, taskType: TaskType, temperature: number = 0.3, maxTokens: number = 2048, preferredEngine?: AIEngine): Promise<string> {
    const response = await aiEngineManager.generar_respuesta({
      taskType,
      prompt,
      temperature,
      maxTokens,
      preferredEngine,
    });

    if (!response.success && response.error) {
      console.warn(`[AIService] AI returned error: ${response.error}, using fallback`);
    }

    return response.content;
  }

  async analyzeThreat(data: {
    username: string;
    userId: string;
    messageContent?: string;
    joinPattern?: string;
    accountAge?: number;
    activityPattern?: string;
    reputation?: number;
  }): Promise<ThreatAnalysisResult> {
    try {
      const prompt = `You are a BALANCED AND FAIR security AI analyzing Discord server threats. Be balanced and give users the benefit of the doubt.

USER DATA:
- Username: ${data.username}
- User ID: ${data.userId}
- Account Age: ${data.accountAge || 'unknown'} days
- Reputation: ${data.reputation || 0}
${data.messageContent ? `- Recent Message: ${data.messageContent}` : ''}
${data.joinPattern ? `- Join Pattern: ${data.joinPattern}` : ''}
${data.activityPattern ? `- Activity Pattern: ${data.activityPattern}` : ''}

ANALYZE THIS USER FAIRLY:
1. Is this a threat? (Be fair and objective)
2. Threat confidence (0-1, err on the side of LOW confidence - only flag obvious threats)
3. Threat type (raid, spam, bot, alt_account, nuke, phishing, scam, bypass_attempt, suspicious_behavior)
4. Severity (low/medium/high/critical - default to LOW or NONE - only escalate with clear evidence)
5. Reasoning (be specific but fair)
6. Suggested action (monitor/quarantine/ban/immediate_ban - prefer MONITOR or ALLOW - only suggest ban for clear threats)
7. Detected patterns (list only clear patterns with strong evidence)

FAIR ASSESSMENT GUIDELINES:
- New accounts deserve a chance - only flag if clear malicious behavior is present
- Account <7 days = Monitor but allow unless clear threat evidence
- Account 7-14 days = Treat as normal unless problematic behavior shown
- Low reputation alone is not a reason to ban - look for actual harmful actions
- Reputation <0 = Investigate but don't auto-ban
- Reputation 0-50 = Normal range, no special action needed
- Join patterns require clear coordination evidence to be flagged
- Spam must be repetitive and disruptive, not just active participation
- Give benefit of doubt - prioritize user experience

Respond ONLY with valid JSON:
{
  "isThreat": boolean,
  "confidence": number (0-1),
  "threatType": string,
  "severity": "low" | "medium" | "high" | "critical",
  "reasoning": string,
  "suggestedAction": "monitor" | "quarantine" | "ban" | "immediate_ban",
  "patterns": string[]
}`;

      const responseText = await this.callAI(prompt, 'threat_analysis', 0.3, 2048);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        console.error('AI response did not contain valid JSON:', responseText);
        return this.getDefaultPermissiveResponse();
      }

      const result = JSON.parse(jsonMatch[0]) as ThreatAnalysisResult;
      
      return result;
    } catch (error) {
      console.error('Error in AI threat analysis:', error);
      return this.getDefaultPermissiveResponse();
    }
  }

  async analyzeUserBehavior(data: {
    userId: string;
    username: string;
    messageHistory: string[];
    joinTimestamp: Date;
    activityFrequency: number;
    reputation: number;
  }): Promise<BehaviorAnalysisResult> {
    try {
      const accountAge = Math.floor((Date.now() - data.joinTimestamp.getTime()) / (1000 * 60 * 60 * 24));
      
      const prompt = `You are a BALANCED behavior analysis AI for Discord security. Be fair and objective.

USER BEHAVIOR DATA:
- Username: ${data.username}
- Account Age: ${accountAge} days
- Message Count: ${data.messageHistory.length}
- Activity Frequency: ${data.activityFrequency} messages/hour
- Reputation Score: ${data.reputation}
- Recent Messages: ${data.messageHistory.slice(0, 10).join(' | ')}

FAIR ANALYSIS REQUIRED:
1. Calculate trust score (0-100, be fair, default NORMAL range 50-70)
2. Classify behavior (normal/suspicious/malicious - default to NORMAL unless clear evidence)
3. List only significant anomalies with clear evidence
4. Give balanced recommendation

BALANCED CRITERIA:
- New accounts deserve trust - age alone is not suspicious
- Account <7 days = Trust score 40-60 (normal for new users)
- Account 7-14 days = Trust score 50-70 (building reputation)
- Low activity = Normal (people lurk, that's okay)
- High activity = Could be enthusiastic user (not automatically suspicious)
- Reputation <0 = Needs investigation but not auto-malicious
- Reputation 0-50 = Normal range for new/casual users
- Repetitive messages need context - could be asking for help
- Links/mentions are normal Discord usage
- Only flag clear patterns of abuse

Respond ONLY with valid JSON:
{
  "trustScore": number (0-100),
  "behaviorType": "normal" | "suspicious" | "malicious",
  "anomalies": string[],
  "recommendation": string
}`;

      const responseText = await this.callAI(prompt, 'behavior_analysis', 0.2, 2048);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        return {
          trustScore: 60,
          behaviorType: 'normal',
          anomalies: ['AI analysis unavailable - giving benefit of doubt'],
          recommendation: 'Allow user, monitor passively if needed'
        };
      }

      return JSON.parse(jsonMatch[0]) as BehaviorAnalysisResult;
    } catch (error) {
      console.error('Error in AI behavior analysis:', error);
      return {
        trustScore: 60,
        behaviorType: 'normal',
        anomalies: ['Analysis error - giving benefit of doubt'],
        recommendation: 'Allow user normally, analysis unavailable'
      };
    }
  }

  async detectFirewallThreat(data: {
    ipAddress?: string;
    userAgent?: string;
    requestPattern?: string;
    requestCount?: number;
    timeWindow?: number;
  }): Promise<{
    shouldBlock: boolean;
    confidence: number;
    reason: string;
    threatType: string;
  }> {
    try {
      const prompt = `You are a FIREWALL AI with BALANCED PROTECTION. Analyze this connection attempt with REASONABLE THRESHOLDS.

CONNECTION DATA:
${data.ipAddress ? `- IP Address: ${data.ipAddress}` : ''}
${data.userAgent ? `- User Agent: ${data.userAgent}` : ''}
${data.requestPattern ? `- Request Pattern: ${data.requestPattern}` : ''}
${data.requestCount ? `- Request Count: ${data.requestCount} requests in ${data.timeWindow || 60}s` : ''}

FAIR FIREWALL RULES:
- Unusual patterns need clear malicious intent to block
- Request count >50 in 60s = Possible DDoS - investigate before blocking
- Rate limits should be reasonable - 10-30 requests/min is normal for active users
- User agents vary - don't block based on agent alone
- Known attack patterns = Block, but verify first
- Automation tools may be legitimate (bots, scripts) - context matters
- Only block clear threats with strong evidence

Respond ONLY with valid JSON:
{
  "shouldBlock": boolean,
  "confidence": number (0-1),
  "reason": string,
  "threatType": string
}`;

      const responseText = await this.callAI(prompt, 'firewall_intelligence', 0.1, 1024);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        return {
          shouldBlock: false,
          confidence: 0.3,
          reason: 'AI analysis failed - allowing with monitoring',
          threatType: 'unknown'
        };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Error in firewall threat detection:', error);
      return {
        shouldBlock: false,
        confidence: 0.3,
        reason: 'Analysis error - allowing with caution',
        threatType: 'error'
      };
    }
  }

  async analyzeImageContent(base64Image: string): Promise<ContentModerationResult> {
    console.warn('[AIService] Image analysis not available with current AI engines - using fallback');
    
    if (!base64Image || typeof base64Image !== 'string' || base64Image.length === 0) {
      throw new Error('Invalid base64Image provided');
    }

    if (base64Image.length > 20 * 1024 * 1024) {
      throw new Error('Base64 image too large (>20MB)');
    }

    return {
      isNSFW: false,
      confidence: 0.2,
      categories: ['unknown'],
      reasoning: 'Image analysis not available - manual review recommended for visual content moderation'
    };
  }

  async analyzeTextForBypass(text: string, existingPatterns: string[]): Promise<BypassAnalysisResult> {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text provided');
    }

    if (text.length > 10000) {
      throw new Error('Text too long for analysis (>10000 chars)');
    }

    if (!Array.isArray(existingPatterns)) {
      existingPatterns = [];
    }

    try {
      const prompt = `You are a BALANCED bypass detection AI. Analyze this text for evasion techniques used to evade content filters. Be fair and only flag intentional malicious bypasses.

TEXT TO ANALYZE: "${text}"

KNOWN BYPASS PATTERNS: ${existingPatterns.join(', ') || 'none'}

DETECT CLEAR BYPASS TECHNIQUES:
- Unicode substitution with malicious intent (е.g., purposely using Cyrillic 'а' instead of Latin 'a' to bypass filters)
- Invisible characters used to hide banned words
- Leetspeak when used to evade filters (not casual use)
- Character spacing specifically to bypass filters (s p a c i n g to hide words)
- Homoglyphs used maliciously (lookalike characters to trick filters)
- Zalgo text or heavy diacritics used to obscure content
- Encoded text (Base64/ROT13) hiding prohibited content
- Creative evasion with clear malicious intent

FAIR DETECTION GUIDELINES:
- Non-ASCII characters are normal in many languages - not automatically suspicious
- Casual leetspeak (gaming culture) is different from filter evasion
- Formatting choices may be stylistic, not evasion
- Consider context and intent - is this actually trying to bypass filters?
- Only flag if clear evidence of intentional filter bypass
- Give benefit of doubt for legitimate language use

Respond ONLY with valid JSON:
{
  "isBypass": boolean,
  "confidence": number (0-1),
  "technique": "technique name",
  "pattern": "detected pattern",
  "countermeasure": "how to detect/block this pattern"
}`;

      const responseText = await this.callAI(prompt, 'bypass_detection', 0.2, 2048);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        console.error('AI response did not contain valid JSON:', responseText);
        throw new Error('Invalid JSON response from AI');
      }

      const result = JSON.parse(jsonMatch[0]);
      return {
        isBypass: result.isBypass || false,
        confidence: Math.max(0, Math.min(1, result.confidence || 0)),
        technique: result.technique || 'unknown',
        pattern: result.pattern || '',
        countermeasure: result.countermeasure || ''
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AIService] Bypass analysis failed:', errorMessage);
      throw new Error(`Failed to analyze text for bypasses: ${errorMessage}`);
    }
  }

  async analyzeThreatLevel(message: string, userHistory: any[]): Promise<LegacyThreatAnalysisResult> {
    if (!message || typeof message !== 'string') {
      throw new Error('Invalid message provided');
    }

    if (message.length > 5000) {
      throw new Error('Message too long for analysis (>5000 chars)');
    }

    if (!Array.isArray(userHistory)) {
      userHistory = [];
    }

    if (userHistory.length > 50) {
      userHistory = userHistory.slice(-50);
    }

    try {
      const prompt = `You are a BALANCED Discord security analyst AI. Analyze this message for threats with FAIR JUDGMENT.

MESSAGE: "${message}"

USER HISTORY: ${JSON.stringify(userHistory.slice(0, 10))}

DETECT CLEAR THREATS:
- Spam patterns (truly repetitive, disruptive content)
- Raid coordination (clear organized attacks with evidence)
- Toxicity (serious harassment, hate speech, bullying)
- Scams (obvious phishing, fake giveaways, malicious links)
- Doxxing attempts (sharing private personal information)
- Malicious links or files (verified threats)
- Bot-like behavior (clear automation, not just active users)
- Suspicious activity (with concrete evidence)

FAIR THREAT ASSESSMENT:
- CRITICAL: Clear immediate danger with strong evidence (raids, doxxing, severe threats)
- HIGH: Serious violations with clear proof (confirmed scams, hate speech, spam)
- MEDIUM: Concerning behavior worth monitoring (potential issues)
- LOW: Minor concerns or borderline content (usually acceptable)

DEFAULT TO LOW UNLESS CLEAR EVIDENCE OF THREAT!

Respond ONLY with valid JSON:
{
  "threatLevel": "low" | "medium" | "high" | "critical",
  "threatType": "spam" | "raid" | "toxicity" | "scam" | "other",
  "confidence": number (0-1),
  "reasoning": "detailed explanation",
  "suggestedAction": "warn" | "mute" | "kick" | "ban"
}`;

      const responseText = await this.callAI(prompt, 'threat_analysis', 0.3, 2048);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        console.error('AI response did not contain valid JSON:', responseText);
        throw new Error('Invalid JSON response from AI');
      }

      const result = JSON.parse(jsonMatch[0]);
      return {
        threatLevel: result.threatLevel || 'low',
        threatType: result.threatType || 'other',
        confidence: Math.max(0, Math.min(1, result.confidence || 0)),
        reasoning: result.reasoning || 'No analysis provided',
        suggestedAction: result.suggestedAction || 'warn'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AIService] Threat analysis failed:', errorMessage);
      throw new Error(`Failed to analyze threat level: ${errorMessage}`);
    }
  }

  async generateCountermeasure(bypassTechnique: string, existingCountermeasures: string[]): Promise<string> {
    if (!bypassTechnique || typeof bypassTechnique !== 'string') {
      throw new Error('Invalid bypassTechnique provided');
    }

    if (!Array.isArray(existingCountermeasures)) {
      existingCountermeasures = [];
    }

    try {
      const prompt = `You are an expert security engineer specializing in bypass countermeasures. Generate a BALANCED and EFFECTIVE countermeasure for this bypass technique.

BYPASS TECHNIQUE: ${bypassTechnique}

EXISTING COUNTERMEASURES: ${existingCountermeasures.join(', ') || 'none'}

REQUIREMENTS:
1. Provide a detailed regex pattern OR detection algorithm
2. Be thorough but avoid false positives - balance security with usability
3. Include detection methods that respect legitimate use cases
4. Make it production-ready and well-documented
5. Be precise - detect actual bypasses without blocking normal behavior

Generate a complete, technical countermeasure solution. Include code comments explaining the logic.`;

      return await this.callAI(prompt, 'countermeasure_generation', 0.4, 4096);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AIService] Countermeasure generation failed:', errorMessage);
      throw new Error(`Failed to generate countermeasure: ${errorMessage}`);
    }
  }

  async generateSecurityReport(stats: any, threats: any[], incidents: any[]): Promise<string> {
    if (!Array.isArray(threats)) {
      threats = [];
    }

    if (!Array.isArray(incidents)) {
      incidents = [];
    }

    try {
      const prompt = `You are a SENIOR SECURITY ANALYST generating a comprehensive Discord bot security report. Create a PROFESSIONAL, DETAILED, and ACTIONABLE report in Markdown format.

STATISTICS:
${JSON.stringify(stats, null, 2)}

RECENT THREATS (Top 10):
${JSON.stringify(threats.slice(0, 10), null, 2)}

RECENT INCIDENTS (Top 5):
${JSON.stringify(incidents.slice(0, 5), null, 2)}

REPORT REQUIREMENTS:
1. Executive Summary (high-level overview for management)
2. Key Metrics & Statistics (visual-friendly format)
3. Threat Analysis (detailed breakdown by type and severity)
4. Incident Breakdown (patterns, root causes, impact)
5. Security Recommendations (actionable next steps)
6. Technical Details (for security team)
7. Risk Assessment (current posture, vulnerabilities)
8. Improvement Roadmap (short-term and long-term)

Make it PROFESSIONAL, COMPREHENSIVE, and ACTIONABLE. Use proper Markdown formatting with headers, tables, lists, and emphasis where appropriate.`;

      return await this.callAI(prompt, 'report_generation', 0.6, 8000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AIService] Report generation failed:', errorMessage);
      throw new Error(`Failed to generate security report: ${errorMessage}`);
    }
  }

  private getDefaultPermissiveResponse(): ThreatAnalysisResult {
    return {
      isThreat: false,
      confidence: 0.3,
      threatType: 'unknown',
      severity: 'low',
      reasoning: 'AI analysis failed - giving user benefit of doubt, monitoring recommended',
      suggestedAction: 'monitor',
      patterns: ['ai_analysis_unavailable']
    };
  }
}

class HeuristicFallbackService {
  async analyzeImageContent(base64Image: string): Promise<ContentModerationResult> {
    console.warn('[AIService Fallback] Using heuristic image analysis (AI unavailable)');
    return {
      isNSFW: false,
      confidence: 0.3,
      categories: ['unknown'],
      reasoning: 'AI analysis unavailable - using fallback heuristics (low confidence)'
    };
  }

  async analyzeTextForBypass(text: string, existingPatterns: string[]): Promise<BypassAnalysisResult> {
    console.warn('[AIService Fallback] Using heuristic bypass analysis (AI unavailable)');
    
    const hasUnicode = /[^\x00-\x7F]/.test(text);
    const hasInvisibleChars = /[\u200B-\u200D\uFEFF]/.test(text);
    const hasZalgo = /[\u0300-\u036F]/.test(text);
    const hasLeetspeak = /[0-9@$!]/.test(text.toLowerCase().replace(/[aeilost]/gi, ''));
    
    const isBypass = hasUnicode || hasInvisibleChars || hasZalgo || hasLeetspeak;
    
    return {
      isBypass,
      confidence: isBypass ? 0.4 : 0.2,
      technique: isBypass ? 'character_substitution' : 'none',
      pattern: text,
      countermeasure: 'Basic heuristic detection (AI unavailable)'
    };
  }

  async analyzeThreatLevel(message: string, userHistory: any[]): Promise<LegacyThreatAnalysisResult> {
    console.warn('[AIService Fallback] Using heuristic threat analysis (AI unavailable)');
    
    const lowerMessage = message.toLowerCase();
    const highThreatKeywords = ['hack', 'raid', 'nuke', 'ddos', 'dox', 'swat'];
    const medThreatKeywords = ['scam', 'spam', 'phish', 'free', 'gift', 'nitro'];
    const toxicKeywords = ['kys', 'die', 'hate', 'idiot', 'stupid'];
    
    let threatLevel: LegacyThreatAnalysisResult['threatLevel'] = 'low';
    let threatType: LegacyThreatAnalysisResult['threatType'] = 'other';
    let confidence = 0.3;
    
    if (highThreatKeywords.some(kw => lowerMessage.includes(kw))) {
      threatLevel = 'high';
      threatType = 'raid';
      confidence = 0.5;
    } else if (medThreatKeywords.some(kw => lowerMessage.includes(kw))) {
      threatLevel = 'medium';
      threatType = 'scam';
      confidence = 0.4;
    } else if (toxicKeywords.some(kw => lowerMessage.includes(kw))) {
      threatLevel = 'medium';
      threatType = 'toxicity';
      confidence = 0.4;
    }
    
    if (userHistory.length > 5) {
      const recentMessages = userHistory.slice(-5);
      const duplicates = recentMessages.filter(m => m.content === message).length;
      if (duplicates > 2) {
        threatLevel = 'high';
        threatType = 'spam';
        confidence = 0.6;
      }
    }
    
    return {
      threatLevel,
      threatType,
      confidence,
      reasoning: `Heuristic analysis (AI unavailable): detected ${threatType} with ${confidence} confidence`,
      suggestedAction: threatLevel === 'high' ? 'kick' : 'warn'
    };
  }

  async generateCountermeasure(bypassTechnique: string, existingCountermeasures: string[]): Promise<string> {
    console.warn('[AIService Fallback] Using basic countermeasure generation (AI unavailable)');
    return `// Basic countermeasure for ${bypassTechnique}\n// AI generation unavailable - manual review required`;
  }

  async generateSecurityReport(stats: any, threats: any[], incidents: any[]): Promise<string> {
    console.warn('[AIService Fallback] Using basic report generation (AI unavailable)');
    return `# Security Report (Generated with Fallback)\n\n**Note**: AI report generation is currently unavailable.\n\n## Stats\n- Total Threats: ${threats.length}\n- Total Incidents: ${incidents.length}\n\n## Recent Activity\n${threats.slice(0, 5).map(t => `- ${t.type}: ${t.description}`).join('\n')}`;
  }
}

const aiService = new AIService();
const primaryAIService = new AIService();
const backupAIService = new AIService();
const heuristicFallback = new HeuristicFallbackService();

const resilientAIService = new ResilientModule({
  primary: primaryAIService,
  backups: [backupAIService, heuristicFallback as any],
  errorThreshold: 2,
  timeout: 30000,
  resetTimeout: 60000,
  halfOpenMaxAttempts: 1,
  rollingWindowSize: 30,
  errorBudget: 0.2
});

resilientAIService.onFailover((from, to, reason) => {
  console.error(`[AI Service] FAILOVER: ${from} -> ${to === 1 ? 'heuristic fallback' : `backup[${to}]`} (Reason: ${reason})`);
  storage.createIncident({
    type: 'system',
    severity: to === 1 ? 'critical' : 'high',
    title: 'AI Service Failover',
    description: `AI service failed over from ${from} to ${to === 1 ? 'heuristic fallback' : `backup ${to}`}`,
    serverId: 'system',
    serverName: 'System',
    affectedUsers: [],
    actionsPerformed: ['failover'],
    evidence: { from, to, reason, usingHeuristics: to === 1, timestamp: new Date() }
  }).catch(err => console.error('Failed to log failover incident:', err));
});

resilientAIService.onRestore((instance) => {
  console.log(`[AI Service] RESTORED to ${instance} instance`);
  storage.createIncident({
    type: 'system',
    severity: 'low',
    title: 'AI Service Restored',
    description: `AI service successfully restored to ${instance} instance`,
    serverId: 'system',
    serverName: 'System',
    affectedUsers: [],
    actionsPerformed: ['restore'],
    evidence: { instance, timestamp: new Date() }
  }).catch(err => console.error('Failed to log restore incident:', err));
});

export const claudeService = resilientAIService;
export const claudeAI = aiService;
export { aiService };

export async function checkClaudeHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const testAnalysis = await resilientAIService.execute(
      'analyzeThreatLevel',
      'test message for health check',
      []
    );
    
    const latency = Date.now() - startTime;
    
    if (testAnalysis && testAnalysis.threatLevel && testAnalysis.confidence !== undefined) {
      return {
        healthy: true,
        latency,
        message: 'AI Service is operational',
        metadata: { 
          testPassed: true, 
          threatLevel: testAnalysis.threatLevel,
          responseTime: latency,
          usingFallback: testAnalysis.confidence < 0.5
        }
      };
    }
    
    return {
      healthy: false,
      latency,
      message: 'AI Service returned invalid response'
    };
  } catch (error: any) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      message: `AI Service health check failed: ${error?.message || 'Unknown error'}`
    };
  }
}
