import { EventEmitter } from 'events';

export interface HeartbeatConfig {
  intervalMs?: number;
  enabled?: boolean;
  logHeartbeats?: boolean;
}

export class HeartbeatService extends EventEmitter {
  private interval?: NodeJS.Timeout;
  private beatCount: number = 0;
  private startTime: number;
  private lastBeatTime: number;
  private config: Required<HeartbeatConfig>;
  private isRunning: boolean = false;

  constructor(config: HeartbeatConfig = {}) {
    super();
    this.config = {
      intervalMs: config.intervalMs || 15000,
      enabled: config.enabled !== false,
      logHeartbeats: config.logHeartbeats || false
    };
    this.startTime = Date.now();
    this.lastBeatTime = this.startTime;
  }

  start(): void {
    if (this.isRunning) {
      console.log('[Heartbeat] Service already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[Heartbeat] Service is disabled');
      return;
    }

    this.isRunning = true;
    console.log(`[Heartbeat] Starting service with ${this.config.intervalMs}ms interval`);

    this.interval = setInterval(() => {
      this.beat();
    }, this.config.intervalMs);

    this.beat();
    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    this.isRunning = false;
    console.log('[Heartbeat] Service stopped');
    this.emit('stopped');
  }

  private beat(): void {
    this.beatCount++;
    this.lastBeatTime = Date.now();

    const uptimeSeconds = Math.floor((this.lastBeatTime - this.startTime) / 1000);
    const memoryUsage = process.memoryUsage();
    const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    if (this.config.logHeartbeats) {
      console.log(
        `[Heartbeat] Beat #${this.beatCount} | Uptime: ${uptimeSeconds}s | Memory: ${memoryMB}MB`
      );
    }

    this.emit('beat', {
      count: this.beatCount,
      timestamp: this.lastBeatTime,
      uptime: uptimeSeconds,
      memory: {
        heapUsed: memoryMB,
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024)
      },
      process: {
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version
      }
    });
  }

  getStats() {
    const now = Date.now();
    return {
      isRunning: this.isRunning,
      beatCount: this.beatCount,
      uptime: Math.floor((now - this.startTime) / 1000),
      lastBeat: this.lastBeatTime,
      timeSinceLastBeat: Math.floor((now - this.lastBeatTime) / 1000),
      intervalMs: this.config.intervalMs,
      enabled: this.config.enabled
    };
  }

  updateInterval(intervalMs: number): void {
    if (intervalMs < 1000) {
      throw new Error('Interval must be at least 1000ms');
    }

    this.config.intervalMs = intervalMs;

    if (this.isRunning) {
      this.stop();
      this.start();
    }

    console.log(`[Heartbeat] Interval updated to ${intervalMs}ms`);
  }

  updateConfig(newConfig: HeartbeatConfig): void {
    const oldConfig = { ...this.config };
    const configChanged = 
      (newConfig.intervalMs !== undefined && newConfig.intervalMs !== oldConfig.intervalMs) ||
      (newConfig.enabled !== undefined && newConfig.enabled !== oldConfig.enabled) ||
      (newConfig.logHeartbeats !== undefined && newConfig.logHeartbeats !== oldConfig.logHeartbeats);

    if (!configChanged) {
      console.log('[Heartbeat] Config unchanged, skipping update');
      return;
    }

    if (newConfig.intervalMs !== undefined) {
      if (newConfig.intervalMs < 1000) {
        throw new Error('Interval must be at least 1000ms');
      }
      this.config.intervalMs = newConfig.intervalMs;
    }

    if (newConfig.enabled !== undefined) {
      this.config.enabled = newConfig.enabled;
    }

    if (newConfig.logHeartbeats !== undefined) {
      this.config.logHeartbeats = newConfig.logHeartbeats;
    }

    const wasRunning = this.isRunning;

    if (wasRunning) {
      console.log('[Heartbeat] Restarting service with new config...');
      this.stop();
    }

    if (this.config.enabled && wasRunning) {
      this.start();
    } else if (!this.config.enabled && wasRunning) {
      console.log('[Heartbeat] Service disabled by config update');
    }

    console.log('[Heartbeat] Config updated:', {
      intervalMs: this.config.intervalMs,
      enabled: this.config.enabled,
      logHeartbeats: this.config.logHeartbeats,
      wasRunning,
      isRunning: this.isRunning
    });
  }

  isAlive(): boolean {
    const timeSinceLastBeat = Date.now() - this.lastBeatTime;
    return this.isRunning && timeSinceLastBeat < this.config.intervalMs * 2;
  }

  getConfig(): Required<HeartbeatConfig> {
    return { ...this.config };
  }
}

let heartbeatInstance: HeartbeatService | null = null;

export function getHeartbeat(config?: HeartbeatConfig): HeartbeatService {
  if (!heartbeatInstance) {
    heartbeatInstance = new HeartbeatService(config);
    console.log('[Heartbeat] Created new singleton instance with config:', config);
  } else if (config) {
    console.log('[Heartbeat] Updating existing instance with new config');
    heartbeatInstance.updateConfig(config);
  }
  return heartbeatInstance;
}

export async function checkHeartbeatHealth() {
  const heartbeat = getHeartbeat();
  const stats = heartbeat.getStats();
  const isAlive = heartbeat.isAlive();

  return {
    healthy: isAlive,
    latency: 0,
    message: isAlive 
      ? `Heartbeat active (${stats.beatCount} beats)` 
      : 'Heartbeat service inactive',
    metadata: stats
  };
}
