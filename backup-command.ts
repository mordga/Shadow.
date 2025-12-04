import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { storage } from '../../storage';
import { getRecoveryEngine } from '../../services/discord-bot';

export const backupCommand = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('💾 Create manual server backup or restore from backup')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a manual backup of the server'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all available backups'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('View backup information')
        .addStringOption(option =>
          option.setName('backup_id')
            .setDescription('Backup ID to view')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('restore')
        .setDescription('⚠️ Restore server from a backup (WARNING: This will modify your server!)')
        .addStringOption(option =>
          option.setName('backup_id')
            .setDescription('Backup ID to restore from')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('confirm')
            .setDescription('Confirm that you want to restore (set to true)')
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

    await interaction.deferReply();

    try {
      if (subcommand === 'create') {
        await guild.channels.fetch();
        await guild.roles.fetch();

        const channels = Array.from(guild.channels.cache.values());
        const roles = Array.from(guild.roles.cache.values());

        const channelsData = channels.map(channel => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          position: 'position' in channel ? channel.position : 0,
          parentId: channel.parentId || null,
          permissionOverwrites: 'permissionOverwrites' in channel ? 
            Array.from(channel.permissionOverwrites.cache.values()).map(p => ({
              id: p.id,
              type: p.type,
              allow: p.allow.bitfield.toString(),
              deny: p.deny.bitfield.toString()
            })) : []
        }));

        const rolesData = roles.map(role => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          permissions: role.permissions.bitfield.toString(),
          hoist: role.hoist,
          mentionable: role.mentionable
        }));

        const backupData = {
          serverId: guild.id,
          serverName: guild.name,
          channels: channelsData,
          roles: rolesData,
          timestamp: new Date().toISOString()
        };

        const size = JSON.stringify(backupData).length;
        const sizeKB = (size / 1024).toFixed(2);

        const backup = await storage.createServerBackup({
          serverId: guild.id,
          serverName: guild.name,
          backupType: 'manual',
          channelsCount: channels.length,
          rolesCount: roles.length,
          backupData: backupData,
          createdBy: interaction.user.username,
          size: `${sizeKB}KB`,
          metadata: { channels: channels.length, roles: roles.length }
        });

        const embed = new EmbedBuilder()
          .setTitle('💾 BACKUP CREATED SUCCESSFULLY')
          .setDescription(`Server backup has been created and saved`)
          .setColor(0x00FF00)
          .addFields([
            { name: '🆔 Backup ID', value: backup.id, inline: false },
            { name: '📁 Channels Backed Up', value: channels.length.toString(), inline: true },
            { name: '🎭 Roles Backed Up', value: roles.length.toString(), inline: true },
            { name: '💾 Backup Size', value: `${sizeKB}KB`, inline: true },
            { name: '👤 Created By', value: interaction.user.username, inline: true },
            { name: '📅 Created At', value: `<t:${Math.floor(backup.createdAt.getTime() / 1000)}:F>`, inline: true },
            { name: '⚠️ Note', value: 'Save the Backup ID to restore later if needed', inline: false }
          ])
          .setFooter({ text: `Backup ID: ${backup.id}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createThreat({
          type: 'backup',
          severity: 'low',
          description: `💾 SERVER BACKUP CREATED`,
          serverId: guild.id,
          serverName: guild.name,
          userId: interaction.user.id,
          username: interaction.user.username,
          action: 'warn',
          metadata: { backupId: backup.id, channels: channels.length, roles: roles.length }
        });

      } else if (subcommand === 'list') {
        const backups = await storage.getServerBackups(guild.id);

        if (backups.length === 0) {
          await interaction.editReply('📋 No backups found for this server');
          return;
        }

        const backupsList = backups.slice(0, 10).map((backup, index) => {
          const timeAgo = Math.floor((Date.now() - backup.createdAt.getTime()) / 1000 / 60);
          const timeStr = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;

          return `**${index + 1}.** ID: \`${backup.id}\`\n` +
                 `   📁 ${backup.channelsCount} channels | 🎭 ${backup.rolesCount} roles | 💾 ${backup.size}\n` +
                 `   👤 ${backup.createdBy} | ⏰ ${timeStr}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
          .setTitle('💾 SERVER BACKUPS')
          .setDescription(backupsList)
          .setColor(0x00BFFF)
          .setFooter({ text: `Total backups: ${backups.length} | Showing last 10` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'info') {
        const backupId = interaction.options.getString('backup_id', true);
        const backup = await storage.getServerBackupById(backupId);

        if (!backup || backup.serverId !== guild.id) {
          await interaction.editReply('❌ Backup not found or does not belong to this server');
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('💾 BACKUP INFORMATION')
          .setColor(0x00BFFF)
          .addFields([
            { name: '🆔 Backup ID', value: backup.id, inline: false },
            { name: '📝 Backup Type', value: backup.backupType.toUpperCase(), inline: true },
            { name: '📁 Channels', value: backup.channelsCount.toString(), inline: true },
            { name: '🎭 Roles', value: backup.rolesCount.toString(), inline: true },
            { name: '💾 Size', value: backup.size, inline: true },
            { name: '👤 Created By', value: backup.createdBy, inline: true },
            { name: '📅 Created At', value: `<t:${Math.floor(backup.createdAt.getTime() / 1000)}:F>`, inline: true },
            { name: '⚠️ Note', value: 'Contact administrator to restore from this backup', inline: false }
          ])
          .setFooter({ text: `Backup ID: ${backup.id}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'restore') {
        const backupId = interaction.options.getString('backup_id', true);
        const confirm = interaction.options.getBoolean('confirm', true);

        if (!confirm) {
          await interaction.editReply('❌ You must set the confirm option to true to restore from backup');
          return;
        }

        const backup = await storage.getServerBackupById(backupId);

        if (!backup || backup.serverId !== guild.id) {
          await interaction.editReply('❌ Backup not found or does not belong to this server');
          return;
        }

        const recoveryEngine = await getRecoveryEngine();

        if (!recoveryEngine) {
          await interaction.editReply('❌ Recovery engine is not available. Please try again later.');
          return;
        }

        await interaction.editReply('🔄 Starting server restoration... This may take a few minutes.');

        try {
          const report = await recoveryEngine.recoverServerFromBackup(guild, backupId);

          const statusColor = report.successful ? 0x00FF00 : (report.errors.length > 0 ? 0xFF0000 : 0xFFAA00);
          const statusEmoji = report.successful ? '✅' : (report.errors.length > 0 ? '❌' : '⚠️');

          const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} SERVER RESTORATION ${report.successful ? 'COMPLETED' : 'FINISHED WITH ISSUES'}`)
            .setColor(statusColor)
            .setDescription(report.successful 
              ? 'Server has been successfully restored from backup'
              : 'Server restoration completed with some issues')
            .addFields([
              { name: '📦 Backup ID', value: backupId, inline: false },
              { name: '✅ Channels Restored', value: report.recovered.channels.toString(), inline: true },
              { name: '✅ Roles Restored', value: report.recovered.roles.toString(), inline: true },
              { name: '✅ Permissions Restored', value: report.recovered.permissions.toString(), inline: true },
              { name: '❌ Failed Channels', value: report.failed.channels.length.toString(), inline: true },
              { name: '❌ Failed Roles', value: report.failed.roles.length.toString(), inline: true },
              { name: '⏱️ Restored At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            ])
            .setFooter({ text: `Restored by ${interaction.user.username}` })
            .setTimestamp();

          if (report.errors.length > 0) {
            const errorList = report.errors.slice(0, 5).join('\n• ');
            embed.addFields([
              { name: '⚠️ Errors', value: `• ${errorList}${report.errors.length > 5 ? `\n...and ${report.errors.length - 5} more` : ''}`, inline: false }
            ]);
          }

          if (report.warnings.length > 0) {
            const warningList = report.warnings.slice(0, 3).join('\n• ');
            embed.addFields([
              { name: '⚠️ Warnings', value: `• ${warningList}${report.warnings.length > 3 ? `\n...and ${report.warnings.length - 3} more` : ''}`, inline: false }
            ]);
          }

          if (report.suggestions.length > 0) {
            const suggestionList = report.suggestions.slice(0, 3).join('\n• ');
            embed.addFields([
              { name: '💡 Suggestions', value: `• ${suggestionList}`, inline: false }
            ]);
          }

          await interaction.followUp({ embeds: [embed] });

          await storage.createThreat({
            type: 'recovery',
            severity: report.successful ? 'low' : 'high',
            description: `🔄 SERVER RESTORED FROM BACKUP`,
            serverId: guild.id,
            serverName: guild.name,
            userId: interaction.user.id,
            username: interaction.user.username,
            action: 'warn',
            metadata: { 
              backupId, 
              recovered: report.recovered, 
              failed: report.failed,
              successful: report.successful 
            }
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          
          await interaction.followUp({
            embeds: [
              new EmbedBuilder()
                .setTitle('❌ RESTORATION FAILED')
                .setDescription(`An error occurred during restoration:\n\`\`\`${errorMessage}\`\`\``)
                .setColor(0xFF0000)
                .setTimestamp()
            ]
          });
        }
      }

      await storage.createCommandLog({
        commandName: 'backup',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Backup ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in backup command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'backup',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
