import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, TextChannel, ChannelType } from 'discord.js';
import { storage } from '../../storage';

export const settingsCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('⚙️ Configure bot settings quickly')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current bot settings'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('aggression')
        .setDescription('Set security aggression level')
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('Aggression level (1-10, default: 5)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('logchannel')
        .setDescription('Set the security log channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel for security logs')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Toggle security features on/off')
        .addStringOption(option =>
          option.setName('feature')
            .setDescription('Feature to toggle')
            .setRequired(true)
            .addChoices(
              { name: 'Anti-Raid Protection', value: 'antiraid' },
              { name: 'Anti-Spam Protection', value: 'antispam' },
              { name: 'NSFW Detection', value: 'nsfw' },
              { name: 'Bypass Detection', value: 'bypass' },
              { name: 'Quarantine System', value: 'quarantine' },
              { name: 'Auto-Learn (AI)', value: 'autolearn' }
            ))
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable or disable the feature')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset all settings to default values')),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    try {
      const subcommand = interaction.options.getSubcommand();
      const serverId = interaction.guildId || '';
      const serverName = interaction.guild?.name || '';

      if (!serverId) {
        await interaction.editReply({ content: '❌ This command can only be used in a server' });
        return;
      }

      switch (subcommand) {
        case 'view': {
          let config = await storage.getSecurityConfig(serverId);
          
          if (!config) {
            config = await storage.createOrUpdateSecurityConfig({
              serverId,
              serverName,
              updatedBy: interaction.user.tag
            });
          }

          const statusEmoji = (enabled: boolean) => enabled ? '✅ Enabled' : '❌ Disabled';
          const aggressionDesc = this.getAggressionDescription(config.aggressivenessLevel);

          const embed = new EmbedBuilder()
            .setTitle('⚙️ Bot Settings')
            .setDescription(`Configuration for **${serverName}**`)
            .setColor(0x5865F2)
            .addFields(
              {
                name: '🎯 Aggression Level',
                value: `Level **${config.aggressivenessLevel}**/10 - ${aggressionDesc}`,
                inline: false
              },
              {
                name: '📝 Log Channel',
                value: config.logChannelId ? `<#${config.logChannelId}>` : 'Not configured',
                inline: false
              },
              {
                name: '🛡️ Security Features',
                value: 
                  `• Anti-Raid: ${statusEmoji(config.antiRaidEnabled)}\n` +
                  `• Anti-Spam: ${statusEmoji(config.antiSpamEnabled)}\n` +
                  `• NSFW Detection: ${statusEmoji(config.nsfwDetectionEnabled)}\n` +
                  `• Bypass Detection: ${statusEmoji(config.bypassDetectionEnabled)}\n` +
                  `• Quarantine: ${statusEmoji(config.quarantineEnabled)}\n` +
                  `• Auto-Learn (AI): ${statusEmoji(config.autoLearnEnabled)}`,
                inline: false
              }
            )
            .setFooter({ text: `Last updated: ${config.updatedAt.toLocaleString()}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'aggression': {
          const level = interaction.options.getInteger('level', true);
          
          await storage.createOrUpdateSecurityConfig({
            serverId,
            serverName,
            aggressivenessLevel: level,
            updatedBy: interaction.user.tag
          });

          const description = this.getAggressionDescription(level);

          await interaction.editReply({
            content: `✅ Security aggression level set to **${level}**/10\n📊 ${description}`
          });
          break;
        }

        case 'logchannel': {
          const channel = interaction.options.getChannel('channel', true) as TextChannel;
          
          await storage.createOrUpdateSecurityConfig({
            serverId,
            serverName,
            logChannelId: channel.id,
            updatedBy: interaction.user.tag
          });

          await interaction.editReply({
            content: `✅ Security log channel set to ${channel}`
          });
          break;
        }

        case 'toggle': {
          const feature = interaction.options.getString('feature', true);
          const enabled = interaction.options.getBoolean('enabled', true);

          const updateData: any = {
            serverId,
            serverName,
            updatedBy: interaction.user.tag
          };

          switch (feature) {
            case 'antiraid':
              updateData.antiRaidEnabled = enabled;
              break;
            case 'antispam':
              updateData.antiSpamEnabled = enabled;
              break;
            case 'nsfw':
              updateData.nsfwDetectionEnabled = enabled;
              break;
            case 'bypass':
              updateData.bypassDetectionEnabled = enabled;
              break;
            case 'quarantine':
              updateData.quarantineEnabled = enabled;
              break;
            case 'autolearn':
              updateData.autoLearnEnabled = enabled;
              break;
          }

          await storage.createOrUpdateSecurityConfig(updateData);

          const featureName = this.getFeatureName(feature);
          const status = enabled ? '✅ Enabled' : '❌ Disabled';

          await interaction.editReply({
            content: `${status} **${featureName}** for this server`
          });
          break;
        }

        case 'reset': {
          await storage.createOrUpdateSecurityConfig({
            serverId,
            serverName,
            antiRaidEnabled: true,
            antiSpamEnabled: true,
            nsfwDetectionEnabled: true,
            bypassDetectionEnabled: true,
            quarantineEnabled: true,
            aggressivenessLevel: 5,
            autoLearnEnabled: true,
            updatedBy: interaction.user.tag
          });

          await interaction.editReply({
            content: '✅ All settings have been reset to default values\n' +
                     '• Aggression Level: **5**/10\n' +
                     '• All security features: **Enabled**'
          });
          break;
        }
      }

      await storage.createCommandLog({
        commandName: 'settings',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { subcommand },
        result: 'Settings updated successfully',
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in settings command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error updating settings: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'settings',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || '',
        serverName: interaction.guild?.name || '',
        parameters: {},
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  },

  getAggressionDescription(level: number): string {
    if (level <= 2) return 'Very Permissive - Minimal intervention';
    if (level <= 4) return 'Permissive - Light moderation';
    if (level <= 6) return 'Balanced - Standard protection';
    if (level <= 8) return 'Aggressive - Strict enforcement';
    return 'Maximum - Zero tolerance mode';
  },

  getFeatureName(feature: string): string {
    const names: Record<string, string> = {
      'antiraid': 'Anti-Raid Protection',
      'antispam': 'Anti-Spam Protection',
      'nsfw': 'NSFW Detection',
      'bypass': 'Bypass Detection',
      'quarantine': 'Quarantine System',
      'autolearn': 'Auto-Learn (AI)'
    };
    return names[feature] || feature;
  }
};
