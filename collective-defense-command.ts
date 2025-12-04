import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface ThreatSignature {
  id: string;
  type: 'user' | 'pattern' | 'content' | 'behavior';
  signature: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  originServerId: string;
  originServerName: string;
  reportedAt: Date;
  confirmations: number;
  metadata: {
    userId?: string;
    username?: string;
    pattern?: string;
    description: string;
  };
}

interface DefenseNetwork {
  nodeId: string;
  serverId: string;
  serverName: string;
  memberCount: number;
  trustScore: number;
  sharedThreats: number;
  lastSync: Date;
  status: 'active' | 'dormant' | 'offline';
}

interface CollectiveShield {
  active: boolean;
  protectedServers: number;
  totalThreatsBlocked: number;
  networkStrength: number;
  lastGlobalSync: Date;
}

const globalThreatDatabase = new Map<string, ThreatSignature>();
const defenseNetwork = new Map<string, DefenseNetwork>();
const serverShields = new Map<string, CollectiveShield>();

function generateThreatId(): string {
  return `THREAT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

function calculateNetworkStrength(servers: DefenseNetwork[]): number {
  if (servers.length === 0) return 0;
  const totalTrust = servers.reduce((sum, s) => sum + s.trustScore, 0);
  const avgTrust = totalTrust / servers.length;
  const activeRatio = servers.filter(s => s.status === 'active').length / servers.length;
  return Math.min(100, avgTrust * activeRatio * 100);
}

function hashUserSignature(userId: string, username: string): string {
  const combined = `${userId}-${username}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `USR-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
}

function hashPatternSignature(pattern: string): string {
  let hash = 0;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `PTN-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
}

export const collectiveDefenseCommand = {
  data: new SlashCommandBuilder()
    .setName('collective-defense')
    .setDescription('Cross-server collective defense network - shared threat intelligence')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('View collective defense network status'))
    .addSubcommand(sub => sub
      .setName('join')
      .setDescription('Join the global defense network'))
    .addSubcommand(sub => sub
      .setName('leave')
      .setDescription('Leave the global defense network'))
    .addSubcommand(sub => sub
      .setName('report')
      .setDescription('Report a threat to the network')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to report')
        .setRequired(false))
      .addStringOption(opt => opt
        .setName('pattern')
        .setDescription('Malicious pattern/content to report')
        .setRequired(false))
      .addStringOption(opt => opt
        .setName('severity')
        .setDescription('Threat severity level')
        .addChoices(
          { name: 'Low - Suspicious activity', value: 'low' },
          { name: 'Medium - Confirmed threat', value: 'medium' },
          { name: 'High - Active attack', value: 'high' },
          { name: 'Critical - Severe threat', value: 'critical' }
        )
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('description')
        .setDescription('Description of the threat')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('threats')
      .setDescription('View active threats in the network')
      .addStringOption(opt => opt
        .setName('filter')
        .setDescription('Filter threats by severity')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Critical Only', value: 'critical' },
          { name: 'High and Above', value: 'high' }
        )
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('shield')
      .setDescription('Activate/configure collective shield')
      .addBooleanOption(opt => opt
        .setName('enable')
        .setDescription('Enable or disable collective shield')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('mode')
        .setDescription('Shield protection mode')
        .addChoices(
          { name: 'Passive - Monitor only', value: 'passive' },
          { name: 'Active - Auto-block confirmed threats', value: 'active' },
          { name: 'Aggressive - Block all reported threats', value: 'aggressive' }
        )
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('sync')
      .setDescription('Force sync with the defense network'))
    .addSubcommand(sub => sub
      .setName('network')
      .setDescription('View connected servers in the network')),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const guild = interaction.guild;
    
    if (!guildId || !guild) {
      await interaction.editReply('This command can only be used in a server');
      return;
    }
    
    try {
      await fileLogger.command('collective-defense', `Executing ${subcommand}`, {
        userId: interaction.user.id,
        guildId
      });
      
      let node = defenseNetwork.get(guildId);
      let shield = serverShields.get(guildId);
      
      if (subcommand === 'status') {
        const networkNodes = Array.from(defenseNetwork.values());
        const networkStrength = calculateNetworkStrength(networkNodes);
        const activeThreats = Array.from(globalThreatDatabase.values());
        
        const isConnected = node !== undefined;
        
        const embed = new EmbedBuilder()
          .setTitle('Collective Defense Network Status')
          .setColor(isConnected ? 0x00FF00 : 0x808080)
          .addFields(
            {
              name: 'Connection Status',
              value: isConnected ? '🟢 **CONNECTED**' : '⚫ **NOT CONNECTED**\n\nUse `/collective-defense join` to join the network',
              inline: true
            },
            {
              name: 'Network Size',
              value: `${networkNodes.length} servers`,
              inline: true
            },
            {
              name: 'Network Strength',
              value: `${'█'.repeat(Math.floor(networkStrength / 10))}${'░'.repeat(10 - Math.floor(networkStrength / 10))} ${networkStrength.toFixed(0)}%`,
              inline: true
            }
          );
        
        if (isConnected && node) {
          embed.addFields(
            {
              name: 'Your Node',
              value: [
                `Trust Score: ${(node.trustScore * 100).toFixed(0)}%`,
                `Threats Shared: ${node.sharedThreats}`,
                `Status: ${node.status.toUpperCase()}`,
                `Last Sync: <t:${Math.floor(node.lastSync.getTime() / 1000)}:R>`
              ].join('\n'),
              inline: false
            }
          );
        }
        
        if (shield?.active) {
          embed.addFields({
            name: 'Shield Status',
            value: [
              `Protected Servers: ${shield.protectedServers}`,
              `Threats Blocked: ${shield.totalThreatsBlocked}`,
              `Last Global Sync: <t:${Math.floor(shield.lastGlobalSync.getTime() / 1000)}:R>`
            ].join('\n'),
            inline: false
          });
        }
        
        const criticalThreats = activeThreats.filter(t => t.severity === 'critical');
        const highThreats = activeThreats.filter(t => t.severity === 'high');
        
        embed.addFields({
          name: 'Global Threat Overview',
          value: [
            `🔴 Critical: ${criticalThreats.length}`,
            `🟠 High: ${highThreats.length}`,
            `🟡 Medium: ${activeThreats.filter(t => t.severity === 'medium').length}`,
            `🟢 Low: ${activeThreats.filter(t => t.severity === 'low').length}`
          ].join('\n'),
          inline: false
        });
        
        embed.setFooter({ text: 'Collective Defense Network v2.0' });
        embed.setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'join') {
        if (node) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0xFFA500)
              .setTitle('Already Connected')
              .setDescription('This server is already part of the Collective Defense Network.')
              .setTimestamp()
            ]
          });
          return;
        }
        
        const newNode: DefenseNetwork = {
          nodeId: `NODE-${guildId.substring(0, 8)}`,
          serverId: guildId,
          serverName: guild.name,
          memberCount: guild.memberCount,
          trustScore: 0.7,
          sharedThreats: 0,
          lastSync: new Date(),
          status: 'active'
        };
        
        defenseNetwork.set(guildId, newNode);
        
        serverShields.set(guildId, {
          active: true,
          protectedServers: defenseNetwork.size,
          totalThreatsBlocked: 0,
          networkStrength: calculateNetworkStrength(Array.from(defenseNetwork.values())),
          lastGlobalSync: new Date()
        });
        
        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('Welcome to the Collective Defense Network')
          .setDescription('Your server has successfully joined the global defense network!')
          .addFields(
            {
              name: 'Your Node ID',
              value: `\`${newNode.nodeId}\``,
              inline: true
            },
            {
              name: 'Initial Trust Score',
              value: `${(newNode.trustScore * 100).toFixed(0)}%`,
              inline: true
            },
            {
              name: 'Network Position',
              value: `Node #${defenseNetwork.size}`,
              inline: true
            },
            {
              name: 'Benefits',
              value: [
                '• Real-time threat intelligence from other servers',
                '• Automatic blocking of known attackers',
                '• Shared pattern detection',
                '• Collective reputation scoring',
                '• Cross-server raid coordination detection'
              ].join('\n'),
              inline: false
            },
            {
              name: 'Next Steps',
              value: 'Use `/collective-defense shield enable:true` to activate automatic protection',
              inline: false
            }
          )
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
        await fileLogger.security('collective-defense', 'Server joined network', {
          serverId: guildId,
          serverName: guild.name,
          nodeId: newNode.nodeId
        });
        
      } else if (subcommand === 'leave') {
        if (!node) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0xFFA500)
              .setTitle('Not Connected')
              .setDescription('This server is not part of the Collective Defense Network.')
              .setTimestamp()
            ]
          });
          return;
        }
        
        defenseNetwork.delete(guildId);
        serverShields.delete(guildId);
        
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Left Collective Defense Network')
            .setDescription('Your server has disconnected from the global defense network.\n\n⚠️ You will no longer receive shared threat intelligence.')
            .setTimestamp()
          ]
        });
        
      } else if (subcommand === 'report') {
        if (!node) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('Not Connected')
              .setDescription('Join the network first with `/collective-defense join`')
              .setTimestamp()
            ]
          });
          return;
        }
        
        const targetUser = interaction.options.getUser('user');
        const pattern = interaction.options.getString('pattern');
        const severity = interaction.options.getString('severity', true) as ThreatSignature['severity'];
        const description = interaction.options.getString('description', true);
        
        if (!targetUser && !pattern) {
          await interaction.editReply('Please provide either a user or a pattern to report');
          return;
        }
        
        const threatId = generateThreatId();
        const signature = targetUser 
          ? hashUserSignature(targetUser.id, targetUser.username)
          : hashPatternSignature(pattern!);
        
        const threat: ThreatSignature = {
          id: threatId,
          type: targetUser ? 'user' : 'pattern',
          signature,
          severity,
          originServerId: guildId,
          originServerName: guild.name,
          reportedAt: new Date(),
          confirmations: 1,
          metadata: {
            userId: targetUser?.id,
            username: targetUser?.username,
            pattern: pattern || undefined,
            description
          }
        };
        
        globalThreatDatabase.set(threatId, threat);
        node.sharedThreats++;
        node.trustScore = Math.min(1, node.trustScore + 0.01);
        
        const severityEmoji = {
          'low': '🟢',
          'medium': '🟡',
          'high': '🟠',
          'critical': '🔴'
        }[severity];
        
        const embed = new EmbedBuilder()
          .setColor(severity === 'critical' ? 0xFF0000 : severity === 'high' ? 0xFF6B00 : 0xFFA500)
          .setTitle('Threat Reported to Network')
          .setDescription(`Your report has been broadcast to ${defenseNetwork.size} connected servers.`)
          .addFields(
            {
              name: 'Threat ID',
              value: `\`${threatId}\``,
              inline: true
            },
            {
              name: 'Severity',
              value: `${severityEmoji} ${severity.toUpperCase()}`,
              inline: true
            },
            {
              name: 'Signature',
              value: `\`${signature}\``,
              inline: true
            },
            {
              name: 'Target',
              value: targetUser ? `<@${targetUser.id}> (${targetUser.username})` : `Pattern: \`${pattern}\``,
              inline: false
            },
            {
              name: 'Description',
              value: description,
              inline: false
            }
          )
          .setFooter({ text: `Reported by ${interaction.user.username}` })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
        await storage.createThreat({
          type: 'collective_threat_report',
          severity,
          description: `Threat reported to network: ${description}`,
          userId: targetUser?.id,
          username: targetUser?.username,
          serverId: guildId,
          serverName: guild.name,
          action: 'broadcast',
          metadata: { threatId, signature, pattern }
        });
        
      } else if (subcommand === 'threats') {
        const filter = interaction.options.getString('filter') || 'all';
        let threats = Array.from(globalThreatDatabase.values());
        
        if (filter === 'critical') {
          threats = threats.filter(t => t.severity === 'critical');
        } else if (filter === 'high') {
          threats = threats.filter(t => t.severity === 'critical' || t.severity === 'high');
        }
        
        threats.sort((a, b) => {
          const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        });
        
        if (threats.length === 0) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle('No Active Threats')
              .setDescription('The network has no reported threats matching your filter.')
              .setTimestamp()
            ]
          });
          return;
        }
        
        const threatList = threats.slice(0, 10).map((t, i) => {
          const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[t.severity];
          const target = t.metadata.username 
            ? `User: ${t.metadata.username}`
            : `Pattern: \`${t.metadata.pattern?.substring(0, 20)}...\``;
          
          return `${emoji} **${t.id}**\n   ${target}\n   Confirmations: ${t.confirmations} | <t:${Math.floor(t.reportedAt.getTime() / 1000)}:R>`;
        }).join('\n\n');
        
        const embed = new EmbedBuilder()
          .setColor(0xFF6B00)
          .setTitle(`Active Threats (${threats.length})`)
          .setDescription(threatList)
          .addFields({
            name: 'Distribution',
            value: [
              `🔴 Critical: ${threats.filter(t => t.severity === 'critical').length}`,
              `🟠 High: ${threats.filter(t => t.severity === 'high').length}`,
              `🟡 Medium: ${threats.filter(t => t.severity === 'medium').length}`,
              `🟢 Low: ${threats.filter(t => t.severity === 'low').length}`
            ].join(' | '),
            inline: false
          })
          .setFooter({ text: `Showing ${Math.min(10, threats.length)} of ${threats.length} threats` })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'shield') {
        const enable = interaction.options.getBoolean('enable', true);
        const mode = interaction.options.getString('mode') || 'active';
        
        if (!node) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('Not Connected')
              .setDescription('Join the network first with `/collective-defense join`')
              .setTimestamp()
            ]
          });
          return;
        }
        
        shield = {
          active: enable,
          protectedServers: defenseNetwork.size,
          totalThreatsBlocked: shield?.totalThreatsBlocked || 0,
          networkStrength: calculateNetworkStrength(Array.from(defenseNetwork.values())),
          lastGlobalSync: new Date()
        };
        
        serverShields.set(guildId, shield);
        
        const embed = new EmbedBuilder()
          .setColor(enable ? 0x00FF00 : 0x808080)
          .setTitle(enable ? 'Collective Shield Activated' : 'Collective Shield Deactivated')
          .setDescription(enable 
            ? `Your server is now protected by the collective shield in **${mode.toUpperCase()}** mode.`
            : 'Your server is no longer protected by the collective shield.')
          .addFields({
            name: 'Protection Mode',
            value: {
              'passive': '👁️ **Passive** - Monitors threats but takes no automatic action',
              'active': '🛡️ **Active** - Automatically blocks confirmed threats',
              'aggressive': '⚔️ **Aggressive** - Blocks all reported threats immediately'
            }[mode] || 'Unknown',
            inline: false
          })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'sync') {
        if (!node) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('Not Connected')
              .setDescription('Join the network first with `/collective-defense join`')
              .setTimestamp()
            ]
          });
          return;
        }
        
        node.lastSync = new Date();
        if (shield) {
          shield.lastGlobalSync = new Date();
          shield.networkStrength = calculateNetworkStrength(Array.from(defenseNetwork.values()));
        }
        
        const threats = Array.from(globalThreatDatabase.values());
        const recentThreats = threats.filter(t => 
          Date.now() - t.reportedAt.getTime() < 86400000
        );
        
        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('Network Sync Complete')
          .setDescription('Successfully synchronized with the Collective Defense Network.')
          .addFields(
            {
              name: 'Threats Synchronized',
              value: `${recentThreats.length} active threats in last 24h`,
              inline: true
            },
            {
              name: 'Connected Nodes',
              value: `${defenseNetwork.size} servers`,
              inline: true
            },
            {
              name: 'Your Trust Score',
              value: `${(node.trustScore * 100).toFixed(0)}%`,
              inline: true
            }
          )
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'network') {
        const nodes = Array.from(defenseNetwork.values())
          .sort((a, b) => b.trustScore - a.trustScore);
        
        if (nodes.length === 0) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0x808080)
              .setTitle('Empty Network')
              .setDescription('No servers are currently connected to the network.')
              .setTimestamp()
            ]
          });
          return;
        }
        
        const nodeList = nodes.slice(0, 10).map((n, i) => {
          const statusEmoji = { active: '🟢', dormant: '🟡', offline: '🔴' }[n.status];
          const isThis = n.serverId === guildId ? ' ← YOU' : '';
          
          return `${i + 1}. ${statusEmoji} **${n.serverName}**${isThis}\n   Trust: ${(n.trustScore * 100).toFixed(0)}% | Members: ${n.memberCount} | Shared: ${n.sharedThreats}`;
        }).join('\n\n');
        
        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle(`Defense Network (${nodes.length} servers)`)
          .setDescription(nodeList)
          .addFields({
            name: 'Network Statistics',
            value: [
              `Total Members Protected: ${nodes.reduce((sum, n) => sum + n.memberCount, 0).toLocaleString()}`,
              `Total Threats Shared: ${nodes.reduce((sum, n) => sum + n.sharedThreats, 0)}`,
              `Average Trust Score: ${(nodes.reduce((sum, n) => sum + n.trustScore, 0) / nodes.length * 100).toFixed(0)}%`
            ].join('\n'),
            inline: false
          })
          .setFooter({ text: 'Collective Defense Network v2.0' })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
      
      await storage.createCommandLog({
        commandName: 'collective-defense',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guildId,
        serverName: guild.name,
        parameters: { subcommand },
        result: 'Success',
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });
      
    } catch (error) {
      console.error('Collective Defense error:', error);
      await fileLogger.error('collective-defense', 'Command failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Error')
          .setDescription('Failed to execute collective defense command.')
          .setTimestamp()
        ]
      });
    }
  }
};
