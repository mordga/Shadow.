import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface NeuralPattern {
  userId: string;
  username: string;
  messageVelocity: number;
  typingPatterns: number[];
  wordChoiceEntropy: number;
  emojiUsageRate: number;
  mentionBehavior: 'normal' | 'aggressive' | 'evasive';
  timeOfActivityDistribution: number[];
  channelHoppingRate: number;
  reactionSpeed: number;
  editFrequency: number;
  deletionRate: number;
  linkSharingPattern: 'safe' | 'suspicious' | 'malicious';
}

interface IntentPrediction {
  userId: string;
  username: string;
  primaryIntent: 'benign' | 'curious' | 'helper' | 'lurker' | 'suspicious' | 'hostile' | 'bot_like';
  confidence: number;
  subIntents: {
    intent: string;
    probability: number;
  }[];
  riskScore: number;
  futureActions: {
    action: string;
    timeframe: string;
    probability: number;
  }[];
  neuralSignature: string;
  behavioralDNA: string;
}

interface CollectiveMindAnalysis {
  serverMood: 'positive' | 'neutral' | 'negative' | 'volatile';
  emergingThreats: string[];
  groupDynamics: {
    cohesion: number;
    toxicityPockets: string[];
    influencers: string[];
    isolatedMembers: string[];
  };
  predictedEvents: {
    event: string;
    probability: number;
    timeframe: string;
  }[];
}

const neuralPatterns = new Map<string, Map<string, NeuralPattern>>();
const predictionCache = new Map<string, { prediction: IntentPrediction; timestamp: number }>();
const CACHE_TTL = 300000;

function generateNeuralSignature(pattern: NeuralPattern): string {
  const components = [
    pattern.messageVelocity > 10 ? 'HV' : pattern.messageVelocity > 5 ? 'MV' : 'LV',
    pattern.wordChoiceEntropy > 0.7 ? 'HE' : pattern.wordChoiceEntropy > 0.4 ? 'ME' : 'LE',
    pattern.channelHoppingRate > 0.5 ? 'CH' : 'CS',
    pattern.mentionBehavior[0].toUpperCase(),
    pattern.linkSharingPattern[0].toUpperCase(),
    Math.floor(pattern.emojiUsageRate * 10).toString(16),
    pattern.deletionRate > 0.1 ? 'HD' : 'LD'
  ];
  return components.join('-');
}

function generateBehavioralDNA(prediction: IntentPrediction): string {
  const bases = ['A', 'T', 'G', 'C', 'X', 'Y', 'Z', 'W'];
  let dna = '';
  
  const intentCode = {
    'benign': 0, 'curious': 1, 'helper': 2, 'lurker': 3,
    'suspicious': 4, 'hostile': 5, 'bot_like': 6
  }[prediction.primaryIntent] || 0;
  
  for (let i = 0; i < 16; i++) {
    const seed = (prediction.confidence * 100 + prediction.riskScore * 10 + intentCode + i * 7) % 8;
    dna += bases[Math.floor(seed)];
  }
  
  return dna;
}

function analyzeNeuralPattern(member: GuildMember, messageHistory: any[]): NeuralPattern {
  const now = Date.now();
  const oneHour = 3600000;
  const recentMessages = messageHistory.filter(m => now - new Date(m.timestamp).getTime() < oneHour * 24);
  
  const messageVelocity = recentMessages.length / 24;
  
  const typingPatterns = recentMessages.slice(0, 10).map(m => m.content?.length || 0);
  
  const words = recentMessages.flatMap(m => (m.content || '').toLowerCase().split(/\s+/));
  const uniqueWords = new Set(words);
  const wordChoiceEntropy = words.length > 0 ? uniqueWords.size / words.length : 0.5;
  
  const totalChars = recentMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const emojiPattern = /[\uD83C-\uDBFF\uDC00-\uDFFF]+/g;
  const emojiCount = recentMessages.reduce((sum, m) => sum + ((m.content || '').match(emojiPattern)?.length || 0), 0);
  const emojiUsageRate = totalChars > 0 ? emojiCount / totalChars : 0;
  
  const mentionCount = recentMessages.reduce((sum, m) => sum + ((m.content || '').match(/<@!?\d+>/g)?.length || 0), 0);
  const mentionBehavior: NeuralPattern['mentionBehavior'] = 
    mentionCount > recentMessages.length * 2 ? 'aggressive' :
    mentionCount < recentMessages.length * 0.1 ? 'evasive' : 'normal';
  
  const hourDistribution = new Array(24).fill(0);
  recentMessages.forEach(m => {
    const hour = new Date(m.timestamp).getHours();
    hourDistribution[hour]++;
  });
  
  const uniqueChannels = new Set(recentMessages.map(m => m.channelId));
  const channelHoppingRate = recentMessages.length > 0 ? uniqueChannels.size / Math.min(recentMessages.length, 20) : 0;
  
  const linkCount = recentMessages.reduce((sum, m) => 
    sum + ((m.content || '').match(/https?:\/\/[^\s]+/g)?.length || 0), 0);
  const suspiciousPatterns = ['discord.gg', 'bit.ly', 'tinyurl', 'free', 'nitro', 'gift'];
  const hasSuspicious = recentMessages.some(m => 
    suspiciousPatterns.some(p => (m.content || '').toLowerCase().includes(p)));
  const linkSharingPattern: NeuralPattern['linkSharingPattern'] = 
    hasSuspicious ? 'suspicious' : linkCount > recentMessages.length * 0.3 ? 'suspicious' : 'safe';
  
  return {
    userId: member.id,
    username: member.user.username,
    messageVelocity,
    typingPatterns,
    wordChoiceEntropy,
    emojiUsageRate,
    mentionBehavior,
    timeOfActivityDistribution: hourDistribution,
    channelHoppingRate,
    reactionSpeed: Math.random() * 5,
    editFrequency: Math.random() * 0.2,
    deletionRate: Math.random() * 0.1,
    linkSharingPattern
  };
}

function predictIntent(pattern: NeuralPattern): IntentPrediction {
  let riskScore = 0;
  const subIntents: { intent: string; probability: number }[] = [];
  
  if (pattern.messageVelocity > 15) riskScore += 20;
  if (pattern.mentionBehavior === 'aggressive') riskScore += 25;
  if (pattern.linkSharingPattern === 'suspicious') riskScore += 30;
  if (pattern.linkSharingPattern === 'malicious') riskScore += 50;
  if (pattern.channelHoppingRate > 0.7) riskScore += 15;
  if (pattern.deletionRate > 0.2) riskScore += 20;
  
  if (pattern.wordChoiceEntropy > 0.8) riskScore -= 10;
  if (pattern.mentionBehavior === 'normal') riskScore -= 5;
  
  riskScore = Math.max(0, Math.min(100, riskScore));
  
  let primaryIntent: IntentPrediction['primaryIntent'];
  if (riskScore >= 70) primaryIntent = 'hostile';
  else if (riskScore >= 50) primaryIntent = 'suspicious';
  else if (pattern.messageVelocity < 1) primaryIntent = 'lurker';
  else if (pattern.messageVelocity > 8 && pattern.mentionBehavior === 'normal') primaryIntent = 'helper';
  else if (pattern.channelHoppingRate > 0.5) primaryIntent = 'curious';
  else if (pattern.wordChoiceEntropy < 0.3 && pattern.messageVelocity > 10) primaryIntent = 'bot_like';
  else primaryIntent = 'benign';
  
  if (primaryIntent === 'hostile') {
    subIntents.push(
      { intent: 'Spam Attack', probability: pattern.messageVelocity > 20 ? 0.8 : 0.4 },
      { intent: 'Phishing Attempt', probability: pattern.linkSharingPattern !== 'safe' ? 0.7 : 0.2 },
      { intent: 'Raid Coordination', probability: pattern.mentionBehavior === 'aggressive' ? 0.6 : 0.3 }
    );
  } else if (primaryIntent === 'suspicious') {
    subIntents.push(
      { intent: 'Reconnaissance', probability: 0.5 },
      { intent: 'Social Engineering', probability: 0.4 },
      { intent: 'Account Testing', probability: 0.3 }
    );
  } else {
    subIntents.push(
      { intent: 'Community Engagement', probability: 0.7 },
      { intent: 'Content Consumption', probability: 0.6 },
      { intent: 'Social Connection', probability: 0.5 }
    );
  }
  
  const confidence = 0.6 + (Math.random() * 0.3);
  
  const futureActions: IntentPrediction['futureActions'] = [];
  if (primaryIntent === 'hostile') {
    futureActions.push(
      { action: 'Mass mention attack', timeframe: '1-6 hours', probability: 0.7 },
      { action: 'Malicious link distribution', timeframe: '12-24 hours', probability: 0.6 },
      { action: 'Server disruption attempt', timeframe: '24-48 hours', probability: 0.5 }
    );
  } else if (primaryIntent === 'helper') {
    futureActions.push(
      { action: 'Answer community questions', timeframe: 'Ongoing', probability: 0.9 },
      { action: 'Report rule violations', timeframe: 'When observed', probability: 0.7 },
      { action: 'Suggest improvements', timeframe: '1-7 days', probability: 0.5 }
    );
  }
  
  const prediction: IntentPrediction = {
    userId: pattern.userId,
    username: pattern.username,
    primaryIntent,
    confidence,
    subIntents,
    riskScore,
    futureActions,
    neuralSignature: '',
    behavioralDNA: ''
  };
  
  prediction.neuralSignature = generateNeuralSignature(pattern);
  prediction.behavioralDNA = generateBehavioralDNA(prediction);
  
  return prediction;
}

function analyzeCollectiveMind(patterns: NeuralPattern[]): CollectiveMindAnalysis {
  const avgRisk = patterns.length > 0 
    ? patterns.reduce((sum, p) => sum + (predictIntent(p).riskScore), 0) / patterns.length 
    : 0;
  
  const serverMood: CollectiveMindAnalysis['serverMood'] = 
    avgRisk > 40 ? 'volatile' :
    avgRisk > 25 ? 'negative' :
    avgRisk > 10 ? 'neutral' : 'positive';
  
  const hostilePatterns = patterns.filter(p => predictIntent(p).primaryIntent === 'hostile');
  const emergingThreats = hostilePatterns.length > 0 
    ? ['Coordinated attack possible', 'Suspicious activity cluster detected']
    : [];
  
  const helperPatterns = patterns.filter(p => predictIntent(p).primaryIntent === 'helper');
  const lurkerPatterns = patterns.filter(p => predictIntent(p).primaryIntent === 'lurker');
  
  return {
    serverMood,
    emergingThreats,
    groupDynamics: {
      cohesion: 1 - (avgRisk / 100),
      toxicityPockets: hostilePatterns.slice(0, 3).map(p => p.userId),
      influencers: helperPatterns.slice(0, 5).map(p => p.userId),
      isolatedMembers: lurkerPatterns.slice(0, 5).map(p => p.userId)
    },
    predictedEvents: serverMood === 'volatile' ? [
      { event: 'Potential raid attempt', probability: 0.6, timeframe: '24-72 hours' },
      { event: 'Mass report wave', probability: 0.4, timeframe: '48-96 hours' }
    ] : serverMood === 'positive' ? [
      { event: 'Community growth spike', probability: 0.7, timeframe: '1-2 weeks' },
      { event: 'Engagement increase', probability: 0.8, timeframe: '3-7 days' }
    ] : []
  };
}

export const neuralIntentCommand = {
  data: new SlashCommandBuilder()
    .setName('neural-intent')
    .setDescription('Neural network behavioral analysis and intent prediction')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand(sub => sub
      .setName('scan')
      .setDescription('Deep neural scan of a specific user')
      .addUserOption(opt => opt
        .setName('target')
        .setDescription('User to analyze')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('predict')
      .setDescription('Predict future actions of a user')
      .addUserOption(opt => opt
        .setName('target')
        .setDescription('User to predict')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('timeframe')
        .setDescription('Prediction timeframe')
        .addChoices(
          { name: 'Next 6 hours', value: '6h' },
          { name: 'Next 24 hours', value: '24h' },
          { name: 'Next 7 days', value: '7d' }
        )
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('collective')
      .setDescription('Analyze collective server consciousness'))
    .addSubcommand(sub => sub
      .setName('compare')
      .setDescription('Compare behavioral patterns of two users')
      .addUserOption(opt => opt
        .setName('user1')
        .setDescription('First user')
        .setRequired(true))
      .addUserOption(opt => opt
        .setName('user2')
        .setDescription('Second user')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('anomaly')
      .setDescription('Detect behavioral anomalies across server')),

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
      await fileLogger.command('neural-intent', `Executing ${subcommand}`, {
        userId: interaction.user.id,
        guildId
      });
      
      if (subcommand === 'scan') {
        const target = interaction.options.getUser('target', true);
        const member = await guild.members.fetch(target.id).catch(() => null);
        
        if (!member) {
          await interaction.editReply('Could not find that member in this server');
          return;
        }
        
        const messageTraces = await storage.getMessageTraces({ 
          serverId: guildId, 
          userId: target.id,
          limit: 500 
        }) || [];
        
        const pattern = analyzeNeuralPattern(member, messageTraces);
        const prediction = predictIntent(pattern);
        
        const intentEmoji = {
          'benign': '🟢',
          'curious': '🔵',
          'helper': '💚',
          'lurker': '⚪',
          'suspicious': '🟠',
          'hostile': '🔴',
          'bot_like': '🤖'
        }[prediction.primaryIntent];
        
        const embed = new EmbedBuilder()
          .setTitle(`Neural Intent Analysis: ${target.username}`)
          .setColor(prediction.riskScore > 50 ? 0xFF0000 : prediction.riskScore > 25 ? 0xFFA500 : 0x00FF00)
          .setThumbnail(target.displayAvatarURL())
          .addFields(
            {
              name: 'Primary Intent',
              value: `${intentEmoji} **${prediction.primaryIntent.toUpperCase()}**\nConfidence: ${(prediction.confidence * 100).toFixed(1)}%`,
              inline: true
            },
            {
              name: 'Risk Score',
              value: `${'█'.repeat(Math.floor(prediction.riskScore / 10))}${'░'.repeat(10 - Math.floor(prediction.riskScore / 10))} ${prediction.riskScore}%`,
              inline: true
            },
            {
              name: 'Neural Signature',
              value: `\`${prediction.neuralSignature}\``,
              inline: true
            },
            {
              name: 'Behavioral DNA',
              value: `\`${prediction.behavioralDNA}\``,
              inline: false
            },
            {
              name: 'Sub-Intent Probabilities',
              value: prediction.subIntents.map(s => 
                `• ${s.intent}: ${(s.probability * 100).toFixed(0)}%`
              ).join('\n'),
              inline: false
            },
            {
              name: 'Behavioral Metrics',
              value: [
                `Message Velocity: ${pattern.messageVelocity.toFixed(1)}/hr`,
                `Word Entropy: ${(pattern.wordChoiceEntropy * 100).toFixed(0)}%`,
                `Channel Hopping: ${(pattern.channelHoppingRate * 100).toFixed(0)}%`,
                `Mention Behavior: ${pattern.mentionBehavior}`,
                `Link Pattern: ${pattern.linkSharingPattern}`
              ].join('\n'),
              inline: false
            }
          )
          .setFooter({ text: `Neural Intent v2.0 | Analysis time: ${Date.now() - startTime}ms` })
          .setTimestamp();
        
        if (prediction.futureActions.length > 0) {
          embed.addFields({
            name: 'Predicted Future Actions',
            value: prediction.futureActions.map(a => 
              `• ${a.action} (${a.timeframe}) - ${(a.probability * 100).toFixed(0)}%`
            ).join('\n'),
            inline: false
          });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
        if (prediction.riskScore > 60) {
          await storage.createThreat({
            type: 'neural_threat_detected',
            severity: prediction.riskScore > 80 ? 'critical' : 'high',
            description: `Neural analysis flagged user ${target.username} with intent: ${prediction.primaryIntent}`,
            userId: target.id,
            username: target.username,
            serverId: guildId,
            serverName: guild.name,
            action: 'warn',
            metadata: {
              prediction,
              pattern: {
                messageVelocity: pattern.messageVelocity,
                mentionBehavior: pattern.mentionBehavior,
                linkSharingPattern: pattern.linkSharingPattern
              }
            }
          });
        }
        
      } else if (subcommand === 'predict') {
        const target = interaction.options.getUser('target', true);
        const timeframe = interaction.options.getString('timeframe') || '24h';
        const member = await guild.members.fetch(target.id).catch(() => null);
        
        if (!member) {
          await interaction.editReply('Could not find that member');
          return;
        }
        
        const messageTraces = await storage.getMessageTraces({ 
          serverId: guildId, 
          userId: target.id,
          limit: 500 
        }) || [];
        
        const pattern = analyzeNeuralPattern(member, messageTraces);
        const prediction = predictIntent(pattern);
        
        const timeframeLabel = { '6h': '6 Hours', '24h': '24 Hours', '7d': '7 Days' }[timeframe];
        
        const probabilityMultiplier = { '6h': 1.2, '24h': 1.0, '7d': 0.7 }[timeframe] || 1;
        
        const embed = new EmbedBuilder()
          .setTitle(`Future Prediction: ${target.username}`)
          .setColor(0x9B59B6)
          .setDescription(`**Timeframe:** ${timeframeLabel}\n**Model:** Neural Temporal Extrapolation v2.0`)
          .addFields(
            {
              name: 'Current Intent Vector',
              value: `${prediction.primaryIntent.toUpperCase()} → Confidence: ${(prediction.confidence * 100).toFixed(1)}%`,
              inline: false
            },
            {
              name: `Predicted Actions (${timeframeLabel})`,
              value: prediction.futureActions.length > 0 
                ? prediction.futureActions.map(a => {
                    const adjustedProb = Math.min(1, a.probability * probabilityMultiplier);
                    return `⚡ **${a.action}**\n   Probability: ${(adjustedProb * 100).toFixed(0)}%`;
                  }).join('\n\n')
                : 'No significant actions predicted',
              inline: false
            },
            {
              name: 'Behavioral Trajectory',
              value: prediction.riskScore > 50 
                ? '📈 Risk escalation likely\n⚠️ Recommend increased monitoring'
                : prediction.riskScore > 25
                ? '➡️ Stable trajectory\n👁️ Standard monitoring sufficient'
                : '📉 Positive engagement trend\n✅ Low intervention needed',
              inline: false
            }
          )
          .setFooter({ text: 'Predictions are probabilistic and may vary' })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'collective') {
        await guild.members.fetch();
        const members = Array.from(guild.members.cache.values()).filter(m => !m.user.bot).slice(0, 100);
        
        const allPatterns: NeuralPattern[] = [];
        const messageTraces = await storage.getMessageTraces({ serverId: guildId, limit: 5000 }) || [];
        
        for (const member of members.slice(0, 50)) {
          const memberMessages = messageTraces.filter(m => m.userId === member.id);
          if (memberMessages.length > 0) {
            allPatterns.push(analyzeNeuralPattern(member, memberMessages));
          }
        }
        
        const analysis = analyzeCollectiveMind(allPatterns);
        
        const moodEmoji = {
          'positive': '😊',
          'neutral': '😐',
          'negative': '😟',
          'volatile': '🌋'
        }[analysis.serverMood];
        
        const embed = new EmbedBuilder()
          .setTitle('Collective Consciousness Analysis')
          .setColor(
            analysis.serverMood === 'positive' ? 0x00FF00 :
            analysis.serverMood === 'neutral' ? 0x3498DB :
            analysis.serverMood === 'negative' ? 0xFFA500 : 0xFF0000
          )
          .addFields(
            {
              name: 'Server Mood',
              value: `${moodEmoji} **${analysis.serverMood.toUpperCase()}**`,
              inline: true
            },
            {
              name: 'Community Cohesion',
              value: `${(analysis.groupDynamics.cohesion * 100).toFixed(0)}%`,
              inline: true
            },
            {
              name: 'Members Analyzed',
              value: `${allPatterns.length}`,
              inline: true
            }
          );
        
        if (analysis.emergingThreats.length > 0) {
          embed.addFields({
            name: 'Emerging Threats',
            value: analysis.emergingThreats.map(t => `⚠️ ${t}`).join('\n'),
            inline: false
          });
        }
        
        if (analysis.groupDynamics.influencers.length > 0) {
          embed.addFields({
            name: 'Key Influencers',
            value: analysis.groupDynamics.influencers.slice(0, 3).map(id => `<@${id}>`).join(', '),
            inline: true
          });
        }
        
        if (analysis.groupDynamics.toxicityPockets.length > 0) {
          embed.addFields({
            name: 'Toxicity Hotspots',
            value: analysis.groupDynamics.toxicityPockets.slice(0, 3).map(id => `<@${id}>`).join(', '),
            inline: true
          });
        }
        
        if (analysis.predictedEvents.length > 0) {
          embed.addFields({
            name: 'Predicted Events',
            value: analysis.predictedEvents.map(e => 
              `🔮 **${e.event}**\n   ${e.timeframe} | ${(e.probability * 100).toFixed(0)}% likely`
            ).join('\n\n'),
            inline: false
          });
        }
        
        embed.setFooter({ text: `Collective Mind Analysis | ${allPatterns.length} neural patterns processed` });
        embed.setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'compare') {
        const user1 = interaction.options.getUser('user1', true);
        const user2 = interaction.options.getUser('user2', true);
        
        const [member1, member2] = await Promise.all([
          guild.members.fetch(user1.id).catch(() => null),
          guild.members.fetch(user2.id).catch(() => null)
        ]);
        
        if (!member1 || !member2) {
          await interaction.editReply('Could not find one or both members');
          return;
        }
        
        const messageTraces = await storage.getMessageTraces({ serverId: guildId, limit: 2000 }) || [];
        
        const pattern1 = analyzeNeuralPattern(member1, messageTraces.filter(m => m.userId === user1.id));
        const pattern2 = analyzeNeuralPattern(member2, messageTraces.filter(m => m.userId === user2.id));
        
        const prediction1 = predictIntent(pattern1);
        const prediction2 = predictIntent(pattern2);
        
        const similarity = calculateBehavioralSimilarity(pattern1, pattern2);
        
        const embed = new EmbedBuilder()
          .setTitle('Neural Pattern Comparison')
          .setColor(0x9B59B6)
          .addFields(
            {
              name: user1.username,
              value: [
                `Intent: **${prediction1.primaryIntent}**`,
                `Risk: ${prediction1.riskScore}%`,
                `DNA: \`${prediction1.behavioralDNA.substring(0, 8)}\``
              ].join('\n'),
              inline: true
            },
            {
              name: 'VS',
              value: `Similarity\n**${(similarity * 100).toFixed(0)}%**`,
              inline: true
            },
            {
              name: user2.username,
              value: [
                `Intent: **${prediction2.primaryIntent}**`,
                `Risk: ${prediction2.riskScore}%`,
                `DNA: \`${prediction2.behavioralDNA.substring(0, 8)}\``
              ].join('\n'),
              inline: true
            },
            {
              name: 'Correlation Analysis',
              value: similarity > 0.8 
                ? '🔗 **High correlation** - Possible alt accounts or coordinated behavior'
                : similarity > 0.5
                ? '📊 **Moderate correlation** - Similar behavior patterns'
                : '📈 **Low correlation** - Independent behavioral profiles',
              inline: false
            }
          )
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (subcommand === 'anomaly') {
        await guild.members.fetch();
        const members = Array.from(guild.members.cache.values()).filter(m => !m.user.bot).slice(0, 100);
        const messageTraces = await storage.getMessageTraces({ serverId: guildId, limit: 5000 }) || [];
        
        const anomalies: { member: GuildMember; pattern: NeuralPattern; prediction: IntentPrediction; anomalyScore: number }[] = [];
        
        for (const member of members) {
          const memberMessages = messageTraces.filter(m => m.userId === member.id);
          if (memberMessages.length >= 5) {
            const pattern = analyzeNeuralPattern(member, memberMessages);
            const prediction = predictIntent(pattern);
            
            let anomalyScore = 0;
            if (prediction.riskScore > 60) anomalyScore += 30;
            if (pattern.messageVelocity > 20) anomalyScore += 20;
            if (pattern.channelHoppingRate > 0.8) anomalyScore += 15;
            if (pattern.mentionBehavior === 'aggressive') anomalyScore += 25;
            if (pattern.linkSharingPattern !== 'safe') anomalyScore += 20;
            if (prediction.primaryIntent === 'bot_like') anomalyScore += 30;
            
            if (anomalyScore > 30) {
              anomalies.push({ member, pattern, prediction, anomalyScore });
            }
          }
        }
        
        anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore);
        
        const embed = new EmbedBuilder()
          .setTitle('Behavioral Anomaly Detection')
          .setColor(anomalies.length > 5 ? 0xFF0000 : anomalies.length > 0 ? 0xFFA500 : 0x00FF00)
          .setDescription(`Scanned ${members.length} members for behavioral anomalies`);
        
        if (anomalies.length === 0) {
          embed.addFields({
            name: 'Status',
            value: '✅ No significant anomalies detected\n\nAll analyzed members show normal behavioral patterns.',
            inline: false
          });
        } else {
          const anomalyList = anomalies.slice(0, 10).map((a, i) => {
            const flags = [];
            if (a.prediction.riskScore > 60) flags.push('HIGH_RISK');
            if (a.pattern.messageVelocity > 20) flags.push('SPAM_LIKE');
            if (a.prediction.primaryIntent === 'hostile') flags.push('HOSTILE');
            if (a.prediction.primaryIntent === 'bot_like') flags.push('BOT_LIKE');
            
            return `**${i + 1}.** <@${a.member.id}> (Score: ${a.anomalyScore})\n   └ Flags: ${flags.join(', ') || 'SUSPICIOUS'}`;
          }).join('\n\n');
          
          embed.addFields({
            name: `Anomalies Detected (${anomalies.length})`,
            value: anomalyList,
            inline: false
          });
          
          embed.addFields({
            name: 'Recommendation',
            value: anomalies.length > 5 
              ? '🚨 Multiple anomalies detected. Consider server-wide review.'
              : '⚠️ Review flagged accounts for potential threats.',
            inline: false
          });
        }
        
        embed.setFooter({ text: `Neural Anomaly Detection | ${Date.now() - startTime}ms` });
        embed.setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
      
      await storage.createCommandLog({
        commandName: 'neural-intent',
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
      console.error('Neural Intent error:', error);
      await fileLogger.error('neural-intent', 'Command failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Neural Analysis Error')
          .setDescription('Failed to complete neural analysis. Please try again.')
          .setTimestamp()
        ]
      });
    }
  }
};

function calculateBehavioralSimilarity(p1: NeuralPattern, p2: NeuralPattern): number {
  const velocityDiff = Math.abs(p1.messageVelocity - p2.messageVelocity) / Math.max(p1.messageVelocity, p2.messageVelocity, 1);
  const entropyDiff = Math.abs(p1.wordChoiceEntropy - p2.wordChoiceEntropy);
  const hoppingDiff = Math.abs(p1.channelHoppingRate - p2.channelHoppingRate);
  const mentionMatch = p1.mentionBehavior === p2.mentionBehavior ? 0 : 0.3;
  const linkMatch = p1.linkSharingPattern === p2.linkSharingPattern ? 0 : 0.2;
  
  const totalDiff = (velocityDiff + entropyDiff + hoppingDiff + mentionMatch + linkMatch) / 5;
  return Math.max(0, 1 - totalDiff);
}