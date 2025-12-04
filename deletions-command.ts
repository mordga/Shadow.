import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const deletionsCommand = {
  data: new SlashCommandBuilder()
    .setName('deletions')
    .setDescription('📊 View message deletion history and statistics')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(subcommand =>
      subcommand
        .setName('recent')
        .setDescription('View recent deleted messages')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of deletions to show (default: 10, max: 50)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('View deleted messages from a specific user')
        .addUserOption(option =>
          option.setName('target')
            .setDescription('User to check deletions for')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of deletions to show (default: 10, max: 50)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('channel')
        .setDescription('View deleted messages from a specific channel')
        .addChannelOption(option =>
          option.setName('target')
            .setDescription('Channel to check deletions for')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of deletions to show (default: 10, max: 50)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View deletion statistics for this server')),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    try {
      const subcommand = interaction.options.getSubcommand();
      const serverId = interaction.guildId || '';
      const serverName = interaction.guild?.name || '';

      if (!serverId) {
        await interaction.editReply({ content: '❌ This command can only be used in a server' });
        return;
      }

      switch (subcommand) {
        case 'recent': {
          const limit = interaction.options.getInteger('limit') || 10;
          const deletions = await storage.getMessageDeletions({ serverId, limit });

          if (deletions.length === 0) {
            await interaction.editReply({ content: '✅ No message deletions found for this server' });
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle('📊 Recent Message Deletions')
            .setDescription(`Showing ${deletions.length} recent deletion(s)`)
            .setColor(0xFF6B6B)
            .setTimestamp();

          for (const deletion of deletions) {
            const timeAgo = this.getTimeAgo(deletion.timestamp);
            embed.addFields({
              name: `🗑️ ${deletion.username} in #${deletion.channelName}`,
              value: `**Reason:** ${deletion.reason}\n**Threat Type:** ${deletion.threatType}\n**Confidence:** ${deletion.confidence}%\n**Content:** ${deletion.content.substring(0, 100)}${deletion.content.length > 100 ? '...' : ''}\n**Time:** ${timeAgo}`,
              inline: false
            });
          }

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'user': {
          const targetUser = interaction.options.getUser('target', true);
          const limit = interaction.options.getInteger('limit') || 10;
          const deletions = await storage.getMessageDeletions({ 
            serverId, 
            userId: targetUser.id, 
            limit 
          });

          if (deletions.length === 0) {
            await interaction.editReply({ 
              content: `✅ No message deletions found for ${targetUser.tag}` 
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle(`📊 Message Deletions for ${targetUser.tag}`)
            .setDescription(`Found ${deletions.length} deletion(s)`)
            .setColor(0xFF6B6B)
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp();

          for (const deletion of deletions) {
            const timeAgo = this.getTimeAgo(deletion.timestamp);
            embed.addFields({
              name: `🗑️ in #${deletion.channelName}`,
              value: `**Reason:** ${deletion.reason}\n**Threat Type:** ${deletion.threatType}\n**Confidence:** ${deletion.confidence}%\n**Content:** ${deletion.content.substring(0, 100)}${deletion.content.length > 100 ? '...' : ''}\n**Time:** ${timeAgo}`,
              inline: false
            });
          }

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'channel': {
          const targetChannel = interaction.options.getChannel('target', true);
          const limit = interaction.options.getInteger('limit') || 10;
          const deletions = await storage.getMessageDeletions({ 
            serverId, 
            channelId: targetChannel.id, 
            limit 
          });

          if (deletions.length === 0) {
            await interaction.editReply({ 
              content: `✅ No message deletions found in ${targetChannel.name}` 
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle(`📊 Message Deletions in #${targetChannel.name}`)
            .setDescription(`Found ${deletions.length} deletion(s)`)
            .setColor(0xFF6B6B)
            .setTimestamp();

          for (const deletion of deletions) {
            const timeAgo = this.getTimeAgo(deletion.timestamp);
            embed.addFields({
              name: `🗑️ ${deletion.username}`,
              value: `**Reason:** ${deletion.reason}\n**Threat Type:** ${deletion.threatType}\n**Confidence:** ${deletion.confidence}%\n**Content:** ${deletion.content.substring(0, 100)}${deletion.content.length > 100 ? '...' : ''}\n**Time:** ${timeAgo}`,
              inline: false
            });
          }

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'stats': {
          const stats = await storage.getMessageDeletionStats(serverId);

          if (stats.total === 0) {
            await interaction.editReply({ 
              content: '✅ No message deletions found for this server' 
            });
            return;
          }

          const topReasons = Object.entries(stats.byReason)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([reason, count]) => `• ${reason.substring(0, 60)}: **${count}**`)
            .join('\n');

          const topThreatTypes = Object.entries(stats.byThreatType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => `• ${type}: **${count}**`)
            .join('\n');

          const embed = new EmbedBuilder()
            .setTitle('📊 Message Deletion Statistics')
            .setDescription(`Total deletions: **${stats.total}**`)
            .setColor(0xFF6B6B)
            .addFields(
              {
                name: '🔝 Top Reasons',
                value: topReasons || 'No data',
                inline: false
              },
              {
                name: '⚠️ Threat Types',
                value: topThreatTypes || 'No data',
                inline: false
              }
            )
            .setFooter({ text: `Server: ${serverName}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }
      }

      await storage.createCommandLog({
        commandName: 'deletions',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { subcommand },
        result: 'Command executed successfully',
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in deletions command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error retrieving deletion data: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'deletions',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || '',
        serverName: interaction.guild?.name || '',
        parameters: {},
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  },

  getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
};
