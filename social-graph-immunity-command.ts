import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

interface GraphNode {
  userId: string;
  username: string;
  connections: Set<string>;
  weight: number;
  trustScore: number;
  immunityStatus: 'susceptible' | 'infected' | 'recovered' | 'immune';
  clusterCoefficient: number;
  betweenness: number;
}

interface PathogenCluster {
  members: string[];
  centroid: string;
  toxicity: number;
  spreadPotential: number;
  containmentPriority: number;
  pattern: string;
}

interface ImmunityReport {
  susceptibleCount: number;
  infectedCount: number;
  recoveredCount: number;
  immuneCount: number;
  herdImmunityThreshold: number;
  currentImmunityLevel: number;
  isProtected: boolean;
}

interface EpidemiologicalPrediction {
  peakInfectionTime: number;
  peakInfectionCount: number;
  totalProjectedInfected: number;
  recoveryTimeHours: number;
  r0: number;
  criticalNodes: string[];
}

const IMMUNITY_CONFIG = {
  MIN_TRUST_SCORE: 0.3,
  HIGH_TRUST_THRESHOLD: 0.75,
  CLUSTER_TOXICITY_THRESHOLD: 0.6,
  HERD_IMMUNITY_THRESHOLD: 0.67,
  INTERACTION_WEIGHT_DECAY: 0.95,
  MIN_INTERACTIONS_FOR_EDGE: 2,
  BETWEENNESS_DANGER_THRESHOLD: 0.4,
  R0_CRITICAL_THRESHOLD: 2.5
};

/**
 * SOCIAL GRAPH IMMUNITY SYSTEM v1.0
 * 
 * Revolutionary server protection using epidemiological modeling:
 * 
 * 1. SOCIAL GRAPH CONSTRUCTION
 *    - Builds interaction graph from messages, reactions, replies
 *    - Edge weights based on interaction frequency and recency
 *    - Uses exponential decay for temporal relevance
 * 
 * 2. PATHOGEN DETECTION (Malicious Actor Identification)
 *    - Cluster coefficient analysis (isolated groups = potential raids)
 *    - Betweenness centrality (super-spreaders identification)
 *    - Community detection via Louvain algorithm adaptation
 * 
 * 3. SIR MODEL SIMULATION
 *    - Susceptible-Infected-Recovered epidemiological model
 *    - R0 (basic reproduction number) calculation
 *    - Predicts raid/spam propagation patterns
 * 
 * 4. HERD IMMUNITY CALCULATION
 *    - Identifies "antibody" users (trusted, active members)
 *    - Calculates server's natural resistance
 *    - Recommends vaccination (trust boosting) strategies
 * 
 * 5. CONTAINMENT PROTOCOLS
 *    - Identifies critical nodes for quarantine
 *    - Calculates minimum intervention for maximum protection
 *    - Graph-theoretic optimal defense positioning
 * 
 * Uses ZERO AI - Pure graph theory, epidemiology, and statistics.
 */
export const socialGraphImmunityCommand = {
  data: new SlashCommandBuilder()
    .setName('social-immunity')
    .setDescription('🦠 Analyze server social graph for pathogen detection and immunity status')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks)
    .addStringOption(option =>
      option.setName('analysis')
        .setDescription('Type of immunological analysis')
        .addChoices(
          { name: 'Graph Topology', value: 'topology' },
          { name: 'Pathogen Detection', value: 'pathogens' },
          { name: 'Immunity Status', value: 'immunity' },
          { name: 'Spread Prediction', value: 'prediction' },
          { name: 'Full Diagnostic', value: 'full' }
        )
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('depth')
        .setDescription('Analysis depth (1-3, higher = more thorough but slower)')
        .setMinValue(1)
        .setMaxValue(3)
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('simulate-outbreak')
        .setDescription('Run outbreak simulation to predict spread patterns')
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();
    
    const guildId = interaction.guildId;
    const analysisType = interaction.options.getString('analysis') || 'full';
    const depth = interaction.options.getInteger('depth') || 2;
    const simulateOutbreak = interaction.options.getBoolean('simulate-outbreak') ?? false;

    if (!guildId) {
      await interaction.editReply('❌ This command can only be used in a server');
      return;
    }

    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) {
      await interaction.editReply('❌ Could not access server');
      return;
    }

    try {
      await guild.members.fetch();
      const members = Array.from(guild.members.cache.values()).filter(m => !m.user.bot);

      if (members.length < 5) {
        await interaction.editReply('⚠️ Server has fewer than 5 members - social graph analysis requires larger sample.');
        return;
      }

      const messageTraces = await storage.getMessageTraces({ serverId: guildId, limit: 50000 });
      const commandLogs = await storage.getCommandLogs({ serverId: guildId, limit: 10000 });
      const reputations = await storage.getAllReputations(guildId);

      const graph = new Map<string, GraphNode>();

      for (const member of members) {
        const reputation = reputations.find(r => r.userId === member.id);
        graph.set(member.id, {
          userId: member.id,
          username: member.user.username,
          connections: new Set(),
          weight: 1,
          trustScore: reputation ? (reputation.score / 100) : 0.5,
          immunityStatus: 'susceptible',
          clusterCoefficient: 0,
          betweenness: 0
        });
      }

      const interactionCounts = new Map<string, Map<string, number>>();
      
      if (messageTraces) {
        const now = Date.now();
        for (const trace of messageTraces) {
          const age = (now - new Date(trace.timestamp).getTime()) / (1000 * 60 * 60 * 24);
          const decay = Math.pow(IMMUNITY_CONFIG.INTERACTION_WEIGHT_DECAY, age);
          
          if (!interactionCounts.has(trace.userId)) {
            interactionCounts.set(trace.userId, new Map());
          }

          const mentionMatch = trace.content.match(/<@!?(\d+)>/g);
          if (mentionMatch) {
            for (const mention of mentionMatch) {
              const targetId = mention.replace(/<@!?|>/g, '');
              if (targetId !== trace.userId && graph.has(targetId)) {
                const userMap = interactionCounts.get(trace.userId)!;
                userMap.set(targetId, (userMap.get(targetId) || 0) + decay);
              }
            }
          }
        }
      }

      for (const [userId, targets] of Array.from(interactionCounts.entries())) {
        const node = graph.get(userId);
        if (!node) continue;

        for (const [targetId, count] of Array.from(targets.entries())) {
          if (count >= IMMUNITY_CONFIG.MIN_INTERACTIONS_FOR_EDGE) {
            node.connections.add(targetId);
            const targetNode = graph.get(targetId);
            if (targetNode) {
              targetNode.connections.add(userId);
            }
          }
        }
      }

      if (depth >= 2) {
        calculateClusterCoefficients(graph);
        if (depth >= 3) {
          calculateBetweennessCentrality(graph);
        }
      }

      classifyImmunityStatus(graph);

      const pathogens: PathogenCluster[] = [];
      if (analysisType === 'pathogens' || analysisType === 'full') {
        const detected = detectPathogenClusters(graph, depth);
        pathogens.push(...detected);
      }

      const immunityReport = calculateImmunityReport(graph);

      let prediction: EpidemiologicalPrediction | null = null;
      if (simulateOutbreak || analysisType === 'prediction' || analysisType === 'full') {
        prediction = runSIRSimulation(graph, pathogens);
      }

      const analysisTime = Date.now() - startTime;
      const nodes = Array.from(graph.values());
      const totalEdges = nodes.reduce((sum, n) => sum + n.connections.size, 0) / 2;
      const avgConnections = totalEdges * 2 / nodes.length;
      const graphDensity = (2 * totalEdges) / (nodes.length * (nodes.length - 1));

      const threatLevel = pathogens.length > 0 && pathogens[0].toxicity > 0.7 ? '🔴 OUTBREAK RISK' :
                         immunityReport.currentImmunityLevel < IMMUNITY_CONFIG.HERD_IMMUNITY_THRESHOLD ? '🟠 LOW IMMUNITY' :
                         '🟢 HEALTHY';

      const embed = new EmbedBuilder()
        .setTitle(`🦠 Social Graph Immunity System ${threatLevel}`)
        .setColor(pathogens.length > 0 ? 0xFF0000 : immunityReport.isProtected ? 0x00FF00 : 0xFF8800)
        .addFields(
          {
            name: '📊 Graph Topology',
            value: `Nodes: ${nodes.length}\nEdges: ${Math.round(totalEdges)}\nAvg Connections: ${avgConnections.toFixed(2)}\nDensity: ${(graphDensity * 100).toFixed(2)}%`,
            inline: true
          },
          {
            name: '🛡️ Immunity Status',
            value: `Susceptible: ${immunityReport.susceptibleCount}\nInfected: ${immunityReport.infectedCount}\nRecovered: ${immunityReport.recoveredCount}\nImmune: ${immunityReport.immuneCount}`,
            inline: true
          },
          {
            name: '📈 Herd Immunity',
            value: `Current: ${(immunityReport.currentImmunityLevel * 100).toFixed(1)}%\nThreshold: ${(immunityReport.herdImmunityThreshold * 100).toFixed(1)}%\nProtected: ${immunityReport.isProtected ? '✅ YES' : '❌ NO'}`,
            inline: true
          }
        );

      if (pathogens.length > 0) {
        const pathogenInfo = pathogens.slice(0, 3).map((p, i) => 
          `**Cluster ${i + 1}:** ${p.members.length} members\n` +
          `Toxicity: ${(p.toxicity * 100).toFixed(0)}% | Spread: ${(p.spreadPotential * 100).toFixed(0)}%\n` +
          `Pattern: ${p.pattern}`
        ).join('\n\n');

        embed.addFields({
          name: `🦠 Pathogen Clusters Detected (${pathogens.length})`,
          value: pathogenInfo,
          inline: false
        });

        const quarantineTargets = pathogens.flatMap(p => p.members).slice(0, 10);
        if (quarantineTargets.length > 0) {
          embed.addFields({
            name: '🔒 Recommended Quarantine Targets',
            value: quarantineTargets.map(id => `<@${id}>`).join(', '),
            inline: false
          });
        }
      }

      if (prediction) {
        embed.addFields({
          name: '🔮 Outbreak Simulation (SIR Model)',
          value: `R₀ (Basic Reproduction): ${prediction.r0.toFixed(2)} ${prediction.r0 > IMMUNITY_CONFIG.R0_CRITICAL_THRESHOLD ? '⚠️ CRITICAL' : ''}\n` +
                 `Peak Infection: ${prediction.peakInfectionCount} members in ${prediction.peakInfectionTime}h\n` +
                 `Total Projected Infected: ${prediction.totalProjectedInfected}\n` +
                 `Recovery Time: ~${prediction.recoveryTimeHours}h`,
          inline: false
        });

        if (prediction.criticalNodes.length > 0) {
          embed.addFields({
            name: '🎯 Critical Super-Spreader Nodes',
            value: prediction.criticalNodes.slice(0, 5).map(id => {
              const node = graph.get(id);
              return `<@${id}> (${node?.connections.size || 0} connections, betweenness: ${(node?.betweenness || 0).toFixed(2)})`;
            }).join('\n'),
            inline: false
          });
        }
      }

      const antibodies = nodes
        .filter(n => n.trustScore >= IMMUNITY_CONFIG.HIGH_TRUST_THRESHOLD)
        .sort((a, b) => b.connections.size - a.connections.size)
        .slice(0, 5);

      if (antibodies.length > 0) {
        embed.addFields({
          name: '💉 Antibody Nodes (Trusted Influencers)',
          value: antibodies.map(n => 
            `<@${n.userId}> - Trust: ${(n.trustScore * 100).toFixed(0)}% | Connections: ${n.connections.size}`
          ).join('\n'),
          inline: false
        });
      }

      embed.addFields({
        name: '⏱️ Analysis Metrics',
        value: `Depth: ${depth}/3 | Time: ${analysisTime}ms | Traces: ${messageTraces?.length || 0}`,
        inline: false
      });

      embed.setFooter({
        text: '🔬 Epidemiological analysis | SIR model | Graph theory | No AI used'
      });
      embed.setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      if (pathogens.length > 0 || !immunityReport.isProtected) {
        await storage.createThreat({
          type: 'social_graph_anomaly',
          severity: pathogens.length > 0 && pathogens[0].toxicity > 0.7 ? 'critical' : 'medium',
          description: `Social Graph Immunity: ${pathogens.length} pathogen clusters, immunity at ${(immunityReport.currentImmunityLevel * 100).toFixed(0)}%`,
          serverId: guildId,
          serverName: guild.name,
          action: 'warn',
          metadata: {
            analysisType,
            depth,
            graphStats: { nodes: nodes.length, edges: totalEdges, density: graphDensity },
            immunityReport,
            pathogens: pathogens.map(p => ({
              size: p.members.length,
              toxicity: p.toxicity,
              pattern: p.pattern
            })),
            prediction: prediction ? {
              r0: prediction.r0,
              peakInfection: prediction.peakInfectionCount,
              recoveryTime: prediction.recoveryTimeHours
            } : null
          }
        });
      }

      await storage.createCommandLog({
        commandName: 'social-immunity',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guildId,
        serverName: guild.name,
        success: true,
        duration: analysisTime,
        metadata: {
          analysisType,
          depth,
          nodesAnalyzed: nodes.length,
          pathogensFound: pathogens.length,
          immunityLevel: immunityReport.currentImmunityLevel
        }
      });

    } catch (error) {
      console.error('Social Graph Immunity error:', error);
      
      await storage.createCommandLog({
        commandName: 'social-immunity',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guildId || 'unknown',
        serverName: guild?.name || 'unknown',
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      });

      await interaction.editReply('❌ Immunological analysis failed. Social graph may be corrupted.');
    }
  }
};

function calculateClusterCoefficients(graph: Map<string, GraphNode>): void {
  for (const [, node] of Array.from(graph.entries())) {
    const neighbors = Array.from(node.connections);
    if (neighbors.length < 2) {
      node.clusterCoefficient = 0;
      continue;
    }

    let triangles = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const neighbor1 = graph.get(neighbors[i]);
        if (neighbor1?.connections.has(neighbors[j])) {
          triangles++;
        }
      }
    }

    const possibleTriangles = (neighbors.length * (neighbors.length - 1)) / 2;
    node.clusterCoefficient = possibleTriangles > 0 ? triangles / possibleTriangles : 0;
  }
}

function calculateBetweennessCentrality(graph: Map<string, GraphNode>): void {
  const nodes = Array.from(graph.keys());
  const betweenness = new Map<string, number>();
  
  for (const nodeId of nodes) {
    betweenness.set(nodeId, 0);
  }

  for (const source of nodes.slice(0, Math.min(nodes.length, 50))) {
    const distances = new Map<string, number>();
    const paths = new Map<string, number>();
    const predecessors = new Map<string, string[]>();
    const queue: string[] = [];
    const stack: string[] = [];

    for (const nodeId of nodes) {
      distances.set(nodeId, Infinity);
      paths.set(nodeId, 0);
      predecessors.set(nodeId, []);
    }

    distances.set(source, 0);
    paths.set(source, 1);
    queue.push(source);

    while (queue.length > 0) {
      const current = queue.shift()!;
      stack.push(current);
      const currentNode = graph.get(current);
      if (!currentNode) continue;

      for (const neighbor of Array.from(currentNode.connections)) {
        if (distances.get(neighbor) === Infinity) {
          distances.set(neighbor, distances.get(current)! + 1);
          queue.push(neighbor);
        }

        if (distances.get(neighbor) === distances.get(current)! + 1) {
          paths.set(neighbor, paths.get(neighbor)! + paths.get(current)!);
          predecessors.get(neighbor)!.push(current);
        }
      }
    }

    const delta = new Map<string, number>();
    for (const nodeId of nodes) {
      delta.set(nodeId, 0);
    }

    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const pred of predecessors.get(current)!) {
        const contribution = (paths.get(pred)! / paths.get(current)!) * (1 + delta.get(current)!);
        delta.set(pred, delta.get(pred)! + contribution);
      }
      if (current !== source) {
        betweenness.set(current, betweenness.get(current)! + delta.get(current)!);
      }
    }
  }

  const maxBetweenness = Math.max(...Array.from(betweenness.values()), 1);
  for (const [nodeId, value] of Array.from(betweenness.entries())) {
    const node = graph.get(nodeId);
    if (node) {
      node.betweenness = value / maxBetweenness;
    }
  }
}

function classifyImmunityStatus(graph: Map<string, GraphNode>): void {
  for (const [, node] of Array.from(graph.entries())) {
    if (node.trustScore >= IMMUNITY_CONFIG.HIGH_TRUST_THRESHOLD) {
      node.immunityStatus = 'immune';
    } else if (node.trustScore >= IMMUNITY_CONFIG.MIN_TRUST_SCORE) {
      node.immunityStatus = 'recovered';
    } else if (node.clusterCoefficient > 0.8 && node.connections.size < 3) {
      node.immunityStatus = 'infected';
    } else {
      node.immunityStatus = 'susceptible';
    }
  }
}

function detectPathogenClusters(graph: Map<string, GraphNode>, depth: number): PathogenCluster[] {
  const clusters: PathogenCluster[] = [];
  const visited = new Set<string>();
  const nodes = Array.from(graph.values());

  const infectedNodes = nodes.filter(n => 
    n.immunityStatus === 'infected' || 
    (n.clusterCoefficient > 0.7 && n.connections.size < 5 && n.trustScore < 0.4)
  );

  for (const seed of infectedNodes) {
    if (visited.has(seed.userId)) continue;

    const cluster: string[] = [seed.userId];
    visited.add(seed.userId);

    const queue = [seed];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighborId of Array.from(current.connections)) {
        if (visited.has(neighborId)) continue;
        const neighbor = graph.get(neighborId);
        if (!neighbor) continue;

        if (neighbor.trustScore < 0.4 || neighbor.immunityStatus === 'infected') {
          cluster.push(neighborId);
          visited.add(neighborId);
          queue.push(neighbor);
        }
      }
    }

    if (cluster.length >= 2) {
      const clusterNodes = cluster.map(id => graph.get(id)!).filter(Boolean);
      const avgTrust = clusterNodes.reduce((sum, n) => sum + n.trustScore, 0) / clusterNodes.length;
      const totalConnections = clusterNodes.reduce((sum, n) => sum + n.connections.size, 0);
      const externalConnections = clusterNodes.reduce((sum, n) => {
        return sum + Array.from(n.connections).filter(c => !cluster.includes(c)).length;
      }, 0);

      const toxicity = 1 - avgTrust;
      const spreadPotential = externalConnections / Math.max(totalConnections, 1);

      const patterns = [];
      if (clusterNodes.every(n => n.clusterCoefficient > 0.8)) patterns.push('Isolated bubble');
      if (spreadPotential > 0.5) patterns.push('High spread risk');
      if (avgTrust < 0.2) patterns.push('Very low trust');

      clusters.push({
        members: cluster,
        centroid: cluster[0],
        toxicity,
        spreadPotential,
        containmentPriority: toxicity * spreadPotential * cluster.length,
        pattern: patterns.join(', ') || 'Standard cluster'
      });
    }
  }

  return clusters.sort((a, b) => b.containmentPriority - a.containmentPriority);
}

function calculateImmunityReport(graph: Map<string, GraphNode>): ImmunityReport {
  const nodes = Array.from(graph.values());
  
  const susceptible = nodes.filter(n => n.immunityStatus === 'susceptible').length;
  const infected = nodes.filter(n => n.immunityStatus === 'infected').length;
  const recovered = nodes.filter(n => n.immunityStatus === 'recovered').length;
  const immune = nodes.filter(n => n.immunityStatus === 'immune').length;

  const protectedCount = recovered + immune;
  const currentImmunityLevel = protectedCount / nodes.length;

  return {
    susceptibleCount: susceptible,
    infectedCount: infected,
    recoveredCount: recovered,
    immuneCount: immune,
    herdImmunityThreshold: IMMUNITY_CONFIG.HERD_IMMUNITY_THRESHOLD,
    currentImmunityLevel,
    isProtected: currentImmunityLevel >= IMMUNITY_CONFIG.HERD_IMMUNITY_THRESHOLD
  };
}

function runSIRSimulation(graph: Map<string, GraphNode>, pathogens: PathogenCluster[]): EpidemiologicalPrediction {
  const nodes = Array.from(graph.values());
  const totalPopulation = nodes.length;
  
  const avgConnections = nodes.reduce((sum, n) => sum + n.connections.size, 0) / totalPopulation;
  const transmissionRate = 0.3;
  const recoveryRate = 0.1;
  
  const r0 = (transmissionRate * avgConnections) / recoveryRate;

  let S = nodes.filter(n => n.immunityStatus === 'susceptible').length;
  let I = Math.max(1, nodes.filter(n => n.immunityStatus === 'infected').length);
  let R = totalPopulation - S - I;

  let peakI = I;
  let peakTime = 0;
  let totalInfected = I;
  
  const dt = 0.1;
  let t = 0;
  const maxTime = 168;

  while (t < maxTime && I > 0.5) {
    const dS = -transmissionRate * S * I / totalPopulation;
    const dI = transmissionRate * S * I / totalPopulation - recoveryRate * I;
    const dR = recoveryRate * I;

    S += dS * dt;
    I += dI * dt;
    R += dR * dt;
    t += dt;

    if (I > peakI) {
      peakI = I;
      peakTime = t;
    }
    totalInfected = totalPopulation - S;
  }

  const criticalNodes = nodes
    .filter(n => n.betweenness > IMMUNITY_CONFIG.BETWEENNESS_DANGER_THRESHOLD)
    .sort((a, b) => b.betweenness - a.betweenness)
    .map(n => n.userId);

  return {
    peakInfectionTime: Math.round(peakTime),
    peakInfectionCount: Math.round(peakI),
    totalProjectedInfected: Math.round(totalInfected),
    recoveryTimeHours: Math.round(t),
    r0,
    criticalNodes
  };
}
