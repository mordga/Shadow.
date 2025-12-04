import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const authorizeInviteCommand = {
  data: new SlashCommandBuilder()
    .setName('authorize-invite')
    .setDescription('🔑 Authorize a trusted user to create server invitations')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant')
        .setDescription('Grant invite permission to a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to authorize')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('max_uses')
            .setDescription('Maximum number of invites (0 = unlimited)')
            .setMinValue(0)
            .setMaxValue(100)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('Invite duration in hours (0 = permanent)')
            .setMinValue(0)
            .setMaxValue(168)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('revoke')
        .setDescription('Revoke invite permission from a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to revoke authorization')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all authorized users')),
  
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
      if (subcommand === 'grant') {
        const targetUser = interaction.options.getUser('user', true);
        const maxUses = interaction.options.getInteger('max_uses') || 0;
        const duration = interaction.options.getInteger('duration') || 0;

        const member = await guild.members.fetch(targetUser.id);
        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        const inviteRole = guild.roles.cache.find(r => r.name === 'Create Instant Invite') ||
          await guild.roles.create({
            name: 'Create Instant Invite',
            permissions: ['CreateInstantInvite'],
            color: 0x00FF00,
            reason: 'Authorized invite creation role'
          });

        await member.roles.add(inviteRole);

        await storage.createThreat({
          type: 'authorization',
          severity: 'low',
          description: `🔑 INVITE PERMISSION GRANTED to ${targetUser.username}`,
          serverId: guild.id,
          serverName: guild.name,
          userId: targetUser.id,
          username: targetUser.username,
          action: 'warn',
          metadata: {
            authorizedBy: interaction.user.id,
            maxUses,
            duration,
            timestamp: new Date().toISOString()
          }
        });

        const embed = new EmbedBuilder()
          .setTitle('🔑 INVITE PERMISSION GRANTED')
          .setDescription(`<@${targetUser.id}> can now create server invitations`)
          .setColor(0x00FF00)
          .addFields([
            { name: '👤 Authorized User', value: targetUser.username, inline: true },
            { name: '🔢 Max Uses', value: maxUses === 0 ? 'Unlimited' : maxUses.toString(), inline: true },
            { name: '⏰ Duration', value: duration === 0 ? 'Permanent' : `${duration} hours`, inline: true },
            { name: '⚖️ Authorized By', value: interaction.user.username, inline: true },
            { name: '⚠️ Security Note', value: '✅ User reputation will be monitored for abuse', inline: false }
          ])
          .setFooter({ text: `Granted by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        try {
          await targetUser.send(
            `🔑 **INVITE PERMISSION GRANTED**\n\n` +
            `You have been authorized to create invitations in **${guild.name}**.\n\n` +
            `**Max Uses:** ${maxUses === 0 ? 'Unlimited' : maxUses}\n` +
            `**Duration:** ${duration === 0 ? 'Permanent' : `${duration} hours`}\n\n` +
            `⚠️ **Warning:** Abuse of this permission will result in immediate revocation and potential ban.`
          );
        } catch (err) {
          console.log('Could not DM user about authorization');
        }

      } else if (subcommand === 'revoke') {
        const targetUser = interaction.options.getUser('user', true);
        const member = await guild.members.fetch(targetUser.id);
        
        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        const inviteRole = guild.roles.cache.find(r => r.name === 'Create Instant Invite');
        if (inviteRole && member.roles.cache.has(inviteRole.id)) {
          await member.roles.remove(inviteRole);
        }

        const embed = new EmbedBuilder()
          .setTitle('🔒 INVITE PERMISSION REVOKED')
          .setDescription(`<@${targetUser.id}> can no longer create server invitations`)
          .setColor(0xFF6600)
          .setFooter({ text: `Revoked by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'list') {
        const inviteRole = guild.roles.cache.find(r => r.name === 'Create Instant Invite');
        
        if (!inviteRole) {
          await interaction.editReply('📋 No users are currently authorized to create invites');
          return;
        }

        const authorizedMembers = guild.members.cache.filter(m => m.roles.cache.has(inviteRole.id));

        const embed = new EmbedBuilder()
          .setTitle('📋 AUTHORIZED INVITE CREATORS')
          .setDescription(authorizedMembers.size > 0 ? 
            authorizedMembers.map(m => `• <@${m.id}> (${m.user.username})`).join('\n') :
            'No users are currently authorized')
          .setColor(0x00BFFF)
          .setFooter({ text: `Total: ${authorizedMembers.size} users` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      await storage.createCommandLog({
        commandName: 'authorize-invite',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Authorize-invite ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in authorize-invite command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'authorize-invite',
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
