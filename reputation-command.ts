import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { storage } from '../../storage';

export const reputationCommand = {
  data: new SlashCommandBuilder()
    .setName('reputation')
    .setDescription('Check user reputation and behavior score')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check reputation')
        .setRequired(true)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const targetUser = interaction.options.getUser('user', true);
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      let reputation = await storage.getUserReputation(targetUser.id, serverId);
      
      if (!reputation) {
        reputation = await storage.createOrUpdateUserReputation({
          userId: targetUser.id,
          username: targetUser.username,
          serverId,
          serverName
        });
      }

      const userThreats = await storage.getThreats(100);
      const recentThreats = userThreats
        .filter(t => t.userId === targetUser.id && t.serverId === serverId)
        .slice(0, 5);

      const quarantineHistory = await storage.getQuarantinedUsers(serverId);
      const userQuarantines = quarantineHistory.filter(q => q.userId === targetUser.id);
      const totalQuarantines = userQuarantines.length;
      const currentlyQuarantined = userQuarantines.some(q => !q.released);

      const totalQuarantineTime = userQuarantines.reduce((total, q) => {
        if (q.releasedAt && q.quarantinedAt) {
          return total + (q.releasedAt.getTime() - q.quarantinedAt.getTime());
        }
        return total;
      }, 0);

      const quarantineHours = Math.floor(totalQuarantineTime / (1000 * 60 * 60));
      const quarantineDays = Math.floor(quarantineHours / 24);

      let embedColor: number;
      let scoreEmoji: string;
      let recommendation: string;

      if (reputation.score >= 150 || reputation.trustLevel === 'verified' || reputation.trustLevel === 'trusted') {
        embedColor = 0x57F287;
        scoreEmoji = '🟢';
        recommendation = '✅ **Trusted Member** - User has excellent reputation and can be trusted.';
      } else if (reputation.score >= 50 && reputation.score < 150) {
        embedColor = 0xFEE75C;
        scoreEmoji = '🟡';
        recommendation = '⚠️ **Monitor Activity** - User has neutral reputation. Keep an eye on their activity.';
      } else if (reputation.score >= 20 && reputation.score < 50) {
        embedColor = 0xF26522;
        scoreEmoji = '🟠';
        recommendation = '⚠️ **Untrusted User** - User has low reputation. Monitor closely and consider restrictions.';
      } else {
        embedColor = 0xED4245;
        scoreEmoji = '🔴';
        recommendation = '🚨 **High Risk** - Consider quarantine or ban. User has very low reputation score.';
      }

      const getTrustLevelEmoji = (level: string) => {
        switch(level) {
          case 'verified': return '✅';
          case 'trusted': return '🟢';
          case 'neutral': return '🟡';
          case 'untrusted': return '🟠';
          case 'new': return '🆕';
          default: return '⚪';
        }
      };

      const reputationEmbed = new EmbedBuilder()
        .setTitle(`${scoreEmoji} User Reputation - ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setColor(embedColor)
        .addFields([
          {
            name: '📊 Reputation Score',
            value: `**${reputation.score}/200** ${scoreEmoji}`,
            inline: true
          },
          {
            name: '🏆 Trust Level',
            value: `${getTrustLevelEmoji(reputation.trustLevel)} **${reputation.trustLevel.toUpperCase()}**`,
            inline: true
          },
          {
            name: '📈 Status',
            value: currentlyQuarantined ? '🔒 Quarantined' : '✅ Active',
            inline: true
          },
          {
            name: '⚠️ Violations',
            value: reputation.violations.toString(),
            inline: true
          },
          {
            name: '✨ Positive Actions',
            value: reputation.positiveActions.toString(),
            inline: true
          },
          {
            name: '🔄 Activity Ratio',
            value: reputation.violations > 0 
              ? `${Math.round((reputation.positiveActions / (reputation.violations + reputation.positiveActions)) * 100)}% positive`
              : '100% positive',
            inline: true
          }
        ]);

      if (recentThreats.length > 0) {
        const threatsList = recentThreats.map((threat, index) => {
          const severityEmoji = {
            'critical': '🔴',
            'high': '🟠',
            'medium': '🟡',
            'low': '🟢'
          }[threat.severity] || '⚪';
          
          const timeAgo = Math.floor((Date.now() - threat.timestamp.getTime()) / 1000);
          const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : 
                         timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}m ago` :
                         timeAgo < 86400 ? `${Math.floor(timeAgo / 3600)}h ago` :
                         `${Math.floor(timeAgo / 86400)}d ago`;

          return `${severityEmoji} **${threat.type}** - ${threat.action} | ${timeStr}`;
        }).join('\n');

        reputationEmbed.addFields({
          name: '🚨 Recent Threats (Last 5)',
          value: threatsList,
          inline: false
        });
      } else {
        reputationEmbed.addFields({
          name: '🚨 Recent Threats',
          value: '✅ No recent threats detected',
          inline: false
        });
      }

      if (totalQuarantines > 0) {
        const quarantineInfo = [
          `**Times Quarantined:** ${totalQuarantines}`,
          `**Total Time:** ${quarantineDays > 0 ? `${quarantineDays}d ` : ''}${quarantineHours % 24}h`,
          `**Currently Quarantined:** ${currentlyQuarantined ? 'Yes 🔒' : 'No ✅'}`
        ].join('\n');

        reputationEmbed.addFields({
          name: '🔒 Quarantine History',
          value: quarantineInfo,
          inline: false
        });
      } else {
        reputationEmbed.addFields({
          name: '🔒 Quarantine History',
          value: '✅ Never quarantined',
          inline: false
        });
      }

      if (reputation.lastViolation) {
        const lastViolationTime = Math.floor((Date.now() - reputation.lastViolation.getTime()) / 1000);
        const lastViolationStr = lastViolationTime < 60 ? `${lastViolationTime}s ago` : 
                                 lastViolationTime < 3600 ? `${Math.floor(lastViolationTime / 60)}m ago` :
                                 lastViolationTime < 86400 ? `${Math.floor(lastViolationTime / 3600)}h ago` :
                                 `${Math.floor(lastViolationTime / 86400)}d ago`;
        
        reputationEmbed.addFields({
          name: '⏰ Last Violation',
          value: lastViolationStr,
          inline: true
        });
      }

      reputationEmbed.addFields({
        name: '💡 Recommendation',
        value: recommendation,
        inline: false
      });

      reputationEmbed.setTimestamp()
        .setFooter({ text: `User ID: ${targetUser.id}` });

      await interaction.editReply({ embeds: [reputationEmbed] });

      await storage.createCommandLog({
        commandName: 'reputation',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { target_user: targetUser.id, target_username: targetUser.username },
        result: `Reputation checked for ${targetUser.username} - Score: ${reputation.score}, Level: ${reputation.trustLevel}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          targetUserId: targetUser.id,
          reputationScore: reputation.score,
          trustLevel: reputation.trustLevel,
          violations: reputation.violations,
          quarantined: currentlyQuarantined
        }
      });

    } catch (error) {
      console.error('Error in reputation command:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error retrieving user reputation: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'reputation',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: { user: interaction.options.getUser('user')?.id },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
