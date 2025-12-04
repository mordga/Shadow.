import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const antispamCommand = {
  data: new SlashCommandBuilder()
    .setName('antispam')
    .setDescription('⛔ Configure anti-spam with adjustable sensitivity')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable anti-spam protection')
        .addIntegerOption(option =>
          option.setName('sensitivity')
            .setDescription('Sensitivity level (1-10, 10=most aggressive)')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable anti-spam protection'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check anti-spam status')),
  
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
        const sensitivity = interaction.options.getInteger('sensitivity') || 10;
        
        if (!config) {
          config = await storage.createOrUpdateSecurityConfig({
            serverId: guild.id,
            serverName: guild.name,
            antiRaidEnabled: true,
            antiSpamEnabled: true,
            nsfwDetectionEnabled: true,
            bypassDetectionEnabled: true,
            quarantineEnabled: true,
            aggressivenessLevel: sensitivity,
            autoLearnEnabled: true,
            updatedBy: interaction.user.username
          });
        } else {
          await storage.updateSecurityConfig(guild.id, {
            antiSpamEnabled: true,
            aggressivenessLevel: sensitivity,
            updatedBy: interaction.user.username
          });
        }

        await storage.createThreat({
          type: 'security_config',
          severity: 'low',
          description: `⛔ ANTI-SPAM ENABLED (Sensitivity: ${sensitivity}/10)`,
          serverId: guild.id,
          serverName: guild.name,
          userId: interaction.user.id,
          username: interaction.user.username,
          action: 'warn',
          metadata: { action: 'antispam_enabled', sensitivity }
        });

        const embed = new EmbedBuilder()
          .setTitle('⛔ ANTI-SPAM PROTECTION ENABLED')
          .setDescription(sensitivity >= 8 ? '🔥 **AGGRESSIVE MODE ACTIVE**' : '✅ Protection enabled')
          .setColor(sensitivity >= 8 ? 0xFF0000 : 0xFFA500)
          .addFields([
            { name: '📊 Sensitivity Level', value: `**${sensitivity}/10** ${sensitivity >= 8 ? '(ULTRA-AGGRESSIVE)' : ''}`, inline: true },
            { name: '⚡ Max Messages/Minute', value: '**2** (INSTANT BAN)', inline: true },
            { name: '🔄 Max Duplicate Messages', value: '**1** (PERMANENT BAN)', inline: true },
            { name: '👥 Max Mentions', value: '**2 per message** (INSTANT BAN)', inline: true },
            { name: '🔗 Max Links', value: '**1 per message** (IMMEDIATE BAN)', inline: true },
            { name: '💀 Reputation Penalty', value: '**-200 points** (SEVERE)', inline: true },
            { name: '🛡️ Detection Methods', value: '• Message rate tracking\n• Duplicate detection\n• Mention spam\n• Link spam\n• AI analysis (Distributed)\n• Firewall protection', inline: false },
            { name: '⚠️ Auto-Response', value: sensitivity >= 8 ? '🔴 **INSTANT PERMANENT BAN** - ZERO TOLERANCE' : '⚠️ Progressive actions', inline: false }
          ])
          .setFooter({ text: `Configured by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'disable') {
        if (!config) {
          await interaction.editReply('⚠️ Anti-spam protection is not configured');
          return;
        }

        await storage.updateSecurityConfig(guild.id, {
          antiSpamEnabled: false,
          updatedBy: interaction.user.username
        });

        const embed = new EmbedBuilder()
          .setTitle('⚠️ ANTI-SPAM PROTECTION DISABLED')
          .setDescription('Your server is now vulnerable to spam attacks')
          .setColor(0xFF6600)
          .setFooter({ text: `Disabled by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'status') {
        const isEnabled = config?.antiSpamEnabled || false;
        const sensitivity = config?.aggressivenessLevel || 0;

        const embed = new EmbedBuilder()
          .setTitle('⛔ ANTI-SPAM PROTECTION STATUS')
          .setColor(isEnabled ? 0x00FF00 : 0xFF0000)
          .addFields([
            { name: '📊 Status', value: isEnabled ? '✅ ACTIVE' : '❌ DISABLED', inline: true },
            { name: '🎚️ Sensitivity', value: `${sensitivity}/10`, inline: true },
            { name: '⚙️ Current Limits', value: isEnabled ? 
              '• Messages/min: **2**\n• Duplicates: **1**\n• Mentions: **2/msg**\n• Links: **1/msg**\n• Penalty: **-100 rep**' : 
              'Protection disabled', inline: false }
          ])
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'antispam',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Anti-spam ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in antispam command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'antispam',
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
