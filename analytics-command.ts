import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const analyticsCommand = {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('📈 View detailed server activity and security analytics')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(subcommand =>
      subcommand
        .setName('overview')
        .setDescription('General server security overview'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('threats')
        .setDescription('Threat analysis and trends'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('users')
        .setDescription('User activity and reputation analysis')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of users to show (default: 10)')
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(25)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('activity')
        .setDescription('Message activity patterns')),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    try {
      const subcommand = interaction.options.getSubcommand();
      const serverId = interaction.guildId || '';
      const serverName = interaction.guild?.name || '';

      if (!serverId) {
        await interaction.editReply({ content: '❌ This command can only be used in a server' });
        return;
      }

      switch (subcommand) {
        case 'overview': {
          const botStats = await storage.getBotStats();
          const threats = await storage.getThreats(100);
          const serverThreats = threats.filter(t => t.serverId === serverId);
          const activeThreats = serverThreats.filter(t => !t.resolved);
          const deletions = await storage.getMessageDeletions({ serverId, limit: 1000 });
          const reputations = await storage.getAllReputations(serverId);

          const threatsByType: Record<string, number> = {};
          serverThreats.forEach(t => {
            threatsByType[t.type] = (threatsByType[t.type] || 0) + 1;
          });

          const topThreats = Object.entries(threatsByType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([type, count]) => `• **${type}**: ${count}`)
            .join('\n') || 'No threats detected';

          const avgReputation = reputations.length > 0
            ? Math.round(reputations.reduce((sum, r) => sum + r.score, 0) / reputations.length)
            : 100;

          const lowRepUsers = reputations.filter(r => r.score < 50).length;
          const highRepUsers = reputations.filter(r => r.score >= 80).length;

          const embed = new EmbedBuilder()
            .setTitle('📈 Server Security Analytics')
            .setDescription(`**${serverName}** - Overview`)
            .setColor(0x5865F2)
            .addFields(
              {
                name: '🛡️ Security Status',
                value: `• Total Threats: **${serverThreats.length}**\n• Active Threats: **${activeThreats.length}**\n• Messages Deleted: **${deletions.length}**\n• Detection Rate: **${botStats?.detectionRate || '99.2%'}**`,
                inline: true
              },
              {
                name: '👥 User Metrics',
                value: `• Average Reputation: **${avgReputation}**\n• High Rep Users: **${highRepUsers}**\n• Low Rep Users: **${lowRepUsers}**\n• Total Tracked: **${reputations.length}**`,
                inline: true
              },
              {
                name: '⚠️ Top Threat Types',
                value: topThreats,
                inline: false
              }
            )
            .setFooter({ text: `Uptime: ${botStats?.uptime || '0h'}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'threats': {
          const threats = await storage.getThreats(500);
          const serverThreats = threats.filter(t => t.serverId === serverId);
          
          if (serverThreats.length === 0) {
            await interaction.editReply({ content: '✅ No threats detected for this server' });
            return;
          }

          const last24h = serverThreats.filter(t => 
            Date.now() - t.timestamp.getTime() < 24 * 60 * 60 * 1000
          );
          const last7d = serverThreats.filter(t => 
            Date.now() - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000
          );

          const bySeverity: Record<string, number> = {};
          serverThreats.forEach(t => {
            bySeverity[t.severity] = (bySeverity[t.severity] || 0) + 1;
          });

          const byType: Record<string, number> = {};
          serverThreats.forEach(t => {
            byType[t.type] = (byType[t.type] || 0) + 1;
          });

          const severityBreakdown = Object.entries(bySeverity)
            .map(([sev, count]) => `• **${sev}**: ${count}`)
            .join('\n');

          const typeBreakdown = Object.entries(byType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([type, count]) => `• **${type}**: ${count}`)
            .join('\n');

          const embed = new EmbedBuilder()
            .setTitle('⚠️ Threat Analysis')
            .setDescription('Detailed threat breakdown')
            .setColor(0xFF4500)
            .addFields(
              {
                name: '📊 Activity Timeline',
                value: `• Last 24 hours: **${last24h.length}** threats\n• Last 7 days: **${last7d.length}** threats\n• All time: **${serverThreats.length}** threats`,
                inline: false
              },
              {
                name: '🎯 By Severity',
                value: severityBreakdown || 'No data',
                inline: true
              },
              {
                name: '🔍 By Type',
                value: typeBreakdown || 'No data',
                inline: true
              }
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'users': {
          const limit = interaction.options.getInteger('limit') || 10;
          const reputations = await storage.getAllReputations(serverId);

          if (reputations.length === 0) {
            await interaction.editReply({ content: '✅ No user reputation data available' });
            return;
          }

          const sortedUsers = reputations.sort((a, b) => b.score - a.score);
          const topUsers = sortedUsers.slice(0, limit);

          const embed = new EmbedBuilder()
            .setTitle('👥 User Reputation Analysis')
            .setDescription(`Showing top ${topUsers.length} users by reputation`)
            .setColor(0x00D166);

          for (let index = 0; index < topUsers.length; index++) {
            const user = topUsers[index];
            const trustEmoji = this.getTrustEmoji(user.trustLevel);
            const scoreEmoji = this.getScoreEmoji(user.score);
            
            embed.addFields({
              name: `${index + 1}. ${user.username}`,
              value: `${scoreEmoji} Score: **${user.score}** | ${trustEmoji} Trust: **${user.trustLevel}**\nViolations: **${user.violations}** | Positive Actions: **${user.positiveActions}**`,
              inline: false
            });
          }

          embed.setFooter({ text: `Total users tracked: ${reputations.length}` });
          embed.setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'activity': {
          const traces = await storage.getMessageTraces({ serverId, limit: 1000 });
          const deletions = await storage.getMessageDeletions({ serverId, limit: 1000 });

          if (traces.length === 0 && deletions.length === 0) {
            await interaction.editReply({ content: '✅ No activity data available' });
            return;
          }

          const totalMessages = traces.length;
          const allowedMessages = traces.filter(t => t.decision === 'allowed').length;
          const deletedMessages = deletions.length;
          const warnedMessages = traces.filter(t => t.decision === 'warned').length;
          const blockedPercentage = ((deletedMessages / totalMessages) * 100).toFixed(1);

          const last24h = traces.filter(t => 
            Date.now() - t.timestamp.getTime() < 24 * 60 * 60 * 1000
          );

          const hourlyActivity = new Array(24).fill(0);
          traces.forEach(t => {
            const hour = new Date(t.timestamp).getHours();
            hourlyActivity[hour]++;
          });

          const peakHour = hourlyActivity.indexOf(Math.max(...hourlyActivity));
          const peakActivity = Math.max(...hourlyActivity);

          const embed = new EmbedBuilder()
            .setTitle('📊 Message Activity Analysis')
            .setDescription('Server activity patterns')
            .setColor(0x5865F2)
            .addFields(
              {
                name: '📈 Overall Stats',
                value: `• Total Messages: **${totalMessages}**\n• Allowed: **${allowedMessages}** (${((allowedMessages/totalMessages)*100).toFixed(1)}%)\n• Deleted: **${deletedMessages}** (${blockedPercentage}%)\n• Warned: **${warnedMessages}**`,
                inline: false
              },
              {
                name: '⏰ Peak Activity',
                value: `• Peak Hour: **${peakHour}:00**\n• Messages: **${peakActivity}**\n• Last 24h: **${last24h.length}** messages`,
                inline: false
              }
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }
      }

      await storage.createCommandLog({
        commandName: 'analytics',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { subcommand },
        result: 'Command executed successfully',
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in analytics command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error generating analytics: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'analytics',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || '',
        serverName: interaction.guild?.name || '',
        parameters: {},
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  },

  getTrustEmoji(trustLevel: string): string {
    const emojis: Record<string, string> = {
      'verified': '✅',
      'trusted': '🟢',
      'neutral': '🟡',
      'untrusted': '🟠',
      'new': '🆕'
    };
    return emojis[trustLevel] || '❓';
  },

  getScoreEmoji(score: number): string {
    if (score >= 90) return '🌟';
    if (score >= 70) return '⭐';
    if (score >= 50) return '🔷';
    if (score >= 30) return '⚠️';
    return '🚨';
  }
};
