import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, GuildVerificationLevel, GuildExplicitContentFilter } from 'discord.js';
import { storage } from '../../storage';

export const lockserverCommand = {
  data: new SlashCommandBuilder()
    .setName('lockserver')
    .setDescription('🔴 ULTRA AGGRESSIVE: Total server lockdown - blocks EVERYTHING including invites')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for total server lockdown')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const guildId = interaction.guildId;
      const reason = interaction.options.getString('reason') || 'ULTRA AGGRESSIVE: Total server lockdown activated';

      if (!guildId) {
        await interaction.editReply('❌ This command can only be used in a server');
        return;
      }

      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) {
        await interaction.editReply('❌ Could not access server information. Please try again.');
        return;
      }

      const serverId = guild.id;
      const serverName = guild.name;

      // Lock ALL channels
      const allChannels = guild.channels.cache;
      let channelsLocked = 0;
      let channelsFailed = 0;

      for (const [, channel] of Array.from(allChannels)) {
        try {
          if ('permissionOverwrites' in channel) {
            await channel.permissionOverwrites.edit(guild.id, {
              SendMessages: false,
              AddReactions: false,
              CreatePublicThreads: false,
              CreatePrivateThreads: false,
              SendMessagesInThreads: false,
              UseApplicationCommands: false,
              AttachFiles: false,
              EmbedLinks: false,
              UseExternalEmojis: false,
              UseExternalStickers: false,
              Connect: false,
              Speak: false,
              Stream: false,
              CreateInstantInvite: false,
              ManageChannels: false,
              ManageWebhooks: false
            });
            channelsLocked++;
          }
        } catch (err) {
          console.error(`Failed to lock channel ${channel.id}:`, err);
          channelsFailed++;
        }
      }

      // Set verification to highest
      try {
        await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh);
      } catch (err) {
        console.error('Failed to set verification level:', err);
      }

      // Set explicit content filter to max
      try {
        await guild.setExplicitContentFilter(GuildExplicitContentFilter.AllMembers);
      } catch (err) {
        console.error('Failed to set content filter:', err);
      }

      // Pause all invites by removing create invite permissions from @everyone
      try {
        const everyoneRole = guild.roles.everyone;
        await everyoneRole.setPermissions([]);
      } catch (err) {
        console.error('Failed to remove everyone permissions:', err);
      }

      await storage.createThreat({
        type: 'total_lockdown',
        severity: 'critical',
        description: `🔴 ULTRA AGGRESSIVE TOTAL LOCKDOWN: ${reason}`,
        serverId,
        serverName,
        userId: interaction.user.id,
        username: interaction.user.username,
        action: 'total_lockdown',
        metadata: {
          activatedBy: interaction.user.id,
          activatedByUsername: interaction.user.username,
          reason,
          channelsLocked,
          channelsFailed,
          totalChannels: allChannels.size,
          ultraAggressiveMode: true,
          verificationLevel: 'HIGHEST',
          contentFilter: 'ALL_MEMBERS',
          invitesPaused: true,
          timestamp: new Date().toISOString()
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('🔴⛔ ULTRA AGGRESSIVE TOTAL SERVER LOCKDOWN ⛔🔴')
        .setDescription(
          `**🚨 MAXIMUM SECURITY PROTOCOL ACTIVATED 🚨**\n\n` +
          `**${channelsLocked}/${allChannels.size}** channels locked\n\n` +
          `🔴 **SERVER COMPLETELY FROZEN** 🔴`
        )
        .setColor(0xFF0000)
        .addFields([
          { name: '⚖️ Activated By', value: interaction.user.username, inline: true },
          { name: '📝 Reason', value: reason, inline: true },
          { name: '🔒 Lock Status', value: `✅ Locked: ${channelsLocked}\n❌ Failed: ${channelsFailed}`, inline: false },
          { 
            name: '🚫 TOTAL RESTRICTIONS', 
            value: 
              '• ❌ **NO** messages/voice/video\n' +
              '• ❌ **NO** reactions/threads\n' +
              '• ❌ **NO** invites (ALL PAUSED)\n' +
              '• ❌ **NO** file uploads\n' +
              '• ❌ **NO** webhooks\n' +
              '• ⚠️ Verification: **HIGHEST**\n' +
              '• ⚠️ Content Filter: **MAXIMUM**\n' +
              '• ✅ **ONLY** admins active',
            inline: false 
          },
          { 
            name: '🚨 EMERGENCY ACTIONS', 
            value: 
              '1. 🔴 Run `/scan type:full`\n' +
              '2. 🚫 `/massban` all threats\n' +
              '3. 🔍 Review `/audit`\n' +
              '4. 🛡️ Check `/defensestatus`\n' +
              '5. ⚠️ Manually unlock when safe',
            inline: false 
          }
        ])
        .setFooter({ text: '🔴 CRITICAL: Total server lockdown - ALL activity suspended' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'lockserver',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { reason },
        result: `Total lockdown - ${channelsLocked} channels locked`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { channelsLocked, channelsFailed, reason }
      });

    } catch (error) {
      console.error('Error in lockserver command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'lockserver',
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

      await interaction.editReply(`❌ Error executing lockserver: ${errorMessage}`);
    }
  }
};
