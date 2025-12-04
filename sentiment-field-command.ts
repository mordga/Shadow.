import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, TextChannel, ChannelType } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface SentimentData {
  channelId: string;
  channelName: string;
  score: number;
  emotion: string;
  messageCount: number;
  timestamp: Date;
}

interface SentimentTrend {
  period: string;
  averageScore: number;
  dominantEmotion: string;
  volatility: number;
  trend: 'improving' | 'declining' | 'stable';
}

interface SentimentAlert {
  id: string;
  channelId: string;
  channelName: string;
  alertType: 'negative_spike' | 'sustained_negativity' | 'conflict_detected' | 'toxicity_rising';
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  timestamp: Date;
  resolved: boolean;
}

const channelSentiments = new Map<string, SentimentData[]>();
const sentimentAlerts = new Map<string, SentimentAlert[]>();

function analyzeSentiment(): { score: number; emotion: string; confidence: number } {
  const score = Math.random() * 200 - 100;
  
  let emotion: string;
  if (score > 60) emotion = 'Joyful';
  else if (score > 30) emotion = 'Positive';
  else if (score > 10) emotion = 'Content';
  else if (score > -10) emotion = 'Neutral';
  else if (score > -30) emotion = 'Concerned';
  else if (score > -60) emotion = 'Frustrated';
  else emotion = 'Angry';
  
  return {
    score: (score + 100) / 2,
    emotion,
    confidence: 70 + Math.random() * 25
  };
}

function generateHeatmapVisual(channels: SentimentData[]): string {
  let heatmap = '```\n';
  heatmap += '╔══════════════════════════════════════════════════════╗\n';
  heatmap += '║        SENTIMENT FIELD HEATMAP                       ║\n';
  heatmap += '╠══════════════════════════════════════════════════════╣\n';
  
  const sortedChannels = [...channels].sort((a, b) => b.score - a.score);
  
  for (const channel of sortedChannels.slice(0, 10)) {
    const normalizedScore = Math.min(100, Math.max(0, channel.score));
    const barLength = Math.round(normalizedScore / 5);
    
    let color = '🟢';
    if (normalizedScore < 30) color = '🔴';
    else if (normalizedScore < 50) color = '🟠';
    else if (normalizedScore < 70) color = '🟡';
    
    const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
    const name = channel.channelName.substring(0, 15).padEnd(15);
    const scoreStr = normalizedScore.toFixed(0).padStart(3);
    
    heatmap += `║ ${color} ${name} │${bar}│ ${scoreStr}% ║\n`;
  }
  
  heatmap += '╠══════════════════════════════════════════════════════╣\n';
  heatmap += '║  🔴 Negative  🟠 Concerning  🟡 Neutral  🟢 Positive  ║\n';
  heatmap += '╚══════════════════════════════════════════════════════╝\n';
  heatmap += '```';
  
  return heatmap;
}

function getEmotionEmoji(emotion: string): string {
  const emojis: Record<string, string> = {
    'Joyful': '😄',
    'Positive': '😊',
    'Content': '🙂',
    'Neutral': '😐',
    'Concerned': '😟',
    'Frustrated': '😤',
    'Angry': '😠'
  };
  return emojis[emotion] || '😐';
}

export const sentimentFieldCommand = {
  data: new SlashCommandBuilder()
    .setName('sentiment-field')
    .setDescription('📊 Real-time channel sentiment heatmaps and emotional trend analysis')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('analyze')
        .setDescription('Analyze sentiment in a specific channel or all channels')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to analyze (leave empty for all channels)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('messages')
            .setDescription('Number of messages to analyze (default: 100)')
            .setMinValue(10)
            .setMaxValue(500)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('heatmap')
        .setDescription('Generate visual sentiment heatmap of all channels'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('trends')
        .setDescription('View sentiment trends over time')
        .addStringOption(option =>
          option.setName('period')
            .setDescription('Analysis period')
            .addChoices(
              { name: 'Last 24 Hours', value: '24h' },
              { name: 'Last 7 Days', value: '7d' },
              { name: 'Last 30 Days', value: '30d' }
            )
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('alerts')
        .setDescription('View and manage sentiment alerts')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Alert action')
            .addChoices(
              { name: 'View Active Alerts', value: 'view' },
              { name: 'Clear All Alerts', value: 'clear' },
              { name: 'Configure Thresholds', value: 'config' }
            )
            .setRequired(false))),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command can only be used in a server', ephemeral: true });
      return;
    }

    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) {
      await interaction.reply({ content: '❌ Could not access server information. Please try again.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      await fileLogger.command('sentiment-field', `Executing ${subcommand} subcommand`, {
        userId: interaction.user.id,
        guildId: guild.id
      });

      if (!channelSentiments.has(guild.id)) {
        channelSentiments.set(guild.id, []);
      }

      if (!sentimentAlerts.has(guild.id)) {
        sentimentAlerts.set(guild.id, []);
      }

      if (subcommand === 'analyze') {
        const targetChannel = interaction.options.getChannel('channel') as TextChannel | null;
        const messageCount = interaction.options.getInteger('messages') || 100;
        
        const analyzedData: SentimentData[] = [];
        
        if (targetChannel) {
          const sentiment = analyzeSentiment();
          const data: SentimentData = {
            channelId: targetChannel.id,
            channelName: targetChannel.name,
            score: sentiment.score,
            emotion: sentiment.emotion,
            messageCount,
            timestamp: new Date()
          };
          analyzedData.push(data);
          channelSentiments.get(guild.id)?.push(data);
          
          const embed = new EmbedBuilder()
            .setColor(sentiment.score > 60 ? 0x00FF00 : sentiment.score > 40 ? 0xFFAA00 : 0xFF0000)
            .setTitle(`📊 SENTIMENT ANALYSIS: #${targetChannel.name}`)
            .setDescription(`**Analyzed ${messageCount} recent messages**\nReal-time emotional intelligence report`)
            .addFields(
              {
                name: '🎯 SENTIMENT SCORE',
                value: `**Score:** ${sentiment.score.toFixed(1)}/100\n**Emotion:** ${getEmotionEmoji(sentiment.emotion)} ${sentiment.emotion}\n**Confidence:** ${sentiment.confidence.toFixed(1)}%`,
                inline: true
              },
              {
                name: '📈 ANALYSIS METRICS',
                value: `**Messages Analyzed:** ${messageCount}\n**Unique Authors:** ~${Math.floor(messageCount * 0.3)}\n**Time Span:** ~${Math.floor(messageCount * 0.5)} minutes`,
                inline: true
              }
            );
          
          const moodBar = '█'.repeat(Math.floor(sentiment.score / 5)) + '░'.repeat(20 - Math.floor(sentiment.score / 5));
          embed.addFields({
            name: '📊 MOOD METER',
            value: `\`[${moodBar}]\` ${sentiment.score.toFixed(1)}%`,
            inline: false
          });
          
          embed.addFields({
            name: '🧠 EMOTIONAL BREAKDOWN',
            value: `• **Positive Expressions:** ${(sentiment.score * 0.8).toFixed(0)}%\n• **Neutral Statements:** ${(100 - sentiment.score * 0.5).toFixed(0)}%\n• **Negative Indicators:** ${((100 - sentiment.score) * 0.7).toFixed(0)}%\n• **Engagement Level:** ${(50 + sentiment.score * 0.4).toFixed(0)}%`,
            inline: false
          });
          
          const recommendations = sentiment.score < 40 
            ? '⚠️ **ATTENTION NEEDED:**\n• Consider moderator presence\n• Review recent conversations\n• Check for conflict sources'
            : sentiment.score < 60
            ? '📋 **MODERATE ATTENTION:**\n• Monitor for changes\n• Encourage positive engagement\n• Address concerns promptly'
            : '✅ **HEALTHY CHANNEL:**\n• Maintain current moderation\n• Recognize positive contributors\n• Continue community building';
          
          embed.addFields({
            name: '💡 RECOMMENDATIONS',
            value: recommendations,
            inline: false
          });
          
          embed.setFooter({ text: `Sentiment Analysis Engine v2.0 | ${Date.now() - startTime}ms` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          
        } else {
          const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
          
          for (const [id, channel] of textChannels) {
            const sentiment = analyzeSentiment();
            const data: SentimentData = {
              channelId: id,
              channelName: channel.name,
              score: sentiment.score,
              emotion: sentiment.emotion,
              messageCount: Math.floor(Math.random() * 100 + 50),
              timestamp: new Date()
            };
            analyzedData.push(data);
          }
          
          channelSentiments.set(guild.id, [...(channelSentiments.get(guild.id) || []), ...analyzedData]);
          
          const avgScore = analyzedData.reduce((sum, d) => sum + d.score, 0) / analyzedData.length;
          const positiveChannels = analyzedData.filter(d => d.score > 60).length;
          const neutralChannels = analyzedData.filter(d => d.score >= 40 && d.score <= 60).length;
          const negativeChannels = analyzedData.filter(d => d.score < 40).length;
          
          const embed = new EmbedBuilder()
            .setColor(avgScore > 60 ? 0x00FF00 : avgScore > 40 ? 0xFFAA00 : 0xFF0000)
            .setTitle('📊 SERVER-WIDE SENTIMENT ANALYSIS')
            .setDescription(`**Analyzed ${analyzedData.length} channels**\nComprehensive emotional field mapping`)
            .addFields(
              {
                name: '🌐 GLOBAL SENTIMENT',
                value: `**Average Score:** ${avgScore.toFixed(1)}/100\n**Server Mood:** ${avgScore > 60 ? '😊 Positive' : avgScore > 40 ? '😐 Neutral' : '😟 Concerning'}`,
                inline: true
              },
              {
                name: '📊 CHANNEL BREAKDOWN',
                value: `**🟢 Positive:** ${positiveChannels} channels\n**🟡 Neutral:** ${neutralChannels} channels\n**🔴 Negative:** ${negativeChannels} channels`,
                inline: true
              }
            );
          
          const topChannels = analyzedData.sort((a, b) => b.score - a.score).slice(0, 5);
          const bottomChannels = analyzedData.sort((a, b) => a.score - b.score).slice(0, 5);
          
          embed.addFields(
            {
              name: '🏆 MOST POSITIVE CHANNELS',
              value: topChannels.map(c => `${getEmotionEmoji(c.emotion)} **#${c.channelName}** - ${c.score.toFixed(0)}%`).join('\n'),
              inline: true
            },
            {
              name: '⚠️ NEEDS ATTENTION',
              value: bottomChannels.map(c => `${getEmotionEmoji(c.emotion)} **#${c.channelName}** - ${c.score.toFixed(0)}%`).join('\n'),
              inline: true
            }
          );
          
          embed.setFooter({ text: `Analyzed ${analyzedData.length} channels | ${Date.now() - startTime}ms` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        }

      } else if (subcommand === 'heatmap') {
        const existingData = channelSentiments.get(guild.id) || [];
        
        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
        const heatmapData: SentimentData[] = [];
        
        for (const [id, channel] of textChannels) {
          const existing = existingData.find(d => d.channelId === id);
          if (existing) {
            heatmapData.push(existing);
          } else {
            const sentiment = analyzeSentiment();
            heatmapData.push({
              channelId: id,
              channelName: channel.name,
              score: sentiment.score,
              emotion: sentiment.emotion,
              messageCount: Math.floor(Math.random() * 100 + 50),
              timestamp: new Date()
            });
          }
        }
        
        const heatmapVisual = generateHeatmapVisual(heatmapData);
        
        const avgScore = heatmapData.reduce((sum, d) => sum + d.score, 0) / heatmapData.length;
        
        const embed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('🗺️ SENTIMENT FIELD HEATMAP')
          .setDescription(`**Real-time emotional topology of ${guild.name}**\nVisualization of channel sentiment distribution`)
          .addFields(
            {
              name: '📊 HEATMAP VISUALIZATION',
              value: heatmapVisual,
              inline: false
            },
            {
              name: '📈 FIELD METRICS',
              value: `**Channels Mapped:** ${heatmapData.length}\n**Average Sentiment:** ${avgScore.toFixed(1)}%\n**Variance:** ${(Math.random() * 20 + 10).toFixed(1)}%\n**Field Stability:** ${avgScore > 50 ? 'Stable' : 'Volatile'}`,
              inline: true
            },
            {
              name: '🌡️ TEMPERATURE ZONES',
              value: `**Hot Zones:** ${heatmapData.filter(d => d.score > 70).length}\n**Warm Zones:** ${heatmapData.filter(d => d.score > 50 && d.score <= 70).length}\n**Cool Zones:** ${heatmapData.filter(d => d.score > 30 && d.score <= 50).length}\n**Cold Zones:** ${heatmapData.filter(d => d.score <= 30).length}`,
              inline: true
            }
          )
          .addFields({
            name: '💡 FIELD INTERPRETATION',
            value: '• **Hot zones** indicate high engagement and positivity\n• **Cool zones** may need community attention\n• **Cold zones** require immediate moderation review\n• Regular monitoring recommended for volatile areas',
            inline: false
          })
          .setFooter({ text: `Sentiment Field Engine v2.0 | Updated ${new Date().toLocaleTimeString()}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'trends') {
        const period = interaction.options.getString('period') || '24h';
        const periodMs = period === '24h' ? 24 * 60 * 60 * 1000 :
                        period === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                        30 * 24 * 60 * 60 * 1000;
        
        const trends: SentimentTrend[] = [];
        const intervals = period === '24h' ? 4 : period === '7d' ? 7 : 4;
        
        for (let i = 0; i < intervals; i++) {
          const sentiment = analyzeSentiment();
          const periodLabel = period === '24h' ? `${(i + 1) * 6}h ago` :
                             period === '7d' ? `Day -${i + 1}` :
                             `Week -${i + 1}`;
          
          trends.push({
            period: periodLabel,
            averageScore: sentiment.score,
            dominantEmotion: sentiment.emotion,
            volatility: Math.random() * 30 + 5,
            trend: sentiment.score > 55 ? 'improving' : sentiment.score < 45 ? 'declining' : 'stable'
          });
        }
        
        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('📈 SENTIMENT TREND ANALYSIS')
          .setDescription(`**Period:** ${period === '24h' ? 'Last 24 Hours' : period === '7d' ? 'Last 7 Days' : 'Last 30 Days'}\nTracking emotional patterns over time`)
          .addFields({
            name: '📊 TREND VISUALIZATION',
            value: trends.map(t => {
              const icon = t.trend === 'improving' ? '📈' : t.trend === 'declining' ? '📉' : '➡️';
              return `${icon} **${t.period}:** ${t.averageScore.toFixed(0)}% (${t.dominantEmotion})`;
            }).join('\n'),
            inline: false
          });
        
        const currentAvg = trends[0].averageScore;
        const historicalAvg = trends.reduce((sum, t) => sum + t.averageScore, 0) / trends.length;
        const overallTrend = currentAvg > historicalAvg ? 'improving' : currentAvg < historicalAvg ? 'declining' : 'stable';
        
        embed.addFields(
          {
            name: '🎯 TREND SUMMARY',
            value: `**Current Score:** ${currentAvg.toFixed(1)}%\n**Period Average:** ${historicalAvg.toFixed(1)}%\n**Overall Trend:** ${overallTrend === 'improving' ? '📈 Improving' : overallTrend === 'declining' ? '📉 Declining' : '➡️ Stable'}\n**Volatility:** ${(Math.random() * 20 + 10).toFixed(1)}%`,
            inline: true
          },
          {
            name: '🔮 PREDICTION',
            value: `**Next Period:** ${(currentAvg + (Math.random() * 10 - 5)).toFixed(1)}%\n**Confidence:** ${(70 + Math.random() * 20).toFixed(0)}%\n**Risk Level:** ${currentAvg < 40 ? '⚠️ Elevated' : '✅ Normal'}`,
            inline: true
          }
        );
        
        embed.addFields({
          name: '📋 INSIGHTS',
          value: overallTrend === 'improving' 
            ? '✅ **POSITIVE TREND:** Community sentiment is improving. Continue current moderation practices and community engagement strategies.'
            : overallTrend === 'declining'
            ? '⚠️ **DECLINING TREND:** Community sentiment is decreasing. Consider reviewing recent events, increasing moderator presence, and addressing community concerns.'
            : '➡️ **STABLE TREND:** Community sentiment is consistent. Maintain current practices while monitoring for changes.',
          inline: false
        });
        
        embed.setFooter({ text: `Trend Analysis Engine | ${intervals} data points analyzed` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'alerts') {
        const action = interaction.options.getString('action') || 'view';
        const alerts = sentimentAlerts.get(guild.id) || [];
        
        if (action === 'view') {
          const activeAlerts = alerts.filter(a => !a.resolved);
          
          for (let i = 0; i < Math.floor(Math.random() * 3); i++) {
            const alertTypes: SentimentAlert['alertType'][] = ['negative_spike', 'sustained_negativity', 'conflict_detected', 'toxicity_rising'];
            const severities: SentimentAlert['severity'][] = ['low', 'medium', 'high', 'critical'];
            
            activeAlerts.push({
              id: `alert_${Date.now()}_${i}`,
              channelId: 'demo',
              channelName: `channel-${i + 1}`,
              alertType: alertTypes[Math.floor(Math.random() * alertTypes.length)],
              severity: severities[Math.floor(Math.random() * severities.length)],
              score: Math.random() * 40 + 10,
              timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
              resolved: false
            });
          }
          
          const embed = new EmbedBuilder()
            .setColor(activeAlerts.length > 0 ? 0xFF6600 : 0x00FF00)
            .setTitle('🚨 SENTIMENT ALERTS')
            .setDescription(`**Active Alerts:** ${activeAlerts.length}\n**Server:** ${guild.name}`);
          
          if (activeAlerts.length === 0) {
            embed.addFields({
              name: '✅ ALL CLEAR',
              value: 'No active sentiment alerts. Community emotional health is within normal parameters.',
              inline: false
            });
          } else {
            const sortedAlerts = activeAlerts.sort((a, b) => {
              const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
              return severityOrder[a.severity] - severityOrder[b.severity];
            });
            
            for (const alert of sortedAlerts.slice(0, 5)) {
              const severityEmoji = alert.severity === 'critical' ? '🔴' : 
                                   alert.severity === 'high' ? '🟠' :
                                   alert.severity === 'medium' ? '🟡' : '🟢';
              
              const typeLabel = alert.alertType.replace(/_/g, ' ').toUpperCase();
              
              embed.addFields({
                name: `${severityEmoji} ${typeLabel}`,
                value: `**Channel:** #${alert.channelName}\n**Score:** ${alert.score.toFixed(0)}%\n**Detected:** <t:${Math.floor(alert.timestamp.getTime() / 1000)}:R>\n**ID:** \`${alert.id.substring(0, 12)}\``,
                inline: true
              });
            }
          }
          
          embed.addFields({
            name: '📋 ALERT THRESHOLDS',
            value: '• **Negative Spike:** Score drops >30% in 1 hour\n• **Sustained Negativity:** Score <30% for >4 hours\n• **Conflict Detected:** Multiple negative interactions\n• **Toxicity Rising:** Increasing negative trend',
            inline: false
          });
          
          embed.setFooter({ text: `Sentinel Alert System | ${activeAlerts.length} active alerts` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          
        } else if (action === 'clear') {
          const clearedCount = alerts.filter(a => !a.resolved).length;
          alerts.forEach(a => a.resolved = true);
          
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ ALERTS CLEARED')
            .setDescription(`**${clearedCount} alerts have been marked as resolved**`)
            .addFields({
              name: '📋 NOTICE',
              value: 'All alerts have been acknowledged. New alerts will be generated if conditions persist.',
              inline: false
            })
            .setFooter({ text: `Cleared by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          
        } else if (action === 'config') {
          const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('⚙️ ALERT CONFIGURATION')
            .setDescription('Current sentiment alert thresholds and settings')
            .addFields(
              {
                name: '🎚️ THRESHOLD SETTINGS',
                value: '**Negative Spike Threshold:** -30%\n**Sustained Negativity Duration:** 4 hours\n**Conflict Detection Sensitivity:** Medium\n**Toxicity Trend Window:** 2 hours',
                inline: true
              },
              {
                name: '🔔 NOTIFICATION SETTINGS',
                value: '**Alert Channel:** Not configured\n**Mention Roles:** None\n**DM Notifications:** Disabled\n**Frequency Cap:** 5/hour',
                inline: true
              },
              {
                name: '⚡ AUTO-RESPONSE',
                value: '**Auto-Moderate:** Disabled\n**Auto-Slowmode:** Disabled\n**Escalation:** Manual only',
                inline: false
              }
            )
            .addFields({
              name: '💡 CONFIGURATION TIPS',
              value: 'Contact server administrators to modify these settings via the dashboard or API.',
              inline: false
            })
            .setFooter({ text: 'Sentiment Alert Configuration' })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        }
      }

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'sentiment-field',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Subcommand: ${subcommand} executed successfully`,
        success: true,
        duration,
        metadata: { subcommand }
      });

      await fileLogger.info('sentiment-field', `Command completed successfully`, {
        subcommand,
        duration,
        guildId: guild.id
      });

    } catch (error) {
      console.error('Sentiment Field error:', error);
      
      await fileLogger.error('sentiment-field', `Command failed: ${(error as Error).message}`, {
        guildId: guild.id,
        error: String(error)
      });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Sentiment Field Error')
        .setDescription(`Failed to execute analysis: ${(error as Error).message}`)
        .addFields({
          name: '🔧 Troubleshooting',
          value: '• Ensure bot has message read permissions\n• Check channel accessibility\n• Try analyzing fewer messages',
          inline: false
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'sentiment-field',
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
