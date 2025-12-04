import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, GuildVerificationLevel } from 'discord.js';
import { storage } from '../../storage';

export const raidDefenseCommand = {
  data: new SlashCommandBuilder()
    .setName('raid-defense')
    .setDescription('🛡️ ULTRA AGGRESSIVE: Activate maximum anti-raid defense protocol')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addBooleanOption(option =>
      option.setName('auto_ban_new')
        .setDescription('Auto-ban ALL new members joining (<1 day accounts)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('kick_inactive')
        .setDescription('Kick all members with no recent activity')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const guildId = interaction.guildId;
      const autoBanNew = interaction.options.getBoolean('auto_ban_new') ?? true;
      const kickInactive = interaction.options.getBoolean('kick_inactive') ?? false;

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

      let actionsTaken: string[] = [];

      // Set verification to HIGHEST
      try {
        await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh);
        actionsTaken.push('✅ Verification set to HIGHEST (Phone required)');
      } catch (err) {
        actionsTaken.push('❌ Failed to set verification level');
        console.error('Failed to set verification:', err);
      }

      // Pause invites
      try {
        const invites = await guild.invites.fetch();
        let pausedInvites = 0;
        for (const [, invite] of Array.from(invites)) {
          try {
            await invite.delete('RAID DEFENSE: Pausing all invites');
            pausedInvites++;
          } catch (err) {
            console.error('Failed to delete invite:', err);
          }
        }
        actionsTaken.push(`✅ ${pausedInvites} invites deleted`);
      } catch (err) {
        actionsTaken.push('❌ Failed to pause invites');
        console.error('Failed to pause invites:', err);
      }

      // Auto-ban new accounts if enabled
      let bannedNewAccounts = 0;
      if (autoBanNew) {
        await guild.members.fetch();
        const members = Array.from(guild.members.cache.values());
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        for (const member of members) {
          if (member.user.bot) continue;
          const accountAge = now - member.user.createdTimestamp;
          
          if (accountAge < oneDayMs && member.bannable) {
            try {
              await member.ban({ reason: 'RAID DEFENSE: Auto-ban new account (<1 day old)' });
              bannedNewAccounts++;
              
              await storage.createThreat({
                type: 'raid_defense_ban',
                severity: 'high',
                description: 'Auto-banned during raid defense protocol',
                serverId,
                serverName,
                userId: member.id,
                username: member.user.username,
                action: 'ban',
                metadata: {
                  accountAge: accountAge / (1000 * 60 * 60 * 24),
                  reason: 'New account during raid defense',
                  executedBy: interaction.user.id,
                  timestamp: new Date().toISOString()
                }
              });
            } catch (err) {
              console.error(`Failed to ban new account ${member.id}:`, err);
            }
          }
        }
        actionsTaken.push(`✅ ${bannedNewAccounts} new accounts banned`);
      }

      // Kick inactive members if enabled
      let kickedInactive = 0;
      if (kickInactive) {
        await guild.members.fetch();
        const members = Array.from(guild.members.cache.values());
        const traces = await storage.getMessageTraces({ limit: 2000 });
        const activeUserIds = new Set(traces.map(t => t.userId));

        for (const member of members) {
          if (member.user.bot) continue;
          if (!activeUserIds.has(member.id) && member.kickable) {
            try {
              await member.kick('RAID DEFENSE: No activity detected');
              kickedInactive++;
            } catch (err) {
              console.error(`Failed to kick inactive member ${member.id}:`, err);
            }
          }
        }
        actionsTaken.push(`✅ ${kickedInactive} inactive members kicked`);
      }

      // Create incident record
      await storage.createIncident({
        type: 'raid_defense',
        severity: 'critical',
        title: 'RAID DEFENSE PROTOCOL ACTIVATED',
        description: 'Ultra aggressive anti-raid defense measures deployed',
        serverId,
        serverName,
        affectedUsers: [],
        actionsPerformed: actionsTaken,
        evidence: {
          autoBanNew,
          kickInactive,
          bannedNewAccounts,
          kickedInactive,
          verificationLevel: 'HIGHEST',
          activatedBy: interaction.user.id,
          activatedByUsername: interaction.user.username,
          timestamp: new Date().toISOString()
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('🛡️🔴 ULTRA AGGRESSIVE RAID DEFENSE ACTIVATED 🔴🛡️')
        .setDescription(
          `**MAXIMUM ANTI-RAID PROTOCOL**\n\n` +
          `🚨 **Server secured against raid attacks** 🚨`
        )
        .setColor(0xFF0000)
        .addFields([
          { name: '⚖️ Activated By', value: interaction.user.username, inline: true },
          { name: '⏱️ Duration', value: `${Date.now() - startTime}ms`, inline: true },
          { 
            name: '✅ Actions Taken', 
            value: actionsTaken.join('\n') || 'No actions taken',
            inline: false 
          },
          { 
            name: '🛡️ DEFENSE MEASURES', 
            value: 
              `• ✅ Verification: **HIGHEST** (Phone required)\n` +
              `• ✅ All invites: **PAUSED**\n` +
              `• ${autoBanNew ? '✅' : '❌'} Auto-ban new: **${autoBanNew ? 'ENABLED' : 'DISABLED'}**\n` +
              `• ${kickInactive ? '✅' : '❌'} Kick inactive: **${kickInactive ? 'ENABLED' : 'DISABLED'}**`,
            inline: false 
          },
          { 
            name: '📊 STATISTICS', 
            value: 
              `• 🔨 New accounts banned: **${bannedNewAccounts}**\n` +
              `• 👢 Inactive kicked: **${kickedInactive}**\n` +
              `• 🎯 Total actions: **${actionsTaken.length}**`,
            inline: false 
          },
          { 
            name: '🚨 RECOMMENDED NEXT STEPS', 
            value: 
              '1. 🔍 Monitor `/stats` closely\n' +
              '2. 🚫 Run `/scan type:full`\n' +
              '3. 🔒 Consider `/lockserver` if raid continues\n' +
              '4. 📊 Review `/audit` for patterns\n' +
              '5. ⚠️ Stay vigilant for 24-48 hours',
            inline: false 
          }
        ])
        .setFooter({ text: '🛡️ RAID DEFENSE ACTIVE - Maximum protection enabled' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'raid-defense',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { autoBanNew, kickInactive },
        result: `Raid defense activated - ${actionsTaken.length} actions taken`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { 
          actionsTaken, 
          bannedNewAccounts, 
          kickedInactive,
          autoBanNew,
          kickInactive
        }
      });

    } catch (error) {
      console.error('Error in raid-defense command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'raid-defense',
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

      await interaction.editReply(`❌ Error executing raid-defense: ${errorMessage}`);
    }
  }
};
