import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { aiService as claudeAI } from '../../services/claude-ai';

const PROTECTED_USER_ID = '717089833759015063';
const PROTECTED_USERNAME = 'xcalius_';

export const ultraPurgeCommand = {
  data: new SlashCommandBuilder()
    .setName('ultra-purge')
    .setDescription('☢️ ULTRA AGGRESSIVE AI PURGE: Eliminate all suspicious users with extreme prejudice')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addBooleanOption(option =>
      option.setName('confirm')
        .setDescription('CONFIRM ultra purge action (required)')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('aggressiveness')
        .setDescription('AI aggressiveness level (1-10, default: 9)')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('include_new_accounts')
        .setDescription('Include accounts <14 days old (default: true)')
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const guildId = interaction.guildId;
      const aggressiveness = interaction.options.getInteger('aggressiveness') || 9;
      const includeNew = interaction.options.getBoolean('include_new_accounts') ?? true;
      const confirmed = interaction.options.getBoolean('confirm', true);

      if (!guildId) {
        await interaction.editReply('❌ This command can only be used in a server');
        return;
      }

      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) {
        await interaction.editReply('❌ Could not access server information. Please try again.');
        return;
      }

      if (!confirmed) {
        await interaction.editReply('❌ You must confirm the ultra purge by setting confirm to TRUE');
        return;
      }

      const serverId = guild.id;
      const serverName = guild.name;

      const progressEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('☢️ ULTRA PURGE INITIATED ☢️')
        .setDescription(`**AI Aggressiveness:** ${aggressiveness}/10 (EXTREME)\n\n🔍 Scanning all members with Distributed AI...\n⏳ This will take a moment...`)
        .setTimestamp();
      
      await interaction.editReply({ embeds: [progressEmbed] });

      await guild.members.fetch();
      const members = Array.from(guild.members.cache.values());
      
      const targetsToPurge: string[] = [];
      const suspiciousUsers: Array<{
        userId: string;
        username: string;
        reason: string;
        threatLevel: number;
      }> = [];

      let scannedCount = 0;
      const now = Date.now();

      for (const member of members) {
        if (member.user.bot) continue;
        if (member.id === guild.ownerId) continue;
        if (member.id === PROTECTED_USER_ID) continue;
        if (member.permissions.has(PermissionFlagsBits.Administrator)) continue;

        scannedCount++;
        
        const accountAge = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        const joinAge = member.joinedAt ? (now - member.joinedAt.getTime()) / (1000 * 60 * 60 * 24) : 0;
        const reputation = await storage.getUserReputation(member.id, serverId);
        const reputationScore = reputation?.score || 100;

        let suspicionScore = 0;
        const reasons: string[] = [];

        if (accountAge < 1 && aggressiveness >= 8) {
          suspicionScore += 90;
          reasons.push('Account <1 day old (CRITICAL)');
        } else if (accountAge < 3 && aggressiveness >= 7) {
          suspicionScore += 80;
          reasons.push('Account <3 days old (SEVERE)');
        } else if (accountAge < 7 && aggressiveness >= 6) {
          suspicionScore += 60;
          reasons.push('Account <7 days old (HIGH)');
        } else if (accountAge < 14 && includeNew && aggressiveness >= 5) {
          suspicionScore += 40;
          reasons.push('Account <14 days old (MODERATE)');
        }

        if (reputationScore < 20 && aggressiveness >= 4) {
          suspicionScore += 80;
          reasons.push(`Reputation: ${reputationScore} (CRITICAL)`);
        } else if (reputationScore < 50 && aggressiveness >= 6) {
          suspicionScore += 50;
          reasons.push(`Reputation: ${reputationScore} (LOW)`);
        } else if (reputationScore < 80 && aggressiveness >= 8) {
          suspicionScore += 30;
          reasons.push(`Reputation: ${reputationScore} (SUSPICIOUS)`);
        }

        const nonAsciiCount = (member.user.username.match(/[^\x00-\x7F]/g) || []).length;
        if (nonAsciiCount > 15 && aggressiveness >= 7) {
          suspicionScore += 60;
          reasons.push(`Username: ${nonAsciiCount} non-ASCII chars (SUSPICIOUS)`);
        } else if (nonAsciiCount > 8 && aggressiveness >= 8) {
          suspicionScore += 40;
          reasons.push(`Username: ${nonAsciiCount} non-ASCII chars (MODERATE)`);
        }

        const hasDefaultAvatar = member.user.avatarURL() === null;
        if (hasDefaultAvatar && accountAge < 7 && aggressiveness >= 7) {
          suspicionScore += 30;
          reasons.push('Default avatar + new account (SUSPICIOUS)');
        }

        if (joinAge < 1 && aggressiveness >= 9) {
          suspicionScore += 50;
          reasons.push('Just joined server (ULTRA SUSPICIOUS)');
        }

        const threats = await storage.getThreats(100);
        const userThreats = threats.filter(t => t.userId === member.id && t.serverId === serverId);
        if (userThreats.length > 0) {
          suspicionScore += userThreats.length * 30;
          reasons.push(`${userThreats.length} threat(s) detected (CRITICAL)`);
        }

        const suspicionThreshold = aggressiveness >= 9 ? 40 :
                                   aggressiveness >= 7 ? 60 :
                                   aggressiveness >= 5 ? 80 : 100;

        if (suspicionScore >= suspicionThreshold) {
          suspiciousUsers.push({
            userId: member.id,
            username: member.user.username,
            reason: reasons.join(', '),
            threatLevel: suspicionScore
          });

          if (suspicionScore >= 70 || aggressiveness >= 9) {
            targetsToPurge.push(member.id);
          }
        }

        if (scannedCount % 50 === 0) {
          const updateEmbed = new EmbedBuilder()
            .setColor(0xFF6600)
            .setTitle('☢️ ULTRA PURGE IN PROGRESS ☢️')
            .setDescription(`**AI Aggressiveness:** ${aggressiveness}/10\n\n🔍 Scanned: ${scannedCount}/${members.length}\n⚠️ Suspicious: ${suspiciousUsers.length}\n💀 Marked for purge: ${targetsToPurge.length}`)
            .setTimestamp();
          
          await interaction.editReply({ embeds: [updateEmbed] });
        }
      }

      let purgedCount = 0;
      let failedCount = 0;

      for (const userId of targetsToPurge) {
        try {
          const member = guild.members.cache.get(userId);
          if (member && member.bannable) {
            const userInfo = suspiciousUsers.find(u => u.userId === userId);
            await member.ban({ 
              reason: `☢️ ULTRA AGGRESSIVE PURGE: ${userInfo?.reason || 'AI-detected threat'} | Protected: ${PROTECTED_USERNAME}`,
              deleteMessageSeconds: 7 * 24 * 60 * 60
            });
            purgedCount++;
            
            await storage.createThreat({
              type: 'ultra_purge',
              severity: 'critical',
              description: `Ultra purge: ${userInfo?.reason || 'Suspicious activity'}`,
              serverId,
              serverName,
              userId,
              username: member.user.username,
              action: 'ban',
              metadata: {
                aggressiveness,
                threatLevel: userInfo?.threatLevel || 0,
                reason: userInfo?.reason,
                executedBy: interaction.user.id,
                executedByUsername: interaction.user.username,
                protectedUser: PROTECTED_USERNAME
              }
            });

            await storage.updateUserReputationScore(userId, serverId, -999, true);
          } else {
            failedCount++;
          }
        } catch (err) {
          console.error(`Failed to purge user ${userId}:`, err);
          failedCount++;
        }
      }

      const topThreats = suspiciousUsers
        .sort((a, b) => b.threatLevel - a.threatLevel)
        .slice(0, 10);

      const embed = new EmbedBuilder()
        .setTitle('☢️💀 ULTRA AGGRESSIVE PURGE COMPLETE 💀☢️')
        .setDescription(
          `**AI Aggressiveness:** ${aggressiveness}/10 (EXTREME MODE)\n\n` +
          `💀 **${purgedCount}** suspicious users ELIMINATED\n` +
          `⚠️ **${suspiciousUsers.length - purgedCount}** flagged but not banned\n` +
          `✅ **${scannedCount}** total users scanned\n` +
          `🛡️ Protected user **${PROTECTED_USERNAME}** was ignored`
        )
        .setColor(0xFF0000)
        .addFields([
          { 
            name: '📊 PURGE STATISTICS', 
            value: `**Scanned:** ${scannedCount}\n**Suspicious:** ${suspiciousUsers.length}\n**Purged:** ${purgedCount}\n**Failed:** ${failedCount}\n**Protected:** ${PROTECTED_USERNAME}`,
            inline: true 
          },
          { 
            name: '🎯 AI AGGRESSIVENESS', 
            value: `**Level:** ${aggressiveness}/10\n**Threshold:** ${aggressiveness >= 9 ? 'ULTRA LOW' : aggressiveness >= 7 ? 'VERY LOW' : 'LOW'}\n**False Positives:** ${aggressiveness >= 9 ? 'HIGH' : aggressiveness >= 7 ? 'MEDIUM' : 'LOW'}\n**Effectiveness:** ${aggressiveness >= 9 ? 'MAXIMUM' : 'HIGH'}`,
            inline: true 
          },
          { 
            name: '💀 TOP THREATS ELIMINATED', 
            value: topThreats.length > 0 
              ? topThreats.slice(0, 5).map(u => `• ${u.username}: ${u.threatLevel}% (${u.reason.substring(0, 50)})`).join('\n')
              : 'No major threats detected',
            inline: false 
          },
          { 
            name: '⚠️ POST-PURGE PROTOCOL', 
            value: 
              '1. 🔍 Run `/scan type:full` to verify\n' +
              '2. 📊 Check `/stats` for updated metrics\n' +
              '3. 🛡️ Enable `/sentinel mode:enable` for 24/7 protection\n' +
              '4. 💀 Execute `/nuke-shield` for maximum security\n' +
              '5. 🔒 Consider `/lockserver` for total lockdown',
            inline: false 
          }
        ])
        .setFooter({ text: `☢️ ULTRA PURGE COMPLETE - ${purgedCount} threats eliminated | ${PROTECTED_USERNAME} protected | AI Level: ${aggressiveness}/10` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'ultra-purge',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { aggressiveness, includeNew },
        result: `Ultra purge completed: ${purgedCount} users purged, ${suspiciousUsers.length} flagged`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { 
          aggressiveness, 
          scannedCount, 
          suspiciousCount: suspiciousUsers.length,
          purgedCount, 
          failedCount,
          protectedUser: PROTECTED_USERNAME
        }
      });

    } catch (error) {
      console.error('Error in ultra-purge command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'ultra-purge',
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

      await interaction.editReply(`❌ Error executing ultra-purge: ${errorMessage}`);
    }
  }
};
