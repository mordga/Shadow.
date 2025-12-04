import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { storage } from '../storage';

export interface WebSocketMessage {
  type: 'threat_update' | 'stats_update' | 'health_update' | 'incident_update' | 'simulation_update' | 'auto_healing_event' | 'escalation_alert' | 'incident_alert' | 'adaptive_learning_update';
  data: unknown;
  timestamp: number;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private statsUpdateInterval?: NodeJS.Timeout;
  private threatsUpdateInterval?: NodeJS.Timeout;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupWebSocketServer();
    this.startPeriodicUpdates();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');
      this.clients.add(ws);

      // Send initial data
      this.sendInitialData(ws);

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
        }
      });
    });
  }

  private async sendInitialData(ws: WebSocket): Promise<void> {
    try {
      // Send current stats
      const stats = await storage.getBotStats();
      this.sendToClient(ws, {
        type: 'stats_update',
        data: stats,
        timestamp: Date.now()
      });

      // Send recent threats
      const threats = await storage.getThreats(10);
      this.sendToClient(ws, {
        type: 'threat_update',
        data: threats,
        timestamp: Date.now()
      });

      // Send system health
      const health = await storage.getSystemHealth();
      this.sendToClient(ws, {
        type: 'health_update',
        data: health,
        timestamp: Date.now()
      });

      // Send recent incidents
      const incidents = await storage.getIncidents(5);
      this.sendToClient(ws, {
        type: 'incident_update',
        data: incidents,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error sending initial data:', error);
    }
  }

  private async handleClientMessage(ws: WebSocket, message: { type?: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'request_update':
        await this.sendInitialData(ws);
        break;
      
      case 'emergency_lockdown':
        // Handle emergency lockdown request
        console.log('Emergency lockdown requested');
        this.broadcast({
          type: 'incident_update',
          data: { type: 'emergency_lockdown', timestamp: Date.now() },
          timestamp: Date.now()
        });
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public broadcast(message: WebSocketMessage): void {
    this.clients.forEach(client => {
      this.sendToClient(client, message);
    });
  }

  private startPeriodicUpdates(): void {
    // Send updates every 30 seconds
    this.statsUpdateInterval = setInterval(async () => {
      try {
        const stats = await storage.getBotStats();
        const health = await storage.getSystemHealth();
        
        this.broadcast({
          type: 'stats_update',
          data: stats,
          timestamp: Date.now()
        });

        this.broadcast({
          type: 'health_update',
          data: health,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error in periodic update:', error);
      }
    }, 30000);

    // Send threat updates every 5 seconds
    this.threatsUpdateInterval = setInterval(async () => {
      try {
        const threats = await storage.getThreats(10);
        this.broadcast({
          type: 'threat_update',
          data: threats,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error in threat update:', error);
      }
    }, 5000);
  }

  destroy(): void {
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = undefined;
    }
    if (this.threatsUpdateInterval) {
      clearInterval(this.threatsUpdateInterval);
      this.threatsUpdateInterval = undefined;
    }
    this.clients.clear();
    this.wss.close();
  }

  async checkHealth(): Promise<{
    healthy: boolean;
    latency?: number;
    message?: string;
    metadata?: Record<string, any>;
  }> {
    const startTime = Date.now();

    try {
      if (!this.wss) {
        return {
          healthy: false,
          latency: Date.now() - startTime,
          message: 'WebSocket server is not initialized',
          metadata: { initialized: false }
        };
      }

      const activeConnections = this.clients.size;
      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
        message: 'WebSocket service is operational',
        metadata: {
          activeConnections,
          serverRunning: true
        }
      };
    } catch (error: any) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: `WebSocket health check failed: ${error?.message || 'Unknown error'}`,
        metadata: { error: error?.message }
      };
    }
  }
}

let websocketService: WebSocketService | null = null;

export function initializeWebSocket(server: Server): WebSocketService {
  websocketService = new WebSocketService(server);
  return websocketService;
}

export function getWebSocketService(): WebSocketService | null {
  return websocketService;
}

export async function checkWebSocketHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  message?: string;
  metadata?: Record<string, any>;
}> {
  const startTime = Date.now();
  
  try {
    if (!websocketService) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: 'WebSocket service not initialized',
        metadata: { initialized: false }
      };
    }

    return await websocketService.checkHealth();
  } catch (error: any) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      message: `WebSocket health check error: ${error?.message || 'Unknown error'}`,
      metadata: { error: error?.message }
    };
  }
}
