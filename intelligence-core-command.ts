import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { aiService as claudeAI } from '../../services/claude-ai';

const PROTECTED_USER_ID = '717089833759015063';
const PROTECTED_USERNAME = 'xcalius_';

export const intelligenceCoreCommand = {
  data: new SlashCommandBuilder()
    .setName('intelligence-core')
    .setDescription('🧠⚡ INTELLIGENCE CORE: AI-powered threat intelligence with extreme analysis')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('operation')
        .setDescription('Intelligence operation')
        .addChoices(
          { name: 'Full Server Analysis', value: 'analyze' },
          { name: 'Threat Profiling', value: 'profile' },
          { name: 'Predictive Scan', value: 'predict' },
          { name: 'Deep Learning Mode', value: 'learn' }
        )
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('ai_intensity')
        .setDescription('AI analysis intensity (1-10, default: 10)')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      const guildId = interaction.guildId;
      const operation = interaction.options.getString('operation', true);
      const aiIntensity = interaction.options.getInteger('ai_intensity') || 10;

      if (!guildId) {
        await interaction.reply({ content: '❌ This command can only be used in a server', ephemeral: true });
        return;
      }

      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) {
        await interaction.reply({ content: '❌ Could not access server information. Please try again.', ephemeral: true });
        return;
      }

      await interaction.deferReply();

      const serverId = guild.id;
      const serverName = guild.name;

      const progressEmbed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🧠⚡ INTELLIGENCE CORE ACTIVE ⚡🧠')
        .setDescription(`**Operation:** ${operation.toUpperCase()}\n**AI Intensity:** ${aiIntensity}/10 (${aiIntensity >= 9 ? 'EXTREME' : 'HIGH'})\n\n🔮 Analyzing with Distributed AI (Free Engines)...\n⏳ This may take a moment...`)
        .setTimestamp();
      
      await interaction.editReply({ embeds: [progressEmbed] });

      if (operation === 'analyze') {
        await guild.members.fetch();
        const members = Array.from(guild.members.cache.values());
        const threats = await storage.getThreats(1000);
        const serverThreats = threats.filter(t => t.serverId === serverId);

        const criticalUsers: Array<{
          userId: string;
          username: string;
          riskScore: number;
          reasons: string[];
          aiAnalysis: string;
        }> = [];

        let analyzedCount = 0;
        const now = Date.now();

        for (const member of members) {
          if (member.user.bot) continue;
          if (member.id === guild.ownerId) continue;
          if (member.id === PROTECTED_USER_ID) continue;

          analyzedCount++;
          
          const accountAge = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
          const reputation = await storage.getUserReputation(member.id, serverId);
          const reputationScore = reputation?.score || 100;
          const userThreats = serverThreats.filter(t => t.userId === member.id);

          let riskScore = 0;
          const reasons: string[] = [];

          if (accountAge < 7) {
            riskScore += (7 - accountAge) * 10;
            reasons.push(`New account: ${accountAge.toFixed(1)} days`);
          }

          if (reputationScore < 50) {
            riskScore += (50 - reputationScore);
            reasons.push(`Low reputation: ${reputationScore}`);
          }

          if (userThreats.length > 0) {
            riskScore += userThreats.length * 20;
            reasons.push(`${userThreats.length} threat(s) detected`);
          }

          const nonAsciiChars = (member.user.username.match(/[^\x00-\x7F]/g) || []).length;
          if (nonAsciiChars > 10) {
            riskScore += nonAsciiChars * 2;
            reasons.push(`Suspicious username (${nonAsciiChars} non-ASCII)`);
          }

          if (riskScore >= 30 * (11 - aiIntensity) / 10) {
            let aiAnalysis = 'AI analysis pending';
            
            try {
              const analysisResult = await claudeAI.analyzeThreat({
                username: member.user.username,
                userId: member.id,
                accountAge,
                reputation: reputationScore,
                activityPattern: `${userThreats.length} threats detected`
              });
              
              aiAnalysis = `${analysisResult.threatType} (${(analysisResult.confidence * 100).toFixed(0)}% confidence) - ${analysisResult.suggestedAction.toUpperCase()}`;
              riskScore += analysisResult.confidence * 50;
            } catch (error) {
              console.error('AI analysis failed:', error);
              aiAnalysis = 'AI unavailable - using heuristic analysis';
            }

            criticalUsers.push({
              userId: member.id,
              username: member.user.username,
              riskScore,
              reasons,
              aiAnalysis
            });
          }

          if (analyzedCount % 25 === 0) {
            const updateEmbed = new EmbedBuilder()
              .setColor(0x9B59B6)
              .setTitle('🧠 INTELLIGENCE ANALYSIS IN PROGRESS 🧠')
              .setDescription(`**AI Intensity:** ${aiIntensity}/10\n\n🔍 Analyzed: ${analyzedCount}/${members.length}\n⚠️ Critical risks: ${criticalUsers.length}`)
              .setTimestamp();
            
            await interaction.editReply({ embeds: [updateEmbed] });
          }
        }

        const topRisks = criticalUsers
          .sort((a, b) => b.riskScore - a.riskScore)
          .slice(0, 15);

        const avgRisk = criticalUsers.length > 0
          ? criticalUsers.reduce((sum, u) => sum + u.riskScore, 0) / criticalUsers.length
          : 0;

        const serverRiskLevel = avgRisk > 80 ? '🔴 CRITICAL' :
                               avgRisk > 60 ? '🟠 HIGH' :
                               avgRisk > 40 ? '🟡 MODERATE' :
                               avgRisk > 20 ? '🟢 LOW' : '✅ MINIMAL';

        const embed = new EmbedBuilder()
          .setTitle('🧠⚡ INTELLIGENCE CORE ANALYSIS COMPLETE ⚡🧠')
          .setDescription(
            `**Operation:** FULL SERVER ANALYSIS\n` +
            `**AI Intensity:** ${aiIntensity}/10 (EXTREME)\n\n` +
            `📊 **${analyzedCount}** users analyzed\n` +
            `⚠️ **${criticalUsers.length}** critical risks identified\n` +
            `📈 Average Risk Score: **${avgRisk.toFixed(1)}**\n` +
            `🛡️ Protected user **${PROTECTED_USERNAME}** was excluded`
          )
          .setColor(avgRisk > 60 ? 0xFF0000 : avgRisk > 40 ? 0xFF6600 : 0x00FF00)
          .addFields([
            { 
              name: '📊 SERVER RISK ASSESSMENT', 
              value: `**Overall Risk:** ${serverRiskLevel}\n**Critical Users:** ${criticalUsers.length}\n**Average Risk:** ${avgRisk.toFixed(1)}/100\n**AI Engine:** Distributed (Free)`,
              inline: true 
            },
            { 
              name: '🎯 THREAT BREAKDOWN', 
              value: `**Critical (80+):** ${criticalUsers.filter(u => u.riskScore >= 80).length}\n**High (60-79):** ${criticalUsers.filter(u => u.riskScore >= 60 && u.riskScore < 80).length}\n**Medium (40-59):** ${criticalUsers.filter(u => u.riskScore >= 40 && u.riskScore < 60).length}\n**Low (<40):** ${criticalUsers.filter(u => u.riskScore < 40).length}`,
              inline: true 
            },
            { 
              name: '💀 TOP CRITICAL RISKS', 
              value: topRisks.length > 0
                ? topRisks.slice(0, 10).map(u => `• **${u.username}** (${u.riskScore.toFixed(0)}): ${u.aiAnalysis.substring(0, 60)}`).join('\n')
                : '✅ No critical risks detected',
              inline: false 
            },
            { 
              name: '🧠 AI RECOMMENDATIONS', 
              value: avgRisk > 80 
                ? '🚨 **URGENT**: Execute `/ultra-purge` immediately\n🔒 Activate `/nuke-shield mode:emergency`\n🦅 Enable `/predator-mode hunting_mode:ultra_aggressive`'
                : avgRisk > 60
                ? '⚠️ **HIGH ALERT**: Run `/scan type:full`\n🛡️ Enable `/sentinel mode:enable sensitivity:9`\n📊 Monitor `/stats` frequently'
                : avgRisk > 40
                ? '⚠️ **MODERATE**: Increase monitoring\n🔍 Review `/audit` logs\n✅ Current protection adequate'
                : '✅ **LOW RISK**: Server is secure\n📊 Maintain current protection\n🔍 Routine monitoring sufficient',
              inline: false 
            }
          ])
          .setFooter({ text: `🧠 Intelligence Core | AI Intensity: ${aiIntensity}/10 | Protected: ${PROTECTED_USERNAME}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (operation === 'profile') {
        const threats = await storage.getThreats(500);
        const serverThreats = threats.filter(t => t.serverId === serverId);

        const threatTypes = new Map<string, number>();
        serverThreats.forEach(t => {
          threatTypes.set(t.type, (threatTypes.get(t.type) || 0) + 1);
        });

        const topThreatTypes = Array.from(threatTypes.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        const recentThreats = serverThreats
          .filter(t => Date.now() - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000)
          .length;

        const embed = new EmbedBuilder()
          .setTitle('🧠 THREAT PROFILING COMPLETE 🧠')
          .setDescription(
            `**Total Threats:** ${serverThreats.length}\n` +
            `**Recent (7d):** ${recentThreats}\n` +
            `**Unique Types:** ${threatTypes.size}`
          )
          .setColor(0x9B59B6)
          .addFields([
            {
              name: '📊 THREAT TYPE DISTRIBUTION',
              value: topThreatTypes.length > 0
                ? topThreatTypes.map(([type, count]) => `• **${type}**: ${count} incidents`).join('\n')
                : 'No threats detected',
              inline: false
            }
          ])
          .setFooter({ text: `Protected: ${PROTECTED_USERNAME}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (operation === 'predict') {
        const threats = await storage.getThreats(1000);
        const serverThreats = threats.filter(t => t.serverId === serverId);
        
        const recent24h = serverThreats.filter(t => Date.now() - t.timestamp.getTime() < 24 * 60 * 60 * 1000);
        const recent7d = serverThreats.filter(t => Date.now() - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000);

        const trend = recent7d.length > 0 ? (recent24h.length / (recent7d.length / 7)) : 0;
        const predictedNext24h = Math.round(trend * recent7d.length / 7);

        const raidProbability = Math.min(95, (recent7d.filter(t => t.type.includes('raid')).length / 7) * 100);
        const spamProbability = Math.min(95, (recent7d.filter(t => t.type.includes('spam')).length / 7) * 80);

        const embed = new EmbedBuilder()
          .setTitle('🔮 PREDICTIVE THREAT ANALYSIS 🔮')
          .setDescription('**AI-Powered Threat Prediction**')
          .setColor(0x9B59B6)
          .addFields([
            {
              name: '📈 THREAT PREDICTIONS (Next 24h)',
              value: `**Expected Incidents:** ${predictedNext24h}\n**Raid Probability:** ${raidProbability.toFixed(1)}%\n**Spam Probability:** ${spamProbability.toFixed(1)}%`,
              inline: true
            },
            {
              name: '📊 TREND ANALYSIS',
              value: trend > 1.5 ? '📈 **INCREASING** (High alert)' : 
                     trend > 1 ? '📈 **RISING** (Monitor)' :
                     trend < 0.5 ? '📉 **DECREASING** (Improving)' :
                     '➡️ **STABLE**',
              inline: true
            }
          ])
          .setFooter({ text: `🧠 AI-Powered Prediction | Protected: ${PROTECTED_USERNAME}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'intelligence-core',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { operation, aiIntensity },
        result: `Intelligence operation ${operation} completed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { operation, aiIntensity }
      });

    } catch (error) {
      console.error('Error in intelligence-core command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error executing intelligence-core: ${errorMessage}`);
    }
  }
};
