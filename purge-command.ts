import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, TextChannel, Collection, Message } from 'discord.js';
import { storage } from '../../storage';

export const purgeCommand = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('🗑️ Delete multiple messages from the current channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Only delete messages from this user')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const amount = interaction.options.getInteger('amount', true);
      const targetUser = interaction.options.getUser('user');
      const channel = interaction.channel as TextChannel;

      if (!channel || !channel.isTextBased()) {
        await interaction.editReply('❌ This command can only be used in text channels');
        return;
      }

      const messages = await channel.messages.fetch({ limit: 100 });
      let toDelete: Message[];

      if (targetUser) {
        toDelete = messages.filter(msg => msg.author.id === targetUser.id).first(amount);
      } else {
        toDelete = messages.first(amount);
      }

      // Filtrar mensajes más antiguos de 14 días (limitación de Discord)
      const twoWeeks = 14 * 24 * 60 * 60 * 1000;
      const recent = toDelete.filter(msg => Date.now() - msg.createdTimestamp < twoWeeks);

      if (recent.length === 0) {
        await interaction.editReply('❌ No messages found to delete (messages older than 14 days cannot be bulk deleted)');
        return;
      }

      await channel.bulkDelete(recent, true);

      const embed = new EmbedBuilder()
        .setTitle('🗑️ MESSAGES PURGED')
        .setDescription(`Successfully deleted **${recent.length}** messages`)
        .setColor(0x00FF00)
        .addFields([
          { name: '📺 Channel', value: `<#${channel.id}>`, inline: true },
          { name: '🗑️ Deleted', value: recent.length.toString(), inline: true },
          { name: '⚖️ Moderator', value: interaction.user.username, inline: true }
        ])
        .setFooter({ text: `Purged by ${interaction.user.username}` })
        .setTimestamp();

      if (targetUser) {
        embed.addFields({ name: '👤 Target User', value: `<@${targetUser.id}>`, inline: false });
      }

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'purge',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: { amount, targetUser: targetUser?.id },
        result: `Purged ${recent.length} messages`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          channelId: channel.id,
          channelName: channel.name,
          messagesDeleted: recent.length,
          targetUserId: targetUser?.id
        }
      });

    } catch (error) {
      console.error('Error in purge command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'purge',
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

      await interaction.editReply(`❌ Error purging messages: ${errorMessage}`);
    }
  }
};
