import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { storage } from '../../storage';
import { securityEngine } from '../../services/security-engine';

interface ScanThreat {
  userId?: string;
  username?: string;
  channelId?: string;
  channelName?: string;
  webhookId?: string;
  webhookName?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  reason: string;
  details: string;
}

export const scanCommand = {
  data: new SlashCommandBuilder()
    .setName('scan')
    .setDescription('Scan server for security threats and suspicious activity')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks)
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of scan to perform')
        .addChoices(
          { name: 'Full Scan', value: 'full' },
          { name: 'Quick Scan', value: 'quick' },
          { name: 'Members Only', value: 'members' },
          { name: 'Channels Only', value: 'channels' }
        )
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('delete_webhooks')
        .setDescription('Automatically delete suspicious webhooks (requires confirmation)')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    const scanType = interaction.options.getString('type') || 'quick';
    const deleteWebhooks = interaction.options.getBoolean('delete_webhooks') || false;
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
      const threats: ScanThreat[] = [];
      let membersScanned = 0;
      let channelsScanned = 0;
      let webhooksScanned = 0;
      let webhooksDeleted = 0;

      // ULTRA-AGGRESSIVE MODE: Maximum suspicious patterns and extremely strict age requirement
      const suspiciousPatterns = ['raid', 'nuke', 'spam', 'hack', 'attack', 'troll', 'bot', 'fake', 'scam', 'phish', 'test', 'alt', 'backup', 'leak', 'dox', 'gore', 'porn', 'nsfw', 'cp', 'child', 'minor', 'sell', 'buy', 'trade', 'free', 'nitro', 'discord.gg', 'admin', 'mod', 'owner', 'exploit', 'bypass', 'crack', 'pirate', 'cheat', 'virus', 'malware', 'ddos', 'dos', 'flood', 'script', 'auto', 'macro', 'selfbot'];
      const minAccountAgeDays = 3;

      if (scanType === 'full' || scanType === 'members') {
        await guild.members.fetch();
        const members = Array.from(guild.members.cache.values());

        for (const member of members) {
          if (member.user.bot) continue;
          membersScanned++;

          const accountAge = (Date.now() - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          const username = member.user.username.toLowerCase();
          const reputation = await storage.getUserReputation(member.id, guild.id);

          const securityCheck = await securityEngine.execute('checkUserJoin',
            member.id,
            member.user.username,
            guild.id,
            guild.name,
            member.user.createdAt
          );

          if (accountAge < minAccountAgeDays) {
            const baseSeverity = accountAge < 1 ? 'critical' : accountAge < 2 ? 'critical' : accountAge < 3 ? 'high' : 'medium';
            const adjustedSeverity = securityCheck.confidence > 0.3 ? 'critical' : baseSeverity;
            
            threats.push({
              userId: member.id,
              username: member.user.username,
              severity: adjustedSeverity as 'low' | 'medium' | 'high' | 'critical',
              type: 'new_account',
              reason: '🚨 ULTRA-AGGRESSIVE: New Account Detected - INSTANT BAN',
              details: `⚠️ Account age: ${accountAge.toFixed(1)} days (STRICT MINIMUM ${minAccountAgeDays} days) | AI Confidence: ${(securityCheck.confidence * 100).toFixed(0)}% | ⚡ IMMEDIATE BAN REQUIRED - ZERO TOLERANCE`
            });
          }

          for (const pattern of suspiciousPatterns) {
            if (username.includes(pattern)) {
              const usernameSeverity = ['raid', 'nuke', 'spam', 'hack', 'attack', 'troll', 'bot', 'fake', 'scam', 'phish'].includes(pattern) ? 'critical' : 'high';
              threats.push({
                userId: member.id,
                username: member.user.username,
                severity: usernameSeverity as 'low' | 'medium' | 'high' | 'critical',
                type: 'suspicious_username',
                reason: usernameSeverity === 'critical' ? '🚨 AGGRESSIVE: Critical Username Pattern' : 'Suspicious Username Pattern',
                details: `Username contains "${pattern}" - ${usernameSeverity === 'critical' ? 'IMMEDIATE BAN RECOMMENDED - HIGH THREAT' : 'possible malicious intent'}`
              });
              break;
            }
          }

          // ULTRA-AGGRESSIVE MODE: Extremely high reputation threshold
          if (reputation && reputation.score < 70) {
            const userThreats = await storage.getThreats(100);
            const userThreatHistory = userThreats.filter(t => t.userId === member.id && t.serverId === guild.id);
            const threatCount = userThreatHistory.length;
            const recentThreats = userThreatHistory.filter(t => 
              Date.now() - t.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000
            ).length;

            let severity: 'low' | 'medium' | 'high' | 'critical' = reputation.score < 30 ? 'critical' : reputation.score < 50 ? 'high' : reputation.score < 70 ? 'medium' : 'low';
            if (threatCount > 2 || recentThreats > 0) {
              severity = 'critical';
            }

            threats.push({
              userId: member.id,
              username: member.user.username,
              severity,
              type: 'low_reputation',
              reason: '🚨 AGGRESSIVE: Low Reputation Score',
              details: `⚠️ Reputation: ${reputation.score}/200 (CRITICAL THRESHOLD: 50) | Violations: ${reputation.violations} | Threat History: ${threatCount} total, ${recentThreats} recent | IMMEDIATE ACTION REQUIRED`
            });
          }

          // MODO AGRESIVO: Permisos peligrosos con umbrales más bajos
          if (member.permissions.has(PermissionFlagsBits.Administrator) && accountAge < 90) {
            threats.push({
              userId: member.id,
              username: member.user.username,
              severity: 'critical',
              type: 'dangerous_permissions',
              reason: '🚨 CRITICAL: Admin Permissions on New Account',
              details: `⚠️ Account has ADMINISTRATOR permission but is only ${accountAge.toFixed(1)} days old (MINIMUM 90 DAYS REQUIRED) - EXTREME SECURITY RISK - REVOKE IMMEDIATELY`
            });
          }

          if (member.permissions.has(PermissionFlagsBits.ManageGuild) && accountAge < 60) {
            threats.push({
              userId: member.id,
              username: member.user.username,
              severity: 'critical',
              type: 'dangerous_permissions',
              reason: '🚨 HIGH RISK: Manage Server on New Account',
              details: `⚠️ Account has MANAGE_GUILD permission but is only ${accountAge.toFixed(1)} days old (MINIMUM 60 DAYS REQUIRED) - SECURITY RISK - REVOKE NOW`
            });
          }

          if (member.permissions.has(PermissionFlagsBits.ManageRoles) && accountAge < 45) {
            threats.push({
              userId: member.id,
              username: member.user.username,
              severity: 'high',
              type: 'dangerous_permissions',
              reason: '⚠️ RISK: Manage Roles on New Account',
              details: `Account has MANAGE_ROLES permission but is only ${accountAge.toFixed(1)} days old (MINIMUM 45 DAYS REQUIRED) - POTENTIAL THREAT`
            });
          }

          if (member.permissions.has(PermissionFlagsBits.BanMembers) && accountAge < 30) {
            threats.push({
              userId: member.id,
              username: member.user.username,
              severity: 'high',
              type: 'dangerous_permissions',
              reason: '⚠️ RISK: Ban Members on New Account',
              details: `Account has BAN_MEMBERS permission but is only ${accountAge.toFixed(1)} days old (MINIMUM 30 DAYS REQUIRED)`
            });
          }
        }
      }

      if (scanType === 'full' || scanType === 'channels') {
        const channels = Array.from(guild.channels.cache.values());

        for (const channel of channels) {
          if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildVoice) continue;
          channelsScanned++;

          const channelName = channel.name.toLowerCase();

          for (const pattern of suspiciousPatterns) {
            if (channelName.includes(pattern)) {
              const channelSeverity = ['raid', 'nuke', 'spam', 'hack', 'attack', 'leak', 'dox', 'gore', 'porn', 'nsfw', 'cp', 'child', 'minor'].includes(pattern) ? 'high' : 'medium';
              threats.push({
                channelId: channel.id,
                channelName: channel.name,
                severity: channelSeverity as 'low' | 'medium' | 'high' | 'critical',
                type: 'suspicious_channel',
                reason: channelSeverity === 'high' ? '🚨 AGGRESSIVE: Highly Suspicious Channel' : 'Suspicious Channel Name',
                details: `Channel name contains "${pattern}" - ${channelSeverity === 'high' ? 'IMMEDIATE DELETION RECOMMENDED' : 'potential security risk'}`
              });
              break;
            }
          }

          if (channel.type === ChannelType.GuildText) {
            const everyoneOverwrites = channel.permissionOverwrites.cache.find(
              (overwrite) => overwrite.id === guild.id
            );

            if (everyoneOverwrites) {
              const perms = everyoneOverwrites.allow;
              
              if (perms.has(PermissionFlagsBits.Administrator)) {
                threats.push({
                  channelId: channel.id,
                  channelName: channel.name,
                  severity: 'critical',
                  type: 'dangerous_permissions',
                  reason: 'CRITICAL: Everyone Has Admin',
                  details: '@everyone role has ADMINISTRATOR permission in this channel'
                });
              }

              if (perms.has(PermissionFlagsBits.ManageChannels)) {
                threats.push({
                  channelId: channel.id,
                  channelName: channel.name,
                  severity: 'high',
                  type: 'dangerous_permissions',
                  reason: 'Everyone Can Manage Channels',
                  details: '@everyone role has MANAGE_CHANNELS permission'
                });
              }

              if (perms.has(PermissionFlagsBits.ManageRoles)) {
                threats.push({
                  channelId: channel.id,
                  channelName: channel.name,
                  severity: 'critical',
                  type: 'dangerous_permissions',
                  reason: 'Everyone Can Manage Roles',
                  details: '@everyone role has MANAGE_ROLES permission'
                });
              }
            }
          }
        }

        // WEBHOOK SCAN - Detectar y eliminar webhooks de bots
        const allWebhooks = await guild.fetchWebhooks();
        for (const webhook of Array.from(allWebhooks.values())) {
          webhooksScanned++;

          const isBot = webhook.owner?.bot === true;
          const webhookName = webhook.name?.toLowerCase() || '';
          const webhookAge = webhook.createdAt ? (Date.now() - webhook.createdAt.getTime()) / (1000 * 60 * 60 * 24) : 999;

          if (isBot) {
            threats.push({
              webhookId: webhook.id,
              webhookName: webhook.name || 'Unknown',
              channelId: webhook.channelId || undefined,
              severity: 'critical',
              type: 'bot_webhook',
              reason: '🤖 BOT WEBHOOK DETECTED',
              details: `Bot-owned webhook "${webhook.name}" in channel <#${webhook.channelId}> - ${deleteWebhooks ? 'DELETED' : 'IMMEDIATE DELETION RECOMMENDED'} | Owner: ${webhook.owner?.username || 'Unknown'}`
            });

            if (deleteWebhooks) {
              try {
                await webhook.delete('Automatic deletion: Bot webhook detected by security scan');
                webhooksDeleted++;
              } catch (err) {
                console.error('Failed to delete bot webhook:', err);
              }
            }
          }

          for (const pattern of suspiciousPatterns) {
            if (webhookName.includes(pattern)) {
              threats.push({
                webhookId: webhook.id,
                webhookName: webhook.name || 'Unknown',
                channelId: webhook.channelId || undefined,
                severity: 'high',
                type: 'suspicious_webhook',
                reason: '⚠️ SUSPICIOUS WEBHOOK NAME',
                details: `Webhook "${webhook.name}" contains suspicious pattern "${pattern}" in channel <#${webhook.channelId}> - ${deleteWebhooks ? 'DELETED' : 'DELETION RECOMMENDED'}`
              });

              if (deleteWebhooks) {
                try {
                  await webhook.delete('Automatic deletion: Suspicious webhook pattern detected');
                  webhooksDeleted++;
                } catch (err) {
                  console.error('Failed to delete suspicious webhook:', err);
                }
              }
              break;
            }
          }

          if (webhookAge < 1 && !isBot) {
            threats.push({
              webhookId: webhook.id,
              webhookName: webhook.name || 'Unknown',
              channelId: webhook.channelId || undefined,
              severity: 'medium',
              type: 'new_webhook',
              reason: '🆕 VERY NEW WEBHOOK',
              details: `Webhook "${webhook.name}" created ${webhookAge.toFixed(1)} days ago in channel <#${webhook.channelId}> - MONITOR CLOSELY`
            });
          }
        }
      }

      if (scanType === 'quick') {
        await guild.members.fetch();
        const members = Array.from(guild.members.cache.values());

        for (const member of members) {
          if (member.user.bot) continue;
          membersScanned++;

          const accountAge = (Date.now() - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          
          if (accountAge < 7) {
            const securityCheck = await securityEngine.execute('checkUserJoin',
              member.id,
              member.user.username,
              guild.id,
              guild.name,
              member.user.createdAt
            );

            threats.push({
              userId: member.id,
              username: member.user.username,
              severity: 'critical',
              type: 'new_account',
              reason: '🚨 AGGRESSIVE: Very New Account - AUTO-BAN PROTOCOL',
              details: `⚠️ Account age: ${accountAge.toFixed(1)} days (CRITICAL THRESHOLD: 7) | AI Confidence: ${(securityCheck.confidence * 100).toFixed(0)}% | IMMEDIATE REMOVAL REQUIRED`
            });
          }
        }

        const publicChannels = guild.channels.cache.filter(
          c => c.type === ChannelType.GuildText
        );
        channelsScanned = publicChannels.size;
      }

      const bypassPatterns = await storage.getBypassPatterns();
      const recentBypassPatterns = bypassPatterns.filter(p => 
        Date.now() - p.lastSeen.getTime() < 24 * 60 * 60 * 1000
      );

      let threatsRegistered = 0;
      for (const threat of threats) {
        try {
          let threatType = 'scan_detection';
          if (threat.userId && (threat.type === 'new_account' || threat.type === 'suspicious_username' || threat.type === 'low_reputation')) {
            threatType = 'suspicious_member';
          } else if (threat.channelId) {
            threatType = 'dangerous_channel';
          }

          const action = threat.severity === 'critical' ? 'warn' : 'monitor';

          await storage.createThreat({
            type: threatType,
            severity: threat.severity,
            description: `${threat.reason}: ${threat.details}`,
            serverId: guild.id,
            serverName: guild.name,
            userId: threat.userId,
            username: threat.username,
            action,
            metadata: {
              scanType,
              detectionType: threat.type,
              reason: threat.reason,
              details: threat.details,
              channelId: threat.channelId,
              channelName: threat.channelName,
              webhookId: threat.webhookId,
              webhookName: threat.webhookName,
              detectedAt: new Date().toISOString(),
              scannedBy: interaction.user.id,
              scannedByUsername: interaction.user.username
            }
          });
          threatsRegistered++;
        } catch (error) {
          console.error('Error creating threat record:', error);
        }
      }

      const duration = Date.now() - startTime;

      await storage.createCommandLog({
        commandName: 'scan',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { scanType },
        result: `Found ${threats.length} threats`,
        success: true,
        duration,
        metadata: {
          membersScanned,
          channelsScanned,
          webhooksScanned,
          webhooksDeleted,
          threatsFound: threats.length,
          threatsRegistered,
          bypassPatternsDetected: recentBypassPatterns.length
        }
      });

      const criticalThreats = threats.filter(t => t.severity === 'critical');
      const highThreats = threats.filter(t => t.severity === 'high');
      const mediumThreats = threats.filter(t => t.severity === 'medium');
      const lowThreats = threats.filter(t => t.severity === 'low');

      let embedColor = 0x00ff00;
      let statusEmoji = '✅';
      let statusText = 'SECURE';

      if (criticalThreats.length > 0) {
        embedColor = 0xff0000;
        statusEmoji = '🚨';
        statusText = 'CRITICAL THREATS DETECTED';
      } else if (highThreats.length > 0) {
        embedColor = 0xff6600;
        statusEmoji = '⚠️';
        statusText = 'HIGH THREATS DETECTED';
      } else if (mediumThreats.length > 0) {
        embedColor = 0xffff00;
        statusEmoji = '⚡';
        statusText = 'MEDIUM THREATS DETECTED';
      } else if (lowThreats.length > 0) {
        embedColor = 0x0099ff;
        statusEmoji = 'ℹ️';
        statusText = 'LOW THREATS DETECTED';
      }

      const embed = new EmbedBuilder()
        .setTitle(`${statusEmoji} AGGRESSIVE SECURITY SCAN`)
        .setDescription(`**Status:** ${statusText}\n\n⚠️ **AGGRESSIVE MODE ACTIVE** - Zero Tolerance Policy`)
        .setColor(embedColor)
        .addFields(
          { name: '📊 Scan Type', value: scanType.toUpperCase(), inline: true },
          { name: '👥 Members Scanned', value: membersScanned.toString(), inline: true },
          { name: '📺 Channels Scanned', value: channelsScanned.toString(), inline: true },
          { name: '🪝 Webhooks Scanned', value: webhooksScanned.toString(), inline: true },
          { name: '🗑️ Webhooks Deleted', value: webhooksDeleted.toString(), inline: true },
          { name: '🚨 Critical Threats', value: criticalThreats.length.toString(), inline: true },
          { name: '⚠️ High Threats', value: highThreats.length.toString(), inline: true },
          { name: '⚡ Medium Threats', value: mediumThreats.length.toString(), inline: true },
          { name: '💾 Threats Registered', value: `${threatsRegistered}/${threats.length}`, inline: true }
        )
        .setFooter({ text: `Scan completed in ${duration}ms` })
        .setTimestamp();

      if (threats.length > 0) {
        let recommendationsText = '**🚨 AGGRESSIVE MODE - ZERO TOLERANCE ACTIVE:**\n\n';

        if (criticalThreats.length > 0) {
          recommendationsText += `🚨 **${criticalThreats.length} CRITICAL THREATS** - ⚠️ AUTO-BAN PROTOCOL ACTIVE\n`;
          const criticalUsers = criticalThreats.filter(t => t.userId).slice(0, 5);
          criticalUsers.forEach(t => {
            recommendationsText += `• ❌ IMMEDIATE BAN: <@${t.userId}> - ${t.reason}\n`;
          });
          if (criticalThreats.length > 5) {
            recommendationsText += `• ... and ${criticalThreats.length - 5} more - ALL REQUIRE IMMEDIATE BAN\n`;
          }
          recommendationsText += '\n';
        }

        if (highThreats.length > 0) {
          recommendationsText += `⚠️ **${highThreats.length} HIGH THREATS** - PERMANENT BAN RECOMMENDED\n`;
          const highUsers = highThreats.filter(t => t.userId).slice(0, 3);
          highUsers.forEach(t => {
            recommendationsText += `• 🔴 URGENT BAN: <@${t.userId}> - ${t.reason}\n`;
          });
          if (highThreats.length > 3) {
            recommendationsText += `• ... and ${highThreats.length - 3} more - ACTION REQUIRED\n`;
          }
          recommendationsText += '\n';
        }

        if (mediumThreats.length > 0) {
          recommendationsText += `⚡ **${mediumThreats.length} MEDIUM THREATS** - AGGRESSIVE QUARANTINE (7 DAYS)\n\n`;
        }

        if (recentBypassPatterns.length > 0) {
          recommendationsText += `🔍 **${recentBypassPatterns.length} BYPASS PATTERNS** - AI COUNTER-MEASURES ACTIVE\n\n`;
        }

        recommendationsText += '**📋 AGGRESSIVE MODE PROTOCOL:**\n';
        if (criticalThreats.length > 0) {
          recommendationsText += '• ❌ IMMEDIATE PERMANENT BAN - No appeals\n';
          recommendationsText += '• 🚨 `/quarantine @user hours:168` - 7 DAY MAXIMUM\n';
        }
        recommendationsText += '• 🔒 ENABLE HIGHEST VERIFICATION (Phone required)\n';
        recommendationsText += '• ⚠️ REVOKE all dangerous permissions NOW\n';
        recommendationsText += '• 🛡️ AUTO-SCAN every 15 minutes\n';
        recommendationsText += '• 🚫 ZERO TOLERANCE - No warnings given';

        embed.addFields({ name: '🎯 AGGRESSIVE PROTOCOL', value: recommendationsText });

        const detailedThreats = threats.slice(0, 10);
        if (detailedThreats.length > 0) {
          let threatList = '';
          detailedThreats.forEach((t) => {
            const severityEmoji = t.severity === 'critical' ? '🔴' : t.severity === 'high' ? '🟠' : t.severity === 'medium' ? '🟡' : '🔵';
            const target = t.userId ? `<@${t.userId}>` : t.webhookId ? `🪝 ${t.webhookName}` : `#${t.channelName}`;
            threatList += `${severityEmoji} **${t.reason}** - ${target}\n${t.details}\n\n`;
          });
          
          if (threats.length > 10) {
            threatList += `... and ${threats.length - 10} more threats`;
          }

          embed.addFields({ name: '⚠️ Detected Threats', value: threatList });
        }
      } else {
        embed.addFields({ 
          name: '✅ All Clear', 
          value: 'No security threats detected in this scan. Server appears secure.' 
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Scan command error:', error);
      
      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'scan',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { scanType },
        result: `Error: ${error}`,
        success: false,
        duration,
        metadata: { error: String(error) }
      });

      await interaction.editReply(`❌ Error during scan: ${error}`);
    }
  }
};
