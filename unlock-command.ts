import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, TextChannel } from 'discord.js';
import { storage } from '../../storage';

export const unlockCommand = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Remove server lockdown and restore normal operations')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
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

      const channels = guild.channels.cache.filter(
        channel => channel.type === ChannelType.GuildText
      );

      let unlockedCount = 0;
      const errors: string[] = [];

      for (const [, channel] of Array.from(channels)) {
        try {
          const textChannel = channel as TextChannel;
          await textChannel.permissionOverwrites.edit(guild.id, {
            SendMessages: null
          });
          unlockedCount++;
        } catch (err) {
          errors.push(`Failed to unlock ${channel.name}`);
        }
      }

      await storage.createThreat({
        type: 'unlock_server',
        severity: 'low',
        description: '🔓 SERVER UNLOCKED - Normal operations restored',
        serverId: guild.id,
        serverName: guild.name,
        userId: interaction.user.id,
        username: interaction.user.username,
        action: 'unlock',
        metadata: {
          unlockedBy: interaction.user.id,
          unlockedByUsername: interaction.user.username,
          channelsUnlocked: unlockedCount,
          timestamp: new Date().toISOString()
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('🔓 SERVER UNLOCKED')
        .setDescription('The server lockdown has been removed and normal operations have been restored')
        .setColor(0x00FF00)
        .addFields([
          { name: '⚖️ Moderator', value: interaction.user.username, inline: true },
          { name: '📺 Channels Unlocked', value: unlockedCount.toString(), inline: true },
          { name: '✅ Status', value: 'Normal Operations Restored', inline: false }
        ])
        .setFooter({ text: `Executed by ${interaction.user.username}` })
        .setTimestamp();

      if (errors.length > 0) {
        embed.addFields({ 
          name: '⚠️ Errors', 
          value: errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n... and ${errors.length - 5} more` : '') 
        });
      }

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'unlock',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: {},
        result: `Server unlocked - ${unlockedCount} channels restored`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          channelsUnlocked: unlockedCount,
          errors: errors.length
        }
      });

    } catch (error) {
      console.error('Error in unlock command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      const guild = interaction.guild;
      if (guild) {
        await storage.createCommandLog({
          commandName: 'unlock',
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
