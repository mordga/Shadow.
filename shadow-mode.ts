import { fileLogger } from './file-logger';
import { storage } from '../storage';

interface ShadowModeConfig {
  enabled: boolean;
  enabledAt: number;
  enabledBy: string;
  autoDisableTimeout?: NodeJS.Timeout;
}

export class ShadowModeService {
  private globalShadowMode: boolean = false;
  private serverConfigs: Map<string, ShadowModeConfig> = new Map();
  private readonly AUTO_DISABLE_HOURS = 24;
  private readonly AUTO_DISABLE_MS = this.AUTO_DISABLE_HOURS * 60 * 60 * 1000;

  constructor() {
    console.log('[ShadowMode] Shadow Mode service initialized');
  }

  async enableShadowMode(serverId?: string, enabledBy: string = 'System'): Promise<void> {
    const timestamp = Date.now();

    if (!serverId) {
      this.globalShadowMode = true;
      console.log(`[ShadowMode] 👁️ GLOBAL Shadow Mode ENABLED by ${enabledBy}`);
      
      await fileLogger.security('shadow-mode', '👁️ GLOBAL Shadow Mode ENABLED - All moderation actions disabled', {
        global: true,
        enabledBy,
        timestamp: new Date().toISOString(),
        autoDisableIn: `${this.AUTO_DISABLE_HOURS} hours`
      });

      await storage.createIncident({
        type: 'system',
        severity: 'high',
        title: 'Shadow Mode Enabled',
        description: '👁️ GLOBAL Shadow Mode ENABLED - Passive observation mode activated',
        serverId: 'GLOBAL',
        serverName: 'All Servers',
        evidence: {
          global: true,
          enabledBy,
          autoDisableIn: `${this.AUTO_DISABLE_HOURS} hours`
        }
      });

      const globalTimeout = setTimeout(async () => {
        try {
          await this.autoDisableGlobal();
        } catch (error) {
          console.error('[ShadowMode] Auto-disable global failed:', error);
          this.globalShadowMode = false;
          this.serverConfigs.delete('GLOBAL');
        }
      }, this.AUTO_DISABLE_MS);

      this.serverConfigs.set('GLOBAL', {
        enabled: true,
        enabledAt: timestamp,
        enabledBy,
        autoDisableTimeout: globalTimeout
      });
    } else {
      const existing = this.serverConfigs.get(serverId);
      if (existing?.autoDisableTimeout) {
        clearTimeout(existing.autoDisableTimeout);
      }

      const autoDisableTimeout = setTimeout(async () => {
        try {
          await this.autoDisableServer(serverId);
        } catch (error) {
          console.error('[ShadowMode] Auto-disable server failed:', error);
          this.serverConfigs.delete(serverId);
        }
      }, this.AUTO_DISABLE_MS);

      this.serverConfigs.set(serverId, {
        enabled: true,
        enabledAt: timestamp,
        enabledBy,
        autoDisableTimeout
      });

      console.log(`[ShadowMode] 👁️ Shadow Mode ENABLED for server ${serverId} by ${enabledBy}`);
      
      await fileLogger.security('shadow-mode', `👁️ Shadow Mode ENABLED for server ${serverId}`, {
        serverId,
        enabledBy,
        timestamp: new Date().toISOString(),
        autoDisableIn: `${this.AUTO_DISABLE_HOURS} hours`
      });

      try {
        await storage.createIncident({
          type: 'system',
          severity: 'medium',
          title: 'Shadow Mode Enabled',
          description: '👁️ Shadow Mode ENABLED - Passive observation mode activated',
          serverId,
          serverName: 'Server',
          evidence: {
            enabledBy,
            autoDisableIn: `${this.AUTO_DISABLE_HOURS} hours`
          }
        });
      } catch (error) {
        console.warn('[ShadowMode] Could not create incident for server:', error);
      }
    }
  }

  async disableShadowMode(serverId?: string, disabledBy: string = 'System'): Promise<void> {
    if (!serverId) {
      this.globalShadowMode = false;
      const globalConfig = this.serverConfigs.get('GLOBAL');
      
      if (globalConfig?.autoDisableTimeout) {
        clearTimeout(globalConfig.autoDisableTimeout);
      }
      
      this.serverConfigs.delete('GLOBAL');
      
      console.log(`[ShadowMode] 👁️ GLOBAL Shadow Mode DISABLED by ${disabledBy}`);
      
      await fileLogger.security('shadow-mode', '👁️ GLOBAL Shadow Mode DISABLED - Normal moderation resumed', {
        global: true,
        disabledBy,
        timestamp: new Date().toISOString()
      });

      await storage.createIncident({
        type: 'system',
        severity: 'low',
        title: 'Shadow Mode Disabled',
        description: '👁️ GLOBAL Shadow Mode DISABLED - Normal moderation resumed',
        serverId: 'GLOBAL',
        serverName: 'All Servers',
        evidence: { global: true, disabledBy }
      });
    } else {
      const config = this.serverConfigs.get(serverId);
      
      if (config?.autoDisableTimeout) {
        clearTimeout(config.autoDisableTimeout);
      }
      
      this.serverConfigs.delete(serverId);
      
      console.log(`[ShadowMode] 👁️ Shadow Mode DISABLED for server ${serverId} by ${disabledBy}`);
      
      await fileLogger.security('shadow-mode', `👁️ Shadow Mode DISABLED for server ${serverId}`, {
        serverId,
        disabledBy,
        timestamp: new Date().toISOString()
      });

      try {
        await storage.createIncident({
          type: 'system',
          severity: 'low',
          title: 'Shadow Mode Disabled',
          description: '👁️ Shadow Mode DISABLED - Normal moderation resumed',
          serverId,
          serverName: 'Server',
          evidence: { disabledBy }
        });
      } catch (error) {
        console.warn('[ShadowMode] Could not create incident for server:', error);
      }
    }
  }

  isShadowModeActive(serverId: string): boolean {
    if (this.globalShadowMode) {
      return true;
    }
    
    const config = this.serverConfigs.get(serverId);
    return config?.enabled || false;
  }

  getShadowModeStatus(): {
    global: boolean;
    servers: Array<{
      serverId: string;
      enabled: boolean;
      enabledAt: Date;
      enabledBy: string;
      timeRemaining: string;
    }>;
  } {
    const now = Date.now();
    const servers: Array<{
      serverId: string;
      enabled: boolean;
      enabledAt: Date;
      enabledBy: string;
      timeRemaining: string;
    }> = [];

    this.serverConfigs.forEach((config, serverId) => {
      if (serverId === 'GLOBAL') return;
      
      const timeElapsed = now - config.enabledAt;
      const timeRemaining = Math.max(0, this.AUTO_DISABLE_MS - timeElapsed);
      const hoursRemaining = Math.floor(timeRemaining / (60 * 60 * 1000));
      const minutesRemaining = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));

      servers.push({
        serverId,
        enabled: config.enabled,
        enabledAt: new Date(config.enabledAt),
        enabledBy: config.enabledBy,
        timeRemaining: `${hoursRemaining}h ${minutesRemaining}m`
      });
    });

    return {
      global: this.globalShadowMode,
      servers
    };
  }

  private async autoDisableGlobal(): Promise<void> {
    console.log('[ShadowMode] ⏰ Auto-disabling GLOBAL Shadow Mode after 24 hours');
    
    await fileLogger.warn('shadow-mode', '⏰ GLOBAL Shadow Mode auto-disabled after 24 hours', {
      global: true,
      reason: 'Auto-disable timeout reached'
    });

    await storage.createIncident({
      type: 'system',
      severity: 'medium',
      title: 'Shadow Mode Auto-Disabled',
      description: '⏰ GLOBAL Shadow Mode AUTO-DISABLED after 24 hours - Normal moderation resumed',
      serverId: 'GLOBAL',
      serverName: 'All Servers',
      evidence: {
        global: true,
        reason: '24-hour timeout reached',
        timestamp: new Date().toISOString()
      }
    });

    this.globalShadowMode = false;
    this.serverConfigs.delete('GLOBAL');
  }

  private async autoDisableServer(serverId: string): Promise<void> {
    console.log(`[ShadowMode] ⏰ Auto-disabling Shadow Mode for server ${serverId} after 24 hours`);
    
    await fileLogger.warn('shadow-mode', `⏰ Shadow Mode auto-disabled for server ${serverId} after 24 hours`, {
      serverId,
      reason: 'Auto-disable timeout reached'
    });

    try {
      await storage.createIncident({
        type: 'system',
        severity: 'medium',
        title: 'Shadow Mode Auto-Disabled',
        description: '⏰ Shadow Mode AUTO-DISABLED after 24 hours - Normal moderation resumed',
        serverId,
        serverName: 'Server',
        evidence: {
          reason: '24-hour timeout reached',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.warn('[ShadowMode] Could not create auto-disable incident:', error);
    }

    this.serverConfigs.delete(serverId);
  }

  destroy(): void {
    this.serverConfigs.forEach(config => {
      if (config.autoDisableTimeout) {
        clearTimeout(config.autoDisableTimeout);
      }
    });
    this.serverConfigs.clear();
    this.globalShadowMode = false;
    console.log('[ShadowMode] Shadow Mode service destroyed');
  }
}

export const shadowMode = new ShadowModeService();
