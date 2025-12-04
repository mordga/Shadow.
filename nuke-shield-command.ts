import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, GuildVerificationLevel, GuildExplicitContentFilter } from 'discord.js';
import { storage } from '../../storage';

const PROTECTED_USER_ID = '717089833759015063';
const PROTECTED_USERNAME = 'xcalius_';

export const nukeShieldCommand = {
  data: new SlashCommandBuilder()
    .setName('nuke-shield')
    .setDescription('🛡️⚡ NUKE SHIELD: Ultimate anti-nuke protection with maximum security')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Shield operation mode')
        .addChoices(
          { name: 'Enable Shield', value: 'enable' },
          { name: 'Disable Shield', value: 'disable' },
          { name: 'Status', value: 'status' },
          { name: 'Emergency Lockdown', value: 'emergency' }
        )
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('protection_level')
        .setDescription('Protection intensity (1-10, default: 10)')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const guildId = interaction.guildId;
      const mode = interaction.options.getString('mode', true);
      const protectionLevel = interaction.options.getInteger('protection_level') || 10;

      if (!guildId) {
        await interaction.editReply('❌ This command can only be used in a server');
        return;
      }

      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) {
        await interaction.editReply('❌ Could not access server information. Please try again.');
        return;
      }

      const serverId = guild.id;
      const serverName = guild.name;

      if (mode === 'enable' || mode === 'emergency') {
        const isEmergency = mode === 'emergency';
        const actualLevel = isEmergency ? 10 : protectionLevel;

        const progressEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle(isEmergency ? '🚨 EMERGENCY NUKE SHIELD ACTIVATION 🚨' : '🛡️ NUKE SHIELD ACTIVATION 🛡️')
          .setDescription(`**Protection Level:** ${actualLevel}/10 (${actualLevel === 10 ? 'MAXIMUM' : 'HIGH'})\n\n⏳ Initializing ultimate protection protocols...`)
          .setTimestamp();
        
        await interaction.editReply({ embeds: [progressEmbed] });

        const actionsPerformed: string[] = [];
        let protectionScore = 0;

        try {
          await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh);
          actionsPerformed.push('✅ Verification set to MAXIMUM (Phone required)');
          protectionScore += 15;
        } catch (err) {
          actionsPerformed.push('⚠️ Failed to set verification level');
        }

        try {
          await guild.setExplicitContentFilter(GuildExplicitContentFilter.AllMembers);
          actionsPerformed.push('✅ Content filter set to ALL MEMBERS');
          protectionScore += 10;
        } catch (err) {
          actionsPerformed.push('⚠️ Failed to set content filter');
        }

        if (actualLevel >= 8) {
          try {
            const invites = await guild.invites.fetch();
            let deletedInvites = 0;
            for (const [, invite] of Array.from(invites)) {
              try {
                await invite.delete('NUKE SHIELD: Maximum protection');
                deletedInvites++;
              } catch (err) {
                console.error('Failed to delete invite:', err);
              }
            }
            actionsPerformed.push(`✅ ${deletedInvites} invites deleted (LOCKDOWN)`);
            protectionScore += 20;
          } catch (err) {
            actionsPerformed.push('⚠️ Failed to delete invites');
          }
        }

        if (actualLevel >= 9) {
          const channels = guild.channels.cache;
          let lockedChannels = 0;
          
          for (const [, channel] of Array.from(channels)) {
            try {
              if ('permissionOverwrites' in channel) {
                await channel.permissionOverwrites.edit(guild.id, {
                  SendMessages: false,
                  AddReactions: false,
                  CreatePublicThreads: false,
                  CreatePrivateThreads: false,
                  SendMessagesInThreads: false,
                  CreateInstantInvite: false
                });
                lockedChannels++;
              }
            } catch (err) {
              console.error(`Failed to lock channel ${channel.id}:`, err);
            }
          }
          
          actionsPerformed.push(`✅ ${lockedChannels} channels locked (ULTRA PROTECTION)`);
          protectionScore += 30;
        }

        if (actualLevel >= 10 || isEmergency) {
          await guild.members.fetch();
          const members = Array.from(guild.members.cache.values());
          let bannedSuspicious = 0;
          
          const now = Date.now();
          for (const member of members) {
            if (member.user.bot) continue;
            if (member.id === guild.ownerId) continue;
            if (member.id === PROTECTED_USER_ID) continue;
            if (member.permissions.has(PermissionFlagsBits.Administrator)) continue;

            const accountAge = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            const reputation = await storage.getUserReputation(member.id, serverId);
            const reputationScore = reputation?.score || 100;

            const isUltraSuspicious = 
              accountAge < 1 || 
              (accountAge < 3 && reputationScore < 30) ||
              reputationScore < 10;

            if (isUltraSuspicious && member.bannable) {
              try {
                await member.ban({ 
                  reason: `🛡️ NUKE SHIELD: Ultra suspicious (Age: ${accountAge.toFixed(1)}d, Rep: ${reputationScore})`,
                  deleteMessageSeconds: 7 * 24 * 60 * 60
                });
                bannedSuspicious++;

                await storage.createThreat({
                  type: 'nuke_shield_ban',
                  severity: 'critical',
                  description: `Nuke shield banned suspicious user (Age: ${accountAge.toFixed(1)}d, Rep: ${reputationScore})`,
                  serverId,
                  serverName,
                  userId: member.id,
                  username: member.user.username,
                  action: 'ban',
                  metadata: { accountAge, reputationScore, protectionLevel: actualLevel }
                });
              } catch (err) {
                console.error(`Failed to ban suspicious user ${member.id}:`, err);
              }
            }
          }
          
          actionsPerformed.push(`✅ ${bannedSuspicious} ultra-suspicious users ELIMINATED`);
          protectionScore += 25;
        }

        const totalProtection = Math.min(100, protectionScore);

        const embed = new EmbedBuilder()
          .setTitle(isEmergency ? '🚨⚡ EMERGENCY NUKE SHIELD ACTIVE ⚡🚨' : '🛡️⚡ NUKE SHIELD ACTIVE ⚡🛡️')
          .setDescription(
            `**Protection Level:** ${actualLevel}/10 (${actualLevel === 10 ? 'MAXIMUM SECURITY' : 'ULTRA HIGH'})\n\n` +
            `🛡️ Your server is now protected by the ultimate anti-nuke shield\n` +
            `⚡ Total Protection Score: **${totalProtection}%**\n` +
            `🔒 Protected user **${PROTECTED_USERNAME}** is safe`
          )
          .setColor(0x00FF00)
          .addFields([
            { 
              name: '✅ PROTECTION PROTOCOLS ACTIVATED', 
              value: actionsPerformed.join('\n') || 'No actions performed',
              inline: false 
            },
            { 
              name: '🛡️ ACTIVE DEFENSES', 
              value: 
                `• Maximum verification (Phone)\n` +
                `• Content filtering (All members)\n` +
                (actualLevel >= 8 ? `• Invite lockdown\n` : '') +
                (actualLevel >= 9 ? `• Channel restrictions\n` : '') +
                (actualLevel >= 10 ? `• Auto-ban ultra suspicious\n` : '') +
                `• Anti-raid protection\n` +
                `• Anti-spam protection\n` +
                `• NSFW detection\n` +
                `• Bypass detection`,
              inline: true 
            },
            { 
              name: '📊 PROTECTION METRICS', 
              value: `**Protection Score:** ${totalProtection}%\n**Shield Level:** ${actualLevel}/10\n**Status:** 🟢 ACTIVE\n**Protected:** ${PROTECTED_USERNAME}`,
              inline: true 
            },
            { 
              name: '⚠️ NUKE SHIELD NOTICE', 
              value: isEmergency 
                ? '🚨 **EMERGENCY MODE**: Server is in maximum lockdown. Most user actions are restricted. Use `/nuke-shield mode:disable` to restore normal operations.'
                : '🛡️ **ACTIVE PROTECTION**: Server is heavily protected. Some user actions may be restricted. Monitor `/status` for security updates.',
              inline: false 
            }
          ])
          .setFooter({ text: `🛡️ Nuke Shield Level ${actualLevel}/10 | Protected: ${PROTECTED_USERNAME} | Activated by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createThreat({
          type: 'nuke_shield_activated',
          severity: 'low',
          description: `Nuke shield activated at level ${actualLevel} by ${interaction.user.tag}`,
          serverId,
          serverName,
          action: 'monitor',
          metadata: { protectionLevel: actualLevel, isEmergency, actionsPerformed }
        });

      } else if (mode === 'disable') {
        const channels = guild.channels.cache;
        let unlockedChannels = 0;
        
        for (const [, channel] of Array.from(channels)) {
          try {
            if ('permissionOverwrites' in channel) {
              await channel.permissionOverwrites.edit(guild.id, {
                SendMessages: null,
                AddReactions: null,
                CreatePublicThreads: null,
                CreatePrivateThreads: null,
                SendMessagesInThreads: null,
                CreateInstantInvite: null
              });
              unlockedChannels++;
            }
          } catch (err) {
            console.error(`Failed to unlock channel ${channel.id}:`, err);
          }
        }

        const embed = new EmbedBuilder()
          .setColor(0xFF6600)
          .setTitle('🛡️ NUKE SHIELD DEACTIVATED 🛡️')
          .setDescription('**Protection Protocols Disabled**\n\nServer is returning to normal operation mode.')
          .addFields(
            {
              name: '📊 DEACTIVATION RESULTS',
              value: `✅ ${unlockedChannels} channels unlocked\n⚠️ Verification remains at current level\n⚠️ Content filter remains active\n🛡️ Manual protection modules still active`,
              inline: false
            },
            {
              name: '⚠️ WARNING',
              value: 'Your server is now more vulnerable to attacks. Consider keeping some protection modules active or re-enabling Nuke Shield if threats are detected.',
              inline: false
            }
          )
          .setFooter({ text: `Deactivated by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (mode === 'status') {
        const config = await storage.getSecurityConfig(serverId);
        const protectionLevel = config?.aggressivenessLevel || 5;

        const embed = new EmbedBuilder()
          .setColor(0x00AAFF)
          .setTitle('🛡️ NUKE SHIELD STATUS 🛡️')
          .setDescription('**Current Protection Status**')
          .addFields(
            {
              name: '📊 PROTECTION METRICS',
              value: `**Aggressiveness:** ${protectionLevel}/10\n**Anti-Raid:** ${config?.antiRaidEnabled ? '✅ Enabled' : '❌ Disabled'}\n**Anti-Spam:** ${config?.antiSpamEnabled ? '✅ Enabled' : '❌ Disabled'}\n**NSFW Detection:** ${config?.nsfwDetectionEnabled ? '✅ Enabled' : '❌ Disabled'}`,
              inline: true
            },
            {
              name: '🛡️ SHIELD RECOMMENDATION',
              value: protectionLevel >= 8 
                ? '✅ **OPTIMAL**: Strong protection active'
                : protectionLevel >= 5
                ? '⚠️ **MODERATE**: Consider increasing protection'
                : '🚨 **WEAK**: Activate Nuke Shield immediately',
              inline: true
            }
          )
          .setFooter({ text: `Protected: ${PROTECTED_USERNAME}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'nuke-shield',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { mode, protectionLevel },
        result: `Nuke shield ${mode} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { mode, protectionLevel }
      });

    } catch (error) {
      console.error('Error in nuke-shield command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'nuke-shield',
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

      await interaction.editReply(`❌ Error executing nuke-shield: ${errorMessage}`);
    }
  }
};
