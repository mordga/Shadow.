import type { HealthCheckResult } from './health-monitor';

export interface RailwayConfig {
  apiToken?: string;
  teamToken?: string;
  projectToken?: string;
}

export interface RailwayProject {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RailwayDeployment {
  id: string;
  status: string;
  createdAt: string;
  meta?: {
    image?: string;
    serviceId?: string;
  };
}

export interface RailwayService {
  id: string;
  name: string;
  projectId: string;
}

export class RailwayClient {
  private apiToken: string | null;
  private teamToken: string | null;
  private projectToken: string | null;
  private baseUrl: string;
  private isConfigured: boolean = false;

  constructor(config?: RailwayConfig) {
    this.apiToken = config?.apiToken || process.env.RAILWAY_API_TOKEN || null;
    this.teamToken = config?.teamToken || process.env.RAILWAY_TEAM_TOKEN || null;
    this.projectToken = config?.projectToken || process.env.RAILWAY_PROJECT_TOKEN || null;
    this.baseUrl = 'https://backboard.railway.com/graphql/v2';
    this.isConfigured = !!(this.apiToken || this.teamToken || this.projectToken);

    if (this.isConfigured) {
      console.log('✅ Railway API Client initialized with token');
    } else {
      console.log('⚠️  Railway API Client initialized without token (limited functionality)');
      console.log('   Set RAILWAY_API_TOKEN environment variable to enable Railway integration');
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }

  getApiToken(): string | null {
    return this.apiToken;
  }

  setApiToken(token: string): void {
    this.apiToken = token;
    this.isConfigured = true;
    console.log('✅ Railway API token configured');
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    } else if (this.teamToken) {
      headers['Team-Access-Token'] = this.teamToken;
    } else if (this.projectToken) {
      headers['Project-Access-Token'] = this.projectToken;
    }

    return headers;
  }

  private async executeQuery<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`Railway API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.errors && result.errors.length > 0) {
      throw new Error(`Railway GraphQL error: ${result.errors[0].message}`);
    }

    return result.data;
  }

  async ping(): Promise<{ success: boolean; message: string; latency?: number }> {
    if (!this.isConfigured) {
      return {
        success: false,
        message: 'Railway API token not configured'
      };
    }

    try {
      const startTime = Date.now();
      
      const query = `query { me { name email } }`;
      await this.executeQuery(query);

      const latency = Date.now() - startTime;

      return {
        success: true,
        message: 'Railway API connection successful',
        latency
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to connect to Railway API: ${errorMessage}`
      };
    }
  }

  async getMe(): Promise<{ name: string; email: string; id: string } | null> {
    if (!this.isConfigured) {
      throw new Error('Railway API token not configured');
    }

    try {
      const query = `query { me { id name email } }`;
      const data = await this.executeQuery<{ me: { id: string; name: string; email: string } }>(query);
      return data.me;
    } catch (error) {
      console.error('Railway getMe error:', error);
      return null;
    }
  }

  async getProjects(): Promise<RailwayProject[]> {
    if (!this.isConfigured) {
      throw new Error('Railway API token not configured');
    }

    try {
      const query = `
        query {
          me {
            projects {
              edges {
                node {
                  id
                  name
                  description
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }
      `;
      
      const data = await this.executeQuery<{ me: { projects: { edges: { node: RailwayProject }[] } } }>(query);
      return data.me.projects.edges.map(edge => edge.node);
    } catch (error) {
      console.error('Railway getProjects error:', error);
      return [];
    }
  }

  async getProjectServices(projectId: string): Promise<RailwayService[]> {
    if (!this.isConfigured) {
      throw new Error('Railway API token not configured');
    }

    try {
      const query = `
        query($projectId: String!) {
          project(id: $projectId) {
            services {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      `;
      
      const data = await this.executeQuery<{ project: { services: { edges: { node: RailwayService }[] } } }>(
        query, 
        { projectId }
      );
      return data.project.services.edges.map(edge => ({ ...edge.node, projectId }));
    } catch (error) {
      console.error('Railway getProjectServices error:', error);
      return [];
    }
  }

  async getDeployments(projectId: string): Promise<RailwayDeployment[]> {
    if (!this.isConfigured) {
      throw new Error('Railway API token not configured');
    }

    try {
      const query = `
        query($projectId: String!) {
          project(id: $projectId) {
            deployments(first: 10) {
              edges {
                node {
                  id
                  status
                  createdAt
                  meta
                }
              }
            }
          }
        }
      `;
      
      const data = await this.executeQuery<{ project: { deployments: { edges: { node: RailwayDeployment }[] } } }>(
        query, 
        { projectId }
      );
      return data.project.deployments.edges.map(edge => edge.node);
    } catch (error) {
      console.error('Railway getDeployments error:', error);
      return [];
    }
  }

  async getServerStats(): Promise<{
    totalProjects: number;
    totalServices: number;
    accountName: string;
    accountEmail: string;
  }> {
    if (!this.isConfigured) {
      throw new Error('Railway API token not configured');
    }

    try {
      const me = await this.getMe();
      const projects = await this.getProjects();
      
      let totalServices = 0;
      for (const project of projects.slice(0, 5)) {
        const services = await this.getProjectServices(project.id);
        totalServices += services.length;
      }

      return {
        totalProjects: projects.length,
        totalServices,
        accountName: me?.name || 'Unknown',
        accountEmail: me?.email || 'Unknown'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get server stats: ${errorMessage}`);
    }
  }

  async keepAlive(): Promise<{ success: boolean; message: string }> {
    if (!this.isConfigured) {
      return {
        success: false,
        message: 'Railway API not configured - using local heartbeat only'
      };
    }

    try {
      const result = await this.ping();
      
      if (result.success) {
        return {
          success: true,
          message: `Railway keep-alive successful (latency: ${result.latency}ms)`
        };
      } else {
        return {
          success: false,
          message: `Railway keep-alive failed: ${result.message}`
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Railway keep-alive error: ${errorMessage}`
      };
    }
  }

  getStatus() {
    return {
      configured: this.isConfigured,
      hasApiToken: !!this.apiToken,
      hasTeamToken: !!this.teamToken,
      hasProjectToken: !!this.projectToken,
      baseUrl: this.baseUrl,
      ready: this.isReady()
    };
  }
}

let railwayInstance: RailwayClient | null = null;

export function getRailwayClient(config?: RailwayConfig): RailwayClient {
  if (!railwayInstance) {
    railwayInstance = new RailwayClient(config);
  }
  return railwayInstance;
}

export async function checkRailwayHealth(): Promise<HealthCheckResult> {
  const client = getRailwayClient();
  
  if (!client.isReady()) {
    return {
      healthy: true,
      latency: 0,
      message: 'Railway API not configured (optional service)',
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
      message: 'Railway API health check failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
      metadata: {
        configured: true,
        error: true
      }
    };
  }
}
