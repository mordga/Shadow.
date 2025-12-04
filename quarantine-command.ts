import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { securityEngine } from '../../services/security-engine';

export const quarantineCommand = {
  data: new SlashCommandBuilder()
    .setName('quarantine')
    .setDescription('Manage user quarantine for suspicious behavior')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Quarantine a user')
        .addUserOption(option => 
          option.setName('user')
            .setDescription('User to quarantine')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for quarantine')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('hours')
            .setDescription('Duration in hours (default: 24)')
            .setMinValue(1)
            .setMaxValue(720)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('release')
        .setDescription('Release a user from quarantine')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to release')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all quarantined users')),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command can only be used in a server', ephemeral: true });
      return;
    }

    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) {
      await interaction.reply({ content: '❌ Could not access server information. Please try again.', ephemeral: true });
      return;
    }

    const botMember = guild.members.me;
    if (!botMember) {
      await interaction.reply({ content: '❌ Cannot find bot member in guild', ephemeral: true });
      return;
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: '❌ I do not have permission to manage roles in this server', ephemeral: true });
      return;
    }

    if (subcommand === 'add') {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'Suspicious behavior detected';
      const hours = interaction.options.getInteger('hours') || 24;

      try {
        const member = await guild.members.fetch(targetUser.id);
        
        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        if (member.id === interaction.user.id) {
          await interaction.editReply('❌ You cannot quarantine yourself');
          return;
        }

        if (member.id === interaction.client.user?.id) {
          await interaction.editReply('❌ Nice try, but I cannot be quarantined');
          return;
        }

        const existing = await storage.getQuarantinedUser(targetUser.id, guild.id);
        if (existing) {
          await interaction.editReply(`⚠️ User <@${targetUser.id}> is already in quarantine`);
          return;
        }

        let quarantineRole = guild.roles.cache.find(role => role.name === 'Quarantined');
        
        if (!quarantineRole) {
          quarantineRole = await guild.roles.create({
            name: 'Quarantined',
            color: 0x808080,
            permissions: [],
            reason: 'Auto-created for quarantine system'
          });

          const channels = Array.from(guild.channels.cache.values());
          for (const channel of channels) {
            try {
              if ('permissionOverwrites' in channel) {
                await channel.permissionOverwrites.create(quarantineRole, {
                  SendMessages: false,
                  AddReactions: false,
                  Speak: false,
                  SendMessagesInThreads: false,
                  CreatePublicThreads: false,
                  CreatePrivateThreads: false
                });
              }
            } catch (err) {
              console.error(`Failed to set permissions for channel ${channel.name}:`, err);
            }
          }
        }

        const currentRoles = member.roles.cache
          .filter(role => role.id !== guild.id)
          .map(role => role.id);

        const releaseAt = new Date(Date.now() + hours * 60 * 60 * 1000);

        await storage.createThreat({
          type: 'quarantine',
          severity: 'critical',
          description: `🚨 AGGRESSIVE QUARANTINE: ${reason}`,
          serverId: guild.id,
          serverName: guild.name,
          userId: targetUser.id,
          username: targetUser.username,
          action: 'quarantine',
          metadata: {
            quarantinedBy: interaction.user.id,
            quarantinedByUsername: interaction.user.username,
            reason,
            duration: hours,
            durationHours: hours,
            releaseAt: releaseAt.toISOString(),
            previousRoles: currentRoles,
            previousRoleCount: currentRoles.length,
            quarantineRoleId: quarantineRole.id,
            quarantineRoleName: 'Quarantined',
            reputationPenalty: -150,
            aggressiveMode: true,
            timestamp: new Date().toISOString()
          }
        });

        await member.roles.set([quarantineRole.id]);

        await storage.createQuarantinedUser({
          userId: targetUser.id,
          username: targetUser.username,
          serverId: guild.id,
          serverName: guild.name,
          reason,
          quarantinedBy: interaction.user.id,
          releaseAt,
          metadata: {
            previousRoles: currentRoles,
            quarantinedByUsername: interaction.user.username,
            aggressiveMode: true
          }
        });

        await storage.updateUserReputationScore(
          targetUser.id,
          guild.id,
          -150,
          true
        );

        const duration = Date.now() - startTime;
        await storage.createCommandLog({
          commandName: 'quarantine',
          executedBy: interaction.user.username,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'add', targetUser: targetUser.id, reason, hours },
          result: 'User quarantined successfully',
          success: true,
          duration,
          metadata: {
            targetUserId: targetUser.id,
            targetUsername: targetUser.username,
            releaseAt: releaseAt.toISOString()
          }
        });

        try {
          await targetUser.send(
            `🚨 **QUARANTINE NOTICE** 🚨\n\n` +
            `You have been placed in **AGGRESSIVE QUARANTINE** in **${guild.name}**.\n\n` +
            `**Reason:** ${reason}\n` +
            `**Duration:** ${hours} hours\n` +
            `**Release Date:** <t:${Math.floor(releaseAt.getTime() / 1000)}:F>\n\n` +
            `⚠️ **ENHANCED PENALTY MODE ACTIVE** ⚠️\n\n` +
            `During quarantine, you **CANNOT**:\n` +
            `• ❌ Send messages\n` +
            `• ❌ Add reactions\n` +
            `• ❌ Speak in voice channels\n` +
            `• ❌ Create threads\n` +
            `• ❌ Join voice channels\n` +
            `• ❌ Use external emojis\n\n` +
            `🚨 **Your reputation score has been reduced by 150 points** (SEVERE PENALTY).\n\n` +
            `⚠️ **WARNING:** Any violations during quarantine will result in immediate permanent ban.\n\n` +
            `You will be automatically released after the duration expires if you show good behavior.`
          );
        } catch (err) {
          console.log('Could not DM user about quarantine');
        }

        const embed = new EmbedBuilder()
          .setTitle('🚨 USER QUARANTINED')
          .setDescription(`<@${targetUser.id}> has been placed in quarantine`)
          .setColor(0xff6600)
          .addFields(
            { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
            { name: '⏰ Duration', value: `${hours} hours`, inline: true },
            { name: '📅 Release Date', value: `<t:${Math.floor(releaseAt.getTime() / 1000)}:F>`, inline: false },
            { name: '📝 Reason', value: reason, inline: false },
            { name: '🚨 AGGRESSIVE MODE', value: '⚠️ **ENHANCED PENALTIES ACTIVE**\n• All roles removed\n• Quarantine role assigned\n• Reputation **-150 points** (SEVERE)\n• Critical threat registered\n• User notified via DM\n• Zero tolerance policy active', inline: false }
          )
          .setFooter({ text: `Quarantined by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error('Quarantine add error:', error);
        
        const duration = Date.now() - startTime;
        await storage.createCommandLog({
          commandName: 'quarantine',
          executedBy: interaction.user.username,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'add', targetUser: targetUser.id, reason },
          result: `Error: ${error}`,
          success: false,
          duration,
          metadata: { error: String(error) }
        });

        await interaction.editReply(`❌ Error quarantining user: ${error}`);
      }

    } else if (subcommand === 'release') {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser('user', true);

      try {
        const quarantined = await storage.getQuarantinedUser(targetUser.id, guild.id);
        
        if (!quarantined) {
          await interaction.editReply(`❌ User <@${targetUser.id}> is not in quarantine`);
          return;
        }

        const allThreats = await storage.getThreats(200);
        const userThreats = allThreats.filter(t => 
          t.userId === targetUser.id && 
          t.serverId === guild.id
        );
        
        const quarantineStartTime = quarantined.quarantinedAt.getTime();
        const threatsWhileQuarantined = userThreats.filter(t => 
          t.timestamp.getTime() > quarantineStartTime && t.type !== 'quarantine'
        );

        const hadGoodBehavior = threatsWhileQuarantined.length === 0;

        const member = await guild.members.fetch(targetUser.id);
        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        const quarantineRole = guild.roles.cache.find(role => role.name === 'Quarantined');
        if (quarantineRole) {
          await member.roles.remove(quarantineRole);
        }

        const previousRoles = (quarantined.metadata as any)?.previousRoles || [];
        if (previousRoles.length > 0) {
          const rolesToRestore = previousRoles.filter((roleId: string) => 
            guild.roles.cache.has(roleId)
          );
          if (rolesToRestore.length > 0) {
            await member.roles.add(rolesToRestore);
          }
        }

        await storage.releaseQuarantinedUser(targetUser.id, guild.id);

        const quarantineThreat = userThreats.find(t => 
          t.type === 'quarantine' && 
          t.timestamp.getTime() >= quarantineStartTime
        );
        if (quarantineThreat) {
          await storage.resolveThreat(quarantineThreat.id);
        }

        const quarantineDuration = Date.now() - quarantineStartTime;
        const quarantineDurationHours = quarantineDuration / (1000 * 60 * 60);

        await storage.createThreat({
          type: 'quarantine_release',
          severity: hadGoodBehavior ? 'low' : 'medium',
          description: `User released from quarantine - ${hadGoodBehavior ? 'Good behavior' : `${threatsWhileQuarantined.length} violation(s) during quarantine`}`,
          serverId: guild.id,
          serverName: guild.name,
          userId: targetUser.id,
          username: targetUser.username,
          action: 'release',
          metadata: {
            releasedBy: interaction.user.id,
            releasedByUsername: interaction.user.username,
            hadGoodBehavior,
            violationsDuringQuarantine: threatsWhileQuarantined.length,
            quarantineDurationMs: quarantineDuration,
            quarantineDurationHours: quarantineDurationHours.toFixed(2),
            originalQuarantineReason: quarantined.reason,
            quarantineStartTime: quarantineStartTime,
            releaseTime: Date.now(),
            reputationBonus: hadGoodBehavior ? 25 : 0,
            rolesRestored: previousRoles.length,
            originalThreatId: quarantineThreat?.id,
            timestamp: new Date().toISOString()
          }
        });

        if (hadGoodBehavior) {
          await storage.updateUserReputationScore(
            targetUser.id,
            guild.id,
            25,
            false
          );
        }

        const duration = Date.now() - startTime;
        await storage.createCommandLog({
          commandName: 'quarantine',
          executedBy: interaction.user.username,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'release', targetUser: targetUser.id },
          result: 'User released from quarantine',
          success: true,
          duration,
          metadata: {
            targetUserId: targetUser.id,
            targetUsername: targetUser.username,
            hadGoodBehavior,
            violationsDuringQuarantine: threatsWhileQuarantined.length,
            reputationBonus: hadGoodBehavior ? 25 : 0
          }
        });

        try {
          const behaviorMessage = hadGoodBehavior 
            ? `**Good Behavior Bonus:** +25 reputation points for following rules during quarantine.\n\n`
            : `**Warning:** You had ${threatsWhileQuarantined.length} violation(s) during quarantine. No reputation bonus awarded.\n\n`;

          await targetUser.send(
            `✅ **QUARANTINE RELEASED** ✅\n\n` +
            `You have been released from quarantine in **${guild.name}**.\n\n` +
            behaviorMessage +
            `Your roles have been restored. Please follow server rules to avoid future quarantine.`
          );
        } catch (err) {
          console.log('Could not DM user about release');
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ USER RELEASED FROM QUARANTINE')
          .setDescription(`<@${targetUser.id}> has been released from quarantine`)
          .setColor(0x00ff00)
          .addFields(
            { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
            { name: '🔓 Released By', value: interaction.user.username, inline: true },
            { name: '📊 Behavior During Quarantine', value: hadGoodBehavior ? '✅ Good behavior - No violations' : `⚠️ ${threatsWhileQuarantined.length} violation(s) detected`, inline: false },
            { name: '✅ Actions Taken', value: `• Quarantine role removed\n• Previous roles restored\n• Threat marked as resolved\n${hadGoodBehavior ? '• Reputation bonus +25 points' : '• No reputation bonus due to violations'}\n• User notified`, inline: false }
          )
          .setFooter({ text: `Released by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error('Quarantine release error:', error);
        
        const duration = Date.now() - startTime;
        await storage.createCommandLog({
          commandName: 'quarantine',
          executedBy: interaction.user.username,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'release', targetUser: targetUser.id },
          result: `Error: ${error}`,
          success: false,
          duration,
          metadata: { error: String(error) }
        });

        await interaction.editReply(`❌ Error releasing user: ${error}`);
      }

    } else if (subcommand === 'list') {
      await interaction.deferReply();

      try {
        const quarantinedUsers = await storage.getQuarantinedUsers(guild.id);
        const activeQuarantines = quarantinedUsers.filter(q => !q.released);

        const duration = Date.now() - startTime;
        await storage.createCommandLog({
          commandName: 'quarantine',
          executedBy: interaction.user.username,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'list' },
          result: `Found ${activeQuarantines.length} quarantined users`,
          success: true,
          duration
        });

        const embed = new EmbedBuilder()
          .setTitle('🚨 QUARANTINED USERS')
          .setColor(0xff6600)
          .setFooter({ text: `Total: ${activeQuarantines.length} users in quarantine` })
          .setTimestamp();

        if (activeQuarantines.length === 0) {
          embed.setDescription('✅ No users currently in quarantine');
        } else {
          let description = '';
          activeQuarantines.slice(0, 25).forEach((q, index) => {
            const releaseTime = q.releaseAt ? `<t:${Math.floor(q.releaseAt.getTime() / 1000)}:R>` : 'No release date';
            description += `**${index + 1}.** <@${q.userId}> (${q.username})\n`;
            description += `   • Reason: ${q.reason}\n`;
            description += `   • Release: ${releaseTime}\n`;
            description += `   • By: ${(q.metadata as any)?.quarantinedByUsername || 'Unknown'}\n\n`;
          });

          if (activeQuarantines.length > 25) {
            description += `... and ${activeQuarantines.length - 25} more`;
          }

          embed.setDescription(description);
        }

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error('Quarantine list error:', error);
        
        const duration = Date.now() - startTime;
        await storage.createCommandLog({
          commandName: 'quarantine',
          executedBy: interaction.user.username,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'list' },
          result: `Error: ${error}`,
          success: false,
          duration,
          metadata: { error: String(error) }
        });

        await interaction.editReply(`❌ Error listing quarantined users: ${error}`);
      }
    }
  }
};
