import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { storage } from '../../storage';

export const lockdownCommand = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('🚨 EMERGENCY: Lock server - restricts all members from sending messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable lockdown mode')
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for lockdown')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable lockdown mode')),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    const subcommand = interaction.options.getSubcommand();
    
    try {
      await interaction.deferReply();
      
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

      if (subcommand === 'enable') {
        const reason = interaction.options.getString('reason') || 'Emergency lockdown activated';
        
        // Obtener todos los canales de texto
        const textChannels = guild.channels.cache.filter(
          c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement
        );

        let channelsLocked = 0;
        let channelsFailed = 0;

        for (const [, channel] of Array.from(textChannels)) {
          try {
            if ('permissionOverwrites' in channel) {
              await channel.permissionOverwrites.edit(guild.id, {
                SendMessages: false,
                AddReactions: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
                SendMessagesInThreads: false,
                UseApplicationCommands: false,
                AttachFiles: false,
                EmbedLinks: false,
                UseExternalEmojis: false,
                UseExternalStickers: false
              });
              channelsLocked++;
            }
          } catch (err) {
            console.error(`Failed to lock channel ${channel.id}:`, err);
            channelsFailed++;
          }
        }

        // Registrar el lockdown como amenaza crítica agresiva
        await storage.createThreat({
          type: 'lockdown',
          severity: 'critical',
          description: `🚨 AGGRESSIVE EMERGENCY LOCKDOWN: ${reason}`,
          serverId,
          serverName,
          userId: interaction.user.id,
          username: interaction.user.username,
          action: 'lockdown',
          metadata: {
            activatedBy: interaction.user.id,
            activatedByUsername: interaction.user.username,
            reason,
            channelsLocked,
            channelsFailed,
            totalChannels: textChannels.size,
            aggressiveMode: true,
            totalLockdown: true,
            permissionsBlocked: ['SendMessages', 'AddReactions', 'Threads', 'SlashCommands', 'Files', 'Links', 'Emojis', 'Stickers'],
            timestamp: new Date().toISOString()
          }
        });

        const embed = new EmbedBuilder()
          .setTitle('🚨🔴 AGGRESSIVE EMERGENCY LOCKDOWN ACTIVATED 🔴🚨')
          .setDescription(`⚠️ **MAXIMUM SECURITY MODE** ⚠️\n\n**${channelsLocked}/${textChannels.size}** channels locked down\n\n🚨 **ALL MEMBER ACTIVITY SUSPENDED** 🚨`)
          .setColor(0xFF0000)
          .addFields([
            { name: '⚖️ Activated By', value: interaction.user.username, inline: true },
            { name: '📝 Reason', value: reason, inline: true },
            { name: '🔒 Lock Status', value: `✅ Secured: ${channelsLocked}\n❌ Failed: ${channelsFailed}`, inline: false },
            { name: '🚫 TOTAL RESTRICTIONS ACTIVE', value: '• ❌ **NO** messages allowed\n• ❌ **NO** reactions allowed\n• ❌ **NO** threads (public/private)\n• ❌ **NO** slash commands\n• ❌ **NO** file attachments\n• ❌ **NO** link embeds\n• ❌ **NO** external emojis/stickers\n• ✅ **ONLY** admins can manage', inline: false },
            { name: '🚨 EMERGENCY PROTOCOL', value: '**IMMEDIATE ACTIONS REQUIRED:**\n1. ⚠️ Run `/scan type:full` immediately\n2. 🚫 Identify and ban all threats\n3. 🔍 Review `/trace` for attack patterns\n4. 🛡️ Verify `/defensestatus`\n5. 🔓 Use `/lockdown disable` only when safe', inline: false }
          ])
          .setFooter({ text: '🚨 CRITICAL ALERT: Server in MAXIMUM SECURITY lockdown mode - All member activity suspended' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createCommandLog({
          commandName: 'lockdown',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'enable', reason },
          result: `Lockdown enabled - ${channelsLocked} channels locked`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { channelsLocked, channelsFailed, reason }
        });

      } else if (subcommand === 'disable') {
        const textChannels = guild.channels.cache.filter(
          c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement
        );

        let channelsUnlocked = 0;
        let channelsFailed = 0;

        for (const [, channel] of Array.from(textChannels)) {
          try {
            if ('permissionOverwrites' in channel) {
              await channel.permissionOverwrites.edit(guild.id, {
                SendMessages: null,
                AddReactions: null,
                CreatePublicThreads: null,
                CreatePrivateThreads: null,
                SendMessagesInThreads: null,
                UseApplicationCommands: null,
                AttachFiles: null,
                EmbedLinks: null,
                UseExternalEmojis: null,
                UseExternalStickers: null
              });
              channelsUnlocked++;
            }
          } catch (err) {
            console.error(`Failed to unlock channel ${channel.id}:`, err);
            channelsFailed++;
          }
        }

        // Resolver amenazas de lockdown activas
        const allThreats = await storage.getThreats(100);
        const lockdownThreats = allThreats.filter(t => 
          t.type === 'lockdown' && 
          t.serverId === serverId && 
          !t.resolved
        );

        for (const threat of lockdownThreats) {
          await storage.resolveThreat(threat.id);
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ LOCKDOWN DISABLED')
          .setDescription(`**${channelsUnlocked}/${textChannels.size}** channels restored`)
          .setColor(0x00FF00)
          .addFields([
            { name: '⚖️ Disabled By', value: interaction.user.username, inline: true },
            { name: '🔓 Status', value: `✅ Unlocked: ${channelsUnlocked}\n❌ Failed: ${channelsFailed}`, inline: false },
            { name: '✅ Permissions Restored', value: '• Members can send messages\n• Can add reactions\n• Can create threads\n• Normal server operation resumed', inline: false }
          ])
          .setFooter({ text: 'Server lockdown has been lifted' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createCommandLog({
          commandName: 'lockdown',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { action: 'disable' },
          result: `Lockdown disabled - ${channelsUnlocked} channels unlocked`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { channelsUnlocked, channelsFailed, lockdownThreatsResolved: lockdownThreats.length }
        });
      }

    } catch (error) {
      console.error('Error in lockdown command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'lockdown',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: { action: subcommand },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });

      await interaction.editReply(`❌ Error executing lockdown: ${errorMessage}`);
    }
  }
};
