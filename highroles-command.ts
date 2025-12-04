import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const highrolesCommand = {
  data: new SlashCommandBuilder()
    .setName('highroles')
    .setDescription('Manage users with the highest role in the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all users with the highest role'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Check if a user has the highest role')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('protect')
        .setDescription('Toggle protection for users with high roles')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to protect/unprotect')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable or disable protection')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('audit')
        .setDescription('View command logs from users with the highest role')),
  
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

    const serverId = guild.id;
    const serverName = guild.name;

    try {
      // Fetch fresh role data from Discord API to ensure we have the latest information
      await guild.roles.fetch();

      const roles = Array.from(guild.roles.cache.values())
        .filter(r => r.id !== guild.id) // Exclude @everyone role
        .sort((a, b) => {
          // Discord role hierarchy: higher position = higher role
          if (b.position !== a.position) {
            return b.position - a.position;
          }
          // If positions are equal, the role created first (lower ID) is higher in hierarchy
          return a.id.localeCompare(b.id);
        });

      if (roles.length === 0) {
        await interaction.reply({ content: '❌ No roles found in this server (besides @everyone)', ephemeral: true });
        return;
      }

      const highestRole = roles[0];

      if (subcommand === 'list') {
        await interaction.deferReply();

        // COMPREHENSIVE CLEANUP: Get ALL protected users and verify each one
        // This is necessary because protected users may no longer have the highest role
        // or may have left the server, but they would still be in the protected list
        // if we only check current role members
        const protectedUsers = await storage.getProtectedUsers(serverId);
        
        for (const userId of protectedUsers) {
          const member = await guild.members.fetch(userId).catch(() => null);
          // If the user doesn't exist in the server or doesn't have the highest role, remove protection
          if (!member || !member.roles.cache.has(highestRole.id)) {
            await storage.removeProtectedUser(userId, serverId);
          }
        }

        const membersWithHighestRole = Array.from(highestRole.members.values());

        const embed = new EmbedBuilder()
          .setTitle('👑 Users with Highest Role')
          .setColor(highestRole.color || 0x5865F2)
          .addFields([
            { name: '🎭 Highest Role', value: `<@&${highestRole.id}>`, inline: true },
            { name: '📊 Total Users', value: membersWithHighestRole.length.toString(), inline: true },
            { name: '🆔 Role ID', value: highestRole.id, inline: true }
          ])
          .setTimestamp();

        if (membersWithHighestRole.length === 0) {
          embed.setDescription('No users currently have this role.');
        } else {
          let description = '';
          const displayMembers = membersWithHighestRole.slice(0, 25);
          
          for (const member of displayMembers) {
            const joinedDate = member.joinedAt ? member.joinedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown';
            const isProtected = await storage.isUserProtected(member.id, serverId);
            
            const protectionBadge = isProtected ? '🛡️ ' : '';
            description += `${protectionBadge}**${member.user.username}** (<@${member.id}>)\n`;
            description += `└ ID: \`${member.id}\` | Joined: ${joinedDate}\n\n`;
          }

          if (membersWithHighestRole.length > 25) {
            description += `\n... and ${membersWithHighestRole.length - 25} more users`;
          }

          embed.setDescription(description);
        }

        await storage.createCommandLog({
          commandName: 'highroles',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'list' },
          result: `Listed ${membersWithHighestRole.length} users with highest role`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { roleId: highestRole.id, roleName: highestRole.name, userCount: membersWithHighestRole.length }
        });

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'check') {
        await interaction.deferReply();

        // COMPREHENSIVE CLEANUP: Get ALL protected users and verify each one
        // This is necessary because protected users may no longer have the highest role
        // or may have left the server, but they would still be in the protected list
        // if we only check current role members
        const protectedUsers = await storage.getProtectedUsers(serverId);
        
        for (const userId of protectedUsers) {
          const member = await guild.members.fetch(userId).catch(() => null);
          // If the user doesn't exist in the server or doesn't have the highest role, remove protection
          if (!member || !member.roles.cache.has(highestRole.id)) {
            await storage.removeProtectedUser(userId, serverId);
          }
        }

        const user = interaction.options.getUser('user', true);
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        const hasHighestRole = member.roles.cache.has(highestRole.id);
        const isProtected = await storage.isUserProtected(user.id, serverId);

        const embed = new EmbedBuilder()
          .setTitle('🔍 High Role Check')
          .setColor(hasHighestRole ? 0x57F287 : 0xED4245)
          .addFields([
            { name: '👤 User', value: `${user.username} (<@${user.id}>)`, inline: true },
            { name: '🎭 Highest Role', value: `<@&${highestRole.id}>`, inline: true },
            { name: '✅ Has Role', value: hasHighestRole ? 'Yes' : 'No', inline: true },
            { name: '🛡️ Protected', value: (isProtected && hasHighestRole) ? 'Yes' : 'No', inline: true },
            { name: '📅 Joined Server', value: member.joinedAt ? member.joinedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown', inline: true },
            { name: '🎨 Role Color', value: highestRole.hexColor, inline: true }
          ])
          .setTimestamp();

        if (hasHighestRole) {
          embed.setDescription(`✅ **${user.username}** has the highest role in the server!`);
        } else {
          embed.setDescription(`❌ **${user.username}** does not have the highest role.`);
          
          const userHighestRole = member.roles.highest;
          if (userHighestRole.id !== guild.id) {
            embed.addFields([
              { name: '📍 User\'s Highest Role', value: `<@&${userHighestRole.id}>`, inline: false }
            ]);
          }
        }

        await storage.createCommandLog({
          commandName: 'highroles',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'check', targetUserId: user.id },
          result: `Checked ${user.username} - ${hasHighestRole ? 'has' : 'does not have'} highest role`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { targetUserId: user.id, hasHighestRole, isProtected: (isProtected && hasHighestRole) }
        });

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'protect') {
        await interaction.deferReply();

        const user = interaction.options.getUser('user', true);
        const enabled = interaction.options.getBoolean('enabled', true);
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        const hasHighestRole = member.roles.cache.has(highestRole.id);
        
        if (!hasHighestRole) {
          await interaction.editReply(`⚠️ **${user.username}** does not have the highest role (<@&${highestRole.id}>). Protection is typically for users with the highest role, but it will be applied anyway.`);
        }

        if (enabled) {
          await storage.addProtectedUser(user.id, serverId);
        } else {
          await storage.removeProtectedUser(user.id, serverId);
        }

        const embed = new EmbedBuilder()
          .setTitle(enabled ? '🛡️ Protection Enabled' : '⚠️ Protection Disabled')
          .setColor(enabled ? 0x57F287 : 0xFEE75C)
          .addFields([
            { name: '👤 User', value: `${user.username} (<@${user.id}>)`, inline: true },
            { name: '🎭 Has Highest Role', value: hasHighestRole ? 'Yes' : 'No', inline: true },
            { name: '🛡️ Protection Status', value: enabled ? 'Enabled' : 'Disabled', inline: true },
            { name: '👤 Modified By', value: interaction.user.username, inline: true }
          ])
          .setTimestamp();

        if (enabled) {
          embed.setDescription(
            `🛡️ **Protection Enabled** for **${user.username}**\n\n` +
            `This user is now protected from accidental moderation actions. ` +
            `Moderators will receive warnings when attempting to moderate this user.`
          );
        } else {
          embed.setDescription(
            `⚠️ **Protection Disabled** for **${user.username}**\n\n` +
            `This user is no longer protected. Normal moderation actions can be performed.`
          );
        }

        await storage.createCommandLog({
          commandName: 'highroles',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'protect', targetUserId: user.id, enabled },
          result: `Protection ${enabled ? 'enabled' : 'disabled'} for ${user.username}`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { targetUserId: user.id, enabled, hasHighestRole }
        });

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'audit') {
        await interaction.deferReply();

        const membersWithHighestRole = Array.from(highestRole.members.values());
        const userIds = membersWithHighestRole.map(m => m.id);

        const allLogs = await storage.getCommandLogs({ serverId, limit: 1000 });
        const highRoleUserLogs = allLogs
          .filter(log => userIds.includes(log.userId))
          .slice(0, 10);

        const embed = new EmbedBuilder()
          .setTitle('📜 High Role User Audit Log')
          .setColor(highestRole.color || 0x5865F2)
          .addFields([
            { name: '🎭 Highest Role', value: `<@&${highestRole.id}>`, inline: true },
            { name: '📊 Users with Role', value: membersWithHighestRole.length.toString(), inline: true },
            { name: '📝 Log Entries', value: highRoleUserLogs.length.toString(), inline: true }
          ])
          .setTimestamp();

        if (highRoleUserLogs.length === 0) {
          embed.setDescription('No command logs found for users with the highest role.');
        } else {
          let description = '**Recent command activity from users with the highest role:**\n\n';
          
          for (const log of highRoleUserLogs) {
            const timestamp = log.executedAt.toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              hour: '2-digit', 
              minute: '2-digit' 
            });
            const statusIcon = log.success ? '✅' : '❌';
            description += `${statusIcon} **/${log.commandName}** by **${log.username}**\n`;
            description += `└ ${timestamp} • Duration: ${log.duration}ms\n`;
            if (log.result) {
              const resultPreview = log.result.length > 60 ? log.result.substring(0, 60) + '...' : log.result;
              description += `└ Result: ${resultPreview}\n`;
            }
            description += '\n';
          }

          embed.setDescription(description);
        }

        await storage.createCommandLog({
          commandName: 'highroles',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'audit' },
          result: `Audited ${highRoleUserLogs.length} command logs from high role users`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { roleId: highestRole.id, logCount: highRoleUserLogs.length }
        });

        await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      console.error('Error in highroles command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      const errorReply = `❌ Error: ${errorMessage}`;
      
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorReply);
      } else {
        await interaction.reply({ content: errorReply, ephemeral: true });
      }
      
      await storage.createCommandLog({
        commandName: 'highroles',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { action: subcommand },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
