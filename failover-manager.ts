export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface ResilientModuleConfig<T> {
  primary: T;
  backups?: T[];
  errorThreshold?: number;
  timeout?: number;
  resetTimeout?: number;
  halfOpenMaxAttempts?: number;
  rollingWindowSize?: number;
  errorBudget?: number;
}

export interface HealthMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  errorRate: number;
  averageResponseTime: number;
  lastError?: {
    message: string;
    timestamp: number;
  };
  uptime: number;
  currentInstance: 'primary' | number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastStateChange: number;
  rollingErrors: number[];
  errorBudgetRemaining: number;
}

type FailoverCallback = (from: 'primary' | number, to: 'primary' | number, reason: string) => void;
type RestoreCallback = (instance: 'primary' | number) => void;

export class ResilientModule<T> {
  private config: Required<ResilientModuleConfig<T>>;
  private currentInstance: T;
  private currentInstanceIndex: 'primary' | number = 'primary';
  
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastStateChange: number = Date.now();
  
  private rollingErrors: number[] = [];
  private healthMetrics: HealthMetrics;
  private callHistory: { timestamp: number; success: boolean; duration: number }[] = [];
  
  private failoverCallbacks: FailoverCallback[] = [];
  private restoreCallbacks: RestoreCallback[] = [];
  
  private failoverCount: number = 0;
  private startTime: number = Date.now();
  
  private recoveryTimer?: NodeJS.Timeout;

  constructor(config: ResilientModuleConfig<T>) {
    this.config = {
      primary: config.primary,
      backups: config.backups || [],
      errorThreshold: config.errorThreshold || 5,
      timeout: config.timeout || 5000,
      resetTimeout: config.resetTimeout || 60000,
      halfOpenMaxAttempts: config.halfOpenMaxAttempts || 3,
      rollingWindowSize: config.rollingWindowSize || 100,
      errorBudget: config.errorBudget || 0.1
    };

    this.currentInstance = this.config.primary;
    
    this.healthMetrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      errorRate: 0,
      averageResponseTime: 0,
      uptime: 0,
      currentInstance: 'primary'
    };

    this.startRecoveryMonitoring();
  }

  onFailover(callback: FailoverCallback): void {
    this.failoverCallbacks.push(callback);
  }

  onRestore(callback: RestoreCallback): void {
    this.restoreCallbacks.push(callback);
  }

  async execute<K extends keyof T>(
    method: K,
    ...args: T[K] extends (...args: any[]) => any ? Parameters<T[K]> : never
  ): Promise<T[K] extends (...args: any[]) => any ? ReturnType<T[K]> : never> {
    const startTime = Date.now();

    if (this.state === CircuitState.OPEN) {
      const timeSinceOpen = Date.now() - this.lastStateChange;
      if (timeSinceOpen >= this.config.resetTimeout) {
        this.transitionToHalfOpen();
      } else {
        throw new Error(`Circuit breaker is OPEN. Service unavailable. Retry in ${Math.ceil((this.config.resetTimeout - timeSinceOpen) / 1000)}s`);
      }
    }

    try {
      const result = await this.executeWithTimeout(method, args);
      this.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.recordFailure(Date.now() - startTime, error);
      throw error;
    }
  }

  private async executeWithTimeout<K extends keyof T>(
    method: K,
    args: any[]
  ): Promise<any> {
    const instance = this.currentInstance;
    const methodFn = instance[method];

    if (typeof methodFn !== 'function') {
      throw new Error(`Method ${String(method)} is not a function on the instance`);
    }

    return Promise.race([
      (methodFn as Function).apply(instance, args),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), this.config.timeout)
      )
    ]);
  }

  private recordSuccess(duration: number): void {
    this.healthMetrics.totalCalls++;
    this.healthMetrics.successfulCalls++;
    this.callHistory.push({ timestamp: Date.now(), success: true, duration });
    this.trimCallHistory();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenMaxAttempts) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }

    this.updateHealthMetrics();
  }

  private recordFailure(duration: number, error: any): void {
    this.healthMetrics.totalCalls++;
    this.healthMetrics.failedCalls++;
    this.healthMetrics.lastError = {
      message: error?.message || 'Unknown error',
      timestamp: Date.now()
    };
    
    this.callHistory.push({ timestamp: Date.now(), success: false, duration });
    this.trimCallHistory();
    
    this.rollingErrors.push(Date.now());
    if (this.rollingErrors.length > this.config.rollingWindowSize) {
      this.rollingErrors.shift();
    }

    this.failureCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
      this.tryFailover(error?.message || 'Unknown error');
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.config.errorThreshold) {
        this.transitionToOpen();
        this.tryFailover(error?.message || 'Error threshold exceeded');
      }
    }

    this.updateHealthMetrics();
  }

  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    
    console.log(`[ResilientModule] Circuit breaker transitioned: ${previousState} -> CLOSED`);

    if (this.currentInstanceIndex !== 'primary') {
      this.restorePrimary();
    }
  }

  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.lastStateChange = Date.now();
    this.successCount = 0;
    
    console.log(`[ResilientModule] Circuit breaker transitioned: ${previousState} -> OPEN`);
  }

  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    
    console.log(`[ResilientModule] Circuit breaker transitioned: ${previousState} -> HALF_OPEN (testing recovery)`);
  }

  private tryFailover(reason: string): void {
    const currentIndex = this.currentInstanceIndex;
    
    if (this.config.backups.length === 0) {
      console.error(`[ResilientModule] No backup instances available for failover`);
      return;
    }

    let nextIndex: number;
    if (currentIndex === 'primary') {
      nextIndex = 0;
    } else {
      nextIndex = (currentIndex + 1) % this.config.backups.length;
    }

    const newInstance = this.config.backups[nextIndex];
    this.currentInstance = newInstance;
    this.currentInstanceIndex = nextIndex;
    this.healthMetrics.currentInstance = nextIndex;
    this.failoverCount++;

    console.log(`[ResilientModule] Failover: ${currentIndex} -> backup[${nextIndex}] (Reason: ${reason})`);
    
    this.failoverCallbacks.forEach(callback => {
      try {
        callback(currentIndex, nextIndex, reason);
      } catch (error) {
        console.error('[ResilientModule] Error in failover callback:', error);
      }
    });
  }

  private restorePrimary(): void {
    const previousIndex = this.currentInstanceIndex;
    this.currentInstance = this.config.primary;
    this.currentInstanceIndex = 'primary';
    this.healthMetrics.currentInstance = 'primary';

    console.log(`[ResilientModule] Restored to primary instance from backup[${previousIndex}]`);
    
    this.restoreCallbacks.forEach(callback => {
      try {
        callback('primary');
      } catch (error) {
        console.error('[ResilientModule] Error in restore callback:', error);
      }
    });
  }

  private trimCallHistory(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.callHistory = this.callHistory.filter(call => call.timestamp > oneHourAgo);
    
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    this.rollingErrors = this.rollingErrors.filter(timestamp => timestamp > fiveMinutesAgo);
  }

  private updateHealthMetrics(): void {
    if (this.healthMetrics.totalCalls > 0) {
      this.healthMetrics.errorRate = this.healthMetrics.failedCalls / this.healthMetrics.totalCalls;
    }

    if (this.callHistory.length > 0) {
      const totalDuration = this.callHistory.reduce((sum, call) => sum + call.duration, 0);
      this.healthMetrics.averageResponseTime = totalDuration / this.callHistory.length;
    }

    this.healthMetrics.uptime = Date.now() - this.startTime;
  }

  private startRecoveryMonitoring(): void {
    this.recoveryTimer = setInterval(() => {
      if (this.state === CircuitState.OPEN) {
        const timeSinceOpen = Date.now() - this.lastStateChange;
        if (timeSinceOpen >= this.config.resetTimeout) {
          this.transitionToHalfOpen();
        }
      }
    }, 10000);
  }

  getHealth(): HealthMetrics {
    this.updateHealthMetrics();
    return { ...this.healthMetrics };
  }

  getState(): CircuitState {
    return this.state;
  }

  getCircuitMetrics(): CircuitBreakerMetrics {
    const errorBudgetUsed = this.rollingErrors.length / this.config.rollingWindowSize;
    const errorBudgetRemaining = Math.max(0, this.config.errorBudget - errorBudgetUsed);

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastStateChange: this.lastStateChange,
      rollingErrors: [...this.rollingErrors],
      errorBudgetRemaining
    };
  }

  getFailoverCount(): number {
    return this.failoverCount;
  }

  getCurrentInstance(): 'primary' | number {
    return this.currentInstanceIndex;
  }

  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED && 
           this.healthMetrics.errorRate < this.config.errorBudget;
  }

  forceFailover(reason: string = 'Manual failover'): void {
    this.transitionToOpen();
    this.tryFailover(reason);
  }

  forceRestore(): void {
    this.transitionToClosed();
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.rollingErrors = [];
    this.callHistory = [];
    this.failoverCount = 0;
    this.currentInstance = this.config.primary;
    this.currentInstanceIndex = 'primary';
    this.healthMetrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      errorRate: 0,
      averageResponseTime: 0,
      uptime: Date.now() - this.startTime,
      currentInstance: 'primary'
    };
    
    console.log('[ResilientModule] System reset to initial state');
  }

  destroy(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
    }
    this.failoverCallbacks = [];
    this.restoreCallbacks = [];
  }

  wrap(): T {
    const self = this;
    return new Proxy(this.currentInstance as object, {
      get: (target: any, prop: string | symbol) => {
        const value = target[prop];
        
        if (typeof value === 'function') {
          return (...args: any[]) => {
            return self.execute(prop as keyof T, ...(args as any));
          };
        }
        
        return value;
      }
    }) as T;
  }
}

export function createResilientModule<T>(config: ResilientModuleConfig<T>): ResilientModule<T> {
  return new ResilientModule(config);
}
