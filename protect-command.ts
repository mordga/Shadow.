import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const protectCommand = {
  data: new SlashCommandBuilder()
    .setName('protect')
    .setDescription('🛡️ Enable aggressive protection for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Protection mode level')
        .addChoices(
          { name: 'Maximum Security', value: 'maximum' },
          { name: 'High Security', value: 'high' },
          { name: 'Standard Security', value: 'standard' },
          { name: 'Disable Protection', value: 'off' }
        )
        .setRequired(true)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const mode = interaction.options.getString('mode', true);
      const guildId = interaction.guildId;

      if (!guildId) {
        await interaction.editReply('❌ This command can only be used in a server');
        return;
      }

      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) {
        await interaction.editReply('❌ Could not access server information. Please try again.');
        return;
      }

      const serverId = guild.id;
      const serverName = guild.name;

      let config: any = {};
      let embedColor = 0x00FF00;
      let embedTitle = '';
      let description = '';

      switch (mode) {
        case 'maximum':
          config = {
            enabled: true,
            level: 'maximum',
            minAccountAge: 7,
            maxJoinsPerMinute: 1,
            maxMessagesPerMinute: 2,
            autoQuarantine: true,
            autoBan: true,
            aiDetection: true,
            bypassDetection: true,
            nsfwFilter: true,
            spamFilter: true,
            raidProtection: true,
            aggressiveMode: true
          };
          embedColor = 0xFF0000;
          embedTitle = '🚨 MAXIMUM SECURITY ACTIVATED';
          description = '⚠️ **AGGRESSIVE MODE** - Zero tolerance policy active';
          break;

        case 'high':
          config = {
            enabled: true,
            level: 'high',
            minAccountAge: 14,
            maxJoinsPerMinute: 2,
            maxMessagesPerMinute: 3,
            autoQuarantine: true,
            autoBan: false,
            aiDetection: true,
            bypassDetection: true,
            nsfwFilter: true,
            spamFilter: true,
            raidProtection: true,
            aggressiveMode: false
          };
          embedColor = 0xFF6600;
          embedTitle = '🛡️ HIGH SECURITY ENABLED';
          description = '✅ Enhanced protection with strict monitoring';
          break;

        case 'standard':
          config = {
            enabled: true,
            level: 'standard',
            minAccountAge: 30,
            maxJoinsPerMinute: 3,
            maxMessagesPerMinute: 5,
            autoQuarantine: false,
            autoBan: false,
            aiDetection: true,
            bypassDetection: true,
            nsfwFilter: true,
            spamFilter: true,
            raidProtection: true,
            aggressiveMode: false
          };
          embedColor = 0x00FF00;
          embedTitle = '✅ STANDARD SECURITY ENABLED';
          description = 'Balanced protection with manual moderation';
          break;

        case 'off':
          config = {
            enabled: false,
            level: 'off'
          };
          embedColor = 0x808080;
          embedTitle = '⚪ PROTECTION DISABLED';
          description = '⚠️ Server protection has been turned off';
          break;
      }

      await storage.createThreat({
        type: 'protection_change',
        severity: mode === 'maximum' ? 'critical' : mode === 'high' ? 'high' : 'low',
        description: `🛡️ Protection mode changed to: ${mode.toUpperCase()}`,
        serverId,
        serverName,
        userId: interaction.user.id,
        username: interaction.user.username,
        action: 'configure',
        metadata: {
          changedBy: interaction.user.id,
          changedByUsername: interaction.user.username,
          newMode: mode,
          config,
          timestamp: new Date().toISOString()
        }
      });

      const embed = new EmbedBuilder()
        .setTitle(embedTitle)
        .setDescription(description)
        .setColor(embedColor)
        .setFooter({ text: `Configured by ${interaction.user.username}` })
        .setTimestamp();

      if (mode !== 'off') {
        embed.addFields([
          {
            name: '🔒 Security Configuration',
            value: [
              `**Level:** ${config.level.toUpperCase()}`,
              `**Min Account Age:** ${config.minAccountAge} days`,
              `**Max Joins/Min:** ${config.maxJoinsPerMinute}`,
              `**Max Messages/Min:** ${config.maxMessagesPerMinute}`
            ].join('\n'),
            inline: true
          },
          {
            name: '⚡ Auto-Actions',
            value: [
              `**Auto-Quarantine:** ${config.autoQuarantine ? '✅ ENABLED' : '❌ DISABLED'}`,
              `**Auto-Ban:** ${config.autoBan ? '✅ ENABLED' : '❌ DISABLED'}`,
              `**Aggressive Mode:** ${config.aggressiveMode ? '🔴 ACTIVE' : '🟢 OFF'}`
            ].join('\n'),
            inline: true
          },
          {
            name: '🛡️ Protection Modules',
            value: [
              `${config.aiDetection ? '🟢' : '🔴'} AI Threat Detection`,
              `${config.bypassDetection ? '🟢' : '🔴'} Bypass Detection`,
              `${config.nsfwFilter ? '🟢' : '🔴'} NSFW Filter`,
              `${config.spamFilter ? '🟢' : '🔴'} Spam Filter`,
              `${config.raidProtection ? '🟢' : '🔴'} Raid Protection`
            ].join('\n'),
            inline: false
          }
        ]);
      }

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'protect',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { mode },
        result: `Protection mode set to: ${mode}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { mode, config }
      });

    } catch (error) {
      console.error('Error in protect command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'protect',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: {},
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });

      await interaction.editReply(`❌ Error configuring protection: ${errorMessage}`);
    }
  }
};
