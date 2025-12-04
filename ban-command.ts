import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const banCommand = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('🔨 Ban a user with security logging (AGGRESSIVE)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for ban')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('delete_days')
        .setDescription('Delete messages from last X days (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
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

      const botMember = guild.members.me;
      if (!botMember) {
        await interaction.reply({ content: '❌ Cannot find bot member in guild', ephemeral: true });
        return;
      }

      if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        await interaction.reply({ content: '❌ I do not have permission to ban members in this server', ephemeral: true });
        return;
      }

      await interaction.deferReply();
      
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const deleteDays = interaction.options.getInteger('delete_days') || 1;

      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      
      if (member) {
        if (member.id === interaction.user.id) {
          await interaction.editReply('❌ You cannot ban yourself');
          return;
        }

        if (member.id === interaction.client.user?.id) {
          await interaction.editReply('❌ I cannot ban myself');
          return;
        }

        if (!member.bannable) {
          await interaction.editReply('❌ I cannot ban this user (they may have higher roles than me)');
          return;
        }
      }

      const reputation = await storage.getUserReputation(targetUser.id, guild.id);
      const violations = reputation?.violations || 0;

      await storage.createThreat({
        type: 'banned',
        severity: 'critical',
        description: `🔨 USER PERMANENTLY BANNED: ${reason}`,
        serverId: guild.id,
        serverName: guild.name,
        userId: targetUser.id,
        username: targetUser.username,
        action: 'ban',
        metadata: {
          bannedBy: interaction.user.id,
          bannedByUsername: interaction.user.username,
          reason,
          deleteDays,
          violations,
          aggressive: true,
          timestamp: new Date().toISOString()
        }
      });

      await storage.updateUserReputationScore(targetUser.id, guild.id, -200, true);

      try {
        await targetUser.send(
          `🔨 **PERMANENTLY BANNED** 🔨\n\n` +
          `You have been **permanently banned** from **${guild.name}**.\n\n` +
          `**Reason:** ${reason}\n` +
          `**Banned by:** ${interaction.user.username}\n` +
          `**Total Violations:** ${violations + 1}\n\n` +
          `🚨 **Your reputation has been reduced by 200 points.**\n` +
          `💀 **This is a permanent ban. You cannot rejoin this server.**\n\n` +
          `${deleteDays > 0 ? `⚠️ Your messages from the last ${deleteDays} day(s) have been deleted.` : ''}`
        );
      } catch (err) {
        console.log('Could not DM user about ban');
      }

      await guild.members.ban(targetUser.id, {
        reason: `${reason} - Banned by ${interaction.user.username}`,
        deleteMessageSeconds: deleteDays * 24 * 60 * 60
      });

      const embed = new EmbedBuilder()
        .setTitle('🔨 USER PERMANENTLY BANNED')
        .setDescription(`<@${targetUser.id}> has been **permanently banned** from the server`)
        .setColor(0xFF0000)
        .addFields([
          { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
          { name: '⚖️ Moderator', value: interaction.user.username, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '📊 Previous Violations', value: violations.toString(), inline: true },
          { name: '💀 Reputation Penalty', value: '-200 points', inline: true },
          { name: '🗑️ Messages Deleted', value: deleteDays > 0 ? `Last ${deleteDays} day(s)` : 'None', inline: true },
          { name: '⚠️ Actions Taken', value: '• User permanently banned\n• Reputation -200 points\n• Threat logged in system\n• User notified via DM\n• All messages deleted', inline: false }
        ])
        .setFooter({ text: `🔨 PERMANENT BAN - Executed by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'ban',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { targetUser: targetUser.id, reason, deleteDays },
        result: `User ${targetUser.username} banned successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          targetUserId: targetUser.id,
          targetUsername: targetUser.username,
          reason,
          violations
        }
      });

    } catch (error) {
      console.error('Error in ban command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      const guild = interaction.guild;
      if (guild) {
        await storage.createCommandLog({
          commandName: 'ban',
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
