import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { storage } from '../../storage';
import { claudeService } from '../../services/claude-ai';

export const reportCommand = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('📋 Generate comprehensive security report for the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('timeframe')
        .setDescription('Report timeframe')
        .setRequired(false)
        .addChoices(
          { name: 'Last 24 Hours', value: '24h' },
          { name: 'Last 7 Days', value: '7d' },
          { name: 'Last 30 Days', value: '30d' },
          { name: 'All Time', value: 'all' }
        ))
    .addStringOption(option =>
      option.setName('format')
        .setDescription('Report format')
        .setRequired(false)
        .addChoices(
          { name: 'Embed (Discord)', value: 'embed' },
          { name: 'Markdown File', value: 'markdown' },
          { name: 'Both', value: 'both' }
        ))
    .addBooleanOption(option =>
      option.setName('ai-summary')
        .setDescription('Include AI-generated executive summary')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    const timeframe = interaction.options.getString('timeframe') || '24h';
    const format = interaction.options.getString('format') || 'embed';
    const includeAI = interaction.options.getBoolean('ai-summary') || false;
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command can only be used in a server', ephemeral: true });
      return;
    }

    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) {
      await interaction.reply({ content: '❌ Could not access server information. Please try again.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const now = Date.now();
      let startDate = 0;
      
      switch (timeframe) {
        case '24h':
          startDate = now - (24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = now - (30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startDate = 0;
          break;
      }

      let allThreats: any[] = [];
      let threatsError: string | null = null;
      try {
        const threats = await storage.getThreats(1000);
        allThreats = Array.isArray(threats) 
          ? threats.filter((t: any) => t?.serverId === guild.id && (!startDate || (t?.timestamp && t.timestamp >= startDate)))
          : [];
      } catch (error) {
        threatsError = error instanceof Error ? error.message : 'Unable to fetch threats';
      }

      let stats: any = null;
      let statsError: string | null = null;
      try {
        stats = await storage.getBotStats();
      } catch (error) {
        statsError = error instanceof Error ? error.message : 'Unable to fetch stats';
      }

      const threatsBySeverity = {
        critical: allThreats.filter((t: any) => t?.severity === 'critical').length,
        high: allThreats.filter((t: any) => t?.severity === 'high').length,
        medium: allThreats.filter((t: any) => t?.severity === 'medium').length,
        low: allThreats.filter((t: any) => t?.severity === 'low').length
      };

      const threatsByType = allThreats.reduce((acc: any, threat: any) => {
        const type = threat?.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      const topThreatTypes = Object.entries(threatsByType)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5);

      const actionsTaken = {
        ban: allThreats.filter((t: any) => t?.action === 'ban').length,
        kick: allThreats.filter((t: any) => t?.action === 'kick').length,
        mute: allThreats.filter((t: any) => t?.action === 'mute').length,
        warn: allThreats.filter((t: any) => t?.action === 'warn').length,
        delete: allThreats.filter((t: any) => t?.action === 'delete').length
      };

      const timeframeDisplay = {
        '24h': 'Last 24 Hours',
        '7d': 'Last 7 Days',
        '30d': 'Last 30 Days',
        'all': 'All Time'
      }[timeframe];

      const reportColor = threatsBySeverity.critical > 0 ? 0xFF0000 : 
                         threatsBySeverity.high > 5 ? 0xFFA500 : 
                         0x00FF00;

      const embed = new EmbedBuilder()
        .setTitle(`📋 Security Report: ${guild.name}`)
        .setDescription(`**Comprehensive security analysis**\n**Timeframe:** ${timeframeDisplay}`)
        .setColor(reportColor)
        .setThumbnail(guild.iconURL() || null);

      embed.addFields([
        {
          name: '📊 Threat Summary',
          value: threatsError
            ? `⚠️ ${threatsError}`
            : [
                `**Total Threats:** ${allThreats.length}`,
                `**Critical:** 🔴 ${threatsBySeverity.critical}`,
                `**High:** 🟠 ${threatsBySeverity.high}`,
                `**Medium:** 🟡 ${threatsBySeverity.medium}`,
                `**Low:** 🟢 ${threatsBySeverity.low}`
              ].join('\n'),
          inline: true
        },
        {
          name: '⚔️ Actions Taken',
          value: [
            `**Bans:** ${actionsTaken.ban}`,
            `**Kicks:** ${actionsTaken.kick}`,
            `**Mutes:** ${actionsTaken.mute}`,
            `**Warnings:** ${actionsTaken.warn}`,
            `**Deletions:** ${actionsTaken.delete}`
          ].join('\n'),
          inline: true
        },
        {
          name: '🎯 Top Threat Types',
          value: topThreatTypes.length > 0
            ? topThreatTypes.map(([type, count]: any) => `**${type}:** ${count}`).join('\n')
            : 'No threats detected',
          inline: false
        }
      ]);

      if (stats && !statsError) {
        embed.addFields({
          name: '📈 Bot Performance',
          value: [
            `**Uptime:** ${Math.floor((stats?.uptime || 0) / 60)} minutes`,
            `**Messages Analyzed:** ${stats?.messagesAnalyzed || 0}`,
            `**Threats Blocked:** ${stats?.threatsBlocked || 0}`,
            `**Commands Executed:** ${stats?.commandsExecuted || 0}`
          ].join('\n'),
          inline: false
        });
      }

      const riskLevel = threatsBySeverity.critical > 0 ? 'CRITICAL' :
                       threatsBySeverity.high > 5 ? 'HIGH' :
                       threatsBySeverity.high > 0 ? 'MEDIUM' : 'LOW';

      embed.addFields({
        name: '🛡️ Server Security Status',
        value: [
          `**Overall Risk:** ${riskLevel === 'CRITICAL' ? '🔴' : riskLevel === 'HIGH' ? '🟠' : riskLevel === 'MEDIUM' ? '🟡' : '🟢'} ${riskLevel}`,
          `**Protection Level:** ${threatsBySeverity.critical === 0 ? '✅ Active' : '⚠️ Alert Mode'}`,
          `**Recent Activity:** ${allThreats.length > 0 ? '🔄 Active Monitoring' : '✅ Quiet'}`
        ].join('\n'),
        inline: false
      });

      if (includeAI && allThreats.length > 0) {
        try {
          const incidents = allThreats.slice(0, 5)
            .filter((t: any) => t && typeof t === 'object')
            .map((t: any) => ({
              type: typeof t.type === 'string' ? t.type : 'unknown',
              severity: typeof t.severity === 'string' ? t.severity : 'low',
              timestamp: typeof t.timestamp === 'number' ? t.timestamp : Date.now(),
              description: typeof t.description === 'string' ? t.description : 'No description'
            }));

          const validStats = stats && typeof stats === 'object' 
            ? stats 
            : { uptime: process.uptime() * 1000, messagesAnalyzed: 0, threatsBlocked: 0 };

          const validThreats = allThreats.slice(0, 10).filter((t: any) => t && typeof t === 'object');

          const aiReport = await claudeService.execute(
            'generateSecurityReport',
            validStats,
            validThreats,
            incidents
          );

          let reportSummary = 'AI report generation completed';
          
          if (typeof aiReport === 'string' && aiReport.length > 0) {
            reportSummary = aiReport.substring(0, 1024);
          } else if (aiReport && typeof aiReport === 'object') {
            if (typeof aiReport.summary === 'string' && aiReport.summary.length > 0) {
              reportSummary = aiReport.summary.substring(0, 1024);
            } else if (typeof aiReport === 'string') {
              reportSummary = String(aiReport).substring(0, 1024);
            }
          }

          embed.addFields({
            name: '🤖 AI Executive Summary',
            value: reportSummary || 'AI generated report (see full details above)',
            inline: false
          });
        } catch (aiError) {
          embed.addFields({
            name: '🤖 AI Executive Summary',
            value: `⚠️ AI summary unavailable: ${aiError instanceof Error ? aiError.message : 'Unknown error'}`,
            inline: false
          });
        }
      }

      embed.setFooter({ text: `Generated by ${interaction.user.username} | ${format.toUpperCase()} format` });
      embed.setTimestamp();

      if (format === 'markdown' || format === 'both') {
        const markdown = `# Security Report: ${guild.name}
**Generated:** ${new Date().toLocaleString()}
**Timeframe:** ${timeframeDisplay}
**Generated By:** ${interaction.user.username}

---

## 📊 Threat Summary
- **Total Threats:** ${allThreats.length}
- **Critical:** 🔴 ${threatsBySeverity.critical}
- **High:** 🟠 ${threatsBySeverity.high}
- **Medium:** 🟡 ${threatsBySeverity.medium}
- **Low:** 🟢 ${threatsBySeverity.low}

## ⚔️ Actions Taken
- **Bans:** ${actionsTaken.ban}
- **Kicks:** ${actionsTaken.kick}
- **Mutes:** ${actionsTaken.mute}
- **Warnings:** ${actionsTaken.warn}
- **Deletions:** ${actionsTaken.delete}

## 🎯 Top Threat Types
${topThreatTypes.map(([type, count]: any) => `- **${type}:** ${count}`).join('\n') || 'No threats detected'}

## 🛡️ Server Security Status
- **Overall Risk:** ${riskLevel}
- **Protection Level:** ${threatsBySeverity.critical === 0 ? 'Active' : 'Alert Mode'}
- **Recent Activity:** ${allThreats.length > 0 ? 'Active Monitoring' : 'Quiet'}

${stats && !statsError ? `
## 📈 Bot Performance
- **Uptime:** ${Math.floor((stats?.uptime || 0) / 60)} minutes
- **Messages Analyzed:** ${stats?.messagesAnalyzed || 0}
- **Threats Blocked:** ${stats?.threatsBlocked || 0}
- **Commands Executed:** ${stats?.commandsExecuted || 0}
` : ''}

## 📋 Recent Threats (Last 10)
${allThreats.slice(0, 10).map((threat: any, i: number) => {
  const severityEmoji = threat?.severity === 'critical' ? '🔴' : 
                       threat?.severity === 'high' ? '🟠' : 
                       threat?.severity === 'medium' ? '🟡' : '🟢';
  return `${i + 1}. ${severityEmoji} **${threat?.type || 'Unknown'}** - ${threat?.action || 'N/A'}
   - User: ${threat?.username || 'Unknown'} (${threat?.userId || 'N/A'})
   - Description: ${threat?.description || 'No description'}
   - Timestamp: ${threat?.timestamp ? new Date(threat.timestamp).toLocaleString() : 'Unknown'}`;
}).join('\n\n') || 'No recent threats'}

---

*Report generated by SecureBot Pro Security System*
`;

        const attachment = new AttachmentBuilder(
          Buffer.from(markdown, 'utf-8'),
          { name: `security-report-${guild.id}-${Date.now()}.md` }
        );

        if (format === 'both') {
          await interaction.editReply({ embeds: [embed], files: [attachment] });
        } else {
          await interaction.editReply({ files: [attachment] });
        }
      } else {
        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'report',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { timeframe, format, includeAI },
        result: `Security report generated: ${allThreats.length} threats, Risk: ${riskLevel}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { timeframe, format, threatCount: allThreats.length, riskLevel }
      });

    } catch (error) {
      console.error('Error in report command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error generating report: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'report',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild?.id || '',
        serverName: guild?.name || '',
        parameters: { timeframe, format },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
