import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

// Helper function to check if a user is currently whitelisted
async function isUserWhitelisted(userId: string, serverId: string) {
  const threats = await storage.getThreats(1000);
  const userEvents = threats.filter(
    t => t.userId === userId && 
    t.serverId === serverId && 
    (t.type === 'whitelisted' || t.type === 'whitelist_removed')
  ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (userEvents.length === 0) return { isWhitelisted: false, entry: null };

  const mostRecent = userEvents[0];
  return {
    isWhitelisted: mostRecent.type === 'whitelisted',
    entry: mostRecent.type === 'whitelisted' ? mostRecent : null
  };
}

export const whitelistCommand = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage bot whitelist with advanced features')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a user to the whitelist')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to whitelist')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for whitelisting')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a user from the whitelist')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to remove from whitelist')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Show all whitelisted users'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Check if a user is whitelisted')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check')
            .setRequired(true))),
  
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

      if (subcommand === 'add') {
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const { isWhitelisted } = await isUserWhitelisted(targetUser.id, guild.id);

        if (isWhitelisted) {
          await interaction.editReply('⚠️ This user is already whitelisted');
          return;
        }

        await storage.createThreat({
          type: 'whitelisted',
          severity: 'low',
          description: `✅ USER WHITELISTED: ${reason}`,
          serverId: guild.id,
          serverName: guild.name,
          userId: targetUser.id,
          username: targetUser.username,
          action: 'whitelist',
          metadata: {
            whitelistedBy: interaction.user.id,
            whitelistedByUsername: interaction.user.username,
            reason,
            timestamp: new Date().toISOString()
          }
        });

        await storage.updateUserReputationScore(targetUser.id, guild.id, 100, false);

        const embed = new EmbedBuilder()
          .setTitle('✅ USER WHITELISTED')
          .setDescription(`<@${targetUser.id}> has been added to the whitelist`)
          .setColor(0x00FF00)
          .addFields([
            { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
            { name: '⚖️ Administrator', value: interaction.user.username, inline: true },
            { name: '📝 Reason', value: reason, inline: false },
            { name: '💚 Reputation Bonus', value: '+100 points', inline: true },
            { name: '🛡️ Protection', value: 'Immune to auto-moderation', inline: true },
            { name: '⚠️ Actions Taken', value: '• User added to whitelist\n• Reputation +100 points\n• Auto-mod bypass enabled\n• Action logged in system', inline: false }
          ])
          .setFooter({ text: `Executed by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createCommandLog({
          commandName: 'whitelist',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'add', targetUser: targetUser.id, reason },
          result: `User ${targetUser.username} added to whitelist`,
          success: true,
          duration: Date.now() - startTime,
          metadata: {
            targetUserId: targetUser.id,
            targetUsername: targetUser.username,
            reason
          }
        });

      } else if (subcommand === 'remove') {
        const targetUser = interaction.options.getUser('user', true);

        const { isWhitelisted } = await isUserWhitelisted(targetUser.id, guild.id);

        if (!isWhitelisted) {
          await interaction.editReply('⚠️ This user is not whitelisted');
          return;
        }

        await storage.createThreat({
          type: 'whitelist_removed',
          severity: 'low',
          description: `❌ WHITELIST REMOVED`,
          serverId: guild.id,
          serverName: guild.name,
          userId: targetUser.id,
          username: targetUser.username,
          action: 'whitelist_remove',
          metadata: {
            removedBy: interaction.user.id,
            removedByUsername: interaction.user.username,
            timestamp: new Date().toISOString()
          }
        });

        const embed = new EmbedBuilder()
          .setTitle('❌ WHITELIST REMOVED')
          .setDescription(`<@${targetUser.id}> has been removed from the whitelist`)
          .setColor(0xFF9900)
          .addFields([
            { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
            { name: '⚖️ Administrator', value: interaction.user.username, inline: true },
            { name: '⚠️ Actions Taken', value: '• User removed from whitelist\n• Auto-mod protection disabled\n• Action logged in system', inline: false }
          ])
          .setFooter({ text: `Executed by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createCommandLog({
          commandName: 'whitelist',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'remove', targetUser: targetUser.id },
          result: `User ${targetUser.username} removed from whitelist`,
          success: true,
          duration: Date.now() - startTime,
          metadata: {
            targetUserId: targetUser.id,
            targetUsername: targetUser.username
          }
        });

      } else if (subcommand === 'list') {
        const threats = await storage.getThreats(1000);
        
        // Get unique user IDs
        const userIdsSet = new Set(threats
          .filter(t => t.serverId === guild.id && (t.type === 'whitelisted' || t.type === 'whitelist_removed'))
          .map(t => t.userId)
          .filter(id => id !== undefined)
        );
        const userIds = Array.from(userIdsSet) as string[];

        // Check each user's current whitelist status
        const whitelisted = [];
        for (const userId of userIds) {
          const { isWhitelisted, entry } = await isUserWhitelisted(userId, guild.id);
          if (isWhitelisted && entry) {
            whitelisted.push(entry);
          }
        }

        if (whitelisted.length === 0) {
          await interaction.editReply('📋 No users are currently whitelisted');
          return;
        }

        let listText = '';
        whitelisted.slice(0, 20).forEach((entry, index) => {
          const metadata = entry.metadata as { reason?: string; whitelistedByUsername?: string } | undefined;
          const reason = metadata?.reason || 'No reason';
          const whitelistedBy = metadata?.whitelistedByUsername || 'Unknown';
          listText += `${index + 1}. <@${entry.userId}> - ${reason} (by ${whitelistedBy})\n`;
        });

        if (whitelisted.length > 20) {
          listText += `\n... and ${whitelisted.length - 20} more`;
        }

        const embed = new EmbedBuilder()
          .setTitle('📋 WHITELISTED USERS')
          .setDescription(listText || 'No whitelisted users')
          .setColor(0x00FF00)
          .addFields([
            { name: '📊 Total Whitelisted', value: whitelisted.length.toString(), inline: true },
            { name: '🛡️ Protection Level', value: 'Full Auto-Mod Bypass', inline: true }
          ])
          .setFooter({ text: `Requested by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createCommandLog({
          commandName: 'whitelist',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'list' },
          result: `Listed ${whitelisted.length} whitelisted users`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { count: whitelisted.length }
        });

      } else if (subcommand === 'check') {
        const targetUser = interaction.options.getUser('user', true);

        const { isWhitelisted: whitelisted, entry: whitelistEntry } = await isUserWhitelisted(targetUser.id, guild.id);

        const metadata = whitelistEntry?.metadata as { reason?: string; whitelistedByUsername?: string } | undefined;
        const reason = metadata?.reason || 'N/A';
        const whitelistedBy = metadata?.whitelistedByUsername || 'N/A';

        const embed = new EmbedBuilder()
          .setTitle(whitelisted ? '✅ USER IS WHITELISTED' : '❌ USER NOT WHITELISTED')
          .setDescription(`Status for <@${targetUser.id}>`)
          .setColor(whitelisted ? 0x00FF00 : 0xFF0000)
          .addFields([
            { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
            { name: '✅ Whitelisted', value: whitelisted ? 'Yes' : 'No', inline: true }
          ])
          .setFooter({ text: `Checked by ${interaction.user.username}` })
          .setTimestamp();

        if (whitelisted) {
          embed.addFields([
            { name: '📝 Reason', value: reason, inline: true },
            { name: '⚖️ Whitelisted By', value: whitelistedBy, inline: true }
          ]);
        }

        await interaction.editReply({ embeds: [embed] });

        await storage.createCommandLog({
          commandName: 'whitelist',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId: guild.id,
          serverName: guild.name,
          parameters: { action: 'check', targetUser: targetUser.id },
          result: `User ${targetUser.username} is ${whitelisted ? '' : 'not '}whitelisted`,
          success: true,
          duration: Date.now() - startTime,
          metadata: {
            targetUserId: targetUser.id,
            targetUsername: targetUser.username,
            isWhitelisted: whitelisted
          }
        });
      }

    } catch (error) {
      console.error('Error in whitelist command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      const guild = interaction.guild;
      if (guild) {
        await storage.createCommandLog({
          commandName: 'whitelist',
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
  }
};
