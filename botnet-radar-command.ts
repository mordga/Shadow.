import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface BotnetNode {
  userId: string;
  username: string;
  serverId: string;
  serverName: string;
  joinTimestamp: number;
  createdTimestamp: number;
  connections: string[];
  suspicionScore: number;
  flags: string[];
}

interface BotnetCluster {
  id: string;
  nodes: BotnetNode[];
  centerNode: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  detectedAt: Date;
  confidence: number;
}

interface NetworkGraph {
  nodes: Map<string, BotnetNode>;
  edges: Map<string, Set<string>>;
  clusters: BotnetCluster[];
}

const BOTNET_CONFIG = {
  MIN_CLUSTER_SIZE: 3,
  JOIN_TIME_THRESHOLD_MS: 300000,
  ACCOUNT_AGE_THRESHOLD_DAYS: 7,
  SIMILARITY_THRESHOLD: 0.7,
  MAX_SCAN_DEPTH: 3,
  SUSPICIOUS_JOIN_RATE: 5,
  PATTERN_DETECTION_WINDOW: 3600000,
};

const networkCache = new Map<string, NetworkGraph>();

function generateClusterId(): string {
  return `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateSuspicionScore(node: BotnetNode, neighbors: BotnetNode[]): number {
  let score = 0;
  
  const accountAgeDays = (Date.now() - node.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < 1) score += 40;
  else if (accountAgeDays < 7) score += 25;
  else if (accountAgeDays < 30) score += 10;
  
  if (neighbors.length >= 5) {
    const joinTimes = neighbors.map(n => n.joinTimestamp).sort((a, b) => a - b);
    let coordinated = 0;
    for (let i = 1; i < joinTimes.length; i++) {
      if (joinTimes[i] - joinTimes[i - 1] < BOTNET_CONFIG.JOIN_TIME_THRESHOLD_MS) {
        coordinated++;
      }
    }
    if (coordinated >= 3) score += 30;
  }
  
  const similarNames = neighbors.filter(n => {
    const baseA = node.username.replace(/\d+$/, '').toLowerCase();
    const baseB = n.username.replace(/\d+$/, '').toLowerCase();
    return baseA === baseB || levenshteinSimilarity(baseA, baseB) > 0.8;
  });
  if (similarNames.length >= 2) score += 25;
  
  if (node.flags.includes('no_avatar')) score += 10;
  if (node.flags.includes('no_roles')) score += 5;
  if (node.flags.includes('default_pfp')) score += 10;
  
  return Math.min(100, score);
}

function levenshteinSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  
  return (longerLength - costs[s2.length]) / longerLength;
}

function detectClusters(graph: NetworkGraph): BotnetCluster[] {
  const clusters: BotnetCluster[] = [];
  const visited = new Set<string>();
  const nodes = Array.from(graph.nodes.values());
  
  for (const node of nodes) {
    if (visited.has(node.userId)) continue;
    if (node.suspicionScore < 30) continue;
    
    const cluster: BotnetNode[] = [];
    const queue = [node.userId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      
      visited.add(currentId);
      const currentNode = graph.nodes.get(currentId);
      if (!currentNode) continue;
      
      cluster.push(currentNode);
      
      const connections = graph.edges.get(currentId) || new Set();
      for (const connId of Array.from(connections)) {
        if (!visited.has(connId)) {
          const connNode = graph.nodes.get(connId);
          if (connNode && connNode.suspicionScore >= 20) {
            queue.push(connId);
          }
        }
      }
    }
    
    if (cluster.length >= BOTNET_CONFIG.MIN_CLUSTER_SIZE) {
      const avgScore = cluster.reduce((sum, n) => sum + n.suspicionScore, 0) / cluster.length;
      const threatLevel = avgScore >= 80 ? 'critical' : avgScore >= 60 ? 'high' : avgScore >= 40 ? 'medium' : 'low';
      const centerNode = cluster.reduce((max, n) => n.connections.length > max.connections.length ? n : max, cluster[0]);
      
      clusters.push({
        id: generateClusterId(),
        nodes: cluster,
        centerNode: centerNode.userId,
        threatLevel,
        pattern: detectPattern(cluster),
        detectedAt: new Date(),
        confidence: Math.min(95, avgScore + cluster.length * 2)
      });
    }
  }
  
  return clusters;
}

function detectPattern(cluster: BotnetNode[]): string {
  const patterns: string[] = [];
  
  const joinTimes = cluster.map(n => n.joinTimestamp).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < joinTimes.length; i++) {
    gaps.push(joinTimes[i] - joinTimes[i - 1]);
  }
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (avgGap < 60000) patterns.push('Rapid-Fire Join');
  else if (avgGap < 300000) patterns.push('Wave Pattern');
  
  const usernames = cluster.map(n => n.username.toLowerCase());
  const bases = usernames.map(u => u.replace(/\d+$/, ''));
  const uniqueBases = new Set(bases);
  if (uniqueBases.size < cluster.length * 0.5) patterns.push('Sequential Naming');
  
  const accountAges = cluster.map(n => (Date.now() - n.createdTimestamp) / (1000 * 60 * 60 * 24));
  const avgAge = accountAges.reduce((a, b) => a + b, 0) / accountAges.length;
  if (avgAge < 7) patterns.push('Fresh Accounts');
  
  const defaultFlags = cluster.filter(n => n.flags.includes('default_pfp') || n.flags.includes('no_avatar'));
  if (defaultFlags.length >= cluster.length * 0.7) patterns.push('Default Profiles');
  
  return patterns.length > 0 ? patterns.join(' + ') : 'Unknown Pattern';
}

function generateVisualization(cluster: BotnetCluster): string {
  const lines: string[] = ['```', '╔══════════════════════════════════════════════════════════════╗', '║          🕸️  BOTNET CLUSTER VISUALIZATION  🕸️                 ║', '╠══════════════════════════════════════════════════════════════╣'];
  
  const centerNode = cluster.nodes.find(n => n.userId === cluster.centerNode);
  lines.push(`║  Center Node: ${(centerNode?.username || 'Unknown').padEnd(44)} ║`);
  lines.push('║                                                              ║');
  
  lines.push('║  Network Structure:                                          ║');
  lines.push('║                            ┌───┐                             ║');
  lines.push(`║                            │ C │ ◄── Center (${cluster.nodes.length} connections)    ║`);
  lines.push('║                            └─┬─┘                             ║');
  
  const connCount = Math.min(5, cluster.nodes.length - 1);
  const branches: string[] = [];
  for (let i = 0; i < connCount; i++) {
    branches.push('│');
  }
  
  if (connCount > 0) {
    lines.push('║              ┌──────┬──────┼──────┬──────┐                  ║');
    lines.push('║              │      │      │      │      │                  ║');
    lines.push('║             [B]    [B]    [B]    [B]    [B] ◄── Bot Nodes   ║');
  }
  
  lines.push('║                                                              ║');
  lines.push(`║  Total Nodes: ${cluster.nodes.length.toString().padEnd(5)} | Threat: ${cluster.threatLevel.toUpperCase().padEnd(10)} | Confidence: ${cluster.confidence}%  ║`);
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('```');
  
  return lines.join('\n');
}

export const botnetRadarCommand = {
  data: new SlashCommandBuilder()
    .setName('botnet-radar')
    .setDescription('🕸️ Cross-server botnet detection with social graph analysis')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('scan')
        .setDescription('🔍 Scan for botnet activity and coordinated accounts')
        .addIntegerOption(option =>
          option.setName('depth')
            .setDescription('Scan depth (1-3, higher = more thorough)')
            .setMinValue(1)
            .setMaxValue(3)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('threshold')
            .setDescription('Suspicion threshold (0-100)')
            .setMinValue(0)
            .setMaxValue(100)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('network')
        .setDescription('🌐 View detected network connections and relationships')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Specific user to analyze network for')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('visualize')
        .setDescription('📊 Generate visual representation of detected clusters')
        .addStringOption(option =>
          option.setName('cluster_id')
            .setDescription('Specific cluster ID to visualize')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('report')
        .setDescription('📋 Generate comprehensive botnet detection report')
        .addBooleanOption(option =>
          option.setName('export')
            .setDescription('Export report as file')
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
      await fileLogger.command('botnet-radar', `Executing ${subcommand} subcommand`, {
        userId: interaction.user.id,
        guildId: guild.id,
        subcommand
      });

      if (subcommand === 'scan') {
        const depth = interaction.options.getInteger('depth') || 2;
        const threshold = interaction.options.getInteger('threshold') || 30;

        await guild.members.fetch();
        const members = Array.from(guild.members.cache.values()).filter(m => !m.user.bot);

        const graph: NetworkGraph = {
          nodes: new Map(),
          edges: new Map(),
          clusters: []
        };

        const recentThreats = await storage.getThreats(5000);
        const serverThreats = recentThreats.filter(t => t.serverId === guild.id);
        const threatUserIds = new Set(serverThreats.map(t => t.userId).filter(Boolean));

        for (const member of members) {
          const flags: string[] = [];
          if (!member.user.avatar) flags.push('no_avatar', 'default_pfp');
          if (member.roles.cache.size <= 1) flags.push('no_roles');
          
          const node: BotnetNode = {
            userId: member.id,
            username: member.user.username,
            serverId: guild.id,
            serverName: guild.name,
            joinTimestamp: member.joinedTimestamp || Date.now(),
            createdTimestamp: member.user.createdTimestamp,
            connections: [],
            suspicionScore: 0,
            flags
          };

          if (threatUserIds.has(member.id)) {
            node.flags.push('threat_history');
            node.suspicionScore += 15;
          }

          graph.nodes.set(member.id, node);
        }

        const memberArray = Array.from(graph.nodes.values());
        for (let i = 0; i < memberArray.length; i++) {
          for (let j = i + 1; j < memberArray.length; j++) {
            const nodeA = memberArray[i];
            const nodeB = memberArray[j];

            let connected = false;
            
            if (Math.abs(nodeA.joinTimestamp - nodeB.joinTimestamp) < BOTNET_CONFIG.JOIN_TIME_THRESHOLD_MS) {
              connected = true;
            }

            if (Math.abs(nodeA.createdTimestamp - nodeB.createdTimestamp) < 86400000) {
              connected = true;
            }

            const similarity = levenshteinSimilarity(
              nodeA.username.replace(/\d+$/, '').toLowerCase(),
              nodeB.username.replace(/\d+$/, '').toLowerCase()
            );
            if (similarity > BOTNET_CONFIG.SIMILARITY_THRESHOLD) {
              connected = true;
            }

            if (connected) {
              nodeA.connections.push(nodeB.userId);
              nodeB.connections.push(nodeA.userId);
              
              if (!graph.edges.has(nodeA.userId)) graph.edges.set(nodeA.userId, new Set());
              if (!graph.edges.has(nodeB.userId)) graph.edges.set(nodeB.userId, new Set());
              graph.edges.get(nodeA.userId)!.add(nodeB.userId);
              graph.edges.get(nodeB.userId)!.add(nodeA.userId);
            }
          }
        }

        for (const node of Array.from(graph.nodes.values())) {
          const neighbors = node.connections.map((id: string) => graph.nodes.get(id)!).filter(Boolean);
          node.suspicionScore = calculateSuspicionScore(node, neighbors);
        }

        const clusters = detectClusters(graph);
        graph.clusters = clusters;
        networkCache.set(guild.id, graph);

        const suspiciousNodes = Array.from(graph.nodes.values()).filter(n => n.suspicionScore >= threshold);
        const criticalClusters = clusters.filter(c => c.threatLevel === 'critical');
        const highClusters = clusters.filter(c => c.threatLevel === 'high');

        const threatStatus = criticalClusters.length > 0 ? '🔴 CRITICAL' :
                            highClusters.length > 0 ? '🟠 HIGH' :
                            clusters.length > 0 ? '🟡 MODERATE' : '🟢 CLEAR';

        const embed = new EmbedBuilder()
          .setColor(criticalClusters.length > 0 ? 0xFF0000 : highClusters.length > 0 ? 0xFF6600 : clusters.length > 0 ? 0xFFAA00 : 0x00FF00)
          .setTitle('🕸️ BOTNET RADAR SCAN COMPLETE')
          .setDescription(`**Threat Status:** ${threatStatus}\n**Scan Depth:** ${depth} | **Threshold:** ${threshold}`)
          .addFields(
            {
              name: '📊 SCAN METRICS',
              value: `**Members Scanned:** ${members.length}\n**Connections Mapped:** ${Array.from(graph.edges.values()).reduce((sum, set) => sum + set.size, 0) / 2}\n**Suspicious Nodes:** ${suspiciousNodes.length}\n**Clusters Detected:** ${clusters.length}`,
              inline: true
            },
            {
              name: '🎯 THREAT BREAKDOWN',
              value: `**Critical Clusters:** ${criticalClusters.length}\n**High Risk Clusters:** ${highClusters.length}\n**Medium Risk:** ${clusters.filter(c => c.threatLevel === 'medium').length}\n**Low Risk:** ${clusters.filter(c => c.threatLevel === 'low').length}`,
              inline: true
            }
          );

        if (clusters.length > 0) {
          const topClusters = clusters
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 3)
            .map((c, i) => `**${i + 1}.** ${c.pattern}\n   └ ${c.nodes.length} nodes | ${c.threatLevel.toUpperCase()} | ${c.confidence}% confidence`)
            .join('\n\n');

          embed.addFields({
            name: '🕸️ TOP DETECTED CLUSTERS',
            value: topClusters,
            inline: false
          });
        }

        if (suspiciousNodes.length > 0) {
          const topSuspicious = suspiciousNodes
            .sort((a, b) => b.suspicionScore - a.suspicionScore)
            .slice(0, 5)
            .map(n => `<@${n.userId}> - Score: ${n.suspicionScore}% | ${n.flags.join(', ') || 'No flags'}`)
            .join('\n');

          embed.addFields({
            name: '⚠️ HIGH SUSPICION ACCOUNTS',
            value: topSuspicious.substring(0, 1024),
            inline: false
          });
        }

        embed.addFields({
          name: '💡 RECOMMENDATIONS',
          value: criticalClusters.length > 0 
            ? '🚨 **IMMEDIATE ACTION REQUIRED**\n• Consider mass-banning detected cluster\n• Enable raid protection\n• Review recent joins'
            : clusters.length > 0
            ? '⚠️ **MONITOR CLOSELY**\n• Watch detected clusters for activity\n• Consider quarantine for high-score users\n• Enable enhanced logging'
            : '✅ **ALL CLEAR**\n• No significant botnet activity detected\n• Continue routine monitoring',
          inline: false
        });

        embed.setFooter({ text: `Botnet Radar v2.0 | Scan completed in ${Date.now() - startTime}ms` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.security('botnet-radar', 'Scan completed', {
          clustersFound: clusters.length,
          suspiciousNodes: suspiciousNodes.length,
          criticalClusters: criticalClusters.length
        });

      } else if (subcommand === 'network') {
        const targetUser = interaction.options.getUser('user');
        const graph = networkCache.get(guild.id);

        if (!graph || graph.nodes.size === 0) {
          await interaction.editReply('⚠️ No network data available. Run `/botnet-radar scan` first.');
          return;
        }

        if (targetUser) {
          const node = graph.nodes.get(targetUser.id);
          if (!node) {
            await interaction.editReply(`❌ User <@${targetUser.id}> not found in network graph`);
            return;
          }

          const connections = node.connections.map(id => graph.nodes.get(id)).filter(Boolean) as BotnetNode[];

          const embed = new EmbedBuilder()
            .setColor(node.suspicionScore >= 70 ? 0xFF0000 : node.suspicionScore >= 40 ? 0xFFAA00 : 0x00FF00)
            .setTitle(`🌐 NETWORK ANALYSIS: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
              {
                name: '🎯 NODE METRICS',
                value: `**Suspicion Score:** ${node.suspicionScore}%\n**Connections:** ${connections.length}\n**Flags:** ${node.flags.join(', ') || 'None'}\n**Account Age:** ${Math.floor((Date.now() - node.createdTimestamp) / 86400000)} days`,
                inline: true
              },
              {
                name: '📊 CONNECTION ANALYSIS',
                value: `**Direct Links:** ${connections.length}\n**High Risk Links:** ${connections.filter(c => c.suspicionScore >= 60).length}\n**Similar Names:** ${connections.filter(c => levenshteinSimilarity(c.username, node.username) > 0.5).length}`,
                inline: true
              }
            );

          if (connections.length > 0) {
            const connectionList = connections
              .sort((a, b) => b.suspicionScore - a.suspicionScore)
              .slice(0, 10)
              .map(c => `<@${c.userId}> (${c.suspicionScore}%)`)
              .join('\n');

            embed.addFields({
              name: '🔗 CONNECTED NODES',
              value: connectionList,
              inline: false
            });
          }

          embed.setTimestamp();
          await interaction.editReply({ embeds: [embed] });

        } else {
          const totalNodes = graph.nodes.size;
          const totalEdges = Array.from(graph.edges.values()).reduce((sum, set) => sum + set.size, 0) / 2;
          const avgConnections = totalEdges * 2 / totalNodes;
          const highRiskNodes = Array.from(graph.nodes.values()).filter(n => n.suspicionScore >= 60);

          const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('🌐 NETWORK OVERVIEW')
            .setDescription(`**Server:** ${guild.name}\n**Last Scan:** <t:${Math.floor(Date.now() / 1000)}:R>`)
            .addFields(
              {
                name: '📊 GRAPH STATISTICS',
                value: `**Total Nodes:** ${totalNodes}\n**Total Edges:** ${Math.round(totalEdges)}\n**Avg Connections:** ${avgConnections.toFixed(2)}\n**Graph Density:** ${((2 * totalEdges) / (totalNodes * (totalNodes - 1)) * 100).toFixed(2)}%`,
                inline: true
              },
              {
                name: '⚠️ RISK ASSESSMENT',
                value: `**High Risk Nodes:** ${highRiskNodes.length}\n**Active Clusters:** ${graph.clusters.length}\n**Critical Clusters:** ${graph.clusters.filter(c => c.threatLevel === 'critical').length}`,
                inline: true
              }
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        }

      } else if (subcommand === 'visualize') {
        const clusterId = interaction.options.getString('cluster_id');
        const graph = networkCache.get(guild.id);

        if (!graph || graph.clusters.length === 0) {
          await interaction.editReply('⚠️ No clusters to visualize. Run `/botnet-radar scan` first.');
          return;
        }

        let cluster: BotnetCluster | undefined;
        if (clusterId) {
          cluster = graph.clusters.find(c => c.id === clusterId);
          if (!cluster) {
            await interaction.editReply(`❌ Cluster \`${clusterId}\` not found`);
            return;
          }
        } else {
          cluster = graph.clusters.sort((a, b) => b.confidence - a.confidence)[0];
        }

        const visualization = generateVisualization(cluster);

        const embed = new EmbedBuilder()
          .setColor(cluster.threatLevel === 'critical' ? 0xFF0000 : cluster.threatLevel === 'high' ? 0xFF6600 : 0xFFAA00)
          .setTitle(`📊 CLUSTER VISUALIZATION: ${cluster.id}`)
          .setDescription(`**Pattern:** ${cluster.pattern}\n**Threat Level:** ${cluster.threatLevel.toUpperCase()}\n**Confidence:** ${cluster.confidence}%`)
          .addFields(
            {
              name: '🗺️ NETWORK MAP',
              value: visualization,
              inline: false
            },
            {
              name: '👥 CLUSTER MEMBERS',
              value: cluster.nodes.slice(0, 10).map(n => `• ${n.username} (${n.suspicionScore}%)`).join('\n') + (cluster.nodes.length > 10 ? `\n... and ${cluster.nodes.length - 10} more` : ''),
              inline: true
            },
            {
              name: '📈 CLUSTER STATS',
              value: `**Size:** ${cluster.nodes.length} nodes\n**Detected:** <t:${Math.floor(cluster.detectedAt.getTime() / 1000)}:R>\n**Avg Score:** ${Math.round(cluster.nodes.reduce((s, n) => s + n.suspicionScore, 0) / cluster.nodes.length)}%`,
              inline: true
            }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'report') {
        const shouldExport = interaction.options.getBoolean('export') || false;
        const graph = networkCache.get(guild.id);

        if (!graph) {
          await interaction.editReply('⚠️ No scan data available. Run `/botnet-radar scan` first.');
          return;
        }

        const highRiskNodes = Array.from(graph.nodes.values()).filter(n => n.suspicionScore >= 60);
        const criticalClusters = graph.clusters.filter(c => c.threatLevel === 'critical');

        const embed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('📋 BOTNET DETECTION REPORT')
          .setDescription(`**Server:** ${guild.name}\n**Generated:** <t:${Math.floor(Date.now() / 1000)}:F>`)
          .addFields(
            {
              name: '📊 EXECUTIVE SUMMARY',
              value: `**Threat Level:** ${criticalClusters.length > 0 ? '🔴 CRITICAL' : highRiskNodes.length > 5 ? '🟠 HIGH' : '🟢 LOW'}\n**Networks Detected:** ${graph.clusters.length}\n**High Risk Accounts:** ${highRiskNodes.length}\n**Total Connections Mapped:** ${Array.from(graph.edges.values()).reduce((s, e) => s + e.size, 0) / 2}`,
              inline: false
            },
            {
              name: '🕸️ CLUSTER ANALYSIS',
              value: graph.clusters.length > 0 
                ? graph.clusters.slice(0, 5).map(c => `• **${c.id.substring(0, 15)}...** - ${c.nodes.length} nodes (${c.threatLevel})`).join('\n')
                : 'No clusters detected',
              inline: true
            },
            {
              name: '⚠️ HIGH PRIORITY TARGETS',
              value: highRiskNodes.length > 0
                ? highRiskNodes.slice(0, 5).map(n => `• <@${n.userId}> - ${n.suspicionScore}%`).join('\n')
                : 'No high priority targets',
              inline: true
            },
            {
              name: '💡 RECOMMENDED ACTIONS',
              value: criticalClusters.length > 0
                ? '1. 🚨 Immediately ban critical cluster members\n2. 🔒 Enable lockdown mode\n3. 📝 Document evidence for appeals\n4. 🛡️ Increase verification requirements'
                : highRiskNodes.length > 0
                ? '1. ⚠️ Monitor flagged accounts\n2. 🔍 Review recent activity\n3. 📊 Schedule follow-up scan\n4. 🎯 Consider quarantine'
                : '1. ✅ Continue routine monitoring\n2. 📅 Schedule periodic scans\n3. 🔄 Keep detection rules updated',
              inline: false
            }
          )
          .setFooter({ text: `Botnet Radar Intelligence Report | ${Date.now() - startTime}ms` })
          .setTimestamp();

        const replyData: { embeds: EmbedBuilder[]; files?: AttachmentBuilder[] } = { embeds: [embed] };

        if (shouldExport) {
          const reportContent = [
            '═══════════════════════════════════════════════════════════════',
            '              BOTNET RADAR DETECTION REPORT',
            '═══════════════════════════════════════════════════════════════',
            '',
            `Server: ${guild.name} (${guild.id})`,
            `Generated: ${new Date().toISOString()}`,
            `Analyst: ${interaction.user.tag}`,
            '',
            '─── EXECUTIVE SUMMARY ───',
            `Threat Level: ${criticalClusters.length > 0 ? 'CRITICAL' : highRiskNodes.length > 5 ? 'HIGH' : 'LOW'}`,
            `Networks Detected: ${graph.clusters.length}`,
            `High Risk Accounts: ${highRiskNodes.length}`,
            `Total Nodes Analyzed: ${graph.nodes.size}`,
            '',
            '─── CLUSTER DETAILS ───',
            ...graph.clusters.map(c => [
              `Cluster ID: ${c.id}`,
              `  Pattern: ${c.pattern}`,
              `  Threat Level: ${c.threatLevel}`,
              `  Confidence: ${c.confidence}%`,
              `  Members: ${c.nodes.length}`,
              `  Center Node: ${c.centerNode}`,
              ''
            ].join('\n')),
            '',
            '─── HIGH RISK ACCOUNTS ───',
            ...highRiskNodes.map(n => `${n.username} (${n.userId}) - Score: ${n.suspicionScore}% - Flags: ${n.flags.join(', ')}`),
            '',
            '═══════════════════════════════════════════════════════════════',
            '                      END OF REPORT',
            '═══════════════════════════════════════════════════════════════'
          ].join('\n');

          const buffer = Buffer.from(reportContent, 'utf-8');
          const attachment = new AttachmentBuilder(buffer, {
            name: `botnet_report_${guild.id}_${Date.now()}.txt`
          });
          replyData.files = [attachment];
        }

        await interaction.editReply(replyData);
      }

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'botnet-radar',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Subcommand ${subcommand} executed successfully`,
        success: true,
        duration,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Botnet Radar error:', error);
      await fileLogger.error('botnet-radar', 'Command execution failed', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id
      });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Botnet Radar Error')
        .setDescription(`Failed to execute command: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'botnet-radar',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Error: ${(error as Error).message}`,
        success: false,
        duration,
        metadata: { error: (error as Error).message }
      });
    }
  }
};
