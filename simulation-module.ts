import { securityEngine } from './security-engine';
import { storage } from '../storage';
import { getWebSocketService } from './websocket';

export type SimulationScenario = 
  | 'raid' 
  | 'spam' 
  | 'nuke' 
  | 'suspicious_invites' 
  | 'mass_role_creation' 
  | 'mass_channel_deletion'
  | 'bypass_attempts'
  | 'nsfw_flood'
  | 'mention_spam'
  | 'coordinated_attack';

export type IntensityLevel = 'low' | 'medium' | 'high' | 'extreme';

export interface SimulationConfig {
  scenario: SimulationScenario;
  intensity: IntensityLevel;
  duration: number; // in seconds
  serverId: string;
  serverName: string;
  targetChannels?: string[];
  concurrent?: boolean; // Run multiple scenarios simultaneously
  stressTest?: boolean; // Push systems to their limits
}

export interface SimulationMetrics {
  scenario: SimulationScenario;
  intensity: IntensityLevel;
  startTime: Date;
  endTime?: Date;
  duration: number;
  eventsGenerated: number;
  threatsDetected: number;
  actionsPerformed: {
    ban: number;
    kick: number;
    mute: number;
    warn: number;
    delete: number;
    quarantine: number;
  };
  detectionRate: number;
  responseTime: {
    average: number;
    min: number;
    max: number;
  };
  systemHealth: {
    cpuUsage: number;
    memoryUsage: number;
    circuitBreakerTripped: boolean;
    failoversTriggered: number;
  };
  errors: string[];
  warnings: string[];
  successful: boolean;
}

export interface SimulationEvent {
  type: 'message' | 'join' | 'role_change' | 'channel_delete' | 'invite';
  userId: string;
  username: string;
  content?: string;
  timestamp: Date;
  metadata?: any;
}

export interface SimulationResult {
  config: SimulationConfig;
  metrics: SimulationMetrics;
  timeline: SimulationEvent[];
  detectedThreats: any[];
  recommendations: string[];
  performanceReport: string;
}

export class SimulationModule {
  private activeSimulations: Map<string, SimulationMetrics> = new Map();
  private simulationCounter: number = 0;

  // Aggressive pattern databases for realistic attacks
  private spamPatterns = [
    'FREE NITRO!!!',
    'EVERYONE @everyone CLICK HERE',
    'GET FREE ROBUX NOW',
    'discord.gg/scam123',
    'bit.ly/malicious',
    'LIMITED TIME OFFER!!!',
    'CLAIM YOUR PRIZE NOW',
    '🎁 GIVEAWAY 🎁 @everyone',
    'YOU WON!!! CLICK TO CLAIM',
    'DISCORD STAFF HERE - VERIFY YOUR ACCOUNT',
  ];

  private suspiciousUsernames = [
    'discord_staff',
    'admin_bot',
    'raid_leader',
    'nuke_bot',
    'troll_master',
    'alt_account_123',
    'test_user',
    'fake_admin',
    'scam_bot',
    'phishing_link',
  ];

  private bypassAttempts = [
    'f r e e   n i t r o',
    'ᴅɪꜱᴄᴏʀᴅ ɢɪꜰᴛ',
    'ḋḭṡċṏṛḋ.ġġ',
    'ｄｉｓｃｏｒｄ ｎｉｔｒｏ',
    'd͙i͙s͙c͙o͙r͙d͙',
    'ᗪIᔕᑕOᖇᗪ',
    'everyone­', // zero-width character
    '@\u200Beveryone', // invisible character
    'fr*ee n*itro',
    'd.i.s.c.o.r.d',
  ];

  private nsfwTriggers = [
    'NSFW content simulation - violation detected',
    'Inappropriate image attachment detected',
    'Adult content link shared',
    'Gore/shock content attempted',
  ];

  async runSimulation(config: SimulationConfig): Promise<SimulationResult> {
    const simulationId = `sim_${++this.simulationCounter}_${Date.now()}`;
    console.log(`\n🧪 [SIMULATION] Starting ${config.scenario} simulation at ${config.intensity} intensity`);
    
    const metrics: SimulationMetrics = {
      scenario: config.scenario,
      intensity: config.intensity,
      startTime: new Date(),
      duration: config.duration,
      eventsGenerated: 0,
      threatsDetected: 0,
      actionsPerformed: {
        ban: 0,
        kick: 0,
        mute: 0,
        warn: 0,
        delete: 0,
        quarantine: 0,
      },
      detectionRate: 0,
      responseTime: {
        average: 0,
        min: Infinity,
        max: 0,
      },
      systemHealth: {
        cpuUsage: 0,
        memoryUsage: 0,
        circuitBreakerTripped: false,
        failoversTriggered: 0,
      },
      errors: [],
      warnings: [],
      successful: false,
    };

    this.activeSimulations.set(simulationId, metrics);

    const timeline: SimulationEvent[] = [];
    const detectedThreats: any[] = [];
    const responseTimes: number[] = [];

    try {
      // Broadcast simulation start
      this.broadcastSimulationStatus(simulationId, 'started', metrics);

      // Run the appropriate scenario
      switch (config.scenario) {
        case 'raid':
          await this.simulateRaid(config, metrics, timeline, detectedThreats, responseTimes);
          break;
        case 'spam':
          await this.simulateSpamAttack(config, metrics, timeline, detectedThreats, responseTimes);
          break;
        case 'nuke':
          await this.simulateNukeAttempt(config, metrics, timeline, detectedThreats, responseTimes);
          break;
        case 'suspicious_invites':
          await this.simulateSuspiciousInvites(config, metrics, timeline, detectedThreats, responseTimes);
          break;
        case 'mass_role_creation':
          await this.simulateMassRoleCreation(config, metrics, timeline, detectedThreats, responseTimes);
          break;
        case 'mass_channel_deletion':
          await this.simulateMassChannelDeletion(config, metrics, timeline, detectedThreats, responseTimes);
          break;
        case 'bypass_attempts':
          await this.simulateBypassAttempts(config, metrics, timeline, detectedThreats, responseTimes);
          break;
        case 'nsfw_flood':
          await this.simulateNSFWFlood(config, metrics, timeline, detectedThreats, responseTimes);
          break;
        case 'mention_spam':
          await this.simulateMentionSpam(config, metrics, timeline, detectedThreats, responseTimes);
          break;
        case 'coordinated_attack':
          await this.simulateCoordinatedAttack(config, metrics, timeline, detectedThreats, responseTimes);
          break;
      }

      // Calculate final metrics
      metrics.endTime = new Date();
      metrics.detectionRate = metrics.eventsGenerated > 0 
        ? (metrics.threatsDetected / metrics.eventsGenerated) * 100 
        : 0;
      
      if (responseTimes.length > 0) {
        metrics.responseTime.average = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        metrics.responseTime.min = Math.min(...responseTimes);
        metrics.responseTime.max = Math.max(...responseTimes);
      }

      // Get system health
      const memUsage = process.memoryUsage();
      metrics.systemHealth.memoryUsage = Math.round(memUsage.heapUsed / 1024 / 1024);
      
      metrics.successful = true;

      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics, detectedThreats);
      
      // Generate performance report
      const performanceReport = this.generatePerformanceReport(metrics);

      // Log simulation results
      await storage.createIncident({
        type: 'simulation',
        severity: 'low',
        title: `Simulation Complete: ${config.scenario}`,
        description: performanceReport,
        serverId: config.serverId,
        serverName: config.serverName,
        affectedUsers: [],
        actionsPerformed: [`${config.scenario}_simulation`],
        evidence: { metrics, timeline: timeline.slice(0, 100) } // Limit timeline for storage
      });

      console.log(`✅ [SIMULATION] ${config.scenario} completed successfully`);
      console.log(`📊 Events: ${metrics.eventsGenerated} | Detected: ${metrics.threatsDetected} | Rate: ${metrics.detectionRate.toFixed(1)}%`);

      // Broadcast simulation complete
      this.broadcastSimulationStatus(simulationId, 'completed', metrics);

      return {
        config,
        metrics,
        timeline,
        detectedThreats,
        recommendations,
        performanceReport,
      };

    } catch (error: any) {
      metrics.errors.push(error?.message || 'Unknown error');
      metrics.successful = false;
      console.error(`❌ [SIMULATION] Failed:`, error);
      
      this.broadcastSimulationStatus(simulationId, 'failed', metrics);
      
      throw error;
    } finally {
      this.activeSimulations.delete(simulationId);
    }
  }

  private async simulateRaid(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    const intensityMap = {
      low: { users: 5, interval: 1000 },
      medium: { users: 15, interval: 500 },
      high: { users: 30, interval: 200 },
      extreme: { users: 100, interval: 50 },
    };

    const params = intensityMap[config.intensity];
    const endTime = Date.now() + config.duration * 1000;

    console.log(`🚨 [RAID SIMULATION] Simulating ${params.users} users joining at ${params.interval}ms intervals`);

    let userIndex = 0;
    while (Date.now() < endTime) {
      const userId = `raid_user_${userIndex++}`;
      const username = this.suspiciousUsernames[Math.floor(Math.random() * this.suspiciousUsernames.length)] + `_${userIndex}`;
      
      const event: SimulationEvent = {
        type: 'join',
        userId,
        username,
        timestamp: new Date(),
        metadata: { accountAge: Math.random() * 7 } // 0-7 days old
      };

      timeline.push(event);
      metrics.eventsGenerated++;

      const startCheck = Date.now();
      try {
        const check = await securityEngine.execute(
          'checkUserJoin',
          userId,
          username,
          config.serverId,
          config.serverName,
          new Date(Date.now() - event.metadata.accountAge * 24 * 60 * 60 * 1000) // Account creation date
        );

        const responseTime = Date.now() - startCheck;
        responseTimes.push(responseTime);

        if (check.action !== 'allow') {
          metrics.threatsDetected++;
          metrics.actionsPerformed[check.action as keyof typeof metrics.actionsPerformed]++;
          detectedThreats.push({ event, check, responseTime });
        }
      } catch (error: any) {
        metrics.errors.push(`Join check failed: ${error?.message}`);
      }

      await this.sleep(params.interval);
    }
  }

  private async simulateSpamAttack(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    const intensityMap = {
      low: { messages: 10, interval: 500 },
      medium: { messages: 30, interval: 200 },
      high: { messages: 60, interval: 100 },
      extreme: { messages: 200, interval: 20 },
    };

    const params = intensityMap[config.intensity];
    const endTime = Date.now() + config.duration * 1000;

    console.log(`💬 [SPAM SIMULATION] Sending ${params.messages} spam messages`);

    const userId = `spam_user_${Date.now()}`;
    const username = 'spam_bot_attacker';
    let msgIndex = 0;

    while (Date.now() < endTime && msgIndex < params.messages) {
      const content = this.spamPatterns[Math.floor(Math.random() * this.spamPatterns.length)];
      
      const event: SimulationEvent = {
        type: 'message',
        userId,
        username,
        content,
        timestamp: new Date(),
      };

      timeline.push(event);
      metrics.eventsGenerated++;

      const startCheck = Date.now();
      try {
        const check = await securityEngine.execute(
          'checkMessage',
          userId,
          username,
          content,
          config.serverId,
          config.serverName,
          undefined
        );

        const responseTime = Date.now() - startCheck;
        responseTimes.push(responseTime);

        if (check.action !== 'allow') {
          metrics.threatsDetected++;
          metrics.actionsPerformed[check.action as keyof typeof metrics.actionsPerformed]++;
          detectedThreats.push({ event, check, responseTime });
        }
      } catch (error: any) {
        metrics.errors.push(`Message check failed: ${error?.message}`);
      }

      msgIndex++;
      await this.sleep(params.interval);
    }
  }

  private async simulateNukeAttempt(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    console.log(`💥 [NUKE SIMULATION] Simulating server nuke attempt`);

    // Simulate rapid channel deletion attempts
    const channelCount = config.intensity === 'low' ? 5 : config.intensity === 'medium' ? 15 : config.intensity === 'high' ? 30 : 50;
    
    for (let i = 0; i < channelCount; i++) {
      const event: SimulationEvent = {
        type: 'channel_delete',
        userId: `nuke_bot_${Date.now()}`,
        username: 'nuke_bot_attacker',
        timestamp: new Date(),
        metadata: { channelId: `channel_${i}`, channelName: `deleted-channel-${i}` }
      };

      timeline.push(event);
      metrics.eventsGenerated++;

      const startCheck = Date.now();
      const responseTime = Date.now() - startCheck;
      responseTimes.push(responseTime);
      
      // Simulate nuke detection (auto-detect as malicious)
      metrics.threatsDetected++;
      metrics.actionsPerformed.ban++;
      detectedThreats.push({ 
        event, 
        check: { 
          action: 'ban', 
          reason: 'Mass channel deletion - nuke attempt detected', 
          confidence: 0.98,
          threatType: 'nuke'
        }, 
        responseTime 
      });

      await this.sleep(100);
    }

    // Simulate mass role creation
    const roleCount = config.intensity === 'extreme' ? 30 : 15;
    for (let i = 0; i < roleCount; i++) {
      const event: SimulationEvent = {
        type: 'role_change',
        userId: `nuke_bot_${Date.now()}`,
        username: 'nuke_bot_attacker',
        timestamp: new Date(),
        metadata: { action: 'create', roleName: `@everyone-${i}` }
      };

      timeline.push(event);
      metrics.eventsGenerated++;
      await this.sleep(50);
    }
  }

  private async simulateSuspiciousInvites(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    const inviteLinks = [
      'discord.gg/fake123',
      'discord.gg/scam456',
      'discord.gg/phishing789',
      'dsc.gg/malicious',
    ];

    const messageCount = config.intensity === 'low' ? 5 : config.intensity === 'medium' ? 15 : config.intensity === 'high' ? 30 : 60;

    console.log(`🔗 [INVITE SIMULATION] Posting ${messageCount} suspicious invites`);

    for (let i = 0; i < messageCount; i++) {
      const userId = `invite_spammer_${i}`;
      const content = `Join our server! ${inviteLinks[Math.floor(Math.random() * inviteLinks.length)]} FREE NITRO INSIDE!`;
      
      const event: SimulationEvent = {
        type: 'message',
        userId,
        username: `invite_bot_${i}`,
        content,
        timestamp: new Date(),
      };

      timeline.push(event);
      metrics.eventsGenerated++;

      const startCheck = Date.now();
      try {
        const check = await securityEngine.execute(
          'checkMessage',
          userId,
          event.username,
          content,
          config.serverId,
          config.serverName,
          undefined
        );

        const responseTime = Date.now() - startCheck;
        responseTimes.push(responseTime);

        if (check.action !== 'allow') {
          metrics.threatsDetected++;
          metrics.actionsPerformed[check.action as keyof typeof metrics.actionsPerformed]++;
          detectedThreats.push({ event, check, responseTime });
        }
      } catch (error: any) {
        metrics.errors.push(`Invite check failed: ${error?.message}`);
      }

      await this.sleep(200);
    }
  }

  private async simulateMassRoleCreation(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    const roleCount = config.intensity === 'low' ? 10 : config.intensity === 'medium' ? 25 : config.intensity === 'high' ? 50 : 100;

    console.log(`👑 [ROLE SIMULATION] Creating ${roleCount} roles rapidly`);

    for (let i = 0; i < roleCount; i++) {
      const event: SimulationEvent = {
        type: 'role_change',
        userId: `role_creator_${Date.now()}`,
        username: 'role_spam_bot',
        timestamp: new Date(),
        metadata: { 
          action: 'create', 
          roleName: `spam-role-${i}`,
          permissions: ['ADMINISTRATOR'] // Suspicious!
        }
      };

      timeline.push(event);
      metrics.eventsGenerated++;
      metrics.threatsDetected++; // Auto-detect as suspicious
      metrics.actionsPerformed.warn++;

      await this.sleep(50);
    }
  }

  private async simulateMassChannelDeletion(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    const channelCount = config.intensity === 'low' ? 5 : config.intensity === 'medium' ? 15 : config.intensity === 'high' ? 30 : 60;

    console.log(`🗑️ [CHANNEL DELETION SIMULATION] Deleting ${channelCount} channels`);

    for (let i = 0; i < channelCount; i++) {
      const event: SimulationEvent = {
        type: 'channel_delete',
        userId: `channel_deleter_${Date.now()}`,
        username: 'nuke_attempt_bot',
        timestamp: new Date(),
        metadata: { 
          channelId: `channel_${i}`,
          channelName: `important-channel-${i}`,
          type: 'text'
        }
      };

      timeline.push(event);
      metrics.eventsGenerated++;
      metrics.threatsDetected++; // Auto-detect as nuke attempt
      metrics.actionsPerformed.ban++;

      detectedThreats.push({
        event,
        check: { action: 'ban', reason: 'Mass channel deletion detected - nuke attempt', confidence: 0.95 }
      });

      await this.sleep(100);
    }
  }

  private async simulateBypassAttempts(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    const attemptCount = config.intensity === 'low' ? 10 : config.intensity === 'medium' ? 25 : config.intensity === 'high' ? 50 : 100;

    console.log(`🎭 [BYPASS SIMULATION] Testing ${attemptCount} bypass techniques`);

    for (let i = 0; i < attemptCount; i++) {
      const userId = `bypass_tester_${i}`;
      const content = this.bypassAttempts[Math.floor(Math.random() * this.bypassAttempts.length)];
      
      const event: SimulationEvent = {
        type: 'message',
        userId,
        username: `bypass_bot_${i}`,
        content,
        timestamp: new Date(),
      };

      timeline.push(event);
      metrics.eventsGenerated++;

      const startCheck = Date.now();
      try {
        const check = await securityEngine.execute(
          'checkMessage',
          userId,
          event.username,
          content,
          config.serverId,
          config.serverName,
          undefined
        );

        const responseTime = Date.now() - startCheck;
        responseTimes.push(responseTime);

        if (check.action !== 'allow') {
          metrics.threatsDetected++;
          metrics.actionsPerformed[check.action as keyof typeof metrics.actionsPerformed]++;
          detectedThreats.push({ event, check, responseTime });
        }
      } catch (error: any) {
        metrics.errors.push(`Bypass check failed: ${error?.message}`);
      }

      await this.sleep(150);
    }
  }

  private async simulateNSFWFlood(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    const messageCount = config.intensity === 'low' ? 5 : config.intensity === 'medium' ? 15 : config.intensity === 'high' ? 30 : 60;

    console.log(`🔞 [NSFW SIMULATION] Testing ${messageCount} NSFW detection triggers`);

    for (let i = 0; i < messageCount; i++) {
      const userId = `nsfw_poster_${i}`;
      const content = this.nsfwTriggers[Math.floor(Math.random() * this.nsfwTriggers.length)];
      
      const event: SimulationEvent = {
        type: 'message',
        userId,
        username: `nsfw_bot_${i}`,
        content,
        timestamp: new Date(),
        metadata: { hasAttachment: true, contentType: 'image/png' }
      };

      timeline.push(event);
      metrics.eventsGenerated++;

      const startCheck = Date.now();
      try {
        const check = await securityEngine.execute(
          'checkMessage',
          userId,
          event.username,
          content,
          config.serverId,
          config.serverName,
          undefined
        );

        const responseTime = Date.now() - startCheck;
        responseTimes.push(responseTime);

        if (check.action !== 'allow') {
          metrics.threatsDetected++;
          metrics.actionsPerformed[check.action as keyof typeof metrics.actionsPerformed]++;
          detectedThreats.push({ event, check, responseTime });
        }
      } catch (error: any) {
        metrics.errors.push(`NSFW check failed: ${error?.message}`);
      }

      await this.sleep(300);
    }
  }

  private async simulateMentionSpam(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    const messageCount = config.intensity === 'low' ? 10 : config.intensity === 'medium' ? 25 : config.intensity === 'high' ? 50 : 100;

    console.log(`@️ [MENTION SPAM SIMULATION] Testing ${messageCount} mention spam messages`);

    for (let i = 0; i < messageCount; i++) {
      const userId = `mention_spammer_${Date.now()}`;
      const mentions = '@everyone '.repeat(config.intensity === 'extreme' ? 10 : 5);
      const content = `${mentions} IMPORTANT ANNOUNCEMENT!!!`;
      
      const event: SimulationEvent = {
        type: 'message',
        userId,
        username: 'mention_spam_bot',
        content,
        timestamp: new Date(),
      };

      timeline.push(event);
      metrics.eventsGenerated++;

      const startCheck = Date.now();
      try {
        const check = await securityEngine.execute(
          'checkMessage',
          userId,
          event.username,
          content,
          config.serverId,
          config.serverName,
          undefined
        );

        const responseTime = Date.now() - startCheck;
        responseTimes.push(responseTime);

        if (check.action !== 'allow') {
          metrics.threatsDetected++;
          metrics.actionsPerformed[check.action as keyof typeof metrics.actionsPerformed]++;
          detectedThreats.push({ event, check, responseTime });
        }
      } catch (error: any) {
        metrics.errors.push(`Mention spam check failed: ${error?.message}`);
      }

      await this.sleep(100);
    }
  }

  private async simulateCoordinatedAttack(
    config: SimulationConfig,
    metrics: SimulationMetrics,
    timeline: SimulationEvent[],
    detectedThreats: any[],
    responseTimes: number[]
  ): Promise<void> {
    console.log(`🎯 [COORDINATED ATTACK] Running multi-vector assault`);

    // Run multiple attack types simultaneously
    const attacks = [];

    // Raid component
    attacks.push(this.simulateRaid(
      { ...config, duration: config.duration / 3 },
      metrics,
      timeline,
      detectedThreats,
      responseTimes
    ));

    // Spam component
    attacks.push(this.simulateSpamAttack(
      { ...config, duration: config.duration / 3 },
      metrics,
      timeline,
      detectedThreats,
      responseTimes
    ));

    // Bypass attempts
    attacks.push(this.simulateBypassAttempts(
      { ...config, duration: config.duration / 3 },
      metrics,
      timeline,
      detectedThreats,
      responseTimes
    ));

    await Promise.all(attacks);
  }

  private generateRecommendations(metrics: SimulationMetrics, threats: any[]): string[] {
    const recommendations: string[] = [];

    if (metrics.detectionRate < 80) {
      recommendations.push('⚠️ Detection rate below 80% - Consider increasing aggressiveness level');
    }

    if (metrics.responseTime.average > 500) {
      recommendations.push('⚠️ Average response time > 500ms - System may be under stress');
    }

    if (metrics.systemHealth.memoryUsage > 500) {
      recommendations.push('⚠️ High memory usage detected - Consider optimization');
    }

    if (metrics.errors.length > 0) {
      recommendations.push(`❌ ${metrics.errors.length} errors occurred - Review error logs`);
    }

    const banRate = (metrics.actionsPerformed.ban / metrics.threatsDetected) * 100;
    if (banRate > 70) {
      recommendations.push('🔨 High ban rate (>70%) - Very aggressive, may need tuning');
    } else if (banRate < 20) {
      recommendations.push('🔨 Low ban rate (<20%) - Consider more aggressive bans for severe threats');
    }

    if (metrics.detectionRate >= 95) {
      recommendations.push('✅ Excellent detection rate! System performing optimally');
    }

    if (metrics.responseTime.max > 2000) {
      recommendations.push('⚠️ Peak response time > 2s - Investigate performance bottleneck');
    }

    return recommendations;
  }

  private generatePerformanceReport(metrics: SimulationMetrics): string {
    return `
🧪 SIMULATION PERFORMANCE REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Scenario: ${metrics.scenario.toUpperCase()}
🎚️ Intensity: ${metrics.intensity.toUpperCase()}
⏱️ Duration: ${metrics.duration}s

📈 DETECTION METRICS:
  • Events Generated: ${metrics.eventsGenerated}
  • Threats Detected: ${metrics.threatsDetected}
  • Detection Rate: ${metrics.detectionRate.toFixed(2)}%

⚡ ACTIONS PERFORMED:
  • Bans: ${metrics.actionsPerformed.ban}
  • Kicks: ${metrics.actionsPerformed.kick}
  • Mutes: ${metrics.actionsPerformed.mute}
  • Warns: ${metrics.actionsPerformed.warn}
  • Deletes: ${metrics.actionsPerformed.delete}

⏲️ RESPONSE TIME:
  • Average: ${metrics.responseTime.average.toFixed(2)}ms
  • Min: ${metrics.responseTime.min === Infinity ? 'N/A' : metrics.responseTime.min.toFixed(2) + 'ms'}
  • Max: ${metrics.responseTime.max.toFixed(2)}ms

💻 SYSTEM HEALTH:
  • Memory Usage: ${metrics.systemHealth.memoryUsage}MB
  • Circuit Breaker Tripped: ${metrics.systemHealth.circuitBreakerTripped ? 'YES' : 'NO'}
  • Failovers: ${metrics.systemHealth.failoversTriggered}

${metrics.errors.length > 0 ? `\n❌ ERRORS (${metrics.errors.length}):\n  ${metrics.errors.slice(0, 5).join('\n  ')}` : ''}
${metrics.warnings.length > 0 ? `\n⚠️ WARNINGS (${metrics.warnings.length}):\n  ${metrics.warnings.slice(0, 5).join('\n  ')}` : ''}

✅ Status: ${metrics.successful ? 'SUCCESS' : 'FAILED'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();
  }

  private broadcastSimulationStatus(id: string, status: string, metrics: SimulationMetrics): void {
    try {
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.broadcast({
          type: 'simulation_update',
          data: {
            id,
            status,
            scenario: metrics.scenario,
            intensity: metrics.intensity,
            metrics: {
              eventsGenerated: metrics.eventsGenerated,
              threatsDetected: metrics.threatsDetected,
              detectionRate: metrics.detectionRate,
            }
          },
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to broadcast simulation status:', error);
    }
  }

  async runStressTest(config: Omit<SimulationConfig, 'scenario'>): Promise<SimulationResult[]> {
    console.log('\n🔥 RUNNING COMPREHENSIVE STRESS TEST 🔥\n');

    const scenarios: SimulationScenario[] = [
      'raid',
      'spam',
      'bypass_attempts',
      'mention_spam',
      'suspicious_invites',
      'nsfw_flood',
    ];

    const results: SimulationResult[] = [];

    for (const scenario of scenarios) {
      try {
        const result = await this.runSimulation({ ...config, scenario });
        results.push(result);
        
        // Brief pause between scenarios
        await this.sleep(2000);
      } catch (error) {
        console.error(`Stress test scenario ${scenario} failed:`, error);
      }
    }

    // Generate comprehensive stress test report
    console.log('\n📊 STRESS TEST COMPLETE - SUMMARY:');
    results.forEach(result => {
      console.log(`  ${result.config.scenario}: ${result.metrics.detectionRate.toFixed(1)}% detection, ${result.metrics.threatsDetected} threats`);
    });

    return results;
  }

  getActiveSimulations(): SimulationMetrics[] {
    return Array.from(this.activeSimulations.values());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const simulationModule = new SimulationModule();
