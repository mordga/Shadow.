import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, User } from 'discord.js';
import { storage } from '../../storage';
import { claudeService } from '../../services/claude-ai';

export const behaviorProfileCommand = {
  data: new SlashCommandBuilder()
    .setName('behavior-profile')
    .setDescription('🧠 Deep behavioral profile analysis with AI psychological assessment')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to profile')
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('ai-enhanced')
        .setDescription('Use AI for deep psychological analysis')
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user', true);
    const aiEnhanced = interaction.options.getBoolean('ai-enhanced') === null ? true : interaction.options.getBoolean('ai-enhanced') as boolean;
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
      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        await interaction.editReply('❌ User not found in this server');
        return;
      }

      const accountAge = (Date.now() - targetUser.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const joinAge = member.joinedAt ? (Date.now() - member.joinedAt.getTime()) / (1000 * 60 * 60 * 24) : 0;

      const reputation = await storage.getUserReputation(targetUser.id, guild.id);
      const allThreats = await storage.getThreats(1000);
      const userThreats = allThreats.filter(t => t.userId === targetUser.id && t.serverId === guild.id);
      
      const last24h = userThreats.filter(t => Date.now() - t.timestamp.getTime() < 24 * 60 * 60 * 1000);
      const last7d = userThreats.filter(t => Date.now() - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000);
      const last30d = userThreats.filter(t => Date.now() - t.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000);

      const threatTypes: Record<string, number> = {};
      userThreats.forEach(threat => {
        threatTypes[threat.type] = (threatTypes[threat.type] || 0) + 1;
      });

      let behaviorScore = 100;
      behaviorScore -= userThreats.length * 12;
      behaviorScore -= last7d.length * 8;
      const cappedViolations = Math.min(reputation?.violations || 0, 5);
      behaviorScore -= cappedViolations * 10;
      
      if (accountAge < 3) behaviorScore -= 40;
      else if (accountAge < 7) behaviorScore -= 30;
      else if (accountAge < 30) behaviorScore -= 15;
      
      if (accountAge > 365 && userThreats.length === 0) behaviorScore += 25;
      if (joinAge > 180 && userThreats.length === 0) behaviorScore += 15;
      
      behaviorScore = Math.max(0, Math.min(100, behaviorScore));

      let riskLevel: string;
      let riskColor: number;
      if (behaviorScore < 20) { riskLevel = '🔴 CRITICAL RISK'; riskColor = 0xFF0000; }
      else if (behaviorScore < 40) { riskLevel = '🟠 HIGH RISK'; riskColor = 0xFF6B00; }
      else if (behaviorScore < 60) { riskLevel = '🟡 MODERATE RISK'; riskColor = 0xFFAA00; }
      else if (behaviorScore < 80) { riskLevel = '🟢 LOW RISK'; riskColor = 0x00FF00; }
      else { riskLevel = '✅ TRUSTED'; riskColor = 0x00AA00; }

      const embed = new EmbedBuilder()
        .setColor(riskColor)
        .setTitle('🧠 BEHAVIORAL PROFILE ANALYSIS')
        .setDescription(`**Target:** ${targetUser.tag}\n**AI Enhanced:** ${aiEnhanced ? 'Yes' : 'No'}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields([
          {
            name: '📊 ACCOUNT METRICS',
            value: `**Discord Age:** ${accountAge.toFixed(1)} days\n` +
                   `**Server Join:** ${joinAge.toFixed(1)} days ago\n` +
                   `**Roles:** ${member.roles.cache.size}\n` +
                   `**Permissions:** ${member.permissions.has(PermissionFlagsBits.Administrator) ? 'Admin' : 'Standard'}`,
            inline: true
          },
          {
            name: '⚠️ THREAT HISTORY',
            value: `**Total Threats:** ${userThreats.length}\n` +
                   `**Last 24h:** ${last24h.length}\n` +
                   `**Last 7d:** ${last7d.length}\n` +
                   `**Last 30d:** ${last30d.length}`,
            inline: true
          },
          {
            name: '📈 REPUTATION DATA',
            value: `**Score:** ${reputation?.score || 100}/100\n` +
                   `**Violations:** ${reputation?.violations || 0}\n` +
                   `**Positive Actions:** ${reputation?.positiveActions || 0}\n` +
                   `**Status:** ${reputation?.score && reputation.score >= 70 ? 'Good Standing' : 'Under Review'}`,
            inline: true
          },
          {
            name: '🎯 BEHAVIOR SCORE',
            value: `**Overall Score:** ${behaviorScore}/100\n` +
                   `**Risk Level:** ${riskLevel}\n` +
                   `**Confidence:** ${aiEnhanced ? '95%' : '85%'}`,
            inline: false
          }
        ]);

      if (Object.keys(threatTypes).length > 0) {
        const threatBreakdown = Object.entries(threatTypes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([type, count]) => `**${type}:** ${count}`)
          .join('\n');

        embed.addFields({
          name: '🚨 THREAT BREAKDOWN',
          value: threatBreakdown,
          inline: false
        });
      }

      if (aiEnhanced) {
        try {
          const profileData = {
            username: targetUser.username,
            accountAge: accountAge.toFixed(1),
            joinAge: joinAge.toFixed(1),
            threats: userThreats.length,
            recentThreats: last7d.length,
            violations: reputation?.violations || 0,
            behaviorScore,
            threatTypes: Object.keys(threatTypes)
          };

          const aiAnalysis = await claudeService.execute(
            'analyzeThreatLevel',
            `Provide a psychological behavioral profile for this user: ${JSON.stringify(profileData)}. Focus on behavior patterns, risk indicators, and trustworthiness.`,
            userThreats.slice(0, 20)
          );

          const aiReasoning = aiAnalysis?.reasoning || 'AI analysis unavailable';
          const aiAction = aiAnalysis?.action || 'monitor';

          embed.addFields({
            name: '🤖 AI PSYCHOLOGICAL ASSESSMENT',
            value: aiReasoning.substring(0, 1024),
            inline: false
          });

          const recommendations: string[] = [];
          if (aiAction === 'ban') recommendations.push('🔴 Immediate ban recommended');
          if (aiAction === 'quarantine') recommendations.push('🟡 Quarantine for observation');
          if (behaviorScore < 40) recommendations.push('⚠️ Enhanced monitoring required');
          if (accountAge < 7 && userThreats.length > 0) recommendations.push('🚨 High-risk new account');
          if (last24h.length > 3) recommendations.push('🔴 Suspicious recent activity spike');
          if (behaviorScore >= 80) recommendations.push('✅ User appears trustworthy');

          if (recommendations.length > 0) {
            embed.addFields({
              name: '💡 RECOMMENDATIONS',
              value: recommendations.join('\n').substring(0, 1024),
              inline: false
            });
          }

        } catch (error) {
          console.error('AI analysis failed:', error);
          
          const heuristicProfile: string[] = [];
          if (behaviorScore < 40) heuristicProfile.push('⚠️ Multiple behavioral red flags detected');
          if (userThreats.length > 5) heuristicProfile.push('⚠️ Persistent pattern of violations');
          if (accountAge < 7) heuristicProfile.push('🆕 New account - limited history');
          if (last7d.length > 0) heuristicProfile.push('📊 Recent activity requires monitoring');
          if (behaviorScore >= 80) heuristicProfile.push('✅ Consistent positive behavior patterns');
          if (heuristicProfile.length === 0) heuristicProfile.push('No significant behavioral patterns detected');

          embed.addFields({
            name: '📊 HEURISTIC ASSESSMENT',
            value: heuristicProfile.join('\n').substring(0, 1024),
            inline: false
          });
        }
      } else {
        const heuristicProfile: string[] = [];
        if (behaviorScore < 40) heuristicProfile.push('⚠️ Multiple behavioral red flags detected');
        if (userThreats.length > 5) heuristicProfile.push('⚠️ Persistent pattern of violations');
        if (accountAge < 7) heuristicProfile.push('🆕 New account - limited history');
        if (last7d.length > 0) heuristicProfile.push('📊 Recent activity requires monitoring');
        if (behaviorScore >= 80) heuristicProfile.push('✅ Consistent positive behavior patterns');
        if (heuristicProfile.length === 0) heuristicProfile.push('No significant behavioral patterns detected');

        embed.addFields({
          name: '📊 HEURISTIC ASSESSMENT',
          value: heuristicProfile.join('\n').substring(0, 1024),
          inline: false
        });
      }

      const activityPattern = last24h.length > 0 ? '🔴 High Activity' :
                            last7d.length > 0 ? '🟡 Moderate Activity' :
                            userThreats.length > 0 ? '🟢 Low Activity' :
                            '✅ Clean Record';

      embed.addFields({
        name: '📈 ACTIVITY PATTERN',
        value: activityPattern,
        inline: true
      });

      embed.setFooter({ text: `🧠 Behavior Profile • ${aiEnhanced ? 'AI Enhanced' : 'Heuristic'} • ${Date.now() - startTime}ms` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'behavior-profile',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { target: targetUser.tag, aiEnhanced },
        result: `Profile generated: ${behaviorScore}/100 behavior score, ${riskLevel}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { targetUserId: targetUser.id, behaviorScore, riskLevel }
      });

    } catch (error) {
      console.error('Error in behavior-profile command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await interaction.editReply(`❌ Error generating behavioral profile: ${errorMessage}`);
    }
  }
};
