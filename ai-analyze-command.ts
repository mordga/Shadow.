import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, User } from 'discord.js';
import { storage } from '../../storage';
import { claudeService } from '../../services/claude-ai';

export const aiAnalyzeCommand = {
  data: new SlashCommandBuilder()
    .setName('ai-analyze')
    .setDescription('🤖 Deep AI analysis of user behavior and threat potential')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to analyze')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('depth')
        .setDescription('Analysis depth level')
        .addChoices(
          { name: 'Quick Scan (Fast)', value: 'quick' },
          { name: 'Deep Analysis (Thorough)', value: 'deep' },
          { name: 'Forensic Investigation (Complete)', value: 'forensic' }
        )
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user', true);
    const depth = interaction.options.getString('depth') || 'deep';
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

      const embed = new EmbedBuilder()
        .setColor(0xFF6B00)
        .setTitle('🤖 AI BEHAVIORAL ANALYSIS')
        .setDescription(`**Target:** ${targetUser.tag}\n**Analysis Depth:** ${depth.toUpperCase()}\n**Status:** Processing...`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      const accountAge = (Date.now() - targetUser.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const joinAge = member.joinedAt ? (Date.now() - member.joinedAt.getTime()) / (1000 * 60 * 60 * 24) : 0;

      const reputation = await storage.getUserReputation(targetUser.id, guild.id);
      const threatHistory = await storage.getThreats(1000);
      const userThreats = threatHistory.filter(t => t.userId === targetUser.id && t.serverId === guild.id);
      const recentThreats = userThreats.filter(t => Date.now() - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000);

      const analysisData = {
        username: targetUser.username,
        accountAge: accountAge.toFixed(1),
        joinAge: joinAge.toFixed(1),
        reputation: reputation?.score || 100,
        violations: reputation?.violations || 0,
        threatHistory: userThreats.length,
        recentThreats: recentThreats.length,
        permissions: member.permissions.has(PermissionFlagsBits.Administrator) ? 'ADMINISTRATOR' :
                    member.permissions.has(PermissionFlagsBits.ManageGuild) ? 'MANAGE_GUILD' : 'STANDARD',
        roles: member.roles.cache.size
      };

      let aiAnalysis;
      let threatLevel: 'MINIMAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'MINIMAL';
      let recommendations: string[] = [];

      let trustScore = 100;
      
      trustScore -= userThreats.length * 15;
      trustScore -= recentThreats.length * 10;
      trustScore -= (reputation?.violations || 0) * 8;
      
      if (accountAge < 7) trustScore -= 25;
      else if (accountAge < 30) trustScore -= 15;
      else if (accountAge < 90) trustScore -= 5;
      
      if (member.permissions.has(PermissionFlagsBits.Administrator) && accountAge < 90) {
        trustScore -= 30;
      }
      
      if (accountAge > 365 && userThreats.length === 0 && (reputation?.violations || 0) === 0) {
        trustScore += 20;
      }
      
      trustScore = Math.max(0, Math.min(100, trustScore));
      
      if (trustScore < 20) threatLevel = 'CRITICAL';
      else if (trustScore < 40) threatLevel = 'HIGH';
      else if (trustScore < 60) threatLevel = 'MODERATE';
      else if (trustScore < 80) threatLevel = 'LOW';
      else threatLevel = 'MINIMAL';

      if (depth === 'forensic' || depth === 'deep') {
        try {
          const analysisPrompt = `Analyze user: ${JSON.stringify(analysisData)}. Provide threat assessment.`;
          const threatAnalysis = await claudeService.execute('analyzeThreatLevel', analysisPrompt, userThreats);

          aiAnalysis = threatAnalysis.reasoning;

        } catch (error) {
          console.error('AI analysis failed, using heuristics:', error);
          aiAnalysis = `Heuristic analysis based on real data: ${userThreats.length} total threats (${recentThreats.length} in last 7 days), ${reputation?.violations || 0} violations, account age ${accountAge.toFixed(1)} days.`;
        }
      } else {
        aiAnalysis = `Quick scan completed. User has ${userThreats.length} threats (${recentThreats.length} recent) and ${reputation?.violations || 0} violations on record.`;
      }
      
      if (trustScore < 40) recommendations.push('⚠️ IMMEDIATE QUARANTINE RECOMMENDED');
      if (accountAge < 7) recommendations.push('🚨 New account - Enhanced monitoring required');
      if (userThreats.length > 3) recommendations.push('⚠️ High threat history - Consider ban');
      if (recentThreats.length > 2) recommendations.push('🔴 Recent threat activity detected');
      if (member.permissions.has(PermissionFlagsBits.Administrator) && accountAge < 90) recommendations.push('🔴 Admin with young account - Review immediately');
      if (trustScore < 60 && trustScore >= 40) recommendations.push('📊 Increase monitoring frequency');
      if (trustScore >= 80) recommendations.push('✅ User appears trustworthy - Low risk profile');

      const threatColor = trustScore < 20 ? 0xFF0000 : trustScore < 40 ? 0xFF6600 : trustScore < 60 ? 0xFFAA00 : trustScore < 80 ? 0xFFDD00 : 0x00FF00;
      const processingTime = Date.now() - startTime;

      const resultEmbed = new EmbedBuilder()
        .setColor(threatColor)
        .setTitle('🤖 AI BEHAVIORAL ANALYSIS - COMPLETE')
        .setDescription(`**Target:** ${targetUser.tag} (${targetUser.id})\n**Analysis Depth:** ${depth.toUpperCase()}`)
        .addFields(
          {
            name: '📊 TRUST SCORE',
            value: `\`${trustScore.toFixed(1)}/100\` - **${threatLevel}**\n${'█'.repeat(Math.floor(trustScore / 10))}${'░'.repeat(10 - Math.floor(trustScore / 10))}`,
            inline: false
          },
          {
            name: '👤 ACCOUNT INFORMATION',
            value: `**Created:** ${accountAge.toFixed(1)} days ago\n**Joined:** ${joinAge.toFixed(1)} days ago\n**Reputation:** ${reputation?.score || 100}/200\n**Violations:** ${reputation?.violations || 0}`,
            inline: true
          },
          {
            name: '⚠️ THREAT HISTORY',
            value: `**Total Threats:** ${userThreats.length}\n**Recent (7d):** ${recentThreats.length}\n**Permissions:** ${analysisData.permissions}\n**Roles:** ${analysisData.roles}`,
            inline: true
          },
          {
            name: '🤖 AI ANALYSIS',
            value: aiAnalysis.substring(0, 1024) || 'No additional insights',
            inline: false
          },
          {
            name: '📋 RECOMMENDATIONS',
            value: recommendations.length > 0 ? recommendations.join('\n') : '✅ No specific recommendations',
            inline: false
          }
        )
        .setFooter({ text: `Analysis completed in ${processingTime}ms | Depth: ${depth}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'ai-analyze',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: true,
        parameters: { targetUser: targetUser.tag, depth },
        result: `Trust score: ${trustScore.toFixed(1)}, Threat level: ${threatLevel}, History: ${userThreats.length} threats`,
        duration,
        metadata: { trustScore, threatLevel, threatHistory: userThreats.length }
      });

      if (trustScore < 30) {
        await storage.createThreat({
          type: 'suspicious_user',
          severity: 'high',
          description: `AI Analysis detected high-risk user: ${targetUser.tag}`,
          serverId: guild.id,
          serverName: guild.name,
          userId: targetUser.id,
          username: targetUser.tag,
          action: 'flagged',
          metadata: { trustScore, threatLevel, analysisDepth: depth }
        });
      }

    } catch (error) {
      console.error('AI analysis error:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Analysis Failed')
        .setDescription(`Failed to analyze user: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'ai-analyze',
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
