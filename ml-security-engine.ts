import { EventEmitter } from 'events';
import { storage } from '../storage';
import { getWebSocketService } from './websocket';
import { fileLogger } from './file-logger';
import type { Threat } from '@shared/schema';

export interface ThreatFeatures {
  userId: string;
  serverId: string;
  threatType: string;
  severity: string;
  hour: number;
  dayOfWeek: number;
  messageLength: number;
  mentionCount: number;
  linkCount: number;
  emojiCount: number;
  capsRatio: number;
  repeatCharRatio: number;
  accountAge: number;
  previousViolations: number;
  reputationScore: number;
  isNewMember: boolean;
  timestamp: number;
}

export interface ThreatPrediction {
  userId: string;
  serverId: string;
  predictedThreatType: string;
  probability: number;
  riskScore: number;
  confidence: number;
  reasoning: string[];
  suggestedAction: 'monitor' | 'warn' | 'restrict' | 'ban';
  features: Partial<ThreatFeatures>;
}

export interface UserRiskProfile {
  userId: string;
  serverId: string;
  overallRiskScore: number;
  threatHistory: Array<{ type: string; count: number; avgSeverity: number }>;
  behaviorPatterns: string[];
  predictionAccuracy: number;
  lastAssessment: Date;
  riskTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface LearningMetrics {
  totalSamples: number;
  threatDistribution: Record<string, number>;
  accuracyByType: Record<string, number>;
  falsePositiveRate: number;
  falseNegativeRate: number;
  lastTrainingTime: Date | null;
  modelVersion: string;
}

interface WeightedFeature {
  name: string;
  weight: number;
  threshold?: number;
}

interface ThreatModel {
  type: string;
  features: WeightedFeature[];
  baseThreshold: number;
  minConfidence: number;
}

export class MLSecurityEngine extends EventEmitter {
  private threatModels: Map<string, ThreatModel> = new Map();
  private userProfiles: Map<string, UserRiskProfile> = new Map();
  private featureCache: Map<string, ThreatFeatures[]> = new Map();
  private learningInterval?: NodeJS.Timeout;
  private metrics: LearningMetrics;
  private readonly MAX_CACHE_SIZE = 5000;
  private readonly LEARNING_INTERVAL_MS = 30 * 60 * 1000;

  constructor() {
    super();
    
    this.metrics = {
      totalSamples: 0,
      threatDistribution: {},
      accuracyByType: {},
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      lastTrainingTime: null,
      modelVersion: '1.0.0'
    };

    this.initializeModels();
    console.log('[MLSecurity] 🧠 ML Security Engine initialized - ADVANCED LEARNING MODE');
  }

  private initializeModels(): void {
    this.threatModels.set('spam', {
      type: 'spam',
      features: [
        { name: 'messageLength', weight: -0.1, threshold: 500 },
        { name: 'mentionCount', weight: 0.3, threshold: 5 },
        { name: 'linkCount', weight: 0.25, threshold: 3 },
        { name: 'repeatCharRatio', weight: 0.4, threshold: 0.3 },
        { name: 'capsRatio', weight: 0.2, threshold: 0.5 },
        { name: 'previousViolations', weight: 0.5 },
        { name: 'reputationScore', weight: -0.3 },
        { name: 'isNewMember', weight: 0.2 }
      ],
      baseThreshold: 0.6,
      minConfidence: 0.7
    });

    this.threatModels.set('raid', {
      type: 'raid',
      features: [
        { name: 'accountAge', weight: -0.4, threshold: 7 },
        { name: 'isNewMember', weight: 0.5 },
        { name: 'previousViolations', weight: 0.3 },
        { name: 'reputationScore', weight: -0.4 },
        { name: 'hour', weight: 0.1 }
      ],
      baseThreshold: 0.5,
      minConfidence: 0.65
    });

    this.threatModels.set('bypass', {
      type: 'bypass',
      features: [
        { name: 'repeatCharRatio', weight: 0.5 },
        { name: 'emojiCount', weight: 0.2, threshold: 10 },
        { name: 'previousViolations', weight: 0.6 },
        { name: 'reputationScore', weight: -0.3 }
      ],
      baseThreshold: 0.55,
      minConfidence: 0.75
    });

    this.threatModels.set('nsfw', {
      type: 'nsfw',
      features: [
        { name: 'previousViolations', weight: 0.7 },
        { name: 'reputationScore', weight: -0.4 },
        { name: 'linkCount', weight: 0.3 }
      ],
      baseThreshold: 0.5,
      minConfidence: 0.8
    });

    console.log('[MLSecurity] 📊 Initialized 4 threat models');
  }

  start(): void {
    this.learningInterval = setInterval(async () => {
      console.log('[MLSecurity] 🔄 Running periodic learning cycle...');
      await this.runLearningCycle();
    }, this.LEARNING_INTERVAL_MS);

    console.log('[MLSecurity] 🚀 ML Security Engine started');
    this.emit('started', { timestamp: Date.now() });
  }

  stop(): void {
    if (this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = undefined;
    }
    console.log('[MLSecurity] 🛑 ML Security Engine stopped');
    this.emit('stopped', { timestamp: Date.now() });
  }

  async extractFeatures(
    userId: string,
    serverId: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<ThreatFeatures> {
    const now = new Date();
    
    let previousViolations = 0;
    let reputationScore = 50;
    
    try {
      const threats = await storage.getThreats(100);
      previousViolations = threats.filter(t => t.userId === userId).length;
      
      const reputation = await storage.getUserReputation(userId, serverId);
      if (reputation) {
        reputationScore = reputation.score;
      }
    } catch (error) {
      console.warn('[MLSecurity] Failed to fetch user history:', error);
    }

    const mentionPattern = /<@!?\d+>/g;
    const linkPattern = /https?:\/\/[^\s]+/g;

    const mentions = content.match(mentionPattern) || [];
    const links = content.match(linkPattern) || [];
    const emojiCount = (content.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length;

    const upperCase = content.replace(/[^A-Z]/g, '').length;
    const lowerCase = content.replace(/[^a-z]/g, '').length;
    const totalLetters = upperCase + lowerCase;
    const capsRatio = totalLetters > 0 ? upperCase / totalLetters : 0;

    let repeatCharCount = 0;
    for (let i = 1; i < content.length; i++) {
      if (content[i] === content[i - 1]) repeatCharCount++;
    }
    const repeatCharRatio = content.length > 1 ? repeatCharCount / (content.length - 1) : 0;

    const accountAge = metadata.accountAge as number || 30;
    const isNewMember = metadata.isNewMember as boolean || false;

    const features: ThreatFeatures = {
      userId,
      serverId,
      threatType: 'unknown',
      severity: 'low',
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
      messageLength: content.length,
      mentionCount: mentions.length,
      linkCount: links.length,
      emojiCount,
      capsRatio,
      repeatCharRatio,
      accountAge,
      previousViolations,
      reputationScore,
      isNewMember,
      timestamp: now.getTime()
    };

    this.cacheFeatures(userId, features);

    return features;
  }

  private cacheFeatures(userId: string, features: ThreatFeatures): void {
    if (!this.featureCache.has(userId)) {
      this.featureCache.set(userId, []);
    }
    
    const userFeatures = this.featureCache.get(userId)!;
    userFeatures.push(features);

    if (userFeatures.length > 100) {
      userFeatures.shift();
    }

    if (this.featureCache.size > this.MAX_CACHE_SIZE) {
      const firstKey = this.featureCache.keys().next().value;
      if (firstKey) this.featureCache.delete(firstKey);
    }
  }

  async predictThreat(features: ThreatFeatures): Promise<ThreatPrediction[]> {
    const predictions: ThreatPrediction[] = [];

    for (const [threatType, model] of Array.from(this.threatModels.entries())) {
      const { score, contributions } = this.calculateThreatScore(features, model);
      
      if (score >= model.baseThreshold) {
        const confidence = Math.min(0.99, score / model.baseThreshold);
        
        if (confidence >= model.minConfidence) {
          const reasoning = contributions
            .filter(c => c.contribution > 0.1)
            .map(c => `${c.feature}: +${(c.contribution * 100).toFixed(1)}%`);

          let suggestedAction: ThreatPrediction['suggestedAction'] = 'monitor';
          if (score >= 0.9) suggestedAction = 'ban';
          else if (score >= 0.75) suggestedAction = 'restrict';
          else if (score >= 0.6) suggestedAction = 'warn';

          predictions.push({
            userId: features.userId,
            serverId: features.serverId,
            predictedThreatType: threatType,
            probability: score,
            riskScore: Math.round(score * 100),
            confidence,
            reasoning,
            suggestedAction,
            features: {
              previousViolations: features.previousViolations,
              reputationScore: features.reputationScore,
              mentionCount: features.mentionCount,
              linkCount: features.linkCount
            }
          });
        }
      }
    }

    predictions.sort((a, b) => b.probability - a.probability);
    
    return predictions;
  }

  private calculateThreatScore(
    features: ThreatFeatures,
    model: ThreatModel
  ): { score: number; contributions: Array<{ feature: string; contribution: number }> } {
    let score = 0;
    const contributions: Array<{ feature: string; contribution: number }> = [];

    for (const weightedFeature of model.features) {
      const featureValue = (features as any)[weightedFeature.name];
      if (featureValue === undefined) continue;

      let normalizedValue: number;

      if (typeof featureValue === 'boolean') {
        normalizedValue = featureValue ? 1 : 0;
      } else if (weightedFeature.threshold !== undefined) {
        normalizedValue = Math.min(1, featureValue / weightedFeature.threshold);
      } else if (weightedFeature.name === 'reputationScore') {
        normalizedValue = 1 - (featureValue / 100);
      } else if (weightedFeature.name === 'accountAge') {
        normalizedValue = Math.max(0, 1 - (featureValue / 30));
      } else {
        normalizedValue = Math.min(1, featureValue / 10);
      }

      const contribution = normalizedValue * weightedFeature.weight;
      score += contribution;

      contributions.push({
        feature: weightedFeature.name,
        contribution: Math.abs(contribution)
      });
    }

    score = Math.max(0, Math.min(1, score));

    contributions.sort((a, b) => b.contribution - a.contribution);

    return { score, contributions };
  }

  async assessUserRisk(userId: string, serverId: string): Promise<UserRiskProfile> {
    const cacheKey = `${userId}:${serverId}`;
    const cached = this.userProfiles.get(cacheKey);
    
    if (cached && Date.now() - cached.lastAssessment.getTime() < 5 * 60 * 1000) {
      return cached;
    }

    const threats = await storage.getThreats(500);
    const userThreats = threats.filter(t => t.userId === userId && t.serverId === serverId);

    const threatCounts = new Map<string, { count: number; severities: string[] }>();
    for (const threat of userThreats) {
      if (!threatCounts.has(threat.type)) {
        threatCounts.set(threat.type, { count: 0, severities: [] });
      }
      const data = threatCounts.get(threat.type)!;
      data.count++;
      data.severities.push(threat.severity);
    }

    const threatHistory = Array.from(threatCounts.entries()).map(([type, data]) => {
      const severityScores: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
      const avgSeverity = data.severities.reduce((sum, s) => sum + (severityScores[s] || 1), 0) / data.severities.length;
      return { type, count: data.count, avgSeverity };
    });

    const behaviorPatterns: string[] = [];
    
    if (userThreats.length >= 5) behaviorPatterns.push('repeat_offender');
    if (threatCounts.has('spam') && (threatCounts.get('spam')?.count || 0) >= 3) behaviorPatterns.push('spam_prone');
    if (threatCounts.has('bypass') && (threatCounts.get('bypass')?.count || 0) >= 2) behaviorPatterns.push('bypass_attempts');
    if (userThreats.some(t => t.severity === 'critical')) behaviorPatterns.push('critical_threat_history');

    const cachedFeatures = this.featureCache.get(userId) || [];
    let riskTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    
    if (cachedFeatures.length >= 5) {
      const recentAvg = cachedFeatures.slice(-3).reduce((sum, f) => sum + f.previousViolations, 0) / 3;
      const olderAvg = cachedFeatures.slice(0, 3).reduce((sum, f) => sum + f.previousViolations, 0) / 3;
      
      if (recentAvg > olderAvg * 1.2) riskTrend = 'increasing';
      else if (recentAvg < olderAvg * 0.8) riskTrend = 'decreasing';
    }

    const severityWeights: Record<string, number> = { low: 1, medium: 2, high: 4, critical: 8 };
    let overallRiskScore = 0;
    
    for (const threat of userThreats) {
      const weight = severityWeights[threat.severity] || 1;
      const recency = Math.max(0, 1 - (Date.now() - threat.timestamp.getTime()) / (30 * 24 * 60 * 60 * 1000));
      overallRiskScore += weight * (0.5 + 0.5 * recency);
    }
    
    overallRiskScore = Math.min(100, Math.round(overallRiskScore * 5));

    const profile: UserRiskProfile = {
      userId,
      serverId,
      overallRiskScore,
      threatHistory,
      behaviorPatterns,
      predictionAccuracy: 0.85,
      lastAssessment: new Date(),
      riskTrend
    };

    this.userProfiles.set(cacheKey, profile);

    return profile;
  }

  async runLearningCycle(): Promise<void> {
    console.log('[MLSecurity] 📚 Starting learning cycle...');
    
    try {
      const threats = await storage.getThreats(1000);
      
      if (threats.length < 50) {
        console.log('[MLSecurity] ⏳ Not enough data for learning (need 50+ samples)');
        return;
      }

      this.metrics.totalSamples = threats.length;
      this.metrics.threatDistribution = {};
      
      for (const threat of threats) {
        this.metrics.threatDistribution[threat.type] = 
          (this.metrics.threatDistribution[threat.type] || 0) + 1;
      }

      await this.adjustModelWeights(threats);

      this.metrics.lastTrainingTime = new Date();
      this.metrics.modelVersion = `1.0.${Date.now() % 1000}`;

      console.log('[MLSecurity] ✅ Learning cycle completed');
      console.log(`  → Samples analyzed: ${threats.length}`);
      console.log(`  → Threat distribution:`, this.metrics.threatDistribution);

      this.broadcastLearningUpdate();

    } catch (error) {
      console.error('[MLSecurity] ❌ Learning cycle failed:', error);
    }
  }

  private async adjustModelWeights(threats: Threat[]): Promise<void> {
    for (const [threatType, model] of Array.from(this.threatModels.entries())) {
      const typeThreats = threats.filter(t => t.type === threatType);
      
      if (typeThreats.length < 10) continue;

      const highSeverityRatio = typeThreats.filter(
        t => t.severity === 'high' || t.severity === 'critical'
      ).length / typeThreats.length;

      if (highSeverityRatio > 0.5) {
        model.baseThreshold = Math.max(0.4, model.baseThreshold - 0.05);
        console.log(`[MLSecurity] ⚠️ Lowered threshold for ${threatType} due to high severity ratio`);
      } else if (highSeverityRatio < 0.2) {
        model.baseThreshold = Math.min(0.8, model.baseThreshold + 0.02);
        console.log(`[MLSecurity] ✅ Raised threshold for ${threatType} due to low severity ratio`);
      }

      const recentThreats = typeThreats.filter(
        t => Date.now() - t.timestamp.getTime() < 24 * 60 * 60 * 1000
      );
      
      if (recentThreats.length > typeThreats.length * 0.3) {
        model.minConfidence = Math.max(0.5, model.minConfidence - 0.05);
        console.log(`[MLSecurity] 🚨 Lowered confidence requirement for ${threatType} due to surge`);
      }
    }
  }

  private broadcastLearningUpdate(): void {
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcast({
        type: 'adaptive_learning_update',
        data: {
          metrics: this.metrics,
          modelsUpdated: Array.from(this.threatModels.keys()),
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });
    }
  }

  getMetrics(): LearningMetrics {
    return { ...this.metrics };
  }

  getModelInfo(threatType: string): ThreatModel | undefined {
    return this.threatModels.get(threatType);
  }

  getAllModels(): Map<string, ThreatModel> {
    return new Map(this.threatModels);
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: LearningMetrics;
    modelsLoaded: number;
    cacheSize: number;
    profilesTracked: number;
  }> {
    const modelsLoaded = this.threatModels.size;
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (modelsLoaded === 0) {
      status = 'unhealthy';
    } else if (!this.metrics.lastTrainingTime) {
      status = 'degraded';
    }

    return {
      status,
      metrics: this.getMetrics(),
      modelsLoaded,
      cacheSize: this.featureCache.size,
      profilesTracked: this.userProfiles.size
    };
  }

  async exportModels(): Promise<Record<string, ThreatModel>> {
    const models: Record<string, ThreatModel> = {};
    for (const [key, model] of Array.from(this.threatModels.entries())) {
      models[key] = { ...model };
    }
    return models;
  }

  async importModels(models: Record<string, ThreatModel>): Promise<void> {
    for (const [key, model] of Object.entries(models)) {
      this.threatModels.set(key, model);
    }
    console.log(`[MLSecurity] 📥 Imported ${Object.keys(models).length} models`);
  }

  destroy(): void {
    this.stop();
    this.threatModels.clear();
    this.userProfiles.clear();
    this.featureCache.clear();
    console.log('[MLSecurity] 🗑️ ML Security Engine destroyed');
  }
}

let mlSecurityInstance: MLSecurityEngine | null = null;

export function getMLSecurityEngine(): MLSecurityEngine {
  if (!mlSecurityInstance) {
    mlSecurityInstance = new MLSecurityEngine();
  }
  return mlSecurityInstance;
}

export function initializeMLSecurity(): MLSecurityEngine {
  if (!mlSecurityInstance) {
    mlSecurityInstance = new MLSecurityEngine();
  }
  return mlSecurityInstance;
}

export function resetMLSecurity(): void {
  if (mlSecurityInstance) {
    mlSecurityInstance.destroy();
    mlSecurityInstance = null;
  }
}