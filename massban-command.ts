import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { AIService } from '../../services/claude-ai';

const PROTECTED_USER_ID = '717089833759015063';
const PROTECTED_USERNAME = 'xcalius_';

export const massbanCommand = {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription('💀 ULTRA AGGRESSIVE MASSBAN: Nuclear option for server purification')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('criteria')
        .setDescription('Ban criteria')
        .addChoices(
          { name: '🚨 New Accounts (<7 days)', value: 'new_accounts' },
          { name: '🔴 Low Reputation (<50)', value: 'low_reputation' },
          { name: '⚠️ Recent Threats (last 24h)', value: 'recent_threats' },
          { name: '🚫 No Activity (never posted)', value: 'no_activity' },
          { name: '🔴 Critical Threats', value: 'critical_threats' },
          { name: '💀 SERVER NUKE - Ban ALL users (EXTREME)', value: 'server_nuke' },
          { name: '☢️ ULTRA PURGE - Suspicious patterns only', value: 'ultra_purge' },
          { name: '🎯 RAID SERVER - Ban users from specific server URL', value: 'raid_server' }
        )
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('confirm')
        .setDescription('CONFIRM mass ban action (required)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('server_url')
        .setDescription('Server invite URL (optional for raid_server - provides context)')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const guildId = interaction.guildId;
      const criteria = interaction.options.getString('criteria', true);
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
        await interaction.editReply('❌ You must confirm the mass ban by setting confirm to TRUE');
        return;
      }

      const serverId = guild.id;
      const serverName = guild.name;
      const serverUrl = interaction.options.getString('server_url');

      await guild.members.fetch();
      const members = Array.from(guild.members.cache.values());
      
      const targetsToBan: string[] = [];
      let bannedCount = 0;
      let failedCount = 0;
      let protectedCount = 0;
      let criteriaDescription = '';

      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      switch (criteria) {
        case 'new_accounts':
          criteriaDescription = 'New accounts (<7 days old)';
          for (const member of members) {
            if (member.user.bot) continue;
            if (member.id === PROTECTED_USER_ID) continue;
            const accountAge = now - member.user.createdTimestamp;
            if (accountAge < sevenDaysMs) {
              targetsToBan.push(member.id);
            }
          }
          break;

        case 'low_reputation':
          criteriaDescription = 'Low reputation score (<50)';
          for (const member of members) {
            if (member.user.bot) continue;
            if (member.id === PROTECTED_USER_ID) continue;
            const rep = await storage.getUserReputation(member.id, serverId);
            if (rep && rep.score < 50) {
              targetsToBan.push(member.id);
            }
          }
          break;

        case 'recent_threats':
          criteriaDescription = 'Users with recent threats (last 24h)';
          const threats = await storage.getThreats(500);
          const oneDayAgo = now - oneDayMs;
          const recentThreats = threats.filter(t => 
            t.serverId === serverId && 
            t.timestamp.getTime() > oneDayAgo
          );
          const threatUserIds = new Set(recentThreats.map(t => t.userId).filter(Boolean));
          for (const userId of Array.from(threatUserIds)) {
            if (userId && userId !== PROTECTED_USER_ID) targetsToBan.push(userId);
          }
          break;

        case 'no_activity':
          criteriaDescription = 'Users with no activity (never posted)';
          const traces = await storage.getMessageTraces({ limit: 1000 });
          const activeUserIds = new Set(traces.map(t => t.userId));
          for (const member of members) {
            if (member.user.bot) continue;
            if (member.id === PROTECTED_USER_ID) continue;
            if (!activeUserIds.has(member.id)) {
              targetsToBan.push(member.id);
            }
          }
          break;

        case 'critical_threats':
          criteriaDescription = 'Users with critical-level threats';
          const allThreats = await storage.getThreats(500);
          const criticalThreats = allThreats.filter(t => 
            t.serverId === serverId && 
            t.severity === 'critical'
          );
          const criticalUserIds = new Set(criticalThreats.map(t => t.userId).filter(Boolean));
          for (const userId of Array.from(criticalUserIds)) {
            if (userId && userId !== PROTECTED_USER_ID) targetsToBan.push(userId);
          }
          break;

        case 'server_nuke':
          criteriaDescription = '💀 SERVER NUKE - BANNING ALL USERS (Nuclear option)';
          for (const member of members) {
            if (member.user.bot) continue;
            if (member.id === guild.ownerId) continue;
            if (member.id === PROTECTED_USER_ID) {
              protectedCount++;
              continue;
            }
            if (member.permissions.has(PermissionFlagsBits.Administrator)) continue;
            targetsToBan.push(member.id);
          }
          break;

        case 'ultra_purge':
          criteriaDescription = '☢️ ULTRA PURGE - AI-detected suspicious patterns';
          for (const member of members) {
            if (member.user.bot) continue;
            if (member.id === PROTECTED_USER_ID) continue;
            
            const accountAge = now - member.user.createdTimestamp;
            const rep = await storage.getUserReputation(member.id, serverId);
            const reputation = rep?.score || 100;
            
            const isSuspicious = 
              accountAge < 3 * 24 * 60 * 60 * 1000 ||
              reputation < 30 ||
              (accountAge < sevenDaysMs && reputation < 70) ||
              member.user.username.match(/[^\x00-\x7F]/g)?.length || 0 > 10;
            
            if (isSuspicious) {
              targetsToBan.push(member.id);
            }
          }
          break;

        case 'raid_server':
          try {
            const aiService = new AIService();
            let targetServerName = 'Unknown Server';
            
            if (serverUrl) {
              try {
                let inviteCode: string | undefined;
                const trimmedUrl = serverUrl.trim();
                
                try {
                  const urlObj = new URL(/^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`);
                  const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);
                  inviteCode = pathSegments[pathSegments.length - 1];
                } catch {
                  const parts = trimmedUrl.replace(/[?#].*$/, '').split('/').filter(part => part.length > 0);
                  inviteCode = parts[parts.length - 1];
                }
                
                if (inviteCode && inviteCode.length >= 2) {
                  const invite = await interaction.client.fetchInvite(inviteCode);
                  targetServerName = invite.guild?.name || targetServerName;
                }
              } catch (error) {
                console.log('Could not fetch invite info, proceeding with ban analysis only');
              }
            }

            const calculateSimilarity = (str1: string, str2: string): number => {
              const s1 = str1.toLowerCase();
              const s2 = str2.toLowerCase();
              
              const len1 = s1.length;
              const len2 = s2.length;
              const matrix: number[][] = [];

              for (let i = 0; i <= len1; i++) {
                matrix[i] = [i];
              }
              for (let j = 0; j <= len2; j++) {
                matrix[0][j] = j;
              }

              for (let i = 1; i <= len1; i++) {
                for (let j = 1; j <= len2; j++) {
                  if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                  } else {
                    matrix[i][j] = Math.min(
                      matrix[i - 1][j - 1] + 1,
                      matrix[i][j - 1] + 1,
                      matrix[i - 1][j] + 1
                    );
                  }
                }
              }

              const distance = matrix[len1][len2];
              const maxLen = Math.max(len1, len2);
              return maxLen === 0 ? 1 : 1 - (distance / maxLen);
            };

            const detectUsernamePattern = (username: string): string[] => {
              const patterns: string[] = [];
              
              if (/\d{3,}/.test(username)) patterns.push('sequential_numbers');
              if (/[^\x00-\x7F]{3,}/.test(username)) patterns.push('special_characters');
              if (/(.)\1{2,}/.test(username)) patterns.push('repeated_chars');
              if (/^[a-zA-Z]+\d+$/.test(username)) patterns.push('word_plus_numbers');
              if (username.length <= 4) patterns.push('short_name');
              
              return patterns;
            };

            await interaction.editReply('🔍 Analyzing recent bans and detecting raid patterns...');

            const bans = await guild.bans.fetch();
            
            const recentWindowMs = 48 * 60 * 60 * 1000;
            const accountWindowMs = 7 * 24 * 60 * 60 * 1000;
            
            const bannedUsers = Array.from(bans.values()).map(ban => ({
              user: ban.user,
              reason: ban.reason || 'No reason provided'
            }));

            const bannedPatterns: {
              username: string;
              userId: string;
              createdAt: number;
              patterns: string[];
            }[] = [];

            for (const ban of bannedUsers) {
              const accountAge = now - ban.user.createdTimestamp;
              if (accountAge < recentWindowMs) {
                bannedPatterns.push({
                  username: ban.user.username,
                  userId: ban.user.id,
                  createdAt: ban.user.createdTimestamp,
                  patterns: detectUsernamePattern(ban.user.username)
                });
              }
            }

            const commonPatterns = new Map<string, number>();
            for (const bp of bannedPatterns) {
              for (const pattern of bp.patterns) {
                commonPatterns.set(pattern, (commonPatterns.get(pattern) || 0) + 1);
              }
            }

            const significantPatterns = Array.from(commonPatterns.entries())
              .filter(([_, count]) => count >= 2)
              .map(([pattern, _]) => pattern);

            const accountCreationTimes = bannedPatterns.map(bp => bp.createdAt);
            const avgCreationTime = accountCreationTimes.length > 0 
              ? accountCreationTimes.reduce((a, b) => a + b, 0) / accountCreationTimes.length 
              : 0;

            const suspiciousUsers: {
              userId: string;
              username: string;
              confidence: number;
              reasons: string[];
            }[] = [];

            for (const member of members) {
              if (member.user.bot) continue;
              if (member.id === PROTECTED_USER_ID) continue;
              if (member.id === guild.ownerId) continue;
              if (member.permissions.has(PermissionFlagsBits.Administrator)) continue;

              const reasons: string[] = [];
              let confidence = 0;

              for (const bannedUser of bannedPatterns) {
                const similarity = calculateSimilarity(member.user.username, bannedUser.username);
                if (similarity > 0.7) {
                  reasons.push(`Name ${Math.round(similarity * 100)}% similar to banned user "${bannedUser.username}"`);
                  confidence += 0.3;
                  break;
                }
              }

              const memberPatterns = detectUsernamePattern(member.user.username);
              const matchingPatterns = memberPatterns.filter(p => significantPatterns.includes(p));
              if (matchingPatterns.length > 0) {
                reasons.push(`Matches patterns: ${matchingPatterns.join(', ')}`);
                confidence += 0.2 * matchingPatterns.length;
              }

              if (avgCreationTime > 0) {
                const timeDiff = Math.abs(member.user.createdTimestamp - avgCreationTime);
                if (timeDiff < accountWindowMs) {
                  reasons.push('Account created in same time window as banned users');
                  confidence += 0.25;
                }
              }

              const joinAge = member.joinedTimestamp ? now - member.joinedTimestamp : Infinity;
              if (joinAge < recentWindowMs) {
                reasons.push('Recently joined (last 48h)');
                confidence += 0.15;
              }

              if (confidence > 0 && reasons.length > 0) {
                suspiciousUsers.push({
                  userId: member.id,
                  username: member.user.username,
                  confidence: Math.min(confidence, 1),
                  reasons
                });
              }
            }

            if (suspiciousUsers.length > 0) {
              await interaction.editReply('🤖 Using AI to analyze suspicious users for coordinated raid patterns...');

              for (const suspect of suspiciousUsers) {
                const member = guild.members.cache.get(suspect.userId);
                if (!member) continue;

                const accountAge = Math.floor((now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
                const rep = await storage.getUserReputation(suspect.userId, serverId);

                const aiAnalysis = await aiService.analyzeThreat({
                  username: suspect.username,
                  userId: suspect.userId,
                  accountAge,
                  reputation: rep?.score || 0,
                  joinPattern: `Detected patterns: ${suspect.reasons.join(', ')}`,
                  activityPattern: 'Pattern-based raid detection'
                });

                if (aiAnalysis.isThreat && aiAnalysis.confidence > 0.7) {
                  suspect.confidence = Math.max(suspect.confidence, aiAnalysis.confidence);
                  suspect.reasons.push(`AI: ${aiAnalysis.reasoning} (${Math.round(aiAnalysis.confidence * 100)}% confidence)`);
                } else if (aiAnalysis.confidence < 0.3) {
                  suspect.confidence = Math.min(suspect.confidence, 0.5);
                }
              }
            }

            const highConfidenceTargets = suspiciousUsers.filter(u => u.confidence > 0.7);

            if (highConfidenceTargets.length === 0) {
              const patternInfo = significantPatterns.length > 0 
                ? `Found patterns: ${significantPatterns.join(', ')}`
                : 'No significant patterns detected';
              
              await interaction.editReply(
                `✅ Raid analysis complete - No high-confidence threats detected.\n\n` +
                `📊 Analysis Summary:\n` +
                `• Banned users analyzed: ${bannedPatterns.length}\n` +
                `• ${patternInfo}\n` +
                `• Suspicious users found: ${suspiciousUsers.length}\n` +
                `• High-confidence targets: 0\n\n` +
                `Your server appears safe from coordinated raid patterns.`
              );
              return;
            }

            for (const target of highConfidenceTargets) {
              targetsToBan.push(target.userId);
            }

            criteriaDescription = serverUrl 
              ? `🎯 RAID DETECTION - Pattern analysis from "${targetServerName}"`
              : `🎯 RAID DETECTION - Pattern analysis from recent bans`;
            
            criteriaDescription += `\n📊 Detected ${significantPatterns.length} patterns, ${targetsToBan.length} targets identified`;
            criteriaDescription += `\n🔍 Analyzed ${bannedPatterns.length} recent bans, found ${suspiciousUsers.length} suspicious users`;

          } catch (error: any) {
            const errorMsg = error?.message || 'Unknown error';
            console.error('Error in raid_server analysis:', error);
            await interaction.editReply(`❌ Error during raid analysis: ${errorMsg}`);
            return;
          }
          break;
      }

      // Execute bans with ULTRA AGGRESSIVE mode
      const progressEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('💀 MASS BAN IN PROGRESS 💀')
        .setDescription(`**Initiating ${criteriaDescription}**\n\n⏳ Executing bans... This may take a moment.`)
        .setTimestamp();
      
      await interaction.editReply({ embeds: [progressEmbed] });

      for (const userId of targetsToBan) {
        try {
          const member = guild.members.cache.get(userId);
          if (member && member.bannable) {
            await member.ban({ 
              reason: `💀 ULTRA AGGRESSIVE MASSBAN: ${criteriaDescription} | Protected: ${PROTECTED_USERNAME}`,
              deleteMessageSeconds: 7 * 24 * 60 * 60
            });
            bannedCount++;
            
            await storage.createThreat({
              type: 'massban',
              severity: 'critical',
              description: `Mass banned: ${criteriaDescription}`,
              serverId,
              serverName,
              userId,
              username: member.user.username,
              action: 'ban',
              metadata: {
                criteria,
                criteriaDescription,
                executedBy: interaction.user.id,
                executedByUsername: interaction.user.username,
                timestamp: new Date().toISOString(),
                protectedUser: PROTECTED_USERNAME
              }
            });
          } else {
            failedCount++;
          }
        } catch (err) {
          console.error(`Failed to ban user ${userId}:`, err);
          failedCount++;
        }
      }

      const protectionMessage = protectedCount > 0 ? 
        `\n🛡️ **${protectedCount}** protected users ignored (including ${PROTECTED_USERNAME})` : 
        `\n🛡️ Protected user ${PROTECTED_USERNAME} (ID: ${PROTECTED_USER_ID}) was ignored`;

      const embed = new EmbedBuilder()
        .setTitle('💀⚡ ULTRA AGGRESSIVE MASS BAN EXECUTED ⚡💀')
        .setDescription(
          `**Criteria:** ${criteriaDescription}\n\n` +
          `🚨 **${bannedCount}** users permanently OBLITERATED\n` +
          `⚠️ **${failedCount}** users failed to ban\n` +
          `🎯 **${targetsToBan.length}** total targets identified` +
          protectionMessage
        )
        .setColor(0xFF0000)
        .addFields([
          { name: '⚖️ Executed By', value: interaction.user.username, inline: true },
          { name: '📋 Criteria', value: criteriaDescription, inline: true },
          { 
            name: '💀 DESTRUCTION METRICS', 
            value: `✅ Banned: **${bannedCount}**\n❌ Failed: **${failedCount}**\n🎯 Targets: **${targetsToBan.length}**\n🛡️ Protected: **${PROTECTED_USERNAME}**`,
            inline: false 
          },
          { 
            name: '⚠️ ULTRA AGGRESSIVE POST-BAN PROTOCOL', 
            value: 
              '1. 🔍 Review `/audit` for carnage details\n' +
              '2. 🛡️ Run `/scan type:full` for survivors\n' +
              '3. 📊 Check `/stats` for updated metrics\n' +
              '4. 🔒 Execute `/lockserver` for total lockdown\n' +
              '5. 💀 Consider `/nuke-shield` for maximum protection',
            inline: false 
          }
        ])
        .setFooter({ text: `💀 MASS BAN COMPLETE - ${bannedCount} users eliminated | ${PROTECTED_USERNAME} protected` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'massban',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { criteria },
        result: `Mass banned ${bannedCount} users using criteria: ${criteriaDescription}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { 
          criteria, 
          criteriaDescription, 
          bannedCount, 
          failedCount, 
          totalTargets: targetsToBan.length 
        }
      });

    } catch (error) {
      console.error('Error in massban command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'massban',
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

      await interaction.editReply(`❌ Error executing massban: ${errorMessage}`);
    }
  }
};
