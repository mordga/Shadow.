import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, User } from 'discord.js';
import { storage } from '../../storage';

interface AltAccountIndicator {
  userId: string;
  username: string;
  similarity: number;
  indicators: string[];
  confidence: number;
}

export const deepbanCommand = {
  data: new SlashCommandBuilder()
    .setName('deepban')
    .setDescription('🔨 Deep ban with AI-powered alt account detection')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to deep ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('scope')
        .setDescription('Ban scope')
        .addChoices(
          { name: 'Main Account Only', value: 'main_only' },
          { name: 'Detected Alts Only', value: 'alts_only' },
          { name: 'Main + All Detected Alts', value: 'main_and_alts' }
        )
        .setRequired(false))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for ban')
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user', true);
    const scope = interaction.options.getString('scope') || 'main_and_alts';
    const reason = interaction.options.getString('reason') || 'Deep ban initiated - alt account detection';
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
      if (!member && scope !== 'alts_only') {
        await interaction.editReply('❌ User not found in this server');
        return;
      }

      await guild.members.fetch();
      const allMembers = Array.from(guild.members.cache.values());

      const targetAccountAge = (Date.now() - targetUser.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const targetJoinDate = member?.joinedAt?.getTime() || 0;

      const progressEmbed = new EmbedBuilder()
        .setColor(0xFF6B00)
        .setTitle('🔍 DEEP BAN ANALYSIS IN PROGRESS')
        .setDescription(`**Target:** ${targetUser.tag}\n**Status:** Scanning for alt accounts...\n\n⏳ This may take a moment...`)
        .setTimestamp();

      await interaction.editReply({ embeds: [progressEmbed] });

      const detectedAlts: AltAccountIndicator[] = [];

      for (const scanMember of allMembers) {
        if (scanMember.id === targetUser.id) continue;
        if (scanMember.user.bot) continue;

        const indicators: string[] = [];
        let similarity = 0;

        const accountAge = (Date.now() - scanMember.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        const ageDiff = Math.abs(accountAge - targetAccountAge);
        if (ageDiff < 1) {
          indicators.push('🕐 Created within 1 day');
          similarity += 30;
        } else if (ageDiff < 7) {
          indicators.push('📅 Created within same week');
          similarity += 20;
        }

        const joinTime = scanMember.joinedAt?.getTime() || 0;
        const joinDiff = Math.abs(joinTime - targetJoinDate) / 1000 / 60;
        if (joinDiff < 5) {
          indicators.push('⚡ Joined within 5 minutes');
          similarity += 35;
        } else if (joinDiff < 60) {
          indicators.push('⏱️ Joined within same hour');
          similarity += 20;
        } else if (joinDiff < 1440) {
          indicators.push('📆 Joined on same day');
          similarity += 10;
        }

        const targetName = targetUser.username.toLowerCase();
        const scanName = scanMember.user.username.toLowerCase();
        
        const nameTokens = targetName.split(/[^a-z0-9]/);
        const scanTokens = scanName.split(/[^a-z0-9]/);
        const commonTokens = nameTokens.filter(t => t.length > 2 && scanTokens.includes(t));
        
        if (commonTokens.length > 0) {
          indicators.push(`👤 Similar username (${commonTokens.length} matches)`);
          similarity += 15 * commonTokens.length;
        }

        if (targetName.includes('alt') || targetName.includes('backup') || scanName.includes('alt') || scanName.includes('backup')) {
          indicators.push('🔄 Username suggests alt account');
          similarity += 25;
        }

        const levenshtein = (a: string, b: string): number => {
          const matrix: number[][] = [];
          for (let i = 0; i <= b.length; i++) matrix[i] = [i];
          for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
          for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
              if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
              } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
              }
            }
          }
          return matrix[b.length][a.length];
        };

        const distance = levenshtein(targetName, scanName);
        const maxLen = Math.max(targetName.length, scanName.length);
        const nameSimilarity = 1 - (distance / maxLen);
        
        if (nameSimilarity > 0.7) {
          indicators.push(`✨ High name similarity (${(nameSimilarity * 100).toFixed(0)}%)`);
          similarity += 20;
        }

        const reputation = await storage.getUserReputation(scanMember.id, guild.id);
        if (reputation && reputation.score < 50) {
          indicators.push('⚠️ Low reputation score');
          similarity += 15;
        }

        const targetRoles = member?.roles.cache.map(r => r.id) || [];
        const scanRoles = scanMember.roles.cache.map(r => r.id);
        const commonRoles = targetRoles.filter(r => scanRoles.includes(r));
        
        if (commonRoles.length > 2) {
          indicators.push(`🎭 ${commonRoles.length} common roles`);
          similarity += 10;
        }

        if (indicators.length >= 2 && similarity >= 40) {
          const confidence = Math.min(95, similarity);
          detectedAlts.push({
            userId: scanMember.id,
            username: scanMember.user.username,
            similarity,
            indicators,
            confidence
          });
        }
      }

      detectedAlts.sort((a, b) => b.confidence - a.confidence);

      let bannedCount = 0;
      const bannedUsers: string[] = [];
      const errors: string[] = [];

      if (scope === 'main_only' || scope === 'main_and_alts') {
        try {
          await guild.members.ban(targetUser.id, { reason: `[DEEPBAN] ${reason}` });
          bannedUsers.push(targetUser.tag);
          bannedCount++;

          await storage.createThreat({
            type: 'deepban',
            severity: 'high',
            description: `User ${targetUser.tag} deep banned: ${reason}`,
            serverId: guild.id,
            serverName: guild.name,
            userId: targetUser.id,
            username: targetUser.tag,
            action: 'ban',
            metadata: { scope, altsDetected: detectedAlts.length }
          });
        } catch (error) {
          errors.push(`Failed to ban ${targetUser.tag}: ${(error as Error).message}`);
        }
      }

      if (scope === 'alts_only' || scope === 'main_and_alts') {
        const altsToban = detectedAlts.filter(alt => alt.confidence >= 60).slice(0, 10);
        
        for (const alt of altsToban) {
          try {
            await guild.members.ban(alt.userId, { 
              reason: `[DEEPBAN-ALT] Alt of ${targetUser.tag} (${alt.confidence.toFixed(0)}% confidence) - ${reason}` 
            });
            bannedUsers.push(alt.username);
            bannedCount++;

            await storage.createThreat({
              type: 'alt_account_ban',
              severity: 'medium',
              description: `Alt account ${alt.username} banned (linked to ${targetUser.tag})`,
              serverId: guild.id,
              serverName: guild.name,
              userId: alt.userId,
              username: alt.username,
              action: 'ban',
              metadata: { mainAccount: targetUser.tag, confidence: alt.confidence, indicators: alt.indicators }
            });

            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            errors.push(`Failed to ban ${alt.username}: ${(error as Error).message}`);
          }
        }
      }

      const color = bannedCount > 0 ? 0xFF0000 : 0xFF6600;
      const resultEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🔨 DEEP BAN COMPLETED')
        .setDescription(`**Target:** ${targetUser.tag}\n**Scope:** ${scope.replace(/_/g, ' ').toUpperCase()}`)
        .addFields(
          {
            name: '📊 SCAN RESULTS',
            value: `**Alt Accounts Detected:** ${detectedAlts.length}\n**High Confidence (>60%):** ${detectedAlts.filter(a => a.confidence >= 60).length}\n**Medium Confidence (40-60%):** ${detectedAlts.filter(a => a.confidence >= 40 && a.confidence < 60).length}\n**Low Confidence (<40%):** ${detectedAlts.filter(a => a.confidence < 40).length}`,
            inline: true
          },
          {
            name: '⚡ ACTIONS TAKEN',
            value: `**Users Banned:** ${bannedCount}\n**Main Account:** ${bannedUsers.includes(targetUser.tag) ? '✅ Banned' : '⏭️ Skipped'}\n**Alt Accounts:** ${bannedCount - (bannedUsers.includes(targetUser.tag) ? 1 : 0)}\n**Errors:** ${errors.length}`,
            inline: true
          }
        );

      if (detectedAlts.length > 0) {
        const topAlts = detectedAlts.slice(0, 5);
        const altsList = topAlts.map((alt, i) => {
          const confidence = alt.confidence >= 80 ? '🔴 VERY HIGH' : alt.confidence >= 60 ? '🟠 HIGH' : alt.confidence >= 40 ? '🟡 MEDIUM' : '🟢 LOW';
          const banned = bannedUsers.includes(alt.username) ? '✅ BANNED' : '⏭️ SKIPPED';
          return `**${i + 1}. ${alt.username}** (${alt.userId})\n• Confidence: ${alt.confidence.toFixed(0)}% ${confidence}\n• Status: ${banned}\n• Indicators: ${alt.indicators.slice(0, 3).join(', ')}`;
        }).join('\n\n');

        resultEmbed.addFields({
          name: '🔍 DETECTED ALT ACCOUNTS',
          value: altsList.substring(0, 1024) + (detectedAlts.length > 5 ? `\n\n*... and ${detectedAlts.length - 5} more*` : ''),
          inline: false
        });
      } else {
        resultEmbed.addFields({
          name: '🔍 ALT DETECTION',
          value: '✅ No alt accounts detected with sufficient confidence',
          inline: false
        });
      }

      if (errors.length > 0) {
        resultEmbed.addFields({
          name: '⚠️ ERRORS',
          value: errors.slice(0, 3).join('\n').substring(0, 1024),
          inline: false
        });
      }

      resultEmbed.addFields({
        name: '📝 REASON',
        value: reason,
        inline: false
      });

      const processingTime = Date.now() - startTime;
      resultEmbed.setFooter({ text: `Deep Ban v3.0 | Scanned ${allMembers.length} members in ${processingTime}ms` })
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'deepban',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: true,
        parameters: { targetUser: targetUser.tag, scope, reason },
        result: `Banned ${bannedCount} users, Detected ${detectedAlts.length} alts`,
        duration,
        metadata: { bannedCount, altsDetected: detectedAlts.length }
      });

      await storage.updateUserReputationScore(targetUser.id, guild.id, -100, true);

    } catch (error) {
      console.error('Deep ban error:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Deep Ban Failed')
        .setDescription(`Failed to execute deep ban: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'deepban',
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
