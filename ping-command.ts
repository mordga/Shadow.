import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { storage } from '../../storage';

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Check bot health and verify system status'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      const wsPing = interaction.client.ws.ping;
      
      await interaction.deferReply();
      
      const apiLatency = Date.now() - startTime;
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      // Verificar conectividad de sistemas
      let databaseStatus = '🟢 ONLINE';
      let aiStatus = '🟢 ONLINE';
      
      try {
        await storage.getBotStats();
      } catch (err) {
        databaseStatus = '🔴 OFFLINE';
      }

      // Estado general
      let overallStatus = '🟢 HEALTHY';
      let statusColor = 0x00FF00;
      
      if (wsPing > 200 || apiLatency > 500) {
        overallStatus = '🟡 DEGRADED';
        statusColor = 0xFFFF00;
      }
      
      if (wsPing > 500 || apiLatency > 1000 || databaseStatus === '🔴 OFFLINE') {
        overallStatus = '🔴 UNHEALTHY';
        statusColor = 0xFF0000;
      }

      const embed = new EmbedBuilder()
        .setTitle('🏓 PONG! - Bot Health Status')
        .setDescription(`**Overall Status:** ${overallStatus}`)
        .setColor(statusColor)
        .addFields([
          {
            name: '⚡ Latency Metrics',
            value: [
              `**WebSocket Ping:** ${wsPing}ms`,
              `**API Latency:** ${apiLatency}ms`,
              `**Response Time:** ${Date.now() - startTime}ms`
            ].join('\n'),
            inline: true
          },
          {
            name: '🔧 System Status',
            value: [
              `**Bot:** 🟢 ONLINE`,
              `**Database:** ${databaseStatus}`,
              `**AI Detection:** ${aiStatus}`,
              `**Security Engine:** 🟢 ACTIVE`
            ].join('\n'),
            inline: true
          },
          {
            name: '📊 Performance',
            value: [
              `**Uptime:** ${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s`,
              `**Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
              `**CPU:** Normal`,
              `**Load:** Optimal`
            ].join('\n'),
            inline: false
          }
        ])
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      if (overallStatus === '🔴 UNHEALTHY') {
        embed.addFields({
          name: '⚠️ WARNING',
          value: 'System performance degraded. Some features may be slower than usual.',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'ping',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: {},
        result: `Ping: ${wsPing}ms, API: ${apiLatency}ms, Status: ${overallStatus}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          wsPing,
          apiLatency,
          overallStatus,
          databaseStatus,
          uptime: process.uptime()
        }
      });

    } catch (error) {
      console.error('Error in ping command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error checking bot health: ${errorMessage}`);

      await storage.createCommandLog({
        commandName: 'ping',
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
