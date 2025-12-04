import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const unbanCommand = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a previously banned user with security logging')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option =>
      option.setName('user_id')
        .setDescription('User ID to unban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for unban')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const userId = interaction.options.getString('user_id', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
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

      const bans = await guild.bans.fetch();
      const bannedUser = bans.get(userId);

      if (!bannedUser) {
        await interaction.editReply('❌ This user is not banned');
        return;
      }

      await guild.members.unban(userId, `${reason} - Unbanned by ${interaction.user.username}`);

      const reputation = await storage.getUserReputation(userId, guild.id);
      await storage.updateUserReputationScore(userId, guild.id, 50, false);

      await storage.createThreat({
        type: 'unbanned',
        severity: 'low',
        description: `✅ USER UNBANNED: ${reason}`,
        serverId: guild.id,
        serverName: guild.name,
        userId: userId,
        username: bannedUser.user.username,
        action: 'unban',
        metadata: {
          unbannedBy: interaction.user.id,
          unbannedByUsername: interaction.user.username,
          reason,
          timestamp: new Date().toISOString()
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ USER UNBANNED')
        .setDescription(`<@${userId}> has been unbanned from the server`)
        .setColor(0x00FF00)
        .addFields([
          { name: '👤 User', value: `${bannedUser.user.username} (<@${userId}>)`, inline: true },
          { name: '⚖️ Moderator', value: interaction.user.username, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '📊 Current Reputation', value: (reputation?.score || 0).toString(), inline: true },
          { name: '💚 Reputation Bonus', value: '+50 points', inline: true },
          { name: '⚠️ Actions Taken', value: '• User unbanned from server\n• Reputation +50 points\n• Action logged in system', inline: false }
        ])
        .setFooter({ text: `Executed by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'unban',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { targetUserId: userId, reason },
        result: `User ${bannedUser.user.username} unbanned successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          targetUserId: userId,
          targetUsername: bannedUser.user.username,
          reason
        }
      });

    } catch (error) {
      console.error('Error in unban command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      const guild = interaction.guild;
      if (guild) {
        await storage.createCommandLog({
          commandName: 'unban',
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
