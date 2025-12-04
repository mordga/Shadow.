import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ChannelType, TextChannel, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const slowmodeCommand = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Configure slow mode for channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to configure')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('seconds')
        .setDescription('Slowmode duration in seconds (0 to disable)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const channel = interaction.options.getChannel('channel', true) as TextChannel;
      const seconds = interaction.options.getInteger('seconds', true);
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      if (channel.type !== ChannelType.GuildText) {
        await interaction.editReply('❌ Slowmode can only be set on text channels');
        return;
      }

      try {
        await channel.setRateLimitPerUser(seconds);

        const durationText = seconds === 0 
          ? 'disabled' 
          : seconds < 60 
            ? `${seconds} seconds`
            : seconds < 3600
              ? `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`
              : `${Math.floor(seconds / 3600)} hours ${Math.floor((seconds % 3600) / 60)} minutes`;

        const embed = new EmbedBuilder()
          .setTitle(seconds === 0 ? '✅ Slowmode Disabled' : '⏱️ Slowmode Enabled')
          .setColor(seconds === 0 ? 0x57F287 : 0xFEE75C)
          .addFields([
            { name: '📺 Channel', value: `<#${channel.id}>`, inline: true },
            { name: '⏰ Duration', value: durationText, inline: true },
            { name: '👤 Set By', value: interaction.user.username, inline: true }
          ])
          .setTimestamp();

        if (seconds > 0) {
          embed.addFields({
            name: '💡 Info',
            value: `Users will need to wait ${durationText} between messages in this channel.`,
            inline: false
          });
        }

        await storage.createCommandLog({
          commandName: 'slowmode',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { 
            channel: channel.id, 
            channelName: channel.name,
            seconds 
          },
          result: `Slowmode ${seconds === 0 ? 'disabled' : `set to ${seconds}s`} for #${channel.name}`,
          success: true,
          duration: Date.now() - startTime,
          metadata: {
            channelId: channel.id,
            channelName: channel.name,
            slowmodeSeconds: seconds,
            action: seconds === 0 ? 'disabled' : 'enabled'
          }
        });

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        await storage.createCommandLog({
          commandName: 'slowmode',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { channel: channel.id, seconds },
          result: `Error: ${errorMessage}`,
          success: false,
          duration: Date.now() - startTime,
          metadata: { error: errorMessage }
        });

        await interaction.editReply(`❌ Failed to set slowmode: ${errorMessage}`);
      }

    } catch (error) {
      console.error('Error in slowmode command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await interaction.editReply(`❌ Error: ${errorMessage}`);
    }
  }
};
