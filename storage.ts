import { 
  type Threat, type InsertThreat,
  type BotStats, type InsertBotStats,
  type BypassPattern, type InsertBypassPattern,
  type Incident, type InsertIncident,
  type SystemHealth, type InsertSystemHealth,
  type User, type InsertUser,
  type QuarantinedUser, type InsertQuarantinedUser,
  type UserReputation, type InsertUserReputation,
  type CommandLog, type InsertCommandLog,
  type ServerBackup, type InsertServerBackup,
  type SecurityConfig, type InsertSecurityConfig,
  type UserSecurityOverride, type InsertUserSecurityOverride,
  type HealthEvent, type InsertHealthEvent,
  type MessageTrace, type InsertMessageTrace,
  type MessageDeletion, type InsertMessageDeletion,
  type AiEngineAudit, type InsertAiEngineAudit
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Threat methods
  createThreat(threat: InsertThreat): Promise<Threat>;
  getThreats(limit?: number): Promise<Threat[]>;
  getThreatsByType(type: string, limit?: number): Promise<Threat[]>;
  getActiveThreats(): Promise<Threat[]>;
  resolveThreat(id: string): Promise<void>;

  // Bot stats methods
  getBotStats(): Promise<BotStats | undefined>;
  updateBotStats(stats: Partial<InsertBotStats>): Promise<BotStats>;

  // Bypass pattern methods
  getBypassPatterns(): Promise<BypassPattern[]>;
  createBypassPattern(pattern: InsertBypassPattern): Promise<BypassPattern>;
  updateBypassPattern(id: string, updates: Partial<BypassPattern>): Promise<void>;
  incrementPatternDetection(id: string): Promise<void>;

  // Incident methods
  createIncident(incident: InsertIncident): Promise<Incident>;
  getIncidents(limit?: number): Promise<Incident[]>;
  getActiveIncidents(): Promise<Incident[]>;
  resolveIncident(id: string, resolvedBy: string): Promise<void>;

  // System health methods
  getSystemHealth(): Promise<SystemHealth | undefined>;
  updateSystemHealth(health: InsertSystemHealth): Promise<SystemHealth>;

  // Quarantined users methods
  createQuarantinedUser(data: InsertQuarantinedUser): Promise<QuarantinedUser>;
  getQuarantinedUsers(serverId?: string): Promise<QuarantinedUser[]>;
  getQuarantinedUser(userId: string, serverId: string): Promise<QuarantinedUser | null>;
  releaseQuarantinedUser(userId: string, serverId: string): Promise<void>;
  deleteQuarantinedUser(id: string): Promise<void>;

  // User reputation methods
  createOrUpdateUserReputation(data: Partial<InsertUserReputation> & {userId: string, serverId: string}): Promise<UserReputation>;
  getUserReputation(userId: string, serverId: string): Promise<UserReputation | null>;
  updateUserReputationScore(userId: string, serverId: string, scoreChange: number, isViolation: boolean): Promise<UserReputation>;
  getAllReputations(serverId?: string): Promise<UserReputation[]>;

  // Command logs methods
  createCommandLog(data: InsertCommandLog): Promise<CommandLog>;
  getCommandLogs(filters?: {serverId?: string, userId?: string, commandName?: string, limit?: number}): Promise<CommandLog[]>;
  getCommandLogById(id: string): Promise<CommandLog | null>;

  // Server backups methods
  createServerBackup(data: InsertServerBackup): Promise<ServerBackup>;
  getServerBackups(serverId: string): Promise<ServerBackup[]>;
  getServerBackupById(id: string): Promise<ServerBackup | null>;
  deleteServerBackup(id: string): Promise<void>;

  // Security config methods
  createOrUpdateSecurityConfig(data: Partial<InsertSecurityConfig> & {serverId: string}): Promise<SecurityConfig>;
  getSecurityConfig(serverId: string): Promise<SecurityConfig | null>;
  updateSecurityConfig(serverId: string, updates: Partial<InsertSecurityConfig>): Promise<SecurityConfig>;

  // User security override methods
  createUserSecurityOverride(data: InsertUserSecurityOverride): Promise<UserSecurityOverride>;
  getUserSecurityOverride(userId: string, serverId: string): Promise<UserSecurityOverride | null>;
  getUserSecurityOverrides(serverId: string): Promise<UserSecurityOverride[]>;
  updateUserSecurityOverride(userId: string, serverId: string, updates: Partial<InsertUserSecurityOverride>): Promise<UserSecurityOverride>;
  deleteUserSecurityOverride(userId: string, serverId: string): Promise<void>;

  // Health event methods
  createHealthEvent(event: InsertHealthEvent): Promise<HealthEvent>;
  getHealthEvents(moduleName?: string, limit?: number): Promise<HealthEvent[]>;
  getLatestHealthEvent(moduleName: string): Promise<HealthEvent | null>;

  // Message trace methods
  createMessageTrace(data: InsertMessageTrace): Promise<MessageTrace>;
  getMessageTraces(filters?: {serverId?: string, userId?: string, decision?: string, limit?: number}): Promise<MessageTrace[]>;

  // Message deletion methods
  createMessageDeletion(data: InsertMessageDeletion): Promise<MessageDeletion>;
  getMessageDeletions(filters?: {serverId?: string, userId?: string, channelId?: string, limit?: number}): Promise<MessageDeletion[]>;
  getMessageDeletionStats(serverId?: string): Promise<{total: number, byReason: Record<string, number>, byThreatType: Record<string, number>}>;

  // Protected users methods
  addProtectedUser(userId: string, serverId: string): Promise<void>;
  removeProtectedUser(userId: string, serverId: string): Promise<void>;
  isUserProtected(userId: string, serverId: string): Promise<boolean>;
  getProtectedUsers(serverId: string): Promise<string[]>;

  // AI Engine Audit methods
  createAiEngineAudit(data: InsertAiEngineAudit): Promise<AiEngineAudit>;
  getAiEngineAudits(filters?: {engineName?: string, taskType?: string, success?: boolean, limit?: number}): Promise<AiEngineAudit[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private threats: Map<string, Threat>;
  private botStats: BotStats | undefined;
  private bypassPatterns: Map<string, BypassPattern>;
  private incidents: Map<string, Incident>;
  private systemHealth: SystemHealth | undefined;
  private quarantinedUsers: Map<string, QuarantinedUser>;
  private userReputations: Map<string, UserReputation>;
  private commandLogs: Map<string, CommandLog>;
  private serverBackups: Map<string, ServerBackup>;
  private securityConfigs: Map<string, SecurityConfig>;
  private userSecurityOverrides: Map<string, UserSecurityOverride>;
  private healthEvents: Map<string, HealthEvent>;
  private messageTraces: Map<string, MessageTrace>;
  private messageDeletions: Map<string, MessageDeletion>;
  private protectedUsers: Map<string, Set<string>>;
  private aiEngineAudits: Map<string, AiEngineAudit>;
  
  private readonly MAX_THREATS = 5000;
  private readonly MAX_INCIDENTS = 2000;
  private readonly MAX_COMMAND_LOGS = 10000;
  private readonly MAX_HEALTH_EVENTS = 5000;
  private readonly MAX_SERVER_BACKUPS_PER_SERVER = 10;
  private readonly MAX_MESSAGE_TRACES = 20000;
  private readonly MAX_MESSAGE_DELETIONS = 10000;
  private readonly MAX_AI_ENGINE_AUDITS = 10000;

  private validateId(id: string, fieldName: string = 'ID'): void {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error(`Invalid ${fieldName}: must be a non-empty string`);
    }
    if (id.length > 255) {
      throw new Error(`Invalid ${fieldName}: too long (max 255 characters)`);
    }
  }

  private validateServerId(serverId: string): void {
    this.validateId(serverId, 'serverId');
  }

  private validateUserId(userId: string): void {
    this.validateId(userId, 'userId');
  }

  constructor() {
    this.users = new Map();
    this.threats = new Map();
    this.bypassPatterns = new Map();
    this.incidents = new Map();
    this.quarantinedUsers = new Map();
    this.userReputations = new Map();
    this.commandLogs = new Map();
    this.serverBackups = new Map();
    this.securityConfigs = new Map();
    this.userSecurityOverrides = new Map();
    this.healthEvents = new Map();
    this.messageTraces = new Map();
    this.messageDeletions = new Map();
    this.protectedUsers = new Map();
    this.aiEngineAudits = new Map();
    
    // Initialize with default bot stats
    this.botStats = {
      id: randomUUID(),
      threatsBlocked: 0,
      activeRaids: 0,
      nsfwDetected: 0,
      bypassAttempts: 0,
      detectionRate: "99.2%",
      uptime: "0d 0h 0m",
      memoryUsage: "340MB",
      apiLatency: "45ms",
      activeServers: 0,
      lastUpdated: new Date(),
    };

    // Initialize system health
    this.systemHealth = {
      id: randomUUID(),
      cpuUsage: 23,
      ramUsage: 67,
      networkIO: "142KB/s",
      systemStatus: "operational",
      protectionModules: {
        antiRaid: "active",
        nsfwDetection: "active",
        spamFilter: "active",
        bypassDetection: "learning"
      },
      timestamp: new Date(),
    };
  }

  async getUser(id: string): Promise<User | undefined> {
    this.validateId(id, 'user ID');
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!username || typeof username !== 'string') {
      throw new Error('Invalid username');
    }
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createThreat(insertThreat: InsertThreat): Promise<Threat> {
    // Validate and sanitize inputs
    if (!insertThreat.type || typeof insertThreat.type !== 'string') {
      throw new Error('Invalid threat type');
    }
    if (!insertThreat.severity || typeof insertThreat.severity !== 'string') {
      throw new Error('Invalid threat severity');
    }
    if (!insertThreat.action || typeof insertThreat.action !== 'string') {
      throw new Error('Invalid threat action');
    }
    
    // Enforce memory limits
    if (this.threats.size >= this.MAX_THREATS) {
      // Remove oldest resolved threats
      const sortedThreats = Array.from(this.threats.entries())
        .filter(([_, t]) => t.resolved)
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());
      
      if (sortedThreats.length > 0) {
        this.threats.delete(sortedThreats[0][0]);
      } else {
        // If no resolved threats, remove oldest threat
        const oldest = Array.from(this.threats.entries())
          .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
        if (oldest) this.threats.delete(oldest[0]);
      }
    }
    
    const id = randomUUID();
    const threat: Threat = { 
      ...insertThreat,
      userId: insertThreat.userId || null,
      username: insertThreat.username || null,
      id, 
      timestamp: new Date(),
      resolved: false,
      metadata: insertThreat.metadata || null
    };
    this.threats.set(id, threat);
    
    // Update bot stats
    if (this.botStats) {
      this.botStats.threatsBlocked++;
      if (insertThreat.type === 'raid') {
        this.botStats.activeRaids++;
      } else if (insertThreat.type === 'nsfw') {
        this.botStats.nsfwDetected++;
      } else if (insertThreat.type === 'bypass') {
        this.botStats.bypassAttempts++;
      }
      this.botStats.lastUpdated = new Date();
    }
    
    return threat;
  }

  async getThreats(limit: number = 50): Promise<Threat[]> {
    const allThreats = Array.from(this.threats.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return allThreats.slice(0, limit);
  }

  async getThreatsByType(type: string, limit: number = 50): Promise<Threat[]> {
    const filteredThreats = Array.from(this.threats.values())
      .filter(threat => threat.type === type)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return filteredThreats.slice(0, limit);
  }

  async getActiveThreats(): Promise<Threat[]> {
    return Array.from(this.threats.values())
      .filter(threat => !threat.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async resolveThreat(id: string): Promise<void> {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid threat ID');
    }
    
    const threat = this.threats.get(id);
    if (!threat) {
      throw new Error('Threat not found');
    }
    
    threat.resolved = true;
    if (threat.type === 'raid' && this.botStats) {
      this.botStats.activeRaids = Math.max(0, this.botStats.activeRaids - 1);
    }
  }

  async getBotStats(): Promise<BotStats | undefined> {
    return this.botStats;
  }

  async updateBotStats(stats: Partial<InsertBotStats>): Promise<BotStats> {
    if (this.botStats) {
      Object.assign(this.botStats, stats, { lastUpdated: new Date() });
    } else {
      this.botStats = {
        id: randomUUID(),
        threatsBlocked: 0,
        activeRaids: 0,
        nsfwDetected: 0,
        bypassAttempts: 0,
        detectionRate: "99.2%",
        uptime: "0d 0h 0m",
        memoryUsage: "340MB",
        apiLatency: "45ms",
        activeServers: 0,
        lastUpdated: new Date(),
        ...stats,
      };
    }
    return this.botStats;
  }

  async getBypassPatterns(): Promise<BypassPattern[]> {
    return Array.from(this.bypassPatterns.values())
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  async createBypassPattern(insertPattern: InsertBypassPattern): Promise<BypassPattern> {
    const id = randomUUID();
    const pattern: BypassPattern = {
      ...insertPattern,
      id,
      detectedCount: 0,
      firstSeen: new Date(),
      lastSeen: new Date(),
      active: true,
      countermeasure: insertPattern.countermeasure || null,
    };
    this.bypassPatterns.set(id, pattern);
    return pattern;
  }

  async updateBypassPattern(id: string, updates: Partial<BypassPattern>): Promise<void> {
    this.validateId(id, 'pattern ID');
    const pattern = this.bypassPatterns.get(id);
    if (!pattern) {
      throw new Error(`Bypass pattern ${id} not found`);
    }
    if (updates && typeof updates === 'object') {
      Object.assign(pattern, updates);
    }
  }

  async incrementPatternDetection(id: string): Promise<void> {
    this.validateId(id, 'pattern ID');
    const pattern = this.bypassPatterns.get(id);
    if (!pattern) {
      throw new Error(`Bypass pattern ${id} not found`);
    }
    pattern.detectedCount++;
    pattern.lastSeen = new Date();
  }

  async createIncident(insertIncident: InsertIncident): Promise<Incident> {
    // Validate inputs
    if (!insertIncident.type || typeof insertIncident.type !== 'string') {
      throw new Error('Invalid incident type');
    }
    if (!insertIncident.severity || typeof insertIncident.severity !== 'string') {
      throw new Error('Invalid incident severity');
    }
    
    // Enforce memory limits
    if (this.incidents.size >= this.MAX_INCIDENTS) {
      const sortedIncidents = Array.from(this.incidents.entries())
        .filter(([_, i]) => i.resolved)
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());
      
      if (sortedIncidents.length > 0) {
        this.incidents.delete(sortedIncidents[0][0]);
      } else {
        const oldest = Array.from(this.incidents.entries())
          .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
        if (oldest) this.incidents.delete(oldest[0]);
      }
    }
    
    const id = randomUUID();
    const incident: Incident = {
      ...insertIncident,
      id,
      timestamp: new Date(),
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      affectedUsers: insertIncident.affectedUsers || null,
      actionsPerformed: insertIncident.actionsPerformed || null,
      evidence: insertIncident.evidence || null,
    };
    this.incidents.set(id, incident);
    return incident;
  }

  async getIncidents(limit: number = 50): Promise<Incident[]> {
    const allIncidents = Array.from(this.incidents.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return allIncidents.slice(0, limit);
  }

  async getActiveIncidents(): Promise<Incident[]> {
    return Array.from(this.incidents.values())
      .filter(incident => !incident.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async resolveIncident(id: string, resolvedBy: string): Promise<void> {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid incident ID');
    }
    if (!resolvedBy || typeof resolvedBy !== 'string') {
      throw new Error('Invalid resolvedBy parameter');
    }
    
    const incident = this.incidents.get(id);
    if (!incident) {
      throw new Error('Incident not found');
    }
    
    incident.resolved = true;
    incident.resolvedBy = resolvedBy;
    incident.resolvedAt = new Date();
  }

  async getSystemHealth(): Promise<SystemHealth | undefined> {
    return this.systemHealth;
  }

  async updateSystemHealth(health: InsertSystemHealth): Promise<SystemHealth> {
    const defaultHealth = {
      cpuUsage: 23,
      ramUsage: 67,
      networkIO: "142KB/s",
      systemStatus: "operational",
      protectionModules: {
        antiRaid: "active",
        nsfwDetection: "active", 
        spamFilter: "active",
        bypassDetection: "learning"
      }
    };
    
    if (this.systemHealth) {
      Object.assign(this.systemHealth, { ...defaultHealth, ...health }, { timestamp: new Date() });
    } else {
      this.systemHealth = {
        id: randomUUID(),
        timestamp: new Date(),
        ...defaultHealth,
        ...health,
      };
    }
    return this.systemHealth;
  }

  async createQuarantinedUser(insertData: InsertQuarantinedUser): Promise<QuarantinedUser> {
    const id = randomUUID();
    const quarantinedUser: QuarantinedUser = {
      ...insertData,
      id,
      quarantinedAt: new Date(),
      released: false,
      releasedAt: null,
      releaseAt: insertData.releaseAt || null,
      metadata: insertData.metadata || null,
    };
    this.quarantinedUsers.set(id, quarantinedUser);
    return quarantinedUser;
  }

  async getQuarantinedUsers(serverId?: string): Promise<QuarantinedUser[]> {
    const allUsers = Array.from(this.quarantinedUsers.values());
    if (serverId) {
      return allUsers
        .filter(user => user.serverId === serverId)
        .sort((a, b) => b.quarantinedAt.getTime() - a.quarantinedAt.getTime());
    }
    return allUsers.sort((a, b) => b.quarantinedAt.getTime() - a.quarantinedAt.getTime());
  }

  async getQuarantinedUser(userId: string, serverId: string): Promise<QuarantinedUser | null> {
    const user = Array.from(this.quarantinedUsers.values()).find(
      u => u.userId === userId && u.serverId === serverId && !u.released
    );
    return user || null;
  }

  async releaseQuarantinedUser(userId: string, serverId: string): Promise<void> {
    this.validateUserId(userId);
    this.validateServerId(serverId);
    
    const user = Array.from(this.quarantinedUsers.values()).find(
      u => u.userId === userId && u.serverId === serverId && !u.released
    );
    if (user) {
      user.released = true;
      user.releasedAt = new Date();
    }
  }

  async deleteQuarantinedUser(id: string): Promise<void> {
    this.validateId(id, 'quarantined user ID');
    if (!this.quarantinedUsers.has(id)) {
      throw new Error(`Quarantined user ${id} not found`);
    }
    this.quarantinedUsers.delete(id);
  }

  async createOrUpdateUserReputation(data: Partial<InsertUserReputation> & {userId: string, serverId: string}): Promise<UserReputation> {
    this.validateUserId(data.userId);
    this.validateServerId(data.serverId);
    
    const existing = Array.from(this.userReputations.values()).find(
      r => r.userId === data.userId && r.serverId === data.serverId
    );

    if (existing) {
      if (data.username !== undefined && typeof data.username === 'string') {
        existing.username = data.username;
      }
      if (data.serverName !== undefined && typeof data.serverName === 'string') {
        existing.serverName = data.serverName;
      }
      if (data.metadata !== undefined) existing.metadata = data.metadata;
      if (data.lastViolation !== undefined) existing.lastViolation = data.lastViolation;
      existing.lastUpdate = new Date();
      return existing;
    }

    const id = randomUUID();
    const reputation: UserReputation = {
      id,
      userId: data.userId,
      username: data.username || 'Unknown',
      serverId: data.serverId,
      serverName: data.serverName || 'Unknown Server',
      score: 100,
      violations: 0,
      positiveActions: 0,
      trustLevel: 'new',
      lastViolation: data.lastViolation || null,
      lastUpdate: new Date(),
      metadata: data.metadata || null,
    };
    this.userReputations.set(id, reputation);
    return reputation;
  }

  async getUserReputation(userId: string, serverId: string): Promise<UserReputation | null> {
    this.validateUserId(userId);
    this.validateServerId(serverId);
    
    const reputation = Array.from(this.userReputations.values()).find(
      r => r.userId === userId && r.serverId === serverId
    );
    return reputation || null;
  }

  async updateUserReputationScore(userId: string, serverId: string, scoreChange: number, isViolation: boolean): Promise<UserReputation> {
    this.validateUserId(userId);
    this.validateServerId(serverId);
    
    if (typeof scoreChange !== 'number' || isNaN(scoreChange)) {
      throw new Error('Invalid scoreChange: must be a valid number');
    }
    if (typeof isViolation !== 'boolean') {
      throw new Error('Invalid isViolation: must be a boolean');
    }
    
    let reputation = await this.getUserReputation(userId, serverId);
    
    if (!reputation) {
      reputation = await this.createOrUpdateUserReputation({
        userId,
        serverId,
        username: 'Unknown',
        serverName: 'Unknown Server',
      });
    }

    reputation.score = Math.max(0, Math.min(100, reputation.score + scoreChange));
    
    if (isViolation) {
      reputation.violations++;
      reputation.lastViolation = new Date();
    } else {
      reputation.positiveActions++;
    }

    if (reputation.score >= 90) {
      reputation.trustLevel = 'verified';
    } else if (reputation.score >= 70) {
      reputation.trustLevel = 'trusted';
    } else if (reputation.score >= 50) {
      reputation.trustLevel = 'neutral';
    } else if (reputation.score >= 30) {
      reputation.trustLevel = 'untrusted';
    } else {
      reputation.trustLevel = 'new';
    }

    reputation.lastUpdate = new Date();
    return reputation;
  }

  async getAllReputations(serverId?: string): Promise<UserReputation[]> {
    const allReputations = Array.from(this.userReputations.values());
    if (serverId) {
      return allReputations
        .filter(r => r.serverId === serverId)
        .sort((a, b) => b.score - a.score);
    }
    return allReputations.sort((a, b) => b.score - a.score);
  }

  async createCommandLog(insertData: InsertCommandLog): Promise<CommandLog> {
    // FIFO (First In, First Out) implementation for log rotation
    // When we reach the maximum number of logs (10,000), we automatically remove the oldest log
    // This ensures we always keep the most recent logs and don't run out of memory
    if (this.commandLogs.size >= this.MAX_COMMAND_LOGS) {
      const oldest = Array.from(this.commandLogs.entries())
        .sort((a, b) => a[1].executedAt.getTime() - b[1].executedAt.getTime())[0]; // Sort ascending: oldest first
      if (oldest) this.commandLogs.delete(oldest[0]);
    }
    
    const id = randomUUID();
    const commandLog: CommandLog = {
      ...insertData,
      id,
      executedAt: new Date(),
      parameters: insertData.parameters || null,
      result: insertData.result || null,
      metadata: insertData.metadata || null,
    };
    this.commandLogs.set(id, commandLog);
    return commandLog;
  }

  async getCommandLogs(filters?: {serverId?: string, userId?: string, commandName?: string, limit?: number}): Promise<CommandLog[]> {
    let logs = Array.from(this.commandLogs.values());

    // Apply filters if provided
    if (filters) {
      if (filters.serverId) {
        logs = logs.filter(log => log.serverId === filters.serverId);
      }
      if (filters.userId) {
        logs = logs.filter(log => log.userId === filters.userId);
      }
      if (filters.commandName) {
        logs = logs.filter(log => log.commandName === filters.commandName);
      }
    }

    // Sort logs by execution time: NEWEST FIRST (descending order)
    // This ensures .slice(0, N) always returns the most recent logs, not the oldest
    logs.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());

    // Apply limit after sorting to get the most recent N logs
    if (filters?.limit) {
      return logs.slice(0, filters.limit);
    }

    return logs;
  }

  async getCommandLogById(id: string): Promise<CommandLog | null> {
    this.validateId(id, 'command log ID');
    return this.commandLogs.get(id) || null;
  }

  async createServerBackup(insertData: InsertServerBackup): Promise<ServerBackup> {
    this.validateServerId(insertData.serverId);
    
    // Enforce per-server backup limits
    const serverBackups = Array.from(this.serverBackups.values())
      .filter(b => b.serverId === insertData.serverId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    if (serverBackups.length >= this.MAX_SERVER_BACKUPS_PER_SERVER) {
      // Remove oldest backup for this server
      const oldestBackup = serverBackups[serverBackups.length - 1];
      const oldestId = Array.from(this.serverBackups.entries())
        .find(([_, b]) => b === oldestBackup)?.[0];
      if (oldestId) this.serverBackups.delete(oldestId);
    }
    
    const id = randomUUID();
    const backup: ServerBackup = {
      ...insertData,
      id,
      createdAt: new Date(),
      metadata: insertData.metadata || null,
    };
    this.serverBackups.set(id, backup);
    return backup;
  }

  async getServerBackups(serverId: string): Promise<ServerBackup[]> {
    this.validateServerId(serverId);
    
    return Array.from(this.serverBackups.values())
      .filter(backup => backup.serverId === serverId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getServerBackupById(id: string): Promise<ServerBackup | null> {
    this.validateId(id, 'backup ID');
    return this.serverBackups.get(id) || null;
  }

  async deleteServerBackup(id: string): Promise<void> {
    this.validateId(id, 'backup ID');
    if (!this.serverBackups.has(id)) {
      throw new Error(`Server backup ${id} not found`);
    }
    this.serverBackups.delete(id);
  }

  async createOrUpdateSecurityConfig(data: Partial<InsertSecurityConfig> & {serverId: string}): Promise<SecurityConfig> {
    this.validateServerId(data.serverId);
    
    const existing = Array.from(this.securityConfigs.values()).find(
      config => config.serverId === data.serverId
    );

    if (existing) {
      if (data.serverName !== undefined && typeof data.serverName === 'string') {
        existing.serverName = data.serverName;
      }
      if (data.logChannelId !== undefined && typeof data.logChannelId === 'string') {
        existing.logChannelId = data.logChannelId;
      }
      if (data.antiRaidEnabled !== undefined && typeof data.antiRaidEnabled === 'boolean') {
        existing.antiRaidEnabled = data.antiRaidEnabled;
      }
      if (data.antiSpamEnabled !== undefined && typeof data.antiSpamEnabled === 'boolean') {
        existing.antiSpamEnabled = data.antiSpamEnabled;
      }
      if (data.nsfwDetectionEnabled !== undefined) existing.nsfwDetectionEnabled = data.nsfwDetectionEnabled;
      if (data.bypassDetectionEnabled !== undefined) existing.bypassDetectionEnabled = data.bypassDetectionEnabled;
      if (data.quarantineEnabled !== undefined) existing.quarantineEnabled = data.quarantineEnabled;
      if (data.aggressivenessLevel !== undefined) existing.aggressivenessLevel = data.aggressivenessLevel;
      if (data.aiConfidenceFloor !== undefined) existing.aiConfidenceFloor = data.aiConfidenceFloor;
      if (data.lastAggressionUpdate !== undefined) existing.lastAggressionUpdate = data.lastAggressionUpdate;
      if (data.autoLearnEnabled !== undefined) existing.autoLearnEnabled = data.autoLearnEnabled;
      if (data.customRules !== undefined) existing.customRules = data.customRules;
      if (data.updatedBy !== undefined) existing.updatedBy = data.updatedBy;
      existing.updatedAt = new Date();
      return existing;
    }

    const id = randomUUID();
    const config: SecurityConfig = {
      id,
      serverId: data.serverId,
      serverName: data.serverName || 'Unknown Server',
      logChannelId: data.logChannelId || null,
      antiRaidEnabled: data.antiRaidEnabled !== undefined ? data.antiRaidEnabled : true,
      antiSpamEnabled: data.antiSpamEnabled !== undefined ? data.antiSpamEnabled : true,
      nsfwDetectionEnabled: data.nsfwDetectionEnabled !== undefined ? data.nsfwDetectionEnabled : true,
      bypassDetectionEnabled: data.bypassDetectionEnabled !== undefined ? data.bypassDetectionEnabled : true,
      quarantineEnabled: data.quarantineEnabled !== undefined ? data.quarantineEnabled : true,
      aggressivenessLevel: data.aggressivenessLevel !== undefined ? data.aggressivenessLevel : 5,
      aiConfidenceFloor: data.aiConfidenceFloor || null,
      lastAggressionUpdate: data.lastAggressionUpdate || null,
      autoLearnEnabled: data.autoLearnEnabled !== undefined ? data.autoLearnEnabled : false,
      customRules: data.customRules || null,
      updatedAt: new Date(),
      updatedBy: data.updatedBy || 'system',
    };
    this.securityConfigs.set(id, config);
    return config;
  }

  async getSecurityConfig(serverId: string): Promise<SecurityConfig | null> {
    this.validateServerId(serverId);
    
    const config = Array.from(this.securityConfigs.values()).find(
      c => c.serverId === serverId
    );
    return config || null;
  }

  async updateSecurityConfig(serverId: string, updates: Partial<InsertSecurityConfig>): Promise<SecurityConfig> {
    this.validateServerId(serverId);
    
    if (!updates || typeof updates !== 'object') {
      throw new Error('Invalid updates: must be an object');
    }
    
    const existing = await this.getSecurityConfig(serverId);
    
    if (existing) {
      Object.assign(existing, updates, { updatedAt: new Date() });
      return existing;
    }

    return this.createOrUpdateSecurityConfig({ ...updates, serverId });
  }

  async createUserSecurityOverride(insertData: InsertUserSecurityOverride): Promise<UserSecurityOverride> {
    this.validateUserId(insertData.userId);
    this.validateServerId(insertData.serverId);
    
    if (insertData.aggressionLevel < 1 || insertData.aggressionLevel > 10) {
      throw new Error('Aggression level must be between 1 and 10');
    }

    const key = `${insertData.serverId}:${insertData.userId}`;
    const existing = this.userSecurityOverrides.get(key);
    
    if (existing) {
      throw new Error('User security override already exists. Use update method instead.');
    }

    const id = randomUUID();
    const override: UserSecurityOverride = {
      ...insertData,
      id,
      aiThresholdOverride: insertData.aiThresholdOverride || null,
      spamOverride: insertData.spamOverride || null,
      raidOverride: insertData.raidOverride || null,
      exemptFlags: insertData.exemptFlags || null,
      reason: insertData.reason || null,
      expiresAt: insertData.expiresAt || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.userSecurityOverrides.set(key, override);
    return override;
  }

  async getUserSecurityOverride(userId: string, serverId: string): Promise<UserSecurityOverride | null> {
    this.validateUserId(userId);
    this.validateServerId(serverId);
    
    const key = `${serverId}:${userId}`;
    const override = this.userSecurityOverrides.get(key);
    
    if (!override) return null;
    
    const now = new Date();
    if (override.expiresAt && override.expiresAt < now) {
      this.userSecurityOverrides.delete(key);
      return null;
    }
    
    return override;
  }

  async getUserSecurityOverrides(serverId: string): Promise<UserSecurityOverride[]> {
    this.validateServerId(serverId);
    
    const now = new Date();
    const validOverrides: UserSecurityOverride[] = [];
    
    Array.from(this.userSecurityOverrides.entries()).forEach(([key, override]) => {
      if (override.serverId !== serverId) return;
      
      if (override.expiresAt && override.expiresAt < now) {
        this.userSecurityOverrides.delete(key);
        return;
      }
      
      validOverrides.push(override);
    });
    
    return validOverrides.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async updateUserSecurityOverride(userId: string, serverId: string, updates: Partial<InsertUserSecurityOverride>): Promise<UserSecurityOverride> {
    this.validateUserId(userId);
    this.validateServerId(serverId);
    
    if (updates.aggressionLevel !== undefined && (updates.aggressionLevel < 1 || updates.aggressionLevel > 10)) {
      throw new Error('Aggression level must be between 1 and 10');
    }
    
    const key = `${serverId}:${userId}`;
    const existing = this.userSecurityOverrides.get(key);
    
    if (!existing) {
      throw new Error('User security override not found');
    }
    
    Object.assign(existing, updates, { updatedAt: new Date() });
    return existing;
  }

  async deleteUserSecurityOverride(userId: string, serverId: string): Promise<void> {
    this.validateUserId(userId);
    this.validateServerId(serverId);
    
    const key = `${serverId}:${userId}`;
    const override = this.userSecurityOverrides.get(key);
    
    if (!override) {
      throw new Error('User security override not found');
    }
    
    this.userSecurityOverrides.delete(key);
  }

  async createHealthEvent(insertEvent: InsertHealthEvent): Promise<HealthEvent> {
    // Enforce memory limits
    if (this.healthEvents.size >= this.MAX_HEALTH_EVENTS) {
      const oldest = Array.from(this.healthEvents.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
      if (oldest) this.healthEvents.delete(oldest[0]);
    }
    
    const id = randomUUID();
    const event: HealthEvent = {
      ...insertEvent,
      id,
      timestamp: new Date(),
      latency: insertEvent.latency || null,
      consecutiveFailures: insertEvent.consecutiveFailures || 0,
      errorMessage: insertEvent.errorMessage || null,
      metadata: insertEvent.metadata || null,
    };
    this.healthEvents.set(id, event);
    return event;
  }

  async getHealthEvents(moduleName?: string, limit: number = 50): Promise<HealthEvent[]> {
    let events = Array.from(this.healthEvents.values());
    
    if (moduleName) {
      events = events.filter(event => event.moduleName === moduleName);
    }
    
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events.slice(0, limit);
  }

  async getLatestHealthEvent(moduleName: string): Promise<HealthEvent | null> {
    const events = Array.from(this.healthEvents.values())
      .filter(event => event.moduleName === moduleName)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return events.length > 0 ? events[0] : null;
  }

  async createMessageTrace(insertData: InsertMessageTrace): Promise<MessageTrace> {
    if (!insertData.messageId || typeof insertData.messageId !== 'string') {
      throw new Error('Invalid messageId');
    }
    if (!insertData.userId || typeof insertData.userId !== 'string') {
      throw new Error('Invalid userId');
    }
    if (!insertData.serverId || typeof insertData.serverId !== 'string') {
      throw new Error('Invalid serverId');
    }
    if (!insertData.decision || typeof insertData.decision !== 'string') {
      throw new Error('Invalid decision');
    }

    if (this.messageTraces.size >= this.MAX_MESSAGE_TRACES) {
      const oldest = Array.from(this.messageTraces.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
      if (oldest) this.messageTraces.delete(oldest[0]);
    }

    const id = randomUUID();
    const messageTrace: MessageTrace = {
      ...insertData,
      id,
      timestamp: new Date(),
      metadata: insertData.metadata || null,
    };
    this.messageTraces.set(id, messageTrace);
    return messageTrace;
  }

  async getMessageTraces(filters?: {serverId?: string, userId?: string, decision?: string, limit?: number}): Promise<MessageTrace[]> {
    let traces = Array.from(this.messageTraces.values());

    if (filters) {
      if (filters.serverId) {
        this.validateServerId(filters.serverId);
        traces = traces.filter(trace => trace.serverId === filters.serverId);
      }
      if (filters.userId) {
        this.validateUserId(filters.userId);
        traces = traces.filter(trace => trace.userId === filters.userId);
      }
      if (filters.decision) {
        traces = traces.filter(trace => trace.decision === filters.decision);
      }
    }

    traces.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters?.limit) {
      return traces.slice(0, filters.limit);
    }

    return traces;
  }

  async createMessageDeletion(insertData: InsertMessageDeletion): Promise<MessageDeletion> {
    if (!insertData.messageId || typeof insertData.messageId !== 'string') {
      throw new Error('Invalid messageId');
    }
    if (!insertData.userId || typeof insertData.userId !== 'string') {
      throw new Error('Invalid userId');
    }
    if (!insertData.serverId || typeof insertData.serverId !== 'string') {
      throw new Error('Invalid serverId');
    }
    if (!insertData.channelId || typeof insertData.channelId !== 'string') {
      throw new Error('Invalid channelId');
    }

    if (this.messageDeletions.size >= this.MAX_MESSAGE_DELETIONS) {
      const oldest = Array.from(this.messageDeletions.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
      if (oldest) this.messageDeletions.delete(oldest[0]);
    }

    const id = randomUUID();
    const messageDeletion: MessageDeletion = {
      ...insertData,
      id,
      deletedBy: 'bot',
      timestamp: new Date(),
      metadata: insertData.metadata || null,
    };
    this.messageDeletions.set(id, messageDeletion);
    return messageDeletion;
  }

  async getMessageDeletions(filters?: {serverId?: string, userId?: string, channelId?: string, limit?: number}): Promise<MessageDeletion[]> {
    let deletions = Array.from(this.messageDeletions.values());

    if (filters) {
      if (filters.serverId) {
        this.validateServerId(filters.serverId);
        deletions = deletions.filter(d => d.serverId === filters.serverId);
      }
      if (filters.userId) {
        this.validateUserId(filters.userId);
        deletions = deletions.filter(d => d.userId === filters.userId);
      }
      if (filters.channelId) {
        this.validateId(filters.channelId, 'channelId');
        deletions = deletions.filter(d => d.channelId === filters.channelId);
      }
    }

    deletions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters?.limit) {
      return deletions.slice(0, filters.limit);
    }

    return deletions;
  }

  async getMessageDeletionStats(serverId?: string): Promise<{total: number, byReason: Record<string, number>, byThreatType: Record<string, number>}> {
    let deletions = Array.from(this.messageDeletions.values());

    if (serverId) {
      this.validateServerId(serverId);
      deletions = deletions.filter(d => d.serverId === serverId);
    }

    const byReason: Record<string, number> = {};
    const byThreatType: Record<string, number> = {};

    for (const deletion of deletions) {
      byReason[deletion.reason] = (byReason[deletion.reason] || 0) + 1;
      byThreatType[deletion.threatType] = (byThreatType[deletion.threatType] || 0) + 1;
    }

    return {
      total: deletions.length,
      byReason,
      byThreatType
    };
  }

  async addProtectedUser(userId: string, serverId: string): Promise<void> {
    this.validateUserId(userId);
    this.validateServerId(serverId);
    
    if (!this.protectedUsers.has(serverId)) {
      this.protectedUsers.set(serverId, new Set<string>());
    }
    
    this.protectedUsers.get(serverId)!.add(userId);
  }

  async removeProtectedUser(userId: string, serverId: string): Promise<void> {
    this.validateUserId(userId);
    this.validateServerId(serverId);
    
    const serverProtected = this.protectedUsers.get(serverId);
    if (serverProtected) {
      serverProtected.delete(userId);
    }
  }

  async isUserProtected(userId: string, serverId: string): Promise<boolean> {
    this.validateUserId(userId);
    this.validateServerId(serverId);
    
    const serverProtected = this.protectedUsers.get(serverId);
    return serverProtected ? serverProtected.has(userId) : false;
  }

  async getProtectedUsers(serverId: string): Promise<string[]> {
    this.validateServerId(serverId);
    
    const serverProtected = this.protectedUsers.get(serverId);
    return serverProtected ? Array.from(serverProtected) : [];
  }

  async createAiEngineAudit(data: InsertAiEngineAudit): Promise<AiEngineAudit> {
    if (this.aiEngineAudits.size >= this.MAX_AI_ENGINE_AUDITS) {
      const oldest = Array.from(this.aiEngineAudits.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
      if (oldest) this.aiEngineAudits.delete(oldest[0]);
    }

    const id = randomUUID();
    const audit: AiEngineAudit = {
      id,
      engineName: data.engineName,
      taskType: data.taskType,
      prompt: data.prompt,
      response: data.response,
      model: data.model,
      tokensUsed: data.tokensUsed || null,
      latency: data.latency,
      success: data.success,
      errorMessage: data.errorMessage || null,
      fallbackUsed: data.fallbackUsed ?? false,
      timestamp: new Date(),
      metadata: data.metadata || null,
    };
    this.aiEngineAudits.set(id, audit);
    return audit;
  }

  async getAiEngineAudits(filters?: {engineName?: string, taskType?: string, success?: boolean, limit?: number}): Promise<AiEngineAudit[]> {
    let audits = Array.from(this.aiEngineAudits.values());

    if (filters) {
      if (filters.engineName) {
        audits = audits.filter(a => a.engineName === filters.engineName);
      }
      if (filters.taskType) {
        audits = audits.filter(a => a.taskType === filters.taskType);
      }
      if (filters.success !== undefined) {
        audits = audits.filter(a => a.success === filters.success);
      }
    }

    audits.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters?.limit) {
      return audits.slice(0, filters.limit);
    }

    return audits;
  }
}

export const storage = new MemStorage();

export async function checkStorageHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  message?: string;
  metadata?: Record<string, any>;
}> {
  const startTime = Date.now();

  try {
    await storage.getBotStats();
    await storage.getSystemHealth();
    
    const latency = Date.now() - startTime;

    const threatCount = (await storage.getThreats(1)).length;
    const incidentCount = (await storage.getIncidents(1)).length;

    return {
      healthy: true,
      latency,
      message: 'Storage service is operational',
      metadata: {
        storageType: 'MemStorage',
        responsive: true,
        threatCount,
        incidentCount
      }
    };
  } catch (error: any) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      message: `Storage health check failed: ${error?.message || 'Unknown error'}`,
      metadata: { error: error?.message }
    };
  }
}
