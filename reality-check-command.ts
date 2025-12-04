import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, Message, TextChannel } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface ContentAnalysis {
  messageId: string;
  channelId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  timestamp: Date;
  analysis: {
    aiProbability: number;
    syntheticScore: number;
    humanScore: number;
    confidence: number;
    indicators: string[];
    verdict: 'human' | 'ai_generated' | 'mixed' | 'uncertain';
  };
}

interface DriftMetrics {
  channelId: string;
  timeframe: string;
  totalMessages: number;
  aiGeneratedCount: number;
  humanCount: number;
  mixedCount: number;
  avgAiProbability: number;
  driftTrend: 'increasing' | 'stable' | 'decreasing';
  lastUpdated: Date;
}

interface RealityCheckConfig {
  serverId: string;
  enabled: boolean;
  sensitivity: 'low' | 'medium' | 'high' | 'paranoid';
  autoFlag: boolean;
  alertChannel?: string;
  analysisHistory: ContentAnalysis[];
  driftMetrics: Map<string, DriftMetrics>;
  settings: {
    scanDepth: number;
    minMessageLength: number;
    checkFrequency: 'realtime' | 'hourly' | 'daily';
    alertThreshold: number;
  };
}

const realityConfigs = new Map<string, RealityCheckConfig>();

function analyzeForAI(content: string): ContentAnalysis['analysis'] {
  const indicators: string[] = [];
  let aiScore = 0;

  const aiPatterns = [
    { pattern: /I'd be happy to|I cannot|As an AI/i, score: 30, indicator: 'AI disclosure phrase' },
    { pattern: /It's important to note|It's worth mentioning/i, score: 15, indicator: 'AI hedging language' },
    { pattern: /In conclusion|To summarize|Overall/i, score: 10, indicator: 'Structured summary' },
    { pattern: /However, it's|Nevertheless, |Furthermore, /i, score: 10, indicator: 'Formal transitions' },
    { pattern: /\b(comprehensive|facilitate|leverage|utilize|implement)\b/gi, score: 8, indicator: 'Corporate jargon' },
    { pattern: /Based on my (knowledge|training|understanding)/i, score: 25, indicator: 'AI knowledge reference' },
    { pattern: /I hope this helps|Let me know if|Feel free to/i, score: 12, indicator: 'AI closing phrase' },
    { pattern: /\d+\. \w+.*\n\d+\. \w+/m, score: 15, indicator: 'Numbered list format' },
    { pattern: /\*\*[^*]+\*\*/g, score: 8, indicator: 'Markdown formatting' },
    { pattern: /Here are (some|a few|several)/i, score: 12, indicator: 'AI list introduction' }
  ];

  for (const { pattern, score, indicator } of aiPatterns) {
    if (pattern.test(content)) {
      aiScore += score;
      indicators.push(indicator);
    }
  }

  const humanPatterns = [
    { pattern: /lol|lmao|haha|bruh|ngl|tbh|imo/i, score: -20, indicator: 'Casual slang' },
    { pattern: /!{2,}|\?{2,}/g, score: -10, indicator: 'Emphatic punctuation' },
    { pattern: /[A-Z]{3,}/g, score: -8, indicator: 'Caps emphasis' },
    { pattern: /\b(gonna|wanna|gotta|kinda|sorta)\b/gi, score: -12, indicator: 'Contractions' },
    { pattern: /[:;][)DPp(]/g, score: -15, indicator: 'Text emoticons' },
    { pattern: /\b(fuck|shit|damn|hell)\b/gi, score: -10, indicator: 'Informal language' },
    { pattern: /\.\.\./g, score: -5, indicator: 'Trailing dots' },
    { pattern: /\bi\b/g, score: -3, indicator: 'Lowercase I (informal)' }
  ];

  for (const { pattern, score, indicator } of humanPatterns) {
    if (pattern.test(content)) {
      aiScore += score;
      if (score < 0) indicators.push(`Human: ${indicator}`);
    }
  }

  const avgSentenceLength = content.split(/[.!?]+/).map(s => s.trim().split(' ').length).filter(l => l > 0);
  const avgLen = avgSentenceLength.reduce((a, b) => a + b, 0) / avgSentenceLength.length || 0;
  
  if (avgLen > 20 && avgLen < 30) {
    aiScore += 10;
    indicators.push('Optimal sentence length (AI typical)');
  } else if (avgLen < 10) {
    aiScore -= 10;
    indicators.push('Human: Short sentences');
  }

  const uniqueWords = new Set(content.toLowerCase().split(/\s+/));
  const vocabularyDiversity = uniqueWords.size / content.split(/\s+/).length;
  
  if (vocabularyDiversity > 0.7) {
    aiScore += 8;
    indicators.push('High vocabulary diversity');
  }

  aiScore = Math.max(0, Math.min(100, aiScore + 30));

  const confidence = Math.min(95, 50 + Math.abs(aiScore - 50) * 0.8);
  
  let verdict: ContentAnalysis['analysis']['verdict'];
  if (aiScore >= 70) verdict = 'ai_generated';
  else if (aiScore <= 30) verdict = 'human';
  else if (aiScore >= 40 && aiScore <= 60) verdict = 'mixed';
  else verdict = 'uncertain';

  return {
    aiProbability: aiScore,
    syntheticScore: aiScore,
    humanScore: 100 - aiScore,
    confidence,
    indicators,
    verdict
  };
}

export const realityCheckCommand = {
  data: new SlashCommandBuilder()
    .setName('reality-check')
    .setDescription('🔍 Detect AI-generated content and synthetic messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('audit')
        .setDescription('📋 Audit a specific message for AI generation')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('Message ID to audit')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel containing the message')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('scan')
        .setDescription('🔎 Scan channel for AI-generated content')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to scan')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('messages')
            .setDescription('Number of messages to scan (1-100)')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(false))
        .addStringOption(option =>
          option.setName('sensitivity')
            .setDescription('Detection sensitivity')
            .addChoices(
              { name: 'Low - Only obvious AI content', value: 'low' },
              { name: 'Medium - Balanced detection', value: 'medium' },
              { name: 'High - Strict detection', value: 'high' },
              { name: 'Paranoid - Maximum sensitivity', value: 'paranoid' }
            )
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('report')
        .setDescription('📊 Generate AI content drift report')
        .addStringOption(option =>
          option.setName('scope')
            .setDescription('Report scope')
            .addChoices(
              { name: 'Server Overview', value: 'server' },
              { name: 'Per Channel', value: 'channel' },
              { name: 'User Analysis', value: 'user' },
              { name: 'Trend Analysis', value: 'trend' }
            )
            .setRequired(false))
        .addStringOption(option =>
          option.setName('timeframe')
            .setDescription('Analysis timeframe')
            .addChoices(
              { name: 'Last 24 Hours', value: '24h' },
              { name: 'Last 7 Days', value: '7d' },
              { name: 'Last 30 Days', value: '30d' }
            )
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('settings')
        .setDescription('⚙️ Configure reality check settings')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable/disable reality check')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('auto_flag')
            .setDescription('Automatically flag AI content')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('alert_threshold')
            .setDescription('AI probability threshold for alerts (50-95)')
            .setMinValue(50)
            .setMaxValue(95)
            .setRequired(false))
        .addChannelOption(option =>
          option.setName('alert_channel')
            .setDescription('Channel for AI detection alerts')
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
      await fileLogger.command('reality-check', `Executing ${subcommand} subcommand`, {
        userId: interaction.user.id,
        guildId: guild.id,
        subcommand
      });

      let config = realityConfigs.get(guild.id);
      if (!config) {
        config = {
          serverId: guild.id,
          enabled: true,
          sensitivity: 'medium',
          autoFlag: false,
          analysisHistory: [],
          driftMetrics: new Map(),
          settings: {
            scanDepth: 50,
            minMessageLength: 50,
            checkFrequency: 'hourly',
            alertThreshold: 70
          }
        };
        realityConfigs.set(guild.id, config);
      }

      if (subcommand === 'audit') {
        const messageId = interaction.options.getString('message_id', true);
        const channel = interaction.options.getChannel('channel', true);

        const textChannel = guild.channels.cache.get(channel.id) as TextChannel;
        if (!textChannel || textChannel.type !== 0) {
          await interaction.editReply('❌ Invalid text channel');
          return;
        }

        let message: Message;
        try {
          message = await textChannel.messages.fetch(messageId);
        } catch {
          await interaction.editReply('❌ Message not found');
          return;
        }

        if (message.content.length < 20) {
          await interaction.editReply('⚠️ Message too short for meaningful analysis (minimum 20 characters)');
          return;
        }

        const analysis = analyzeForAI(message.content);

        const contentAnalysis: ContentAnalysis = {
          messageId: message.id,
          channelId: channel.id,
          authorId: message.author.id,
          authorUsername: message.author.username,
          content: message.content.substring(0, 500),
          timestamp: new Date(),
          analysis
        };

        config.analysisHistory.push(contentAnalysis);

        const verdictConfig = {
          human: { color: 0x00FF00, icon: '✅', label: 'HUMAN WRITTEN' },
          ai_generated: { color: 0xFF0000, icon: '🤖', label: 'AI GENERATED' },
          mixed: { color: 0xFFAA00, icon: '🔀', label: 'MIXED CONTENT' },
          uncertain: { color: 0x888888, icon: '❓', label: 'UNCERTAIN' }
        }[analysis.verdict];

        const embed = new EmbedBuilder()
          .setColor(verdictConfig.color)
          .setTitle(`${verdictConfig.icon} REALITY CHECK AUDIT`)
          .setDescription(`**Verdict:** ${verdictConfig.label}\n**Confidence:** ${analysis.confidence.toFixed(1)}%`)
          .addFields(
            {
              name: '📊 Analysis Scores',
              value: [
                `**AI Probability:** ${analysis.aiProbability.toFixed(1)}%`,
                `**Human Score:** ${analysis.humanScore.toFixed(1)}%`,
                `**Synthetic Index:** ${analysis.syntheticScore.toFixed(1)}%`
              ].join('\n'),
              inline: true
            },
            {
              name: '👤 Message Info',
              value: [
                `**Author:** ${message.author.username}`,
                `**Channel:** <#${channel.id}>`,
                `**Length:** ${message.content.length} chars`
              ].join('\n'),
              inline: true
            }
          );

        if (analysis.indicators.length > 0) {
          embed.addFields({
            name: '🔍 Detection Indicators',
            value: analysis.indicators.slice(0, 8).map(i => `• ${i}`).join('\n'),
            inline: false
          });
        }

        embed.addFields({
          name: '📝 Message Preview',
          value: `\`\`\`${message.content.substring(0, 300)}${message.content.length > 300 ? '...' : ''}\`\`\``,
          inline: false
        })
        .setFooter({ text: `Reality Check v2.0 | Message ID: ${message.id}` })
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.security('reality-check', 'Message audited', {
          messageId,
          channelId: channel.id,
          verdict: analysis.verdict,
          aiProbability: analysis.aiProbability
        });

      } else if (subcommand === 'scan') {
        const channel = interaction.options.getChannel('channel', true);
        const messageCount = interaction.options.getInteger('messages') || 50;
        const sensitivity = interaction.options.getString('sensitivity') || 'medium';

        const textChannel = guild.channels.cache.get(channel.id) as TextChannel;
        if (!textChannel || textChannel.type !== 0) {
          await interaction.editReply('❌ Invalid text channel');
          return;
        }

        const messages = await textChannel.messages.fetch({ limit: messageCount });
        const validMessages = Array.from(messages.values())
          .filter(m => !m.author.bot && m.content.length >= 20);

        if (validMessages.length === 0) {
          await interaction.editReply('⚠️ No valid messages found for analysis');
          return;
        }

        const sensitivityThreshold = {
          low: 80,
          medium: 65,
          high: 50,
          paranoid: 35
        }[sensitivity];

        const results: ContentAnalysis[] = [];
        let aiCount = 0;
        let humanCount = 0;
        let mixedCount = 0;

        for (const message of validMessages) {
          const analysis = analyzeForAI(message.content);
          
          const contentAnalysis: ContentAnalysis = {
            messageId: message.id,
            channelId: channel.id,
            authorId: message.author.id,
            authorUsername: message.author.username,
            content: message.content.substring(0, 200),
            timestamp: new Date(),
            analysis
          };

          results.push(contentAnalysis);
          
          if (analysis.aiProbability >= sensitivityThreshold) aiCount++;
          else if (analysis.aiProbability <= 100 - sensitivityThreshold) humanCount++;
          else mixedCount++;
        }

        config.analysisHistory.push(...results);

        const avgAiProbability = results.reduce((sum, r) => sum + r.analysis.aiProbability, 0) / results.length;
        const aiPercentage = (aiCount / validMessages.length * 100).toFixed(1);

        const driftStatus = avgAiProbability > 60 ? '🔴 HIGH AI DRIFT' :
                           avgAiProbability > 40 ? '🟡 MODERATE' : '🟢 AUTHENTIC';

        const embed = new EmbedBuilder()
          .setColor(avgAiProbability > 60 ? 0xFF0000 : avgAiProbability > 40 ? 0xFFAA00 : 0x00FF00)
          .setTitle('🔎 CHANNEL SCAN COMPLETE')
          .setDescription(`**Channel:** <#${channel.id}>\n**Status:** ${driftStatus}\n**Sensitivity:** ${sensitivity.toUpperCase()}`)
          .addFields(
            {
              name: '📊 Scan Results',
              value: [
                `**Messages Analyzed:** ${validMessages.length}`,
                `**AI Generated:** ${aiCount} (${aiPercentage}%)`,
                `**Human Written:** ${humanCount}`,
                `**Mixed/Uncertain:** ${mixedCount}`
              ].join('\n'),
              inline: true
            },
            {
              name: '📈 AI Metrics',
              value: [
                `**Avg AI Probability:** ${avgAiProbability.toFixed(1)}%`,
                `**Detection Threshold:** ${sensitivityThreshold}%`,
                `**Confidence:** ${(results.reduce((s, r) => s + r.analysis.confidence, 0) / results.length).toFixed(1)}%`
              ].join('\n'),
              inline: true
            }
          );

        const topAiMessages = results
          .filter(r => r.analysis.aiProbability >= sensitivityThreshold)
          .sort((a, b) => b.analysis.aiProbability - a.analysis.aiProbability)
          .slice(0, 5);

        if (topAiMessages.length > 0) {
          embed.addFields({
            name: '🤖 Top AI-Detected Messages',
            value: topAiMessages.map(m => 
              `**${m.authorUsername}** - ${m.analysis.aiProbability.toFixed(0)}% AI\n└ "${m.content.substring(0, 50)}..."`
            ).join('\n\n'),
            inline: false
          });
        }

        embed.addFields({
          name: '💡 Analysis',
          value: avgAiProbability > 60
            ? '⚠️ High AI content detected. Consider reviewing user activity.'
            : avgAiProbability > 40
            ? '📌 Moderate AI content. Channel has mixed authenticity.'
            : '✅ Channel content appears predominantly human-written.',
          inline: false
        })
        .setFooter({ text: `Reality Check Scan | ${validMessages.length} messages analyzed in ${Date.now() - startTime}ms` })
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.security('reality-check', 'Channel scan completed', {
          channelId: channel.id,
          messagesScanned: validMessages.length,
          aiCount,
          avgAiProbability
        });

      } else if (subcommand === 'report') {
        const scope = interaction.options.getString('scope') || 'server';
        const timeframe = interaction.options.getString('timeframe') || '7d';

        const timeframeMs = {
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000
        }[timeframe];

        const cutoff = new Date(Date.now() - timeframeMs);
        const relevantHistory = config.analysisHistory.filter(a => a.timestamp > cutoff);

        if (relevantHistory.length === 0) {
          const embed = new EmbedBuilder()
            .setColor(0x888888)
            .setTitle('📊 AI CONTENT DRIFT REPORT')
            .setDescription('**No data available for the selected timeframe**\n\nRun `/reality-check scan` on channels to collect data.')
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        const avgAiProbability = relevantHistory.reduce((sum, r) => sum + r.analysis.aiProbability, 0) / relevantHistory.length;
        const aiCount = relevantHistory.filter(r => r.analysis.verdict === 'ai_generated').length;
        const humanCount = relevantHistory.filter(r => r.analysis.verdict === 'human').length;

        const channelBreakdown = new Map<string, { total: number; ai: number }>();
        const userBreakdown = new Map<string, { total: number; aiAvg: number }>();

        for (const analysis of relevantHistory) {
          const channelData = channelBreakdown.get(analysis.channelId) || { total: 0, ai: 0 };
          channelData.total++;
          if (analysis.analysis.verdict === 'ai_generated') channelData.ai++;
          channelBreakdown.set(analysis.channelId, channelData);

          const userData = userBreakdown.get(analysis.authorId) || { total: 0, aiAvg: 0 };
          userData.total++;
          userData.aiAvg = (userData.aiAvg * (userData.total - 1) + analysis.analysis.aiProbability) / userData.total;
          userBreakdown.set(analysis.authorId, userData);
        }

        const driftTrend = avgAiProbability > 50 ? '📈 INCREASING' : avgAiProbability > 30 ? '➡️ STABLE' : '📉 LOW';

        const embed = new EmbedBuilder()
          .setColor(avgAiProbability > 50 ? 0xFF0000 : avgAiProbability > 30 ? 0xFFAA00 : 0x00FF00)
          .setTitle('📊 AI CONTENT DRIFT REPORT')
          .setDescription(`**Scope:** ${scope.toUpperCase()}\n**Period:** ${timeframe === '24h' ? 'Last 24 Hours' : timeframe === '7d' ? 'Last 7 Days' : 'Last 30 Days'}\n**Drift Trend:** ${driftTrend}`)
          .addFields(
            {
              name: '📈 Overall Metrics',
              value: [
                `**Messages Analyzed:** ${relevantHistory.length}`,
                `**Avg AI Probability:** ${avgAiProbability.toFixed(1)}%`,
                `**AI Generated:** ${aiCount} (${(aiCount / relevantHistory.length * 100).toFixed(1)}%)`,
                `**Human Written:** ${humanCount}`
              ].join('\n'),
              inline: true
            },
            {
              name: '📊 Distribution',
              value: [
                `**Channels Scanned:** ${channelBreakdown.size}`,
                `**Users Analyzed:** ${userBreakdown.size}`,
                `**Confidence Avg:** ${(relevantHistory.reduce((s, r) => s + r.analysis.confidence, 0) / relevantHistory.length).toFixed(1)}%`
              ].join('\n'),
              inline: true
            }
          );

        if (scope === 'channel' || scope === 'server') {
          const topChannels = Array.from(channelBreakdown.entries())
            .sort(([, a], [, b]) => (b.ai / b.total) - (a.ai / a.total))
            .slice(0, 5);

          if (topChannels.length > 0) {
            embed.addFields({
              name: '📺 Channel Breakdown',
              value: topChannels.map(([id, data]) => 
                `<#${id}> - ${(data.ai / data.total * 100).toFixed(1)}% AI (${data.total} msgs)`
              ).join('\n'),
              inline: false
            });
          }
        }

        if (scope === 'user' || scope === 'server') {
          const topUsers = Array.from(userBreakdown.entries())
            .filter(([, data]) => data.total >= 3)
            .sort(([, a], [, b]) => b.aiAvg - a.aiAvg)
            .slice(0, 5);

          if (topUsers.length > 0) {
            embed.addFields({
              name: '👤 User Analysis',
              value: topUsers.map(([id, data]) => 
                `<@${id}> - ${data.aiAvg.toFixed(1)}% avg AI (${data.total} msgs)`
              ).join('\n'),
              inline: false
            });
          }
        }

        embed.addFields({
          name: '💡 Recommendations',
          value: avgAiProbability > 60
            ? '🔴 **HIGH DRIFT:** Consider stricter content policies\n🔴 Review flagged users for potential bot activity'
            : avgAiProbability > 40
            ? '🟡 **MODERATE:** Monitor trending channels\n🟡 Consider periodic authenticity audits'
            : '🟢 **HEALTHY:** Content appears predominantly authentic\n🟢 Maintain current monitoring',
          inline: false
        })
        .setFooter({ text: `Reality Check Report | Generated ${new Date().toLocaleDateString()}` })
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'settings') {
        const enabled = interaction.options.getBoolean('enabled');
        const autoFlag = interaction.options.getBoolean('auto_flag');
        const alertThreshold = interaction.options.getInteger('alert_threshold');
        const alertChannel = interaction.options.getChannel('alert_channel');

        if (enabled !== null) config.enabled = enabled;
        if (autoFlag !== null) config.autoFlag = autoFlag;
        if (alertThreshold !== null) config.settings.alertThreshold = alertThreshold;
        if (alertChannel) config.alertChannel = alertChannel.id;

        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('⚙️ REALITY CHECK SETTINGS')
          .setDescription('**Configuration Updated**')
          .addFields(
            {
              name: '🔧 Core Settings',
              value: [
                `**Enabled:** ${config.enabled ? '✅ Yes' : '❌ No'}`,
                `**Sensitivity:** ${config.sensitivity.toUpperCase()}`,
                `**Auto-Flag:** ${config.autoFlag ? '✅ Yes' : '❌ No'}`,
                `**Alert Threshold:** ${config.settings.alertThreshold}%`
              ].join('\n'),
              inline: true
            },
            {
              name: '📊 Analysis Settings',
              value: [
                `**Scan Depth:** ${config.settings.scanDepth} messages`,
                `**Min Length:** ${config.settings.minMessageLength} chars`,
                `**Check Frequency:** ${config.settings.checkFrequency}`,
                `**Alert Channel:** ${config.alertChannel ? `<#${config.alertChannel}>` : 'Not set'}`
              ].join('\n'),
              inline: true
            },
            {
              name: '📈 Statistics',
              value: [
                `**Total Analyses:** ${config.analysisHistory.length}`,
                `**Channels Tracked:** ${config.driftMetrics.size}`,
                `**Last Analysis:** ${config.analysisHistory.length > 0 ? `<t:${Math.floor(config.analysisHistory[config.analysisHistory.length - 1].timestamp.getTime() / 1000)}:R>` : 'Never'}`
              ].join('\n'),
              inline: false
            }
          )
          .setFooter({ text: `Reality Check v2.0 | Settings saved` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.command('reality-check', 'Settings updated', {
          enabled: config.enabled,
          autoFlag: config.autoFlag,
          alertThreshold: config.settings.alertThreshold
        });
      }

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'reality-check',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: true,
        parameters: { subcommand },
        result: `Subcommand: ${subcommand}`,
        duration,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Reality check error:', error);
      
      await fileLogger.error('reality-check', 'Command execution failed', {
        error: (error as Error).message,
        subcommand
      });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Reality Check Error')
        .setDescription(`Failed to execute command: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'reality-check',
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
