import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const rolesCommand = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Manage security roles and permissions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new security role')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Role name')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('color')
            .setDescription('Role color (hex code, e.g., #ff0000)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('mentionable')
            .setDescription('Make role mentionable (default: false)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a security role')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to delete')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all security roles'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('assign')
        .setDescription('Assign a role to a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to assign role to')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to assign')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a role from a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to remove role from')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to remove')
            .setRequired(true))),
  
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
      if (subcommand === 'create') {
        await interaction.deferReply();
        
        const roleName = interaction.options.getString('name', true);
        const colorHex = interaction.options.getString('color');
        const mentionable = interaction.options.getBoolean('mentionable') || false;

        let roleColor = 0x99AAB5;
        if (colorHex) {
          const cleanHex = colorHex.replace('#', '');
          const parsedColor = parseInt(cleanHex, 16);
          if (!isNaN(parsedColor) && cleanHex.length === 6) {
            roleColor = parsedColor;
          }
        }

        const role = await guild.roles.create({
          name: roleName,
          color: roleColor,
          mentionable: mentionable,
          reason: `Created by ${interaction.user.username} via /roles create`
        });

        const embed = new EmbedBuilder()
          .setTitle('✅ Role Created')
          .setColor(roleColor)
          .addFields([
            { name: '🎭 Role', value: `<@&${role.id}>`, inline: true },
            { name: '🆔 ID', value: role.id, inline: true },
            { name: '🎨 Color', value: colorHex || 'Default', inline: true },
            { name: '📢 Mentionable', value: mentionable ? 'Yes' : 'No', inline: true },
            { name: '👤 Created By', value: interaction.user.username, inline: true }
          ])
          .setTimestamp();

        await storage.createCommandLog({
          commandName: 'roles',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'create', roleName, color: colorHex, mentionable },
          result: `Role "${roleName}" created`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { roleId: role.id, roleName }
        });

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'delete') {
        await interaction.deferReply();
        
        const roleOption = interaction.options.getRole('role', true);
        const role = guild.roles.cache.get(roleOption.id);

        if (!role) {
          await interaction.editReply('❌ Role not found in this server');
          return;
        }

        if (role.id === guild.id) {
          await interaction.editReply('❌ Cannot delete the @everyone role');
          return;
        }

        if (!role.editable) {
          await interaction.editReply('❌ I do not have permission to delete this role (it may be higher than my role)');
          return;
        }

        const roleName = role.name;
        const roleId = role.id;

        await role.delete(`Deleted by ${interaction.user.username} via /roles delete`);

        const embed = new EmbedBuilder()
          .setTitle('🗑️ Role Deleted')
          .setColor(0xED4245)
          .addFields([
            { name: '🎭 Role Name', value: roleName, inline: true },
            { name: '🆔 Role ID', value: roleId, inline: true },
            { name: '👤 Deleted By', value: interaction.user.username, inline: true }
          ])
          .setTimestamp();

        await storage.createCommandLog({
          commandName: 'roles',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'delete', roleId, roleName },
          result: `Role "${roleName}" deleted`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { roleId, roleName }
        });

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'list') {
        await interaction.deferReply();
        
        const roles = Array.from(guild.roles.cache.values())
          .filter(r => r.id !== guild.id)
          .sort((a, b) => b.position - a.position);

        const embed = new EmbedBuilder()
          .setTitle('🎭 Server Roles')
          .setColor(0x5865F2)
          .setFooter({ text: `Total: ${roles.length} roles` })
          .setTimestamp();

        if (roles.length === 0) {
          embed.setDescription('No roles found in this server (besides @everyone)');
        } else {
          let description = '';
          roles.slice(0, 25).forEach((role, index) => {
            const memberCount = role.members.size;
            description += `**${index + 1}.** <@&${role.id}> - ${memberCount} member${memberCount !== 1 ? 's' : ''}\n`;
          });

          if (roles.length > 25) {
            description += `\n... and ${roles.length - 25} more roles`;
          }

          embed.setDescription(description);
        }

        await storage.createCommandLog({
          commandName: 'roles',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'list' },
          result: `Listed ${roles.length} roles`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { roleCount: roles.length }
        });

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'assign') {
        await interaction.deferReply();
        
        const user = interaction.options.getUser('user', true);
        const roleOption = interaction.options.getRole('role', true);
        const role = guild.roles.cache.get(roleOption.id);

        if (!role) {
          await interaction.editReply('❌ Role not found in this server');
          return;
        }

        const member = await guild.members.fetch(user.id);

        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        if (member.roles.cache.has(role.id)) {
          await interaction.editReply(`❌ <@${user.id}> already has the <@&${role.id}> role`);
          return;
        }

        await member.roles.add(role, `Assigned by ${interaction.user.username} via /roles assign`);

        const embed = new EmbedBuilder()
          .setTitle('✅ Role Assigned')
          .setColor(0x57F287)
          .addFields([
            { name: '👤 User', value: `<@${user.id}>`, inline: true },
            { name: '🎭 Role', value: `<@&${role.id}>`, inline: true },
            { name: '👤 Assigned By', value: interaction.user.username, inline: true }
          ])
          .setTimestamp();

        await storage.createCommandLog({
          commandName: 'roles',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'assign', userId: user.id, roleId: role.id },
          result: `Role "${role.name}" assigned to ${user.username}`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { targetUserId: user.id, roleId: role.id }
        });

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'remove') {
        await interaction.deferReply();
        
        const user = interaction.options.getUser('user', true);
        const roleOption = interaction.options.getRole('role', true);
        const role = guild.roles.cache.get(roleOption.id);

        if (!role) {
          await interaction.editReply('❌ Role not found in this server');
          return;
        }

        const member = await guild.members.fetch(user.id);

        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        if (!member.roles.cache.has(role.id)) {
          await interaction.editReply(`❌ <@${user.id}> does not have the <@&${role.id}> role`);
          return;
        }

        await member.roles.remove(role, `Removed by ${interaction.user.username} via /roles remove`);

        const embed = new EmbedBuilder()
          .setTitle('🗑️ Role Removed')
          .setColor(0xED4245)
          .addFields([
            { name: '👤 User', value: `<@${user.id}>`, inline: true },
            { name: '🎭 Role', value: `<@&${role.id}>`, inline: true },
            { name: '👤 Removed By', value: interaction.user.username, inline: true }
          ])
          .setTimestamp();

        await storage.createCommandLog({
          commandName: 'roles',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'remove', userId: user.id, roleId: role.id },
          result: `Role "${role.name}" removed from ${user.username}`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { targetUserId: user.id, roleId: role.id }
        });

        await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      console.error('Error in roles command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'roles',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { action: subcommand },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });

      await interaction.editReply(`❌ Error: ${errorMessage}`);
    }
  }
};
