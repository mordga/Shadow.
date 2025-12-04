import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { storage } from '../../storage';

interface ForensicEvidence {
  timestamp: Date;
  eventType: string;
  userId?: string;
  username?: string;
  action: string;
  details: string;
  severity: string;
}

export const forensicsCommand = {
  data: new SlashCommandBuilder()
    .setName('forensics')
    .setDescription('🔬 Advanced forensic analysis of security incidents')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('incident_id')
        .setDescription('Incident ID to investigate (leave empty for recent incidents)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('generate_report')
        .setDescription('Generate detailed forensic report file')
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    const incidentId = interaction.options.getString('incident_id');
    const generateReport = interaction.options.getBoolean('generate_report') || false;
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

    try {
      let incident;
      let incidents = await storage.getIncidents(100);
      const serverIncidents = incidents.filter(i => i.serverId === guild.id);

      if (incidentId) {
        incident = serverIncidents.find(i => i.id === incidentId);
        if (!incident) {
          await interaction.editReply(`❌ Incident ${incidentId} not found`);
          return;
        }
      } else {
        const activeIncidents = await storage.getActiveIncidents();
        const serverActiveIncidents = activeIncidents.filter(i => i.serverId === guild.id);
        
        if (serverActiveIncidents.length === 0) {
          incident = serverIncidents[0];
          if (!incident) {
            await interaction.editReply('❌ No incidents found for forensic analysis');
            return;
          }
        } else {
          incident = serverActiveIncidents[0];
        }
      }

      const threats = await storage.getThreats(1000);
      const relatedThreats = threats.filter(t => 
        t.serverId === guild.id && 
        Math.abs(t.timestamp.getTime() - incident.timestamp.getTime()) < 60 * 60 * 1000
      );

      const commandLogs = await storage.getCommandLogs({ serverId: guild.id, limit: 500 });
      const relatedLogs = commandLogs.filter(log => 
        Math.abs(log.executedAt.getTime() - incident.timestamp.getTime()) < 2 * 60 * 60 * 1000
      );

      const evidence: ForensicEvidence[] = [];

      evidence.push({
        timestamp: incident.timestamp,
        eventType: 'INCIDENT_START',
        action: 'incident_triggered',
        details: `Type: ${incident.type} | Severity: ${incident.severity} | ${incident.description}`,
        severity: incident.severity
      });

      for (const threat of relatedThreats) {
        evidence.push({
          timestamp: threat.timestamp,
          eventType: 'THREAT_DETECTED',
          userId: threat.userId || undefined,
          username: threat.username || undefined,
          action: threat.action,
          details: `${threat.type}: ${threat.description}`,
          severity: threat.severity
        });
      }

      for (const log of relatedLogs.slice(0, 20)) {
        evidence.push({
          timestamp: log.executedAt,
          eventType: 'COMMAND_EXECUTED',
          userId: log.userId,
          username: log.username,
          action: log.commandName,
          details: `Command: /${log.commandName} | Success: ${log.success}${!log.success && log.result ? ` | Error: ${log.result}` : ''}`,
          severity: log.success ? 'low' : 'medium'
        });
      }

      evidence.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      const involvedUsers = new Set(evidence.filter(e => e.userId).map(e => e.userId));
      const eventTypes = new Set(evidence.map(e => e.eventType));
      const timeline = evidence.length;
      const incidentDuration = evidence.length > 1 ? 
        (evidence[evidence.length - 1].timestamp.getTime() - evidence[0].timestamp.getTime()) / 1000 / 60 : 0;

      const criticalEvents = evidence.filter(e => e.severity === 'critical' || e.severity === 'high').length;
      const riskScore = Math.min(100, (criticalEvents * 10) + (relatedThreats.length * 5) + (involvedUsers.size * 3));

      const embed = new EmbedBuilder()
        .setColor(riskScore > 70 ? 0xFF0000 : riskScore > 40 ? 0xFF6600 : 0xFFAA00)
        .setTitle('🔬 FORENSIC INVESTIGATION REPORT')
        .setDescription(`**Incident ID:** \`${incident.id}\`\n**Type:** ${incident.type.toUpperCase()}\n**Status:** ${incident.resolved ? '✅ RESOLVED' : '⚠️ ACTIVE'}`)
        .addFields(
          {
            name: '📋 INCIDENT SUMMARY',
            value: `**Description:** ${incident.description}\n**Severity:** ${incident.severity.toUpperCase()}\n**Detected:** <t:${Math.floor(incident.timestamp.getTime() / 1000)}:R>\n**Duration:** ${incidentDuration.toFixed(1)} minutes`,
            inline: false
          },
          {
            name: '🎯 FORENSIC METRICS',
            value: `**Risk Score:** ${riskScore}/100\n**Evidence Items:** ${timeline}\n**Critical Events:** ${criticalEvents}\n**Involved Users:** ${involvedUsers.size}\n**Event Types:** ${eventTypes.size}`,
            inline: true
          },
          {
            name: '📊 THREAT ANALYSIS',
            value: `**Related Threats:** ${relatedThreats.length}\n**Commands Executed:** ${relatedLogs.length}\n**Timeframe:** ±1 hour\n**Pattern:** ${relatedThreats.length > 5 ? '⚠️ Coordinated' : 'Isolated'}`,
            inline: true
          }
        );

      const timelineText = evidence.slice(0, 15).map((e, i) => {
        const time = `<t:${Math.floor(e.timestamp.getTime() / 1000)}:T>`;
        const user = e.username ? ` (${e.username})` : '';
        const icon = e.severity === 'critical' ? '🔴' : e.severity === 'high' ? '🟠' : e.severity === 'medium' ? '🟡' : '🟢';
        return `${icon} **${time}** - ${e.eventType}${user}\n└─ ${e.details.substring(0, 80)}`;
      }).join('\n\n');

      embed.addFields({
        name: '⏱️ TIMELINE RECONSTRUCTION',
        value: timelineText.substring(0, 1024) + (evidence.length > 15 ? `\n\n*... and ${evidence.length - 15} more events*` : ''),
        inline: false
      });

      const analysis = [
        `• Attack vector: ${incident.type}`,
        `• Threat density: ${(relatedThreats.length / Math.max(incidentDuration, 1)).toFixed(2)} threats/minute`,
        involvedUsers.size > 1 ? '• Multiple actors detected - possible coordinated attack' : '• Single actor incident',
        criticalEvents > 3 ? '• ⚠️ HIGH SEVERITY: Multiple critical events detected' : '• Standard severity incident',
        incident.resolved ? '• Incident was successfully resolved' : '• ⚠️ ACTIVE THREAT: Immediate action required'
      ];

      embed.addFields({
        name: '🔍 KEY FINDINGS',
        value: analysis.join('\n'),
        inline: false
      });

      const recommendations = [
        riskScore > 70 ? '🚨 CRITICAL: Implement emergency lockdown procedures' : '✅ Standard response adequate',
        involvedUsers.size > 0 ? `👥 Review actions of ${involvedUsers.size} flagged user(s)` : 'No user action required',
        relatedThreats.length > 10 ? '🛡️ URGENT: Increase security level and monitoring' : '📊 Maintain current monitoring',
        !incident.resolved ? '⚠️ PRIORITY: Resolve active incident immediately' : '📝 Document lessons learned',
        criticalEvents > 5 ? '🔒 Consider temporary restrictions on affected areas' : '✅ No restrictions necessary'
      ];

      embed.addFields({
        name: '📋 RECOMMENDATIONS',
        value: recommendations.join('\n'),
        inline: false
      });

      const processingTime = Date.now() - startTime;
      embed.setFooter({ text: `Forensic Analysis Engine v3.0 | Processed in ${processingTime}ms` })
        .setTimestamp();

      const replyData: any = { embeds: [embed] };

      if (generateReport) {
        const reportContent = [
          '='.repeat(80),
          'FORENSIC INVESTIGATION REPORT',
          '='.repeat(80),
          '',
          `Report Generated: ${new Date().toISOString()}`,
          `Analyst: ${interaction.user.tag} (${interaction.user.id})`,
          `Server: ${guild.name} (${guild.id})`,
          '',
          '--- INCIDENT DETAILS ---',
          `ID: ${incident.id}`,
          `Type: ${incident.type}`,
          `Severity: ${incident.severity}`,
          `Description: ${incident.description}`,
          `Timestamp: ${incident.timestamp.toISOString()}`,
          `Status: ${incident.resolved ? 'RESOLVED' : 'ACTIVE'}`,
          incident.resolvedAt ? `Resolved At: ${incident.resolvedAt.toISOString()}` : '',
          incident.resolvedBy ? `Resolved By: ${incident.resolvedBy}` : '',
          '',
          '--- FORENSIC METRICS ---',
          `Risk Score: ${riskScore}/100`,
          `Evidence Items: ${timeline}`,
          `Critical Events: ${criticalEvents}`,
          `Involved Users: ${involvedUsers.size}`,
          `Event Types: ${eventTypes.size}`,
          `Duration: ${incidentDuration.toFixed(2)} minutes`,
          '',
          '--- RELATED THREATS ---',
          `Total: ${relatedThreats.length}`,
          ...relatedThreats.slice(0, 30).map((t, i) => 
            `${i + 1}. [${t.severity.toUpperCase()}] ${t.type} - ${t.description} (${t.timestamp.toISOString()})`
          ),
          relatedThreats.length > 30 ? `... and ${relatedThreats.length - 30} more threats` : '',
          '',
          '--- EVIDENCE TIMELINE ---',
          ...evidence.map((e, i) => {
            const userInfo = e.username ? ` | User: ${e.username} (${e.userId})` : '';
            return `${i + 1}. [${e.timestamp.toISOString()}] ${e.eventType} - ${e.action}${userInfo}\n   Details: ${e.details}\n   Severity: ${e.severity}\n`;
          }),
          '',
          '--- KEY FINDINGS ---',
          ...analysis.map((a, i) => `${i + 1}. ${a}`),
          '',
          '--- RECOMMENDATIONS ---',
          ...recommendations.map((r, i) => `${i + 1}. ${r}`),
          '',
          '='.repeat(80),
          'END OF REPORT',
          '='.repeat(80)
        ].join('\n');

        const reportBuffer = Buffer.from(reportContent, 'utf-8');
        const attachment = new AttachmentBuilder(reportBuffer, { 
          name: `forensic_report_${incident.id}_${Date.now()}.txt` 
        });
        
        replyData.files = [attachment];
      }

      await interaction.editReply(replyData);

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'forensics',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: true,
        parameters: { incidentId: incident.id, generateReport },
        result: `Risk score: ${riskScore}, Evidence: ${timeline} items, Threats: ${relatedThreats.length}`,
        duration,
        metadata: { riskScore, evidenceCount: timeline, threatsFound: relatedThreats.length }
      });

    } catch (error) {
      console.error('Forensics error:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Forensic Analysis Failed')
        .setDescription(`Failed to perform forensic analysis: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'forensics',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: false,
        result: `Error: ${(error as Error).message}`,
        duration,
        metadata: { error: (error as Error).message }
      });
    }
  }
};
