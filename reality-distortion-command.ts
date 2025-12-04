import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, Message, TextChannel } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface RealityDistortion {
  type: 'narrative_manipulation' | 'gaslighting' | 'coordinated_deception' | 'astroturfing' | 'sockpuppet_network';
  confidence: number;
  indicators: string[];
  affectedUsers: string[];
  originUsers: string[];
  timespan: { start: Date; end: Date };
  impactScore: number;
}

interface NarrativeThread {
  id: string;
  content: string;
  author: string;
  timestamp: Date;
  sentiment: number;
  truthScore: number;
  propagationCount: number;
}

interface ConsensusAnalysis {
  topic: string;
  naturalConsensus: number;
  artificialInfluence: number;
  manipulationIndicators: string[];
  keyPropagators: string[];
}

interface TemporalAnomaly {
  type: 'message_burst' | 'coordinated_timing' | 'echo_chamber' | 'narrative_shift';
  timestamp: Date;
  participants: string[];
  suspicionScore: number;
  description: string;
}

function calculateTruthScore(content: string, authorHistory: any[]): number {
  let score = 0.7;
  
  const sensationalPatterns = [
    /\b(breaking|urgent|must see|you won't believe)\b/gi,
    /\b(everyone knows|obviously|clearly|definitely)\b/gi,
    /\b(they don't want you to know|hidden truth|wake up)\b/gi
  ];
  
  for (const pattern of sensationalPatterns) {
    if (pattern.test(content)) {
      score -= 0.1;
    }
  }
  
  if (content.includes('!') && (content.match(/!/g) || []).length > 3) {
    score -= 0.1;
  }
  
  if (authorHistory.length > 10) {
    const uniqueContent = new Set(authorHistory.map(m => m.content)).size;
    if (uniqueContent < authorHistory.length * 0.5) {
      score -= 0.2;
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

function detectNarrativeManipulation(messages: any[]): RealityDistortion | null {
  if (messages.length < 10) return null;
  
  const contentSimilarity = new Map<string, string[]>();
  
  for (const msg of messages) {
    const normalized = (msg.content || '').toLowerCase().replace(/[^\w\s]/g, '').substring(0, 100);
    if (normalized.length > 20) {
      const existing = contentSimilarity.get(normalized) || [];
      existing.push(msg.userId);
      contentSimilarity.set(normalized, existing);
    }
  }
  
  const suspiciousPatterns: { pattern: string; users: string[] }[] = [];
  
  for (const [pattern, users] of Array.from(contentSimilarity.entries())) {
    const uniqueUsers = new Set(users);
    if (uniqueUsers.size >= 3 && users.length >= 5) {
      suspiciousPatterns.push({ pattern, users: Array.from(uniqueUsers) });
    }
  }
  
  if (suspiciousPatterns.length > 0) {
    const allOriginUsers = new Set<string>();
    const allAffectedUsers = new Set<string>();
    
    for (const sp of suspiciousPatterns) {
      sp.users.forEach(u => allOriginUsers.add(u));
    }
    
    return {
      type: 'coordinated_deception',
      confidence: Math.min(0.95, 0.5 + (suspiciousPatterns.length * 0.1)),
      indicators: [
        `${suspiciousPatterns.length} coordinated message patterns detected`,
        `${allOriginUsers.size} accounts involved in coordination`,
        'Similar content posted within short timeframes'
      ],
      affectedUsers: Array.from(allAffectedUsers),
      originUsers: Array.from(allOriginUsers),
      timespan: {
        start: new Date(Math.min(...messages.map(m => new Date(m.timestamp).getTime()))),
        end: new Date(Math.max(...messages.map(m => new Date(m.timestamp).getTime())))
      },
      impactScore: Math.min(100, allOriginUsers.size * 15)
    };
  }
  
  return null;
}

function detectAstroturfing(messages: any[]): RealityDistortion | null {
  if (messages.length < 20) return null;
  
  const userActivity = new Map<string, { messages: number; uniqueContent: Set<string>; timing: number[] }>();
  
  for (const msg of messages) {
    const data = userActivity.get(msg.userId) || { messages: 0, uniqueContent: new Set(), timing: [] };
    data.messages++;
    data.uniqueContent.add((msg.content || '').substring(0, 50));
    data.timing.push(new Date(msg.timestamp).getTime());
    userActivity.set(msg.userId, data);
  }
  
  const suspiciousAccounts: string[] = [];
  
  for (const [userId, data] of Array.from(userActivity.entries())) {
    const repetitionRatio = data.uniqueContent.size / data.messages;
    if (repetitionRatio < 0.3 && data.messages > 5) {
      suspiciousAccounts.push(userId);
    }
    
    if (data.timing.length > 3) {
      const intervals = [];
      for (let i = 1; i < data.timing.length; i++) {
        intervals.push(data.timing[i] - data.timing[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
      if (variance < 10000 && data.messages > 5) {
        if (!suspiciousAccounts.includes(userId)) {
          suspiciousAccounts.push(userId);
        }
      }
    }
  }
  
  if (suspiciousAccounts.length >= 2) {
    return {
      type: 'astroturfing',
      confidence: Math.min(0.9, 0.4 + (suspiciousAccounts.length * 0.1)),
      indicators: [
        `${suspiciousAccounts.length} accounts showing bot-like behavior`,
        'High message repetition detected',
        'Suspiciously regular posting intervals'
      ],
      affectedUsers: [],
      originUsers: suspiciousAccounts,
      timespan: {
        start: new Date(Math.min(...messages.map(m => new Date(m.timestamp).getTime()))),
        end: new Date()
      },
      impactScore: Math.min(100, suspiciousAccounts.length * 20)
    };
  }
  
  return null;
}

function detectGaslighting(messages: any[]): RealityDistortion | null {
  const gaslightingPhrases = [
    'that never happened',
    'you\'re imagining things',
    'you\'re being paranoid',
    'i never said that',
    'you\'re overreacting',
    'everyone agrees with me',
    'no one else thinks that',
    'you\'re the only one',
    'you\'re crazy',
    'you must be confused'
  ];
  
  const suspiciousMessages: any[] = [];
  
  for (const msg of messages) {
    const content = (msg.content || '').toLowerCase();
    for (const phrase of gaslightingPhrases) {
      if (content.includes(phrase)) {
        suspiciousMessages.push(msg);
        break;
      }
    }
  }
  
  if (suspiciousMessages.length >= 3) {
    const originUsers = new Set(suspiciousMessages.map(m => m.userId));
    
    return {
      type: 'gaslighting',
      confidence: Math.min(0.85, 0.3 + (suspiciousMessages.length * 0.1)),
      indicators: [
        `${suspiciousMessages.length} messages containing gaslighting language`,
        `${originUsers.size} users employing manipulation tactics`,
        'Pattern of reality-denial detected'
      ],
      affectedUsers: [],
      originUsers: Array.from(originUsers),
      timespan: {
        start: new Date(Math.min(...suspiciousMessages.map(m => new Date(m.timestamp).getTime()))),
        end: new Date(Math.max(...suspiciousMessages.map(m => new Date(m.timestamp).getTime())))
      },
      impactScore: Math.min(100, suspiciousMessages.length * 10)
    };
  }
  
  return null;
}

function analyzeNarrativeConsensus(messages: any[], topic: string): ConsensusAnalysis {
  const topicMessages = messages.filter(m => 
    (m.content || '').toLowerCase().includes(topic.toLowerCase())
  );
  
  const uniqueAuthors = new Set(topicMessages.map(m => m.userId));
  const messagesByAuthor = new Map<string, number>();
  
  for (const msg of topicMessages) {
    messagesByAuthor.set(msg.userId, (messagesByAuthor.get(msg.userId) || 0) + 1);
  }
  
  const topPropagators = Array.from(messagesByAuthor.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([userId]) => userId);
  
  const topPropagatorMessages = topPropagators.reduce(
    (sum, u) => sum + (messagesByAuthor.get(u) || 0), 0
  );
  const concentrationRatio = topicMessages.length > 0 
    ? topPropagatorMessages / topicMessages.length 
    : 0;
  
  const artificialInfluence = concentrationRatio > 0.6 ? concentrationRatio : 0;
  const naturalConsensus = 1 - artificialInfluence;
  
  const manipulationIndicators: string[] = [];
  if (concentrationRatio > 0.6) {
    manipulationIndicators.push('High message concentration from few users');
  }
  if (uniqueAuthors.size < 3 && topicMessages.length > 10) {
    manipulationIndicators.push('Limited diversity in discourse');
  }
  
  return {
    topic,
    naturalConsensus,
    artificialInfluence,
    manipulationIndicators,
    keyPropagators: topPropagators
  };
}

function detectTemporalAnomalies(messages: any[]): TemporalAnomaly[] {
  const anomalies: TemporalAnomaly[] = [];
  
  const sortedMessages = [...messages].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  const windowSize = 60000;
  for (let i = 0; i < sortedMessages.length - 5; i++) {
    const window = sortedMessages.slice(i, i + 10).filter(m => 
      new Date(m.timestamp).getTime() - new Date(sortedMessages[i].timestamp).getTime() < windowSize
    );
    
    if (window.length >= 5) {
      const uniqueUsers = new Set(window.map(m => m.userId));
      if (uniqueUsers.size >= 3) {
        anomalies.push({
          type: 'message_burst',
          timestamp: new Date(sortedMessages[i].timestamp),
          participants: Array.from(uniqueUsers),
          suspicionScore: Math.min(100, window.length * 10),
          description: `${window.length} messages from ${uniqueUsers.size} users within 1 minute`
        });
        i += window.length - 1;
      }
    }
  }
  
  const userTimings = new Map<string, number[]>();
  for (const msg of sortedMessages) {
    const times = userTimings.get(msg.userId) || [];
    times.push(new Date(msg.timestamp).getTime());
    userTimings.set(msg.userId, times);
  }
  
  const userPairs: [string, string][] = [];
  const users = Array.from(userTimings.keys());
  
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const times1 = userTimings.get(users[i]) || [];
      const times2 = userTimings.get(users[j]) || [];
      
      let correlatedMessages = 0;
      for (const t1 of times1) {
        for (const t2 of times2) {
          if (Math.abs(t1 - t2) < 5000) {
            correlatedMessages++;
          }
        }
      }
      
      if (correlatedMessages >= 3) {
        userPairs.push([users[i], users[j]]);
      }
    }
  }
  
  if (userPairs.length >= 2) {
    const participants = new Set<string>();
    userPairs.forEach(([a, b]) => {
      participants.add(a);
      participants.add(b);
    });
    
    anomalies.push({
      type: 'coordinated_timing',
      timestamp: new Date(),
      participants: Array.from(participants),
      suspicionScore: Math.min(100, userPairs.length * 25),
      description: `${userPairs.length} user pairs showing coordinated timing patterns`
    });
  }
  
  return anomalies;
}

export const realityDistortionCommand = {
  data: new SlashCommandBuilder()
    .setName('reality-check')
    .setDescription('Detect manipulation, gaslighting, and coordinated deception attempts')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand(sub => sub
      .setName('scan')
      .setDescription('Scan for reality distortion attempts')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to scan (default: current)')
        .setRequired(false))
      .addIntegerOption(opt => opt
        .setName('depth')
        .setDescription('Number of messages to analyze (100-1000)')
        .setMinValue(100)
        .setMaxValue(1000)
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('narrative')
      .setDescription('Analyze narrative formation around a topic')
      .addStringOption(opt => opt
        .setName('topic')
        .setDescription('Topic or keyword to analyze')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('temporal')
      .setDescription('Detect temporal anomalies and coordinated timing'))
    .addSubcommand(sub => sub
      .setName('truth-score')
      .setDescription('Calculate truth scores for recent messages')
      .addIntegerOption(opt => opt
        .setName('count')
        .setDescription('Number of messages to score')
        .setMinValue(10)
        .setMaxValue(100)
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('gaslighting')
      .setDescription('Detect gaslighting and psychological manipulation'))
    .addSubcommand(sub => sub
      .setName('report')
      .setDescription('Generate full reality distortion report')),

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
      await fileLogger.command('reality-check', `Executing ${subcommand}`, {
        userId: interaction.user.id,
        guildId
      });
      
      const messageTraces = await storage.getMessageTraces({ 
        serverId: guildId, 
        limit: 1000 
      }) || [];
      
      if (subcommand === 'scan') {
        const depth = interaction.options.getInteger('depth') || 500;
        const messages = messageTraces.slice(0, depth);
        
        const distortions: RealityDistortion[] = [];
        
        const narrativeManip = detectNarrativeManipulation(messages);
        if (narrativeManip) distortions.push(narrativeManip);
        
        const astroturf = detectAstroturfing(messages);
        if (astroturf) distortions.push(astroturf);
        
        const gaslight = detectGaslighting(messages);
        if (gaslight) distortions.push(gaslight);
        
        const embed = new EmbedBuilder()
          .setTitle('Reality Distortion Scan')
          .setColor(distortions.length > 0 ? 0xFF0000 : 0x00FF00)
          .setDescription(`Analyzed ${messages.length} messages for manipulation attempts`);
        
        if (distortions.length === 0) {
          embed.addFields({
            name: 'Status',
            value: '✅ **No significant reality distortions detected**\n\nThe analyzed messages appear to reflect genuine discourse.',
            inline: false
          });
        } else {
          for (const d of distortions) {
            const typeEmoji = {
              'narrative_manipulation': '📜',
              'gaslighting': '💨',
              'coordinated_deception': '🕸️',
              'astroturfing': '🌱',
              'sockpuppet_network': '🧦'
            }[d.type];
            
            embed.addFields({
              name: `${typeEmoji} ${d.type.replace(/_/g, ' ').toUpperCase()}`,
              value: [
                `Confidence: ${(d.confidence * 100).toFixed(0)}%`,
                `Impact Score: ${d.impactScore}`,
                `Actors: ${d.originUsers.length}`,
                '',
                '**Indicators:**',
                ...d.indicators.map(i => `• ${i}`)
              ].join('\n'),
              inline: false
            });
          }
          
          const allActors = new Set<string>();
          distortions.forEach(d => d.originUsers.forEach(u => allActors.add(u)));
          
          if (allActors.size > 0) {
            embed.addFields({
              name: 'Suspected Actors',
              value: Array.from(allActors).slice(0, 5).map(id => `<@${id}>`).join(', ') +
                     (allActors.size > 5 ? ` and ${allActors.size - 5} more` : ''),
              inline: false
            });
          }
        }
        
        embed.setFooter({ text: `Reality Check v2.0 | ${Date.now() - startTime}ms` });
        embed.setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
        if (distortions.length > 0) {
          await storage.createThreat({
            type: 'reality_distortion',
            severity: distortions.some(d => d.confidence > 0.7) ? 'high' : 'medium',
            description: `Detected ${distortions.length} reality distortion attempts`,
            serverId: guildId,
            serverName: guild.name,
            action: 'warn',
            metadata: { distortions: distortions.map(d => ({ type: d.type, confidence: d.confidence })) }
          });
        }
        
      } else if (subcommand === 'narrative') {
        const topic = interaction.options.getString('topic', true);
        const analysis = analyzeNarrativeConsensus(messageTraces, topic);
        
        const embed = new EmbedBuilder()
          .setTitle(`Narrative Analysis: "${topic}"`)
          .setColor(analysis.artificialInfluence > 0.5 ? 0xFF0000 : 0x00FF00)
          .addFields(
            {
              name: 'Natural Consensus',
              value: `${(analysis.naturalConsensus * 100).toFixed(0)}%`,
              inline: true
            },
            {
              name: 'Artificial Influence',
              value: `${(analysis.artificialInfluence * 100).toFixed(0)}%`,
              inline: true
            },
            {
              name: 'Authenticity Rating',
              value: analysis.artificialInfluence > 0.5 ? '⚠️ SUSPICIOUS' : '✅ AUTHENTIC',
              inline: true
            }
          );
        
        if (analysis.manipulationIndicators.length > 0) {
          embed.addFields({
            name: 'Manipulation Indicators',
            value: analysis.manipulationIndicators.map(i => `• ${i}`).join('\n'),
            inline: false
          });
        }
        
        if (analysis.keyPropagators.length > 0) {
          embed.addFields({
            name: 'Key Propagators',
            value: analysis.keyPropagators.map(id => `<@${id}>`).join(', '),
            inline: false
          });
        }
        
        embed.setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'temporal') {
        const anomalies = detectTemporalAnomalies(messageTraces);
        
        const embed = new EmbedBuilder()
          .setTitle('Temporal Anomaly Detection')
          .setColor(anomalies.length > 0 ? 0xFFA500 : 0x00FF00)
          .setDescription(`Analyzed ${messageTraces.length} messages for timing patterns`);
        
        if (anomalies.length === 0) {
          embed.addFields({
            name: 'Status',
            value: '✅ No significant temporal anomalies detected',
            inline: false
          });
        } else {
          const anomalyList = anomalies.slice(0, 5).map((a, i) => {
            const typeEmoji = {
              'message_burst': '💥',
              'coordinated_timing': '⏱️',
              'echo_chamber': '🔁',
              'narrative_shift': '📊'
            }[a.type];
            
            return `${i + 1}. ${typeEmoji} **${a.type.replace(/_/g, ' ')}**\n   Suspicion: ${a.suspicionScore}% | Participants: ${a.participants.length}\n   ${a.description}`;
          }).join('\n\n');
          
          embed.addFields({
            name: `Anomalies Detected (${anomalies.length})`,
            value: anomalyList,
            inline: false
          });
        }
        
        embed.setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'truth-score') {
        const count = interaction.options.getInteger('count') || 50;
        const messages = messageTraces.slice(0, count);
        
        const scoredMessages: { content: string; author: string; score: number }[] = [];
        
        for (const msg of messages) {
          if (msg.content && msg.content.length > 10) {
            const authorHistory = messageTraces.filter(m => m.userId === msg.userId);
            const score = calculateTruthScore(msg.content, authorHistory);
            scoredMessages.push({
              content: msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : ''),
              author: msg.userId,
              score
            });
          }
        }
        
        scoredMessages.sort((a, b) => a.score - b.score);
        
        const avgScore = scoredMessages.length > 0
          ? scoredMessages.reduce((sum, m) => sum + m.score, 0) / scoredMessages.length
          : 0.5;
        
        const embed = new EmbedBuilder()
          .setTitle('Truth Score Analysis')
          .setColor(avgScore > 0.6 ? 0x00FF00 : avgScore > 0.4 ? 0xFFA500 : 0xFF0000)
          .addFields(
            {
              name: 'Average Truth Score',
              value: `${(avgScore * 100).toFixed(0)}%`,
              inline: true
            },
            {
              name: 'Messages Analyzed',
              value: `${scoredMessages.length}`,
              inline: true
            },
            {
              name: 'Discourse Health',
              value: avgScore > 0.6 ? '✅ Healthy' : avgScore > 0.4 ? '⚠️ Moderate' : '🔴 Concerning',
              inline: true
            }
          );
        
        const lowestScoring = scoredMessages.slice(0, 3);
        if (lowestScoring.length > 0) {
          embed.addFields({
            name: 'Lowest Scoring Messages',
            value: lowestScoring.map((m, i) => 
              `${i + 1}. Score: ${(m.score * 100).toFixed(0)}% - "${m.content}"`
            ).join('\n'),
            inline: false
          });
        }
        
        embed.setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'gaslighting') {
        const distortion = detectGaslighting(messageTraces);
        
        const embed = new EmbedBuilder()
          .setTitle('Gaslighting Detection')
          .setColor(distortion ? 0xFF0000 : 0x00FF00);
        
        if (!distortion) {
          embed.setDescription('✅ **No gaslighting patterns detected**\n\nThe analyzed messages do not show signs of psychological manipulation.');
        } else {
          embed.setDescription(`⚠️ **Gaslighting patterns detected**\n\nConfidence: ${(distortion.confidence * 100).toFixed(0)}%`);
          embed.addFields(
            {
              name: 'Indicators',
              value: distortion.indicators.map(i => `• ${i}`).join('\n'),
              inline: false
            },
            {
              name: 'Suspected Manipulators',
              value: distortion.originUsers.slice(0, 5).map(id => `<@${id}>`).join(', '),
              inline: false
            },
            {
              name: 'Timeframe',
              value: `<t:${Math.floor(distortion.timespan.start.getTime() / 1000)}:R> to <t:${Math.floor(distortion.timespan.end.getTime() / 1000)}:R>`,
              inline: false
            },
            {
              name: 'Impact Score',
              value: `${distortion.impactScore}/100`,
              inline: true
            }
          );
        }
        
        embed.setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'report') {
        const distortions: RealityDistortion[] = [];
        
        const narrativeManip = detectNarrativeManipulation(messageTraces);
        if (narrativeManip) distortions.push(narrativeManip);
        
        const astroturf = detectAstroturfing(messageTraces);
        if (astroturf) distortions.push(astroturf);
        
        const gaslight = detectGaslighting(messageTraces);
        if (gaslight) distortions.push(gaslight);
        
        const temporalAnomalies = detectTemporalAnomalies(messageTraces);
        
        const threatLevel = distortions.length >= 3 ? 'CRITICAL' :
                          distortions.length >= 2 ? 'HIGH' :
                          distortions.length >= 1 ? 'MODERATE' : 'LOW';
        
        const threatColor = {
          'CRITICAL': 0xFF0000,
          'HIGH': 0xFF6B00,
          'MODERATE': 0xFFA500,
          'LOW': 0x00FF00
        }[threatLevel];
        
        const embed = new EmbedBuilder()
          .setTitle('Reality Distortion Full Report')
          .setColor(threatColor)
          .setDescription(`**Threat Level: ${threatLevel}**\n\nComprehensive analysis of ${messageTraces.length} messages`)
          .addFields(
            {
              name: 'Distortions Detected',
              value: distortions.length > 0 
                ? distortions.map(d => `• ${d.type.replace(/_/g, ' ')} (${(d.confidence * 100).toFixed(0)}%)`).join('\n')
                : 'None detected',
              inline: true
            },
            {
              name: 'Temporal Anomalies',
              value: `${temporalAnomalies.length} detected`,
              inline: true
            },
            {
              name: 'Analysis Time',
              value: `${Date.now() - startTime}ms`,
              inline: true
            }
          );
        
        if (distortions.length > 0) {
          const allActors = new Set<string>();
          distortions.forEach(d => d.originUsers.forEach(u => allActors.add(u)));
          
          embed.addFields({
            name: 'Total Suspected Actors',
            value: `${allActors.size} unique accounts`,
            inline: true
          });
          
          const avgImpact = distortions.reduce((sum, d) => sum + d.impactScore, 0) / distortions.length;
          embed.addFields({
            name: 'Average Impact',
            value: `${avgImpact.toFixed(0)}/100`,
            inline: true
          });
        }
        
        const recommendations: string[] = [];
        if (distortions.some(d => d.type === 'coordinated_deception')) {
          recommendations.push('• Review suspected coordinated accounts');
        }
        if (distortions.some(d => d.type === 'gaslighting')) {
          recommendations.push('• Monitor for psychological manipulation');
        }
        if (distortions.some(d => d.type === 'astroturfing')) {
          recommendations.push('• Implement bot detection measures');
        }
        if (temporalAnomalies.length > 2) {
          recommendations.push('• Increase moderation during peak activity');
        }
        
        if (recommendations.length > 0) {
          embed.addFields({
            name: 'Recommendations',
            value: recommendations.join('\n'),
            inline: false
          });
        }
        
        embed.setFooter({ text: 'Reality Distortion Detection System v2.0' });
        embed.setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
      
      await storage.createCommandLog({
        commandName: 'reality-check',
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
      console.error('Reality Check error:', error);
      await fileLogger.error('reality-check', 'Command failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Error')
          .setDescription('Failed to perform reality check analysis.')
          .setTimestamp()
        ]
      });
    }
  }
};
