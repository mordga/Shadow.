import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const antiraidCommand = {
  data: new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription('🚨 Configure aggressive anti-raid protection')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable aggressive anti-raid protection'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable anti-raid protection'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check anti-raid status')),
  
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

    const botMember = guild.members.me;
    if (!botMember) {
      await interaction.reply({ content: '❌ Cannot find bot member in guild', ephemeral: true });
      return;
    }

    if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction.reply({ content: '❌ I need Ban Members permission to enable anti-raid protection', ephemeral: true });
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
            updatedBy: interaction.user.username
          });
        } else {
          await storage.updateSecurityConfig(guild.id, {
            antiRaidEnabled: true,
            aggressivenessLevel: 10,
            updatedBy: interaction.user.username
          });
        }

        await storage.createThreat({
          type: 'security_config',
          severity: 'low',
          description: '🚨 AGGRESSIVE ANTI-RAID ENABLED',
          serverId: guild.id,
          serverName: guild.name,
          userId: interaction.user.id,
          username: interaction.user.username,
          action: 'warn',
          metadata: { action: 'antiraid_enabled', level: 'aggressive' }
        });

        const embed = new EmbedBuilder()
          .setTitle('🚨 AGGRESSIVE ANTI-RAID PROTECTION ENABLED')
          .setDescription('🔥 **MAXIMUM AGGRESSION MODE ACTIVE**')
          .setColor(0xFF0000)
          .addFields([
            { name: '⚠️ Max Joins Per Minute', value: '**1** (INSTANT BAN)', inline: true },
            { name: '⚠️ Max Joins Per Hour', value: '**2** (ULTRA-STRICT)', inline: true },
            { name: '📅 Min Account Age', value: '**3 days** (ULTRA-AGGRESSIVE)', inline: true },
            { name: '🚫 Suspicious Patterns', value: 'raid, nuke, spam, hack, bot, test, alt, fake, free, nitro, gift, discord.gg, exploit, ddos, flood, script, and 30+ more', inline: false },
            { name: '⚡ Auto-Response', value: '🔴 **INSTANT PERMANENT BAN** - ZERO TOLERANCE', inline: true },
            { name: '💀 Reputation Penalty', value: '**-500 points** per violation (SEVERE)', inline: true },
            { name: '🛡️ Protection Level', value: '**ULTRA-MAXIMUM (Level 10)**', inline: true },
            { name: '🎯 Detection Mode', value: '✅ AI-Powered (Distributed) + Pattern Matching + Firewall', inline: false }
          ])
          .setFooter({ text: `⚠️ AGGRESSIVE MODE - Configured by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'disable') {
        if (!config) {
          await interaction.editReply('⚠️ Anti-raid protection is not configured');
          return;
        }

        await storage.updateSecurityConfig(guild.id, {
          antiRaidEnabled: false,
          updatedBy: interaction.user.username
        });

        const embed = new EmbedBuilder()
          .setTitle('⚠️ ANTI-RAID PROTECTION DISABLED')
          .setDescription('⚠️ Your server is now vulnerable to raid attacks')
          .setColor(0xFF6600)
          .addFields([
            { name: '🚨 WARNING', value: 'Your server is no longer protected. Re-enable protection immediately!', inline: false }
          ])
          .setFooter({ text: `Disabled by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'status') {
        const isEnabled = config?.antiRaidEnabled || false;
        const aggressivenessLevel = config?.aggressivenessLevel || 0;

        const embed = new EmbedBuilder()
          .setTitle('🚨 ANTI-RAID PROTECTION STATUS')
          .setColor(isEnabled ? 0x00FF00 : 0xFF0000)
          .addFields([
            { name: '📊 Status', value: isEnabled ? '✅ **ACTIVE (AGGRESSIVE)**' : '❌ DISABLED', inline: true },
            { name: '🔒 Aggression Level', value: `${aggressivenessLevel}/10`, inline: true },
            { name: '⚙️ Current Config', value: isEnabled ? 
              '• Max joins/min: **1**\n• Max joins/hour: **3**\n• Min account age: **14 days**\n• Auto-ban: **ENABLED**\n• Reputation penalty: **-200**' : 
              'Protection disabled', inline: false }
          ])
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'antiraid',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Anti-raid ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in antiraid command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'antiraid',
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
