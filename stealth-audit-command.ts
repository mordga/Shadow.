import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { storage } from '../../storage';

export const stealthAuditCommand = {
  data: new SlashCommandBuilder()
    .setName('stealth-audit')
    .setDescription('👁️ Silent security audit without leaving traces or alerting users')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('target')
        .setDescription('Audit target')
        .addChoices(
          { name: 'Server Security - Overall security posture', value: 'server' },
          { name: 'Suspicious Users - Identify potential threats', value: 'users' },
          { name: 'Permission Audit - Check role permissions', value: 'permissions' },
          { name: 'Activity Patterns - Detect anomalies', value: 'patterns' }
        )
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('export')
        .setDescription('Export audit results to file')
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getString('target') || 'server';
    const exportResults = interaction.options.getBoolean('export') ?? false;
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
      const embed = new EmbedBuilder()
        .setColor(0x2C2F33)
        .setTitle('👁️ STEALTH AUDIT REPORT')
        .setDescription('🔒 **CONFIDENTIAL** - Silent security analysis completed\n*This audit was conducted without user notification*')
        .setTimestamp();

      if (target === 'server') {
        await guild.members.fetch();
        const members = guild.members.cache;
        
        const adminCount = members.filter(m => m.permissions.has(PermissionFlagsBits.Administrator)).size;
        const modCount = members.filter(m => 
          m.permissions.has(PermissionFlagsBits.ManageGuild) ||
          m.permissions.has(PermissionFlagsBits.BanMembers) ||
          m.permissions.has(PermissionFlagsBits.KickMembers)
        ).size;
        const botCount = members.filter(m => m.user.bot).size;

        const allThreats = await storage.getThreats(5000);
        const serverThreats = allThreats.filter(t => t.serverId === guild.id);
        const last24h = serverThreats.filter(t => Date.now() - t.timestamp.getTime() < 24 * 60 * 60 * 1000);
        const last7d = serverThreats.filter(t => Date.now() - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000);

        const newMembers = members.filter(m => {
          const accountAge = (Date.now() - m.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          return accountAge < 7;
        }).size;

        let securityScore = 100;
        if (adminCount > 5) securityScore -= 15;
        if (botCount > 10) securityScore -= 10;
        if (newMembers > members.size * 0.2) securityScore -= 20;
        if (last7d.length > 10) securityScore -= 15;
        if (last24h.length > 5) securityScore -= 10;
        
        if (adminCount <= 3) securityScore += 5;
        if (last7d.length === 0) securityScore += 10;
        
        securityScore = Math.max(0, Math.min(100, securityScore));

        const securityLevel = securityScore >= 90 ? '🟢 EXCELLENT' :
                             securityScore >= 75 ? '🟡 GOOD' :
                             securityScore >= 50 ? '🟠 FAIR' :
                             '🔴 POOR';

        embed.addFields([
          {
            name: '🛡️ SECURITY SCORE',
            value: `**Overall Score:** ${securityScore}/100\n**Level:** ${securityLevel}`,
            inline: false
          },
          {
            name: '👥 MEMBER ANALYSIS',
            value: `**Total Members:** ${members.size}\n` +
                   `**Administrators:** ${adminCount}\n` +
                   `**Moderators:** ${modCount}\n` +
                   `**Bots:** ${botCount}\n` +
                   `**New Accounts (<7d):** ${newMembers}`,
            inline: true
          },
          {
            name: '⚠️ THREAT LANDSCAPE',
            value: `**All-Time Threats:** ${serverThreats.length}\n` +
                   `**Last 24h:** ${last24h.length}\n` +
                   `**Last 7d:** ${last7d.length}\n` +
                   `**Active Risks:** ${last24h.length > 3 ? 'HIGH' : 'LOW'}`,
            inline: true
          }
        ]);

        const vulnerabilities: string[] = [];
        if (adminCount > 5) vulnerabilities.push('⚠️ Too many administrators - reduce privileges');
        if (newMembers > members.size * 0.2) vulnerabilities.push('⚠️ High percentage of new accounts - potential raid prep');
        if (last24h.length > 5) vulnerabilities.push('🔴 Elevated threat activity in last 24h');
        if (botCount > 10) vulnerabilities.push('⚠️ Many bots - verify all are authorized');
        
        if (vulnerabilities.length === 0) vulnerabilities.push('✅ No critical vulnerabilities detected');

        embed.addFields({
          name: '🔍 VULNERABILITIES DETECTED',
          value: vulnerabilities.join('\n'),
          inline: false
        });

      } else if (target === 'users') {
        await guild.members.fetch();
        const members = guild.members.cache;
        
        const allThreats = await storage.getThreats(2000);
        const guildThreats = allThreats.filter(t => t.serverId === guild.id);
        
        const threatsByUser: Map<string, number> = new Map();
        guildThreats.forEach(threat => {
          if (threat.userId) {
            const recent = Date.now() - threat.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000;
            if (recent) {
              threatsByUser.set(threat.userId, (threatsByUser.get(threat.userId) || 0) + 1);
            }
          }
        });
        
        const reputationCache: Map<string, number> = new Map();
        const memberIds = Array.from(members.keys());
        for (const memberId of memberIds) {
          const reputation = await storage.getUserReputation(memberId, guild.id);
          if (reputation) {
            reputationCache.set(memberId, reputation.score);
          }
        }
        
        const suspiciousUsers: Array<{ id: string; tag: string; reasons: string[]; score: number }> = [];

        for (const [, member] of Array.from(members)) {
          const reasons: string[] = [];
          let suspicionScore = 0;

          const accountAge = (Date.now() - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          const joinAge = member.joinedAt ? (Date.now() - member.joinedAt.getTime()) / (1000 * 60 * 60 * 24) : 0;

          if (accountAge < 3) { reasons.push('Very new account'); suspicionScore += 30; }
          else if (accountAge < 7) { reasons.push('New account'); suspicionScore += 20; }

          if (member.permissions.has(PermissionFlagsBits.Administrator) && accountAge < 30) {
            reasons.push('Admin with young account');
            suspicionScore += 40;
          }

          const reputationScore = reputationCache.get(member.id);
          if (reputationScore !== undefined && reputationScore < 50) {
            reasons.push(`Low reputation (${reputationScore})`);
            suspicionScore += 25;
          }

          const recentThreatCount = threatsByUser.get(member.id) || 0;
          if (recentThreatCount > 2) {
            reasons.push(`${recentThreatCount} recent threats`);
            suspicionScore += 35;
          }

          if (suspicionScore >= 40) {
            suspiciousUsers.push({
              id: member.id,
              tag: member.user.tag,
              reasons,
              score: suspicionScore
            });
          }
        }

        suspiciousUsers.sort((a, b) => b.score - a.score);
        const topSuspicious = suspiciousUsers.slice(0, 10);

        embed.addFields([
          {
            name: '🎯 SUSPICIOUS USERS IDENTIFIED',
            value: `**Total Flagged:** ${suspiciousUsers.length}\n` +
                   `**High Risk (70+):** ${suspiciousUsers.filter(u => u.score >= 70).length}\n` +
                   `**Moderate Risk (50-69):** ${suspiciousUsers.filter(u => u.score >= 50 && u.score < 70).length}\n` +
                   `**Low Risk (40-49):** ${suspiciousUsers.filter(u => u.score >= 40 && u.score < 50).length}`,
            inline: false
          }
        ]);

        if (topSuspicious.length > 0) {
          embed.addFields({
            name: '🚨 TOP SUSPICIOUS USERS',
            value: topSuspicious
              .map(u => `**${u.tag}** (${u.score}): ${u.reasons.join(', ')}`)
              .join('\n')
              .substring(0, 1024),
            inline: false
          });
        } else {
          embed.addFields({
            name: '✅ NO SUSPICIOUS ACTIVITY',
            value: 'No users currently flagged as suspicious',
            inline: false
          });
        }

      } else if (target === 'permissions') {
        const roles = guild.roles.cache;
        const dangerousPerms = [
          PermissionFlagsBits.Administrator,
          PermissionFlagsBits.ManageGuild,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.BanMembers,
          PermissionFlagsBits.KickMembers
        ];

        const riskyRoles = roles.filter(role => 
          dangerousPerms.some(perm => role.permissions.has(perm)) && role.id !== guild.id
        );

        const adminRoles = riskyRoles.filter(r => r.permissions.has(PermissionFlagsBits.Administrator));
        const modRoles = riskyRoles.filter(r => !r.permissions.has(PermissionFlagsBits.Administrator));

        await guild.members.fetch();
        let totalWithDangerousPerms = 0;
        guild.members.cache.forEach(member => {
          if (dangerousPerms.some(perm => member.permissions.has(perm))) {
            totalWithDangerousPerms++;
          }
        });

        embed.addFields([
          {
            name: '🔐 PERMISSION AUDIT',
            value: `**Total Roles:** ${roles.size}\n` +
                   `**Admin Roles:** ${adminRoles.size}\n` +
                   `**Moderator Roles:** ${modRoles.size}\n` +
                   `**Users w/ Dangerous Perms:** ${totalWithDangerousPerms}`,
            inline: false
          }
        ]);

        if (adminRoles.size > 0) {
          embed.addFields({
            name: '👑 ADMINISTRATOR ROLES',
            value: adminRoles.map(r => `**${r.name}** - ${r.members.size} members`).join('\n').substring(0, 1024),
            inline: false
          });
        }

        const warnings: string[] = [];
        if (adminRoles.size > 3) warnings.push('⚠️ Too many admin roles - consolidate privileges');
        if (totalWithDangerousPerms > guild.memberCount * 0.1) warnings.push('⚠️ Too many users with dangerous permissions');
        if (warnings.length === 0) warnings.push('✅ Permission structure looks secure');

        embed.addFields({
          name: '💡 RECOMMENDATIONS',
          value: warnings.join('\n'),
          inline: false
        });

      } else if (target === 'patterns') {
        const allThreats = await storage.getThreats(5000);
        const serverThreats = allThreats.filter(t => t.serverId === guild.id);
        
        const hourlyActivity: number[] = new Array(24).fill(0);
        serverThreats.forEach(threat => {
          const hour = threat.timestamp.getHours();
          hourlyActivity[hour]++;
        });

        const peakHours = hourlyActivity
          .map((count, hour) => ({ hour, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        const threatTypes: Record<string, number[]> = {};
        serverThreats.forEach(threat => {
          if (!threatTypes[threat.type]) threatTypes[threat.type] = new Array(7).fill(0);
          const daysAgo = Math.floor((Date.now() - threat.timestamp.getTime()) / (1000 * 60 * 60 * 24));
          if (daysAgo < 7) threatTypes[threat.type][6 - daysAgo]++;
        });

        embed.addFields([
          {
            name: '📊 ACTIVITY PATTERNS',
            value: `**Total Threats Analyzed:** ${serverThreats.length}\n` +
                   `**Peak Activity Hours:** ${peakHours.map(p => `${p.hour}:00 (${p.count})`).join(', ')}`,
            inline: false
          }
        ]);

        const anomalies: string[] = [];
        const recentSurge = serverThreats.filter(t => Date.now() - t.timestamp.getTime() < 60 * 60 * 1000).length;
        if (recentSurge > 10) anomalies.push('🔴 Unusual activity spike in last hour');
        
        Object.entries(threatTypes).forEach(([type, counts]) => {
          const recent = counts.slice(-2).reduce((a, b) => a + b, 0);
          const older = counts.slice(0, 5).reduce((a, b) => a + b, 0);
          if (recent > older * 2) anomalies.push(`⚠️ ${type} attacks increasing sharply`);
        });

        if (anomalies.length === 0) anomalies.push('✅ No unusual patterns detected');

        embed.addFields({
          name: '🔍 ANOMALIES DETECTED',
          value: anomalies.join('\n'),
          inline: false
        });
      }

      embed.addFields({
        name: '🔒 AUDIT METADATA',
        value: `**Target:** ${target}\n` +
               `**Conducted By:** ${interaction.user.tag}\n` +
               `**Duration:** ${Date.now() - startTime}ms\n` +
               `**Status:** Completed silently`,
        inline: false
      });

      embed.setFooter({ text: '👁️ Stealth Audit • No user notifications sent • Confidential' });

      if (exportResults) {
        const auditData = {
          timestamp: new Date().toISOString(),
          target,
          conductedBy: interaction.user.tag,
          guild: { id: guild.id, name: guild.name },
          results: embed.data.fields
        };

        const attachment = new AttachmentBuilder(
          Buffer.from(JSON.stringify(auditData, null, 2)),
          { name: `stealth-audit-${target}-${Date.now()}.json` }
        );

        await interaction.editReply({ embeds: [embed], files: [attachment] });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'stealth-audit',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { target, export: exportResults },
        result: `Stealth audit completed: ${target}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { target, exported: exportResults }
      });

    } catch (error) {
      console.error('Error in stealth-audit command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await interaction.editReply(`❌ Error conducting stealth audit: ${errorMessage}`);
    }
  }
};
