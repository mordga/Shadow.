import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const unmuteCommand = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove timeout/mute from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to unmute')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for unmuting')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const targetUser = interaction.options.getUser('user', true);
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

      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!member) {
        await interaction.editReply('❌ User not found in this server');
        return;
      }

      if (!member.communicationDisabledUntil) {
        await interaction.editReply('❌ This user is not muted');
        return;
      }

      await member.timeout(null, `${reason} - Unmuted by ${interaction.user.username}`);

      const reputation = await storage.getUserReputation(targetUser.id, guild.id);
      await storage.updateUserReputationScore(targetUser.id, guild.id, 10, false);

      await storage.createThreat({
        type: 'unmuted',
        severity: 'low',
        description: `✅ USER UNMUTED: ${reason}`,
        serverId: guild.id,
        serverName: guild.name,
        userId: targetUser.id,
        username: targetUser.username,
        action: 'unmute',
        metadata: {
          unmutedBy: interaction.user.id,
          unmutedByUsername: interaction.user.username,
          reason,
          timestamp: new Date().toISOString()
        }
      });

      try {
        await targetUser.send(
          `✅ **UNMUTED** ✅\n\n` +
          `You have been unmuted in **${guild.name}**.\n\n` +
          `**Reason:** ${reason}\n` +
          `**Unmuted by:** ${interaction.user.username}\n` +
          `**Reputation bonus:** +10 points\n\n` +
          `You can now send messages again.`
        );
      } catch (err) {
        console.log('Could not DM user about unmute');
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ USER UNMUTED')
        .setDescription(`<@${targetUser.id}> has been unmuted`)
        .setColor(0x00FF00)
        .addFields([
          { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
          { name: '⚖️ Moderator', value: interaction.user.username, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '📊 Current Reputation', value: (reputation?.score || 0).toString(), inline: true },
          { name: '💚 Reputation Bonus', value: '+10 points', inline: true },
          { name: '⚠️ Actions Taken', value: '• User unmuted\n• Reputation +10 points\n• Action logged in system\n• User notified via DM', inline: false }
        ])
        .setFooter({ text: `Executed by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'unmute',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { targetUser: targetUser.id, reason },
        result: `User ${targetUser.username} unmuted successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          targetUserId: targetUser.id,
          targetUsername: targetUser.username,
          reason
        }
      });

    } catch (error) {
      console.error('Error in unmute command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      const guild = interaction.guild;
      if (guild) {
        await storage.createCommandLog({
          commandName: 'unmute',
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
