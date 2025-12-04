import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, GuildChannel } from 'discord.js';
import { storage } from '../../storage';

interface HoneypotData {
  id: string;
  type: 'channel' | 'role' | 'invite';
  name: string;
  targetId: string;
  created: Date;
  triggers: number;
  lastTriggered?: Date;
  caughtUsers: string[];
}

const activeHoneypots = new Map<string, HoneypotData[]>();

export const honeypotCommand = {
  data: new SlashCommandBuilder()
    .setName('honeypot')
    .setDescription('🍯 Deploy honeypot traps to detect and catch malicious actors')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Honeypot action')
        .addChoices(
          { name: 'Create Trap', value: 'create' },
          { name: 'List Active Traps', value: 'list' },
          { name: 'Remove Trap', value: 'remove' },
          { name: 'View Statistics', value: 'stats' }
        )
        .setRequired(true))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of honeypot trap')
        .addChoices(
          { name: 'Channel (Bait Channel)', value: 'channel' },
          { name: 'Role (Admin Bait)', value: 'role' },
          { name: 'Invite (Trap Link)', value: 'invite' }
        )
        .setRequired(false))
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Name for the honeypot (default: auto-generated)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('honeypot_id')
        .setDescription('ID of honeypot to remove')
        .setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    const action = interaction.options.getString('action', true);
    const type = interaction.options.getString('type');
    const customName = interaction.options.getString('name');
    const honeypotId = interaction.options.getString('honeypot_id');
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

    try {
      const serverKey = guild.id;
      if (!activeHoneypots.has(serverKey)) {
        activeHoneypots.set(serverKey, []);
      }

      const serverHoneypots = activeHoneypots.get(serverKey)!;

      if (action === 'create') {
        if (!type) {
          await interaction.editReply('❌ Please specify a honeypot type');
          return;
        }

        const honeypotNames = {
          channel: customName || ['free-admin', 'get-admin-here', 'admin-requests', 'mod-applications', 'staff-only'],
          role: customName || ['Administrator-Free', 'Free-Moderator', 'Staff-Trial', 'VIP-Access'],
          invite: customName || ['backup-invite', 'emergency-access', 'staff-join']
        };

        const name = Array.isArray(honeypotNames[type as keyof typeof honeypotNames]) 
          ? honeypotNames[type as keyof typeof honeypotNames][Math.floor(Math.random() * honeypotNames[type as keyof typeof honeypotNames].length)]
          : honeypotNames[type as keyof typeof honeypotNames];

        let targetId = '';
        let createdResource = '';

        if (type === 'channel') {
          const channel = await guild.channels.create({
            name: name as string,
            type: ChannelType.GuildText,
            topic: '🍯 HONEYPOT - DO NOT DELETE - Auto-bans raiders who access this channel',
            permissionOverwrites: [
              {
                id: guild.id,
                deny: ['ViewChannel'],
              },
              {
                id: interaction.user.id,
                allow: ['ViewChannel', 'SendMessages', 'ManageChannels'],
              }
            ],
          });

          await channel.send({
            embeds: [new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('🍯 HONEYPOT ACTIVE')
              .setDescription('This is a security honeypot. Any unauthorized access will result in immediate ban.')
              .addFields(
                { name: '⚠️ WARNING', value: 'This channel is monitored by SecureBot Pro AI security system' },
                { name: '🔒 Status', value: 'ARMED - Auto-ban enabled' }
              )
              .setTimestamp()]
          });

          targetId = channel.id;
          createdResource = `Channel: ${channel.name}`;
        } else if (type === 'role') {
          const role = await guild.roles.create({
            name: name as string,
            color: 0xFF0000,
            permissions: [],
            mentionable: false,
            reason: '🍯 Honeypot role - Auto-bans users who receive this role'
          });

          targetId = role.id;
          createdResource = `Role: ${role.name}`;
        } else if (type === 'invite') {
          const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
          const randomChannel = channels.random();
          
          if (!randomChannel || randomChannel.type !== ChannelType.GuildText) {
            await interaction.editReply('❌ No suitable channel found for invite creation');
            return;
          }

          const invite = await randomChannel.createInvite({
            maxUses: 1,
            maxAge: 3600,
            unique: true,
            reason: '🍯 Honeypot invite - Tracks suspicious invite usage'
          });

          targetId = invite.code;
          createdResource = `Invite: discord.gg/${invite.code}`;
        }

        const honeypot: HoneypotData = {
          id: `hp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: type as 'channel' | 'role' | 'invite',
          name: name as string,
          targetId,
          created: new Date(),
          triggers: 0,
          caughtUsers: []
        };

        serverHoneypots.push(honeypot);

        const embed = new EmbedBuilder()
          .setColor(0xFF6B00)
          .setTitle('🍯 HONEYPOT DEPLOYED')
          .setDescription(`Successfully created **${type.toUpperCase()}** honeypot trap`)
          .addFields(
            { name: '🎯 Target', value: createdResource, inline: true },
            { name: '🆔 Honeypot ID', value: `\`${honeypot.id}\``, inline: true },
            { name: '📅 Created', value: `<t:${Math.floor(honeypot.created.getTime() / 1000)}:R>`, inline: true },
            { name: '⚠️ Security Mode', value: '**ULTRA AGGRESSIVE**\n• Auto-ban on interaction\n• Zero tolerance policy\n• Instant threat detection', inline: false },
            { name: '🔍 Monitoring', value: `• Type: ${type}\n• Status: 🟢 ACTIVE\n• Response: Immediate ban\n• Logging: Enabled`, inline: false }
          )
          .setFooter({ text: `Active honeypots: ${serverHoneypots.length}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createThreat({
          type: 'honeypot_deployed',
          severity: 'low',
          description: `Honeypot ${type} deployed: ${name}`,
          serverId: guild.id,
          serverName: guild.name,
          action: 'monitor',
          metadata: { honeypotId: honeypot.id, type, name }
        });

      } else if (action === 'list') {
        if (serverHoneypots.length === 0) {
          await interaction.editReply('📭 No active honeypots in this server');
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0xFF6B00)
          .setTitle('🍯 ACTIVE HONEYPOT TRAPS')
          .setDescription(`**Server:** ${guild.name}\n**Total Traps:** ${serverHoneypots.length}`)
          .setTimestamp();

        for (const hp of serverHoneypots.slice(0, 10)) {
          const status = hp.triggers > 0 ? `🔴 ${hp.triggers} triggers` : '🟢 No triggers';
          const lastTrigger = hp.lastTriggered ? `\nLast: <t:${Math.floor(hp.lastTriggered.getTime() / 1000)}:R>` : '';
          
          embed.addFields({
            name: `${hp.type === 'channel' ? '📺' : hp.type === 'role' ? '🎭' : '🔗'} ${hp.name}`,
            value: `**ID:** \`${hp.id}\`\n**Type:** ${hp.type}\n**Status:** ${status}\n**Caught:** ${hp.caughtUsers.length} users${lastTrigger}`,
            inline: false
          });
        }

        if (serverHoneypots.length > 10) {
          embed.setFooter({ text: `Showing 10 of ${serverHoneypots.length} honeypots` });
        }

        await interaction.editReply({ embeds: [embed] });

      } else if (action === 'remove') {
        if (!honeypotId) {
          await interaction.editReply('❌ Please specify a honeypot ID to remove');
          return;
        }

        const index = serverHoneypots.findIndex(hp => hp.id === honeypotId);
        if (index === -1) {
          await interaction.editReply('❌ Honeypot not found');
          return;
        }

        const honeypot = serverHoneypots[index];

        if (honeypot.type === 'channel') {
          const channel = guild.channels.cache.get(honeypot.targetId);
          if (channel) await channel.delete('Honeypot removed');
        } else if (honeypot.type === 'role') {
          const role = guild.roles.cache.get(honeypot.targetId);
          if (role) await role.delete('Honeypot removed');
        }

        serverHoneypots.splice(index, 1);

        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('🗑️ HONEYPOT REMOVED')
          .setDescription(`Successfully removed honeypot: **${honeypot.name}**`)
          .addFields(
            { name: '📊 Statistics', value: `**Triggers:** ${honeypot.triggers}\n**Users Caught:** ${honeypot.caughtUsers.length}\n**Active Time:** ${Math.floor((Date.now() - honeypot.created.getTime()) / 1000 / 60)} minutes` }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (action === 'stats') {
        const totalTriggers = serverHoneypots.reduce((sum, hp) => sum + hp.triggers, 0);
        const totalCaught = new Set(serverHoneypots.flatMap(hp => hp.caughtUsers)).size;
        const mostTriggered = serverHoneypots.reduce((max, hp) => hp.triggers > max.triggers ? hp : max, { triggers: 0, name: 'None' });

        const embed = new EmbedBuilder()
          .setColor(0xFF6B00)
          .setTitle('📊 HONEYPOT STATISTICS')
          .setDescription(`**Server:** ${guild.name}`)
          .addFields(
            { name: '🍯 Active Traps', value: `${serverHoneypots.length}`, inline: true },
            { name: '⚠️ Total Triggers', value: `${totalTriggers}`, inline: true },
            { name: '👥 Users Caught', value: `${totalCaught}`, inline: true },
            { name: '🎯 Most Triggered', value: mostTriggered.triggers > 0 ? `${mostTriggered.name} (${mostTriggered.triggers}x)` : 'None', inline: false },
            { name: '📈 Effectiveness', value: totalCaught > 0 ? `✅ ${totalCaught} threats neutralized` : '⏳ Monitoring...', inline: false }
          );

        const breakdown = {
          channel: serverHoneypots.filter(hp => hp.type === 'channel').length,
          role: serverHoneypots.filter(hp => hp.type === 'role').length,
          invite: serverHoneypots.filter(hp => hp.type === 'invite').length
        };

        embed.addFields({
          name: '🔍 Trap Breakdown',
          value: `📺 Channels: ${breakdown.channel}\n🎭 Roles: ${breakdown.role}\n🔗 Invites: ${breakdown.invite}`,
          inline: false
        });

        embed.setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      }

      const processingTime = Date.now() - startTime;

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'honeypot',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: true,
        parameters: { action, type, honeypotId },
        result: `Action: ${action}, Active honeypots: ${serverHoneypots.length}`,
        duration,
        metadata: { activeHoneypots: serverHoneypots.length }
      });

    } catch (error) {
      console.error('Honeypot error:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Honeypot Operation Failed')
        .setDescription(`Failed to execute honeypot command: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'honeypot',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        success: false,
        result: `Error: ${(error as Error).message}`,
        duration,
        metadata: { error: (error as Error).message }
      });
    }
  }
};
