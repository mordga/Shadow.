import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Guild, Role, GuildChannel, ChannelType, OverwriteType } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface ServerBackup {
  id: string;
  guildId: string;
  guildName: string;
  createdAt: Date;
  createdBy: string;
  type: 'full' | 'roles' | 'channels' | 'permissions';
  data: {
    roles?: RoleBackup[];
    channels?: ChannelBackup[];
    permissions?: PermissionBackup[];
    settings?: GuildSettings;
  };
  description?: string;
}

interface RoleBackup {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  position: number;
  permissions: string;
  mentionable: boolean;
  managed: boolean;
}

interface ChannelBackup {
  id: string;
  name: string;
  type: ChannelType;
  position: number;
  parentId: string | null;
  topic?: string | null;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  permissionOverwrites: {
    id: string;
    type: OverwriteType;
    allow: string;
    deny: string;
  }[];
}

interface PermissionBackup {
  userId: string;
  roleIds: string[];
  nickname?: string | null;
}

interface GuildSettings {
  name: string;
  icon?: string | null;
  verificationLevel: number;
  defaultMessageNotifications: number;
  explicitContentFilter: number;
  afkChannelId?: string | null;
  afkTimeout: number;
  systemChannelId?: string | null;
}

const serverBackups = new Map<string, ServerBackup[]>();
const MAX_BACKUPS_PER_SERVER = 10;

function generateBackupId(): string {
  return `BKP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

async function createRoleBackup(guild: Guild): Promise<RoleBackup[]> {
  const roles: RoleBackup[] = [];
  
  for (const [, role] of Array.from(guild.roles.cache)) {
    if (!role.managed && role.id !== guild.id) {
      roles.push({
        id: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        mentionable: role.mentionable,
        managed: role.managed
      });
    }
  }
  
  return roles.sort((a, b) => b.position - a.position);
}

async function createChannelBackup(guild: Guild): Promise<ChannelBackup[]> {
  const channels: ChannelBackup[] = [];
  
  for (const [, channel] of Array.from(guild.channels.cache)) {
    if ('permissionOverwrites' in channel) {
      const guildChannel = channel as GuildChannel;
      const overwrites = Array.from(guildChannel.permissionOverwrites.cache.values()).map(ow => ({
        id: ow.id,
        type: ow.type,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString()
      }));
      
      const backup: ChannelBackup = {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        position: channel.position,
        parentId: channel.parentId,
        permissionOverwrites: overwrites
      };
      
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
        const textChannel = channel as any;
        backup.topic = textChannel.topic;
        backup.nsfw = textChannel.nsfw;
        backup.rateLimitPerUser = textChannel.rateLimitPerUser;
      }
      
      if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
        const voiceChannel = channel as any;
        backup.bitrate = voiceChannel.bitrate;
        backup.userLimit = voiceChannel.userLimit;
      }
      
      channels.push(backup);
    }
  }
  
  return channels.sort((a, b) => a.position - b.position);
}

async function createPermissionBackup(guild: Guild): Promise<PermissionBackup[]> {
  const permissions: PermissionBackup[] = [];
  
  await guild.members.fetch();
  
  for (const [, member] of Array.from(guild.members.cache)) {
    if (!member.user.bot) {
      const memberRoleIds: string[] = Array.from(member.roles.cache.keys()).filter((id: string) => id !== guild.id);
      permissions.push({
        userId: member.id,
        roleIds: memberRoleIds,
        nickname: member.nickname
      });
    }
  }
  
  return permissions;
}

async function createGuildSettings(guild: Guild): Promise<GuildSettings> {
  return {
    name: guild.name,
    icon: guild.icon,
    verificationLevel: guild.verificationLevel,
    defaultMessageNotifications: guild.defaultMessageNotifications,
    explicitContentFilter: guild.explicitContentFilter,
    afkChannelId: guild.afkChannelId,
    afkTimeout: guild.afkTimeout,
    systemChannelId: guild.systemChannelId
  };
}

export const restoreCommand = {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Advanced server restoration with backups')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a new server backup')
      .addStringOption(opt => opt
        .setName('type')
        .setDescription('Type of backup to create')
        .addChoices(
          { name: 'Full Backup - Everything', value: 'full' },
          { name: 'Roles Only', value: 'roles' },
          { name: 'Channels Only', value: 'channels' },
          { name: 'Member Permissions Only', value: 'permissions' }
        )
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('description')
        .setDescription('Description for this backup')
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all available backups for this server'))
    .addSubcommand(sub => sub
      .setName('apply')
      .setDescription('Restore from a backup')
      .addStringOption(opt => opt
        .setName('backup_id')
        .setDescription('ID of the backup to restore')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('component')
        .setDescription('Specific component to restore')
        .addChoices(
          { name: 'Everything in backup', value: 'all' },
          { name: 'Roles Only', value: 'roles' },
          { name: 'Channels Only', value: 'channels' },
          { name: 'Permissions Only', value: 'permissions' }
        )
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Delete a backup')
      .addStringOption(opt => opt
        .setName('backup_id')
        .setDescription('ID of the backup to delete')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('info')
      .setDescription('View detailed information about a backup')
      .addStringOption(opt => opt
        .setName('backup_id')
        .setDescription('ID of the backup to inspect')
        .setRequired(true))),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guildId;
      const guild = interaction.guild;

      if (!guildId || !guild) {
        await interaction.editReply('This command can only be used in a server');
        return;
      }

      let backups = serverBackups.get(guildId) || [];

      if (subcommand === 'create') {
        const type = interaction.options.getString('type', true) as ServerBackup['type'];
        const description = interaction.options.getString('description');

        const progressEmbed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('Creating Backup...')
          .setDescription(`Creating ${type} backup. This may take a moment...`)
          .setTimestamp();

        await interaction.editReply({ embeds: [progressEmbed] });

        const backupId = generateBackupId();
        const backup: ServerBackup = {
          id: backupId,
          guildId,
          guildName: guild.name,
          createdAt: new Date(),
          createdBy: interaction.user.id,
          type,
          data: {},
          description: description || undefined
        };

        if (type === 'full' || type === 'roles') {
          backup.data.roles = await createRoleBackup(guild);
        }
        
        if (type === 'full' || type === 'channels') {
          backup.data.channels = await createChannelBackup(guild);
        }
        
        if (type === 'full' || type === 'permissions') {
          backup.data.permissions = await createPermissionBackup(guild);
        }
        
        if (type === 'full') {
          backup.data.settings = await createGuildSettings(guild);
        }

        backups.push(backup);
        
        if (backups.length > MAX_BACKUPS_PER_SERVER) {
          backups = backups.slice(-MAX_BACKUPS_PER_SERVER);
        }
        
        serverBackups.set(guildId, backups);

        const stats = {
          roles: backup.data.roles?.length || 0,
          channels: backup.data.channels?.length || 0,
          permissions: backup.data.permissions?.length || 0
        };

        const successEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('Backup Created Successfully')
          .setDescription(`Your server backup has been created and stored.`)
          .addFields(
            { name: 'Backup ID', value: `\`${backupId}\``, inline: true },
            { name: 'Type', value: type.toUpperCase(), inline: true },
            { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
            { name: 'Contents', value: [
              `Roles: ${stats.roles}`,
              `Channels: ${stats.channels}`,
              `Member Permissions: ${stats.permissions}`
            ].join('\n'), inline: false }
          )
          .setFooter({ text: `Use /restore apply ${backupId} to restore` })
          .setTimestamp();

        if (description) {
          successEmbed.addFields({ name: 'Description', value: description, inline: false });
        }

        await interaction.editReply({ embeds: [successEmbed] });

        await fileLogger.info('restore', 'Backup created', {
          backupId,
          type,
          guildId,
          createdBy: interaction.user.id,
          stats
        });

        await storage.createCommandLog({
          commandName: 'restore',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guildId,
          serverName: guild.name,
          parameters: { subcommand: 'create', type },
          result: `Backup ${backupId} created successfully`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { backupId, type, stats }
        });

      } else if (subcommand === 'list') {
        if (backups.length === 0) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0xFFA500)
              .setTitle('No Backups Available')
              .setDescription('This server has no backups yet.\n\nUse `/restore create` to create your first backup.')
              .setTimestamp()
            ]
          });
          return;
        }

        const backupList = backups.slice(-10).reverse().map((b, i) => {
          const typeEmoji = {
            full: 'FULL',
            roles: 'ROLES',
            channels: 'CHANNELS',
            permissions: 'PERMS'
          }[b.type];
          
          return `**${i + 1}.** \`${b.id}\`\n   ${typeEmoji} | <t:${Math.floor(b.createdAt.getTime() / 1000)}:R>${b.description ? `\n   ${b.description.substring(0, 50)}` : ''}`;
        }).join('\n\n');

        const listEmbed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle(`Server Backups (${backups.length})`)
          .setDescription(backupList)
          .addFields({
            name: 'Commands',
            value: '`/restore info <id>` - View details\n`/restore apply <id>` - Restore\n`/restore delete <id>` - Delete',
            inline: false
          })
          .setFooter({ text: `Maximum ${MAX_BACKUPS_PER_SERVER} backups stored` })
          .setTimestamp();

        await interaction.editReply({ embeds: [listEmbed] });

      } else if (subcommand === 'apply') {
        const backupId = interaction.options.getString('backup_id', true);
        const component = interaction.options.getString('component') || 'all';

        const backup = backups.find(b => b.id === backupId);
        if (!backup) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('Backup Not Found')
              .setDescription(`No backup found with ID: \`${backupId}\`\n\nUse \`/restore list\` to see available backups.`)
              .setTimestamp()
            ]
          });
          return;
        }

        const confirmButton = new ButtonBuilder()
          .setCustomId(`confirm_restore_${backupId}`)
          .setLabel('CONFIRM RESTORE')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔄');

        const cancelButton = new ButtonBuilder()
          .setCustomId(`cancel_restore_${backupId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(confirmButton, cancelButton);

        const warningEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Confirm Server Restoration')
          .setDescription(`You are about to restore from backup \`${backupId}\`\n\n**This may override current server settings!**`)
          .addFields(
            { name: 'Backup Type', value: backup.type.toUpperCase(), inline: true },
            { name: 'Created', value: `<t:${Math.floor(backup.createdAt.getTime() / 1000)}:F>`, inline: true },
            { name: 'Restoring', value: component.toUpperCase(), inline: true },
            { name: 'Warning', value: 'This action may create new roles/channels and modify permissions. Proceed with caution.', inline: false }
          )
          .setTimestamp();

        const response = await interaction.editReply({
          embeds: [warningEmbed],
          components: [row]
        });

        try {
          const buttonInteraction = await response.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id,
            time: 60000
          });

          if (buttonInteraction.customId.startsWith('confirm_restore_')) {
            await buttonInteraction.deferUpdate();

            const progressEmbed = new EmbedBuilder()
              .setColor(0xFFA500)
              .setTitle('Restoring...')
              .setDescription('Applying backup. This may take a while...')
              .setTimestamp();

            await interaction.editReply({ embeds: [progressEmbed], components: [] });

            const results = {
              rolesRestored: 0,
              rolesFailed: 0,
              channelsRestored: 0,
              channelsFailed: 0,
              permissionsRestored: 0,
              permissionsFailed: 0
            };

            if ((component === 'all' || component === 'roles') && backup.data.roles) {
              for (const roleData of backup.data.roles.reverse()) {
                try {
                  const existingRole = guild.roles.cache.find(r => r.name === roleData.name);
                  if (!existingRole) {
                    await guild.roles.create({
                      name: roleData.name,
                      color: roleData.color,
                      hoist: roleData.hoist,
                      permissions: BigInt(roleData.permissions),
                      mentionable: roleData.mentionable,
                      reason: `Restored from backup ${backupId}`
                    });
                    results.rolesRestored++;
                  }
                } catch (err) {
                  results.rolesFailed++;
                  await fileLogger.error('restore', `Failed to restore role: ${roleData.name}`, { error: err });
                }
              }
            }

            if ((component === 'all' || component === 'channels') && backup.data.channels) {
              const categories = backup.data.channels.filter(c => c.type === ChannelType.GuildCategory);
              const otherChannels = backup.data.channels.filter(c => c.type !== ChannelType.GuildCategory);
              
              const categoryMap = new Map<string, string>();
              
              for (const channelData of categories) {
                try {
                  const existingChannel = guild.channels.cache.find(c => c.name === channelData.name);
                  if (!existingChannel) {
                    const newChannel = await guild.channels.create({
                      name: channelData.name,
                      type: ChannelType.GuildCategory,
                      reason: `Restored from backup ${backupId}`
                    });
                    categoryMap.set(channelData.id, newChannel.id);
                    results.channelsRestored++;
                  } else {
                    categoryMap.set(channelData.id, existingChannel.id);
                  }
                } catch (err) {
                  results.channelsFailed++;
                }
              }

              for (const channelData of otherChannels) {
                try {
                  const existingChannel = guild.channels.cache.find(c => c.name === channelData.name);
                  if (!existingChannel) {
                    const parentId = channelData.parentId ? categoryMap.get(channelData.parentId) : undefined;
                    
                    const validType = channelData.type === ChannelType.GuildText ? ChannelType.GuildText :
                                     channelData.type === ChannelType.GuildVoice ? ChannelType.GuildVoice :
                                     channelData.type === ChannelType.GuildAnnouncement ? ChannelType.GuildAnnouncement :
                                     channelData.type === ChannelType.GuildStageVoice ? ChannelType.GuildStageVoice :
                                     ChannelType.GuildText;
                    
                    await guild.channels.create({
                      name: channelData.name,
                      type: validType,
                      parent: parentId,
                      topic: channelData.topic || undefined,
                      nsfw: channelData.nsfw,
                      rateLimitPerUser: channelData.rateLimitPerUser,
                      bitrate: channelData.bitrate,
                      userLimit: channelData.userLimit,
                      reason: `Restored from backup ${backupId}`
                    });
                    results.channelsRestored++;
                  }
                } catch (err) {
                  results.channelsFailed++;
                }
              }
            }

            if ((component === 'all' || component === 'permissions') && backup.data.permissions) {
              for (const permData of backup.data.permissions) {
                try {
                  const member = await guild.members.fetch(permData.userId).catch(() => null);
                  if (member) {
                    const rolesToAdd = permData.roleIds
                      .map(id => guild.roles.cache.get(id) || guild.roles.cache.find(r => r.name === backup.data.roles?.find(br => br.id === id)?.name))
                      .filter((r): r is Role => r !== undefined);
                    
                    if (rolesToAdd.length > 0) {
                      await member.roles.add(rolesToAdd, `Restored from backup ${backupId}`);
                      results.permissionsRestored++;
                    }
                  }
                } catch (err) {
                  results.permissionsFailed++;
                }
              }
            }

            const successEmbed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle('Restoration Complete')
              .setDescription(`Backup \`${backupId}\` has been applied.`)
              .addFields(
                { name: 'Roles', value: `Restored: ${results.rolesRestored}\nFailed: ${results.rolesFailed}`, inline: true },
                { name: 'Channels', value: `Restored: ${results.channelsRestored}\nFailed: ${results.channelsFailed}`, inline: true },
                { name: 'Permissions', value: `Restored: ${results.permissionsRestored}\nFailed: ${results.permissionsFailed}`, inline: true }
              )
              .setFooter({ text: `Completed in ${Date.now() - startTime}ms` })
              .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed], components: [] });

            await fileLogger.security('restore', 'Backup restored', {
              backupId,
              component,
              results,
              restoredBy: interaction.user.id
            });

            await storage.createCommandLog({
              commandName: 'restore',
              executedBy: interaction.user.tag,
              userId: interaction.user.id,
              username: interaction.user.username,
              serverId: guildId,
              serverName: guild.name,
              parameters: { subcommand: 'apply', backupId, component },
              result: 'Restoration completed',
              success: true,
              duration: Date.now() - startTime,
              metadata: { results }
            });

          } else {
            await buttonInteraction.update({
              embeds: [new EmbedBuilder()
                .setColor(0x808080)
                .setTitle('Restoration Cancelled')
                .setDescription('No changes were made to the server.')
                .setTimestamp()
              ],
              components: []
            });
          }

        } catch {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0x808080)
              .setTitle('Request Expired')
              .setDescription('No response received. Restoration cancelled.')
              .setTimestamp()
            ],
            components: []
          });
        }

      } else if (subcommand === 'delete') {
        const backupId = interaction.options.getString('backup_id', true);
        
        const backupIndex = backups.findIndex(b => b.id === backupId);
        if (backupIndex === -1) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('Backup Not Found')
              .setDescription(`No backup found with ID: \`${backupId}\``)
              .setTimestamp()
            ]
          });
          return;
        }

        backups.splice(backupIndex, 1);
        serverBackups.set(guildId, backups);

        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Backup Deleted')
            .setDescription(`Backup \`${backupId}\` has been permanently deleted.`)
            .setTimestamp()
          ]
        });

        await fileLogger.info('restore', 'Backup deleted', { backupId, deletedBy: interaction.user.id });

      } else if (subcommand === 'info') {
        const backupId = interaction.options.getString('backup_id', true);
        
        const backup = backups.find(b => b.id === backupId);
        if (!backup) {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('Backup Not Found')
              .setDescription(`No backup found with ID: \`${backupId}\``)
              .setTimestamp()
            ]
          });
          return;
        }

        const infoEmbed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle(`Backup Details: ${backupId}`)
          .addFields(
            { name: 'Type', value: backup.type.toUpperCase(), inline: true },
            { name: 'Created', value: `<t:${Math.floor(backup.createdAt.getTime() / 1000)}:F>`, inline: true },
            { name: 'Created By', value: `<@${backup.createdBy}>`, inline: true }
          );

        if (backup.data.roles) {
          const topRoles = backup.data.roles.slice(0, 5).map(r => r.name).join(', ');
          infoEmbed.addFields({
            name: `Roles (${backup.data.roles.length})`,
            value: topRoles + (backup.data.roles.length > 5 ? `... and ${backup.data.roles.length - 5} more` : ''),
            inline: false
          });
        }

        if (backup.data.channels) {
          const channelCounts = {
            text: backup.data.channels.filter(c => c.type === ChannelType.GuildText).length,
            voice: backup.data.channels.filter(c => c.type === ChannelType.GuildVoice).length,
            categories: backup.data.channels.filter(c => c.type === ChannelType.GuildCategory).length
          };
          infoEmbed.addFields({
            name: `Channels (${backup.data.channels.length})`,
            value: `Text: ${channelCounts.text} | Voice: ${channelCounts.voice} | Categories: ${channelCounts.categories}`,
            inline: false
          });
        }

        if (backup.data.permissions) {
          infoEmbed.addFields({
            name: 'Member Permissions',
            value: `${backup.data.permissions.length} members stored`,
            inline: false
          });
        }

        if (backup.description) {
          infoEmbed.addFields({ name: 'Description', value: backup.description, inline: false });
        }

        infoEmbed.setFooter({ text: 'Use /restore apply to restore this backup' });
        infoEmbed.setTimestamp();

        await interaction.editReply({ embeds: [infoEmbed] });
      }

    } catch (error) {
      console.error('Error in restore command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await fileLogger.error('restore', 'Command failed', { error: errorMessage });

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Error')
          .setDescription(`An error occurred: ${errorMessage}`)
          .setTimestamp()
        ]
      });

      await storage.createCommandLog({
        commandName: 'restore',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: { subcommand: interaction.options.getSubcommand() },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
