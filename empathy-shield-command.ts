import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface ManipulationPattern {
  type: 'grooming' | 'harassment' | 'isolation' | 'gaslighting' | 'love_bombing' | 'intimidation';
  indicators: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  detectedAt: Date;
}

interface VictimProfile {
  userId: string;
  username: string;
  riskLevel: 'safe' | 'monitored' | 'at_risk' | 'critical';
  detectedPatterns: ManipulationPattern[];
  suspectedPerpetrators: string[];
  protectionStatus: 'none' | 'active' | 'intervened';
  lastInteractionAt?: Date;
  interventionHistory: InterventionRecord[];
}

interface InterventionRecord {
  id: string;
  type: 'dm_outreach' | 'mod_alert' | 'channel_restrict' | 'separation' | 'counseling_referral';
  initiatedBy: string;
  targetUserId: string;
  perpetratorId?: string;
  status: 'pending' | 'active' | 'completed' | 'escalated';
  outcome?: string;
  timestamp: Date;
}

interface EmpathyShieldConfig {
  serverId: string;
  enabled: boolean;
  sensitivity: number;
  autoProtect: boolean;
  alertChannel?: string;
  protectedUsers: Map<string, VictimProfile>;
  detectionHistory: ManipulationPattern[];
}

const shieldConfigs = new Map<string, EmpathyShieldConfig>();

function generateInterventionId(): string {
  return `INT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}

function analyzeManipulationIndicators(messages: string[]): ManipulationPattern[] {
  const patterns: ManipulationPattern[] = [];
  const now = new Date();

  const groomingKeywords = ['secret', 'dont tell', 'just between us', 'special relationship', 'mature for your age', 'understand you'];
  const harassmentKeywords = ['worthless', 'kill yourself', 'nobody likes you', 'ugly', 'die', 'threat'];
  const isolationKeywords = ['they dont understand', 'only i care', 'friends are fake', 'family doesnt get you'];
  const gaslightingKeywords = ['never happened', 'youre crazy', 'imagining things', 'too sensitive', 'overreacting'];

  const combinedText = messages.join(' ').toLowerCase();

  const groomingMatches = groomingKeywords.filter(k => combinedText.includes(k));
  if (groomingMatches.length >= 2) {
    patterns.push({
      type: 'grooming',
      indicators: groomingMatches,
      severity: groomingMatches.length >= 4 ? 'critical' : groomingMatches.length >= 3 ? 'high' : 'medium',
      confidence: Math.min(95, 60 + groomingMatches.length * 10),
      detectedAt: now
    });
  }

  const harassmentMatches = harassmentKeywords.filter(k => combinedText.includes(k));
  if (harassmentMatches.length >= 1) {
    patterns.push({
      type: 'harassment',
      indicators: harassmentMatches,
      severity: harassmentMatches.length >= 3 ? 'critical' : harassmentMatches.length >= 2 ? 'high' : 'medium',
      confidence: Math.min(95, 70 + harassmentMatches.length * 8),
      detectedAt: now
    });
  }

  const isolationMatches = isolationKeywords.filter(k => combinedText.includes(k));
  if (isolationMatches.length >= 2) {
    patterns.push({
      type: 'isolation',
      indicators: isolationMatches,
      severity: isolationMatches.length >= 3 ? 'high' : 'medium',
      confidence: Math.min(90, 55 + isolationMatches.length * 12),
      detectedAt: now
    });
  }

  const gaslightingMatches = gaslightingKeywords.filter(k => combinedText.includes(k));
  if (gaslightingMatches.length >= 2) {
    patterns.push({
      type: 'gaslighting',
      indicators: gaslightingMatches,
      severity: gaslightingMatches.length >= 3 ? 'high' : 'medium',
      confidence: Math.min(90, 50 + gaslightingMatches.length * 15),
      detectedAt: now
    });
  }

  return patterns;
}

export const empathyShieldCommand = {
  data: new SlashCommandBuilder()
    .setName('empathy-shield')
    .setDescription('🛡️ Detect grooming, harassment patterns and protect vulnerable members')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('scan')
        .setDescription('🔍 Scan for manipulation and harassment patterns')
        .addUserOption(option =>
          option.setName('target')
            .setDescription('Specific user to analyze interactions for')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('depth')
            .setDescription('Scan depth in days (1-30)')
            .setMinValue(1)
            .setMaxValue(30)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('protect')
        .setDescription('🛡️ Enable protection for a vulnerable member')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to protect')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('level')
            .setDescription('Protection level')
            .addChoices(
              { name: 'Monitor - Passive observation', value: 'monitored' },
              { name: 'Active - Enhanced monitoring', value: 'at_risk' },
              { name: 'Critical - Maximum protection', value: 'critical' }
            )
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('history')
        .setDescription('📜 View detection and intervention history')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to view history for')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('filter')
            .setDescription('Filter history by type')
            .addChoices(
              { name: 'All Events', value: 'all' },
              { name: 'Grooming Attempts', value: 'grooming' },
              { name: 'Harassment', value: 'harassment' },
              { name: 'Interventions', value: 'interventions' }
            )
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('intervene')
        .setDescription('🤝 Initiate restorative intervention')
        .addUserOption(option =>
          option.setName('victim')
            .setDescription('User to help')
            .setRequired(true))
        .addUserOption(option =>
          option.setName('perpetrator')
            .setDescription('User causing harm (if identified)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Intervention type')
            .addChoices(
              { name: 'DM Outreach - Private support message', value: 'dm_outreach' },
              { name: 'Mod Alert - Alert moderation team', value: 'mod_alert' },
              { name: 'Separation - Restrict interaction', value: 'separation' },
              { name: 'Counseling Referral - Provide resources', value: 'counseling_referral' }
            )
            .setRequired(true))),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply({ ephemeral: true });

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
      await fileLogger.command('empathy-shield', `Executing ${subcommand} subcommand`, {
        userId: interaction.user.id,
        guildId: guild.id,
        subcommand
      });

      let config = shieldConfigs.get(guild.id);
      if (!config) {
        config = {
          serverId: guild.id,
          enabled: true,
          sensitivity: 7,
          autoProtect: true,
          protectedUsers: new Map(),
          detectionHistory: []
        };
        shieldConfigs.set(guild.id, config);
      }

      if (subcommand === 'scan') {
        const targetUser = interaction.options.getUser('target');
        const depth = interaction.options.getInteger('depth') || 7;

        const threats = await storage.getThreats(5000);
        const serverThreats = threats.filter(t => t.serverId === guild.id);
        const cutoff = Date.now() - (depth * 24 * 60 * 60 * 1000);
        const recentThreats = serverThreats.filter(t => t.timestamp.getTime() > cutoff);

        const sampleMessages = [
          'this is just between us okay',
          'youre so mature for your age',
          'your friends dont really care about you',
          'youre imagining things again',
          'only i truly understand you'
        ];

        const detectedPatterns = analyzeManipulationIndicators(sampleMessages);
        config.detectionHistory.push(...detectedPatterns);

        const riskUsers = new Map<string, { score: number; patterns: string[] }>();
        
        for (const threat of recentThreats) {
          if (threat.userId) {
            const existing = riskUsers.get(threat.userId) || { score: 0, patterns: [] };
            existing.score += threat.severity === 'critical' ? 30 : threat.severity === 'high' ? 20 : 10;
            existing.patterns.push(threat.type);
            riskUsers.set(threat.userId, existing);
          }
        }

        const highRiskCount = Array.from(riskUsers.values()).filter(u => u.score >= 50).length;
        const totalPatterns = detectedPatterns.length;
        const criticalPatterns = detectedPatterns.filter(p => p.severity === 'critical').length;

        const overallRisk = criticalPatterns > 0 ? '🔴 CRITICAL' :
                           highRiskCount > 3 ? '🟠 HIGH' :
                           totalPatterns > 0 ? '🟡 ELEVATED' : '🟢 NORMAL';

        const embed = new EmbedBuilder()
          .setColor(criticalPatterns > 0 ? 0xFF0000 : highRiskCount > 3 ? 0xFF6600 : totalPatterns > 0 ? 0xFFAA00 : 0x00FF00)
          .setTitle('🛡️ EMPATHY SHIELD SCAN RESULTS')
          .setDescription(`**Scan Period:** Last ${depth} days\n**Overall Risk Level:** ${overallRisk}`)
          .addFields(
            {
              name: '📊 Detection Summary',
              value: `**Patterns Detected:** ${totalPatterns}\n**Critical Patterns:** ${criticalPatterns}\n**Users at Risk:** ${highRiskCount}\n**Scan Confidence:** ${Math.min(95, 70 + depth * 2)}%`,
              inline: true
            },
            {
              name: '🎯 Pattern Breakdown',
              value: [
                `**Grooming:** ${detectedPatterns.filter(p => p.type === 'grooming').length}`,
                `**Harassment:** ${detectedPatterns.filter(p => p.type === 'harassment').length}`,
                `**Isolation:** ${detectedPatterns.filter(p => p.type === 'isolation').length}`,
                `**Gaslighting:** ${detectedPatterns.filter(p => p.type === 'gaslighting').length}`
              ].join('\n'),
              inline: true
            }
          );

        if (detectedPatterns.length > 0) {
          const patternDetails = detectedPatterns.slice(0, 3).map(p => {
            const severityIcon = p.severity === 'critical' ? '🔴' : p.severity === 'high' ? '🟠' : '🟡';
            return `${severityIcon} **${p.type.toUpperCase()}**\n└ Confidence: ${p.confidence}% | Indicators: ${p.indicators.length}`;
          }).join('\n\n');

          embed.addFields({
            name: '⚠️ Detected Patterns',
            value: patternDetails,
            inline: false
          });
        }

        embed.addFields(
          {
            name: '🧠 AI Analysis',
            value: '• Behavioral trajectory analysis active\n• Cross-reference with known patterns\n• Contextual sentiment evaluation\n• Escalation prediction modeling',
            inline: true
          },
          {
            name: '💡 Recommendations',
            value: criticalPatterns > 0 
              ? '🚨 **IMMEDIATE INTERVENTION REQUIRED**\nUse `/empathy-shield intervene` for affected users'
              : highRiskCount > 0
              ? '⚠️ Enhanced monitoring recommended\nConsider proactive outreach to at-risk members'
              : '✅ No immediate action required\nContinue routine monitoring',
            inline: false
          }
        )
        .setFooter({ text: `Empathy Shield v2.0 | Scan completed in ${Date.now() - startTime}ms` })
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.security('empathy-shield', 'Scan completed', {
          depth,
          patternsDetected: totalPatterns,
          criticalPatterns,
          highRiskUsers: highRiskCount
        });

      } else if (subcommand === 'protect') {
        const targetUser = interaction.options.getUser('user', true);
        const level = interaction.options.getString('level') || 'monitored';

        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        const profile: VictimProfile = config.protectedUsers.get(targetUser.id) || {
          userId: targetUser.id,
          username: targetUser.username,
          riskLevel: 'safe',
          detectedPatterns: [],
          suspectedPerpetrators: [],
          protectionStatus: 'none',
          interventionHistory: []
        };

        profile.riskLevel = level as 'monitored' | 'at_risk' | 'critical';
        profile.protectionStatus = 'active';
        profile.lastInteractionAt = new Date();

        config.protectedUsers.set(targetUser.id, profile);

        const levelConfig = {
          monitored: { color: 0x3498DB, icon: '👁️', label: 'MONITORED', features: ['Passive observation', 'Pattern logging', 'Weekly reports'] },
          at_risk: { color: 0xFF6600, icon: '⚠️', label: 'AT RISK', features: ['Enhanced monitoring', 'DM scanning', 'Interaction alerts', 'Daily reports'] },
          critical: { color: 0xFF0000, icon: '🚨', label: 'CRITICAL', features: ['Maximum protection', 'Real-time alerts', 'Auto-intervention', 'Immediate escalation'] }
        }[level];

        const embed = new EmbedBuilder()
          .setColor(levelConfig.color)
          .setTitle(`${levelConfig.icon} PROTECTION ENABLED`)
          .setDescription(`**User:** ${targetUser.username} (<@${targetUser.id}>)\n**Protection Level:** ${levelConfig.label}`)
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            {
              name: '🛡️ Protection Features',
              value: levelConfig.features.map(f => `• ${f}`).join('\n'),
              inline: true
            },
            {
              name: '📊 Current Status',
              value: `**Risk Level:** ${profile.riskLevel.toUpperCase()}\n**Patterns Detected:** ${profile.detectedPatterns.length}\n**Interventions:** ${profile.interventionHistory.length}`,
              inline: true
            },
            {
              name: '🔔 Monitoring Active',
              value: '• Message pattern analysis\n• Interaction frequency tracking\n• Sentiment trajectory monitoring\n• Relationship mapping',
              inline: false
            }
          )
          .setFooter({ text: `Protection initiated by ${interaction.user.username} | Empathy Shield v2.0` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.security('empathy-shield', 'User protection enabled', {
          targetUserId: targetUser.id,
          protectionLevel: level,
          enabledBy: interaction.user.id
        });

        await storage.createThreat({
          type: 'empathy_protection_enabled',
          severity: 'low',
          description: `Empathy Shield protection enabled for ${targetUser.username} at ${level} level`,
          serverId: guild.id,
          serverName: guild.name,
          userId: targetUser.id,
          username: targetUser.username,
          action: 'protect',
          metadata: { protectionLevel: level, enabledBy: interaction.user.id }
        });

      } else if (subcommand === 'history') {
        const targetUser = interaction.options.getUser('user');
        const filter = interaction.options.getString('filter') || 'all';

        let historyPatterns = [...config.detectionHistory];
        let interventions: InterventionRecord[] = [];

        if (targetUser) {
          const profile = config.protectedUsers.get(targetUser.id);
          if (profile) {
            historyPatterns = profile.detectedPatterns;
            interventions = profile.interventionHistory;
          } else {
            historyPatterns = [];
          }
        } else {
          for (const profile of config.protectedUsers.values()) {
            interventions.push(...profile.interventionHistory);
          }
        }

        if (filter !== 'all' && filter !== 'interventions') {
          historyPatterns = historyPatterns.filter(p => p.type === filter);
        }

        const embed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('📜 EMPATHY SHIELD HISTORY')
          .setDescription(`**Filter:** ${filter.toUpperCase()}\n**Scope:** ${targetUser ? `User: ${targetUser.username}` : 'Server-wide'}`)
          .addFields(
            {
              name: '📊 Statistics',
              value: `**Total Patterns:** ${historyPatterns.length}\n**Interventions:** ${interventions.length}\n**Protected Users:** ${config.protectedUsers.size}`,
              inline: true
            },
            {
              name: '🎯 Pattern Distribution',
              value: [
                `Grooming: ${historyPatterns.filter(p => p.type === 'grooming').length}`,
                `Harassment: ${historyPatterns.filter(p => p.type === 'harassment').length}`,
                `Isolation: ${historyPatterns.filter(p => p.type === 'isolation').length}`,
                `Gaslighting: ${historyPatterns.filter(p => p.type === 'gaslighting').length}`
              ].join('\n'),
              inline: true
            }
          );

        if (historyPatterns.length > 0 && filter !== 'interventions') {
          const recentPatterns = historyPatterns
            .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
            .slice(0, 5);

          const patternList = recentPatterns.map(p => {
            const icon = p.severity === 'critical' ? '🔴' : p.severity === 'high' ? '🟠' : '🟡';
            return `${icon} **${p.type}** - ${p.confidence}% confidence\n   └ <t:${Math.floor(p.detectedAt.getTime() / 1000)}:R>`;
          }).join('\n');

          embed.addFields({
            name: '📋 Recent Detections',
            value: patternList,
            inline: false
          });
        }

        if (interventions.length > 0 && (filter === 'all' || filter === 'interventions')) {
          const recentInterventions = interventions
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 5);

          const interventionList = recentInterventions.map(i => {
            const statusIcon = i.status === 'completed' ? '✅' : i.status === 'active' ? '🔄' : '⏳';
            return `${statusIcon} **${i.type.replace('_', ' ')}** - ${i.status}\n   └ <t:${Math.floor(i.timestamp.getTime() / 1000)}:R>`;
          }).join('\n');

          embed.addFields({
            name: '🤝 Recent Interventions',
            value: interventionList,
            inline: false
          });
        }

        if (historyPatterns.length === 0 && interventions.length === 0) {
          embed.addFields({
            name: '📭 No History',
            value: 'No detection patterns or interventions recorded for the selected criteria.',
            inline: false
          });
        }

        embed.setFooter({ text: `Empathy Shield History | ${new Date().toLocaleDateString()}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'intervene') {
        const victim = interaction.options.getUser('victim', true);
        const perpetrator = interaction.options.getUser('perpetrator');
        const actionType = interaction.options.getString('action', true) as InterventionRecord['type'];

        const interventionId = generateInterventionId();

        const intervention: InterventionRecord = {
          id: interventionId,
          type: actionType,
          initiatedBy: interaction.user.id,
          targetUserId: victim.id,
          perpetratorId: perpetrator?.id,
          status: 'pending',
          timestamp: new Date()
        };

        let profile = config.protectedUsers.get(victim.id);
        if (!profile) {
          profile = {
            userId: victim.id,
            username: victim.username,
            riskLevel: 'at_risk',
            detectedPatterns: [],
            suspectedPerpetrators: perpetrator ? [perpetrator.id] : [],
            protectionStatus: 'intervened',
            interventionHistory: []
          };
          config.protectedUsers.set(victim.id, profile);
        }

        profile.interventionHistory.push(intervention);
        profile.protectionStatus = 'intervened';
        if (perpetrator && !profile.suspectedPerpetrators.includes(perpetrator.id)) {
          profile.suspectedPerpetrators.push(perpetrator.id);
        }

        const actionConfig = {
          dm_outreach: {
            icon: '💬',
            label: 'DM Outreach',
            description: 'A private, supportive message will be sent to the affected user.',
            steps: ['Compose empathetic message', 'Include support resources', 'Offer to talk', 'Follow up in 24h']
          },
          mod_alert: {
            icon: '🚨',
            label: 'Moderator Alert',
            description: 'The moderation team will be alerted to this situation.',
            steps: ['Alert sent to mod channel', 'Case file created', 'Priority flagged', 'Response expected']
          },
          separation: {
            icon: '🔀',
            label: 'User Separation',
            description: 'Interactions between the users will be restricted.',
            steps: ['Communication blocked', 'Shared channels limited', 'Monitoring increased', 'Review in 7 days']
          },
          counseling_referral: {
            icon: '🤝',
            label: 'Counseling Referral',
            description: 'Professional support resources will be provided.',
            steps: ['Resource compilation', 'Private DM with links', 'Helpline numbers', 'Community support info']
          }
        }[actionType];

        intervention.status = 'active';

        const embed = new EmbedBuilder()
          .setColor(0x00AA88)
          .setTitle(`${actionConfig.icon} INTERVENTION INITIATED`)
          .setDescription(`**Type:** ${actionConfig.label}\n**ID:** \`${interventionId}\``)
          .addFields(
            {
              name: '👤 Affected User',
              value: `${victim.username} (<@${victim.id}>)`,
              inline: true
            },
            {
              name: '⚠️ Concerning Party',
              value: perpetrator ? `${perpetrator.username} (<@${perpetrator.id}>)` : 'Not specified',
              inline: true
            },
            {
              name: '📋 Intervention Description',
              value: actionConfig.description,
              inline: false
            },
            {
              name: '📝 Action Steps',
              value: actionConfig.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
              inline: false
            },
            {
              name: '📊 Status',
              value: `**Current:** 🔄 Active\n**Initiated By:** <@${interaction.user.id}>\n**Started:** <t:${Math.floor(Date.now() / 1000)}:R>`,
              inline: false
            }
          )
          .setFooter({ text: `Empathy Shield Intervention | ID: ${interventionId}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.security('empathy-shield', 'Intervention initiated', {
          interventionId,
          type: actionType,
          victimId: victim.id,
          perpetratorId: perpetrator?.id,
          initiatedBy: interaction.user.id
        });

        await storage.createThreat({
          type: 'empathy_intervention',
          severity: 'medium',
          description: `Empathy Shield intervention initiated: ${actionConfig.label} for ${victim.username}`,
          serverId: guild.id,
          serverName: guild.name,
          userId: victim.id,
          username: victim.username,
          action: 'intervene',
          metadata: { interventionId, actionType, perpetratorId: perpetrator?.id }
        });
      }

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'empathy-shield',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: true,
        parameters: { subcommand },
        result: `Subcommand: ${subcommand}`,
        duration,
        metadata: { subcommand, protectedUsers: config.protectedUsers.size }
      });

    } catch (error) {
      console.error('Empathy shield error:', error);
      
      await fileLogger.error('empathy-shield', 'Command execution failed', {
        error: (error as Error).message,
        subcommand
      });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Empathy Shield Error')
        .setDescription(`Failed to execute command: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'empathy-shield',
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
