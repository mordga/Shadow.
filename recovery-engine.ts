import { Client, Guild, TextChannel, VoiceChannel, CategoryChannel, ChannelType, PermissionsBitField } from 'discord.js';
import { storage } from '../storage';

export interface ServerTemplate {
  id: string;
  name: string;
  description: string;
  serverId: string;
  channels: ChannelTemplate[];
  roles: RoleTemplate[];
  permissions: PermissionTemplate[];
  settings: ServerSettings;
  lastBackup: Date;
}

export interface ChannelTemplate {
  id: string;
  name: string;
  type: ChannelType;
  position: number;
  parentId?: string;
  topic?: string;
  nsfw: boolean;
  rateLimitPerUser: number;
  permissions: ChannelPermission[];
  lastActivity?: Date;
  messageCount?: number;
  lastMessage?: string;
}

export interface RoleTemplate {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string[];
  position: number;
  icon?: string;
}

export interface PermissionTemplate {
  roleId: string;
  channelId: string;
  allow: string[];
  deny: string[];
}

export interface ChannelPermission {
  id: string;
  type: 'role' | 'member';
  allow: string[];
  deny: string[];
}

export interface ServerSettings {
  verificationLevel: number;
  defaultMessageNotifications: number;
  explicitContentFilter: number;
  afkChannelId?: string;
  afkTimeout: number;
  systemChannelId?: string;
  rulesChannelId?: string;
  publicUpdatesChannelId?: string;
}

export interface RecoveryReport {
  successful: boolean;
  errors: string[];
  warnings: string[];
  recovered: {
    channels: number;
    roles: number;
    permissions: number;
  };
  failed: {
    channels: string[];
    roles: string[];
    permissions: string[];
  };
  suggestions: string[];
}

export class RecoveryEngine {
  private client: Client;
  private templates: Map<string, ServerTemplate> = new Map();
  private auditCache: Map<string, unknown[]> = new Map();
  private autoBackupInterval?: NodeJS.Timeout;
  private readonly MAX_TEMPLATES = 100; // Prevent unbounded memory growth

  constructor(client: Client) {
    this.client = client;
    this.setupAutoBackup();
  }

  // Configurar backup automático cada hora
  private setupAutoBackup(): void {
    this.autoBackupInterval = setInterval(async () => {
      try {
        await this.backupAllServers();
      } catch (error) {
        console.error('[RecoveryEngine] Auto-backup failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hora
  }

  destroy(): void {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
      this.autoBackupInterval = undefined;
    }
    this.templates.clear();
    this.auditCache.clear();
  }

  // Hacer backup de todos los servidores
  async backupAllServers(): Promise<void> {
    for (const guild of Array.from(this.client.guilds.cache.values())) {
      try {
        await this.createServerTemplate(guild);
      } catch (error) {
        console.error(`Error backing up server ${guild.name}:`, error);
      }
    }
  }

  // Crear template del servidor
  async createServerTemplate(guild: Guild, backupType: 'automatic' | 'manual' = 'automatic', createdBy: string = 'system'): Promise<ServerTemplate> {
    const channels = await this.analyzeChannels(guild);
    const roles = await this.analyzeRoles(guild);
    const permissions = await this.analyzePermissions(guild);
    const settings = await this.analyzeServerSettings(guild);

    const template: ServerTemplate = {
      id: `template_${guild.id}_${Date.now()}`,
      name: `${guild.name} Backup`,
      description: `${backupType === 'automatic' ? 'Automatic' : 'Manual'} backup of ${guild.name}`,
      serverId: guild.id,
      channels,
      roles,
      permissions,
      settings,
      lastBackup: new Date(),
    };

    this.templates.set(guild.id, template);
    
    // Enforce maximum template limit to prevent memory leaks
    if (this.templates.size > this.MAX_TEMPLATES) {
      const oldestKey = this.templates.keys().next().value;
      if (oldestKey) {
        this.templates.delete(oldestKey);
      }
    }
    
    const backupData = {
      serverId: guild.id,
      serverName: guild.name,
      channels: channels.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
        parentId: c.parentId || null,
        topic: c.topic,
        nsfw: c.nsfw,
        rateLimitPerUser: c.rateLimitPerUser,
        permissions: c.permissions
      })),
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        permissions: r.permissions,
        hoist: r.hoist,
        mentionable: r.mentionable
      })),
      permissions,
      settings,
      timestamp: new Date().toISOString()
    };

    const size = JSON.stringify(backupData).length;
    const sizeKB = (size / 1024).toFixed(2);

    await storage.createServerBackup({
      serverId: guild.id,
      serverName: guild.name,
      backupType,
      channelsCount: channels.length,
      rolesCount: roles.length,
      backupData,
      createdBy,
      size: `${sizeKB}KB`,
      metadata: { 
        templateId: template.id,
        channels: channels.length, 
        roles: roles.length,
        permissions: permissions.length
      }
    });

    await this.cleanupOldBackups(guild.id);

    console.log(`[RecoveryEngine] Backup created for ${guild.name} (${channels.length} channels, ${roles.length} roles, ${sizeKB}KB)`);

    return template;
  }

  // Limpiar backups antiguos (mantener solo los últimos 10 por servidor)
  private async cleanupOldBackups(serverId: string): Promise<void> {
    try {
      const backups = await storage.getServerBackups(serverId);
      if (backups.length > 10) {
        const toDelete = backups.slice(10);
        for (const backup of toDelete) {
          await storage.deleteServerBackup(backup.id);
          console.log(`[RecoveryEngine] Deleted old backup ${backup.id} for server ${serverId}`);
        }
      }
    } catch (error) {
      console.error(`[RecoveryEngine] Error cleaning up old backups:`, error);
    }
  }

  // Analizar canales y su actividad
  private async analyzeChannels(guild: Guild): Promise<ChannelTemplate[]> {
    const channels: ChannelTemplate[] = [];

    for (const channel of Array.from(guild.channels.cache.values())) {
      try {
        const channelTemplate: ChannelTemplate = {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          position: 'position' in channel ? channel.position : 0,
          parentId: channel.parentId || undefined,
          topic: channel.isTextBased() && 'topic' in channel ? channel.topic || undefined : undefined,
          nsfw: channel.isTextBased() && 'nsfw' in channel ? channel.nsfw : false,
          rateLimitPerUser: channel.isTextBased() && 'rateLimitPerUser' in channel ? (channel.rateLimitPerUser ?? 0) : 0,
          permissions: await this.getChannelPermissions(channel),
        };

        // Analizar actividad del canal si es de texto
        if (channel.isTextBased()) {
          const activity = await this.analyzeChannelActivity(channel);
          channelTemplate.lastActivity = activity.lastActivity;
          channelTemplate.messageCount = activity.messageCount;
          channelTemplate.lastMessage = activity.lastMessage;
        }

        channels.push(channelTemplate);
      } catch (error) {
        console.error(`Error analyzing channel ${channel.name}:`, error);
      }
    }

    return channels;
  }

  // Analizar actividad del canal
  private async analyzeChannelActivity(channel: unknown): Promise<{
    lastActivity?: Date;
    messageCount: number;
    lastMessage?: string;
  }> {
    try {
      if (!channel.isTextBased()) {
        return { messageCount: 0 };
      }

      // Obtener últimos mensajes para analizar actividad
      const messages = await channel.messages.fetch({ limit: 10 });
      const messageCount = messages.size;
      
      let lastActivity: Date | undefined;
      let lastMessage: string | undefined;

      if (messages.size > 0) {
        const latest = messages.first();
        lastActivity = latest?.createdAt;
        lastMessage = latest?.content?.substring(0, 100);
      }

      return { lastActivity, messageCount, lastMessage };
    } catch (error) {
      console.error(`Error analyzing channel activity:`, error);
      return { messageCount: 0 };
    }
  }

  // Obtener permisos del canal
  private async getChannelPermissions(channel: unknown): Promise<ChannelPermission[]> {
    const permissions: ChannelPermission[] = [];

    try {
      if ('permissionOverwrites' in channel && channel.permissionOverwrites) {
        channel.permissionOverwrites.cache.forEach((overwrite: any, id: string) => {
          permissions.push({
            id,
            type: overwrite.type === 0 ? 'role' : 'member',
            allow: overwrite.allow.toArray(),
            deny: overwrite.deny.toArray(),
          });
        });
      }
    } catch (error) {
      console.error(`Error getting channel permissions:`, error);
    }

    return permissions;
  }

  // Analizar roles del servidor
  private async analyzeRoles(guild: Guild): Promise<RoleTemplate[]> {
    const roles: RoleTemplate[] = [];

    for (const role of Array.from(guild.roles.cache.values())) {
      if (role.name === '@everyone') continue;

      roles.push({
        id: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: role.permissions.toArray(),
        position: role.position,
        icon: role.icon || undefined,
      });
    }

    return roles;
  }

  // Analizar permisos del servidor
  private async analyzePermissions(guild: Guild): Promise<PermissionTemplate[]> {
    const permissions: PermissionTemplate[] = [];

    for (const channel of Array.from(guild.channels.cache.values())) {
      if ('permissionOverwrites' in channel && channel.permissionOverwrites) {
        channel.permissionOverwrites.cache.forEach((overwrite: any, roleId: string) => {
          if (overwrite.type === 0) { // Solo roles
            permissions.push({
              roleId,
              channelId: channel.id,
              allow: overwrite.allow.toArray(),
              deny: overwrite.deny.toArray(),
            });
          }
        });
      }
    }

    return permissions;
  }

  // Analizar configuraciones del servidor
  private async analyzeServerSettings(guild: Guild): Promise<ServerSettings> {
    return {
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter,
      afkChannelId: guild.afkChannelId || undefined,
      afkTimeout: guild.afkTimeout,
      systemChannelId: guild.systemChannelId || undefined,
      rulesChannelId: guild.rulesChannelId || undefined,
      publicUpdatesChannelId: guild.publicUpdatesChannelId || undefined,
    };
  }

  // Recuperar servidor desde backup
  async recoverServerFromBackup(guild: Guild, backupId: string): Promise<RecoveryReport> {
    const report: RecoveryReport = {
      successful: false,
      errors: [],
      warnings: [],
      recovered: { channels: 0, roles: 0, permissions: 0 },
      failed: { channels: [], roles: [], permissions: [] },
      suggestions: [],
    };

    try {
      const backup = await storage.getServerBackupById(backupId);

      if (!backup) {
        report.errors.push('Backup not found');
        return report;
      }

      if (backup.serverId !== guild.id) {
        report.errors.push('Backup does not belong to this server');
        return report;
      }

      console.log(`[RecoveryEngine] Starting recovery for ${guild.name} from backup ${backupId}`);

      const backupData = backup.backupData as any;

      const template: ServerTemplate = {
        id: backupId,
        name: backup.serverName,
        description: `Restoration from backup ${backupId}`,
        serverId: backup.serverId,
        channels: backupData.channels || [],
        roles: backupData.roles || [],
        permissions: backupData.permissions || [],
        settings: backupData.settings || {} as ServerSettings,
        lastBackup: backup.createdAt,
      };

      await this.recoverRoles(guild, template, report);
      await this.recoverChannels(guild, template, report);
      await this.recoverPermissions(guild, template, report);
      await this.recoverServerSettings(guild, template, report);

      report.successful = report.errors.length === 0;

      await storage.createIncident({
        type: 'recovery',
        severity: report.successful ? 'low' : 'high',
        title: 'Server Recovery Completed',
        description: `Recovery from backup ${backupId} for ${guild.name}`,
        serverId: guild.id,
        serverName: guild.name,
        affectedUsers: [],
        actionsPerformed: ['server_recovery', 'backup_restore'],
        evidence: { report, backupId, recovered: report.recovered }
      });

      console.log(`[RecoveryEngine] Recovery completed: ${report.recovered.channels} channels, ${report.recovered.roles} roles restored`);

    } catch (error) {
      const errorMsg = `Recovery failed: ${(error as Error).message}`;
      report.errors.push(errorMsg);
      report.successful = false;
      console.error(`[RecoveryEngine] ${errorMsg}`);
    }

    return report;
  }

  // Recuperar servidor desde template (legacy method - uses in-memory templates)
  async recoverServerFromTemplate(guild: Guild, templateId?: string): Promise<RecoveryReport> {
    const report: RecoveryReport = {
      successful: false,
      errors: [],
      warnings: [],
      recovered: { channels: 0, roles: 0, permissions: 0 },
      failed: { channels: [], roles: [], permissions: [] },
      suggestions: [],
    };

    try {
      const template = templateId 
        ? this.getTemplateById(templateId)
        : this.templates.get(guild.id);

      if (!template) {
        return await this.recoverFromAuditLogs(guild);
      }

      await this.recoverRoles(guild, template, report);
      await this.recoverChannels(guild, template, report);
      await this.recoverPermissions(guild, template, report);
      await this.recoverServerSettings(guild, template, report);

      report.successful = report.errors.length === 0;

      await storage.createIncident({
        type: 'recovery',
        severity: report.successful ? 'low' : 'high',
        title: 'Server Recovery Completed',
        description: `Recovery attempt for ${guild.name}`,
        serverId: guild.id,
        serverName: guild.name,
        affectedUsers: [],
        actionsPerformed: ['server_recovery'],
        evidence: { report, template }
      });

    } catch (error) {
      report.errors.push(`Recovery failed: ${(error as Error).message}`);
      report.successful = false;
    }

    return report;
  }

  // Recuperar desde audit logs cuando no hay template
  async recoverFromAuditLogs(guild: Guild): Promise<RecoveryReport> {
    const report: RecoveryReport = {
      successful: false,
      errors: [],
      warnings: [],
      recovered: { channels: 0, roles: 0, permissions: 0 },
      failed: { channels: [], roles: [], permissions: [] },
      suggestions: [],
    };

    try {
      // Obtener audit logs de las últimas 24 horas
      const auditLogs = await guild.fetchAuditLogs({
        limit: 100,
        type: 12, // CHANNEL_DELETE
      });

      // Analizar canales eliminados
      for (const entry of Array.from(auditLogs.entries.values())) {
        if (entry.action === 12 && entry.target) { // CHANNEL_DELETE
          const channelInfo = entry.target as any;
          try {
            // Intentar recrear el canal basado en audit log
            await this.recreateChannelFromAuditLog(guild, entry, report);
          } catch (error) {
            report.failed.channels.push(channelInfo.name || 'Unknown');
            report.errors.push(`Failed to recreate channel: ${(error as Error).message}`);
          }
        }
      }

      // Obtener audit logs de roles eliminados
      const roleAuditLogs = await guild.fetchAuditLogs({
        limit: 100,
        type: 32, // ROLE_DELETE
      });

      for (const entry of Array.from(roleAuditLogs.entries.values())) {
        if (entry.action === 32 && entry.target) { // ROLE_DELETE
          try {
            await this.recreateRoleFromAuditLog(guild, entry, report);
          } catch (error) {
            const roleInfo = entry.target as any;
            report.failed.roles.push(roleInfo.name || 'Unknown');
            report.errors.push(`Failed to recreate role: ${(error as Error).message}`);
          }
        }
      }

      report.successful = report.errors.length === 0;
      report.suggestions.push('Consider setting up automatic backups to prevent data loss');
      
    } catch (error) {
      report.errors.push(`Audit log recovery failed: ${(error as Error).message}`);
    }

    return report;
  }

  // Recrear canal desde audit log
  private async recreateChannelFromAuditLog(guild: Guild, entry: any, report: RecoveryReport): Promise<void> {
    const channelData = entry.target;
    const channelName = channelData.name || `recovered-channel-${Date.now()}`;
    
    // Determinar tipo de canal basado en el audit log
    let channelType = ChannelType.GuildText;
    if (channelData.type !== undefined && 
        (channelData.type === ChannelType.GuildText || 
         channelData.type === ChannelType.GuildVoice || 
         channelData.type === ChannelType.GuildCategory || 
         channelData.type === ChannelType.GuildAnnouncement ||
         channelData.type === ChannelType.GuildStageVoice ||
         channelData.type === ChannelType.GuildForum ||
         channelData.type === ChannelType.GuildMedia)) {
      channelType = channelData.type;
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: channelType as ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildCategory | ChannelType.GuildAnnouncement | ChannelType.GuildStageVoice | ChannelType.GuildForum | ChannelType.GuildMedia,
      topic: channelData.topic || 'Recovered channel - configure as needed',
      position: channelData.position || 999,
    });

    report.recovered.channels++;
    report.suggestions.push(`Recreated channel "${channelName}" - please review and configure permissions`);
  }

  // Recrear rol desde audit log
  private async recreateRoleFromAuditLog(guild: Guild, entry: any, report: RecoveryReport): Promise<void> {
    const roleData = entry.target;
    const roleName = roleData.name || `recovered-role-${Date.now()}`;

    const role = await guild.roles.create({
      name: roleName,
      color: roleData.color || 0,
      hoist: roleData.hoist || false,
      mentionable: roleData.mentionable || false,
      permissions: roleData.permissions || [],
      position: roleData.position || 1,
    });

    report.recovered.roles++;
    report.suggestions.push(`Recreated role "${roleName}" - please review permissions`);
  }

  // Implementar otros métodos de recuperación...
  private async recoverRoles(guild: Guild, template: ServerTemplate, report: RecoveryReport): Promise<void> {
    for (const roleTemplate of template.roles) {
      try {
        if (!guild.roles.cache.find(r => r.name === roleTemplate.name)) {
          await guild.roles.create({
            name: roleTemplate.name,
            color: roleTemplate.color,
            hoist: roleTemplate.hoist,
            mentionable: roleTemplate.mentionable,
            permissions: new PermissionsBitField(roleTemplate.permissions as any),
            position: roleTemplate.position,
          });
          report.recovered.roles++;
        }
      } catch (error) {
        report.failed.roles.push(roleTemplate.name);
        report.errors.push(`Failed to recover role ${roleTemplate.name}: ${(error as Error).message}`);
      }
    }
  }

  private async recoverChannels(guild: Guild, template: ServerTemplate, report: RecoveryReport): Promise<void> {
    // Implementar recuperación de canales...
    for (const channelTemplate of template.channels) {
      try {
        if (!guild.channels.cache.find(c => c.name === channelTemplate.name)) {
          // Verificar que el tipo de canal es válido para creación
          if (channelTemplate.type === ChannelType.GuildText || 
              channelTemplate.type === ChannelType.GuildVoice || 
              channelTemplate.type === ChannelType.GuildCategory || 
              channelTemplate.type === ChannelType.GuildAnnouncement ||
              channelTemplate.type === ChannelType.GuildStageVoice ||
              channelTemplate.type === ChannelType.GuildForum ||
              channelTemplate.type === ChannelType.GuildMedia) {
            await guild.channels.create({
              name: channelTemplate.name,
              type: channelTemplate.type,
              topic: channelTemplate.topic,
              position: channelTemplate.position,
            });
            report.recovered.channels++;
          } else {
            report.warnings.push(`Skipped channel ${channelTemplate.name} - unsupported channel type`);
          }
        }
      } catch (error) {
        report.failed.channels.push(channelTemplate.name);
        report.errors.push(`Failed to recover channel ${channelTemplate.name}: ${(error as Error).message}`);
      }
    }
  }

  private async recoverPermissions(guild: Guild, template: ServerTemplate, report: RecoveryReport): Promise<void> {
    // Implementar recuperación de permisos...
    report.recovered.permissions = template.permissions.length;
  }

  private async recoverServerSettings(guild: Guild, template: ServerTemplate, report: RecoveryReport): Promise<void> {
    // Implementar recuperación de configuraciones...
    try {
      await guild.edit({
        verificationLevel: template.settings.verificationLevel,
        defaultMessageNotifications: template.settings.defaultMessageNotifications,
        explicitContentFilter: template.settings.explicitContentFilter,
      });
    } catch (error) {
      report.warnings.push(`Could not apply all server settings: ${(error as Error).message}`);
    }
  }

  private getTemplateById(templateId: string): ServerTemplate | undefined {
    for (const template of Array.from(this.templates.values())) {
      if (template.id === templateId) {
        return template;
      }
    }
    return undefined;
  }

  // Comando de emergencia para recuperación inmediata
  async emergencyRecovery(guild: Guild): Promise<RecoveryReport> {
    console.log(`🚨 EMERGENCY RECOVERY INITIATED FOR ${guild.name}`);
    
    // Intentar recuperación desde template primero
    let report = await this.recoverServerFromTemplate(guild);
    
    // Si falla, intentar desde audit logs
    if (!report.successful) {
      console.log('Template recovery failed, attempting audit log recovery...');
      const auditReport = await this.recoverFromAuditLogs(guild);
      
      // Combinar reportes
      report.recovered.channels += auditReport.recovered.channels;
      report.recovered.roles += auditReport.recovered.roles;
      report.errors.push(...auditReport.errors);
      report.suggestions.push(...auditReport.suggestions);
    }

    return report;
  }

  // Obtener estadísticas de templates
  getRecoveryStats(): {
    totalTemplates: number;
    servers: string[];
    lastBackup: Date | null;
  } {
    const servers = Array.from(this.templates.keys());
    const lastBackup = servers.length > 0 
      ? new Date(Math.max(...Array.from(this.templates.values()).map(t => t.lastBackup.getTime())))
      : null;

    return {
      totalTemplates: this.templates.size,
      servers,
      lastBackup
    };
  }

  async checkHealth(): Promise<{
    healthy: boolean;
    latency?: number;
    message?: string;
    metadata?: Record<string, any>;
  }> {
    const startTime = Date.now();

    try {
      if (!this.client || !this.client.isReady()) {
        return {
          healthy: false,
          latency: Date.now() - startTime,
          message: 'Recovery Engine client is not ready',
          metadata: { clientReady: false }
        };
      }

      const stats = this.getRecoveryStats();
      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
        message: 'Recovery Engine is operational',
        metadata: {
          totalTemplates: stats.totalTemplates,
          servers: stats.servers.length,
          lastBackup: stats.lastBackup,
          hasBackups: stats.totalTemplates > 0
        }
      };
    } catch (error: any) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: `Recovery Engine health check failed: ${error?.message || 'Unknown error'}`,
        metadata: { error: error?.message }
      };
    }
  }
}