import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const blacklistCommand = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('⛔ Advanced blacklist management with mass detection')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add user to blacklist')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to blacklist')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for blacklist')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('auto_ban')
            .setDescription('Auto-ban if user rejoins')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove user from blacklist')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to remove from blacklist')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all blacklisted users'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Check if a user is blacklisted')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('scan')
        .setDescription('Scan server for blacklisted users and take action')),
  
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
      if (subcommand === 'add') {
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const autoBan = interaction.options.getBoolean('auto_ban') ?? true;

        await storage.createThreat({
          type: 'blacklist',
          severity: 'critical',
          description: `⛔ USER BLACKLISTED: ${reason}`,
          serverId: guild.id,
          serverName: guild.name,
          userId: targetUser.id,
          username: targetUser.username,
          action: 'ban',
          metadata: {
            blacklistedBy: interaction.user.id,
            blacklistedByUsername: interaction.user.username,
            reason,
            autoBan,
            timestamp: new Date().toISOString()
          }
        });

        await storage.updateUserReputationScore(targetUser.id, guild.id, -300, true);

        const embed = new EmbedBuilder()
          .setTitle('⛔ USER BLACKLISTED')
          .setDescription(`<@${targetUser.id}> has been added to the blacklist`)
          .setColor(0x000000)
          .addFields([
            { name: '👤 User', value: `${targetUser.username} (<@${targetUser.id}>)`, inline: true },
            { name: '⚖️ Blacklisted By', value: interaction.user.username, inline: true },
            { name: '📝 Reason', value: reason, inline: false },
            { name: '🔒 Auto-Ban on Rejoin', value: autoBan ? '✅ ENABLED' : '❌ Disabled', inline: true },
            { name: '💀 Reputation Penalty', value: '-300 points', inline: true },
            { name: '⚠️ Actions', value: '• User blacklisted\n• Reputation destroyed (-300)\n• Auto-ban on rejoin\n• Logged in system', inline: false }
          ])
          .setFooter({ text: `⛔ BLACKLISTED - By ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'remove') {
        const targetUser = interaction.options.getUser('user', true);

        const threats = await storage.getThreats(1000);
        const blacklistEntry = threats.find(t => 
          t.type === 'blacklist' && 
          t.userId === targetUser.id && 
          t.serverId === guild.id &&
          !t.resolved
        );

        if (!blacklistEntry) {
          await interaction.editReply(`⚠️ <@${targetUser.id}> is not blacklisted`);
          return;
        }

        await storage.resolveThreat(blacklistEntry.id);

        const embed = new EmbedBuilder()
          .setTitle('✅ USER REMOVED FROM BLACKLIST')
          .setDescription(`<@${targetUser.id}> has been removed from the blacklist`)
          .setColor(0x00FF00)
          .setFooter({ text: `Removed by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'list') {
        const threats = await storage.getThreats(1000);
        const blacklisted = threats.filter(t => 
          t.type === 'blacklist' && 
          t.serverId === guild.id &&
          !t.resolved
        );

        if (blacklisted.length === 0) {
          await interaction.editReply('✅ No users are currently blacklisted');
          return;
        }

        const list = blacklisted.slice(0, 20).map((entry, index) => {
          const metadata = entry.metadata as any;
          const timeAgo = Math.floor((Date.now() - entry.timestamp.getTime()) / 1000 / 60);
          const timeStr = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;

          return `**${index + 1}.** <@${entry.userId}> (${entry.username})\n` +
                 `   📝 ${entry.description}\n` +
                 `   ⏰ ${timeStr} | 👤 By: ${metadata?.blacklistedByUsername || 'Unknown'}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
          .setTitle('⛔ BLACKLISTED USERS')
          .setDescription(list)
          .setColor(0x000000)
          .setFooter({ text: `Total blacklisted: ${blacklisted.length} | Showing max 20` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'check') {
        const targetUser = interaction.options.getUser('user', true);

        const threats = await storage.getThreats(1000);
        const blacklistEntry = threats.find(t => 
          t.type === 'blacklist' && 
          t.userId === targetUser.id && 
          t.serverId === guild.id &&
          !t.resolved
        );

        const isBlacklisted = !!blacklistEntry;
        const metadata = blacklistEntry?.metadata as any;

        const embed = new EmbedBuilder()
          .setTitle(isBlacklisted ? '⛔ USER IS BLACKLISTED' : '✅ USER IS NOT BLACKLISTED')
          .setDescription(`<@${targetUser.id}>`)
          .setColor(isBlacklisted ? 0xFF0000 : 0x00FF00);

        if (isBlacklisted) {
          embed.addFields([
            { name: '📝 Reason', value: blacklistEntry.description, inline: false },
            { name: '⏰ Blacklisted', value: `<t:${Math.floor(blacklistEntry.timestamp.getTime() / 1000)}:R>`, inline: true },
            { name: '👤 By', value: metadata?.blacklistedByUsername || 'Unknown', inline: true }
          ]);
        }

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'scan') {
        await guild.members.fetch();
        const members = Array.from(guild.members.cache.values());
        
        const threats = await storage.getThreats(1000);
        const blacklisted = threats.filter(t => 
          t.type === 'blacklist' && 
          t.serverId === guild.id &&
          !t.resolved
        );

        let foundCount = 0;
        let bannedCount = 0;

        for (const member of members) {
          const isBlacklisted = blacklisted.some(b => b.userId === member.id);
          
          if (isBlacklisted) {
            foundCount++;
            
            if (member.bannable) {
              try {
                await member.ban({ reason: '⛔ BLACKLISTED USER DETECTED - AUTO-BAN' });
                bannedCount++;
              } catch (err) {
                console.error(`Failed to ban blacklisted user ${member.id}:`, err);
              }
            }
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('🔍 BLACKLIST SCAN COMPLETE')
          .setDescription(`Scanned ${members.length} members`)
          .setColor(foundCount > 0 ? 0xFF0000 : 0x00FF00)
          .addFields([
            { name: '👥 Members Scanned', value: members.length.toString(), inline: true },
            { name: '⛔ Blacklisted Found', value: foundCount.toString(), inline: true },
            { name: '🔨 Auto-Banned', value: bannedCount.toString(), inline: true },
            { name: '⚠️ Result', value: foundCount > 0 ? 
              `🚨 Found ${foundCount} blacklisted users, ${bannedCount} were banned` : 
              '✅ No blacklisted users found in server', inline: false }
          ])
          .setFooter({ text: `Scan executed by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        if (foundCount > 0) {
          await storage.createThreat({
            type: 'blacklist_scan',
            severity: 'high',
            description: `🔍 BLACKLIST SCAN: Found ${foundCount} blacklisted users, banned ${bannedCount}`,
            serverId: guild.id,
            serverName: guild.name,
            userId: interaction.user.id,
            username: interaction.user.username,
            action: 'ban',
            metadata: { found: foundCount, banned: bannedCount }
          });
        }
      }

      await storage.createCommandLog({
        commandName: 'blacklist',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Blacklist ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in blacklist command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'blacklist',
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
