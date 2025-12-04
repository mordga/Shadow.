import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const kickCommand = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('⚠️ Kick a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for kick')
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

      if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
        await interaction.reply({ content: '❌ I do not have permission to kick members in this server', ephemeral: true });
        return;
      }

      await interaction.deferReply();
      
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';

      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!member) {
        await interaction.editReply('❌ User not found in this server');
        return;
      }

      if (member.id === interaction.user.id) {
        await interaction.editReply('❌ You cannot kick yourself');
        return;
      }

      if (member.id === interaction.client.user?.id) {
        await interaction.editReply('❌ I cannot kick myself');
        return;
      }

      if (!member.kickable) {
        await interaction.editReply('❌ I cannot kick this user (they may have higher roles than me)');
        return;
      }

      // Registrar amenaza antes de expulsar
      await storage.createThreat({
        type: 'kicked',
        severity: 'high',
        description: `🚨 USER KICKED: ${reason}`,
        serverId: guild.id,
        serverName: guild.name,
        userId: targetUser.id,
        username: targetUser.username,
        action: 'kick',
        metadata: {
          kickedBy: interaction.user.id,
          kickedByUsername: interaction.user.username,
          reason,
          timestamp: new Date().toISOString()
        }
      });

      // Penalización de reputación agresiva
      await storage.updateUserReputationScore(targetUser.id, guild.id, -100, true);

      // Enviar DM al usuario
      try {
        await targetUser.send(
          `⚠️ **KICKED FROM SERVER** ⚠️\n\n` +
          `You have been kicked from **${guild.name}**.\n\n` +
          `**Reason:** ${reason}\n` +
          `**Kicked by:** ${interaction.user.username}\n\n` +
          `🚨 **Your reputation has been reduced by 100 points.**\n\n` +
          `You can rejoin the server if you have an invite link, but repeated violations will result in a permanent ban.`
        );
      } catch (err) {
        console.log('Could not DM user about kick');
      }

      await member.kick(`${reason} - Kicked by ${interaction.user.username}`);

      const embed = new EmbedBuilder()
        .setTitle('⚠️ USER KICKED')
        .setDescription(`<@${targetUser.id}> has been kicked from the server`)
        .setColor(0xFF6600)
        .addFields([
          { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
          { name: '⚖️ Moderator', value: interaction.user.username, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '⚠️ Actions Taken', value: '• User kicked from server\n• Reputation -100 points\n• Threat logged in system\n• User notified via DM', inline: false }
        ])
        .setFooter({ text: `Kicked by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'kick',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { targetUser: targetUser.id, reason },
        result: `User ${targetUser.username} kicked successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          targetUserId: targetUser.id,
          targetUsername: targetUser.username,
          reason
        }
      });

    } catch (error) {
      console.error('Error in kick command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'kick',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: {},
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });

      await interaction.editReply(`❌ Error kicking user: ${errorMessage}`);
    }
  }
};
