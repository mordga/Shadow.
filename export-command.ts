import { ChatInputCommandInteraction, SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const exportCommand = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('📥 Export security logs and reports')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('threats')
        .setDescription('Export threat logs')
        .addStringOption(option =>
          option.setName('format')
            .setDescription('Export format')
            .setRequired(false)
            .addChoices(
              { name: 'JSON', value: 'json' },
              { name: 'CSV', value: 'csv' },
              { name: 'Text', value: 'txt' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('deletions')
        .setDescription('Export message deletion logs')
        .addStringOption(option =>
          option.setName('format')
            .setDescription('Export format')
            .setRequired(false)
            .addChoices(
              { name: 'JSON', value: 'json' },
              { name: 'CSV', value: 'csv' },
              { name: 'Text', value: 'txt' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reputation')
        .setDescription('Export user reputation data')
        .addStringOption(option =>
          option.setName('format')
            .setDescription('Export format')
            .setRequired(false)
            .addChoices(
              { name: 'JSON', value: 'json' },
              { name: 'CSV', value: 'csv' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('full')
        .setDescription('Export complete security report (all data)')
        .addStringOption(option =>
          option.setName('format')
            .setDescription('Export format')
            .setRequired(false)
            .addChoices(
              { name: 'JSON', value: 'json' },
              { name: 'Text Report', value: 'txt' }
            ))),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply({ ephemeral: true });

    try {
      const subcommand = interaction.options.getSubcommand();
      const format = interaction.options.getString('format') || 'json';
      const serverId = interaction.guildId || '';
      const serverName = interaction.guild?.name || '';

      if (!serverId) {
        await interaction.editReply({ content: '❌ This command can only be used in a server' });
        return;
      }

      let fileContent: string;
      let fileName: string;

      switch (subcommand) {
        case 'threats': {
          const threats = await storage.getThreats(1000);
          const serverThreats = threats.filter(t => t.serverId === serverId);

          if (format === 'json') {
            fileContent = JSON.stringify(serverThreats, null, 2);
            fileName = `threats_${serverId}_${Date.now()}.json`;
          } else if (format === 'csv') {
            fileContent = this.threatsToCSV(serverThreats);
            fileName = `threats_${serverId}_${Date.now()}.csv`;
          } else {
            fileContent = this.threatsToText(serverThreats);
            fileName = `threats_${serverId}_${Date.now()}.txt`;
          }
          break;
        }

        case 'deletions': {
          const deletions = await storage.getMessageDeletions({ serverId, limit: 1000 });

          if (format === 'json') {
            fileContent = JSON.stringify(deletions, null, 2);
            fileName = `deletions_${serverId}_${Date.now()}.json`;
          } else if (format === 'csv') {
            fileContent = this.deletionsToCSV(deletions);
            fileName = `deletions_${serverId}_${Date.now()}.csv`;
          } else {
            fileContent = this.deletionsToText(deletions);
            fileName = `deletions_${serverId}_${Date.now()}.txt`;
          }
          break;
        }

        case 'reputation': {
          const reputations = await storage.getAllReputations(serverId);

          if (format === 'json') {
            fileContent = JSON.stringify(reputations, null, 2);
            fileName = `reputation_${serverId}_${Date.now()}.json`;
          } else {
            fileContent = this.reputationToCSV(reputations);
            fileName = `reputation_${serverId}_${Date.now()}.csv`;
          }
          break;
        }

        case 'full': {
          const threats = await storage.getThreats(1000);
          const serverThreats = threats.filter(t => t.serverId === serverId);
          const deletions = await storage.getMessageDeletions({ serverId, limit: 1000 });
          const reputations = await storage.getAllReputations(serverId);
          const commandLogs = await storage.getCommandLogs({ serverId, limit: 500 });
          const traces = await storage.getMessageTraces({ serverId, limit: 1000 });

          const fullData = {
            exportDate: new Date().toISOString(),
            serverName,
            serverId,
            data: {
              threats: serverThreats,
              deletions,
              reputations,
              commandLogs,
              messageTraces: traces
            },
            summary: {
              totalThreats: serverThreats.length,
              totalDeletions: deletions.length,
              totalUsers: reputations.length,
              totalCommands: commandLogs.length,
              totalMessages: traces.length
            }
          };

          if (format === 'json') {
            fileContent = JSON.stringify(fullData, null, 2);
            fileName = `full_report_${serverId}_${Date.now()}.json`;
          } else {
            fileContent = this.fullDataToText(fullData);
            fileName = `full_report_${serverId}_${Date.now()}.txt`;
          }
          break;
        }

        default:
          await interaction.editReply({ content: '❌ Invalid subcommand' });
          return;
      }

      const buffer = Buffer.from(fileContent, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: fileName });

      await interaction.editReply({ 
        content: `✅ Export complete! File: **${fileName}** (${(buffer.length / 1024).toFixed(2)} KB)`,
        files: [attachment]
      });

      await storage.createCommandLog({
        commandName: 'export',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { subcommand, format },
        result: `Exported ${fileName}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand, format, fileSize: buffer.length }
      });

    } catch (error) {
      console.error('Error in export command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error exporting data: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'export',
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

  threatsToCSV(threats: any[]): string {
    const headers = 'Timestamp,Type,Severity,Action,User,Username,Description\n';
    const rows = threats.map(t => 
      `${t.timestamp},${t.type},${t.severity},${t.action},${t.userId || 'N/A'},${t.username || 'N/A'},"${t.description.replace(/"/g, '""')}"`
    ).join('\n');
    return headers + rows;
  },

  threatsToText(threats: any[]): string {
    let text = `THREAT LOG EXPORT\nTotal Threats: ${threats.length}\n\n`;
    text += '='.repeat(80) + '\n\n';
    
    threats.forEach((t, i) => {
      text += `[${i + 1}] ${new Date(t.timestamp).toISOString()}\n`;
      text += `Type: ${t.type} | Severity: ${t.severity} | Action: ${t.action}\n`;
      text += `User: ${t.username || 'Unknown'} (${t.userId || 'N/A'})\n`;
      text += `Description: ${t.description}\n`;
      text += '-'.repeat(80) + '\n\n';
    });
    
    return text;
  },

  deletionsToCSV(deletions: any[]): string {
    const headers = 'Timestamp,User,Username,Channel,Reason,ThreatType,Confidence,Content\n';
    const rows = deletions.map(d => 
      `${d.timestamp},${d.userId},${d.username},${d.channelName},${d.reason},${d.threatType},${d.confidence},"${d.content.replace(/"/g, '""').substring(0, 200)}"`
    ).join('\n');
    return headers + rows;
  },

  deletionsToText(deletions: any[]): string {
    let text = `MESSAGE DELETION LOG\nTotal Deletions: ${deletions.length}\n\n`;
    text += '='.repeat(80) + '\n\n';
    
    deletions.forEach((d, i) => {
      text += `[${i + 1}] ${new Date(d.timestamp).toISOString()}\n`;
      text += `User: ${d.username} (${d.userId}) in #${d.channelName}\n`;
      text += `Reason: ${d.reason}\n`;
      text += `Threat Type: ${d.threatType} | Confidence: ${d.confidence}%\n`;
      text += `Content: ${d.content.substring(0, 200)}\n`;
      text += '-'.repeat(80) + '\n\n';
    });
    
    return text;
  },

  reputationToCSV(reputations: any[]): string {
    const headers = 'UserId,Username,Score,Violations,PositiveActions,TrustLevel,LastUpdate\n';
    const rows = reputations.map(r => 
      `${r.userId},${r.username},${r.score},${r.violations},${r.positiveActions},${r.trustLevel},${r.lastUpdate}`
    ).join('\n');
    return headers + rows;
  },

  fullDataToText(data: any): string {
    let text = `FULL SECURITY REPORT\n`;
    text += `Export Date: ${data.exportDate}\n`;
    text += `Server: ${data.serverName} (${data.serverId})\n\n`;
    text += '='.repeat(80) + '\n\n';
    
    text += `SUMMARY\n`;
    text += `- Total Threats: ${data.summary.totalThreats}\n`;
    text += `- Total Deletions: ${data.summary.totalDeletions}\n`;
    text += `- Total Users Tracked: ${data.summary.totalUsers}\n`;
    text += `- Total Commands Executed: ${data.summary.totalCommands}\n`;
    text += `- Total Messages Processed: ${data.summary.totalMessages}\n\n`;
    text += '='.repeat(80) + '\n\n';
    
    text += this.threatsToText(data.data.threats);
    text += '\n' + '='.repeat(80) + '\n\n';
    text += this.deletionsToText(data.data.deletions);
    
    return text;
  }
};
