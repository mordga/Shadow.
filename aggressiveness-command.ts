import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, User as DiscordUser } from 'discord.js';
import { storage } from '../../storage';

export const aggressivenessCommand = {
  data: new SlashCommandBuilder()
    .setName('aggressiveness')
    .setDescription('🔥 Configure bot aggressiveness levels (Global & Per-User)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommandGroup(group =>
      group
        .setName('server')
        .setDescription('Manage server-wide aggressiveness')
        .addSubcommand(subcommand =>
          subcommand
            .setName('set')
            .setDescription('Set server aggressiveness level')
            .addIntegerOption(option =>
              option.setName('level')
                .setDescription('Aggressiveness level (1=Minimal, 5=Balanced, 10=Ultra Aggressive)')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('view')
            .setDescription('View current server aggressiveness settings')))
    .addSubcommandGroup(group =>
      group
        .setName('user')
        .setDescription('Manage user-specific aggressiveness overrides')
        .addSubcommand(subcommand =>
          subcommand
            .setName('set')
            .setDescription('Set aggressiveness level for a specific user')
            .addUserOption(option =>
              option.setName('user')
                .setDescription('User to configure (by mention or ID)')
                .setRequired(true))
            .addIntegerOption(option =>
              option.setName('level')
                .setDescription('Aggressiveness level (1=Minimal, 5=Balanced, 10=Ultra Aggressive)')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true))
            .addStringOption(option =>
              option.setName('reason')
                .setDescription('Reason for custom aggressiveness level')
                .setRequired(false)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('remove')
            .setDescription('Remove aggressiveness override for a user')
            .addUserOption(option =>
              option.setName('user')
                .setDescription('User to remove override from')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('list')
            .setDescription('List all user-specific aggressiveness overrides'))),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    const subcommandGroup = interaction.options.getSubcommandGroup();
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

    await interaction.deferReply();

    try {
      if (subcommandGroup === 'server') {
        if (subcommand === 'set') {
          const level = interaction.options.getInteger('level', true);

          let config = await storage.getSecurityConfig(guild.id);

          if (!config) {
            config = await storage.createOrUpdateSecurityConfig({
              serverId: guild.id,
              serverName: guild.name,
              antiRaidEnabled: true,
              antiSpamEnabled: true,
              nsfwDetectionEnabled: true,
              bypassDetectionEnabled: true,
              quarantineEnabled: true,
              aggressivenessLevel: level,
              lastAggressionUpdate: new Date(),
              autoLearnEnabled: true,
              updatedBy: interaction.user.username
            });
          } else {
            await storage.updateSecurityConfig(guild.id, {
              aggressivenessLevel: level,
              lastAggressionUpdate: new Date(),
              updatedBy: interaction.user.username
            });
          }

          const levelDescriptions: Record<number, string> = {
            1: '🟢 **MINIMAL** - Very permissive, only critical threats',
            2: '🟢 **LOW** - Permissive with basic protection',
            3: '🟡 **MODERATE** - Standard protection',
            4: '🟡 **MODERATE-HIGH** - Increased vigilance',
            5: '🟠 **BALANCED** - Recommended default',
            6: '🟠 **MODERATE-AGGRESSIVE** - Enhanced protection',
            7: '🔴 **AGGRESSIVE** - Strict enforcement',
            8: '🔴 **VERY AGGRESSIVE** - Very strict, low tolerance',
            9: '🔥 **ULTRA AGGRESSIVE** - Extreme protection',
            10: '💀 **MAXIMUM** - Zero tolerance, instant bans'
          };

          await storage.createThreat({
            type: 'security_config',
            severity: 'low',
            description: `🔥 SERVER AGGRESSIVENESS SET TO LEVEL ${level}`,
            serverId: guild.id,
            serverName: guild.name,
            userId: interaction.user.id,
            username: interaction.user.username,
            action: 'warn',
            metadata: { action: 'aggressiveness_set', level }
          });

          const embed = new EmbedBuilder()
            .setTitle('🔥 SERVER AGGRESSIVENESS CONFIGURED')
            .setDescription(levelDescriptions[level] || `Level ${level}`)
            .setColor(level >= 8 ? 0xFF0000 : level >= 5 ? 0xFFA500 : 0x00FF00)
            .addFields([
              { name: '📊 Aggressiveness Level', value: `**${level}/10**`, inline: true },
              { name: '🎯 Mode', value: level >= 8 ? 'ULTRA AGGRESSIVE' : level >= 5 ? 'BALANCED' : 'PERMISSIVE', inline: true },
              { name: '⚙️ Configured By', value: interaction.user.username, inline: true },
              { name: '📋 What Changes', value: 
                level >= 8 
                  ? '• AI Confidence: 0.55-0.65\n• Spam: 3-4 msgs/min\n• Duplicates: 1-2 max\n• Mentions: 2-3 max\n• Links: 0-1 max\n• Raid joins: 3-4/min\n• Account age: 21-30 days'
                  : level >= 5
                  ? '• AI Confidence: 0.75\n• Spam: 7 msgs/min\n• Duplicates: 3 max\n• Mentions: 4 max\n• Links: 2 max\n• Raid joins: 6/min\n• Account age: 14 days'
                  : '• AI Confidence: 0.85-0.95\n• Spam: 10-15 msgs/min\n• Duplicates: 5 max\n• Mentions: 6-8 max\n• Links: 3-5 max\n• Raid joins: 8-12/min\n• Account age: 7 days',
                inline: false
              },
              { name: '💡 Tip', value: 'Use `/aggressiveness user set` to configure custom levels for specific users (VIPs, moderators, etc.)', inline: false }
            ])
            .setFooter({ text: `Configured by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'view') {
          const config = await storage.getSecurityConfig(guild.id);
          const level = config?.aggressivenessLevel || 5;
          const lastUpdate = config?.lastAggressionUpdate;

          const embed = new EmbedBuilder()
            .setTitle('🔥 SERVER AGGRESSIVENESS STATUS')
            .setColor(level >= 8 ? 0xFF0000 : level >= 5 ? 0xFFA500 : 0x00FF00)
            .addFields([
              { name: '📊 Current Level', value: `**${level}/10**`, inline: true },
              { name: '🎯 Mode', value: level >= 8 ? 'ULTRA AGGRESSIVE' : level >= 5 ? 'BALANCED' : 'PERMISSIVE', inline: true },
              { name: '📅 Last Updated', value: lastUpdate ? `<t:${Math.floor(lastUpdate.getTime() / 1000)}:R>` : 'Never', inline: true },
              { name: '⚙️ Active Settings', value: 
                `• Anti-Raid: ${config?.antiRaidEnabled ? '✅' : '❌'}\n` +
                `• Anti-Spam: ${config?.antiSpamEnabled ? '✅' : '❌'}\n` +
                `• NSFW Detection: ${config?.nsfwDetectionEnabled ? '✅' : '❌'}\n` +
                `• Bypass Detection: ${config?.bypassDetectionEnabled ? '✅' : '❌'}\n` +
                `• Auto-Learn: ${config?.autoLearnEnabled ? '✅' : '❌'}`,
                inline: true
              },
              { name: '👥 User Overrides', value: 'Use `/aggressiveness user list` to view', inline: true }
            ])
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        }

      } else if (subcommandGroup === 'user') {
        if (subcommand === 'set') {
          const targetUser = interaction.options.getUser('user', true);
          const level = interaction.options.getInteger('level', true);
          const reason = interaction.options.getString('reason') || 'No reason provided';

          const existing = await storage.getUserSecurityOverride(targetUser.id, guild.id);

          if (existing) {
            await storage.updateUserSecurityOverride(targetUser.id, guild.id, {
              aggressionLevel: level,
              reason,
              setBy: interaction.user.id,
              setByUsername: interaction.user.username
            });
          } else {
            await storage.createUserSecurityOverride({
              serverId: guild.id,
              userId: targetUser.id,
              username: targetUser.username,
              aggressionLevel: level,
              reason,
              setBy: interaction.user.id,
              setByUsername: interaction.user.username
            });
          }

          await storage.createThreat({
            type: 'security_config',
            severity: 'low',
            description: `👤 USER AGGRESSIVENESS SET: ${targetUser.username} → Level ${level}`,
            serverId: guild.id,
            serverName: guild.name,
            userId: interaction.user.id,
            username: interaction.user.username,
            action: 'warn',
            metadata: { action: 'user_aggressiveness_set', targetUserId: targetUser.id, level, reason }
          });

          const embed = new EmbedBuilder()
            .setTitle('👤 USER AGGRESSIVENESS CONFIGURED')
            .setDescription(`Custom aggressiveness level set for <@${targetUser.id}>`)
            .setColor(level >= 8 ? 0xFF0000 : level >= 5 ? 0xFFA500 : 0x00FF00)
            .addFields([
              { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
              { name: '📊 Custom Level', value: `**${level}/10**`, inline: true },
              { name: '⚖️ Set By', value: interaction.user.username, inline: true },
              { name: '📝 Reason', value: reason, inline: false },
              { name: '💡 Effect', value: 
                existing 
                  ? 'Updated existing override - this user now has a custom aggressiveness level'
                  : 'Created new override - this user now has a custom aggressiveness level independent of server settings',
                inline: false
              }
            ])
            .setFooter({ text: `Configured by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'remove') {
          const targetUser = interaction.options.getUser('user', true);

          try {
            await storage.deleteUserSecurityOverride(targetUser.id, guild.id);

            await storage.createThreat({
              type: 'security_config',
              severity: 'low',
              description: `👤 USER AGGRESSIVENESS OVERRIDE REMOVED: ${targetUser.username}`,
              serverId: guild.id,
              serverName: guild.name,
              userId: interaction.user.id,
              username: interaction.user.username,
              action: 'warn',
              metadata: { action: 'user_aggressiveness_removed', targetUserId: targetUser.id }
            });

            const embed = new EmbedBuilder()
              .setTitle('✅ USER OVERRIDE REMOVED')
              .setDescription(`<@${targetUser.id}> will now use the server's default aggressiveness level`)
              .setColor(0x00FF00)
              .addFields([
                { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
                { name: '⚖️ Removed By', value: interaction.user.username, inline: true }
              ])
              .setFooter({ text: `Removed by ${interaction.user.username}` })
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

          } catch (error) {
            await interaction.editReply(`❌ No aggressiveness override found for <@${targetUser.id}>`);
          }

        } else if (subcommand === 'list') {
          const overrides = await storage.getUserSecurityOverrides(guild.id);

          if (overrides.length === 0) {
            await interaction.editReply('📋 No user-specific aggressiveness overrides configured');
            return;
          }

          let listText = '';
          overrides.slice(0, 20).forEach((override, index) => {
            const levelEmoji = override.aggressionLevel >= 8 ? '🔴' : override.aggressionLevel >= 5 ? '🟠' : '🟢';
            listText += `${index + 1}. ${levelEmoji} <@${override.userId}> - Level ${override.aggressionLevel}/10\n`;
            listText += `   └ Reason: ${override.reason || 'No reason'}\n`;
            listText += `   └ Set by: ${override.setByUsername}\n\n`;
          });

          if (overrides.length > 20) {
            listText += `\n... and ${overrides.length - 20} more`;
          }

          const embed = new EmbedBuilder()
            .setTitle('📋 USER AGGRESSIVENESS OVERRIDES')
            .setDescription(listText || 'No overrides')
            .setColor(0x00FF00)
            .addFields([
              { name: '📊 Total Overrides', value: overrides.length.toString(), inline: true },
              { name: '💡 Tip', value: 'Users with overrides use custom aggressiveness levels instead of server default', inline: false }
            ])
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        }
      }

      await storage.createCommandLog({
        commandName: 'aggressiveness',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommandGroup, subcommand },
        result: `Aggressiveness ${subcommandGroup} ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommandGroup, subcommand }
      });

    } catch (error) {
      console.error('Error in aggressiveness command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'aggressiveness',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommandGroup, subcommand },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
