import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, checkStorageHealth } from "./storage";
import { insertThreatSchema, insertIncidentSchema, insertBypassPatternSchema } from "@shared/schema";
import { discordBot, checkDiscordBotHealth, checkRecoveryEngineHealth } from "./services/discord-bot";
import { securityEngine, checkSecurityEngineHealth } from "./services/security-engine";
import { checkClaudeHealth } from "./services/claude-ai";
import { initializeWebSocket, checkWebSocketHealth } from "./services/websocket";
import { getHealthMonitor } from "./services/health-monitor";
import { simulationModule } from "./services/simulation-module";
import { getHeartbeat, checkHeartbeatHealth } from "./services/heartbeat";
import { getOriHostClient, checkOriHostHealth } from "./services/orihost-client";
import { getSelfPinger } from "./services/self-pinger";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Keep-alive and status endpoints (registered FIRST before any async operations)
  // Note: For keep-alive services (UptimeRobot, Koyeb, etc.), use /api/ping or /api/status
  // The root "/" endpoint serves the frontend SPA for the web dashboard
  
  app.get("/api/ping", (req, res) => {
    res.status(200).json({
      ok: true,
      timestamp: Date.now()
    });
  });

  app.get("/api/status", async (req, res) => {
    try {
      const healthMonitor = getHealthMonitor();
      const botHealth = healthMonitor?.getModuleHealth?.('Discord Bot');
      const botConnected = botHealth?.status === 'healthy';
      
      res.status(200).json({
        service: "Discord Security Bot",
        status: "online",
        uptime: process.uptime(),
        botConnected,
        version: "1.0.0",
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        service: "Discord Security Bot",
        status: "error",
        uptime: process.uptime(),
        botConnected: false,
        version: "1.0.0",
        timestamp: Date.now()
      });
    }
  });

  app.get("/api/keepalive", async (req, res) => {
    try {
      const healthMonitor = getHealthMonitor();
      const allHealth = healthMonitor?.getAllHealth?.() || {};
      const overallHealth = healthMonitor?.getOverallHealth?.() || { 
        healthy: 0, degraded: 0, unhealthy: 0, total: 0, allHealthy: false 
      };
      
      const servicesStatus = Object.entries(allHealth).reduce((acc, [name, health]) => {
        acc[name] = (health as any).status || 'unknown';
        return acc;
      }, {} as Record<string, string>);

      const systemStatus = overallHealth.allHealthy ? 'healthy' : 
                          overallHealth.unhealthy > 0 ? 'unhealthy' : 'degraded';

      res.status(200).json({
        alive: true,
        service: "Discord Security Bot",
        status: systemStatus,
        uptime: Math.floor(process.uptime()),
        uptimeFormatted: formatUptime(process.uptime()),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: "MB"
        },
        services: servicesStatus,
        healthSummary: {
          healthy: overallHealth.healthy,
          degraded: overallHealth.degraded,
          unhealthy: overallHealth.unhealthy,
          total: overallHealth.total
        },
        version: "1.0.0",
        timestamp: Date.now(),
        host: "OriHost Compatible"
      });
    } catch (error) {
      res.status(200).json({
        alive: true,
        service: "Discord Security Bot",
        status: "degraded",
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now(),
        error: "Health check partial failure"
      });
    }
  });

  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  // Initialize WebSocket service
  initializeWebSocket(httpServer);

  // Initialize Heartbeat Service for OriHost compatibility
  // getHeartbeat now handles config updates on subsequent calls (hot reloads, restarts)
  const heartbeat = getHeartbeat({ 
    intervalMs: 15000,
    enabled: true,
    logHeartbeats: false
  });
  
  // Ensure heartbeat is started (idempotent - won't restart if already running with same config)
  const heartbeatStats = heartbeat.getStats();
  if (!heartbeatStats.isRunning && heartbeatStats.enabled) {
    heartbeat.start();
    console.log('✅ Heartbeat service started for persistent hosting');
  } else if (heartbeatStats.isRunning) {
    console.log('✅ Heartbeat service already running (persistent across hot reload)');
  } else {
    console.log('⚠️  Heartbeat service disabled by configuration');
  }

  // Initialize Self-Pinger (ENHANCED - aggressive internal keep-alive with auto-reconnection)
  const selfPinger = getSelfPinger({
    enabled: true,
    intervalMs: 15000, // Every 15 seconds - more aggressive
    port: 5000,
    logPings: false,
    checkDiscordBot: true, // Verify Discord bot health
    autoReconnect: true // Auto-reconnect if bot goes offline
  });
  selfPinger.start();
  console.log('✅ Enhanced Self-Pinger started - Bot stays alive every 15s with auto-reconnection');

  // Initialize OriHost API Client
  const oriHostClient = getOriHostClient();
  const oriHostStatus = oriHostClient.getStatus();
  if (oriHostStatus.configured) {
    console.log('✅ OriHost API Client initialized with API key');
  } else {
    console.log('⚠️  OriHost API Client initialized without API key (limited functionality)');
    console.log('   Set ORIHOST_API_KEY environment variable to enable OriHost integration');
  }

  // Initialize Health Monitor and register critical modules
  const healthMonitor = getHealthMonitor(30000);
  
  healthMonitor.registerModule(
    'Discord Bot',
    checkDiscordBotHealth,
    {
      checkInterval: 30000,
      timeout: 10000,
      failureThreshold: 3,
      enabled: true,
      metadata: { critical: true, component: 'bot', canReconnect: true }
    }
  );
  
  healthMonitor.registerModule(
    'Security Engine',
    checkSecurityEngineHealth,
    {
      checkInterval: 30000,
      timeout: 10000,
      failureThreshold: 3,
      enabled: true,
      metadata: { critical: true, component: 'security' }
    }
  );
  
  healthMonitor.registerModule(
    'Distributed AI Service',
    checkClaudeHealth,
    {
      checkInterval: 60000,
      timeout: 30000,
      failureThreshold: 2,
      enabled: true,
      metadata: { critical: true, component: 'ai', slowService: true }
    }
  );
  
  healthMonitor.registerModule(
    'Recovery Engine',
    checkRecoveryEngineHealth,
    {
      checkInterval: 45000,
      timeout: 10000,
      failureThreshold: 3,
      enabled: true,
      metadata: { critical: true, component: 'recovery' }
    }
  );
  
  healthMonitor.registerModule(
    'WebSocket Service',
    checkWebSocketHealth,
    {
      checkInterval: 30000,
      timeout: 5000,
      failureThreshold: 3,
      enabled: true,
      metadata: { critical: false, component: 'communication' }
    }
  );
  
  healthMonitor.registerModule(
    'Storage Service',
    checkStorageHealth,
    {
      checkInterval: 45000,
      timeout: 5000,
      failureThreshold: 5,
      enabled: true,
      metadata: { critical: true, component: 'storage' }
    }
  );

  healthMonitor.registerModule(
    'Heartbeat Service',
    checkHeartbeatHealth,
    {
      checkInterval: 120000,
      timeout: 5000,
      failureThreshold: 5,
      enabled: true,
      metadata: { critical: false, component: 'hosting', description: 'OriHost persistent hosting' }
    }
  );

  healthMonitor.registerModule(
    'OriHost API',
    checkOriHostHealth,
    {
      checkInterval: 180000,
      timeout: 15000,
      failureThreshold: 5,
      enabled: true,
      metadata: { critical: false, component: 'hosting-api', description: 'OriHost API integration', optional: true }
    }
  );
  
  // Set up automatic recovery mechanisms
  healthMonitor.on('health_degraded', async (event) => {
    const { moduleName, currentStatus, consecutiveFailures, error, metrics } = event;
    
    console.error(`[Auto-Recovery] Service '${moduleName}' is ${currentStatus} (${consecutiveFailures} failures)`);
    
    // Create incident log for critical services
    if (metrics.metadata?.critical) {
      try {
        await storage.createIncident({
          type: 'system',
          severity: currentStatus === 'unhealthy' ? 'critical' : 'medium',
          title: `${moduleName} Health Degradation`,
          description: `Service ${moduleName} has degraded to ${currentStatus} status after ${consecutiveFailures} consecutive failures. Error: ${error}`,
          serverId: 'system',
          serverName: 'Health Monitor',
          affectedUsers: [],
          actionsPerformed: ['health_check_failed', 'incident_logged'],
          evidence: { 
            moduleName, 
            currentStatus, 
            consecutiveFailures, 
            error,
            metrics: metrics.metadata,
            timestamp: new Date()
          }
        });
        console.log(`[Auto-Recovery] Incident created for ${moduleName}`);
      } catch (err) {
        console.error(`[Auto-Recovery] Failed to create incident:`, err);
      }
    }

    // Attempt automatic recovery for specific services
    if (moduleName === 'Discord Bot' && currentStatus === 'unhealthy') {
      console.log(`[Auto-Recovery] Attempting to reconnect Discord Bot...`);
      try {
        await discordBot.execute('reconnect');
        console.log(`[Auto-Recovery] Discord Bot reconnection initiated`);
      } catch (err) {
        console.error(`[Auto-Recovery] Failed to reconnect Discord Bot:`, err);
      }
    }
  });

  healthMonitor.on('health_recovered', async (event) => {
    const { moduleName, previousStatus, metrics } = event;
    
    console.log(`[Auto-Recovery] Service '${moduleName}' recovered from ${previousStatus} to healthy`);
    
    // Log recovery incident
    if (metrics.metadata?.critical) {
      try {
        await storage.createIncident({
          type: 'system',
          severity: 'low',
          title: `${moduleName} Service Recovered`,
          description: `Service ${moduleName} has successfully recovered from ${previousStatus} status`,
          serverId: 'system',
          serverName: 'Health Monitor',
          affectedUsers: [],
          actionsPerformed: ['service_recovered', 'health_restored'],
          evidence: { 
            moduleName, 
            previousStatus,
            currentStatus: 'healthy',
            metrics: metrics.metadata,
            timestamp: new Date()
          }
        });
        console.log(`[Auto-Recovery] Recovery logged for ${moduleName}`);
      } catch (err) {
        console.error(`[Auto-Recovery] Failed to log recovery:`, err);
      }
    }
  });

  healthMonitor.start();
  console.log('Health Monitor started with all critical services registered');
  console.log('Automatic recovery mechanisms enabled');

  // Initialize Auto-Healing System
  const { initializeAutoHealing, getAutoHealing } = await import("./services/auto-healing");
  const autoHealing = initializeAutoHealing({
    enabled: true,
    maxRemediationAttempts: 5,
    cooldownBetweenAttempts: 30000,
    autoRestartServices: true,
    notifyOnRemediation: true
  });

  // Register service restarters for auto-healing
  autoHealing.registerServiceRestarter('Discord Bot', async () => {
    try {
      await discordBot.execute('reconnect');
      return true;
    } catch (error) {
      console.error('[AutoHealing] Failed to restart Discord Bot:', error);
      return false;
    }
  });

  autoHealing.start();
  console.log('✅ Auto-Healing System started - REGENERATIVE MODE ACTIVE');

  // Initialize ML Security Engine
  const { initializeMLSecurity, getMLSecurityEngine } = await import("./services/ml-security-engine");
  const mlSecurityEngine = initializeMLSecurity();
  mlSecurityEngine.start();
  console.log('✅ ML Security Engine started - ADAPTIVE LEARNING MODE ACTIVE');

  // Run initial learning cycle in background
  setTimeout(async () => {
    try {
      await mlSecurityEngine.runLearningCycle();
      console.log('✅ Initial ML learning cycle completed');
    } catch (error) {
      console.warn('⚠️  Initial ML learning cycle failed:', error);
    }
  }, 10000);

  // Start Discord bot (with token validation)
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken || botToken.trim() === '') {
    console.warn('⚠️  DISCORD_BOT_TOKEN is not configured - Discord Bot will not start');
    console.warn('⚠️  The server will continue running in degraded mode');
    console.warn('⚠️  Set DISCORD_BOT_TOKEN and use POST /api/bot/reconnect to start the bot');
    // Note: Health monitor will automatically detect bot as unhealthy through regular checks
  } else {
    try {
      await discordBot.execute('start');
      console.log('✅ Discord bot started successfully');
    } catch (error) {
      console.error('❌ Failed to start Discord bot:', error);
      console.warn('⚠️  Server will continue running without Discord Bot');
    }
  }

  // Bot stats endpoints
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getBotStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bot stats" });
    }
  });

  app.patch("/api/stats", async (req, res) => {
    try {
      const updates = req.body;
      const stats = await storage.updateBotStats(updates);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to update bot stats" });
    }
  });

  // Bot reconnection endpoint
  app.post("/api/bot/reconnect", async (req, res) => {
    try {
      const botToken = process.env.DISCORD_BOT_TOKEN;
      
      if (!botToken || botToken.trim() === '') {
        return res.status(400).json({ 
          success: false, 
          error: "DISCORD_BOT_TOKEN is not configured. Please set the token first." 
        });
      }

      console.log('🔄 Manual bot reconnection requested...');
      await discordBot.execute('reconnect');
      
      res.json({ 
        success: true, 
        message: "Discord bot reconnection initiated. Check logs for status." 
      });
    } catch (error) {
      console.error('❌ Failed to reconnect Discord bot:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to reconnect Discord bot: " + (error as Error).message 
      });
    }
  });

  // Threat endpoints
  app.get("/api/threats", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 1000);
      const threats = await storage.getThreats(limit);
      res.json(threats);
    } catch (error) {
      console.error('Error fetching threats:', error);
      res.status(500).json({ error: "Failed to fetch threats" });
    }
  });

  app.get("/api/threats/active", async (req, res) => {
    try {
      const threats = await storage.getActiveThreats();
      res.json(threats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active threats" });
    }
  });

  app.post("/api/threats", async (req, res) => {
    try {
      const threatData = insertThreatSchema.parse(req.body);
      const threat = await storage.createThreat(threatData);
      res.status(201).json(threat);
    } catch (error) {
      res.status(400).json({ error: "Invalid threat data" });
    }
  });

  app.patch("/api/threats/:id/resolve", async (req, res) => {
    try {
      if (!req.params.id || typeof req.params.id !== 'string') {
        return res.status(400).json({ error: "Invalid threat ID" });
      }
      await storage.resolveThreat(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error resolving threat:', error);
      const message = error instanceof Error ? error.message : 'Failed to resolve threat';
      res.status(500).json({ error: message });
    }
  });

  // Bypass pattern endpoints
  app.get("/api/bypass-patterns", async (req, res) => {
    try {
      const patterns = await storage.getBypassPatterns();
      res.json(patterns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bypass patterns" });
    }
  });

  app.post("/api/bypass-patterns", async (req, res) => {
    try {
      const patternData = insertBypassPatternSchema.parse(req.body);
      const pattern = await storage.createBypassPattern(patternData);
      res.status(201).json(pattern);
    } catch (error) {
      res.status(400).json({ error: "Invalid pattern data" });
    }
  });

  // Incident endpoints
  app.get("/api/incidents", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 1000);
      const incidents = await storage.getIncidents(limit);
      res.json(incidents);
    } catch (error) {
      console.error('Error fetching incidents:', error);
      res.status(500).json({ error: "Failed to fetch incidents" });
    }
  });

  app.post("/api/incidents", async (req, res) => {
    try {
      const incidentData = insertIncidentSchema.parse(req.body);
      const incident = await storage.createIncident(incidentData);
      res.status(201).json(incident);
    } catch (error) {
      res.status(400).json({ error: "Invalid incident data" });
    }
  });

  app.patch("/api/incidents/:id/resolve", async (req, res) => {
    try {
      if (!req.params.id || typeof req.params.id !== 'string') {
        return res.status(400).json({ error: "Invalid incident ID" });
      }
      const { resolvedBy } = req.body;
      if (!resolvedBy || typeof resolvedBy !== 'string') {
        return res.status(400).json({ error: "resolvedBy is required" });
      }
      await storage.resolveIncident(req.params.id, resolvedBy);
      res.json({ success: true });
    } catch (error) {
      console.error('Error resolving incident:', error);
      const message = error instanceof Error ? error.message : 'Failed to resolve incident';
      res.status(500).json({ error: message });
    }
  });

  // System health endpoint
  app.get("/api/health", async (req, res) => {
    try {
      const health = await storage.getSystemHealth();
      res.json(health);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system health" });
    }
  });

  // Health Monitor endpoints
  app.get("/api/health/monitor", async (req, res) => {
    try {
      const allHealth = healthMonitor.getAllHealth();
      const overallHealth = healthMonitor.getOverallHealth();
      const monitorUptime = healthMonitor.getMonitorUptime();
      
      res.json({
        overall: overallHealth,
        services: allHealth,
        monitorUptime,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch health monitor data" });
    }
  });

  app.get("/api/health/monitor/:moduleName", async (req, res) => {
    try {
      const { moduleName } = req.params;
      const moduleHealth = healthMonitor.getModuleHealth(moduleName);
      
      if (!moduleHealth) {
        return res.status(404).json({ error: `Module '${moduleName}' not found` });
      }
      
      res.json(moduleHealth);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch module health" });
    }
  });

  app.get("/api/health/monitor/:moduleName/history", async (req, res) => {
    try {
      const { moduleName } = req.params;
      if (!moduleName || typeof moduleName !== 'string') {
        return res.status(400).json({ error: "Invalid module name" });
      }
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 1000);
      
      const history = await healthMonitor.getModuleHealthHistory(moduleName, limit);
      res.json(history);
    } catch (error) {
      console.error('Error fetching health history:', error);
      res.status(500).json({ error: "Failed to fetch health history" });
    }
  });

  app.get("/api/heartbeat", (req, res) => {
    try {
      const stats = heartbeat.getStats();
      res.json({
        ...stats,
        message: stats.isRunning ? "Heartbeat service active" : "Heartbeat service inactive",
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch heartbeat stats" });
    }
  });

  app.get("/api/orihost/status", (req, res) => {
    try {
      const status = oriHostClient.getStatus();
      res.json({
        ...status,
        message: status.configured 
          ? "OriHost API client configured and ready" 
          : "OriHost API client not configured - set ORIHOST_API_KEY to enable",
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch OriHost status" });
    }
  });

  app.post("/api/orihost/ping", async (req, res) => {
    try {
      const result = await oriHostClient.ping();
      res.json({
        ...result,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: "Failed to ping OriHost API",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Action endpoints (SECURITY WARNING: These endpoints have NO authentication!)
  app.post("/api/actions/emergency-lockdown", async (req, res) => {
    try {
      const { serverId } = req.body;
      if (serverId && typeof serverId !== 'string') {
        return res.status(400).json({ error: "Invalid server ID" });
      }
      await securityEngine.execute('emergencyLockdown', serverId || 'manual');
      res.json({ success: true, message: "Emergency lockdown activated" });
    } catch (error) {
      console.error('Error activating emergency lockdown:', error);
      res.status(500).json({ error: "Failed to activate emergency lockdown" });
    }
  });

  app.post("/api/actions/generate-countermeasures", async (req, res) => {
    try {
      await securityEngine.execute('generateNewCountermeasures');
      res.json({ success: true, message: "New countermeasures generated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate countermeasures" });
    }
  });

  app.post("/api/actions/status-report", async (req, res) => {
    try {
      const report = await discordBot.execute('generateStatusReport');
      res.json({ report });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate status report" });
    }
  });

  // Rutas de recuperación y templates
  app.post("/api/recovery/backup", async (req, res) => {
    try {
      const { guildId } = req.body;
      if (!guildId || typeof guildId !== 'string') {
        return res.status(400).json({ error: "guildId is required" });
      }
      const template = await discordBot.execute('createServerBackup', guildId);
      res.json({ success: true, template });
    } catch (error) {
      console.error('Error creating backup:', error);
      res.status(500).json({ error: "Failed to create backup" });
    }
  });

  app.post("/api/recovery/restore", async (req, res) => {
    try {
      const { guildId, templateId } = req.body;
      if (!guildId || typeof guildId !== 'string') {
        return res.status(400).json({ error: "guildId is required" });
      }
      if (!templateId || typeof templateId !== 'string') {
        return res.status(400).json({ error: "templateId is required" });
      }
      const report = await discordBot.execute('recoverServer', guildId, templateId);
      res.json({ success: true, report });
    } catch (error) {
      console.error('Error restoring server:', error);
      res.status(500).json({ error: "Failed to restore server" });
    }
  });

  app.post("/api/recovery/emergency", async (req, res) => {
    try {
      const { guildId } = req.body;
      if (!guildId || typeof guildId !== 'string') {
        return res.status(400).json({ error: "guildId is required" });
      }
      const report = await discordBot.execute('emergencyRecovery', guildId);
      res.json({ success: true, report });
    } catch (error) {
      console.error('Error performing emergency recovery:', error);
      res.status(500).json({ error: "Failed to perform emergency recovery" });
    }
  });

  app.get("/api/recovery/stats", async (req, res) => {
    try {
      const stats = await discordBot.execute('getRecoveryStats');
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to get recovery stats" });
    }
  });

  // Simulation endpoints
  app.post("/api/simulation/run", async (req, res) => {
    try {
      const { scenario, intensity, duration, serverId, serverName } = req.body;
      
      if (!scenario || !intensity || !duration || !serverId || !serverName) {
        return res.status(400).json({ 
          error: "Missing required fields: scenario, intensity, duration, serverId, serverName" 
        });
      }

      const result = await simulationModule.runSimulation({
        scenario,
        intensity,
        duration,
        serverId,
        serverName,
      });

      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to run simulation: " + (error as Error).message 
      });
    }
  });

  app.post("/api/simulation/stress-test", async (req, res) => {
    try {
      const { intensity, duration, serverId, serverName } = req.body;
      
      if (!intensity || !duration || !serverId || !serverName) {
        return res.status(400).json({ 
          error: "Missing required fields: intensity, duration, serverId, serverName" 
        });
      }

      const results = await simulationModule.runStressTest({
        intensity,
        duration,
        serverId,
        serverName,
      });

      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to run stress test: " + (error as Error).message 
      });
    }
  });

  app.get("/api/simulation/active", async (req, res) => {
    try {
      const activeSimulations = simulationModule.getActiveSimulations();
      res.json({ simulations: activeSimulations });
    } catch (error) {
      res.status(500).json({ error: "Failed to get active simulations" });
    }
  });

  // Auto-Healing System endpoints
  app.get("/api/auto-healing/status", async (req, res) => {
    try {
      const { getAutoHealing } = await import("./services/auto-healing");
      const autoHealing = getAutoHealing();
      const status = autoHealing.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to get auto-healing status" });
    }
  });

  app.post("/api/auto-healing/config", async (req, res) => {
    try {
      const { getAutoHealing } = await import("./services/auto-healing");
      const autoHealing = getAutoHealing();
      autoHealing.updateConfig(req.body);
      res.json({ success: true, config: autoHealing.getStatus().config });
    } catch (error) {
      res.status(500).json({ error: "Failed to update auto-healing config" });
    }
  });

  app.post("/api/auto-healing/force-remediation", async (req, res) => {
    try {
      const { moduleName } = req.body;
      if (!moduleName) {
        return res.status(400).json({ error: "moduleName is required" });
      }
      const { getAutoHealing } = await import("./services/auto-healing");
      const autoHealing = getAutoHealing();
      const result = await autoHealing.forceRemediation(moduleName);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: "Failed to force remediation" });
    }
  });

  // ML Security Engine endpoints
  app.get("/api/ml-security/status", async (req, res) => {
    try {
      const { getMLSecurityEngine } = await import("./services/ml-security-engine");
      const mlEngine = getMLSecurityEngine();
      const health = await mlEngine.healthCheck();
      res.json(health);
    } catch (error) {
      res.status(500).json({ error: "Failed to get ML security status" });
    }
  });

  app.get("/api/ml-security/metrics", async (req, res) => {
    try {
      const { getMLSecurityEngine } = await import("./services/ml-security-engine");
      const mlEngine = getMLSecurityEngine();
      const metrics = mlEngine.getMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to get ML security metrics" });
    }
  });

  app.get("/api/ml-security/models", async (req, res) => {
    try {
      const { getMLSecurityEngine } = await import("./services/ml-security-engine");
      const mlEngine = getMLSecurityEngine();
      const models = await mlEngine.exportModels();
      res.json(models);
    } catch (error) {
      res.status(500).json({ error: "Failed to export ML models" });
    }
  });

  app.post("/api/ml-security/predict", async (req, res) => {
    try {
      const { userId, serverId, content, metadata } = req.body;
      if (!userId || !serverId || !content) {
        return res.status(400).json({ error: "userId, serverId, and content are required" });
      }
      const { getMLSecurityEngine } = await import("./services/ml-security-engine");
      const mlEngine = getMLSecurityEngine();
      const features = await mlEngine.extractFeatures(userId, serverId, content, metadata || {});
      const predictions = await mlEngine.predictThreat(features);
      res.json({ features, predictions });
    } catch (error) {
      res.status(500).json({ error: "Failed to predict threat" });
    }
  });

  app.get("/api/ml-security/user-risk/:userId/:serverId", async (req, res) => {
    try {
      const { userId, serverId } = req.params;
      const { getMLSecurityEngine } = await import("./services/ml-security-engine");
      const mlEngine = getMLSecurityEngine();
      const profile = await mlEngine.assessUserRisk(userId, serverId);
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: "Failed to assess user risk" });
    }
  });

  app.post("/api/ml-security/learn", async (req, res) => {
    try {
      const { getMLSecurityEngine } = await import("./services/ml-security-engine");
      const mlEngine = getMLSecurityEngine();
      await mlEngine.runLearningCycle();
      res.json({ success: true, message: "Learning cycle completed" });
    } catch (error) {
      res.status(500).json({ error: "Failed to run learning cycle" });
    }
  });

  return httpServer;
}
