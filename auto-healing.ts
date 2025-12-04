import { EventEmitter } from 'events';
import { getHealthMonitor, type ModuleHealthMetrics } from './health-monitor';
import { storage } from '../storage';
import { getWebSocketService } from './websocket';
import { fileLogger } from './file-logger';

export interface RemediationHandler {
  name: string;
  priority: number;
  canHandle: (moduleName: string, metrics: ModuleHealthMetrics) => boolean;
  execute: (moduleName: string, metrics: ModuleHealthMetrics) => Promise<RemediationResult>;
}

export interface RemediationResult {
  success: boolean;
  action: string;
  message: string;
  duration: number;
  requiresManualIntervention?: boolean;
}

export interface IncidentCorrelation {
  id: string;
  modules: string[];
  startTime: Date;
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  rootCause?: string;
  resolved: boolean;
  resolutionTime?: Date;
  remediationAttempts: number;
}

export interface AutoHealingConfig {
  enabled: boolean;
  maxRemediationAttempts: number;
  cooldownBetweenAttempts: number;
  escalationThreshold: number;
  autoRestartServices: boolean;
  notifyOnRemediation: boolean;
  correlationWindowMs: number;
}

interface ModuleRemediationState {
  attempts: number;
  lastAttempt: number;
  backoffMs: number;
  locked: boolean;
}

export class AutoHealingSystem extends EventEmitter {
  private config: AutoHealingConfig;
  private handlers: RemediationHandler[] = [];
  private remediationStates: Map<string, ModuleRemediationState> = new Map();
  private activeIncidents: Map<string, IncidentCorrelation> = new Map();
  private isRunning: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;
  private correlationBuffer: Array<{ moduleName: string; timestamp: number; status: string }> = [];

  private serviceRestarters: Map<string, () => Promise<boolean>> = new Map();

  constructor(config: Partial<AutoHealingConfig> = {}) {
    super();
    this.config = {
      enabled: true,
      maxRemediationAttempts: 5,
      cooldownBetweenAttempts: 30000,
      escalationThreshold: 3,
      autoRestartServices: true,
      notifyOnRemediation: true,
      correlationWindowMs: 60000,
      ...config
    };

    this.registerDefaultHandlers();
    console.log('[AutoHealing] 🔧 Auto-Healing System initialized - REGENERATIVE MODE ACTIVE');
  }

  private registerDefaultHandlers(): void {
    this.registerHandler({
      name: 'service-restart',
      priority: 1,
      canHandle: (moduleName) => this.serviceRestarters.has(moduleName),
      execute: async (moduleName, metrics) => {
        const startTime = Date.now();
        const restarter = this.serviceRestarters.get(moduleName);
        
        if (!restarter) {
          return {
            success: false,
            action: 'restart',
            message: `No restarter registered for ${moduleName}`,
            duration: Date.now() - startTime
          };
        }

        try {
          console.log(`[AutoHealing] 🔄 Attempting to restart ${moduleName}...`);
          const success = await restarter();
          
          return {
            success,
            action: 'restart',
            message: success 
              ? `Successfully restarted ${moduleName}`
              : `Failed to restart ${moduleName}`,
            duration: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            action: 'restart',
            message: `Error restarting ${moduleName}: ${error?.message || 'Unknown error'}`,
            duration: Date.now() - startTime
          };
        }
      }
    });

    this.registerHandler({
      name: 'metrics-reset',
      priority: 2,
      canHandle: (moduleName, metrics) => {
        return metrics.consecutiveFailures < 5 && metrics.status === 'degraded';
      },
      execute: async (moduleName, metrics) => {
        const startTime = Date.now();
        const healthMonitor = getHealthMonitor();
        
        try {
          healthMonitor.resetModuleMetrics(moduleName);
          console.log(`[AutoHealing] 📊 Reset metrics for ${moduleName}`);
          
          return {
            success: true,
            action: 'metrics-reset',
            message: `Reset health metrics for ${moduleName} after degraded state`,
            duration: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            action: 'metrics-reset',
            message: `Failed to reset metrics: ${error?.message}`,
            duration: Date.now() - startTime
          };
        }
      }
    });

    this.registerHandler({
      name: 'graceful-degradation',
      priority: 3,
      canHandle: (moduleName, metrics) => {
        return metrics.consecutiveFailures >= 5;
      },
      execute: async (moduleName, metrics) => {
        const startTime = Date.now();
        
        console.log(`[AutoHealing] ⚠️ Entering graceful degradation for ${moduleName}`);
        
        await fileLogger.warn('auto-healing', `Graceful degradation activated for ${moduleName}`, {
          consecutiveFailures: metrics.consecutiveFailures,
          lastError: metrics.lastError,
          averageLatency: metrics.averageLatency
        });
        
        this.emit('graceful_degradation', {
          moduleName,
          metrics,
          timestamp: Date.now()
        });

        return {
          success: true,
          action: 'graceful-degradation',
          message: `Activated graceful degradation for ${moduleName}`,
          duration: Date.now() - startTime,
          requiresManualIntervention: true
        };
      }
    });

    this.registerHandler({
      name: 'circuit-breaker',
      priority: 4,
      canHandle: (moduleName, metrics) => {
        return metrics.status === 'unhealthy' && metrics.consecutiveFailures >= 10;
      },
      execute: async (moduleName, metrics) => {
        const startTime = Date.now();
        const healthMonitor = getHealthMonitor();
        
        console.log(`[AutoHealing] 🔌 Circuit breaker triggered for ${moduleName}`);
        
        healthMonitor.disableModule(moduleName);
        
        await fileLogger.error('auto-healing', `Circuit breaker opened for ${moduleName}`, {
          consecutiveFailures: metrics.consecutiveFailures,
          failedChecks: metrics.failedChecks,
          lastError: metrics.lastError
        });

        setTimeout(() => {
          console.log(`[AutoHealing] 🔌 Circuit breaker half-open for ${moduleName}`);
          healthMonitor.enableModule(moduleName);
        }, 60000);

        return {
          success: true,
          action: 'circuit-breaker',
          message: `Circuit breaker opened for ${moduleName}, will retry in 60s`,
          duration: Date.now() - startTime,
          requiresManualIntervention: false
        };
      }
    });
  }

  registerHandler(handler: RemediationHandler): void {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => a.priority - b.priority);
    console.log(`[AutoHealing] ✅ Registered handler: ${handler.name} (priority: ${handler.priority})`);
  }

  registerServiceRestarter(moduleName: string, restarter: () => Promise<boolean>): void {
    this.serviceRestarters.set(moduleName, restarter);
    console.log(`[AutoHealing] 🔄 Registered restarter for ${moduleName}`);
  }

  start(): void {
    if (this.isRunning) {
      console.warn('[AutoHealing] Already running');
      return;
    }

    this.isRunning = true;
    const healthMonitor = getHealthMonitor();

    healthMonitor.on('health_degraded', async (event) => {
      await this.handleHealthEvent(event);
    });

    healthMonitor.on('health_recovered', (event) => {
      this.handleRecovery(event);
    });

    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleData();
    }, 5 * 60 * 1000);

    console.log('[AutoHealing] 🚀 Auto-Healing System started');
    this.emit('started', { timestamp: Date.now() });
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    console.log('[AutoHealing] 🛑 Auto-Healing System stopped');
    this.emit('stopped', { timestamp: Date.now() });
  }

  private async handleHealthEvent(event: {
    moduleName: string;
    previousStatus: string;
    currentStatus: string;
    consecutiveFailures: number;
    error: string | null;
    metrics: ModuleHealthMetrics;
  }): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const { moduleName, metrics, currentStatus } = event;
    
    console.log(`[AutoHealing] 🔍 Health event: ${moduleName} -> ${currentStatus}`);

    this.correlationBuffer.push({
      moduleName,
      timestamp: Date.now(),
      status: currentStatus
    });

    await this.checkForCorrelatedIncidents();

    const state = this.getRemediationState(moduleName);

    if (state.locked) {
      console.log(`[AutoHealing] ⏳ ${moduleName} is locked, skipping remediation`);
      return;
    }

    const now = Date.now();
    if (now - state.lastAttempt < state.backoffMs) {
      console.log(`[AutoHealing] ⏳ Backoff active for ${moduleName}, ${Math.ceil((state.backoffMs - (now - state.lastAttempt)) / 1000)}s remaining`);
      return;
    }

    if (state.attempts >= this.config.maxRemediationAttempts) {
      console.log(`[AutoHealing] 🚫 Max remediation attempts reached for ${moduleName}`);
      await this.escalateIncident(moduleName, metrics);
      return;
    }

    await this.attemptRemediation(moduleName, metrics);
  }

  private async attemptRemediation(moduleName: string, metrics: ModuleHealthMetrics): Promise<void> {
    const state = this.getRemediationState(moduleName);
    state.locked = true;
    state.attempts++;
    state.lastAttempt = Date.now();

    console.log(`[AutoHealing] 🔧 Remediation attempt ${state.attempts}/${this.config.maxRemediationAttempts} for ${moduleName}`);

    try {
      for (const handler of this.handlers) {
        if (handler.canHandle(moduleName, metrics)) {
          console.log(`[AutoHealing] 🎯 Using handler: ${handler.name}`);
          
          const result = await handler.execute(moduleName, metrics);
          
          await this.logRemediationResult(moduleName, handler.name, result);

          if (result.success) {
            console.log(`[AutoHealing] ✅ ${result.message}`);
            state.backoffMs = this.config.cooldownBetweenAttempts;
            
            if (this.config.notifyOnRemediation) {
              this.broadcastRemediationEvent(moduleName, 'success', result);
            }
            
            break;
          } else {
            console.log(`[AutoHealing] ❌ ${result.message}`);
            state.backoffMs = Math.min(state.backoffMs * 2, 300000);
            
            if (result.requiresManualIntervention) {
              await this.escalateIncident(moduleName, metrics);
              break;
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`[AutoHealing] 💥 Remediation error for ${moduleName}:`, error);
      state.backoffMs = Math.min(state.backoffMs * 2, 300000);
    } finally {
      state.locked = false;
    }
  }

  private handleRecovery(event: {
    moduleName: string;
    previousStatus: string;
    metrics: ModuleHealthMetrics;
  }): void {
    const { moduleName } = event;
    
    console.log(`[AutoHealing] 💚 ${moduleName} recovered`);

    const state = this.remediationStates.get(moduleName);
    if (state) {
      state.attempts = 0;
      state.backoffMs = this.config.cooldownBetweenAttempts;
    }

    for (const [incidentId, incident] of Array.from(this.activeIncidents.entries())) {
      if (incident.modules.includes(moduleName)) {
        const allRecovered = incident.modules.every((m: string) => {
          const healthMonitor = getHealthMonitor();
          return healthMonitor.isModuleHealthy(m);
        });

        if (allRecovered) {
          incident.resolved = true;
          incident.resolutionTime = new Date();
          console.log(`[AutoHealing] ✅ Incident ${incidentId} resolved`);
          this.emit('incident_resolved', incident);
        }
      }
    }

    this.broadcastRemediationEvent(moduleName, 'recovered', {
      success: true,
      action: 'recovery',
      message: `${moduleName} has recovered`,
      duration: 0
    });
  }

  private async checkForCorrelatedIncidents(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.config.correlationWindowMs;

    const recentEvents = this.correlationBuffer.filter(e => e.timestamp > windowStart);

    const moduleFailures = new Map<string, number>();
    for (const event of recentEvents) {
      if (event.status === 'unhealthy' || event.status === 'degraded') {
        moduleFailures.set(event.moduleName, (moduleFailures.get(event.moduleName) || 0) + 1);
      }
    }

    const failedModules = Array.from(moduleFailures.entries())
      .filter(([_, count]) => count >= 2)
      .map(([name]) => name);

    if (failedModules.length >= 2) {
      const existingIncident = Array.from(this.activeIncidents.values())
        .find(i => !i.resolved && failedModules.some(m => i.modules.includes(m)));

      if (!existingIncident) {
        const incidentId = `INC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        
        let severity: IncidentCorrelation['severity'] = 'minor';
        if (failedModules.length >= 4) severity = 'critical';
        else if (failedModules.length >= 3) severity = 'major';
        else if (failedModules.length >= 2) severity = 'moderate';

        const incident: IncidentCorrelation = {
          id: incidentId,
          modules: failedModules,
          startTime: new Date(),
          severity,
          resolved: false,
          remediationAttempts: 0
        };

        this.activeIncidents.set(incidentId, incident);
        
        console.log(`[AutoHealing] 🚨 Correlated incident detected: ${incidentId}`);
        console.log(`  → Affected modules: ${failedModules.join(', ')}`);
        console.log(`  → Severity: ${severity.toUpperCase()}`);

        await fileLogger.error('auto-healing', `Correlated incident: ${incidentId}`, {
          modules: failedModules,
          severity,
          timestamp: new Date().toISOString()
        });

        this.emit('incident_detected', incident);
        this.broadcastIncidentEvent(incident);
      }
    }
  }

  private async escalateIncident(moduleName: string, metrics: ModuleHealthMetrics): Promise<void> {
    console.log(`[AutoHealing] 🚨 Escalating incident for ${moduleName}`);

    await fileLogger.error('auto-healing', `ESCALATION: ${moduleName} requires manual intervention`, {
      consecutiveFailures: metrics.consecutiveFailures,
      failedChecks: metrics.failedChecks,
      successfulChecks: metrics.successfulChecks,
      lastError: metrics.lastError,
      averageLatency: metrics.averageLatency
    });

    this.emit('escalation', {
      moduleName,
      metrics,
      timestamp: Date.now(),
      message: `Module ${moduleName} has exceeded max remediation attempts and requires manual intervention`
    });

    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcast({
        type: 'escalation_alert',
        data: {
          moduleName,
          severity: 'critical',
          message: `${moduleName} requires manual intervention`,
          metrics
        },
        timestamp: Date.now()
      });
    }
  }

  private async logRemediationResult(
    moduleName: string,
    handlerName: string,
    result: RemediationResult
  ): Promise<void> {
    const logFn = result.success ? fileLogger.info : fileLogger.warn;
    await logFn.call(fileLogger, 'auto-healing', `Remediation ${result.success ? 'succeeded' : 'failed'}`, {
      moduleName,
      handler: handlerName,
      action: result.action,
      message: result.message,
      duration: result.duration,
      requiresManualIntervention: result.requiresManualIntervention
    });
  }

  private broadcastRemediationEvent(
    moduleName: string,
    type: 'success' | 'failure' | 'recovered',
    result: RemediationResult
  ): void {
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcast({
        type: 'auto_healing_event',
        data: {
          moduleName,
          eventType: type,
          result
        },
        timestamp: Date.now()
      });
    }
  }

  private broadcastIncidentEvent(incident: IncidentCorrelation): void {
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcast({
        type: 'incident_alert',
        data: incident,
        timestamp: Date.now()
      });
    }
  }

  private getRemediationState(moduleName: string): ModuleRemediationState {
    let state = this.remediationStates.get(moduleName);
    if (!state) {
      state = {
        attempts: 0,
        lastAttempt: 0,
        backoffMs: this.config.cooldownBetweenAttempts,
        locked: false
      };
      this.remediationStates.set(moduleName, state);
    }
    return state;
  }

  private cleanupStaleData(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;

    for (const [incidentId, incident] of Array.from(this.activeIncidents.entries())) {
      if (incident.resolved && incident.resolutionTime) {
        if (now - incident.resolutionTime.getTime() > maxAge) {
          this.activeIncidents.delete(incidentId);
        }
      }
    }

    const maxBufferAge = 5 * 60 * 1000;
    this.correlationBuffer = this.correlationBuffer.filter(e => now - e.timestamp < maxBufferAge);

    for (const [moduleName, state] of Array.from(this.remediationStates.entries())) {
      if (now - state.lastAttempt > maxAge && state.attempts === 0) {
        this.remediationStates.delete(moduleName);
      }
    }
  }

  getStatus(): {
    running: boolean;
    config: AutoHealingConfig;
    activeIncidents: IncidentCorrelation[];
    remediationStats: {
      moduleName: string;
      attempts: number;
      lastAttempt: Date | null;
      backoffMs: number;
    }[];
    registeredHandlers: string[];
    registeredRestarters: string[];
  } {
    return {
      running: this.isRunning,
      config: this.config,
      activeIncidents: Array.from(this.activeIncidents.values()).filter(i => !i.resolved),
      remediationStats: Array.from(this.remediationStates.entries()).map(([name, state]) => ({
        moduleName: name,
        attempts: state.attempts,
        lastAttempt: state.lastAttempt ? new Date(state.lastAttempt) : null,
        backoffMs: state.backoffMs
      })),
      registeredHandlers: this.handlers.map(h => h.name),
      registeredRestarters: Array.from(this.serviceRestarters.keys())
    };
  }

  updateConfig(updates: Partial<AutoHealingConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[AutoHealing] ⚙️ Configuration updated');
    this.emit('config_updated', this.config);
  }

  async forceRemediation(moduleName: string): Promise<RemediationResult | null> {
    const healthMonitor = getHealthMonitor();
    const metrics = healthMonitor.getModuleHealth(moduleName);
    
    if (!metrics) {
      return null;
    }

    const state = this.getRemediationState(moduleName);
    state.attempts = 0;
    state.backoffMs = this.config.cooldownBetweenAttempts;

    await this.attemptRemediation(moduleName, metrics);
    
    return {
      success: true,
      action: 'force-remediation',
      message: `Forced remediation for ${moduleName}`,
      duration: 0
    };
  }
}

let autoHealingInstance: AutoHealingSystem | null = null;

export function getAutoHealing(): AutoHealingSystem {
  if (!autoHealingInstance) {
    autoHealingInstance = new AutoHealingSystem();
  }
  return autoHealingInstance;
}

export function initializeAutoHealing(config?: Partial<AutoHealingConfig>): AutoHealingSystem {
  if (!autoHealingInstance) {
    autoHealingInstance = new AutoHealingSystem(config);
  }
  return autoHealingInstance;
}

export function resetAutoHealing(): void {
  if (autoHealingInstance) {
    autoHealingInstance.stop();
    autoHealingInstance = null;
  }
}
