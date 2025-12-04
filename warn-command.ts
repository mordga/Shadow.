import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const warnCommand = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user with progressive warning system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for warning')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('severity')
        .setDescription('Warning severity level')
        .addChoices(
          { name: 'Low (Minor infraction)', value: 1 },
          { name: 'Medium (Moderate violation)', value: 2 },
          { name: 'High (Serious violation)', value: 3 },
          { name: 'Critical (Severe violation)', value: 4 }
        )
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      const severityLevel = interaction.options.getInteger('severity') || 2;
      const guildId = interaction.guildId;

      if (!guildId) {
        await interaction.editReply('❌ This command can only be used in a server');
        return;
      }

      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) {
        await interaction.editReply('❌ Could not access server information. Please try again.');
        return;
      }

      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!member) {
        await interaction.editReply('❌ User not found in this server');
        return;
      }

      if (targetUser.id === interaction.user.id) {
        await interaction.editReply('❌ You cannot warn yourself');
        return;
      }

      const threats = await storage.getThreats(100);
      const userWarnings = threats.filter(
        t => t.userId === targetUser.id && 
        t.serverId === guild.id && 
        t.type === 'warning'
      );
      const warningCount = userWarnings.length + 1;

      const severityMap = {
        1: { text: 'Low', color: 0xFFFF00, penalty: -10, emoji: '⚠️' },
        2: { text: 'Medium', color: 0xFF9900, penalty: -25, emoji: '⚡' },
        3: { text: 'High', color: 0xFF6600, penalty: -50, emoji: '🔴' },
        4: { text: 'Critical', color: 0xFF0000, penalty: -100, emoji: '🚨' }
      };

      const severity = severityMap[severityLevel as keyof typeof severityMap];
      const totalPenalty = severity.penalty + (warningCount * -5);

      await storage.updateUserReputationScore(targetUser.id, guild.id, totalPenalty, true);

      await storage.createThreat({
        type: 'warning',
        severity: severityLevel === 4 ? 'critical' : severityLevel === 3 ? 'high' : severityLevel === 2 ? 'medium' : 'low',
        description: `${severity.emoji} USER WARNING (${severity.text}): ${reason}`,
        serverId: guild.id,
        serverName: guild.name,
        userId: targetUser.id,
        username: targetUser.username,
        action: 'warn',
        metadata: {
          warnedBy: interaction.user.id,
          warnedByUsername: interaction.user.username,
          reason,
          severityLevel,
          severityText: severity.text,
          warningNumber: warningCount,
          reputationPenalty: totalPenalty,
          timestamp: new Date().toISOString()
        }
      });

      let progressiveAction = '';
      if (warningCount >= 5) {
        progressiveAction = '🔨 **AUTOMATIC BAN** - Maximum warnings exceeded';
        try {
          await guild.members.ban(targetUser.id, { 
            reason: `Automatic ban: ${warningCount} warnings - Last: ${reason}` 
          });
        } catch (err) {
          progressiveAction = '⚠️ Auto-ban failed - Manual action required';
        }
      } else if (warningCount >= 3) {
        progressiveAction = '⏱️ **72 Hour Mute** - Multiple warnings';
        try {
          await member.timeout(72 * 60 * 60 * 1000, `Warning #${warningCount}: ${reason}`);
        } catch (err) {
          progressiveAction = '⚠️ Auto-mute failed - Manual action required';
        }
      } else if (warningCount === 2) {
        progressiveAction = '⏱️ **24 Hour Mute** - Second warning';
        try {
          await member.timeout(24 * 60 * 60 * 1000, `Warning #${warningCount}: ${reason}`);
        } catch (err) {
          progressiveAction = '⚠️ Auto-mute failed - Manual action required';
        }
      } else {
        progressiveAction = '📝 **Warning Recorded** - No automatic action';
      }

      try {
        await targetUser.send(
          `${severity.emoji} **WARNING** ${severity.emoji}\n\n` +
          `You have received a **${severity.text} Severity** warning in **${guild.name}**.\n\n` +
          `**Warning #${warningCount}**\n` +
          `**Reason:** ${reason}\n` +
          `**Warned by:** ${interaction.user.username}\n` +
          `**Severity:** ${severity.text}\n` +
          `**Reputation penalty:** ${totalPenalty} points\n\n` +
          `**Progressive Action:** ${progressiveAction}\n\n` +
          `⚠️ **Warning System:**\n` +
          `• Warning 1: Recorded\n` +
          `• Warning 2: 24h mute\n` +
          `• Warning 3: 72h mute\n` +
          `• Warning 5: Permanent ban\n\n` +
          `Please follow the server rules to avoid further action.`
        );
      } catch (err) {
        console.log('Could not DM user about warning');
      }

      const embed = new EmbedBuilder()
        .setTitle(`${severity.emoji} USER WARNING (${severity.text})`)
        .setDescription(`<@${targetUser.id}> has been warned`)
        .setColor(severity.color)
        .addFields([
          { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
          { name: '⚖️ Moderator', value: interaction.user.username, inline: true },
          { name: '📊 Warning Number', value: `#${warningCount}`, inline: true },
          { name: '🎯 Severity', value: severity.text, inline: true },
          { name: '💔 Reputation Penalty', value: `${totalPenalty} points`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '⚙️ Progressive Action', value: progressiveAction, inline: false },
          { name: '⚠️ Actions Taken', value: `• Warning #${warningCount} recorded\n• Reputation ${totalPenalty} points\n• Threat logged in system\n• User notified via DM${warningCount >= 2 ? '\n• Automatic action applied' : ''}`, inline: false }
        ])
        .setFooter({ text: `Warning System - Executed by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'warn',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { targetUser: targetUser.id, reason, severity: severityLevel },
        result: `User ${targetUser.username} warned (Warning #${warningCount})`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          targetUserId: targetUser.id,
          targetUsername: targetUser.username,
          reason,
          warningNumber: warningCount,
          severity: severity.text,
          reputationPenalty: totalPenalty,
          progressiveAction
        }
      });

    } catch (error) {
      console.error('Error in warn command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      const guild = interaction.guild;
      if (guild) {
        await storage.createCommandLog({
          commandName: 'warn',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: {},
          result: `Error: ${errorMessage}`,
          success: false,
          duration: Date.now() - startTime,
          metadata: { error: errorMessage }
        });
      }
    }
  }
};
