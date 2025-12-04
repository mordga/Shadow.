import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, GuildChannel } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface PendingPurge {
  channels: GuildChannel[];
  pattern: string;
  userId: string;
  guildId: string;
  expiresAt: number;
}

const pendingPurges = new Map<string, PendingPurge>();

export const purgechannelsCommand = {
  data: new SlashCommandBuilder()
    .setName('purge-channels')
    .setDescription('Delete channels by specific criteria (1-10 channels)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(option =>
      option.setName('pattern')
        .setDescription('Pattern to match channel names (e.g., "spam", "raid")')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Maximum channels to delete (1-10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of channels to delete')
        .addChoices(
          { name: 'All Types', value: 'all' },
          { name: 'Text Channels Only', value: 'text' },
          { name: 'Voice Channels Only', value: 'voice' },
          { name: 'Announcement Channels Only', value: 'announcement' }
        )
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('include_categories')
        .setDescription('Include category channels in deletion')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const pattern = interaction.options.getString('pattern', true).toLowerCase();
      const limit = interaction.options.getInteger('limit') || 5;
      const channelType = interaction.options.getString('type') || 'all';
      const includeCategories = interaction.options.getBoolean('include_categories') ?? false;
      const guildId = interaction.guildId;

      if (!guildId) {
        await interaction.editReply('This command can only be used in a server');
        return;
      }

      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) {
        await interaction.editReply('Could not access server information. Please try again.');
        return;
      }

      const allowedTypes: ChannelType[] = [];
      if (channelType === 'all' || channelType === 'text') {
        allowedTypes.push(ChannelType.GuildText);
      }
      if (channelType === 'all' || channelType === 'voice') {
        allowedTypes.push(ChannelType.GuildVoice);
      }
      if (channelType === 'all' || channelType === 'announcement') {
        allowedTypes.push(ChannelType.GuildAnnouncement);
      }
      if (includeCategories) {
        allowedTypes.push(ChannelType.GuildCategory);
      }

      const matchingChannels = guild.channels.cache.filter(channel => 
        channel.name.toLowerCase().includes(pattern) &&
        allowedTypes.includes(channel.type) &&
        channel.id !== interaction.channelId
      );

      if (matchingChannels.size === 0) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('No Channels Found')
            .setDescription(`No channels found matching pattern: **${pattern}**`)
            .addFields({
              name: 'Search Criteria',
              value: `Pattern: \`${pattern}\`\nType: ${channelType}\nInclude Categories: ${includeCategories ? 'Yes' : 'No'}`,
              inline: false
            })
            .setTimestamp()
          ]
        });
        return;
      }

      const channelsToDelete = matchingChannels.first(limit) as GuildChannel[];
      const channelInfo = channelsToDelete.map(c => {
        let typeEmoji = 'OTRO';
        if (c.type === ChannelType.GuildText) typeEmoji = '#';
        else if (c.type === ChannelType.GuildVoice) typeEmoji = 'VOZ';
        else if (c.type === ChannelType.GuildAnnouncement) typeEmoji = 'ANUNCIO';
        else if (c.type === ChannelType.GuildCategory) typeEmoji = 'CATEGORIA';
        return `${typeEmoji} **${c.name}**`;
      }).join('\n');

      const purgeId = `purge_${interaction.user.id}_${Date.now()}`;
      pendingPurges.set(purgeId, {
        channels: channelsToDelete,
        pattern,
        userId: interaction.user.id,
        guildId: guild.id,
        expiresAt: Date.now() + 60000
      });

      setTimeout(() => {
        pendingPurges.delete(purgeId);
      }, 60000);

      const confirmButton = new ButtonBuilder()
        .setCustomId(`confirm_purge_${purgeId}`)
        .setLabel(`DELETE ${channelsToDelete.length} CHANNELS`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️');

      const cancelButton = new ButtonBuilder()
        .setCustomId(`cancel_purge_${purgeId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌');

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmButton, cancelButton);

      const confirmEmbed = new EmbedBuilder()
        .setTitle('CONFIRM CHANNEL DELETION')
        .setDescription(`**${channelsToDelete.length}** channels will be permanently deleted`)
        .setColor(0xFF0000)
        .addFields([
          { name: 'Pattern', value: `\`${pattern}\``, inline: true },
          { name: 'To Delete', value: channelsToDelete.length.toString(), inline: true },
          { name: 'Found Total', value: matchingChannels.size.toString(), inline: true },
          { name: 'Channels', value: channelInfo.length > 1000 ? `${channelInfo.substring(0, 997)}...` : channelInfo, inline: false },
          { name: 'WARNING', value: '**This action cannot be undone!**\nAll messages and history in these channels will be permanently lost.', inline: false },
          { name: 'Expiration', value: 'This confirmation expires in 60 seconds', inline: false }
        ])
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      const response = await interaction.editReply({ 
        embeds: [confirmEmbed],
        components: [row]
      });

      try {
        const buttonInteraction = await response.awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === interaction.user.id,
          time: 60000
        });

        if (buttonInteraction.customId.startsWith('confirm_purge_')) {
          await buttonInteraction.deferUpdate();

          const pendingData = pendingPurges.get(purgeId);
          if (!pendingData || Date.now() > pendingData.expiresAt) {
            await interaction.editReply({
              embeds: [new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Request Expired')
                .setDescription('The purge request has expired. Please run the command again.')
                .setTimestamp()
              ],
              components: []
            });
            return;
          }

          const deletedChannels: string[] = [];
          const failedChannels: { name: string; error: string }[] = [];

          const progressEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('Deleting Channels...')
            .setDescription(`Processing ${pendingData.channels.length} channels...`)
            .setTimestamp();

          await interaction.editReply({ embeds: [progressEmbed], components: [] });

          for (const channel of pendingData.channels) {
            try {
              const channelName = channel.name;
              await channel.delete(`Purge-channels by ${interaction.user.tag} - Pattern: ${pattern}`);
              deletedChannels.push(channelName);
              
              await fileLogger.security('purge-channels', `Channel deleted: ${channelName}`, {
                channelId: channel.id,
                channelName,
                deletedBy: interaction.user.id,
                pattern
              });
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : 'Unknown error';
              failedChannels.push({ name: channel.name, error: errorMsg });
              
              await fileLogger.error('purge-channels', `Failed to delete channel: ${channel.name}`, {
                channelId: channel.id,
                error: errorMsg
              });
            }
          }

          pendingPurges.delete(purgeId);

          const resultEmbed = new EmbedBuilder()
            .setTitle('Channel Purge Complete')
            .setColor(failedChannels.length > 0 ? 0xFFA500 : 0x00FF00)
            .addFields([
              { name: 'Deleted', value: deletedChannels.length.toString(), inline: true },
              { name: 'Failed', value: failedChannels.length.toString(), inline: true },
              { name: 'Pattern', value: `\`${pattern}\``, inline: true }
            ])
            .setTimestamp();

          if (deletedChannels.length > 0) {
            resultEmbed.addFields({
              name: 'Deleted Channels',
              value: deletedChannels.slice(0, 10).map(n => `#${n}`).join('\n') + 
                     (deletedChannels.length > 10 ? `\n... and ${deletedChannels.length - 10} more` : ''),
              inline: false
            });
          }

          if (failedChannels.length > 0) {
            resultEmbed.addFields({
              name: 'Failed Deletions',
              value: failedChannels.slice(0, 5).map(f => `#${f.name}: ${f.error}`).join('\n'),
              inline: false
            });
          }

          await interaction.editReply({ embeds: [resultEmbed], components: [] });

          await storage.createCommandLog({
            commandName: 'purge-channels',
            executedBy: interaction.user.tag,
            userId: interaction.user.id,
            username: interaction.user.username,
            serverId: guild.id,
            serverName: guild.name,
            parameters: { pattern, limit, type: channelType },
            result: `Deleted ${deletedChannels.length} channels, ${failedChannels.length} failed`,
            success: true,
            duration: Date.now() - startTime,
            metadata: {
              pattern,
              deletedCount: deletedChannels.length,
              failedCount: failedChannels.length,
              deletedChannels,
              failedChannels
            }
          });

          await storage.createThreat({
            type: 'channel_purge',
            severity: 'medium',
            description: `Mass channel deletion: ${deletedChannels.length} channels removed matching pattern "${pattern}"`,
            serverId: guild.id,
            serverName: guild.name,
            action: 'log',
            metadata: {
              executedBy: interaction.user.id,
              pattern,
              deletedChannels
            }
          });

        } else if (buttonInteraction.customId.startsWith('cancel_purge_')) {
          pendingPurges.delete(purgeId);

          await buttonInteraction.update({
            embeds: [new EmbedBuilder()
              .setColor(0x808080)
              .setTitle('Purge Cancelled')
              .setDescription('Channel deletion has been cancelled. No channels were deleted.')
              .setTimestamp()
            ],
            components: []
          });

          await storage.createCommandLog({
            commandName: 'purge-channels',
            executedBy: interaction.user.tag,
            userId: interaction.user.id,
            username: interaction.user.username,
            serverId: guild.id,
            serverName: guild.name,
            parameters: { pattern, limit },
            result: 'Cancelled by user',
            success: true,
            duration: Date.now() - startTime,
            metadata: { cancelled: true }
          });
        }

      } catch (error) {
        pendingPurges.delete(purgeId);

        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0x808080)
            .setTitle('Request Expired')
            .setDescription('No response received within 60 seconds. The purge request has been cancelled.')
            .setTimestamp()
          ],
          components: []
        });
      }

    } catch (error) {
      console.error('Error in purge-channels command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await fileLogger.error('purge-channels', 'Command execution failed', {
        error: errorMessage,
        userId: interaction.user.id,
        guildId: interaction.guildId
      });

      await storage.createCommandLog({
        commandName: 'purge-channels',
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

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Error')
        .setDescription(`Failed to execute purge-channels: ${errorMessage}`)
        .setTimestamp();

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed], components: [] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
};
