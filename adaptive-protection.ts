import { storage } from "../storage";
import type { SecurityEngine, RaidDetectionConfig, SpamDetectionConfig } from "./security-engine";
import type { Threat } from "@shared/schema";

interface ThreatPattern {
  type: string;
  frequency: number;
  avgSeverity: string;
  commonTechniques: string[];
  peakHours: number[];
  affectedServers: string[];
  maliciousUsers: string[];
}

interface AttackPrediction {
  predictedType: string;
  probability: number;
  expectedTimeframe: string;
  reasoning: string;
  confidence: number;
}

interface ThresholdAdjustment {
  config: string;
  parameter: string;
  oldValue: number | string;
  newValue: number | string;
  reason: string;
  timestamp: Date;
  severity: 'minor' | 'moderate' | 'major';
}

interface LearningReport {
  analysisDate: Date;
  threatsAnalyzed: number;
  patternsDetected: ThreatPattern[];
  predictions: AttackPrediction[];
  adjustmentsMade: ThresholdAdjustment[];
  topMaliciousUsers: Array<{ userId: string; threatCount: number; types: string[] }>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export class AdaptiveProtection {
  private securityEngine: SecurityEngine;
  private adjustmentHistory: ThresholdAdjustment[] = [];
  private learningInterval?: NodeJS.Timeout;
  private lastAnalysis?: Date;
  private patternsLearned: ThreatPattern[] = [];
  private readonly MAX_HISTORY_SIZE = 500;

  constructor(securityEngine: SecurityEngine) {
    this.securityEngine = securityEngine;
    console.log('[AdaptiveProtection] 🧠 AI Learning System initialized - AGGRESSIVE MODE ENABLED');
    
    this.startAutomaticLearning();
  }

  private startAutomaticLearning(): void {
    this.learningInterval = setInterval(async () => {
      console.log('[AdaptiveProtection] 🔄 Running automatic security adaptation...');
      try {
        await this.adaptSecurityRules();
      } catch (error) {
        console.error('[AdaptiveProtection] ❌ Automatic learning failed:', error);
      }
    }, 60 * 60 * 1000);
  }

  async analyzeHistoricalThreats(): Promise<ThreatPattern[]> {
    console.log('[AdaptiveProtection] 📊 Analyzing historical threats...');
    
    const threats = await storage.getThreats(1000);
    if (threats.length === 0) {
      console.log('[AdaptiveProtection] ℹ️ No threats to analyze');
      return [];
    }

    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

    const threatsByType = new Map<string, Threat[]>();
    for (const threat of threats) {
      if (!threatsByType.has(threat.type)) {
        threatsByType.set(threat.type, []);
      }
      threatsByType.get(threat.type)!.push(threat);
    }

    const patterns: ThreatPattern[] = [];

    for (const [type, typeThreats] of Array.from(threatsByType.entries())) {
      const recentThreats = typeThreats.filter(t => t.timestamp.getTime() > oneWeekAgo);
      
      const hourCounts = new Array(24).fill(0);
      for (const threat of recentThreats) {
        const hour = new Date(threat.timestamp).getHours();
        hourCounts[hour]++;
      }

      const peakHours = hourCounts
        .map((count, hour) => ({ hour, count }))
        .filter(h => h.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(h => h.hour);

      const techniques = new Map<string, number>();
      const servers = new Set<string>();
      const users = new Map<string, number>();

      for (const threat of typeThreats) {
        servers.add(threat.serverId);
        
        if (threat.userId) {
          users.set(threat.userId, (users.get(threat.userId) || 0) + 1);
        }

        if (threat.metadata && typeof threat.metadata === 'object') {
          const metadata = threat.metadata as Record<string, unknown>;
          if (metadata.technique && typeof metadata.technique === 'string') {
            techniques.set(metadata.technique, (techniques.get(metadata.technique) || 0) + 1);
          }
          if (metadata.pattern && typeof metadata.pattern === 'string') {
            techniques.set(metadata.pattern, (techniques.get(metadata.pattern) || 0) + 1);
          }
        }
      }

      const topTechniques = Array.from(techniques.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([technique]) => technique);

      const maliciousUsers = Array.from(users.entries())
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .map(([userId]) => userId);

      const severityCounts = new Map<string, number>();
      for (const threat of typeThreats) {
        severityCounts.set(threat.severity, (severityCounts.get(threat.severity) || 0) + 1);
      }
      const avgSeverity = Array.from(severityCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'medium';

      patterns.push({
        type,
        frequency: typeThreats.length,
        avgSeverity,
        commonTechniques: topTechniques,
        peakHours,
        affectedServers: Array.from(servers),
        maliciousUsers
      });
    }

    this.patternsLearned = patterns.sort((a, b) => b.frequency - a.frequency);
    console.log(`[AdaptiveProtection] ✅ Analyzed ${threats.length} threats, found ${patterns.length} patterns`);
    
    return patterns;
  }

  async learnFromPatterns(): Promise<ThreatPattern[]> {
    console.log('[AdaptiveProtection] 🎓 Learning from detected patterns...');
    
    const patterns = await this.analyzeHistoricalThreats();
    
    for (const pattern of patterns) {
      console.log(`[AdaptiveProtection] 📈 Pattern: ${pattern.type} - ${pattern.frequency} occurrences`);
      console.log(`  → Peak hours: ${pattern.peakHours.join(', ')}`);
      console.log(`  → Common techniques: ${pattern.commonTechniques.join(', ')}`);
      console.log(`  → Malicious users: ${pattern.maliciousUsers.length}`);
    }

    return patterns;
  }

  async adaptSecurityRules(): Promise<ThresholdAdjustment[]> {
    console.log('[AdaptiveProtection] 🛡️ Adapting security rules based on learned patterns...');
    
    const adjustments: ThresholdAdjustment[] = [];
    const patterns = await this.analyzeHistoricalThreats();
    const threats = await storage.getThreats(1000);
    
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

    const recentThreats = threats.filter(t => t.timestamp.getTime() > oneDayAgo);
    const weeklyThreats = threats.filter(t => t.timestamp.getTime() > oneWeekAgo);

    for (const pattern of patterns) {
      const patternThreats = recentThreats.filter(t => t.type === pattern.type);
      
      if (pattern.type === 'spam' && patternThreats.length > 50) {
        const currentConfig = this.securityEngine.getSpamConfig();
        const reduction = 0.8;
        
        if (currentConfig.maxMessagesPerMinute > 1) {
          const oldValue = currentConfig.maxMessagesPerMinute;
          const newValue = Math.max(1, Math.floor(currentConfig.maxMessagesPerMinute * reduction));
          
          this.securityEngine.updateSpamConfig({
            maxMessagesPerMinute: newValue
          });

          const adjustment: ThresholdAdjustment = {
            config: 'spam',
            parameter: 'maxMessagesPerMinute',
            oldValue,
            newValue,
            reason: `AGGRESSIVE: ${patternThreats.length} spam threats in 24h - reducing threshold by 20%`,
            timestamp: new Date(),
            severity: 'major'
          };
          adjustments.push(adjustment);
          console.log(`[AdaptiveProtection] 🚨 ${adjustment.reason}`);
        }

        if (currentConfig.maxDuplicateMessages > 1) {
          const oldValue = currentConfig.maxDuplicateMessages;
          const newValue = 1;
          
          this.securityEngine.updateSpamConfig({
            maxDuplicateMessages: newValue
          });

          const adjustment: ThresholdAdjustment = {
            config: 'spam',
            parameter: 'maxDuplicateMessages',
            oldValue,
            newValue,
            reason: `AGGRESSIVE: High spam pattern detected - ZERO TOLERANCE for duplicates`,
            timestamp: new Date(),
            severity: 'major'
          };
          adjustments.push(adjustment);
          console.log(`[AdaptiveProtection] 🚨 ${adjustment.reason}`);
        }
      }

      if (pattern.type === 'raid') {
        const raidCount = weeklyThreats.filter(t => t.type === 'raid').length;
        
        if (raidCount > 10) {
          const currentConfig = this.securityEngine.getRaidConfig();
          const oldValue = currentConfig.minAccountAge;
          const newValue = Math.min(30, currentConfig.minAccountAge + 7);
          
          this.securityEngine.updateRaidConfig({
            minAccountAge: newValue
          });

          const adjustment: ThresholdAdjustment = {
            config: 'raid',
            parameter: 'minAccountAge',
            oldValue,
            newValue,
            reason: `AGGRESSIVE: ${raidCount} raids in 7 days - increasing account age requirement`,
            timestamp: new Date(),
            severity: 'major'
          };
          adjustments.push(adjustment);
          console.log(`[AdaptiveProtection] 🚨 ${adjustment.reason}`);
        }

        if (pattern.commonTechniques.length > 0) {
          const currentConfig = this.securityEngine.getRaidConfig();
          const newPatterns = pattern.commonTechniques.filter(
            tech => !currentConfig.suspiciousPatterns.includes(tech)
          );

          if (newPatterns.length > 0) {
            this.securityEngine.updateRaidConfig({
              suspiciousPatterns: [...currentConfig.suspiciousPatterns, ...newPatterns]
            });

            const adjustment: ThresholdAdjustment = {
              config: 'raid',
              parameter: 'suspiciousPatterns',
              oldValue: currentConfig.suspiciousPatterns.length,
              newValue: currentConfig.suspiciousPatterns.length + newPatterns.length,
              reason: `AGGRESSIVE: Auto-learned ${newPatterns.length} new suspicious patterns: ${newPatterns.join(', ')}`,
              timestamp: new Date(),
              severity: 'moderate'
            };
            adjustments.push(adjustment);
            console.log(`[AdaptiveProtection] 🚨 ${adjustment.reason}`);
          }
        }
      }

      if (pattern.type === 'bypass') {
        const bypassCount = weeklyThreats.filter(t => t.type === 'bypass').length;
        
        if (bypassCount > 100) {
          for (const technique of pattern.commonTechniques) {
            try {
              const existingPatterns = await storage.getBypassPatterns();
              const exists = existingPatterns.some(p => p.name === technique);
              
              if (!exists) {
                await storage.createBypassPattern({
                  name: technique,
                  pattern: technique,
                  severity: 'high',
                  description: `Auto-learned bypass pattern from ${bypassCount} attempts`,
                  countermeasure: 'Immediate ban on detection'
                });

                const adjustment: ThresholdAdjustment = {
                  config: 'bypass',
                  parameter: 'patterns',
                  oldValue: existingPatterns.length,
                  newValue: existingPatterns.length + 1,
                  reason: `AGGRESSIVE: ${bypassCount} bypass attempts - auto-added pattern: ${technique}`,
                  timestamp: new Date(),
                  severity: 'major'
                };
                adjustments.push(adjustment);
                console.log(`[AdaptiveProtection] 🚨 ${adjustment.reason}`);
              }
            } catch (error) {
              console.error(`[AdaptiveProtection] Failed to create bypass pattern:`, error);
            }
          }
        }
      }

      if (pattern.type === 'nsfw' && patternThreats.length > 30) {
        const adjustment: ThresholdAdjustment = {
          config: 'nsfw',
          parameter: 'sensitivity',
          oldValue: 'normal',
          newValue: 'maximum',
          reason: `AGGRESSIVE: ${patternThreats.length} NSFW threats in 24h - MAXIMUM SENSITIVITY`,
          timestamp: new Date(),
          severity: 'major'
        };
        adjustments.push(adjustment);
        console.log(`[AdaptiveProtection] 🚨 ${adjustment.reason}`);
      }
    }

    if (adjustments.length > 0) {
      this.adjustmentHistory.push(...adjustments);
      
      if (this.adjustmentHistory.length > this.MAX_HISTORY_SIZE) {
        this.adjustmentHistory = this.adjustmentHistory.slice(-this.MAX_HISTORY_SIZE);
      }
    }

    this.lastAnalysis = new Date();
    console.log(`[AdaptiveProtection] ✅ Made ${adjustments.length} security adjustments`);
    
    return adjustments;
  }

  async predictNextAttack(): Promise<AttackPrediction[]> {
    console.log('[AdaptiveProtection] 🔮 Predicting next attacks based on patterns...');
    
    const patterns = this.patternsLearned.length > 0 
      ? this.patternsLearned 
      : await this.analyzeHistoricalThreats();

    const predictions: AttackPrediction[] = [];
    const now = new Date();
    const currentHour = now.getHours();

    for (const pattern of patterns.slice(0, 5)) {
      const isPeakHour = pattern.peakHours.includes(currentHour);
      const nextPeakHour = pattern.peakHours.find(h => h > currentHour) || pattern.peakHours[0];
      
      let probability = pattern.frequency / 1000;
      if (isPeakHour) probability *= 2;
      if (pattern.avgSeverity === 'critical' || pattern.avgSeverity === 'high') probability *= 1.5;
      
      probability = Math.min(0.99, probability);

      const hoursUntilPeak = nextPeakHour >= currentHour 
        ? nextPeakHour - currentHour 
        : (24 - currentHour) + nextPeakHour;

      const timeframe = isPeakHour 
        ? 'NOW - Currently in peak attack window'
        : `${hoursUntilPeak}h - Next peak at ${nextPeakHour}:00`;

      const reasoning = [
        `${pattern.frequency} historical occurrences`,
        `Peak activity at ${pattern.peakHours.join(', ')}:00`,
        `${pattern.maliciousUsers.length} known malicious users`,
        pattern.commonTechniques.length > 0 ? `Common techniques: ${pattern.commonTechniques.slice(0, 2).join(', ')}` : null
      ].filter(Boolean).join(' | ');

      predictions.push({
        predictedType: pattern.type,
        probability,
        expectedTimeframe: timeframe,
        reasoning,
        confidence: probability * 100
      });
    }

    const sortedPredictions = predictions.sort((a, b) => b.probability - a.probability);
    
    for (const pred of sortedPredictions.slice(0, 3)) {
      console.log(`[AdaptiveProtection] 🎯 Prediction: ${pred.predictedType} - ${(pred.probability * 100).toFixed(1)}% probability`);
      console.log(`  → ${pred.expectedTimeframe}`);
    }

    return sortedPredictions;
  }

  async autoTuneThresholds(): Promise<ThresholdAdjustment[]> {
    console.log('[AdaptiveProtection] ⚙️ Auto-tuning detection thresholds...');
    
    const adjustments: ThresholdAdjustment[] = [];
    const threats = await storage.getThreats(500);
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const recentThreats = threats.filter(t => t.timestamp.getTime() > oneHourAgo);
    const dailyThreats = threats.filter(t => t.timestamp.getTime() > oneDayAgo);

    if (recentThreats.length > 20) {
      const spamConfig = this.securityEngine.getSpamConfig();
      const oldCooldown = spamConfig.cooldownPeriod;
      const newCooldown = Math.min(120, oldCooldown + 15);

      this.securityEngine.updateSpamConfig({
        cooldownPeriod: newCooldown
      });

      const adjustment: ThresholdAdjustment = {
        config: 'spam',
        parameter: 'cooldownPeriod',
        oldValue: oldCooldown,
        newValue: newCooldown,
        reason: `AGGRESSIVE: ${recentThreats.length} threats in 1 hour - increasing cooldown`,
        timestamp: new Date(),
        severity: 'moderate'
      };
      adjustments.push(adjustment);
      console.log(`[AdaptiveProtection] 🚨 ${adjustment.reason}`);
    }

    const criticalThreats = dailyThreats.filter(t => t.severity === 'critical' || t.severity === 'high');
    if (criticalThreats.length > 15) {
      const raidConfig = this.securityEngine.getRaidConfig();
      const oldMaxJoins = raidConfig.maxJoinsPerMinute;
      const newMaxJoins = Math.max(1, oldMaxJoins - 1);

      if (newMaxJoins !== oldMaxJoins) {
        this.securityEngine.updateRaidConfig({
          maxJoinsPerMinute: newMaxJoins
        });

        const adjustment: ThresholdAdjustment = {
          config: 'raid',
          parameter: 'maxJoinsPerMinute',
          oldValue: oldMaxJoins,
          newValue: newMaxJoins,
          reason: `AGGRESSIVE: ${criticalThreats.length} critical threats - reducing join tolerance`,
          timestamp: new Date(),
          severity: 'major'
        };
        adjustments.push(adjustment);
        console.log(`[AdaptiveProtection] 🚨 ${adjustment.reason}`);
      }
    }

    this.adjustmentHistory.push(...adjustments);
    console.log(`[AdaptiveProtection] ✅ Auto-tuned ${adjustments.length} thresholds`);

    return adjustments;
  }

  async generateLearningReport(): Promise<LearningReport> {
    console.log('[AdaptiveProtection] 📋 Generating learning report...');
    
    const patterns = await this.analyzeHistoricalThreats();
    const predictions = await this.predictNextAttack();
    const threats = await storage.getThreats(1000);

    const userThreatCounts = new Map<string, { count: number; types: Set<string> }>();
    for (const threat of threats) {
      if (threat.userId) {
        if (!userThreatCounts.has(threat.userId)) {
          userThreatCounts.set(threat.userId, { count: 0, types: new Set() });
        }
        const userData = userThreatCounts.get(threat.userId)!;
        userData.count++;
        userData.types.add(threat.type);
      }
    }

    const topMaliciousUsers = Array.from(userThreatCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([userId, data]) => ({
        userId,
        threatCount: data.count,
        types: Array.from(data.types)
      }));

    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const recentThreats = threats.filter(t => t.timestamp.getTime() > oneDayAgo);
    const criticalCount = recentThreats.filter(t => t.severity === 'critical').length;
    const highCount = recentThreats.filter(t => t.severity === 'high').length;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalCount > 10 || highCount > 30) riskLevel = 'critical';
    else if (criticalCount > 5 || highCount > 15) riskLevel = 'high';
    else if (recentThreats.length > 50) riskLevel = 'medium';

    const recommendations: string[] = [];
    
    if (criticalCount > 5) {
      recommendations.push('🚨 CRITICAL: Enable maximum protection mode across all servers');
    }
    if (patterns.some(p => p.type === 'raid' && p.frequency > 20)) {
      recommendations.push('🛡️ Consider implementing server lockdown during peak raid hours');
    }
    if (topMaliciousUsers.length > 5) {
      recommendations.push('⛔ Implement global blacklist for repeat offenders');
    }
    if (patterns.some(p => p.type === 'bypass' && p.frequency > 50)) {
      recommendations.push('🔒 Enhanced bypass detection needed - patterns evolving rapidly');
    }
    if (recentThreats.length > 100) {
      recommendations.push('📊 High threat volume - consider increasing monitoring frequency');
    }

    const recentAdjustments = this.adjustmentHistory.slice(-20);

    const report: LearningReport = {
      analysisDate: new Date(),
      threatsAnalyzed: threats.length,
      patternsDetected: patterns,
      predictions,
      adjustmentsMade: recentAdjustments,
      topMaliciousUsers,
      riskLevel,
      recommendations
    };

    console.log('[AdaptiveProtection] ✅ Learning report generated');
    console.log(`  → Risk Level: ${riskLevel.toUpperCase()}`);
    console.log(`  → Patterns Detected: ${patterns.length}`);
    console.log(`  → Adjustments Made: ${recentAdjustments.length}`);
    console.log(`  → Recommendations: ${recommendations.length}`);

    return report;
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastAnalysis: Date | null;
    patternsLearned: number;
    totalAdjustments: number;
    recentAdjustments: number;
    learningEnabled: boolean;
    details: string;
  }> {
    const now = Date.now();
    const lastAnalysisTime = this.lastAnalysis ? this.lastAnalysis.getTime() : 0;
    const hoursSinceLastAnalysis = (now - lastAnalysisTime) / (1000 * 60 * 60);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let details = 'Adaptive protection operating normally';

    if (!this.learningInterval) {
      status = 'unhealthy';
      details = 'Automatic learning is disabled';
    } else if (hoursSinceLastAnalysis > 3 && this.lastAnalysis) {
      status = 'degraded';
      details = `No analysis in ${hoursSinceLastAnalysis.toFixed(1)} hours`;
    }

    const recentAdjustments = this.adjustmentHistory.filter(
      adj => now - adj.timestamp.getTime() < (24 * 60 * 60 * 1000)
    ).length;

    return {
      status,
      lastAnalysis: this.lastAnalysis || null,
      patternsLearned: this.patternsLearned.length,
      totalAdjustments: this.adjustmentHistory.length,
      recentAdjustments,
      learningEnabled: !!this.learningInterval,
      details
    };
  }

  destroy(): void {
    if (this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = undefined;
    }
    console.log('[AdaptiveProtection] 🛑 AI Learning System stopped');
  }
}

let adaptiveProtectionInstance: AdaptiveProtection | null = null;

export function initializeAdaptiveProtection(securityEngine: SecurityEngine): AdaptiveProtection {
  if (!adaptiveProtectionInstance) {
    adaptiveProtectionInstance = new AdaptiveProtection(securityEngine);
  }
  return adaptiveProtectionInstance;
}

export function getAdaptiveProtection(): AdaptiveProtection | null {
  return adaptiveProtectionInstance;
}
