import type { HealthCheckResult } from './health-monitor';

export interface OriHostConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class OriHostClient {
  private apiKey: string | null;
  private baseUrl: string;
  private isConfigured: boolean = false;

  constructor(config?: OriHostConfig) {
    this.apiKey = config?.apiKey || process.env.ORIHOST_API_KEY || null;
    this.baseUrl = config?.baseUrl || 'https://api.orihost.com/v1';
    this.isConfigured = !!this.apiKey;

    if (this.isConfigured) {
      console.log('✅ OriHost API Client initialized with API key');
    } else {
      console.log('⚠️  OriHost API Client initialized without API key (limited functionality)');
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.isConfigured = true;
    console.log('✅ OriHost API key configured');
  }

  async ping(): Promise<{ success: boolean; message: string; latency?: number }> {
    if (!this.isConfigured) {
      return {
        success: false,
        message: 'OriHost API key not configured'
      };
    }

    try {
      const startTime = Date.now();
      
      const response = await fetch(`${this.baseUrl}/ping`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          message: 'OriHost API connection successful',
          latency
        };
      } else {
        return {
          success: false,
          message: `OriHost API returned ${response.status}: ${response.statusText}`,
          latency
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to connect to OriHost API: ${errorMessage}`
      };
    }
  }

  async getServerStats(): Promise<any> {
    if (!this.isConfigured) {
      throw new Error('OriHost API key not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/servers/stats`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`OriHost API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get server stats: ${errorMessage}`);
    }
  }

  async keepAlive(): Promise<{ success: boolean; message: string }> {
    if (!this.isConfigured) {
      return {
        success: false,
        message: 'OriHost API not configured - using local heartbeat only'
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/keepalive`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timestamp: Date.now(),
          service: 'Discord Security Bot',
          uptime: process.uptime()
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        return {
          success: true,
          message: 'OriHost keep-alive signal sent successfully'
        };
      } else {
        return {
          success: false,
          message: `OriHost keep-alive failed: ${response.status}`
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `OriHost keep-alive error: ${errorMessage}`
      };
    }
  }

  getStatus() {
    return {
      configured: this.isConfigured,
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl,
      ready: this.isReady()
    };
  }
}

let oriHostInstance: OriHostClient | null = null;

export function getOriHostClient(config?: OriHostConfig): OriHostClient {
  if (!oriHostInstance) {
    oriHostInstance = new OriHostClient(config);
  }
  return oriHostInstance;
}

export async function checkOriHostHealth(): Promise<HealthCheckResult> {
  const client = getOriHostClient();
  
  if (!client.isReady()) {
    return {
      healthy: true,
      latency: 0,
      message: 'OriHost API not configured (optional service)',
      metadata: {
        configured: false,
        optional: true
      }
    };
  }

  try {
    const result = await client.ping();
    
    return {
      healthy: result.success,
      latency: result.latency || 0,
      message: result.message,
      metadata: {
        configured: true,
        baseUrl: client.getStatus().baseUrl
      }
    };
  } catch (error) {
    return {
      healthy: false,
      latency: 0,
      message: 'OriHost API health check failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
      metadata: {
        configured: true,
        error: true
      }
    };
  }
}
