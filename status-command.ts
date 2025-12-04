import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { storage } from '../../storage';

export const statusCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show comprehensive bot activity and system status'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      const systemHealth = await storage.getSystemHealth();
      const botStats = await storage.getBotStats();
      const threats = await storage.getActiveThreats();
      const quarantinedUsers = await storage.getQuarantinedUsers();
      const recentCommands = await storage.getCommandLogs({ limit: 10 });
      
      const activeQuarantined = quarantinedUsers.filter(q => !q.released).length;
      const serverThreats = serverId !== 'DM' 
        ? threats.filter(t => t.serverId === serverId).length 
        : threats.length;

      let systemStatus = 'operational';
      let embedColor = 0x57F287;
      let statusEmoji = '✅';

      if (systemHealth?.cpuUsage && systemHealth.cpuUsage > 80) {
        systemStatus = 'warning';
        embedColor = 0xFEE75C;
        statusEmoji = '⚠️';
      }

      if (systemHealth?.ramUsage && systemHealth.ramUsage > 90) {
        systemStatus = 'critical';
        embedColor = 0xED4245;
        statusEmoji = '🔴';
      }

      if (threats.length > 10) {
        systemStatus = 'warning';
        embedColor = 0xFEE75C;
        statusEmoji = '⚠️';
      }

      const protectionModules = systemHealth?.protectionModules as any || {
        antiRaid: 'active',
        nsfwDetection: 'active',
        spamFilter: 'active',
        bypassDetection: 'learning'
      };

      const getModuleEmoji = (status: string) => {
        switch(status) {
          case 'active': return '🟢';
          case 'learning': return '🟡';
          case 'inactive': return '🔴';
          default: return '⚪';
        }
      };

      const wsStatus = interaction.client.ws.ping >= 0 ? 'Connected' : 'Disconnected';
      const wsEmoji = interaction.client.ws.ping >= 0 ? '🟢' : '🔴';

      const statusEmbed = new EmbedBuilder()
        .setTitle(`${statusEmoji} System Status - ${systemStatus.toUpperCase()}`)
        .setColor(embedColor)
        .addFields([
          {
            name: '💻 System Health',
            value: [
              `**CPU Usage:** ${systemHealth?.cpuUsage || 0}%`,
              `**RAM Usage:** ${systemHealth?.ramUsage || 0}%`,
              `**Network I/O:** ${systemHealth?.networkIO || '0KB/s'}`,
              `**Uptime:** ${botStats?.uptime || '0d 0h 0m'}`
            ].join('\n'),
            inline: false
          },
          {
            name: '🛡️ Protection Modules',
            value: [
              `${getModuleEmoji(protectionModules.antiRaid)} **Anti-Raid:** ${protectionModules.antiRaid}`,
              `${getModuleEmoji(protectionModules.nsfwDetection)} **NSFW Detection:** ${protectionModules.nsfwDetection}`,
              `${getModuleEmoji(protectionModules.spamFilter)} **Spam Filter:** ${protectionModules.spamFilter}`,
              `${getModuleEmoji(protectionModules.bypassDetection)} **Bypass Detection:** ${protectionModules.bypassDetection}`
            ].join('\n'),
            inline: false
          },
          {
            name: '📊 Activity Summary',
            value: [
              `**Active Threats:** ${serverThreats}`,
              `**Quarantined Users:** ${activeQuarantined}`,
              `**Total Threats Blocked:** ${botStats?.threatsBlocked || 0}`,
              `**Detection Rate:** ${botStats?.detectionRate || '0%'}`
            ].join('\n'),
            inline: false
          },
          {
            name: '🌐 Connection Status',
            value: [
              `${wsEmoji} **WebSocket:** ${wsStatus}`,
              `**Ping:** ${interaction.client.ws.ping}ms`,
              `**API Latency:** ${botStats?.apiLatency || '0ms'}`
            ].join('\n'),
            inline: false
          }
        ]);

      if (recentCommands.length > 0) {
        const commandList = recentCommands.slice(0, 5).map((cmd, index) => {
          const successEmoji = cmd.success ? '✅' : '❌';
          const timeAgo = Math.floor((Date.now() - cmd.executedAt.getTime()) / 1000);
          const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : `${Math.floor(timeAgo / 60)}m ago`;
          return `${successEmoji} \`/${cmd.commandName}\` by ${cmd.username} - ${timeStr}`;
        }).join('\n');

        statusEmbed.addFields({
          name: '📝 Recent Command Activity',
          value: commandList || 'No recent commands',
          inline: false
        });
      }

      statusEmbed.setTimestamp()
        .setFooter({ text: `System Status: ${systemStatus}` });

      await interaction.editReply({ embeds: [statusEmbed] });

      await storage.createCommandLog({
        commandName: 'status',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: {},
        result: `Status displayed: ${systemStatus}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { 
          systemStatus,
          activeThreats: serverThreats,
          quarantinedUsers: activeQuarantined 
        }
      });

    } catch (error) {
      console.error('Error in status command:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error retrieving system status: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'status',
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
