import { EventEmitter } from 'events';
import { storage } from '../storage';
import { getWebSocketService } from './websocket';
import type { InsertHealthEvent } from '@shared/schema';

export interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  message?: string;
  metadata?: Record<string, any>;
}

export type HealthCheckFunction = () => Promise<HealthCheckResult>;

export interface ModuleHealthMetrics {
  moduleName: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  uptime: number;
  lastCheckTime: Date | null;
  lastHealthyTime: Date | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  averageLatency: number;
  lastError: string | null;
  metadata?: Record<string, any>;
}

export interface RegisterModuleOptions {
  checkInterval?: number;
  timeout?: number;
  failureThreshold?: number;
  enabled?: boolean;
  metadata?: Record<string, any>;
}

interface RegisteredModule {
  name: string;
  healthCheckFn: HealthCheckFunction;
  options: Required<RegisterModuleOptions>;
  metrics: ModuleHealthMetrics;
  intervalId?: NodeJS.Timeout;
  isChecking: boolean;
}

export class HealthMonitor extends EventEmitter {
  private modules: Map<string, RegisteredModule> = new Map();
  private isRunning: boolean = false;
  private startTime: number = Date.now();
  private globalCheckInterval?: NodeJS.Timeout;

  constructor(private defaultCheckInterval: number = 30000) {
    super();
  }

  registerModule(
    name: string,
    healthCheckFn: HealthCheckFunction,
    options: RegisterModuleOptions = {}
  ): void {
    if (this.modules.has(name)) {
      console.warn(`[HealthMonitor] Module '${name}' is already registered. Updating configuration.`);
      this.unregisterModule(name);
    }

    const moduleOptions: Required<RegisterModuleOptions> = {
      checkInterval: options.checkInterval ?? this.defaultCheckInterval,
      timeout: options.timeout ?? 5000,
      failureThreshold: options.failureThreshold ?? 3,
      enabled: options.enabled ?? true,
      metadata: options.metadata ?? {},
    };

    const module: RegisteredModule = {
      name,
      healthCheckFn,
      options: moduleOptions,
      metrics: {
        moduleName: name,
        status: 'healthy',
        uptime: 0,
        lastCheckTime: null,
        lastHealthyTime: null,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        averageLatency: 0,
        lastError: null,
        metadata: moduleOptions.metadata,
      },
      isChecking: false,
    };

    this.modules.set(name, module);
    console.log(`[HealthMonitor] Registered module '${name}' with check interval ${moduleOptions.checkInterval}ms`);

    if (this.isRunning && moduleOptions.enabled) {
      this.startModuleChecks(name);
    }

    this.emit('module_registered', { moduleName: name, options: moduleOptions });
  }

  unregisterModule(name: string): void {
    const module = this.modules.get(name);
    if (!module) {
      console.warn(`[HealthMonitor] Module '${name}' is not registered.`);
      return;
    }

    if (module.intervalId) {
      clearInterval(module.intervalId);
    }

    this.modules.delete(name);
    console.log(`[HealthMonitor] Unregistered module '${name}'`);

    this.emit('module_unregistered', { moduleName: name });
  }

  start(): void {
    if (this.isRunning) {
      console.warn('[HealthMonitor] Health monitor is already running.');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    console.log('[HealthMonitor] Starting health monitor...');

    for (const [name, module] of Array.from(this.modules.entries())) {
      if (module.options.enabled) {
        this.startModuleChecks(name);
      }
    }

    this.emit('monitor_started', { timestamp: Date.now() });
  }

  stop(): void {
    if (!this.isRunning) {
      console.warn('[HealthMonitor] Health monitor is not running.');
      return;
    }

    this.isRunning = false;
    console.log('[HealthMonitor] Stopping health monitor...');

    for (const module of Array.from(this.modules.values())) {
      if (module.intervalId) {
        clearInterval(module.intervalId);
        module.intervalId = undefined;
      }
    }

    if (this.globalCheckInterval) {
      clearInterval(this.globalCheckInterval);
      this.globalCheckInterval = undefined;
    }

    this.emit('monitor_stopped', { timestamp: Date.now() });
  }

  private startModuleChecks(name: string): void {
    const module = this.modules.get(name);
    if (!module) return;

    if (module.intervalId) {
      clearInterval(module.intervalId);
    }

    this.performHealthCheck(name);

    module.intervalId = setInterval(() => {
      this.performHealthCheck(name);
    }, module.options.checkInterval);
  }

  private async performHealthCheck(name: string): Promise<void> {
    const module = this.modules.get(name);
    if (!module || module.isChecking) return;

    module.isChecking = true;
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        module.healthCheckFn(),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), module.options.timeout)
        ),
      ]);

      const latency = Date.now() - startTime;
      const previousStatus = module.metrics.status;

      module.metrics.totalChecks++;
      module.metrics.lastCheckTime = new Date();
      module.metrics.averageLatency =
        (module.metrics.averageLatency * (module.metrics.totalChecks - 1) + latency) /
        module.metrics.totalChecks;

      if (result.healthy) {
        module.metrics.successfulChecks++;
        module.metrics.consecutiveSuccesses++;
        module.metrics.consecutiveFailures = 0;
        module.metrics.lastHealthyTime = new Date();
        module.metrics.lastError = null;
        module.metrics.status = 'healthy';

        await this.logHealthEvent({
          moduleName: name,
          status: 'healthy',
          latency,
          consecutiveFailures: 0,
          errorMessage: null,
          metadata: result.metadata || null,
        });

        if (previousStatus !== 'healthy') {
          console.log(`[HealthMonitor] Module '${name}' recovered to healthy state`);
          this.emit('health_recovered', {
            moduleName: name,
            previousStatus,
            metrics: { ...module.metrics },
          });
          this.broadcastHealthUpdate();
        }
      } else {
        this.handleUnhealthyCheck(module, result, latency, previousStatus);
      }
    } catch (error: any) {
      const latency = Date.now() - startTime;
      const previousStatus = module.metrics.status;
      
      this.handleUnhealthyCheck(
        module,
        {
          healthy: false,
          latency,
          message: error?.message || 'Unknown error',
        },
        latency,
        previousStatus
      );
    } finally {
      module.isChecking = false;
    }
  }

  private async handleUnhealthyCheck(
    module: RegisteredModule,
    result: HealthCheckResult,
    latency: number,
    previousStatus: string
  ): Promise<void> {
    module.metrics.failedChecks++;
    module.metrics.consecutiveFailures++;
    module.metrics.consecutiveSuccesses = 0;
    module.metrics.lastError = result.message || 'Health check failed';

    if (module.metrics.consecutiveFailures >= module.options.failureThreshold) {
      module.metrics.status = 'unhealthy';
    } else {
      module.metrics.status = 'degraded';
    }

    await this.logHealthEvent({
      moduleName: module.name,
      status: module.metrics.status,
      latency,
      consecutiveFailures: module.metrics.consecutiveFailures,
      errorMessage: module.metrics.lastError,
      metadata: result.metadata || null,
    });

    if (previousStatus !== module.metrics.status) {
      console.error(
        `[HealthMonitor] Module '${module.name}' status changed: ${previousStatus} -> ${module.metrics.status}`
      );
      
      this.emit('health_degraded', {
        moduleName: module.name,
        previousStatus,
        currentStatus: module.metrics.status,
        consecutiveFailures: module.metrics.consecutiveFailures,
        error: module.metrics.lastError,
        metrics: { ...module.metrics },
      });

      this.broadcastHealthUpdate();
    }
  }

  private async logHealthEvent(event: InsertHealthEvent): Promise<void> {
    try {
      await storage.createHealthEvent(event);
    } catch (error) {
      console.error('[HealthMonitor] Failed to log health event:', error);
    }
  }

  private broadcastHealthUpdate(): void {
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcast({
        type: 'health_update',
        data: this.getAllHealth(),
        timestamp: Date.now(),
      });
    }
  }

  getModuleHealth(name: string): ModuleHealthMetrics | null {
    const module = this.modules.get(name);
    if (!module) {
      console.warn(`[HealthMonitor] Module '${name}' is not registered.`);
      return null;
    }

    const uptime = module.metrics.lastHealthyTime
      ? Date.now() - module.metrics.lastHealthyTime.getTime()
      : 0;

    return {
      ...module.metrics,
      uptime,
    };
  }

  getAllHealth(): Record<string, ModuleHealthMetrics> {
    const health: Record<string, ModuleHealthMetrics> = {};

    for (const [name, module] of Array.from(this.modules.entries())) {
      const uptime = module.metrics.lastHealthyTime
        ? Date.now() - module.metrics.lastHealthyTime.getTime()
        : 0;

      health[name] = {
        ...module.metrics,
        uptime,
      };
    }

    return health;
  }

  getModuleNames(): string[] {
    return Array.from(this.modules.keys());
  }

  isModuleHealthy(name: string): boolean {
    const module = this.modules.get(name);
    if (!module) return false;
    return module.metrics.status === 'healthy';
  }

  getOverallHealth(): {
    healthy: number;
    degraded: number;
    unhealthy: number;
    total: number;
    allHealthy: boolean;
  } {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;

    for (const module of Array.from(this.modules.values())) {
      if (module.metrics.status === 'healthy') healthy++;
      else if (module.metrics.status === 'degraded') degraded++;
      else unhealthy++;
    }

    return {
      healthy,
      degraded,
      unhealthy,
      total: this.modules.size,
      allHealthy: unhealthy === 0 && degraded === 0,
    };
  }

  async getModuleHealthHistory(
    name: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      return await storage.getHealthEvents(name, limit);
    } catch (error) {
      console.error(`[HealthMonitor] Failed to get health history for module '${name}':`, error);
      return [];
    }
  }

  enableModule(name: string): void {
    const module = this.modules.get(name);
    if (!module) {
      console.warn(`[HealthMonitor] Module '${name}' is not registered.`);
      return;
    }

    module.options.enabled = true;
    
    if (this.isRunning) {
      this.startModuleChecks(name);
    }

    console.log(`[HealthMonitor] Module '${name}' enabled`);
    this.emit('module_enabled', { moduleName: name });
  }

  disableModule(name: string): void {
    const module = this.modules.get(name);
    if (!module) {
      console.warn(`[HealthMonitor] Module '${name}' is not registered.`);
      return;
    }

    module.options.enabled = false;
    
    if (module.intervalId) {
      clearInterval(module.intervalId);
      module.intervalId = undefined;
    }

    console.log(`[HealthMonitor] Module '${name}' disabled`);
    this.emit('module_disabled', { moduleName: name });
  }

  resetModuleMetrics(name: string): void {
    const module = this.modules.get(name);
    if (!module) {
      console.warn(`[HealthMonitor] Module '${name}' is not registered.`);
      return;
    }

    module.metrics = {
      moduleName: name,
      status: 'healthy',
      uptime: 0,
      lastCheckTime: null,
      lastHealthyTime: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageLatency: 0,
      lastError: null,
      metadata: module.options.metadata,
    };

    console.log(`[HealthMonitor] Reset metrics for module '${name}'`);
    this.emit('module_metrics_reset', { moduleName: name });
  }

  getMonitorUptime(): number {
    return Date.now() - this.startTime;
  }

  isRunningStatus(): boolean {
    return this.isRunning;
  }
}

let healthMonitorInstance: HealthMonitor | null = null;

export function getHealthMonitor(defaultCheckInterval?: number): HealthMonitor {
  if (!healthMonitorInstance) {
    healthMonitorInstance = new HealthMonitor(defaultCheckInterval);
  }
  return healthMonitorInstance;
}

export function resetHealthMonitor(): void {
  if (healthMonitorInstance) {
    healthMonitorInstance.stop();
    healthMonitorInstance = null;
  }
}
