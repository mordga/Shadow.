import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { storage } from '../../storage';

export const traceCommand = {
  data: new SlashCommandBuilder()
    .setName('trace')
    .setDescription('View command execution trace for sensitive commands')
    .addStringOption(option =>
      option.setName('command_id')
        .setDescription('Command execution ID to trace')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of recent traces to show')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const commandId = interaction.options.getString('command_id');
      const limit = interaction.options.getInteger('limit') || 10;
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      if (commandId) {
        const commandLog = await storage.getCommandLogById(commandId);
        
        if (!commandLog) {
          await interaction.editReply({
            content: `❌ Command with ID \`${commandId}\` not found.`
          });
          
          await storage.createCommandLog({
            commandName: 'trace',
            executedBy: interaction.user.tag,
            userId: interaction.user.id,
            username: interaction.user.username,
            serverId,
            serverName,
            parameters: { command_id: commandId },
            result: 'Command not found',
            success: false,
            duration: Date.now() - startTime,
            metadata: { commandId }
          });
          return;
        }

        const statusEmoji = commandLog.success ? '✅' : '❌';
        const embedColor = commandLog.success ? 0x57F287 : 0xED4245;
        
        const detailEmbed = new EmbedBuilder()
          .setTitle(`${statusEmoji} Command Trace Details`)
          .setColor(embedColor)
          .addFields([
            { name: '🆔 Command ID', value: `\`${commandLog.id}\``, inline: false },
            { name: '📝 Command', value: `\`/${commandLog.commandName}\``, inline: true },
            { name: '👤 Executor', value: commandLog.executedBy, inline: true },
            { name: '🎯 User ID', value: commandLog.userId, inline: true },
            { name: '🏢 Server', value: commandLog.serverName, inline: true },
            { name: '⏱️ Duration', value: `${commandLog.duration}ms`, inline: true },
            { name: '📊 Status', value: commandLog.success ? 'Success' : 'Failed', inline: true },
            { name: '⏰ Executed At', value: `<t:${Math.floor(commandLog.executedAt.getTime() / 1000)}:F>`, inline: false },
          ]);

        if (commandLog.parameters) {
          const params = typeof commandLog.parameters === 'string' 
            ? commandLog.parameters 
            : JSON.stringify(commandLog.parameters, null, 2);
          detailEmbed.addFields({
            name: '⚙️ Parameters',
            value: `\`\`\`json\n${params}\`\`\``,
            inline: false
          });
        }

        if (commandLog.result) {
          detailEmbed.addFields({
            name: '📄 Result',
            value: commandLog.result.length > 1000 
              ? commandLog.result.substring(0, 997) + '...' 
              : commandLog.result,
            inline: false
          });
        }

        if (commandLog.metadata) {
          const metadata = typeof commandLog.metadata === 'string'
            ? commandLog.metadata
            : JSON.stringify(commandLog.metadata, null, 2);
          detailEmbed.addFields({
            name: '🔍 Metadata',
            value: `\`\`\`json\n${metadata}\`\`\``,
            inline: false
          });
        }

        detailEmbed.setTimestamp();

        await interaction.editReply({ embeds: [detailEmbed] });
      } else {
        const commandLogs = await storage.getCommandLogs({ limit });
        
        if (commandLogs.length === 0) {
          await interaction.editReply({
            content: '📋 No command logs found.'
          });
          
          await storage.createCommandLog({
            commandName: 'trace',
            executedBy: interaction.user.tag,
            userId: interaction.user.id,
            username: interaction.user.username,
            serverId,
            serverName,
            parameters: { limit },
            result: 'No logs found',
            success: true,
            duration: Date.now() - startTime,
            metadata: { limit }
          });
          return;
        }

        const traceList = commandLogs.map((log, index) => {
          const statusEmoji = log.success ? '✅' : '❌';
          const timeAgo = Math.floor((Date.now() - log.executedAt.getTime()) / 1000);
          const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : 
                         timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}m ago` :
                         `${Math.floor(timeAgo / 3600)}h ago`;
          
          const resultPreview = log.result 
            ? (log.result.length > 50 ? log.result.substring(0, 47) + '...' : log.result)
            : 'No result';

          return [
            `**${index + 1}.** ${statusEmoji} \`/${log.commandName}\``,
            `   👤 ${log.username} | ⏱️ ${log.duration}ms | 🕐 ${timeStr}`,
            `   📄 ${resultPreview}`,
            `   🆔 ID: \`${log.id}\``
          ].join('\n');
        }).join('\n\n');

        const listEmbed = new EmbedBuilder()
          .setTitle('📋 Recent Command Execution Trace')
          .setDescription(traceList)
          .setColor(0x5865F2)
          .setFooter({ text: `Showing ${commandLogs.length} most recent commands` })
          .setTimestamp();

        await interaction.editReply({ embeds: [listEmbed] });
      }

      await storage.createCommandLog({
        commandName: 'trace',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { command_id: commandId, limit },
        result: commandId ? `Traced command ${commandId}` : `Listed ${limit} commands`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { commandId, limit }
      });

    } catch (error) {
      console.error('Error in trace command:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error retrieving command trace: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'trace',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: { 
          command_id: interaction.options.getString('command_id'),
          limit: interaction.options.getInteger('limit') 
        },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
