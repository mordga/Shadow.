import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { claudeService } from '../../services/claude-ai';

interface ThreatPrediction {
  type: string;
  probability: number;
  timeframe: string;
  indicators: string[];
  preventiveMeasures: string[];
}

export const threatPredictCommand = {
  data: new SlashCommandBuilder()
    .setName('threat-predict')
    .setDescription('🔮 AI-powered predictive threat analysis using historical patterns')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('timeframe')
        .setDescription('Prediction timeframe')
        .addChoices(
          { name: 'Next 24 Hours', value: '24h' },
          { name: 'Next 7 Days', value: '7d' },
          { name: 'Next 30 Days', value: '30d' }
        )
        .setRequired(false))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Threat type to predict')
        .addChoices(
          { name: 'Raid Attacks', value: 'raid' },
          { name: 'Spam Waves', value: 'spam' },
          { name: 'All Threats', value: 'all' }
        )
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    const timeframe = interaction.options.getString('timeframe') || '7d';
    const threatType = interaction.options.getString('type') || 'all';
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
      const threats = await storage.getThreats(5000);
      const serverThreats = threats.filter(t => t.serverId === guild.id);

      const now = Date.now();
      const timeframeMs = timeframe === '24h' ? 24 * 60 * 60 * 1000 :
                         timeframe === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                         30 * 24 * 60 * 60 * 1000;

      const recentThreats = serverThreats.filter(t => now - t.timestamp.getTime() < timeframeMs * 2);

      const raidThreats = recentThreats.filter(t => t.type === 'raid' || t.type === 'mass_join');
      const spamThreats = recentThreats.filter(t => t.type === 'spam' || t.type === 'flood');
      const otherThreats = recentThreats.filter(t => t.type !== 'raid' && t.type !== 'mass_join' && t.type !== 'spam' && t.type !== 'flood');

      const predictions: ThreatPrediction[] = [];

      if (threatType === 'raid' || threatType === 'all') {
        const analysisWindow = timeframeMs * 2;
        const daysInWindow = analysisWindow / (24 * 60 * 60 * 1000);
        const raidFrequency = raidThreats.length / daysInWindow;
        
        const recentRaids = raidThreats.filter(t => now - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000);
        const olderRaids = raidThreats.filter(t => {
          const age = now - t.timestamp.getTime();
          return age >= 7 * 24 * 60 * 60 * 1000 && age < 14 * 24 * 60 * 60 * 1000;
        });
        
        const recentFreq = recentRaids.length / 7;
        const olderFreq = olderRaids.length / 7;
        const trend = olderFreq > 0 ? (recentFreq - olderFreq) / olderFreq : 0;
        
        let raidProbability = 0;
        if (raidThreats.length === 0) {
          raidProbability = 5;
        } else {
          raidProbability = Math.min(95, (raidFrequency * 100) * (1 + Math.max(0, trend * 0.5)));
          if (recentRaids.length > 3) raidProbability = Math.min(95, raidProbability + 15);
        }
        
        const trendIndicator = trend > 0.3 ? '📈 INCREASING trend' : trend < -0.3 ? '📉 DECREASING trend' : '➡️ STABLE trend';
        
        predictions.push({
          type: 'RAID ATTACK',
          probability: raidProbability,
          timeframe: timeframe,
          indicators: [
            `${raidThreats.length} raids in last ${daysInWindow.toFixed(0)} days (${raidFrequency.toFixed(2)}/day)`,
            `Recent 7d: ${recentRaids.length} raids vs Previous 7d: ${olderRaids.length} raids`,
            trendIndicator,
            recentRaids.length > 5 ? '⚠️ HIGH: Elevated raid activity' : raidThreats.length > 0 ? 'Moderate activity detected' : 'No raid history'
          ],
          preventiveMeasures: [
            '🛡️ Enable verification level to HIGH',
            '🔒 Activate Anti-Raid protection (/antiraid enable)',
            '👥 Limit invite creation permissions',
            '⏱️ Set account age requirement to 7+ days',
            raidProbability > 50 ? '🚨 URGENT: Lock server temporarily' : '✅ Standard monitoring sufficient'
          ]
        });
      }

      if (threatType === 'spam' || threatType === 'all') {
        const analysisWindow = timeframeMs * 2;
        const daysInWindow = analysisWindow / (24 * 60 * 60 * 1000);
        const spamFrequency = spamThreats.length / daysInWindow;
        
        const recentSpam = spamThreats.filter(t => now - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000);
        const olderSpam = spamThreats.filter(t => {
          const age = now - t.timestamp.getTime();
          return age >= 7 * 24 * 60 * 60 * 1000 && age < 14 * 24 * 60 * 60 * 1000;
        });
        
        const recentFreq = recentSpam.length / 7;
        const olderFreq = olderSpam.length / 7;
        const trend = olderFreq > 0 ? (recentFreq - olderFreq) / olderFreq : 0;
        
        let spamProbability = 0;
        if (spamThreats.length === 0) {
          spamProbability = 10;
        } else {
          spamProbability = Math.min(95, (spamFrequency * 80) * (1 + Math.max(0, trend * 0.5)));
          if (recentSpam.length > 5) spamProbability = Math.min(95, spamProbability + 10);
        }
        
        const trendIndicator = trend > 0.3 ? '📈 INCREASING trend' : trend < -0.3 ? '📉 DECREASING trend' : '➡️ STABLE trend';
        
        predictions.push({
          type: 'SPAM WAVE',
          probability: spamProbability,
          timeframe: timeframe,
          indicators: [
            `${spamThreats.length} spam incidents in last ${daysInWindow.toFixed(0)} days (${spamFrequency.toFixed(2)}/day)`,
            `Recent 7d: ${recentSpam.length} incidents vs Previous 7d: ${olderSpam.length} incidents`,
            trendIndicator,
            recentSpam.length > 10 ? '⚠️ HIGH: Sustained spam pattern' : spamThreats.length > 0 ? 'Moderate spam activity' : 'No spam history'
          ],
          preventiveMeasures: [
            '🤖 Enable Auto-Mod (/automod enable)',
            '⏱️ Activate slowmode in public channels',
            '🔇 Set 10-minute timeout for new members',
            '📝 Enable message content filtering',
            spamProbability > 60 ? '🚨 URGENT: Restrict new member posting' : '✅ Current filters adequate'
          ]
        });
      }

      if (threatType === 'all') {
        const analysisWindow = timeframeMs * 2;
        const daysInWindow = analysisWindow / (24 * 60 * 60 * 1000);
        const overallFrequency = recentThreats.length / daysInWindow;
        
        const recent7d = recentThreats.filter(t => now - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000);
        const older7d = recentThreats.filter(t => {
          const age = now - t.timestamp.getTime();
          return age >= 7 * 24 * 60 * 60 * 1000 && age < 14 * 24 * 60 * 60 * 1000;
        });
        
        const recentFreq = recent7d.length / 7;
        const olderFreq = older7d.length / 7;
        const trend = olderFreq > 0 ? (recentFreq - olderFreq) / olderFreq : 0;
        
        const criticalCount = recentThreats.filter(t => t.severity === 'critical').length;
        const highCount = recentThreats.filter(t => t.severity === 'high').length;
        
        let generalProbability = 0;
        if (recentThreats.length === 0) {
          generalProbability = 15;
        } else {
          generalProbability = Math.min(95, (overallFrequency * 60) * (1 + Math.max(0, trend * 0.5)));
          if (criticalCount > 2 || highCount > 5) generalProbability = Math.min(95, generalProbability + 20);
        }
        
        const trendIndicator = trend > 0.3 ? '📈 INCREASING threat activity' : trend < -0.3 ? '📉 DECREASING threat activity' : '➡️ STABLE threat levels';
        
        predictions.push({
          type: 'GENERAL SECURITY INCIDENT',
          probability: generalProbability,
          timeframe: timeframe,
          indicators: [
            `${recentThreats.length} total threats in last ${daysInWindow.toFixed(0)} days (${overallFrequency.toFixed(2)}/day)`,
            `Recent 7d: ${recent7d.length} threats vs Previous 7d: ${older7d.length} threats`,
            trendIndicator,
            `Severity breakdown: ${criticalCount} critical, ${highCount} high, ${recentThreats.length - criticalCount - highCount} medium/low`
          ],
          preventiveMeasures: [
            '🔍 Increase monitoring frequency',
            '📊 Review security logs daily',
            '👮 Assign more moderators',
            '🛡️ Enable all protection modules',
            generalProbability > 70 ? '🚨 CRITICAL: Implement emergency protocols' : '✅ Maintain current security posture'
          ]
        });
      }

      let aiInsights = 'AI analysis unavailable - using statistical models';
      try {
        const analysisPrompt = `Predict threats for server with ${recentThreats.length} recent incidents: ${recentThreats.slice(0, 10).map(t => t.type).join(', ')}`;
        const aiResult = await claudeService.execute('analyzeThreatLevel', analysisPrompt, recentThreats);
        aiInsights = aiResult.reasoning || aiInsights;
      } catch (error) {
        console.error('AI prediction failed:', error);
      }

      const highestThreat = predictions.reduce((max, p) => p.probability > max.probability ? p : max, predictions[0]);
      const avgProbability = predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length;

      const threatColor = avgProbability > 70 ? 0xFF0000 : avgProbability > 50 ? 0xFF6600 : avgProbability > 30 ? 0xFFAA00 : 0x00FF00;

      const embed = new EmbedBuilder()
        .setColor(threatColor)
        .setTitle('🔮 PREDICTIVE THREAT ANALYSIS')
        .setDescription(`**Server:** ${guild.name}\n**Timeframe:** ${timeframe === '24h' ? 'Next 24 Hours' : timeframe === '7d' ? 'Next 7 Days' : 'Next 30 Days'}\n**Analysis Type:** ${threatType.toUpperCase()}\n**Historical Data:** ${recentThreats.length} incidents analyzed`)
        .addFields(
          {
            name: '📊 OVERALL RISK ASSESSMENT',
            value: `**Average Threat Probability:** ${avgProbability.toFixed(1)}%\n**Highest Risk:** ${highestThreat.type} (${highestThreat.probability.toFixed(1)}%)\n**Status:** ${avgProbability > 70 ? '🔴 CRITICAL' : avgProbability > 50 ? '🟠 HIGH' : avgProbability > 30 ? '🟡 MODERATE' : '🟢 LOW'}`,
            inline: false
          }
        );

      for (const prediction of predictions) {
        const riskLevel = prediction.probability > 70 ? '🔴 CRITICAL' : 
                         prediction.probability > 50 ? '🟠 HIGH' : 
                         prediction.probability > 30 ? '🟡 MODERATE' : '🟢 LOW';
        
        embed.addFields({
          name: `${riskLevel} ${prediction.type}`,
          value: `**Probability:** ${prediction.probability.toFixed(1)}%\n**Key Indicators:**\n${prediction.indicators.map(i => `• ${i}`).join('\n').substring(0, 300)}`,
          inline: false
        });

        embed.addFields({
          name: '🛡️ Recommended Actions',
          value: prediction.preventiveMeasures.slice(0, 4).map(m => `• ${m}`).join('\n').substring(0, 300),
          inline: false
        });
      }

      embed.addFields({
        name: '🤖 AI INSIGHTS',
        value: aiInsights.substring(0, 1024),
        inline: false
      });

      const processingTime = Date.now() - startTime;
      embed.setFooter({ text: `Prediction model: ML-Enhanced Statistical Analysis | Processing time: ${processingTime}ms` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'threat-predict',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: true,
        parameters: { timeframe, threatType },
        result: `Avg probability: ${avgProbability.toFixed(1)}%, ${predictions.length} predictions`,
        duration,
        metadata: { avgProbability: avgProbability.toFixed(1), predictionsCount: predictions.length }
      });

      if (avgProbability > 70) {
        await storage.createThreat({
          type: 'predictive_alert',
          severity: 'high',
          description: `High probability (${avgProbability.toFixed(1)}%) of ${highestThreat.type} in ${timeframe}`,
          serverId: guild.id,
          serverName: guild.name,
          action: 'alert',
          metadata: { predictions, timeframe, avgProbability }
        });
      }

    } catch (error) {
      console.error('Threat prediction error:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Prediction Failed')
        .setDescription(`Failed to predict threats: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'threat-predict',
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
