import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const muteCommand = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('🔇 Timeout/mute a user with security logging')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to mute')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Duration in minutes (max 40320 = 28 days)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for mute')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const targetUser = interaction.options.getUser('user', true);
      const duration = interaction.options.getInteger('duration', true);
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

      const member = await guild.members.fetch(targetUser.id);
      
      if (!member) {
        await interaction.editReply('❌ User not found in this server');
        return;
      }

      if (member.id === interaction.user.id) {
        await interaction.editReply('❌ You cannot mute yourself');
        return;
      }

      if (member.id === interaction.client.user?.id) {
        await interaction.editReply('❌ I cannot mute myself');
        return;
      }

      if (!member.moderatable) {
        await interaction.editReply('❌ I cannot mute this user (they may have higher roles than me)');
        return;
      }

      const muteDuration = duration * 60 * 1000; // Convert to milliseconds
      const muteUntil = new Date(Date.now() + muteDuration);

      await member.timeout(muteDuration, `${reason} - Muted by ${interaction.user.username}`);

      // Registrar amenaza con severidad alta
      await storage.createThreat({
        type: 'muted',
        severity: 'high',
        description: `🚨 AGGRESSIVE MUTE: ${reason}`,
        serverId: guild.id,
        serverName: guild.name,
        userId: targetUser.id,
        username: targetUser.username,
        action: 'mute',
        metadata: {
          mutedBy: interaction.user.id,
          mutedByUsername: interaction.user.username,
          reason,
          durationMinutes: duration,
          muteUntil: muteUntil.toISOString(),
          reputationPenalty: -75,
          aggressiveMode: true,
          timestamp: new Date().toISOString()
        }
      });

      // Penalización de reputación agresiva
      await storage.updateUserReputationScore(targetUser.id, guild.id, -75, true);

      // Enviar DM agresivo al usuario
      try {
        await targetUser.send(
          `🚨 **YOU HAVE BEEN MUTED** 🚨\n\n` +
          `⚠️ **AGGRESSIVE PENALTY MODE ACTIVE** ⚠️\n\n` +
          `**Server:** ${guild.name}\n` +
          `**Reason:** ${reason}\n` +
          `**Duration:** ${duration} minutes\n` +
          `**Moderator:** ${interaction.user.username}\n` +
          `**Expires:** <t:${Math.floor(muteUntil.getTime() / 1000)}:F>\n\n` +
          `🚫 **RESTRICTIONS ACTIVE:**\n` +
          `• ❌ Cannot send messages\n` +
          `• ❌ Cannot add reactions\n` +
          `• ❌ Cannot speak in voice channels\n` +
          `• ❌ Cannot use slash commands\n` +
          `• ❌ Cannot create threads\n\n` +
          `🚨 **Your reputation has been reduced by 75 points** (SEVERE PENALTY).\n\n` +
          `⚠️ **WARNING:** Further violations will result in immediate kick or permanent ban.\n\n` +
          `This is your final warning. Comply with server rules immediately.`
        );
      } catch (err) {
        console.log('Could not DM user about mute');
      }

      const embed = new EmbedBuilder()
        .setTitle('🔇 USER MUTED')
        .setDescription(`<@${targetUser.id}> has been muted`)
        .setColor(0xFFA500)
        .addFields([
          { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
          { name: '⏰ Duration', value: `${duration} minutes`, inline: true },
          { name: '📅 Expires', value: `<t:${Math.floor(muteUntil.getTime() / 1000)}:R>`, inline: true },
          { name: '⚖️ Moderator', value: interaction.user.username, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '🚨 AGGRESSIVE MODE', value: '⚠️ **ENHANCED PENALTIES ACTIVE**\n• User muted (timeout applied)\n• Reputation **-75 points** (SEVERE)\n• High severity threat logged\n• Aggressive DM sent to user\n• Zero tolerance warning issued', inline: false }
        ])
        .setFooter({ text: `Muted by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'mute',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { targetUser: targetUser.id, duration, reason },
        result: `User ${targetUser.username} muted for ${duration} minutes`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          targetUserId: targetUser.id,
          targetUsername: targetUser.username,
          durationMinutes: duration,
          muteUntil: muteUntil.toISOString()
        }
      });

    } catch (error) {
      console.error('Error in mute command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'mute',
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

      await interaction.editReply(`❌ Error muting user: ${errorMessage}`);
    }
  }
};
