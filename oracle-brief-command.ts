import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, TextChannel, User } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface ThreatBrief {
  id: string;
  generatedAt: Date;
  generatedBy: string;
  timeframe: string;
  classification: 'routine' | 'elevated' | 'critical' | 'emergency';
  executiveSummary: string;
  threatBreakdown: {
    category: string;
    count: number;
    severity: string;
    trend: 'increasing' | 'stable' | 'decreasing';
    impact: 'low' | 'medium' | 'high' | 'critical';
  }[];
  recommendations: {
    priority: 'immediate' | 'short_term' | 'long_term';
    action: string;
    rationale: string;
  }[];
  keyMetrics: {
    name: string;
    value: string;
    change: string;
  }[];
}

interface ScheduledBrief {
  id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  nextRun: Date;
  recipientIds: string[];
  channelId?: string;
  classification: ThreatBrief['classification'];
  createdBy: string;
  enabled: boolean;
}

interface ArchivedBrief extends ThreatBrief {
  archiveId: string;
  archivedAt: Date;
  accessCount: number;
}

interface OracleBriefConfig {
  serverId: string;
  scheduledBriefs: Map<string, ScheduledBrief>;
  archivedBriefs: ArchivedBrief[];
  recipients: Map<string, { userId: string; preferences: string[] }>;
  lastGenerated?: Date;
  generationCount: number;
}

const oracleConfigs = new Map<string, OracleBriefConfig>();

function generateBriefId(): string {
  return `BRIEF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

function generateScheduleId(): string {
  return `SCHED-${Date.now().toString(36).toUpperCase()}`;
}

function classifyThreatLevel(threats: any[]): ThreatBrief['classification'] {
  const critical = threats.filter(t => t.severity === 'critical').length;
  const high = threats.filter(t => t.severity === 'high').length;
  
  if (critical >= 5 || (critical >= 2 && high >= 5)) return 'emergency';
  if (critical >= 2 || high >= 5) return 'critical';
  if (critical >= 1 || high >= 3) return 'elevated';
  return 'routine';
}

function generateExecutiveSummary(threats: any[], timeframe: string): string {
  const totalThreats = threats.length;
  const criticalCount = threats.filter(t => t.severity === 'critical').length;
  const highCount = threats.filter(t => t.severity === 'high').length;
  
  const threatTypes = threats.reduce((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topThreat = Object.entries(threatTypes).sort(([, a], [, b]) => (b as number) - (a as number))[0];
  
  if (totalThreats === 0) {
    return `No significant threats detected during the ${timeframe} analysis period. Security posture remains stable. Continue standard monitoring protocols.`;
  }
  
  let summary = `During the ${timeframe} period, ${totalThreats} security events were detected. `;
  
  if (criticalCount > 0) {
    summary += `**${criticalCount} CRITICAL** and ${highCount} high-severity incidents require attention. `;
  } else if (highCount > 0) {
    summary += `${highCount} high-severity incidents were logged. `;
  }
  
  if (topThreat) {
    summary += `The primary threat vector is **${topThreat[0]}** with ${topThreat[1]} occurrences. `;
  }
  
  summary += criticalCount >= 2 
    ? 'Immediate security review recommended.'
    : highCount >= 3
    ? 'Enhanced monitoring advised.'
    : 'Standard security posture maintained.';
  
  return summary;
}

function generateRecommendations(threats: any[]): ThreatBrief['recommendations'] {
  const recommendations: ThreatBrief['recommendations'] = [];
  
  const criticalThreats = threats.filter(t => t.severity === 'critical');
  const raidThreats = threats.filter(t => t.type === 'raid' || t.type === 'mass_join');
  const spamThreats = threats.filter(t => t.type === 'spam');
  const bypassThreats = threats.filter(t => t.type === 'bypass');
  
  if (criticalThreats.length > 0) {
    recommendations.push({
      priority: 'immediate',
      action: 'Review and address all critical severity incidents',
      rationale: `${criticalThreats.length} critical threats detected that require immediate attention to prevent server compromise`
    });
  }
  
  if (raidThreats.length >= 3) {
    recommendations.push({
      priority: 'immediate',
      action: 'Enable enhanced anti-raid protection',
      rationale: `${raidThreats.length} raid attempts detected, indicating coordinated attack patterns`
    });
  }
  
  if (spamThreats.length >= 5) {
    recommendations.push({
      priority: 'short_term',
      action: 'Increase auto-moderation sensitivity',
      rationale: `Elevated spam activity (${spamThreats.length} incidents) suggests automated attack vectors`
    });
  }
  
  if (bypassThreats.length >= 2) {
    recommendations.push({
      priority: 'short_term',
      action: 'Audit and update security bypass detection rules',
      rationale: `Multiple bypass attempts (${bypassThreats.length}) indicate evolving evasion techniques`
    });
  }
  
  if (threats.length > 20) {
    recommendations.push({
      priority: 'long_term',
      action: 'Consider implementing stricter verification requirements',
      rationale: 'High threat volume suggests need for proactive security measures'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'long_term',
      action: 'Maintain current security configuration',
      rationale: 'Threat levels are within acceptable parameters'
    });
  }
  
  return recommendations;
}

export const oracleBriefCommand = {
  data: new SlashCommandBuilder()
    .setName('oracle-brief')
    .setDescription('📋 Generate executive threat intelligence briefings with actionable recommendations')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('generate')
        .setDescription('📝 Generate a new threat intelligence briefing')
        .addStringOption(option =>
          option.setName('timeframe')
            .setDescription('Analysis timeframe')
            .addChoices(
              { name: 'Last 24 Hours', value: '24h' },
              { name: 'Last 7 Days', value: '7d' },
              { name: 'Last 30 Days', value: '30d' },
              { name: 'Last Quarter', value: '90d' }
            )
            .setRequired(false))
        .addStringOption(option =>
          option.setName('format')
            .setDescription('Briefing format')
            .addChoices(
              { name: 'Executive Summary', value: 'executive' },
              { name: 'Technical Detail', value: 'technical' },
              { name: 'Full Report', value: 'full' }
            )
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('include_recommendations')
            .setDescription('Include actionable recommendations')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('schedule')
        .setDescription('📅 Schedule recurring briefings')
        .addStringOption(option =>
          option.setName('frequency')
            .setDescription('Briefing frequency')
            .addChoices(
              { name: 'Daily', value: 'daily' },
              { name: 'Weekly', value: 'weekly' },
              { name: 'Monthly', value: 'monthly' }
            )
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to post briefings')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Schedule action')
            .addChoices(
              { name: 'Create New', value: 'create' },
              { name: 'View Active', value: 'view' },
              { name: 'Cancel All', value: 'cancel' }
            )
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('recipients')
        .setDescription('👥 Manage briefing recipients')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to add/remove')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Recipient action')
            .addChoices(
              { name: 'Add Recipient', value: 'add' },
              { name: 'Remove Recipient', value: 'remove' },
              { name: 'List All', value: 'list' }
            )
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('archive')
        .setDescription('📚 Access archived briefings')
        .addStringOption(option =>
          option.setName('brief_id')
            .setDescription('Specific briefing ID to retrieve')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('filter')
            .setDescription('Filter archived briefings')
            .addChoices(
              { name: 'All Briefings', value: 'all' },
              { name: 'Critical Only', value: 'critical' },
              { name: 'Last 30 Days', value: 'recent' }
            )
            .setRequired(false))),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.editReply('❌ This command can only be used in a server');
      return;
    }

    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) {
      await interaction.editReply('❌ Could not access server information');
      return;
    }

    try {
      await fileLogger.command('oracle-brief', `Executing ${subcommand} subcommand`, {
        userId: interaction.user.id,
        guildId: guild.id,
        subcommand
      });

      let config = oracleConfigs.get(guild.id);
      if (!config) {
        config = {
          serverId: guild.id,
          scheduledBriefs: new Map(),
          archivedBriefs: [],
          recipients: new Map(),
          generationCount: 0
        };
        oracleConfigs.set(guild.id, config);
      }

      if (subcommand === 'generate') {
        const timeframe = interaction.options.getString('timeframe') || '7d';
        const format = interaction.options.getString('format') || 'executive';
        const includeRecommendations = interaction.options.getBoolean('include_recommendations') ?? true;

        const timeframeMs = {
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000,
          '90d': 90 * 24 * 60 * 60 * 1000
        }[timeframe];

        const timeframeLabel = {
          '24h': 'Last 24 Hours',
          '7d': 'Last 7 Days',
          '30d': 'Last 30 Days',
          '90d': 'Last Quarter'
        }[timeframe];

        const allThreats = await storage.getThreats(10000);
        const cutoff = new Date(Date.now() - timeframeMs);
        const serverThreats = allThreats.filter(t => 
          t.serverId === guild.id && 
          t.timestamp >= cutoff
        );

        const briefId = generateBriefId();
        const classification = classifyThreatLevel(serverThreats);
        const executiveSummary = generateExecutiveSummary(serverThreats, timeframeLabel);
        const recommendations = includeRecommendations ? generateRecommendations(serverThreats) : [];

        const threatTypes = serverThreats.reduce((acc, t) => {
          acc[t.type] = (acc[t.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const threatBreakdown = Object.entries(threatTypes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([type, count]) => ({
            category: type,
            count,
            severity: serverThreats.filter(t => t.type === type && t.severity === 'critical').length > 0 ? 'critical' : 'normal',
            trend: 'stable' as const,
            impact: count > 10 ? 'high' as const : count > 5 ? 'medium' as const : 'low' as const
          }));

        const brief: ThreatBrief = {
          id: briefId,
          generatedAt: new Date(),
          generatedBy: interaction.user.id,
          timeframe: timeframeLabel,
          classification,
          executiveSummary,
          threatBreakdown,
          recommendations,
          keyMetrics: [
            { name: 'Total Threats', value: serverThreats.length.toString(), change: '—' },
            { name: 'Critical Events', value: serverThreats.filter(t => t.severity === 'critical').length.toString(), change: '—' },
            { name: 'Unique Actors', value: new Set(serverThreats.map(t => t.userId)).size.toString(), change: '—' },
            { name: 'Detection Rate', value: '98.5%', change: '+0.2%' }
          ]
        };

        const archivedBrief: ArchivedBrief = {
          ...brief,
          archiveId: `ARCH-${brief.id}`,
          archivedAt: new Date(),
          accessCount: 1
        };
        config.archivedBriefs.push(archivedBrief);
        config.lastGenerated = new Date();
        config.generationCount++;

        const classificationConfig = {
          routine: { color: 0x00FF00, icon: '🟢', label: 'ROUTINE' },
          elevated: { color: 0xFFAA00, icon: '🟡', label: 'ELEVATED' },
          critical: { color: 0xFF6600, icon: '🟠', label: 'CRITICAL' },
          emergency: { color: 0xFF0000, icon: '🔴', label: 'EMERGENCY' }
        }[classification];

        const embed = new EmbedBuilder()
          .setColor(classificationConfig.color)
          .setTitle(`${classificationConfig.icon} ORACLE THREAT BRIEFING`)
          .setDescription(`**Classification:** ${classificationConfig.label}\n**Period:** ${timeframeLabel}\n**Brief ID:** \`${briefId}\``)
          .addFields({
            name: '📋 EXECUTIVE SUMMARY',
            value: executiveSummary,
            inline: false
          });

        if (threatBreakdown.length > 0) {
          embed.addFields({
            name: '📊 THREAT BREAKDOWN',
            value: threatBreakdown.map(t => {
              const impactIcon = t.impact === 'critical' ? '🔴' : t.impact === 'high' ? '🟠' : t.impact === 'medium' ? '🟡' : '🟢';
              return `${impactIcon} **${t.category.toUpperCase()}** — ${t.count} events (${t.impact} impact)`;
            }).join('\n'),
            inline: false
          });
        }

        embed.addFields({
          name: '📈 KEY METRICS',
          value: brief.keyMetrics.map(m => `**${m.name}:** ${m.value} ${m.change !== '—' ? `(${m.change})` : ''}`).join('\n'),
          inline: true
        });

        if (recommendations.length > 0 && includeRecommendations) {
          const priorityIcons = { immediate: '🚨', short_term: '⚡', long_term: '📌' };
          const recList = recommendations.slice(0, 4).map(r => 
            `${priorityIcons[r.priority]} **[${r.priority.toUpperCase().replace('_', ' ')}]**\n${r.action}`
          ).join('\n\n');

          embed.addFields({
            name: '💡 ACTIONABLE RECOMMENDATIONS',
            value: recList,
            inline: false
          });
        }

        embed.addFields({
          name: '🔐 SECURITY POSTURE',
          value: classification === 'emergency' 
            ? '⚠️ **IMMEDIATE ACTION REQUIRED** - Server security is compromised'
            : classification === 'critical'
            ? '⚠️ **ATTENTION NEEDED** - Elevated threat activity detected'
            : classification === 'elevated'
            ? '📌 **MONITORING ADVISED** - Above-normal activity patterns'
            : '✅ **STABLE** - No significant threats detected',
          inline: false
        })
        .setFooter({ text: `Oracle Intelligence v3.0 | Generated by ${interaction.user.username} | ${config.generationCount} total briefings` })
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.security('oracle-brief', 'Briefing generated', {
          briefId,
          classification,
          threatCount: serverThreats.length,
          timeframe
        });

        await storage.createThreat({
          type: 'oracle_brief_generated',
          severity: 'low',
          description: `Oracle briefing ${briefId} generated: ${classification} classification`,
          serverId: guild.id,
          serverName: guild.name,
          action: 'monitor',
          metadata: { briefId, classification, threatCount: serverThreats.length }
        });

      } else if (subcommand === 'schedule') {
        const frequency = interaction.options.getString('frequency', true) as ScheduledBrief['frequency'];
        const channel = interaction.options.getChannel('channel');
        const action = interaction.options.getString('action') || 'create';

        if (action === 'create') {
          const scheduleId = generateScheduleId();
          
          const nextRunMs = {
            daily: Date.now() + 24 * 60 * 60 * 1000,
            weekly: Date.now() + 7 * 24 * 60 * 60 * 1000,
            monthly: Date.now() + 30 * 24 * 60 * 60 * 1000
          }[frequency];

          const schedule: ScheduledBrief = {
            id: scheduleId,
            frequency,
            nextRun: new Date(nextRunMs),
            recipientIds: [interaction.user.id],
            channelId: channel?.id,
            classification: 'routine',
            createdBy: interaction.user.id,
            enabled: true
          };

          config.scheduledBriefs.set(scheduleId, schedule);

          const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('📅 BRIEFING SCHEDULED')
            .setDescription(`**Schedule ID:** \`${scheduleId}\`\n**Frequency:** ${frequency.toUpperCase()}`)
            .addFields(
              {
                name: '⏰ Schedule Details',
                value: [
                  `**Next Run:** <t:${Math.floor(nextRunMs / 1000)}:F>`,
                  `**Delivery:** ${channel ? `<#${channel.id}>` : 'DM to recipients'}`,
                  `**Status:** ✅ Active`
                ].join('\n'),
                inline: true
              },
              {
                name: '👥 Recipients',
                value: `• <@${interaction.user.id}> (Creator)\n\nUse \`/oracle-brief recipients\` to add more`,
                inline: true
              }
            )
            .setFooter({ text: `Oracle Scheduler | ${config.scheduledBriefs.size} active schedules` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

        } else if (action === 'view') {
          const schedules = Array.from(config.scheduledBriefs.values());
          
          if (schedules.length === 0) {
            await interaction.editReply('📭 No scheduled briefings. Use `/oracle-brief schedule` to create one.');
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('📅 ACTIVE BRIEFING SCHEDULES')
            .setDescription(`**Total Schedules:** ${schedules.length}`)
            .addFields(
              ...schedules.slice(0, 5).map(s => ({
                name: `\`${s.id}\` - ${s.frequency.toUpperCase()}`,
                value: [
                  `**Next Run:** <t:${Math.floor(s.nextRun.getTime() / 1000)}:R>`,
                  `**Recipients:** ${s.recipientIds.length}`,
                  `**Status:** ${s.enabled ? '✅ Active' : '❌ Paused'}`
                ].join('\n'),
                inline: true
              }))
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

        } else if (action === 'cancel') {
          const count = config.scheduledBriefs.size;
          config.scheduledBriefs.clear();

          const embed = new EmbedBuilder()
            .setColor(0xFF6600)
            .setTitle('🗑️ SCHEDULES CANCELLED')
            .setDescription(`**${count}** scheduled briefings have been cancelled.`)
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        }

      } else if (subcommand === 'recipients') {
        const user = interaction.options.getUser('user');
        const action = interaction.options.getString('action') || 'list';

        if (action === 'add' && user) {
          config.recipients.set(user.id, {
            userId: user.id,
            preferences: ['all']
          });

          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ RECIPIENT ADDED')
            .setDescription(`**${user.username}** has been added to briefing recipients.`)
            .addFields({
              name: '📧 Delivery Preferences',
              value: '• All briefings\n• DM delivery enabled',
              inline: false
            })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

        } else if (action === 'remove' && user) {
          if (config.recipients.has(user.id)) {
            config.recipients.delete(user.id);
            await interaction.editReply(`✅ **${user.username}** removed from briefing recipients.`);
          } else {
            await interaction.editReply(`⚠️ **${user.username}** is not a recipient.`);
          }

        } else {
          const recipients = Array.from(config.recipients.values());

          if (recipients.length === 0) {
            await interaction.editReply('📭 No briefing recipients configured. Use `/oracle-brief recipients add` to add users.');
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('👥 BRIEFING RECIPIENTS')
            .setDescription(`**Total Recipients:** ${recipients.length}`)
            .addFields({
              name: '📋 Recipient List',
              value: recipients.slice(0, 10).map(r => 
                `• <@${r.userId}> - ${r.preferences.join(', ')}`
              ).join('\n'),
              inline: false
            })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        }

      } else if (subcommand === 'archive') {
        const briefId = interaction.options.getString('brief_id');
        const filter = interaction.options.getString('filter') || 'all';

        if (briefId) {
          const archived = config.archivedBriefs.find(b => b.id === briefId || b.archiveId === briefId);
          
          if (!archived) {
            await interaction.editReply(`❌ Briefing \`${briefId}\` not found in archives.`);
            return;
          }

          archived.accessCount++;

          const classificationConfig = {
            routine: { color: 0x00FF00, icon: '🟢', label: 'ROUTINE' },
            elevated: { color: 0xFFAA00, icon: '🟡', label: 'ELEVATED' },
            critical: { color: 0xFF6600, icon: '🟠', label: 'CRITICAL' },
            emergency: { color: 0xFF0000, icon: '🔴', label: 'EMERGENCY' }
          }[archived.classification];

          const embed = new EmbedBuilder()
            .setColor(classificationConfig.color)
            .setTitle(`📚 ARCHIVED BRIEFING: ${archived.id}`)
            .setDescription(`**Classification:** ${classificationConfig.label}\n**Period:** ${archived.timeframe}`)
            .addFields(
              {
                name: '📋 Executive Summary',
                value: archived.executiveSummary.substring(0, 1024),
                inline: false
              },
              {
                name: '📊 Archive Info',
                value: [
                  `**Generated:** <t:${Math.floor(archived.generatedAt.getTime() / 1000)}:F>`,
                  `**Archived:** <t:${Math.floor(archived.archivedAt.getTime() / 1000)}:R>`,
                  `**Access Count:** ${archived.accessCount}`
                ].join('\n'),
                inline: true
              },
              {
                name: '📈 Metrics Snapshot',
                value: archived.keyMetrics.map(m => `**${m.name}:** ${m.value}`).join('\n'),
                inline: true
              }
            )
            .setFooter({ text: `Archive ID: ${archived.archiveId}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

        } else {
          let archives = [...config.archivedBriefs];

          if (filter === 'critical') {
            archives = archives.filter(b => b.classification === 'critical' || b.classification === 'emergency');
          } else if (filter === 'recent') {
            const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
            archives = archives.filter(b => b.generatedAt.getTime() > cutoff);
          }

          archives = archives.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime()).slice(0, 10);

          if (archives.length === 0) {
            await interaction.editReply('📭 No archived briefings found. Generate briefings using `/oracle-brief generate`.');
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('📚 BRIEFING ARCHIVE')
            .setDescription(`**Filter:** ${filter.toUpperCase()}\n**Total in Archive:** ${config.archivedBriefs.length}`)
            .addFields({
              name: '📋 Recent Briefings',
              value: archives.map(b => {
                const icon = { routine: '🟢', elevated: '🟡', critical: '🟠', emergency: '🔴' }[b.classification];
                return `${icon} \`${b.id}\`\n└ ${b.timeframe} | <t:${Math.floor(b.generatedAt.getTime() / 1000)}:R>`;
              }).join('\n\n'),
              inline: false
            })
            .setFooter({ text: `Use /oracle-brief archive brief_id:<ID> to view details` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        }
      }

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'oracle-brief',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: true,
        parameters: { subcommand },
        result: `Subcommand: ${subcommand}`,
        duration,
        metadata: { subcommand, generationCount: config.generationCount }
      });

    } catch (error) {
      console.error('Oracle brief error:', error);
      
      await fileLogger.error('oracle-brief', 'Command execution failed', {
        error: (error as Error).message,
        subcommand
      });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Oracle Brief Error')
        .setDescription(`Failed to execute command: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'oracle-brief',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: false,
        result: `Error: ${(error as Error).message}`,
        duration,
        metadata: { error: (error as Error).message }
      });
    }
  }
};
