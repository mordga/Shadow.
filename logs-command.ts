import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const logsCommand = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('📜 View filtered logs by user, event type, or time period')
    .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of logs to view')
        .addChoices(
          { name: 'Commands', value: 'commands' },
          { name: 'Threats', value: 'threats' },
          { name: 'Quarantines', value: 'quarantines' },
          { name: 'All', value: 'all' }
        )
        .setRequired(false))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Filter by user')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of logs to show (1-50)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const type = interaction.options.getString('type') || 'all';
      const targetUser = interaction.options.getUser('user');
      const limit = interaction.options.getInteger('limit') || 10;
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      const embeds: EmbedBuilder[] = [];

      if (type === 'commands' || type === 'all') {
        const commandLogs = await storage.getCommandLogs({ limit: limit * 2 });
        let filtered = commandLogs;
        
        if (targetUser) {
          filtered = filtered.filter(log => log.userId === targetUser.id);
        }
        
        filtered = filtered.slice(0, limit);

        if (filtered.length > 0) {
          const commandEmbed = new EmbedBuilder()
            .setTitle('📜 Command Logs')
            .setColor(0x5865F2)
            .setDescription(filtered.map((log, index) => {
              const statusEmoji = log.success ? '✅' : '❌';
              const timeAgo = Math.floor((Date.now() - log.executedAt.getTime()) / 1000);
              const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : 
                             timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}m ago` :
                             `${Math.floor(timeAgo / 3600)}h ago`;
              return `**${index + 1}.** ${statusEmoji} \`/${log.commandName}\` by ${log.username} - ${timeStr}`;
            }).join('\n'))
            .setFooter({ text: `Showing ${filtered.length} command logs` });
          
          embeds.push(commandEmbed);
        }
      }

      if (type === 'threats' || type === 'all') {
        const threats = await storage.getThreats(limit * 3);
        let filtered = threats;
        
        if (targetUser) {
          filtered = filtered.filter(t => t.userId === targetUser.id);
        }
        
        filtered = filtered.slice(0, limit);

        if (filtered.length > 0) {
          const threatEmbed = new EmbedBuilder()
            .setTitle('🚨 Threat Logs')
            .setColor(0xED4245)
            .setDescription(filtered.map((threat, index) => {
              const severityEmoji = {
                'critical': '🔴',
                'high': '🟠',
                'medium': '🟡',
                'low': '🟢'
              }[threat.severity] || '⚪';
              const timeAgo = Math.floor((Date.now() - threat.timestamp.getTime()) / 1000);
              const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : 
                             timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}m ago` :
                             `${Math.floor(timeAgo / 3600)}h ago`;
              const status = threat.resolved ? '✅' : '⚠️';
              return `**${index + 1}.** ${severityEmoji} ${status} **${threat.type}** - ${threat.username || 'Unknown'} - ${timeStr}`;
            }).join('\n'))
            .setFooter({ text: `Showing ${filtered.length} threat logs` });
          
          embeds.push(threatEmbed);
        }
      }

      if (type === 'quarantines' || type === 'all') {
        const quarantines = await storage.getQuarantinedUsers(serverId);
        let filtered = quarantines;
        
        if (targetUser) {
          filtered = filtered.filter(q => q.userId === targetUser.id);
        }
        
        filtered = filtered.slice(0, limit);

        if (filtered.length > 0) {
          const quarantineEmbed = new EmbedBuilder()
            .setTitle('🔒 Quarantine Logs')
            .setColor(0xFF6600)
            .setDescription(filtered.map((q, index) => {
              const status = q.released ? '✅ Released' : '🔒 Active';
              const timeAgo = Math.floor((Date.now() - q.quarantinedAt.getTime()) / 1000);
              const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : 
                             timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}m ago` :
                             `${Math.floor(timeAgo / 3600)}h ago`;
              return `**${index + 1}.** ${status} - ${q.username} - ${timeStr}\n   Reason: ${q.reason}`;
            }).join('\n\n'))
            .setFooter({ text: `Showing ${filtered.length} quarantine logs` });
          
          embeds.push(quarantineEmbed);
        }
      }

      if (embeds.length === 0) {
        await interaction.editReply('No logs found matching the specified criteria.');
        return;
      }

      await interaction.editReply({ embeds });

      await storage.createCommandLog({
        commandName: 'logs',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { type, targetUser: targetUser?.id, limit },
        result: `Displayed ${embeds.length} log categories`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { type, limit, targetUserId: targetUser?.id }
      });

    } catch (error) {
      console.error('Error in logs command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error fetching logs: ${errorMessage}`);

      await storage.createCommandLog({
        commandName: 'logs',
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
    }
  }
};
