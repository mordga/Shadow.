import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, User } from 'discord.js';
import { storage } from '../../storage';
import { claudeService } from '../../services/claude-ai';

export const inspectCommand = {
  data: new SlashCommandBuilder()
    .setName('inspect')
    .setDescription('🔍 Deep inspection of user security profile and threat history')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to inspect')
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('ai-analysis')
        .setDescription('Include AI behavior analysis (slower but more detailed)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('show-traces')
        .setDescription('Show message traces (privacy sensitive)')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    const targetUser = interaction.options.getUser('user', true);
    const includeAI = interaction.options.getBoolean('ai-analysis') || false;
    const showTraces = interaction.options.getBoolean('show-traces') || false;
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
      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      const accountAge = targetUser.createdAt ? Math.floor((Date.now() - targetUser.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;

      let reputation = 0;
      let reputationError: string | null = null;
      try {
        const userRep = await storage.getUserReputation(targetUser.id, guild.id);
        reputation = userRep?.score || 0;
      } catch (error) {
        reputationError = error instanceof Error ? error.message : 'Unable to fetch reputation';
      }

      let userThreats: any[] = [];
      let threatsError: string | null = null;
      try {
        const allThreats = await storage.getThreats(100);
        userThreats = Array.isArray(allThreats) 
          ? allThreats.filter((t: any) => t?.userId === targetUser.id)
          : [];
      } catch (error) {
        threatsError = error instanceof Error ? error.message : 'Unable to fetch threats';
      }

      let userTraces: any[] = [];
      let tracesError: string | null = null;
      if (showTraces) {
        try {
          const allTraces = await storage.getMessageTraces();
          userTraces = Array.isArray(allTraces) 
            ? allTraces.filter((t: any) => t?.userId === targetUser.id).slice(0, 10)
            : [];
        } catch (error) {
          tracesError = error instanceof Error ? error.message : 'Unable to fetch traces';
        }
      }

      const threatsBySeverity = {
        critical: userThreats.filter((t: any) => t?.severity === 'critical').length,
        high: userThreats.filter((t: any) => t?.severity === 'high').length,
        medium: userThreats.filter((t: any) => t?.severity === 'medium').length,
        low: userThreats.filter((t: any) => t?.severity === 'low').length
      };

      const recentThreats = userThreats.slice(0, 5);

      let reputationEmoji = '🟢';
      let reputationStatus = 'Trusted';
      let reputationColor = 0x00FF00;

      if (reputation < 0) {
        reputationEmoji = '🔴';
        reputationStatus = 'Dangerous';
        reputationColor = 0xFF0000;
      } else if (reputation < 50) {
        reputationEmoji = '🟠';
        reputationStatus = 'Suspicious';
        reputationColor = 0xFFA500;
      } else if (reputation < 70) {
        reputationEmoji = '🟡';
        reputationStatus = 'Monitored';
        reputationColor = 0xFFFF00;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔍 User Inspection: ${targetUser.username}`)
        .setDescription(`**Deep security profile analysis**`)
        .setColor(reputationColor)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields([
          {
            name: '👤 Basic Information',
            value: [
              `**User:** ${targetUser.tag}`,
              `**ID:** \`${targetUser.id}\``,
              `**Account Age:** ${accountAge} days`,
              `**Member:** ${member ? '✅ Yes' : '❌ Not in server'}`,
              `**Joined:** ${member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'N/A'}`
            ].join('\n'),
            inline: true
          },
          {
            name: '🛡️ Security Profile',
            value: reputationError
              ? `⚠️ ${reputationError}`
              : [
                  `**Reputation:** ${reputationEmoji} ${reputation}`,
                  `**Status:** ${reputationStatus}`,
                  `**Total Threats:** ${userThreats.length}`,
                  `**Critical:** 🔴 ${threatsBySeverity.critical}`,
                  `**High:** 🟠 ${threatsBySeverity.high}`
                ].join('\n'),
            inline: true
          },
          {
            name: '📊 Threat Breakdown',
            value: threatsError
              ? `⚠️ ${threatsError}`
              : [
                  `**Critical:** ${threatsBySeverity.critical}`,
                  `**High:** ${threatsBySeverity.high}`,
                  `**Medium:** ${threatsBySeverity.medium}`,
                  `**Low:** ${threatsBySeverity.low}`,
                  `**Total:** ${userThreats.length}`
                ].join('\n'),
            inline: false
          }
        ]);

      if (recentThreats.length > 0) {
        const threatList = recentThreats.map((threat: any, index: number) => {
          const severityEmoji = threat?.severity === 'critical' ? '🔴' : 
                               threat?.severity === 'high' ? '🟠' : 
                               threat?.severity === 'medium' ? '🟡' : '🟢';
          return `${index + 1}. ${severityEmoji} **${threat?.type || 'Unknown'}** - ${threat?.action || 'N/A'}\n   ${threat?.description?.substring(0, 100) || 'No description'}`;
        }).join('\n');

        embed.addFields({
          name: '⚠️ Recent Threats (Last 5)',
          value: threatList.substring(0, 1024),
          inline: false
        });
      }

      if (showTraces && userTraces.length > 0 && !tracesError) {
        const traceList = userTraces.map((trace: any, index: number) => {
          return `${index + 1}. **${trace?.eventType || 'Unknown'}** - ${trace?.content?.substring(0, 50) || 'No content'}...`;
        }).join('\n');

        embed.addFields({
          name: '📝 Message Traces (Last 10)',
          value: traceList.substring(0, 1024) || 'No traces found',
          inline: false
        });
      } else if (showTraces && tracesError) {
        embed.addFields({
          name: '📝 Message Traces',
          value: `⚠️ ${tracesError}`,
          inline: false
        });
      }

      if (includeAI) {
        try {
          const aiAnalysis = await claudeService.execute(
            'analyzeUserBehavior',
            {
              userId: targetUser.id,
              username: targetUser.username,
              messageHistory: userTraces.slice(0, 10).map((t: any) => t?.content).filter(Boolean),
              joinTimestamp: member?.joinedAt || new Date(),
              activityFrequency: userTraces.length,
              reputation
            }
          );

          if (aiAnalysis && typeof aiAnalysis === 'object' && 'behaviorType' in aiAnalysis) {
            const validBehaviorType = typeof aiAnalysis.behaviorType === 'string' 
              ? aiAnalysis.behaviorType 
              : 'normal';
            
            const behaviorEmoji = validBehaviorType === 'normal' ? '🟢' : 
                                 validBehaviorType === 'suspicious' ? '🟡' : '🔴';

            const trustScore = typeof aiAnalysis.trustScore === 'number' && !isNaN(aiAnalysis.trustScore)
              ? aiAnalysis.trustScore 
              : 60;
            
            const anomalies = Array.isArray(aiAnalysis.anomalies) 
              ? aiAnalysis.anomalies.filter((a: any) => typeof a === 'string')
              : [];
            
            const recommendation = typeof aiAnalysis.recommendation === 'string' && aiAnalysis.recommendation.length > 0
              ? aiAnalysis.recommendation 
              : 'No recommendation available';

            embed.addFields({
              name: '🤖 AI Behavioral Analysis',
              value: [
                `**Trust Score:** ${trustScore.toFixed(0)}%`,
                `**Behavior Type:** ${behaviorEmoji} ${validBehaviorType.toUpperCase()}`,
                `**Anomalies:** ${anomalies.length > 0 ? anomalies.join(', ') : 'None detected'}`,
                `**AI Recommendation:** ${recommendation}`
              ].join('\n'),
              inline: false
            });
          } else {
            embed.addFields({
              name: '🤖 AI Behavioral Analysis',
              value: '⚠️ AI returned unexpected response format',
              inline: false
            });
          }
        } catch (aiError) {
          embed.addFields({
            name: '🤖 AI Behavioral Analysis',
            value: `⚠️ AI analysis unavailable: ${aiError instanceof Error ? aiError.message : 'Unknown error'}`,
            inline: false
          });
        }
      }

      let riskLevel = 'LOW';
      if (reputation < 0 || threatsBySeverity.critical > 0) {
        riskLevel = 'CRITICAL';
      } else if (reputation < 50 || threatsBySeverity.high > 2) {
        riskLevel = 'HIGH';
      } else if (reputation < 70 || threatsBySeverity.high > 0) {
        riskLevel = 'MEDIUM';
      }

      embed.addFields({
        name: '🎯 Assessment',
        value: [
          `**Risk Level:** ${riskLevel === 'CRITICAL' ? '🔴' : riskLevel === 'HIGH' ? '🟠' : riskLevel === 'MEDIUM' ? '🟡' : '🟢'} ${riskLevel}`,
          `**Recommended Action:** ${reputation < 0 ? '🚫 BAN' : reputation < 50 ? '⚠️ QUARANTINE' : reputation < 70 ? '👁️ MONITOR' : '✅ ALLOW'}`,
          `**Auto-Ban Risk:** ${accountAge < 3 || reputation < 0 ? '⚠️ HIGH' : '✅ LOW'}`
        ].join('\n'),
        inline: false
      });

      embed.setFooter({ text: `Inspected by ${interaction.user.username} | ${includeAI ? 'AI Analysis Enabled' : 'Basic Inspection'}` });
      embed.setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'inspect',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { targetUserId: targetUser.id, includeAI, showTraces },
        result: `Inspected user ${targetUser.tag} - Risk: ${riskLevel}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { targetUser: targetUser.tag, riskLevel, reputation }
      });

    } catch (error) {
      console.error('Error in inspect command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error inspecting user: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'inspect',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild?.id || '',
        serverName: guild?.name || '',
        parameters: {},
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
