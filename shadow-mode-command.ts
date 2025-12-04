import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { shadowMode } from '../../services/shadow-mode';
import { storage } from '../../storage';

export const shadowModeCommand = {
  data: new SlashCommandBuilder()
    .setName('shadow_mode')
    .setDescription('👁️ Toggle passive observation mode (logs threats without action)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable shadow mode (passive observation only)')
        .addBooleanOption(option =>
          option.setName('global')
            .setDescription('Apply to all servers (requires confirmation)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('confirm')
            .setDescription('Confirm global shadow mode enablement')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable shadow mode and resume normal moderation')
        .addBooleanOption(option =>
          option.setName('global')
            .setDescription('Disable globally for all servers')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View shadow mode status for all servers')),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    try {
      const subcommand = interaction.options.getSubcommand();
      const serverId = interaction.guildId || '';
      const serverName = interaction.guild?.name || '';
      const enabledBy = interaction.user.tag;

      if (!serverId && subcommand !== 'status') {
        await interaction.editReply({ content: '❌ This command can only be used in a server' });
        return;
      }

      switch (subcommand) {
        case 'enable': {
          const isGlobal = interaction.options.getBoolean('global') || false;
          const confirm = interaction.options.getBoolean('confirm') || false;

          if (isGlobal && !confirm) {
            const confirmEmbed = new EmbedBuilder()
              .setTitle('⚠️ GLOBAL SHADOW MODE WARNING')
              .setDescription(
                '**YOU ARE ABOUT TO ENABLE SHADOW MODE GLOBALLY**\n\n' +
                '⚠️ This will disable **ALL** moderation actions across **ALL** servers!\n\n' +
                '**What Shadow Mode Does:**\n' +
                '• 👁️ Monitors all activities (threats are still detected)\n' +
                '• 📝 Logs all threats to files and database\n' +
                '• 🚫 **NO actions taken** (no kicks, bans, mutes, deletions)\n' +
                '• ⏰ Auto-disables after 24 hours\n\n' +
                '**WARNING:** Your servers will be **unprotected** during this time!\n\n' +
                'To confirm, use: `/shadow_mode enable global:true confirm:true`'
              )
              .setColor(0xFF0000)
              .setFooter({ text: '⚠️ Use with extreme caution!' })
              .setTimestamp();

            await interaction.editReply({ embeds: [confirmEmbed] });
            break;
          }

          await shadowMode.enableShadowMode(isGlobal ? undefined : serverId, enabledBy);

          const enableEmbed = new EmbedBuilder()
            .setTitle('👁️ Shadow Mode ENABLED')
            .setDescription(
              isGlobal
                ? '**GLOBAL Shadow Mode is now active across ALL servers**'
                : `**Shadow Mode is now active for ${serverName}**`
            )
            .setColor(0x7B68EE)
            .addFields(
              {
                name: '📊 Current Status',
                value: '• Threat Detection: ✅ **ACTIVE**\n' +
                       '• Logging: ✅ **ACTIVE**\n' +
                       '• Moderation Actions: 🚫 **DISABLED**',
                inline: false
              },
              {
                name: '⚠️ Important Information',
                value: '• All threats will be **detected and logged**\n' +
                       '• **No moderation actions** will be taken\n' +
                       '• Auto-disables after **24 hours**\n' +
                       '• Use `/shadow_mode disable` to stop early',
                inline: false
              },
              {
                name: '⏰ Auto-Disable',
                value: 'Shadow Mode will automatically disable in **24 hours**',
                inline: false
              }
            )
            .setFooter({ text: `Enabled by ${enabledBy}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [enableEmbed] });
          break;
        }

        case 'disable': {
          const isGlobal = interaction.options.getBoolean('global') || false;

          await shadowMode.disableShadowMode(isGlobal ? undefined : serverId, enabledBy);

          const disableEmbed = new EmbedBuilder()
            .setTitle('✅ Shadow Mode DISABLED')
            .setDescription(
              isGlobal
                ? '**GLOBAL Shadow Mode has been disabled**'
                : `**Shadow Mode has been disabled for ${serverName}**`
            )
            .setColor(0x00FF00)
            .addFields(
              {
                name: '📊 Current Status',
                value: '• Threat Detection: ✅ **ACTIVE**\n' +
                       '• Logging: ✅ **ACTIVE**\n' +
                       '• Moderation Actions: ✅ **ACTIVE**',
                inline: false
              },
              {
                name: '✅ Normal Operation Resumed',
                value: 'All security features are now **fully operational**\n' +
                       'The bot will **take action** on detected threats',
                inline: false
              }
            )
            .setFooter({ text: `Disabled by ${enabledBy}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [disableEmbed] });
          break;
        }

        case 'status': {
          const status = shadowMode.getShadowModeStatus();

          const statusEmbed = new EmbedBuilder()
            .setTitle('👁️ Shadow Mode Status')
            .setDescription(
              status.global
                ? '⚠️ **GLOBAL Shadow Mode is ACTIVE** - All servers affected'
                : 'Global Shadow Mode: **Inactive**'
            )
            .setColor(status.global ? 0xFF0000 : 0x5865F2);

          if (status.servers.length > 0) {
            const serverList = status.servers.map(server => {
              const statusIcon = server.enabled ? '👁️ **ACTIVE**' : '✅ Inactive';
              return `**Server ID:** ${server.serverId}\n` +
                     `**Status:** ${statusIcon}\n` +
                     `**Enabled By:** ${server.enabledBy}\n` +
                     `**Enabled At:** ${server.enabledAt.toLocaleString()}\n` +
                     `**Time Remaining:** ${server.timeRemaining}`;
            }).join('\n\n');

            statusEmbed.addFields({
              name: '🌐 Server-Specific Shadow Modes',
              value: serverList.substring(0, 1024),
              inline: false
            });
          } else {
            statusEmbed.addFields({
              name: '🌐 Server-Specific Shadow Modes',
              value: 'No servers currently in shadow mode',
              inline: false
            });
          }

          statusEmbed.addFields(
            {
              name: '📋 What is Shadow Mode?',
              value: '• Passive observation mode that **logs** all threats\n' +
                     '• **Does not take** any moderation actions\n' +
                     '• Automatically disables after 24 hours\n' +
                     '• Useful for testing or monitoring without enforcement',
              inline: false
            }
          );

          statusEmbed.setFooter({ text: `Requested by ${interaction.user.tag}` });
          statusEmbed.setTimestamp();

          await interaction.editReply({ embeds: [statusEmbed] });
          break;
        }
      }

      await storage.createCommandLog({
        commandName: 'shadow_mode',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { subcommand },
        result: `Shadow mode ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in shadow_mode command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error managing shadow mode: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'shadow_mode',
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
  }
};
