import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getHealthMonitor } from '../../services/health-monitor';
import { storage } from '../../storage';

export const data = new SlashCommandBuilder()
  .setName('health')
  .setDescription('Display system health status and service monitoring dashboard')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const healthMonitor = getHealthMonitor();
    
    if (!healthMonitor || !healthMonitor.isRunningStatus()) {
      await interaction.editReply({
        content: '❌ Health Monitor is not running. System monitoring is unavailable.',
      });
      return;
    }

    const allHealth = healthMonitor.getAllHealth();
    const overallHealth = healthMonitor.getOverallHealth();
    const monitorUptime = healthMonitor.getMonitorUptime();

    const uptimeMs = monitorUptime;
    const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const uptimeFormatted = `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`;

    const statusEmoji = overallHealth.allHealthy ? '🟢' : 
                       overallHealth.unhealthy > 0 ? '🔴' : '🟡';
    
    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji} System Health Dashboard`)
      .setColor(overallHealth.allHealthy ? 0x00ff00 : 
                overallHealth.unhealthy > 0 ? 0xff0000 : 0xffff00)
      .setDescription(`**Overall Status:** ${overallHealth.allHealthy ? 'All Systems Operational' : 'Issues Detected'}`)
      .addFields(
        {
          name: '📊 System Overview',
          value: [
            `✅ Healthy: **${overallHealth.healthy}** / ${overallHealth.total}`,
            `⚠️ Degraded: **${overallHealth.degraded}**`,
            `❌ Unhealthy: **${overallHealth.unhealthy}**`,
            `⏱️ Monitor Uptime: **${uptimeFormatted}**`
          ].join('\n'),
          inline: false
        }
      );

    for (const [moduleName, metrics] of Object.entries(allHealth)) {
      const statusIcon = metrics.status === 'healthy' ? '✅' : 
                        metrics.status === 'degraded' ? '⚠️' : '❌';
      
      const successRate = metrics.totalChecks > 0 
        ? ((metrics.successfulChecks / metrics.totalChecks) * 100).toFixed(1)
        : '0.0';

      const moduleUptime = metrics.lastHealthyTime 
        ? Math.floor((Date.now() - metrics.lastHealthyTime.getTime()) / 1000)
        : 0;

      const moduleUptimeFormatted = moduleUptime < 60 ? `${moduleUptime}s` :
                                   moduleUptime < 3600 ? `${Math.floor(moduleUptime / 60)}m` :
                                   `${Math.floor(moduleUptime / 3600)}h`;

      const fieldValue = [
        `**Status:** ${statusIcon} ${metrics.status.toUpperCase()}`,
        `**Latency:** ${metrics.averageLatency.toFixed(0)}ms`,
        `**Success Rate:** ${successRate}%`,
        `**Checks:** ${metrics.successfulChecks}/${metrics.totalChecks}`,
        metrics.status !== 'healthy' ? `**Failures:** ${metrics.consecutiveFailures}` : null,
        metrics.lastError ? `**Last Error:** ${metrics.lastError.substring(0, 50)}...` : null
      ].filter(Boolean).join('\n');

      embed.addFields({
        name: `${moduleName}`,
        value: fieldValue,
        inline: true
      });
    }

    const recentIncidents = await storage.getIncidents(5);
    const systemIncidents = recentIncidents
      .filter(i => i.serverId === 'system')
      .slice(0, 3);

    if (systemIncidents.length > 0) {
      const incidentList = systemIncidents.map(incident => {
        const time = new Date(incident.timestamp);
        const relativeTime = Math.floor((Date.now() - time.getTime()) / 60000);
        const severityIcon = incident.severity === 'critical' ? '🔴' : 
                            incident.severity === 'high' ? '🟠' : 
                            incident.severity === 'medium' ? '🟡' : '🟢';
        return `${severityIcon} **${incident.title}** - ${relativeTime}m ago`;
      }).join('\n');

      embed.addFields({
        name: '📋 Recent System Incidents',
        value: incidentList || 'No recent incidents',
        inline: false
      });
    }

    embed.setFooter({ 
      text: `Health checks are running every 30-60 seconds` 
    });
    embed.setTimestamp();

    await interaction.editReply({
      embeds: [embed]
    });

  } catch (error) {
    console.error('Error executing health command:', error);
    await interaction.editReply({
      content: '❌ Failed to retrieve system health status. Please try again later.',
    });
  }
}
