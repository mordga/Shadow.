import { Client, GatewayIntentBits, Events, Message, GuildMember, PartialGuildMember, AttachmentBuilder, Interaction, Guild, EmbedBuilder, ChannelType, PermissionFlagsBits, TextChannel, GuildAuditLogsEntry, AuditLogEvent, GuildChannel, Role, User } from 'discord.js';
import { securityEngine } from './security-engine';
import { storage } from '../storage';
import { claudeService } from './claude-ai';
import { RecoveryEngine } from './recovery-engine';
import { registerCommands, handleCommandInteraction } from '../commands';
import { ResilientModule } from './failover-manager';
import type { HealthCheckResult } from './health-monitor';
import type { InsertMessageTrace } from '@shared/schema';
import { fileLogger } from './file-logger';

interface ActionRecord {
  userId: string;
  timestamp: number;
  targetId?: string;
}

interface AntiNukeConfig {
  channelDeleteThreshold: number;
  roleDeleteThreshold: number;
  memberRemoveThreshold: number;
  webhookCreateThreshold: number;
  timeWindow: number; // in milliseconds
}

export class DiscordBot {
  private client: Client;
  private startTime: number;
  private recoveryEngine!: RecoveryEngine;
  private isReady: boolean = false;
  private lastPingTime: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private statsUpdateInterval?: NodeJS.Timeout;
  private statusReportTimeout?: NodeJS.Timeout;

  // Anti-Nuke tracking Maps
  private channelDeletes: Map<string, ActionRecord[]> = new Map();
  private roleDeletes: Map<string, ActionRecord[]> = new Map();
  private memberRemoves: Map<string, ActionRecord[]> = new Map();
  private webhookCreates: Map<string, ActionRecord[]> = new Map();
  private serverChanges: Map<string, ActionRecord[]> = new Map();
  
  private antiNukeConfig: AntiNukeConfig = {
    channelDeleteThreshold: 3,
    roleDeleteThreshold: 3,
    memberRemoveThreshold: 5,
    webhookCreateThreshold: 3,
    timeWindow: 10000 // 10 seconds
  };

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
      ],
    });

    this.startTime = Date.now();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on(Events.ClientReady, async () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
      await fileLogger.info('bot', `Discord bot logged in as ${this.client.user?.tag}`, {
        botId: this.client.user?.id,
        botTag: this.client.user?.tag
      });
      
      // Set bot activity/presence
      await this.client.user?.setActivity('🛡️ Protecting Servers', { type: 0 });
      
      this.isReady = true;
      this.reconnectAttempts = 0;
      this.lastPingTime = Date.now();
      this.recoveryEngine = new RecoveryEngine(this.client);
      await registerCommands(this.client);
      
      // Update all "entity" roles in all guilds on connect
      await this.updateEntityRolesInAllGuilds();
      
      this.updateBotStats();
      this.startStatusReporting();
    });

    this.client.on(Events.MessageCreate, async (message: Message) => {
      if (message.author.bot) return;
      await this.handleMessage(message);
    });

    this.client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
      await this.handleUserJoin(member);
    });

    this.client.on(Events.GuildCreate, async (guild: Guild) => {
      await this.handleGuildCreate(guild);
    });

    this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
      if (interaction.isChatInputCommand()) {
        await handleCommandInteraction(interaction);
      }
    });

    this.client.on(Events.Error, async (error) => {
      console.error('Discord bot error:', error);
      await fileLogger.error('bot', 'Discord bot error occurred', {
        error: error.message,
        stack: error.stack
      });
      this.isReady = false;
    });

    this.client.on(Events.ShardDisconnect, async () => {
      console.warn('Discord bot disconnected');
      await fileLogger.warn('bot', 'Discord bot disconnected', {
        timestamp: Date.now()
      });
      this.isReady = false;
    });

    this.client.on(Events.ShardResume, async () => {
      console.log('Discord bot resumed connection');
      await fileLogger.info('bot', 'Discord bot resumed connection', {
        reconnectAttempts: this.reconnectAttempts
      });
      this.isReady = true;
      this.reconnectAttempts = 0;
    });

    this.client.on(Events.Warn, (info) => {
      console.warn('Discord bot warning:', info);
    });

    this.client.on(Events.ShardError, (error) => {
      console.error('Discord shard error:', error);
      this.isReady = false;
    });

    this.client.on(Events.ShardReconnecting, () => {
      console.log('Discord shard reconnecting...');
      this.isReady = false;
    });

    this.client.on(Events.ShardReady, () => {
      console.log('Discord shard ready');
      this.isReady = true;
    });

    // Anti-Nuke Event Handlers
    this.client.on(Events.ChannelDelete, async (channel) => {
      await this.handleChannelDelete(channel);
    });

    this.client.on(Events.GuildRoleDelete, async (role: Role) => {
      await this.handleRoleDelete(role);
    });

    this.client.on(Events.GuildMemberRemove, async (member: GuildMember | PartialGuildMember) => {
      await this.handleMemberRemove(member);
    });

    this.client.on(Events.WebhooksUpdate, async (channel) => {
      await this.handleWebhooksUpdate(channel);
    });

    this.client.on(Events.GuildUpdate, async (oldGuild: Guild, newGuild: Guild) => {
      await this.handleGuildUpdate(oldGuild, newGuild);
    });

    // Update stats every minute
    this.statsUpdateInterval = setInterval(() => {
      this.updateBotStats();
    }, 60000);
  }

  private async handleMessage(message: Message): Promise<void> {
    try {
      if (!message.guild) {
        console.warn(`[Security] Message from ${message.author.tag} rejected: no guild context`);
        return;
      }

      if (!message.guild.id || !message.guild.name) {
        console.error(`[Security] Invalid guild data for message from ${message.author.tag}`);
        return;
      }

      const userId = message.author.id;
      const username = message.author.username;
      const serverId = message.guild.id;
      const serverName = message.guild.name;
      const content = message.content.substring(0, 500);
      const hasAttachments = message.attachments.size > 0;

      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Security check timeout')), 10000)
      );

      const check = await Promise.race([
        securityEngine.execute(
          'checkMessage',
          userId,
          username,
          message.content,
          serverId,
          serverName,
          hasAttachments ? Array.from(message.attachments.values()).map(a => ({
            url: a.url,
            contentType: a.contentType ?? undefined
          })) : undefined
        ),
        timeoutPromise
      ]);

      const userReputation = await storage.getUserReputation(userId, serverId);
      
      const isTrusted = userReputation && (
        userReputation.trustLevel === 'trusted' || 
        userReputation.trustLevel === 'verified'
      );
      const hasHighScore = userReputation && userReputation.score > 80;
      const threatType = check.threatType || 'none';
      const criticalThreats = ['spam', 'nsfw', 'bypass', 'raid'];
      const isCriticalThreat = criticalThreats.includes(threatType);
      const severityActions = ['ban', 'kick'];
      const minorActions = ['warn', 'delete'];

      let finalAction = check.action;
      let decision = check.action === 'allow' ? 'allowed' : check.action;
      let stealthMode = false;
      let overrideReason = '';

      if (check.confidence >= 0.8 || isCriticalThreat) {
        console.log(`[Security] HIGH PRIORITY: Executing original action ${check.action} for ${username} (confidence: ${check.confidence}, threatType: ${threatType})`);
        finalAction = check.action;
        decision = check.action === 'allow' ? 'allowed' : check.action;
        overrideReason = 'High confidence or critical threat detected';
      }
      else if (
        isTrusted && 
        (threatType === 'none' || check.confidence < 0.3) && 
        minorActions.includes(check.action)
      ) {
        console.log(`[Security] Stealth mode: ${check.action} suppressed for trusted user ${username} (confidence: ${check.confidence}, threatType: ${threatType})`);
        finalAction = 'allow';
        decision = 'ignored';
        stealthMode = true;
        overrideReason = 'Stealth mode - trusted user with low threat';
      }
      else if (check.action === 'ban' && check.confidence >= 0.7) {
        console.log(`[Security] Ban action maintained for ${username} due to high confidence: ${check.confidence}`);
        finalAction = check.action;
        decision = check.action;
        overrideReason = 'High confidence ban maintained';
      }
      else if (
        check.confidence < 0.5 && 
        hasHighScore && 
        !isCriticalThreat &&
        severityActions.includes(check.action)
      ) {
        console.log(`[Security] Reducing action severity for high-reputation user ${username}: ${check.action} -> warn (confidence: ${check.confidence}, score: ${userReputation?.score})`);
        finalAction = 'warn';
        decision = 'warned';
        overrideReason = `Reputation override - low confidence (${Math.round(check.confidence * 100)}%) with high score (${userReputation?.score})`;
      }
      else if (check.confidence < 0.7 && check.action !== 'delete' && !isCriticalThreat) {
        if (check.action === 'ban' || check.action === 'kick' || check.action === 'mute') {
          console.log(`[Security] Low confidence (${check.confidence}), reducing action: ${check.action} -> warn`);
          finalAction = 'warn';
          decision = 'warned';
          overrideReason = `Low confidence threshold (${Math.round(check.confidence * 100)}%)`;
        } else if (check.action === 'warn') {
          console.log(`[Security] Low confidence (${check.confidence}), allowing message`);
          finalAction = 'allow';
          decision = 'allowed';
          overrideReason = `Very low confidence (${Math.round(check.confidence * 100)}%)`;
        }
      }
      else {
        finalAction = check.action;
        decision = check.action === 'allow' ? 'allowed' : check.action;
        overrideReason = 'Original action executed';
      }

      if (
        finalAction === 'allow' &&
        check.evidence?.isMassMention === true &&
        check.evidence?.isAbusive === false
      ) {
        console.log(`[Security] Mass mention detected (non-abusive) from ${username}, sanitizing...`);
        finalAction = 'sanitize_mentions';
        decision = 'sanitized';
        overrideReason = 'Mass mention sanitized to prevent ping';
      }

      const originalAction = check.action;
      const originalConfidence = Math.round(check.confidence * 100);
      let actionReason = check.reason;
      
      if (originalAction !== finalAction) {
        actionReason = `Original: ${originalAction} (${originalConfidence}%) -> Final: ${finalAction} - Reason: ${overrideReason}`;
      }

      await this.executeAction(message, { 
        action: finalAction, 
        reason: actionReason,
        confidence: check.confidence,
        threatType: threatType
      }, {
        decision,
        stealthMode,
        originalAction,
        userTrustLevel: userReputation?.trustLevel || 'new',
        userScore: userReputation?.score || 100,
        hasAttachments,
        content,
        overrideReason,
        originalConfidence,
        finalAction
      });

    } catch (error) {
      console.error(`[Security] Error handling message from ${message.author.tag} in ${message.guild?.name || 'unknown'}:`, {
        error: error instanceof Error ? error.message : String(error),
        userId: message.author.id,
        guildId: message.guild?.id,
        messageLength: message.content.length
      });
    }
  }

  private async handleUserJoin(member: GuildMember): Promise<void> {
    try {
      if (!member.guild) {
        console.warn(`[Security] User join from ${member.user.tag} rejected: no guild context`);
        return;
      }

      if (!member.guild.id || !member.guild.name) {
        console.error(`[Security] Invalid guild data for user join ${member.user.tag}`);
        return;
      }

      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Security check timeout')), 10000)
      );

      const check = await Promise.race([
        securityEngine.execute(
          'checkUserJoin',
          member.id,
          member.user.username,
          member.guild.id,
          member.guild.name,
          member.user.createdAt
        ),
        timeoutPromise
      ]);

      await this.executeJoinAction(member, check);

    } catch (error) {
      console.error(`[Security] Error handling user join ${member.user.tag} in ${member.guild?.name || 'unknown'}:`, {
        error: error instanceof Error ? error.message : String(error),
        userId: member.id,
        guildId: member.guild?.id,
        accountAge: member.user.createdAt
      });
    }
  }

  private async analyzeServerRisk(guild: Guild): Promise<{ 
    riskLevel: 'low' | 'medium' | 'high';
    aggressivenessLevel: number;
    factors: string[];
    recommendations: string[];
  }> {
    const factors: string[] = [];
    let riskScore = 0;
    const recommendations: string[] = [];
    
    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;
    const botRatio = botCount / totalMembers;
    
    if (botRatio > 0.3) {
      riskScore += 30;
      factors.push(`Alto ratio de bots (${Math.round(botRatio * 100)}%)`);
      recommendations.push('Considerar revisar la legitimidad de los bots presentes');
    } else if (botRatio > 0.15) {
      riskScore += 15;
      factors.push(`Ratio moderado de bots (${Math.round(botRatio * 100)}%)`);
    }
    
    const dangerousRoles = guild.roles.cache.filter(r => 
      r.permissions.has('Administrator') && r.members.size > 5
    ).size;
    
    if (dangerousRoles > 3) {
      riskScore += 25;
      factors.push(`Múltiples roles con Admin (${dangerousRoles})`);
      recommendations.push('Revisar permisos administrativos - demasiados usuarios con Admin');
    } else if (dangerousRoles > 1) {
      riskScore += 10;
      factors.push(`Algunos roles con Admin (${dangerousRoles})`);
    }
    
    const botMember = guild.members.me;
    const hasFullPerms = botMember?.permissions.has('Administrator');
    
    if (!hasFullPerms) {
      riskScore += 20;
      factors.push('Permisos limitados del bot');
      recommendations.push('Otorgar permisos de Administrador para protección completa');
    }
    
    const serverAge = Date.now() - guild.createdAt.getTime();
    const daysOld = serverAge / (1000 * 60 * 60 * 24);
    
    if (daysOld < 7) {
      riskScore += 15;
      factors.push(`Servidor muy nuevo (${Math.round(daysOld)} días)`);
      recommendations.push('Servidor reciente - activar monitoreo intensivo');
    } else if (daysOld < 30) {
      riskScore += 8;
      factors.push(`Servidor reciente (${Math.round(daysOld)} días)`);
    }
    
    if (totalMembers < 10) {
      riskScore += 10;
      factors.push('Servidor pequeño (<10 miembros)');
    } else if (totalMembers > 1000) {
      riskScore += 5;
      factors.push(`Servidor grande (${totalMembers} miembros)`);
    }
    
    let riskLevel: 'low' | 'medium' | 'high';
    let aggressivenessLevel: number;
    
    if (riskScore >= 60) {
      riskLevel = 'high';
      aggressivenessLevel = 10;
      recommendations.unshift('⚠️ ALTO RIESGO - Protección máxima activada');
    } else if (riskScore >= 30) {
      riskLevel = 'medium';
      aggressivenessLevel = 6;
      recommendations.unshift('⚡ RIESGO MEDIO - Protección estándar activada');
    } else {
      riskLevel = 'low';
      aggressivenessLevel = 3;
      recommendations.unshift('✅ BAJO RIESGO - Protección básica activada');
    }
    
    return { riskLevel, aggressivenessLevel, factors, recommendations };
  }

  private async handleGuildCreate(guild: Guild): Promise<void> {
    try {
      console.log(`Bot joined new server: ${guild.name} (${guild.id})`);

      let logChannel: TextChannel | null = null;

      const channelNames = ['logs', 'security-logs', 'bot-logs'];
      for (const channelName of channelNames) {
        const found = guild.channels.cache.find(
          ch => ch.name.toLowerCase() === channelName && ch.type === ChannelType.GuildText
        ) as TextChannel | undefined;
        
        if (found) {
          logChannel = found;
          console.log(`Found existing log channel: ${found.name}`);
          
          // Save log channel ID to security config
          await storage.createOrUpdateSecurityConfig({
            serverId: guild.id,
            logChannelId: found.id
          });
          break;
        }
      }

      if (!logChannel) {
        try {
          const botMember = guild.members.me;
          if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            throw new Error('Missing ManageChannels permission');
          }

          logChannel = await guild.channels.create({
            name: 'security-logs',
            type: ChannelType.GuildText,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
              },
              {
                id: this.client.user!.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.EmbedLinks,
                  PermissionFlagsBits.AttachFiles,
                ],
              },
            ],
          });

          const adminRole = guild.roles.cache.find(
            role => role.permissions.has(PermissionFlagsBits.Administrator)
          );
          if (adminRole) {
            await logChannel.permissionOverwrites.create(adminRole, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
            });
          }

          // Save log channel ID to security config
          await storage.createOrUpdateSecurityConfig({
            serverId: guild.id,
            logChannelId: logChannel.id
          });

          console.log(`Created log channel: ${logChannel.name}`);
        } catch (channelError) {
          console.error('Failed to create log channel:', channelError);
          
          try {
            const owner = await guild.fetchOwner();
            const dmEmbed = new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle('⚠️ Security Bot Setup Required')
              .setDescription(
                `Hello! I've joined **${guild.name}** but I don't have permission to create channels.\n\n` +
                `Please:\n` +
                `1. Create a channel named "security-logs" or "logs"\n` +
                `2. Give me (${this.client.user?.tag}) permission to view and send messages in it\n` +
                `3. Ensure I have the "Manage Channels" permission for full functionality\n\n` +
                `The bot will automatically detect the log channel and send important security alerts there.`
              )
              .setTimestamp();

            await owner.send({ embeds: [dmEmbed] });
            console.log(`Sent setup instructions to server owner: ${owner.user.tag}`);
          } catch (dmError) {
            console.error('Failed to send DM to server owner:', dmError);
          }
          
          return;
        }
      }

      // Create or find the "entity" role for the bot with ADMINISTRATOR permissions
      let entityRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'entity');
      let needsManualReorder = false;
      const botMember = guild.members.me;
      
      // If no entity role exists, look for the bot's auto-created role and rename it
      if (!entityRole && botMember) {
        const botRoles = Array.from(botMember.roles.cache.values());
        const botAutoRole = botRoles.find((role: Role) => role.name !== '@everyone' && !entityRole);
        
        if (botAutoRole && botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
          try {
            console.log(`[Guild Join] Found bot's auto-role "${botAutoRole.name}", renaming to "entity" in ${guild.name}`);
            await botAutoRole.setName('entity');
            await botAutoRole.setColor(0x9B59B6);
            await botAutoRole.setPermissions([PermissionFlagsBits.Administrator]);
            console.log(`[Guild Join] ✅ Renamed and configured auto-role to "entity" in ${guild.name}`);
            entityRole = botAutoRole;
          } catch (renameErr) {
            console.warn(`[Guild Join] Could not rename bot's auto-role:`, renameErr);
          }
        }
      }
      
      // If still no entity role, create a new one
      if (!entityRole) {
        try {
          if (botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
            // Create role with ADMINISTRATOR permissions
            entityRole = await guild.roles.create({
              name: 'entity',
              color: 0x9B59B6, // Purple color
              hoist: true, // Display separately in member list
              mentionable: false,
              permissions: [PermissionFlagsBits.Administrator], // Full admin permissions
              reason: 'Entity security bot role - auto-created on join with Administrator permissions'
            });

            console.log(`[Guild Join] Created "entity" role with Administrator permissions in ${guild.name}`);
          } else {
            console.warn(`[Guild Join] Missing ManageRoles permission in ${guild.name} - could not create entity role`);
          }
        } catch (roleError) {
          console.error(`[Guild Join] Failed to create entity role in ${guild.name}:`, roleError);
        }
      }
      
      // Finalize entity role configuration
      if (entityRole) {
        // Try to move the role as high as possible
        if (botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
          try {
            const botHighestRole = botMember.roles.highest;
            const targetPosition = botHighestRole.position - 1;
            
            if (targetPosition > 0) {
              await entityRole.setPosition(targetPosition);
              console.log(`[Guild Join] Positioned "entity" role to position ${targetPosition} in ${guild.name}`);
            }

            // Check if there are roles above the entity role that have admin permissions
            const rolesAbove = guild.roles.cache.filter(r => 
              r.position > entityRole!.position && 
              r.permissions.has(PermissionFlagsBits.Administrator) &&
              r.id !== botHighestRole.id
            );

            if (rolesAbove.size > 0) {
              needsManualReorder = true;
              console.warn(`[Guild Join] ⚠️ There are ${rolesAbove.size} admin roles above "entity" in ${guild.name} - manual reordering needed`);
            }
          } catch (posError) {
            console.warn(`[Guild Join] Could not position entity role:`, posError);
            needsManualReorder = true;
          }
        }

        // Ensure bot has the entity role
        if (botMember && !botMember.roles.cache.has(entityRole.id)) {
          try {
            await botMember.roles.add(entityRole);
            console.log(`[Guild Join] Assigned "entity" role to bot in ${guild.name}`);
          } catch (assignError) {
            console.warn(`[Guild Join] Could not assign entity role to bot:`, assignError);
          }
        }
      }

      // Notify server owner if manual reordering is needed
      if (needsManualReorder && logChannel) {
        const reorderEmbed = new EmbedBuilder()
          .setColor(0xFFA500) // Orange warning color
          .setTitle('⚠️ Acción Manual Requerida')
          .setDescription(
            `El rol **entity** ha sido creado con permisos de **Administrador**, pero Discord no permite que los bots muevan roles por encima de su propio rol.\n\n` +
            `**Para máxima protección:**\n` +
            `1. Ve a Configuración del Servidor → Roles\n` +
            `2. Arrastra el rol **entity** hasta la posición más alta (debajo del dueño)\n` +
            `3. Esto permitirá al bot gestionar incluso a los administradores\n\n` +
            `⚠️ **Importante:** Solo el dueño del servidor puede hacer esto.`
          )
          .setTimestamp();

        try {
          await logChannel.send({ embeds: [reorderEmbed] });
        } catch (sendError) {
          console.warn(`[Guild Join] Could not send reorder notification:`, sendError);
        }
      }

      const systemHealth = await storage.getSystemHealth();
      const protectionModules = systemHealth?.protectionModules as any || {
        antiRaid: 'active',
        antiNuke: 'active',
        nsfwDetection: 'active',
        spamFilter: 'active',
        bypassDetection: 'learning'
      };

      const createdDate = guild.createdAt.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      const totalMembers = guild.memberCount;
      const totalChannels = guild.channels.cache.size;
      const textChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText).size;
      const voiceChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildVoice).size;
      
      const roles = Array.from(guild.roles.cache.values())
        .sort((a, b) => b.position - a.position)
        .filter(r => r.id !== guild.id)
        .slice(0, 10)
        .map(r => `${r.name} (${r.members.size} miembros)`)
        .join('\n');
      const botPermissions = botMember?.permissions.toArray() || [];
      const criticalPerms = ['Administrator', 'ManageChannels', 'ManageRoles', 'BanMembers', 'KickMembers', 'ManageMessages'];
      const hasAllCritical = criticalPerms.every(perm => botPermissions.includes(perm as any));
      const permissionLevel = hasAllCritical ? 'COMPLETO ✅' : 'LIMITADO ⚠️';
      
      const botList = guild.members.cache
        .filter(m => m.user.bot && m.id !== this.client.user?.id)
        .map(m => m.user.username)
        .slice(0, 5);
      const otherBotsCount = guild.members.cache.filter(m => m.user.bot && m.id !== this.client.user?.id).size;

      const owner = await guild.fetchOwner();
      const humanCount = totalMembers - guild.members.cache.filter(m => m.user.bot).size;
      const botCount = guild.members.cache.filter(m => m.user.bot).size;

      const riskAnalysis = await this.analyzeServerRisk(guild);
      console.log(`[Adaptive] Server ${guild.name} risk: ${riskAnalysis.riskLevel} (score: ${riskAnalysis.aggressivenessLevel}/10)`);

      const reportEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🛡️ Security Bot - Reporte de Activación')
        .setDescription(
          `El bot de seguridad ha sido activado exitosamente en **${guild.name}**.\n\n` +
          `📊 **ANÁLISIS AUTOMÁTICO DEL SERVIDOR**`
        )
        .addFields([
          { name: '📋 Información General', value: 
            `**Nombre:** ${guild.name}\n` +
            `**ID:** ${guild.id}\n` +
            `**Creado:** ${createdDate}\n` +
            `**Owner:** ${owner.user.tag}`,
            inline: false
          },
          { name: '👥 Miembros', value: 
            `**Total:** ${totalMembers}\n` +
            `**Humanos:** ${humanCount}\n` +
            `**Bots:** ${botCount}`,
            inline: true
          },
          { name: '📺 Canales', value: 
            `**Total:** ${totalChannels}\n` +
            `**Texto:** ${textChannels}\n` +
            `**Voz:** ${voiceChannels}`,
            inline: true
          },
          { name: '🎭 Roles Principales', value: roles || 'Sin roles configurados', inline: false },
          { name: '🔑 Nivel de Permisos del Bot', value: 
            `**Estado:** ${permissionLevel}\n` +
            `**Administrador:** ${botPermissions.includes('Administrator') ? '✅' : '❌'}\n` +
            `**Gestionar Canales:** ${botPermissions.includes('ManageChannels') ? '✅' : '❌'}\n` +
            `**Banear Miembros:** ${botPermissions.includes('BanMembers') ? '✅' : '❌'}`,
            inline: true
          },
          { name: '🤖 Otros Bots Detectados', value: 
            otherBotsCount > 0 
              ? `**Total:** ${otherBotsCount}\n${botList.join(', ')}${otherBotsCount > 5 ? '...' : ''}`
              : 'No hay otros bots',
            inline: true
          },
          { name: '🛡️ Módulos de Protección', value: 
            `${protectionModules.antiRaid === 'active' ? '✅' : '❌'} Anti-Raid\n` +
            `${protectionModules.antiNuke === 'active' ? '✅' : '❌'} Anti-Nuke\n` +
            `${protectionModules.nsfwDetection === 'active' ? '✅' : '❌'} Detección NSFW\n` +
            `${protectionModules.spamFilter === 'active' ? '✅' : '❌'} Filtro Anti-Spam`,
            inline: false
          },
          { 
            name: '🔍 Análisis Adaptativo Automático', 
            value: 
              `**Nivel de Riesgo:** ${riskAnalysis.riskLevel.toUpperCase()}\n` +
              `**Agresividad:** ${riskAnalysis.aggressivenessLevel}/10\n` +
              `**Factores:**\n${riskAnalysis.factors.map(f => `• ${f}`).join('\n')}\n` +
              `**Recomendaciones:**\n${riskAnalysis.recommendations.map(r => `• ${r}`).join('\n')}`,
            inline: false 
          },
          { name: '📅 Análisis Realizado', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        ])
        .setFooter({ text: `Server ID: ${guild.id} | Reporte automático generado` })
        .setTimestamp();

      await logChannel.send({ embeds: [reportEmbed] });
      console.log(`[Guild Join] Sent comprehensive server report to ${logChannel.name} for ${guild.name}`);

      await storage.createOrUpdateSecurityConfig({
        serverId: guild.id,
        serverName: guild.name,
        logChannelId: logChannel.id,
        aggressivenessLevel: riskAnalysis.aggressivenessLevel,
        antiRaidEnabled: true,
        antiSpamEnabled: true,
        nsfwDetectionEnabled: true,
        bypassDetectionEnabled: true,
        quarantineEnabled: riskAnalysis.riskLevel !== 'low',
        updatedBy: 'adaptive_analysis',
      });

      console.log(`Saved log channel ID to storage for server: ${guild.name}`);

      await storage.createCommandLog({
        commandName: 'guild_join_analysis',
        executedBy: this.client.user?.tag || 'System',
        userId: this.client.user?.id || 'system',
        username: this.client.user?.username || 'Bot',
        serverId: guild.id,
        serverName: guild.name,
        parameters: { 
          totalMembers, 
          totalChannels, 
          otherBotsCount,
          permissionLevel 
        },
        result: 'Server analysis completed successfully',
        success: true,
        duration: 0,
        metadata: {
          roles: roles,
          botPermissions: botPermissions.join(', '),
          otherBots: botList
        }
      });

    } catch (error) {
      console.error('Error handling guild create:', error);
    }
  }

  private async updateEntityRolesInAllGuilds(): Promise<void> {
    try {
      const guilds = this.client.guilds.cache;
      console.log(`[Entity Role Update] 🔍 Updating entity roles in ${guilds.size} guilds`);
      
      for (const guild of Array.from(guilds.values())) {
        try {
          const botMember = guild.members.me;
          if (!botMember) {
            console.warn(`[Entity Role Update] ⚠️ Bot not found in ${guild.name}`);
            continue;
          }

          let entityRole = guild.roles.cache.find((role: Role) => role.name.toLowerCase() === 'entity');
          
          // If entity role doesn't exist, create a new one
          if (!entityRole) {
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
              console.warn(`[Entity Role Update] ⚠️ Missing ManageRoles permission in ${guild.name}`);
              continue;
            }

            console.log(`[Entity Role Update] Creating new entity role in ${guild.name}`);
            try {
              entityRole = await guild.roles.create({
                name: 'entity',
                color: 0x9B59B6, // Purple
                permissions: [PermissionFlagsBits.Administrator],
                hoist: true,
                mentionable: false,
                reason: 'Auto-created entity security role'
              });
              console.log(`[Entity Role Update] ✅ Created entity role in ${guild.name}`);
            } catch (createErr) {
              console.warn(`[Entity Role Update] ⚠️ Could not create entity role:`, createErr);
              continue;
            }
          }
          
          // Update the entity role if it exists
          if (entityRole) {
            // Update color to purple
            if (entityRole.color !== 0x9B59B6) {
              try {
                await entityRole.setColor(0x9B59B6);
                console.log(`[Entity Role Update] ✅ Set color to purple in ${guild.name}`);
              } catch (err) {
                console.warn(`[Entity Role Update] ⚠️ Could not set color in ${guild.name}`);
              }
            }
            
            // Set Administrator permissions
            if (!entityRole.permissions.has(PermissionFlagsBits.Administrator)) {
              try {
                await entityRole.setPermissions([PermissionFlagsBits.Administrator]);
                console.log(`[Entity Role Update] ✅ Set Administrator permissions in ${guild.name}`);
              } catch (err) {
                console.warn(`[Entity Role Update] ⚠️ Could not set permissions in ${guild.name}`);
              }
            }
            
            // Assign to bot if not already assigned
            if (!botMember.roles.cache.has(entityRole.id)) {
              try {
                await botMember.roles.add(entityRole);
                console.log(`[Entity Role Update] ✅ Assigned entity role to bot in ${guild.name}`);
              } catch (err) {
                console.warn(`[Entity Role Update] ⚠️ Could not assign role to bot in ${guild.name}`);
              }
            }
          }
        } catch (guildError) {
          console.warn(`[Entity Role Update] ⚠️ Error in ${guild.name}:`, guildError);
        }
      }
      
      console.log(`[Entity Role Update] ✅ Completed`);
    } catch (error) {
      console.error('[Entity Role Update] ❌ Error:', error);
    }
  }

  private sanitizeMentions(content: string): string {
    return content
      .replace(/@everyone/gi, '[@everyone]')
      .replace(/@here/gi, '[@here]');
  }

  private async recordMessageDeletion(
    message: Message, 
    reason: string, 
    threatType: string, 
    confidence: number
  ): Promise<void> {
    try {
      if (!message.guild) return;
      
      await storage.createMessageDeletion({
        messageId: message.id,
        userId: message.author.id,
        username: message.author.username,
        serverId: message.guild.id,
        serverName: message.guild.name,
        channelId: message.channel.id,
        channelName: ('name' in message.channel && message.channel.name) ? message.channel.name : 'unknown',
        content: message.content.substring(0, 2000),
        reason,
        threatType,
        confidence: Math.round(confidence * 100),
        metadata: {
          messageLength: message.content.length,
          hasAttachments: message.attachments.size > 0,
          attachmentCount: message.attachments.size
        }
      });
    } catch (error) {
      console.error('[Security] Failed to record message deletion:', error);
    }
  }

  private async executeAction(
    message: Message, 
    check: { action: string; reason: string; confidence: number; threatType: string },
    traceData: {
      decision: string;
      stealthMode: boolean;
      originalAction: string;
      userTrustLevel: string;
      userScore: number;
      hasAttachments: boolean;
      content: string;
      overrideReason: string;
      originalConfidence: number;
      finalAction: string;
    }
  ): Promise<void> {
    let actionSuccess = true;
    let actionError = '';

    if (check.action !== 'allow' && !traceData.stealthMode) {
      await fileLogger.security('action', `Security action: ${check.action}`, {
        action: check.action,
        reason: check.reason,
        confidence: check.confidence,
        threatType: check.threatType,
        userId: message.author.id,
        username: message.author.username,
        serverId: message.guild?.id,
        serverName: message.guild?.name,
        content: message.content.substring(0, 100),
        userTrustLevel: traceData.userTrustLevel,
        userScore: traceData.userScore
      });
    }

    try {
      if (!message.guild || !message.member) {
        console.warn(`[Security] Cannot execute action: missing guild or member context`);
        actionSuccess = false;
        actionError = 'Missing guild or member context';
        return;
      }

      const botMember = message.guild.members.me;
      if (!botMember) {
        console.error(`[Security] Cannot execute action: bot member not found in guild`);
        actionSuccess = false;
        actionError = 'Bot member not found';
        return;
      }

      switch (check.action) {
        case 'delete':
          if (message.deletable) {
            await this.recordMessageDeletion(message, check.reason, check.threatType, check.confidence);
            await message.delete();
            
            // Extract warning info from evidence
            const checkWithEvidence = check as any;
            const warningCount = checkWithEvidence.evidence?.warningCount || 0;
            const warningsRemaining = checkWithEvidence.evidence?.warningsRemaining || 0;
            
            // Send warning to user via DM
            try {
              const warningEmbed = new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle('⚠️ Advertencia - Contenido Inapropiado')
                .setDescription(`Tu mensaje fue eliminado por contener contenido inapropiado.`)
                .addFields(
                  { name: 'Servidor', value: message.guild?.name || 'Desconocido', inline: true },
                  { name: 'Advertencias', value: `${warningCount}/3`, inline: true },
                  { name: 'Restantes', value: warningsRemaining > 0 ? `${warningsRemaining} antes de mute` : 'Próxima = MUTE', inline: true }
                )
                .setFooter({ text: 'Las advertencias se reinician después de 24 horas sin infracciones' })
                .setTimestamp();
              
              await message.author.send({ embeds: [warningEmbed] });
            } catch (dmError) {
              console.warn(`[Security] Could not DM warning to ${message.author.tag}: DMs disabled`);
            }
            
            // Send audit log to security channel
            await this.sendLogAlert(message.guild, {
              title: '🗑️ Message Deleted + Warning Issued',
              description: `**User:** ${message.author.tag} (${message.author.id})\n**Channel:** <#${message.channel.id}>\n**Reason:** ${check.reason}`,
              color: 0xff0000,
              fields: [
                { name: 'Deleted Message', value: message.content.substring(0, 200) || '(empty)', inline: false },
                { name: 'Warning Count', value: `${warningCount}/3`, inline: true },
                { name: 'Threat Type', value: check.threatType, inline: true },
                { name: 'Confidence', value: `${Math.round(check.confidence * 100)}%`, inline: true }
              ]
            });
          } else {
            console.warn(`[Security] Message not deletable from ${message.author.tag}`);
            actionSuccess = false;
            actionError = 'Message not deletable';
          }
          break;
        
        case 'warn':
          // Only delete message if confidence is very high (>0.9) or threat is critical
          const shouldDeleteWarn = check.confidence > 0.9 || 
            ['spam', 'nsfw', 'raid', 'bypass'].includes(check.threatType);
          
          if (shouldDeleteWarn && message.deletable) {
            await this.recordMessageDeletion(message, check.reason, check.threatType, check.confidence);
            await message.delete();
          }
          
          try {
            await message.author.send(`⚠️ Warning: ${check.reason}`);
          } catch (dmError) {
            console.warn(`[Security] Could not DM user ${message.author.tag}: DMs disabled`);
            actionError = 'DM failed';
          }
          await this.sendLogAlert(message.guild, {
            title: '⚠️ User Warned',
            description: `**User:** ${message.author.tag} (${message.author.id})\n**Reason:** ${check.reason}`,
            color: 0xffa500,
            fields: [{ name: 'Message', value: message.content.substring(0, 100), inline: false }]
          });
          break;
        
        case 'mute':
          // Only delete message if confidence is very high (>0.85) or threat is critical
          const shouldDeleteMute = check.confidence > 0.85 || 
            ['spam', 'nsfw', 'raid', 'bypass'].includes(check.threatType);
          
          if (shouldDeleteMute && message.deletable) {
            await this.recordMessageDeletion(message, check.reason, check.threatType, check.confidence);
            await message.delete();
          }
          
          if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            console.error(`[Security] Cannot mute ${message.author.tag}: Missing ModerateMembers permission`);
            actionSuccess = false;
            actionError = 'Missing ModerateMembers permission';
            return;
          }
          
          if (!message.member.moderatable) {
            console.warn(`[Security] User ${message.author.tag} is not moderatable (higher role)`);
            actionSuccess = false;
            actionError = 'User not moderatable';
            return;
          }
          
          await message.member.timeout(10 * 60 * 1000, check.reason);
          
          // Send mute notification to user
          try {
            const muteEmbed = new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle('🔇 Has sido silenciado')
              .setDescription(`Has sido silenciado por 10 minutos debido a múltiples violaciones.`)
              .addFields(
                { name: 'Servidor', value: message.guild?.name || 'Desconocido', inline: true },
                { name: 'Duración', value: '10 minutos', inline: true },
                { name: 'Razón', value: 'Alcanzaste 3 advertencias por contenido inapropiado', inline: false }
              )
              .setFooter({ text: 'Por favor, sigue las reglas del servidor' })
              .setTimestamp();
            
            await message.author.send({ embeds: [muteEmbed] });
          } catch (dmError) {
            console.warn(`[Security] Could not DM mute notification to ${message.author.tag}: DMs disabled`);
          }
          
          await this.sendLogAlert(message.guild, {
            title: '🔇 User Muted - 3 Warnings Reached',
            description: `**User:** ${message.author.tag} (${message.author.id})\n**Duration:** 10 minutes\n**Reason:** ${check.reason}`,
            color: 0xff6b00,
            fields: [{ name: 'Message', value: message.content.substring(0, 100), inline: false }]
          });
          break;
        
        case 'kick':
          // Always delete for kick actions (high severity)
          if (message.deletable) {
            await this.recordMessageDeletion(message, check.reason, check.threatType, check.confidence);
            await message.delete();
          }
          
          if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
            console.error(`[Security] Cannot kick ${message.author.tag}: Missing KickMembers permission`);
            actionSuccess = false;
            actionError = 'Missing KickMembers permission';
            return;
          }
          
          if (!message.member.kickable) {
            console.warn(`[Security] User ${message.author.tag} is not kickable (higher role)`);
            actionSuccess = false;
            actionError = 'User not kickable';
            return;
          }
          
          await message.member.kick(check.reason);
          await this.sendLogAlert(message.guild, {
            title: '👢 User Kicked',
            description: `**User:** ${message.author.tag} (${message.author.id})\n**Reason:** ${check.reason}`,
            color: 0xff4500,
            fields: [{ name: 'Message', value: message.content.substring(0, 100), inline: false }]
          });
          break;
        
        case 'ban':
          // Always delete for ban actions (highest severity)
          if (message.deletable) {
            await this.recordMessageDeletion(message, check.reason, check.threatType, check.confidence);
            await message.delete();
          }
          
          if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
            console.error(`[Security] Cannot ban ${message.author.tag}: Missing BanMembers permission`);
            actionSuccess = false;
            actionError = 'Missing BanMembers permission';
            return;
          }
          
          if (!message.member.bannable) {
            console.warn(`[Security] User ${message.author.tag} is not bannable (higher role)`);
            actionSuccess = false;
            actionError = 'User not bannable';
            return;
          }
          
          await message.member.ban({ reason: check.reason });
          await this.sendLogAlert(message.guild, {
            title: '🔨 User Banned',
            description: `**User:** ${message.author.tag} (${message.author.id})\n**Reason:** ${check.reason}`,
            color: 0xff0000,
            fields: [{ name: 'Message', value: message.content.substring(0, 100), inline: false }]
          });
          break;
        
        case 'sanitize_mentions':
          if (message.deletable) {
            await this.recordMessageDeletion(message, check.reason, check.threatType, check.confidence);
            await message.delete();
            const sanitizedContent = this.sanitizeMentions(message.content);
            if (!('send' in message.channel)) return;
            await message.channel.send({
              content: `**${message.author.username}**: ${sanitizedContent}`,
              allowedMentions: { parse: [] }
            });
            await this.sendLogAlert(message.guild, {
              title: '🔕 Mass Mention Sanitized',
              description: `Intercepted @everyone/@here from ${message.author.tag}`,
              color: 0xFFAA00
            });
          }
          break;
      }

      if (check.action !== 'allow') {
        console.log(`[Security] Action executed: ${check.action} on ${message.author.tag} - ${check.reason}`);
      }
    } catch (error) {
      actionSuccess = false;
      actionError = error instanceof Error ? error.message : String(error);
      console.error(`[Security] Error executing action ${check.action} on ${message.author.tag}:`, {
        error: actionError,
        userId: message.author.id,
        guildId: message.guild?.id
      });
    } finally {
      await storage.createMessageTrace({
        messageId: message.id,
        userId: message.author.id,
        username: message.author.username,
        serverId: message.guild?.id || '',
        serverName: message.guild?.name || '',
        content: traceData.content,
        decision: traceData.decision,
        reason: check.reason,
        threatType: check.threatType,
        confidence: Math.round(check.confidence * 100),
        actionTaken: check.action,
        metadata: {
          hasAttachments: traceData.hasAttachments,
          messageLength: message.content.length,
          originalAction: traceData.originalAction,
          originalConfidence: traceData.originalConfidence,
          finalAction: traceData.finalAction,
          overrideReason: traceData.overrideReason,
          stealthMode: traceData.stealthMode,
          userTrustLevel: traceData.userTrustLevel,
          userScore: traceData.userScore,
          actionSuccess,
          actionError
        }
      });
    }
  }

  private async executeJoinAction(member: GuildMember, check: { action: string; reason: string }): Promise<void> {
    try {
      if (!member.guild) {
        console.warn(`[Security] Cannot execute join action: missing guild context`);
        return;
      }

      const botMember = member.guild.members.me;
      if (!botMember) {
        console.error(`[Security] Cannot execute join action: bot member not found in guild`);
        return;
      }

      switch (check.action) {
        case 'warn':
          try {
            await member.send(`⚠️ Warning: ${check.reason}`);
          } catch (dmError) {
            console.warn(`[Security] Could not DM user ${member.user.tag}: DMs disabled`);
          }
          await this.sendLogAlert(member.guild, {
            title: '⚠️ User Warned (Join)',
            description: `**User:** ${member.user.tag} (${member.user.id})\n**Reason:** ${check.reason}`,
            color: 0xffa500,
            fields: [{ name: 'Account Created', value: member.user.createdAt.toLocaleString(), inline: true }]
          });
          break;
        
        case 'kick':
          if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
            console.error(`[Security] Cannot kick ${member.user.tag}: Missing KickMembers permission`);
            return;
          }
          
          if (!member.kickable) {
            console.warn(`[Security] User ${member.user.tag} is not kickable (higher role)`);
            return;
          }
          
          await member.kick(check.reason);
          await this.sendLogAlert(member.guild, {
            title: '👢 User Kicked (Join)',
            description: `**User:** ${member.user.tag} (${member.user.id})\n**Reason:** ${check.reason}`,
            color: 0xff4500,
            fields: [{ name: 'Account Created', value: member.user.createdAt.toLocaleString(), inline: true }]
          });
          break;
        
        case 'ban':
          if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
            console.error(`[Security] Cannot ban ${member.user.tag}: Missing BanMembers permission`);
            return;
          }
          
          if (!member.bannable) {
            console.warn(`[Security] User ${member.user.tag} is not bannable (higher role)`);
            return;
          }
          
          await member.ban({ reason: check.reason });
          await this.sendLogAlert(member.guild, {
            title: '🔨 User Banned (Join)',
            description: `**User:** ${member.user.tag} (${member.user.id})\n**Reason:** ${check.reason}`,
            color: 0xff0000,
            fields: [{ name: 'Account Created', value: member.user.createdAt.toLocaleString(), inline: true }]
          });
          break;
      }

      if (check.action !== 'allow') {
        console.log(`[Security] Join action executed: ${check.action} on ${member.user.tag} - ${check.reason}`);
      }
    } catch (error) {
      console.error(`[Security] Error executing join action ${check.action} on ${member.user.tag}:`, {
        error: error instanceof Error ? error.message : String(error),
        userId: member.id,
        guildId: member.guild?.id
      });
    }
  }

  // Anti-Nuke Handler Methods
  private async handleChannelDelete(channel: any): Promise<void> {
    try {
      if (!channel.guild) return;
      const guild = channel.guild;
      const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
      const entry = auditLogs.entries.first();
      
      if (!entry || !entry.executor) return;
      
      const executorId = entry.executor.id;
      const key = `${guild.id}-${executorId}`;
      
      const violations = this.trackAction(this.channelDeletes, key, executorId, channel.id);
      
      if (violations >= this.antiNukeConfig.channelDeleteThreshold) {
        await fileLogger.security('anti-nuke', 'Mass channel delete detected', {
          attackerId: entry.executor.id,
          attackerTag: entry.executor.tag,
          guildId: guild.id,
          guildName: guild.name,
          violations,
          channelName: channel.name,
          action: 'banned'
        });
        await this.punishAttacker(guild, entry.executor as User, 'mass_channel_delete', violations);
        await this.sendLogAlert(guild, {
          title: '🚨 ANTI-NUKE: Mass Channel Delete Detected',
          description: `**Attacker:** ${entry.executor.tag} (${entry.executor.id})\n**Channels Deleted:** ${violations} in ${this.antiNukeConfig.timeWindow / 1000}s\n**Action:** Banned and permissions removed`,
          color: 0xff0000,
          fields: [{ name: 'Deleted Channel', value: channel.name, inline: true }]
        });
      }
    } catch (error) {
      console.error('[Anti-Nuke] Error handling channel delete:', error);
    }
  }

  private async handleRoleDelete(role: Role): Promise<void> {
    try {
      const guild = role.guild;
      const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete });
      const entry = auditLogs.entries.first();
      
      if (!entry || !entry.executor) return;
      
      const executorId = entry.executor.id;
      const key = `${guild.id}-${executorId}`;
      
      const violations = this.trackAction(this.roleDeletes, key, executorId, role.id);
      
      if (violations >= this.antiNukeConfig.roleDeleteThreshold) {
        await fileLogger.security('anti-nuke', 'Mass role delete detected', {
          attackerId: entry.executor.id,
          attackerTag: entry.executor.tag,
          guildId: guild.id,
          guildName: guild.name,
          violations,
          roleName: role.name,
          action: 'banned'
        });
        await this.punishAttacker(guild, entry.executor as User, 'mass_role_delete', violations);
        await this.sendLogAlert(guild, {
          title: '🚨 ANTI-NUKE: Mass Role Delete Detected',
          description: `**Attacker:** ${entry.executor.tag} (${entry.executor.id})\n**Roles Deleted:** ${violations} in ${this.antiNukeConfig.timeWindow / 1000}s\n**Action:** Banned and permissions removed`,
          color: 0xff0000,
          fields: [{ name: 'Deleted Role', value: role.name, inline: true }]
        });
      }
    } catch (error) {
      console.error('[Anti-Nuke] Error handling role delete:', error);
    }
  }

  private async handleMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
    try {
      const guild = member.guild;
      const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
      const kickEntry = auditLogs.entries.first();
      
      const banLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
      const banEntry = banLogs.entries.first();
      
      let entry: any = kickEntry;
      let actionType = 'kick';
      
      if (banEntry && (!kickEntry || banEntry.createdTimestamp > kickEntry.createdTimestamp)) {
        entry = banEntry;
        actionType = 'ban';
      }
      
      if (!entry || !entry.executor) return;
      
      const executorId = entry.executor.id;
      const key = `${guild.id}-${executorId}`;
      
      const violations = this.trackAction(this.memberRemoves, key, executorId, member.id);
      
      if (violations >= this.antiNukeConfig.memberRemoveThreshold) {
        await fileLogger.security('anti-nuke', `Mass member ${actionType} detected`, {
          attackerId: entry.executor.id,
          attackerTag: entry.executor.tag,
          guildId: guild.id,
          guildName: guild.name,
          violations,
          actionType,
          victimTag: member.user.tag,
          action: 'banned'
        });
        await this.punishAttacker(guild, entry.executor as User, `mass_member_${actionType}`, violations);
        await this.sendLogAlert(guild, {
          title: `🚨 ANTI-NUKE: Mass Member ${actionType === 'ban' ? 'Ban' : 'Kick'} Detected`,
          description: `**Attacker:** ${entry.executor.tag} (${entry.executor.id})\n**Members ${actionType === 'ban' ? 'Banned' : 'Kicked'}:** ${violations} in ${this.antiNukeConfig.timeWindow / 1000}s\n**Action:** Banned and permissions removed`,
          color: 0xff0000,
          fields: [{ name: 'Removed Member', value: member.user.tag, inline: true }]
        });
      }
    } catch (error) {
      console.error('[Anti-Nuke] Error handling member remove:', error);
    }
  }

  private async handleWebhooksUpdate(channel: any): Promise<void> {
    try {
      if (channel.type !== ChannelType.GuildText) return;
      const guild = channel.guild;
      const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
      const entry = auditLogs.entries.first();
      
      if (!entry || !entry.executor) return;
      
      const executorId = entry.executor.id;
      const key = `${guild.id}-${executorId}`;
      
      const violations = this.trackAction(this.webhookCreates, key, executorId, channel.id);
      
      if (violations >= this.antiNukeConfig.webhookCreateThreshold) {
        await this.punishAttacker(guild, entry.executor as User, 'webhook_spam', violations);
        await this.sendLogAlert(guild, {
          title: '🚨 ANTI-NUKE: Webhook Spam Detected',
          description: `**Attacker:** ${entry.executor.tag} (${entry.executor.id})\n**Webhooks Created:** ${violations} in ${this.antiNukeConfig.timeWindow / 1000}s\n**Action:** Banned and permissions removed`,
          color: 0xff0000,
          fields: [{ name: 'Channel', value: channel.name, inline: true }]
        });
      }
    } catch (error) {
      console.error('[Anti-Nuke] Error handling webhooks update:', error);
    }
  }

  private async handleGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
    try {
      const nameChanged = oldGuild.name !== newGuild.name;
      const iconChanged = oldGuild.icon !== newGuild.icon;
      
      if (!nameChanged && !iconChanged) return;
      
      const auditLogs = await newGuild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.GuildUpdate });
      const entry = auditLogs.entries.first();
      
      if (!entry || !entry.executor) return;
      
      const executorId = entry.executor.id;
      const key = `${newGuild.id}-${executorId}`;
      
      const violations = this.trackAction(this.serverChanges, key, executorId);
      
      if (violations >= 2) {
        await this.punishAttacker(newGuild, entry.executor as User, 'server_vandalism', violations);
        await this.sendLogAlert(newGuild, {
          title: '🚨 ANTI-NUKE: Server Vandalism Detected',
          description: `**Attacker:** ${entry.executor.tag} (${entry.executor.id})\n**Changes:** ${nameChanged ? 'Name' : ''} ${iconChanged ? 'Icon' : ''}\n**Action:** Banned and permissions removed`,
          color: 0xff0000,
          fields: [
            nameChanged ? { name: 'Old Name', value: oldGuild.name, inline: true } : null,
            nameChanged ? { name: 'New Name', value: newGuild.name, inline: true } : null,
          ].filter(Boolean) as any
        });
      }
    } catch (error) {
      console.error('[Anti-Nuke] Error handling guild update:', error);
    }
  }

  private trackAction(map: Map<string, ActionRecord[]>, key: string, userId: string, targetId?: string): number {
    const now = Date.now();
    
    if (!map.has(key)) {
      map.set(key, []);
    }
    
    const actions = map.get(key)!;
    actions.push({ userId, timestamp: now, targetId });
    
    const recentActions = actions.filter(a => now - a.timestamp < this.antiNukeConfig.timeWindow);
    map.set(key, recentActions);
    
    return recentActions.length;
  }

  private async punishAttacker(guild: Guild, executor: User, reason: string, violations: number): Promise<void> {
    try {
      const member = await guild.members.fetch(executor.id).catch(() => null);
      
      if (!member) {
        console.warn(`[Anti-Nuke] Cannot punish ${executor.tag}: not a member`);
        return;
      }
      
      const botMember = guild.members.me;
      if (!botMember) return;
      
      if (member.roles.highest.position >= botMember.roles.highest.position) {
        console.warn(`[Anti-Nuke] Cannot punish ${executor.tag}: higher role than bot`);
        return;
      }
      
      await storage.createIncident({
        type: 'anti_nuke',
        severity: 'critical',
        title: `Anti-Nuke: ${reason.replace(/_/g, ' ').toUpperCase()}`,
        description: `User ${executor.tag} (${executor.id}) performed ${violations} actions triggering anti-nuke protection`,
        serverId: guild.id,
        serverName: guild.name,
        affectedUsers: [executor.id],
        actionsPerformed: ['permission_removal', 'ban'],
        evidence: { reason, violations, timestamp: new Date() }
      });
      
      try {
        const highestRole = member.roles.highest;
        await member.roles.remove(member.roles.cache.filter(r => r.id !== guild.id));
        console.log(`[Anti-Nuke] Removed all roles from ${executor.tag}`);
      } catch (roleError) {
        console.error(`[Anti-Nuke] Failed to remove roles from ${executor.tag}:`, roleError);
      }
      
      if (member.bannable) {
        await member.ban({ reason: `Anti-Nuke: ${reason} (${violations} violations)` });
        console.log(`[Anti-Nuke] Banned ${executor.tag} for ${reason}`);
      } else {
        console.warn(`[Anti-Nuke] Cannot ban ${executor.tag}: not bannable`);
      }
      
    } catch (error) {
      console.error(`[Anti-Nuke] Error punishing attacker ${executor.tag}:`, error);
    }
  }

  async canMentionRole(guild: Guild, roleId: string): Promise<boolean> {
    try {
      const role = await guild.roles.fetch(roleId);
      return role?.mentionable ?? false;
    } catch {
      return false;
    }
  }

  private async sendLogAlert(guild: Guild, alertData: { title: string; description: string; color: number; fields?: any[] }): Promise<void> {
    try {
      const config = await storage.getSecurityConfig(guild.id);
      
      if (!config?.logChannelId) {
        console.warn(`[Anti-Nuke] No log channel configured for ${guild.name}`);
        return;
      }
      
      const logChannel = guild.channels.cache.get(config.logChannelId) as TextChannel;
      
      if (!logChannel) {
        console.warn(`[Anti-Nuke] Log channel not found for ${guild.name}`);
        return;
      }
      
      let sanitizedDescription = alertData.description;
      const roleMentionRegex = /<@&(\d+)>/g;
      const roleMentions = alertData.description.match(roleMentionRegex);
      
      if (roleMentions) {
        for (const mention of roleMentions) {
          const roleId = mention.match(/\d+/)?.[0];
          if (roleId) {
            const canMention = await this.canMentionRole(guild, roleId);
            if (!canMention) {
              try {
                const role = await guild.roles.fetch(roleId);
                const roleName = role?.name || 'Role';
                sanitizedDescription = sanitizedDescription.replace(mention, `[@${roleName}]`);
              } catch {
                sanitizedDescription = sanitizedDescription.replace(mention, '[@Role]');
              }
            }
          }
        }
      }
      
      const embed = new EmbedBuilder()
        .setTitle(alertData.title)
        .setDescription(sanitizedDescription)
        .setColor(alertData.color)
        .setTimestamp();
      
      if (alertData.fields) {
        embed.addFields(alertData.fields);
      }
      
      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('[Anti-Nuke] Error sending log alert:', error);
    }
  }

  private async updateBotStats(): Promise<void> {
    const uptime = this.formatUptime(Date.now() - this.startTime);
    const memoryUsage = `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`;
    const guilds = this.client.guilds.cache.size;

    await storage.updateBotStats({
      uptime,
      memoryUsage,
      activeServers: guilds,
    });

    // Update system health
    const cpuUsage = Math.floor(Math.random() * 30) + 10; // Mock CPU usage
    const ramUsage = Math.floor(process.memoryUsage().heapUsed / process.memoryUsage().heapTotal * 100);
    
    await storage.updateSystemHealth({
      cpuUsage,
      ramUsage,
      networkIO: `${Math.floor(Math.random() * 500) + 100}KB/s`,
      systemStatus: 'operational',
      protectionModules: {
        antiRaid: 'active',
        antiNuke: 'active',
        nsfwDetection: 'active',
        spamFilter: 'active',
        bypassDetection: 'learning'
      }
    });
  }

  private formatUptime(ms: number): string {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${days}d ${hours}h ${minutes}m`;
  }

  async generateStatusReport(): Promise<string> {
    const stats = await storage.getBotStats();
    const threats = await storage.getThreats(10);
    const incidents = await storage.getIncidents(5);
    
    return await claudeService.execute('generateSecurityReport', stats, threats, incidents);
  }

  // Recovery methods
  async createServerBackup(guildId: string): Promise<any> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Server not found');
    
    return await this.recoveryEngine.createServerTemplate(guild);
  }

  async recoverServer(guildId: string, templateId?: string): Promise<any> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Server not found');
    
    return await this.recoveryEngine.recoverServerFromTemplate(guild, templateId);
  }

  async emergencyRecovery(guildId: string): Promise<any> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Server not found');
    
    return await this.recoveryEngine.emergencyRecovery(guild);
  }

  getRecoveryStats(): any {
    if (!this.recoveryEngine) {
      return { error: 'Recovery engine not initialized' };
    }
    return this.recoveryEngine.getRecoveryStats();
  }

  async start(): Promise<void> {
    const token = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN;
    if (!token) {
      throw new Error('Discord bot token not provided');
    }

    await this.client.login(token);
  }

  private async startStatusReporting(): Promise<void> {
    const sendReport = async () => {
      try {
        const owner = await this.client.application?.fetch().then(app => app.owner);
        if (!owner || owner.id === this.client.user?.id) {
          console.log('Cannot send status report: owner not found or is a team');
          return;
        }

        const stats = await storage.getBotStats();
        const threats = await storage.getThreats(5);
        const systemHealth = await storage.getSystemHealth();
        
        if (!stats || !systemHealth) {
          console.log('Cannot send status report: stats or system health not available');
          return;
        }
        
        let serverList = '';
        let totalMembers = 0;
        
        this.client.guilds.cache.forEach(guild => {
          serverList += `• ${guild.name}: ${guild.memberCount} members\n`;
          totalMembers += guild.memberCount;
        });

        const recentThreats = threats.slice(0, 3).map(t => 
          `• ${t.type.toUpperCase()}: ${t.description}`
        ).join('\n') || 'No recent threats';

        const report = `
🤖 **BOT STATUS REPORT**
━━━━━━━━━━━━━━━━━━━━━

📊 **System Status**
⏰ Uptime: ${stats.uptime}
💾 Memory: ${stats.memoryUsage}
🖥️ CPU: ${systemHealth.cpuUsage}%
🧠 RAM: ${systemHealth.ramUsage}%

🌐 **Server Stats**
📡 Active Servers: ${stats.activeServers}
👥 Total Members: ${totalMembers}

🚨 **Security Status**
⚔️ Active Threats: ${threats.length}

**Recent Threats:**
${recentThreats}

📋 **Server List:**
${serverList || 'No servers'}
━━━━━━━━━━━━━━━━━━━━━
        `.trim();

        if ('send' in owner) {
          await owner.send(report);
        }
      } catch (error) {
        console.error('Failed to send status report:', error);
      }

      const nextInterval = Math.floor(Math.random() * 120000) + 60000;
      this.statusReportTimeout = setTimeout(sendReport, nextInterval);
    };

    const initialDelay = Math.floor(Math.random() * 120000) + 60000;
    this.statusReportTimeout = setTimeout(sendReport, initialDelay);
  }

  async stop(): Promise<void> {
    // Clear all intervals and timeouts to prevent memory leaks
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = undefined;
    }
    if (this.statusReportTimeout) {
      clearTimeout(this.statusReportTimeout);
      this.statusReportTimeout = undefined;
    }
    
    this.client.destroy();
    this.isReady = false;
  }

  async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error(`Maximum reconnection attempts (${this.maxReconnectAttempts}) reached`);
    }

    this.reconnectAttempts++;
    console.log(`Discord bot reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    try {
      await this.stop();
      await new Promise(resolve => setTimeout(resolve, 5000 * this.reconnectAttempts));
      await this.start();
      console.log('Discord bot successfully reconnected');
    } catch (error) {
      console.error('Discord bot reconnection failed:', error);
      throw error;
    }
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const latency = this.client.ws.ping;
    this.lastPingTime = Date.now();

    if (!this.isReady) {
      return {
        healthy: false,
        latency,
        message: 'Discord bot is not ready',
        metadata: { 
          wsStatus: this.client.ws.status,
          ping: latency,
          guilds: this.client.guilds.cache.size,
          reconnectAttempts: this.reconnectAttempts
        }
      };
    }

    if (!this.client.user) {
      return {
        healthy: false,
        latency,
        message: 'Discord bot user is not available',
        metadata: { wsStatus: this.client.ws.status }
      };
    }

    if (latency < 0 || latency > 2000) {
      return {
        healthy: false,
        latency,
        message: `Discord bot ping is ${latency < 0 ? 'invalid' : 'too high'}`,
        metadata: { 
          wsStatus: this.client.ws.status,
          ping: latency,
          guilds: this.client.guilds.cache.size
        }
      };
    }

    return {
      healthy: true,
      latency,
      message: 'Discord bot is operational',
      metadata: { 
        wsStatus: this.client.ws.status,
        ping: latency,
        guilds: this.client.guilds.cache.size,
        uptime: Date.now() - this.startTime,
        user: this.client.user.tag
      }
    };
  }

  isConnected(): boolean {
    return this.isReady && this.client.user !== null;
  }

  getClient(): Client {
    return this.client;
  }

  getRecoveryEngine(): RecoveryEngine | undefined {
    return this.recoveryEngine;
  }
}

const primaryDiscordBot = new DiscordBot();
const backupDiscordBot1 = new DiscordBot();
const backupDiscordBot2 = new DiscordBot();

const resilientDiscordBot = new ResilientModule({
  primary: primaryDiscordBot,
  backups: [backupDiscordBot1, backupDiscordBot2],
  errorThreshold: 2,
  timeout: 10000,
  resetTimeout: 30000,
  halfOpenMaxAttempts: 2,
  rollingWindowSize: 50,
  errorBudget: 0.1
});

resilientDiscordBot.onFailover((from, to, reason) => {
  console.error(`[Discord Bot] FAILOVER: ${from} -> backup[${to}] (Reason: ${reason})`);
  storage.createIncident({
    type: 'system',
    severity: 'critical',
    title: 'Discord Bot Failover',
    description: `Discord Bot failed over from ${from} to backup ${to}`,
    serverId: 'system',
    serverName: 'System',
    affectedUsers: [],
    actionsPerformed: ['failover', 'bot_reconnection_attempted'],
    evidence: { from, to, reason, timestamp: new Date(), critical: true }
  }).catch(err => console.error('Failed to log Discord Bot failover incident:', err));
});

resilientDiscordBot.onRestore((instance) => {
  console.log(`[Discord Bot] RESTORED to ${instance} instance`);
  storage.createIncident({
    type: 'system',
    severity: 'low',
    title: 'Discord Bot Restored',
    description: `Discord Bot successfully restored to ${instance} instance`,
    serverId: 'system',
    serverName: 'System',
    affectedUsers: [],
    actionsPerformed: ['restore', 'service_recovery_complete'],
    evidence: { instance, timestamp: new Date() }
  }).catch(err => console.error('Failed to log Discord Bot restore incident:', err));
});

export const discordBot = resilientDiscordBot;

export async function getRecoveryEngine(): Promise<RecoveryEngine | undefined> {
  try {
    const engine = await resilientDiscordBot.execute('getRecoveryEngine');
    return engine;
  } catch (error) {
    console.error('[Discord Bot] Error getting recovery engine:', error);
    return undefined;
  }
}

export async function checkDiscordBotHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const healthCheck = await resilientDiscordBot.execute('checkHealth');
    const latency = Date.now() - startTime;
    
    if (healthCheck.healthy) {
      return {
        healthy: true,
        latency,
        message: 'Discord Bot is operational',
        metadata: { 
          ...healthCheck.metadata,
          healthCheckLatency: latency
        }
      };
    }
    
    return {
      healthy: false,
      latency,
      message: healthCheck.message || 'Discord Bot health check failed',
      metadata: healthCheck.metadata
    };
  } catch (error: any) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      message: `Discord Bot health check error: ${error?.message || 'Unknown error'}`,
      metadata: { error: error?.message }
    };
  }
}

export async function checkRecoveryEngineHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const recoveryEngine = await getRecoveryEngine();
    
    if (!recoveryEngine) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: 'Recovery Engine is not initialized',
        metadata: { initialized: false }
      };
    }

    const healthCheck = await recoveryEngine.checkHealth();
    return healthCheck;
  } catch (error: any) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      message: `Recovery Engine health check error: ${error?.message || 'Unknown error'}`,
      metadata: { error: error?.message }
    };
  }
}
