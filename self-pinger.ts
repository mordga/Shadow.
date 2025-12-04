/**
 * Self-Pinger Service - ENHANCED VERSION
 * Aggressively keeps the bot alive by making internal HTTP requests
 * Includes Discord bot health verification and auto-reconnection
 * Does NOT depend on external services like OriHost or UptimeRobot
 */

export interface SelfPingerConfig {
  enabled?: boolean;
  intervalMs?: number;
  port?: number;
  logPings?: boolean;
  checkDiscordBot?: boolean;
  autoReconnect?: boolean;
}

export interface PingResult {
  success: boolean;
  serverAlive: boolean;
  discordBotAlive: boolean;
  reconnectAttempted: boolean;
  timestamp: string;
}

export class SelfPingerService {
  private interval?: NodeJS.Timeout;
  private pingCount: number = 0;
  private successfulPings: number = 0;
  private failedPings: number = 0;
  private reconnectAttempts: number = 0;
  private lastSuccessfulPing: number = 0;
  private config: Required<SelfPingerConfig>;
  private isRunning: boolean = false;

  constructor(config: SelfPingerConfig = {}) {
    this.config = {
      enabled: config.enabled !== false,
      intervalMs: config.intervalMs || 15000, // 15 seconds - more aggressive
      port: config.port || 5000,
      logPings: config.logPings || false,
      checkDiscordBot: config.checkDiscordBot !== false,
      autoReconnect: config.autoReconnect !== false
    };
  }

  start(): void {
    if (this.isRunning) return;

    if (!this.config.enabled) {
      console.log('[SelfPinger] Service is disabled');
      return;
    }

    this.isRunning = true;
    console.log(
      `[SelfPinger] 🔄 Enhanced self-pinger started (${this.config.intervalMs}ms interval) - Bot will stay alive with auto-reconnection`
    );

    this.interval = setInterval(() => {
      this.ping();
    }, this.config.intervalMs);

    // Initial ping
    this.ping();
  }

  stop(): void {
    if (!this.isRunning) return;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    this.isRunning = false;
    console.log('[SelfPinger] Service stopped');
  }

  private async ping(): Promise<PingResult> {
    this.pingCount++;
    const timestamp = new Date().toISOString();
    let serverAlive = false;
    let discordBotAlive = false;
    let reconnectAttempted = false;

    try {
      // Step 1: Ping the server to keep it alive
      const serverResponse = await fetch(`http://localhost:${this.config.port}/api/ping`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      serverAlive = serverResponse.ok;

      if (serverAlive) {
        this.successfulPings++;
        this.lastSuccessfulPing = Date.now();

        if (this.config.logPings) {
          console.log(`[SelfPinger] Ping #${this.pingCount} - ✅ Server alive`);
        }
      } else {
        this.failedPings++;
        console.warn(`[SelfPinger] Ping #${this.pingCount} returned ${serverResponse.status}`);
      }

      // Step 2: Check Discord bot health if enabled
      if (this.config.checkDiscordBot && serverAlive) {
        try {
          const statusResponse = await fetch(`http://localhost:${this.config.port}/api/status`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            // Check botConnected field from /api/status endpoint
            discordBotAlive = statusData.botConnected === true;

            if (!discordBotAlive && this.config.autoReconnect) {
              // Bot is offline, attempt reconnection (but only once every 5 pings to avoid spam)
              if (this.pingCount % 5 === 0) {
                reconnectAttempted = await this.attemptBotReconnection();
              }
            }

            if (this.config.logPings) {
              console.log(
                `[SelfPinger] Ping #${this.pingCount} - Discord: ${discordBotAlive ? '✅ Online' : '⚠️ Offline'}`
              );
            }
          }
        } catch (statusError) {
          console.warn('[SelfPinger] Could not check Discord status');
        }
      }

    } catch (error) {
      this.failedPings++;
      console.error(
        `[SelfPinger] Ping #${this.pingCount} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Emergency check: If no successful ping in 2 minutes, log critical warning
    const timeSinceLastSuccess = Date.now() - this.lastSuccessfulPing;
    if (this.lastSuccessfulPing > 0 && timeSinceLastSuccess > 120000) {
      console.error(`[SelfPinger] ⚠️ CRITICAL: No successful ping in ${Math.floor(timeSinceLastSuccess / 1000)}s`);
    }

    return {
      success: serverAlive,
      serverAlive,
      discordBotAlive,
      reconnectAttempted,
      timestamp
    };
  }

  private async attemptBotReconnection(): Promise<boolean> {
    this.reconnectAttempts++;
    console.log(`[SelfPinger] 🔄 Attempting Discord bot reconnection (attempt #${this.reconnectAttempts})`);

    try {
      const reconnectResponse = await fetch(`http://localhost:${this.config.port}/api/bot/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });

      if (reconnectResponse.ok) {
        console.log('[SelfPinger] ✅ Discord bot reconnection initiated successfully');
        return true;
      } else {
        console.warn(`[SelfPinger] ⚠️ Reconnection request returned ${reconnectResponse.status}`);
        return false;
      }
    } catch (error) {
      console.error(`[SelfPinger] ❌ Reconnection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  getStats() {
    const uptime = this.lastSuccessfulPing > 0 
      ? Date.now() - this.lastSuccessfulPing 
      : 0;

    return {
      isRunning: this.isRunning,
      pingCount: this.pingCount,
      successfulPings: this.successfulPings,
      failedPings: this.failedPings,
      reconnectAttempts: this.reconnectAttempts,
      intervalMs: this.config.intervalMs,
      enabled: this.config.enabled,
      checkDiscordBot: this.config.checkDiscordBot,
      autoReconnect: this.config.autoReconnect,
      lastSuccessfulPing: this.lastSuccessfulPing > 0 ? new Date(this.lastSuccessfulPing).toISOString() : null,
      timeSinceLastPing: uptime
    };
  }

  updateInterval(intervalMs: number): void {
    if (intervalMs < 5000) {
      throw new Error('Interval must be at least 5000ms');
    }

    this.config.intervalMs = intervalMs;

    if (this.isRunning) {
      this.stop();
      this.start();
    }

    console.log(`[SelfPinger] Interval updated to ${intervalMs}ms`);
  }

  resetStats(): void {
    this.pingCount = 0;
    this.successfulPings = 0;
    this.failedPings = 0;
    this.reconnectAttempts = 0;
    console.log('[SelfPinger] Stats reset');
  }
}

let selfPingerInstance: SelfPingerService | null = null;

export function getSelfPinger(config?: SelfPingerConfig): SelfPingerService {
  if (!selfPingerInstance) {
    selfPingerInstance = new SelfPingerService(config);
    console.log('[SelfPinger] Created new enhanced singleton instance');
  }
  return selfPingerInstance;
}
