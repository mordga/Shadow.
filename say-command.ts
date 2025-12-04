import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ChannelType, TextChannel, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const sayCommand = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a custom message or embed to any channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send message to')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Message content')
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('embed')
        .setDescription('Send as an embed (default: false)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Embed color (hex code, e.g., #ff0000)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Embed title (optional)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('image')
        .setDescription('Image URL for embed (optional)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('thumbnail')
        .setDescription('Thumbnail URL for embed (optional)')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const channel = interaction.options.getChannel('channel', true) as TextChannel;
      const message = interaction.options.getString('message', true);
      const useEmbed = interaction.options.getBoolean('embed') || false;
      const colorHex = interaction.options.getString('color');
      const title = interaction.options.getString('title');
      const imageUrl = interaction.options.getString('image');
      const thumbnailUrl = interaction.options.getString('thumbnail');
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      if (!channel.isTextBased()) {
        await interaction.editReply('❌ The selected channel must be a text channel');
        return;
      }

      // Check if bot has permission to send messages in the channel
      const botPermissions = channel.permissionsFor(interaction.client.user!);
      if (!botPermissions?.has(PermissionFlagsBits.SendMessages)) {
        await interaction.editReply(`❌ I don't have permission to send messages in <#${channel.id}>. Please give me Send Messages permission.`);
        return;
      }

      let embedColor = 0x5865F2;
      if (colorHex) {
        const cleanHex = colorHex.replace('#', '');
        const parsedColor = parseInt(cleanHex, 16);
        if (!isNaN(parsedColor) && cleanHex.length === 6) {
          embedColor = parsedColor;
        }
      }

      try {
        if (useEmbed) {
          const embed = new EmbedBuilder()
            .setDescription(message)
            .setColor(embedColor)
            .setTimestamp()
            .setFooter({ text: `Sent by ${interaction.user.username}` });

          if (title) {
            embed.setTitle(title);
          }

          if (imageUrl) {
            embed.setImage(imageUrl);
          }

          if (thumbnailUrl) {
            embed.setThumbnail(thumbnailUrl);
          }

          await channel.send({ embeds: [embed] });
        } else {
          await channel.send(message);
        }

        await storage.createCommandLog({
          commandName: 'say',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { 
            channel: channel.id, 
            channelName: channel.name,
            message: message.substring(0, 100),
            useEmbed 
          },
          result: `Message sent to #${channel.name}`,
          success: true,
          duration: Date.now() - startTime,
          metadata: {
            channelId: channel.id,
            channelName: channel.name,
            messageLength: message.length,
            useEmbed,
            color: colorHex,
            title,
            image: imageUrl,
            thumbnail: thumbnailUrl
          }
        });

        await interaction.deleteReply().catch(console.error);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        await storage.createCommandLog({
          commandName: 'say',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { channel: channel.id },
          result: `Error: ${errorMessage}`,
          success: false,
          duration: Date.now() - startTime,
          metadata: { error: errorMessage }
        });

        await interaction.editReply(`❌ Failed to send message: ${errorMessage}`);
      }

    } catch (error) {
      console.error('Error in say command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await interaction.editReply(`❌ Error: ${errorMessage}`);
    }
  }
};
