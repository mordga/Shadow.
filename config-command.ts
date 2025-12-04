import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const configCommand = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('⚙️ Configure bot protection settings for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current protection settings'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('aggressive')
        .setDescription('Enable MAXIMUM AGGRESSIVE protection (Level 10)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('custom')
        .setDescription('Customize protection settings')
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('Aggressiveness level (1-10)')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('anti_raid')
            .setDescription('Enable anti-raid protection')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('anti_spam')
            .setDescription('Enable anti-spam protection')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('nsfw_detection')
            .setDescription('Enable NSFW detection')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('bypass_detection')
            .setDescription('Enable bypass detection')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('quarantine')
            .setDescription('Enable quarantine system')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('auto_learn')
            .setDescription('Enable AI auto-learning')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset to default aggressive settings')),
  
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
      if (subcommand === 'view') {
        const config = await storage.getSecurityConfig(guild.id);

        if (!config) {
          await interaction.editReply('⚠️ No configuration found. Use `/config aggressive` to set up protection.');
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('⚙️ SERVER PROTECTION CONFIGURATION')
          .setDescription(`**${guild.name}** Security Settings`)
          .setColor(config.aggressivenessLevel >= 8 ? 0xFF0000 : 0xFFA500)
          .addFields([
            { name: '🎚️ Aggressiveness Level', value: `**${config.aggressivenessLevel}/10** ${config.aggressivenessLevel >= 8 ? '🔥 (AGGRESSIVE)' : ''}`, inline: true },
            { name: '🛡️ Anti-Raid', value: config.antiRaidEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '⛔ Anti-Spam', value: config.antiSpamEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '🔞 NSFW Detection', value: config.nsfwDetectionEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '🚫 Bypass Detection', value: config.bypassDetectionEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '🔒 Quarantine', value: config.quarantineEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '🤖 AI Auto-Learn', value: config.autoLearnEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '👤 Last Updated By', value: config.updatedBy, inline: true },
            { name: '📅 Last Updated', value: `<t:${Math.floor(config.updatedAt.getTime() / 1000)}:R>`, inline: true }
          ])
          .setFooter({ text: `Config for ${guild.name}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'aggressive') {
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
            aggressivenessLevel: 10,
            autoLearnEnabled: true,
            updatedBy: interaction.user.username
          });
        } else {
          await storage.updateSecurityConfig(guild.id, {
            antiRaidEnabled: true,
            antiSpamEnabled: true,
            nsfwDetectionEnabled: true,
            bypassDetectionEnabled: true,
            quarantineEnabled: true,
            aggressivenessLevel: 10,
            autoLearnEnabled: true,
            updatedBy: interaction.user.username
          });
        }

        await storage.createThreat({
          type: 'security_config',
          severity: 'low',
          description: '🔥 MAXIMUM AGGRESSIVE PROTECTION ENABLED',
          serverId: guild.id,
          serverName: guild.name,
          userId: interaction.user.id,
          username: interaction.user.username,
          action: 'warn',
          metadata: { level: 10, mode: 'aggressive' }
        });

        const embed = new EmbedBuilder()
          .setTitle('🔥 MAXIMUM AGGRESSIVE PROTECTION ENABLED')
          .setDescription('⚠️ **ALL PROTECTION SYSTEMS ACTIVE AT MAXIMUM LEVEL**')
          .setColor(0xFF0000)
          .addFields([
            { name: '🎚️ Aggressiveness', value: '**10/10** 🔥', inline: true },
            { name: '🛡️ All Protections', value: '✅ **ENABLED**', inline: true },
            { name: '⚡ Response Mode', value: '🔴 **IMMEDIATE**', inline: true },
            { name: '📊 Active Systems', value: '✅ Anti-Raid (AGGRESSIVE)\n✅ Anti-Spam (STRICT)\n✅ NSFW Detection\n✅ Bypass Detection\n✅ Quarantine System\n✅ AI Auto-Learning', inline: false },
            { name: '💀 Penalties', value: '• Spam: -100 rep, instant ban\n• Raid: -200 rep, auto-ban\n• New accounts (<14 days): auto-ban\n• Confidence >0.7: instant ban', inline: false },
            { name: '🚨 Rate Limits', value: '• Max joins/min: **1**\n• Max joins/hour: **3**\n• Max msgs/min: **2**\n• Max duplicates: **1**', inline: false },
            { name: '⚠️ WARNING', value: '**This is the most aggressive setting. False positives may occur. Monitor the audit log regularly.**', inline: false }
          ])
          .setFooter({ text: `🔥 AGGRESSIVE MODE - Configured by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'custom') {
        const level = interaction.options.getInteger('level', true);
        const antiRaid = interaction.options.getBoolean('anti_raid') ?? true;
        const antiSpam = interaction.options.getBoolean('anti_spam') ?? true;
        const nsfwDetection = interaction.options.getBoolean('nsfw_detection') ?? true;
        const bypassDetection = interaction.options.getBoolean('bypass_detection') ?? true;
        const quarantine = interaction.options.getBoolean('quarantine') ?? true;
        const autoLearn = interaction.options.getBoolean('auto_learn') ?? true;

        let config = await storage.getSecurityConfig(guild.id);

        if (!config) {
          config = await storage.createOrUpdateSecurityConfig({
            serverId: guild.id,
            serverName: guild.name,
            antiRaidEnabled: antiRaid,
            antiSpamEnabled: antiSpam,
            nsfwDetectionEnabled: nsfwDetection,
            bypassDetectionEnabled: bypassDetection,
            quarantineEnabled: quarantine,
            aggressivenessLevel: level,
            autoLearnEnabled: autoLearn,
            updatedBy: interaction.user.username
          });
        } else {
          await storage.updateSecurityConfig(guild.id, {
            antiRaidEnabled: antiRaid,
            antiSpamEnabled: antiSpam,
            nsfwDetectionEnabled: nsfwDetection,
            bypassDetectionEnabled: bypassDetection,
            quarantineEnabled: quarantine,
            aggressivenessLevel: level,
            autoLearnEnabled: autoLearn,
            updatedBy: interaction.user.username
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ CUSTOM CONFIGURATION APPLIED')
          .setColor(level >= 8 ? 0xFF0000 : 0xFFA500)
          .addFields([
            { name: '🎚️ Aggressiveness', value: `${level}/10`, inline: true },
            { name: '🛡️ Anti-Raid', value: antiRaid ? '✅' : '❌', inline: true },
            { name: '⛔ Anti-Spam', value: antiSpam ? '✅' : '❌', inline: true },
            { name: '🔞 NSFW', value: nsfwDetection ? '✅' : '❌', inline: true },
            { name: '🚫 Bypass', value: bypassDetection ? '✅' : '❌', inline: true },
            { name: '🔒 Quarantine', value: quarantine ? '✅' : '❌', inline: true },
            { name: '🤖 AI Learn', value: autoLearn ? '✅' : '❌', inline: true }
          ])
          .setFooter({ text: `Configured by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'reset') {
        await storage.updateSecurityConfig(guild.id, {
          antiRaidEnabled: true,
          antiSpamEnabled: true,
          nsfwDetectionEnabled: true,
          bypassDetectionEnabled: true,
          quarantineEnabled: true,
          aggressivenessLevel: 10,
          autoLearnEnabled: true,
          updatedBy: interaction.user.username
        });

        const embed = new EmbedBuilder()
          .setTitle('🔄 CONFIGURATION RESET')
          .setDescription('Settings reset to default aggressive mode (Level 10)')
          .setColor(0xFF0000)
          .setFooter({ text: `Reset by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'config',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Config ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in config command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'config',
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
