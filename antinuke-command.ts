import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const antinukeCommand = {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('🛡️ Configure anti-nuke protection to prevent server destruction')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable anti-nuke protection'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable anti-nuke protection'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check anti-nuke protection status')),
  
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
      let config = await storage.getSecurityConfig(guild.id);

      if (subcommand === 'enable') {
        if (!config) {
          config = await storage.createOrUpdateSecurityConfig({
            serverId: guild.id,
            serverName: guild.name,
            antiRaidEnabled: true,
            antiSpamEnabled: true,
            nsfwDetectionEnabled: true,
            bypassDetectionEnabled: true,
            quarantineEnabled: true,
            aggressivenessLevel: 10,
            autoLearnEnabled: true,
            updatedBy: interaction.user.username,
            customRules: {
              antiNuke: {
                enabled: true,
                maxChannelDeletes: 2,
                maxRoleDeletes: 2,
                maxBans: 3,
                maxKicks: 3,
                timeWindow: 60,
                autoBanOffenders: true
              }
            }
          });
        } else {
          const customRules = (config.customRules as any) || {};
          customRules.antiNuke = {
            enabled: true,
            maxChannelDeletes: 2,
            maxRoleDeletes: 2,
            maxBans: 3,
            maxKicks: 3,
            timeWindow: 60,
            autoBanOffenders: true
          };
          await storage.updateSecurityConfig(guild.id, {
            customRules,
            updatedBy: interaction.user.username
          });
        }

        await storage.createThreat({
          type: 'security_config',
          severity: 'low',
          description: '🛡️ ANTI-NUKE PROTECTION ENABLED',
          serverId: guild.id,
          serverName: guild.name,
          userId: interaction.user.id,
          username: interaction.user.username,
          action: 'warn',
          metadata: { action: 'antinuke_enabled', config: 'aggressive' }
        });

        const embed = new EmbedBuilder()
          .setTitle('🛡️ ANTI-NUKE PROTECTION ENABLED')
          .setDescription('✅ Your server is now protected against nuke attacks')
          .setColor(0x00FF00)
          .addFields([
            { name: '🔒 Protection Level', value: '🔴 ULTRA-AGGRESSIVE (Zero Tolerance)', inline: true },
            { name: '📊 Max Channel Deletes', value: '**2** per minute (STRICT)', inline: true },
            { name: '📊 Max Role Deletes', value: '**2** per minute (STRICT)', inline: true },
            { name: '📊 Max Bans', value: '**3** per minute (STRICT)', inline: true },
            { name: '📊 Max Kicks', value: '**3** per minute (STRICT)', inline: true },
            { name: '⚡ Auto-Response', value: '🔴 **INSTANT PERMANENT BAN**', inline: true },
            { name: '🚨 Monitoring', value: '✅ All destructive actions tracked\n✅ AI-powered nuke detection\n✅ Zero tolerance policy', inline: false }
          ])
          .setFooter({ text: `Configured by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'disable') {
        if (!config) {
          await interaction.editReply('⚠️ Anti-nuke protection is not configured');
          return;
        }

        const customRules = (config.customRules as any) || {};
        customRules.antiNuke = { ...customRules.antiNuke, enabled: false };
        await storage.updateSecurityConfig(guild.id, {
          customRules,
          updatedBy: interaction.user.username
        });

        const embed = new EmbedBuilder()
          .setTitle('⚠️ ANTI-NUKE PROTECTION DISABLED')
          .setDescription('Your server is no longer protected against nuke attacks')
          .setColor(0xFF6600)
          .setFooter({ text: `Disabled by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'status') {
        const antiNukeConfig = config?.customRules && (config.customRules as any).antiNuke;
        const isEnabled = antiNukeConfig?.enabled || false;

        const embed = new EmbedBuilder()
          .setTitle('🛡️ ANTI-NUKE PROTECTION STATUS')
          .setColor(isEnabled ? 0x00FF00 : 0xFF0000)
          .addFields([
            { name: '📊 Status', value: isEnabled ? '✅ ACTIVE' : '❌ DISABLED', inline: true },
            { name: '🔒 Protection Level', value: isEnabled ? 'MAXIMUM' : 'NONE', inline: true },
            { name: '⚙️ Configuration', value: isEnabled ? `Max Channel Deletes: ${antiNukeConfig.maxChannelDeletes}\nMax Role Deletes: ${antiNukeConfig.maxRoleDeletes}\nMax Bans: ${antiNukeConfig.maxBans}\nAuto-Ban: ${antiNukeConfig.autoBanOffenders ? 'Yes' : 'No'}` : 'Not configured', inline: false }
          ])
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'antinuke',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Anti-nuke ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in antinuke command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'antinuke',
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
