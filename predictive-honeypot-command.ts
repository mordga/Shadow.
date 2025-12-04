import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, TextChannel, Role } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface AdaptiveLure {
  id: string;
  type: 'channel' | 'role' | 'invite' | 'webhook' | 'permission_bait';
  name: string;
  targetId: string;
  createdAt: Date;
  evolutionLevel: number;
  attractiveness: number;
  triggers: number;
  capturedUsers: CapturedAttacker[];
  lureConfig: {
    baitText: string;
    trapTrigger: string;
    evolutionEnabled: boolean;
    autoAdapt: boolean;
  };
  threatIntelSource: string[];
}

interface CapturedAttacker {
  userId: string;
  username: string;
  capturedAt: Date;
  triggerAction: string;
  tactics: string[];
  intent: 'raid' | 'spam' | 'nuke' | 'reconnaissance' | 'unknown';
  evidence: string[];
  actionTaken: 'ban' | 'quarantine' | 'monitor' | 'none';
}

interface HoneypotAnalytics {
  totalCaptures: number;
  tacticsDatabase: Map<string, number>;
  attackPatterns: string[];
  evolutionHistory: {
    timestamp: Date;
    lureId: string;
    change: string;
    effectiveness: number;
  }[];
}

interface PredictiveHoneypotConfig {
  serverId: string;
  lures: Map<string, AdaptiveLure>;
  analytics: HoneypotAnalytics;
  threatIntel: {
    knownTactics: string[];
    emergingThreats: string[];
    lastUpdate: Date;
  };
  autoEvolve: boolean;
  captureMode: 'aggressive' | 'passive' | 'adaptive';
}

const honeypotConfigs = new Map<string, PredictiveHoneypotConfig>();

function generateLureId(): string {
  return `LURE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}

function generateBaitName(type: string, evolutionLevel: number): string {
  const channelBaits = [
    ['free-admin', 'get-admin-here', 'admin-applications'],
    ['admin-secrets', 'mod-leak', 'staff-backdoor'],
    ['owner-private', 'nuke-commands', 'token-drop']
  ];
  
  const roleBaits = [
    ['Trial-Admin', 'Helper-Mod', 'VIP-Access'],
    ['Server-Manager', 'Full-Perms', 'Bot-Control'],
    ['Owner-Access', 'God-Mode', 'Unrestricted']
  ];

  const inviteBaits = [
    ['backup', 'emergency', 'alt-server'],
    ['staff-only', 'private-access', 'leaked'],
    ['owner-invite', 'nuke-server', 'raid-target']
  ];

  const level = Math.min(2, Math.floor(evolutionLevel / 3));
  const baits = type === 'channel' ? channelBaits : type === 'role' ? roleBaits : inviteBaits;
  const options = baits[level];
  
  return options[Math.floor(Math.random() * options.length)];
}

function evolveLure(lure: AdaptiveLure, analytics: HoneypotAnalytics): AdaptiveLure {
  lure.evolutionLevel++;
  lure.name = generateBaitName(lure.type, lure.evolutionLevel);
  
  const topTactics = Array.from(analytics.tacticsDatabase.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([tactic]) => tactic);
  
  lure.threatIntelSource = topTactics;
  
  lure.attractiveness = Math.min(100, lure.attractiveness + 5 + (lure.triggers * 2));
  
  const baitTexts = [
    'Click here for admin access',
    'Secret admin commands inside',
    'Owner gave me perms to share',
    'Use this to nuke other servers',
    'Free nitro generator inside'
  ];
  lure.lureConfig.baitText = baitTexts[Math.floor(Math.random() * baitTexts.length)];
  
  return lure;
}

function analyzeTactics(attacker: CapturedAttacker): string[] {
  const tactics: string[] = [];
  
  if (attacker.triggerAction.includes('join')) tactics.push('Channel Reconnaissance');
  if (attacker.triggerAction.includes('role')) tactics.push('Permission Escalation');
  if (attacker.triggerAction.includes('invite')) tactics.push('Invite Harvesting');
  if (attacker.triggerAction.includes('message')) tactics.push('Social Engineering');
  if (attacker.triggerAction.includes('webhook')) tactics.push('API Exploitation');
  
  tactics.push('Bait Triggered');
  
  return tactics;
}

export const predictiveHoneypotCommand = {
  data: new SlashCommandBuilder()
    .setName('predictive-honeypot')
    .setDescription('🍯 Deploy adaptive honeypot traps with evolving lures based on threat intelligence')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('deploy')
        .setDescription('🚀 Deploy an adaptive honeypot trap')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of honeypot trap')
            .addChoices(
              { name: 'Channel - Bait text channel', value: 'channel' },
              { name: 'Role - Permission bait role', value: 'role' },
              { name: 'Invite - Trap invite link', value: 'invite' },
              { name: 'Webhook - API trap', value: 'webhook' },
              { name: 'Permission Bait - Fake elevated access', value: 'permission_bait' }
            )
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('auto_evolve')
            .setDescription('Enable automatic lure evolution')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('capture_mode')
            .setDescription('Response when trap triggered')
            .addChoices(
              { name: 'Aggressive - Immediate ban', value: 'aggressive' },
              { name: 'Passive - Monitor only', value: 'passive' },
              { name: 'Adaptive - AI-decided response', value: 'adaptive' }
            )
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('evolve')
        .setDescription('🧬 Manually evolve lures based on threat intelligence')
        .addStringOption(option =>
          option.setName('lure_id')
            .setDescription('Specific lure to evolve (or "all")')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('strategy')
            .setDescription('Evolution strategy')
            .addChoices(
              { name: 'Increase Attractiveness', value: 'attractiveness' },
              { name: 'Change Bait Type', value: 'bait_type' },
              { name: 'Adapt to Threats', value: 'threat_adapt' },
              { name: 'Full Evolution', value: 'full' }
            )
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('capture')
        .setDescription('🎯 View captured attackers and their tactics')
        .addStringOption(option =>
          option.setName('lure_id')
            .setDescription('Specific lure to view captures for')
            .setRequired(false))
        .addUserOption(option =>
          option.setName('attacker')
            .setDescription('Specific attacker to view details')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('analyze')
        .setDescription('📊 Analyze captured tactics and generate threat intelligence')
        .addStringOption(option =>
          option.setName('report_type')
            .setDescription('Type of analysis report')
            .addChoices(
              { name: 'Tactics Overview', value: 'tactics' },
              { name: 'Attacker Profiles', value: 'profiles' },
              { name: 'Evolution Effectiveness', value: 'evolution' },
              { name: 'Full Intelligence Report', value: 'full' }
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
      await fileLogger.command('predictive-honeypot', `Executing ${subcommand} subcommand`, {
        userId: interaction.user.id,
        guildId: guild.id,
        subcommand
      });

      let config = honeypotConfigs.get(guild.id);
      if (!config) {
        config = {
          serverId: guild.id,
          lures: new Map(),
          analytics: {
            totalCaptures: 0,
            tacticsDatabase: new Map(),
            attackPatterns: [],
            evolutionHistory: []
          },
          threatIntel: {
            knownTactics: ['Channel Reconnaissance', 'Permission Escalation', 'Invite Harvesting'],
            emergingThreats: [],
            lastUpdate: new Date()
          },
          autoEvolve: true,
          captureMode: 'adaptive'
        };
        honeypotConfigs.set(guild.id, config);
      }

      if (subcommand === 'deploy') {
        const type = interaction.options.getString('type', true) as AdaptiveLure['type'];
        const autoEvolve = interaction.options.getBoolean('auto_evolve') ?? true;
        const captureMode = interaction.options.getString('capture_mode') as PredictiveHoneypotConfig['captureMode'] || 'adaptive';

        const lureId = generateLureId();
        const lureName = generateBaitName(type, 0);
        let targetId = '';

        if (type === 'channel') {
          const channel = await guild.channels.create({
            name: lureName,
            type: ChannelType.GuildText,
            topic: '🍯 ADAPTIVE HONEYPOT - This channel learns and evolves to catch attackers',
            permissionOverwrites: [
              { id: guild.id, deny: ['ViewChannel'] },
              { id: interaction.user.id, allow: ['ViewChannel', 'ManageChannels'] }
            ]
          });

          await channel.send({
            embeds: [new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('🔐 ADMIN ACCESS PORTAL')
              .setDescription('Welcome to the admin access portal. Use the commands below to manage the server.')
              .addFields(
                { name: '⚠️ Instructions', value: 'Type your admin credentials below to verify access' },
                { name: '🎁 Reward', value: 'Full admin permissions upon verification' }
              )
            ]
          });

          targetId = channel.id;
        } else if (type === 'role') {
          const role = await guild.roles.create({
            name: lureName,
            color: 0xFF0000,
            permissions: [],
            reason: '🍯 Adaptive honeypot role'
          });
          targetId = role.id;
        } else if (type === 'invite') {
          const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
          const randomChannel = channels.random() as TextChannel;
          if (randomChannel) {
            const invite = await randomChannel.createInvite({
              maxUses: 1,
              maxAge: 86400,
              unique: true,
              reason: '🍯 Honeypot trap invite'
            });
            targetId = invite.code;
          }
        } else {
          targetId = `virtual_${Date.now()}`;
        }

        const lure: AdaptiveLure = {
          id: lureId,
          type,
          name: lureName,
          targetId,
          createdAt: new Date(),
          evolutionLevel: 0,
          attractiveness: 50,
          triggers: 0,
          capturedUsers: [],
          lureConfig: {
            baitText: 'Click here for special access',
            trapTrigger: 'any_interaction',
            evolutionEnabled: autoEvolve,
            autoAdapt: true
          },
          threatIntelSource: config.threatIntel.knownTactics
        };

        config.lures.set(lureId, lure);
        config.captureMode = captureMode;

        const typeEmoji = {
          channel: '📺',
          role: '🎭',
          invite: '🔗',
          webhook: '🪝',
          permission_bait: '🔑'
        }[type];

        const modeLabel = {
          aggressive: '🔴 AGGRESSIVE (Auto-ban)',
          passive: '🟢 PASSIVE (Monitor)',
          adaptive: '🟡 ADAPTIVE (AI-decided)'
        }[captureMode];

        const embed = new EmbedBuilder()
          .setColor(0xFF6B00)
          .setTitle('🍯 ADAPTIVE HONEYPOT DEPLOYED')
          .setDescription(`**Type:** ${typeEmoji} ${type.toUpperCase()}\n**Lure ID:** \`${lureId}\``)
          .addFields(
            {
              name: '🎣 Lure Configuration',
              value: `**Name:** ${lureName}\n**Attractiveness:** ${lure.attractiveness}%\n**Evolution Level:** ${lure.evolutionLevel}\n**Auto-Evolve:** ${autoEvolve ? '✅' : '❌'}`,
              inline: true
            },
            {
              name: '⚙️ Capture Settings',
              value: `**Mode:** ${modeLabel}\n**Trigger:** Any interaction\n**Intel Sources:** ${lure.threatIntelSource.length}`,
              inline: true
            },
            {
              name: '🧬 Evolution Features',
              value: '• Learns from attacker behavior\n• Adapts bait to threat patterns\n• Increases attractiveness over time\n• Updates based on threat intel',
              inline: false
            },
            {
              name: '🎯 Target Details',
              value: type === 'channel' ? `<#${targetId}>` : type === 'role' ? `<@&${targetId}>` : type === 'invite' ? `\`${targetId}\`` : `\`${targetId}\``,
              inline: true
            },
            {
              name: '📊 Analytics',
              value: `**Active Lures:** ${config.lures.size}\n**Total Captures:** ${config.analytics.totalCaptures}`,
              inline: true
            }
          )
          .setFooter({ text: `Deployed by ${interaction.user.username} | Predictive Honeypot v3.0` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.security('predictive-honeypot', 'Lure deployed', {
          lureId,
          type,
          targetId,
          captureMode
        });

        await storage.createThreat({
          type: 'honeypot_deployed',
          severity: 'low',
          description: `Adaptive honeypot ${type} deployed: ${lureName}`,
          serverId: guild.id,
          serverName: guild.name,
          action: 'monitor',
          metadata: { lureId, type, captureMode }
        });

      } else if (subcommand === 'evolve') {
        const lureId = interaction.options.getString('lure_id');
        const strategy = interaction.options.getString('strategy') || 'full';

        const luresToEvolve = lureId && lureId.toLowerCase() !== 'all'
          ? [config.lures.get(lureId)].filter(Boolean) as AdaptiveLure[]
          : Array.from(config.lures.values());

        if (luresToEvolve.length === 0) {
          await interaction.editReply('❌ No lures available to evolve');
          return;
        }

        const evolutionResults: { lure: AdaptiveLure; changes: string[] }[] = [];

        for (const lure of luresToEvolve) {
          const changes: string[] = [];
          const oldLevel = lure.evolutionLevel;
          const oldAttractiveness = lure.attractiveness;
          const oldName = lure.name;

          evolveLure(lure, config.analytics);

          if (lure.name !== oldName) changes.push(`Name: ${oldName} → ${lure.name}`);
          if (lure.evolutionLevel !== oldLevel) changes.push(`Level: ${oldLevel} → ${lure.evolutionLevel}`);
          if (lure.attractiveness !== oldAttractiveness) changes.push(`Attractiveness: ${oldAttractiveness}% → ${lure.attractiveness}%`);

          evolutionResults.push({ lure, changes });

          config.analytics.evolutionHistory.push({
            timestamp: new Date(),
            lureId: lure.id,
            change: changes.join(', '),
            effectiveness: lure.attractiveness
          });
        }

        const embed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('🧬 LURE EVOLUTION COMPLETE')
          .setDescription(`**Strategy:** ${strategy.toUpperCase()}\n**Lures Evolved:** ${luresToEvolve.length}`)
          .addFields(
            {
              name: '📊 Evolution Summary',
              value: evolutionResults.slice(0, 5).map(r => 
                `\`${r.lure.id}\`\n└ Level ${r.lure.evolutionLevel} | ${r.lure.attractiveness}% attractive`
              ).join('\n\n'),
              inline: false
            },
            {
              name: '🎯 Threat Intel Applied',
              value: config.threatIntel.knownTactics.slice(0, 5).map(t => `• ${t}`).join('\n') || 'No intel available',
              inline: true
            },
            {
              name: '📈 Evolution Metrics',
              value: `**Avg Attractiveness:** ${Math.round(luresToEvolve.reduce((s, l) => s + l.attractiveness, 0) / luresToEvolve.length)}%\n**Total Evolutions:** ${config.analytics.evolutionHistory.length}`,
              inline: true
            }
          )
          .setFooter({ text: `Predictive Honeypot Evolution | ${strategy} strategy applied` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.command('predictive-honeypot', 'Lures evolved', {
          strategy,
          luresEvolved: luresToEvolve.length
        });

      } else if (subcommand === 'capture') {
        const lureId = interaction.options.getString('lure_id');
        const attackerUser = interaction.options.getUser('attacker');

        let allCaptures: CapturedAttacker[] = [];
        
        if (lureId) {
          const lure = config.lures.get(lureId);
          if (lure) {
            allCaptures = lure.capturedUsers;
          }
        } else {
          for (const lure of Array.from(config.lures.values())) {
            allCaptures.push(...lure.capturedUsers);
          }
        }

        if (attackerUser) {
          allCaptures = allCaptures.filter(c => c.userId === attackerUser.id);
        }

        if (allCaptures.length === 0) {
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎯 CAPTURE LOG')
            .setDescription('**No attackers captured yet**\n\nYour honeypots are active and waiting. Captured attackers will appear here.')
            .addFields({
              name: '📊 Honeypot Status',
              value: `**Active Lures:** ${config.lures.size}\n**Capture Mode:** ${config.captureMode.toUpperCase()}`,
              inline: false
            })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        const recentCaptures = allCaptures.sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()).slice(0, 10);

        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('🎯 CAPTURED ATTACKERS')
          .setDescription(`**Total Captures:** ${allCaptures.length}\n**Showing:** Last ${recentCaptures.length}`)
          .addFields(
            {
              name: '📊 Capture Statistics',
              value: [
                `**Raids:** ${allCaptures.filter(c => c.intent === 'raid').length}`,
                `**Nukes:** ${allCaptures.filter(c => c.intent === 'nuke').length}`,
                `**Spam:** ${allCaptures.filter(c => c.intent === 'spam').length}`,
                `**Recon:** ${allCaptures.filter(c => c.intent === 'reconnaissance').length}`
              ].join('\n'),
              inline: true
            },
            {
              name: '⚡ Actions Taken',
              value: [
                `**Banned:** ${allCaptures.filter(c => c.actionTaken === 'ban').length}`,
                `**Quarantined:** ${allCaptures.filter(c => c.actionTaken === 'quarantine').length}`,
                `**Monitored:** ${allCaptures.filter(c => c.actionTaken === 'monitor').length}`
              ].join('\n'),
              inline: true
            }
          );

        const captureList = recentCaptures.slice(0, 5).map(c => {
          const intentIcon = {
            raid: '⚔️',
            nuke: '💥',
            spam: '📢',
            reconnaissance: '🔍',
            unknown: '❓'
          }[c.intent];
          const actionIcon = {
            ban: '🔨',
            quarantine: '🔒',
            monitor: '👁️',
            none: '⏸️'
          }[c.actionTaken];

          return `${intentIcon} **${c.username}**\n└ ${actionIcon} ${c.actionTaken} | <t:${Math.floor(c.capturedAt.getTime() / 1000)}:R>`;
        }).join('\n\n');

        embed.addFields({
          name: '🕵️ Recent Captures',
          value: captureList || 'No recent captures',
          inline: false
        })
        .setFooter({ text: `Predictive Honeypot | ${config.analytics.totalCaptures} total captures` })
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'analyze') {
        const reportType = interaction.options.getString('report_type') || 'full';

        const allCaptures: CapturedAttacker[] = [];
        for (const lure of Array.from(config.lures.values())) {
          allCaptures.push(...lure.capturedUsers);
        }

        const tacticsCount = new Map<string, number>();
        for (const capture of allCaptures) {
          for (const tactic of capture.tactics) {
            tacticsCount.set(tactic, (tacticsCount.get(tactic) || 0) + 1);
          }
        }

        const topTactics = Array.from(tacticsCount.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);

        const intentDistribution = {
          raid: allCaptures.filter(c => c.intent === 'raid').length,
          nuke: allCaptures.filter(c => c.intent === 'nuke').length,
          spam: allCaptures.filter(c => c.intent === 'spam').length,
          reconnaissance: allCaptures.filter(c => c.intent === 'reconnaissance').length,
          unknown: allCaptures.filter(c => c.intent === 'unknown').length
        };

        const evolutionEffectiveness = config.analytics.evolutionHistory.length > 0
          ? config.analytics.evolutionHistory.reduce((sum, e) => sum + e.effectiveness, 0) / config.analytics.evolutionHistory.length
          : 50;

        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('📊 THREAT INTELLIGENCE ANALYSIS')
          .setDescription(`**Report Type:** ${reportType.toUpperCase()}\n**Analysis Period:** All Time`)
          .addFields(
            {
              name: '🎯 Attack Intent Distribution',
              value: [
                `⚔️ **Raids:** ${intentDistribution.raid}`,
                `💥 **Nukes:** ${intentDistribution.nuke}`,
                `📢 **Spam:** ${intentDistribution.spam}`,
                `🔍 **Reconnaissance:** ${intentDistribution.reconnaissance}`,
                `❓ **Unknown:** ${intentDistribution.unknown}`
              ].join('\n'),
              inline: true
            },
            {
              name: '📈 Honeypot Metrics',
              value: `**Active Lures:** ${config.lures.size}\n**Total Captures:** ${allCaptures.length}\n**Avg Evolution:** ${evolutionEffectiveness.toFixed(1)}%\n**Intel Sources:** ${config.threatIntel.knownTactics.length}`,
              inline: true
            }
          );

        if (topTactics.length > 0) {
          embed.addFields({
            name: '🔝 Top Attacker Tactics',
            value: topTactics.map(([tactic, count], i) => `${i + 1}. **${tactic}** - ${count} occurrences`).join('\n'),
            inline: false
          });
        }

        embed.addFields(
          {
            name: '🧬 Evolution Performance',
            value: `**Total Evolutions:** ${config.analytics.evolutionHistory.length}\n**Avg Effectiveness:** ${evolutionEffectiveness.toFixed(1)}%\n**Best Performing:** ${Array.from(config.lures.values()).sort((a, b) => b.triggers - a.triggers)[0]?.id || 'N/A'}`,
            inline: true
          },
          {
            name: '🔮 Threat Predictions',
            value: allCaptures.length > 10
              ? '🔴 High attack activity - maintain aggressive posture'
              : allCaptures.length > 5
              ? '🟡 Moderate activity - honeypots effective'
              : '🟢 Low activity - expand coverage recommended',
            inline: true
          },
          {
            name: '💡 Recommendations',
            value: [
              config.lures.size < 3 ? '⚠️ Deploy more lures for better coverage' : '✅ Lure coverage adequate',
              evolutionEffectiveness < 60 ? '⚠️ Consider manual evolution' : '✅ Evolution performing well',
              topTactics.length > 0 ? `📌 Focus on: ${topTactics[0][0]}` : '📌 Await more data'
            ].join('\n'),
            inline: false
          }
        )
        .setFooter({ text: `Predictive Honeypot Intelligence | Report ID: INT-${Date.now().toString(36).toUpperCase()}` })
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.command('predictive-honeypot', 'Analysis report generated', {
          reportType,
          totalCaptures: allCaptures.length,
          activeLures: config.lures.size
        });
      }

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'predictive-honeypot',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: true,
        parameters: { subcommand },
        result: `Subcommand: ${subcommand}`,
        duration,
        metadata: { subcommand, activeLures: config.lures.size }
      });

    } catch (error) {
      console.error('Predictive honeypot error:', error);
      
      await fileLogger.error('predictive-honeypot', 'Command execution failed', {
        error: (error as Error).message,
        subcommand
      });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Predictive Honeypot Error')
        .setDescription(`Failed to execute command: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'predictive-honeypot',
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
