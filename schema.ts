import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const threats = pgTable("threats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'raid', 'spam', 'nsfw', 'bypass'
  severity: text("severity").notNull(), // 'low', 'medium', 'high', 'critical'
  description: text("description").notNull(),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  userId: text("user_id"),
  username: text("username"),
  action: text("action").notNull(), // 'ban', 'kick', 'mute', 'warn', 'delete'
  metadata: jsonb("metadata"), // Additional threat-specific data
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

export const botStats = pgTable("bot_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threatsBlocked: integer("threats_blocked").notNull().default(0),
  activeRaids: integer("active_raids").notNull().default(0),
  nsfwDetected: integer("nsfw_detected").notNull().default(0),
  bypassAttempts: integer("bypass_attempts").notNull().default(0),
  detectionRate: text("detection_rate").notNull().default("99.2%"),
  uptime: text("uptime").notNull().default("0d 0h 0m"),
  memoryUsage: text("memory_usage").notNull().default("0MB"),
  apiLatency: text("api_latency").notNull().default("0ms"),
  activeServers: integer("active_servers").notNull().default(0),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const bypassPatterns = pgTable("bypass_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  pattern: text("pattern").notNull(),
  severity: text("severity").notNull(),
  description: text("description").notNull(),
  detectedCount: integer("detected_count").notNull().default(0),
  firstSeen: timestamp("first_seen").notNull().defaultNow(),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
  countermeasure: text("countermeasure"),
});

export const incidents = pgTable("incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  affectedUsers: jsonb("affected_users"), // Array of user IDs
  actionsPerformed: jsonb("actions_performed"), // Array of actions taken
  evidence: jsonb("evidence"), // Screenshots, logs, etc.
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
});

export const systemHealth = pgTable("system_health", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cpuUsage: integer("cpu_usage").notNull().default(0),
  ramUsage: integer("ram_usage").notNull().default(0),
  networkIO: text("network_io").notNull().default("0KB/s"),
  systemStatus: text("system_status").notNull().default("operational"),
  protectionModules: jsonb("protection_modules"), // Status of each module
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const quarantinedUsers = pgTable("quarantined_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  reason: text("reason").notNull(),
  quarantinedBy: text("quarantined_by").notNull(),
  quarantinedAt: timestamp("quarantined_at").notNull().defaultNow(),
  releaseAt: timestamp("release_at"),
  released: boolean("released").notNull().default(false),
  releasedAt: timestamp("released_at"),
  metadata: jsonb("metadata"),
});

export const userReputation = pgTable("user_reputation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  score: integer("score").notNull().default(100),
  violations: integer("violations").notNull().default(0),
  positiveActions: integer("positive_actions").notNull().default(0),
  trustLevel: text("trust_level").notNull().default("new"), // 'new', 'untrusted', 'neutral', 'trusted', 'verified'
  lastViolation: timestamp("last_violation"),
  lastUpdate: timestamp("last_update").notNull().defaultNow(),
  metadata: jsonb("metadata"),
});

export const commandLogs = pgTable("command_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commandName: text("command_name").notNull(),
  executedBy: text("executed_by").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  parameters: jsonb("parameters"),
  result: text("result"),
  success: boolean("success").notNull(),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  duration: integer("duration").notNull(), // in milliseconds
  metadata: jsonb("metadata"),
});

export const serverBackups = pgTable("server_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  backupType: text("backup_type").notNull(), // 'manual', 'automatic', 'pre-restore'
  channelsCount: integer("channels_count").notNull(),
  rolesCount: integer("roles_count").notNull(),
  backupData: jsonb("backup_data").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  size: text("size").notNull(),
  metadata: jsonb("metadata"),
});

export const securityConfig = pgTable("security_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  logChannelId: text("log_channel_id"),
  antiRaidEnabled: boolean("anti_raid_enabled").notNull().default(true),
  antiSpamEnabled: boolean("anti_spam_enabled").notNull().default(true),
  nsfwDetectionEnabled: boolean("nsfw_detection_enabled").notNull().default(true),
  bypassDetectionEnabled: boolean("bypass_detection_enabled").notNull().default(true),
  quarantineEnabled: boolean("quarantine_enabled").notNull().default(true),
  aggressivenessLevel: integer("aggressiveness_level").notNull().default(5), // 1-10
  aiConfidenceFloor: integer("ai_confidence_floor"),
  lastAggressionUpdate: timestamp("last_aggression_update"),
  autoLearnEnabled: boolean("auto_learn_enabled").notNull().default(true),
  customRules: jsonb("custom_rules"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
});

export const userSecurityOverrides = pgTable("user_security_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  aggressionLevel: integer("aggression_level").notNull(), // 1-10
  aiThresholdOverride: integer("ai_threshold_override"),
  spamOverride: jsonb("spam_override"),
  raidOverride: jsonb("raid_override"),
  exemptFlags: jsonb("exempt_flags"),
  reason: text("reason"),
  setBy: text("set_by").notNull(),
  setByUsername: text("set_by_username").notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas
export const insertThreatSchema = createInsertSchema(threats).omit({
  id: true,
  timestamp: true,
  resolved: true,
});

export const insertBotStatsSchema = createInsertSchema(botStats).omit({
  id: true,
  lastUpdated: true,
});

export const insertBypassPatternSchema = createInsertSchema(bypassPatterns).omit({
  id: true,
  detectedCount: true,
  firstSeen: true,
  lastSeen: true,
  active: true,
});

export const insertIncidentSchema = createInsertSchema(incidents).omit({
  id: true,
  timestamp: true,
  resolved: true,
  resolvedBy: true,
  resolvedAt: true,
});

export const insertSystemHealthSchema = createInsertSchema(systemHealth).omit({
  id: true,
  timestamp: true,
});

export const insertQuarantinedUserSchema = createInsertSchema(quarantinedUsers).omit({
  id: true,
  quarantinedAt: true,
  released: true,
  releasedAt: true,
});

export const insertUserReputationSchema = createInsertSchema(userReputation).omit({
  id: true,
  score: true,
  violations: true,
  positiveActions: true,
  trustLevel: true,
  lastUpdate: true,
});

export const insertCommandLogSchema = createInsertSchema(commandLogs).omit({
  id: true,
  executedAt: true,
});

export const insertServerBackupSchema = createInsertSchema(serverBackups).omit({
  id: true,
  createdAt: true,
});

export const insertSecurityConfigSchema = createInsertSchema(securityConfig).omit({
  id: true,
  updatedAt: true,
});

export const insertUserSecurityOverrideSchema = createInsertSchema(userSecurityOverrides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const healthEvents = pgTable("health_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moduleName: text("module_name").notNull(),
  status: text("status").notNull(), // 'healthy', 'unhealthy', 'degraded'
  latency: integer("latency"), // in milliseconds
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertHealthEventSchema = createInsertSchema(healthEvents).omit({
  id: true,
  timestamp: true,
});

export const messageTrace = pgTable("message_trace", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: text("message_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  content: varchar("content", { length: 500 }).notNull(),
  decision: text("decision").notNull(), // 'allowed', 'ignored', 'deleted', 'warned', 'muted', 'kicked', 'banned'
  reason: text("reason").notNull(),
  threatType: text("threat_type").notNull(), // 'none', 'spam', 'nsfw', 'raid', 'bypass', etc.
  confidence: integer("confidence").notNull(), // 0-100 (0-1 stored as 0-100)
  actionTaken: text("action_taken").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  metadata: jsonb("metadata"),
});

export const insertMessageTraceSchema = createInsertSchema(messageTrace).omit({
  id: true,
  timestamp: true,
});

export const messageDeletions = pgTable("message_deletions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: text("message_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  content: varchar("content", { length: 2000 }).notNull(),
  reason: text("reason").notNull(),
  threatType: text("threat_type").notNull(),
  confidence: integer("confidence").notNull(),
  deletedBy: text("deleted_by").notNull().default("bot"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  metadata: jsonb("metadata"),
});

export const insertMessageDeletionSchema = createInsertSchema(messageDeletions).omit({
  id: true,
  timestamp: true,
  deletedBy: true,
});

// Types
export type Threat = typeof threats.$inferSelect;
export type InsertThreat = z.infer<typeof insertThreatSchema>;

export type BotStats = typeof botStats.$inferSelect;
export type InsertBotStats = z.infer<typeof insertBotStatsSchema>;

export type BypassPattern = typeof bypassPatterns.$inferSelect;
export type InsertBypassPattern = z.infer<typeof insertBypassPatternSchema>;

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;

export type SystemHealth = typeof systemHealth.$inferSelect;
export type InsertSystemHealth = z.infer<typeof insertSystemHealthSchema>;

export type QuarantinedUser = typeof quarantinedUsers.$inferSelect;
export type InsertQuarantinedUser = z.infer<typeof insertQuarantinedUserSchema>;

export type UserReputation = typeof userReputation.$inferSelect;
export type InsertUserReputation = z.infer<typeof insertUserReputationSchema>;

export type CommandLog = typeof commandLogs.$inferSelect;
export type InsertCommandLog = z.infer<typeof insertCommandLogSchema>;

export type ServerBackup = typeof serverBackups.$inferSelect;
export type InsertServerBackup = z.infer<typeof insertServerBackupSchema>;

export type SecurityConfig = typeof securityConfig.$inferSelect;
export type InsertSecurityConfig = z.infer<typeof insertSecurityConfigSchema>;

export type UserSecurityOverride = typeof userSecurityOverrides.$inferSelect;
export type InsertUserSecurityOverride = z.infer<typeof insertUserSecurityOverrideSchema>;

export type HealthEvent = typeof healthEvents.$inferSelect;
export type InsertHealthEvent = z.infer<typeof insertHealthEventSchema>;

export type MessageTrace = typeof messageTrace.$inferSelect;
export type InsertMessageTrace = z.infer<typeof insertMessageTraceSchema>;

export type MessageDeletion = typeof messageDeletions.$inferSelect;
export type InsertMessageDeletion = z.infer<typeof insertMessageDeletionSchema>;

// User schema (keeping existing)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const aiEngineAudit = pgTable("ai_engine_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  engineName: text("engine_name").notNull(),
  taskType: text("task_type").notNull(),
  prompt: text("prompt").notNull(),
  response: text("response").notNull(),
  model: text("model").notNull(),
  tokensUsed: integer("tokens_used"),
  latency: integer("latency").notNull(),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  fallbackUsed: boolean("fallback_used").notNull().default(false),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  metadata: jsonb("metadata"),
});

export const insertAiEngineAuditSchema = createInsertSchema(aiEngineAudit).omit({
  id: true,
  timestamp: true,
});

export type AiEngineAudit = typeof aiEngineAudit.$inferSelect;
export type InsertAiEngineAudit = z.infer<typeof insertAiEngineAuditSchema>;
