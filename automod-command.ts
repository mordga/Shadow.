import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const automodCommand = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('🤖 Configure advanced auto-moderation settings (AGGRESSIVE)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable aggressive auto-moderation'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable auto-moderation'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('settings')
        .setDescription('View current auto-moderation settings'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('customize')
        .setDescription('Customize auto-moderation settings')
        .addIntegerOption(option =>
          option.setName('warnings_before_ban')
            .setDescription('Warnings before auto-ban (1-5, default: 2)')
            .setMinValue(1)
            .setMaxValue(5)
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('auto_quarantine')
            .setDescription('Auto-quarantine new accounts (<14 days)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('strict_bypass_detection')
            .setDescription('Enable strict bypass detection (zalgo, unicode, etc)')
            .setRequired(false))),
  
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
              autoMod: {
                enabled: true,
                warningsBeforeBan: 1,
                autoQuarantineNewAccounts: true,
                strictBypassDetection: true,
                immediateResponse: true
              }
            }
          });
        } else {
          const customRules = (config.customRules as any) || {};
          customRules.autoMod = {
            enabled: true,
            warningsBeforeBan: 1,
            autoQuarantineNewAccounts: true,
            strictBypassDetection: true,
            immediateResponse: true
          };
          await storage.updateSecurityConfig(guild.id, {
            customRules,
            updatedBy: interaction.user.username
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('🤖 AGGRESSIVE AUTO-MODERATION ENABLED')
          .setDescription('🔥 **MAXIMUM PROTECTION ACTIVE**')
          .setColor(0xFF0000)
          .addFields([
            { name: '⚠️ Warnings Before Ban', value: '**1** (ULTRA-AGGRESSIVE)', inline: true },
            { name: '🛡️ Auto-Quarantine', value: '✅ Accounts <14 days', inline: true },
            { name: '🔍 Bypass Detection', value: '✅ **MAXIMUM STRICT**', inline: true },
            { name: '⚡ Response Mode', value: '🔴 **INSTANT BAN** (Zero tolerance)', inline: true },
            { name: '🎯 Detection Methods', value: '• Zalgo text\n• Unicode tricks\n• Invisible chars\n• Homoglyphs\n• Zero-width chars\n• AI threat analysis', inline: true },
            { name: '💀 Penalties', value: '• Spam: -200 rep + BAN\n• Raid: -500 rep + PERMANENT BAN\n• Bypass: INSTANT PERMANENT BAN', inline: true },
            { name: '🚨 Auto-Actions', value: '✅ INSTANT ban on ANY threat\n✅ Auto-quarantine ALL new users\n✅ Delete ALL suspicious content\n✅ AI-powered threat prediction\n✅ ZERO second chances', inline: false }
          ])
          .setFooter({ text: `⚠️ AGGRESSIVE MODE - Configured by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'disable') {
        if (!config) {
          await interaction.editReply('⚠️ Auto-moderation is not configured');
          return;
        }

        const customRules = (config.customRules as any) || {};
        customRules.autoMod = { ...customRules.autoMod, enabled: false };
        await storage.updateSecurityConfig(guild.id, {
          customRules,
          updatedBy: interaction.user.username
        });

        const embed = new EmbedBuilder()
          .setTitle('⚠️ AUTO-MODERATION DISABLED')
          .setDescription('Server is now vulnerable to automated threats')
          .setColor(0xFF6600)
          .setFooter({ text: `Disabled by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'settings') {
        const autoModConfig = config?.customRules && (config.customRules as any).autoMod;
        const isEnabled = autoModConfig?.enabled || false;

        const embed = new EmbedBuilder()
          .setTitle('🤖 AUTO-MODERATION SETTINGS')
          .setColor(isEnabled ? 0x00FF00 : 0xFF0000)
          .addFields([
            { name: '📊 Status', value: isEnabled ? '✅ **ACTIVE (AGGRESSIVE)**' : '❌ DISABLED', inline: true },
            { name: '⚠️ Warnings Before Ban', value: isEnabled ? autoModConfig.warningsBeforeBan?.toString() || '2' : 'N/A', inline: true },
            { name: '🛡️ Auto-Quarantine', value: isEnabled && autoModConfig.autoQuarantineNewAccounts ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '🔍 Strict Bypass Detection', value: isEnabled && autoModConfig.strictBypassDetection ? '✅ Active' : '❌ Inactive', inline: true },
            { name: '⚡ Response Mode', value: isEnabled && autoModConfig.immediateResponse ? '🔴 Immediate' : '🟡 Normal', inline: true },
            { name: '📈 Aggression Level', value: `${config?.aggressivenessLevel || 0}/10`, inline: true }
          ])
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'customize') {
        const warnings = interaction.options.getInteger('warnings_before_ban') || 2;
        const autoQuarantine = interaction.options.getBoolean('auto_quarantine') ?? true;
        const strictBypass = interaction.options.getBoolean('strict_bypass_detection') ?? true;

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
              autoMod: {
                enabled: true,
                warningsBeforeBan: warnings,
                autoQuarantineNewAccounts: autoQuarantine,
                strictBypassDetection: strictBypass,
                immediateResponse: true
              }
            }
          });
        } else {
          const customRules = (config.customRules as any) || {};
          customRules.autoMod = {
            enabled: true,
            warningsBeforeBan: warnings,
            autoQuarantineNewAccounts: autoQuarantine,
            strictBypassDetection: strictBypass,
            immediateResponse: true
          };
          await storage.updateSecurityConfig(guild.id, {
            customRules,
            updatedBy: interaction.user.username
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ AUTO-MODERATION CUSTOMIZED')
          .setColor(0x00FF00)
          .addFields([
            { name: '⚠️ Warnings Before Ban', value: warnings.toString(), inline: true },
            { name: '🛡️ Auto-Quarantine', value: autoQuarantine ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '🔍 Strict Bypass', value: strictBypass ? '✅ Active' : '❌ Inactive', inline: true }
          ])
          .setFooter({ text: `Customized by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'automod',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Automod ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in automod command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'automod',
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
