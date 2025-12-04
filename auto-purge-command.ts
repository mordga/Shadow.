import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, TextChannel, ChannelType } from 'discord.js';
import { storage } from '../../storage';

export const autoPurgeCommand = {
  data: new SlashCommandBuilder()
    .setName('auto-purge')
    .setDescription('🗑️ ULTRA AGGRESSIVE: Auto-purge suspicious messages across all channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addBooleanOption(option =>
      option.setName('confirm')
        .setDescription('CONFIRM auto-purge action (required)')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('hours')
        .setDescription('Scan messages from last X hours (1-48)')
        .setMinValue(1)
        .setMaxValue(48)
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('delete_links')
        .setDescription('Delete all messages with links')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('delete_mentions')
        .setDescription('Delete all messages with @everyone/@here')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const guildId = interaction.guildId;
      const hours = interaction.options.getInteger('hours') || 24;
      const deleteLinks = interaction.options.getBoolean('delete_links') ?? true;
      const deleteMentions = interaction.options.getBoolean('delete_mentions') ?? true;
      const confirmed = interaction.options.getBoolean('confirm', true);

      if (!guildId) {
        await interaction.editReply('❌ This command can only be used in a server');
        return;
      }

      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) {
        await interaction.editReply('❌ Could not access server information. Please try again.');
        return;
      }

      if (!confirmed) {
        await interaction.editReply('❌ You must confirm the auto-purge by setting confirm to TRUE');
        return;
      }

      const serverId = guild.id;
      const serverName = guild.name;

      const timeThreshold = Date.now() - (hours * 60 * 60 * 1000);
      const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

      let totalScanned = 0;
      let totalDeleted = 0;
      let channelsProcessed = 0;
      const deletionReasons: { [key: string]: number } = {
        links: 0,
        mentions: 0,
        threats: 0,
        spam: 0
      };

      // Get all text channels
      const textChannels = guild.channels.cache.filter(
        ch => ch.type === ChannelType.GuildText
      ) as Map<string, TextChannel>;

      // Get recent threats to identify suspicious users
      const threats = await storage.getThreats(1000);
      const suspiciousUserIds = new Set(
        threats
          .filter(t => t.serverId === serverId && t.timestamp.getTime() > timeThreshold)
          .map(t => t.userId)
          .filter(Boolean)
      );

      for (const [, channel] of Array.from(textChannels)) {
        try {
          const messages = await channel.messages.fetch({ limit: 100 });
          channelsProcessed++;

          for (const [, message] of Array.from(messages)) {
            // Skip if message is too old (Discord API limitation)
            if (message.createdTimestamp < twoWeeksAgo) continue;
            
            // Skip if message is older than specified hours
            if (message.createdTimestamp < timeThreshold) continue;

            // Skip bot messages
            if (message.author.bot) continue;

            totalScanned++;

            let shouldDelete = false;
            let reason = '';

            // Check for links
            if (deleteLinks && (message.content.includes('http://') || message.content.includes('https://'))) {
              shouldDelete = true;
              reason = 'links';
              deletionReasons.links++;
            }

            // Check for mass mentions
            if (deleteMentions && (message.content.includes('@everyone') || message.content.includes('@here'))) {
              shouldDelete = true;
              reason = 'mentions';
              deletionReasons.mentions++;
            }

            // Check if user has recent threats
            if (suspiciousUserIds.has(message.author.id)) {
              shouldDelete = true;
              reason = 'threats';
              deletionReasons.threats++;
            }

            // Check for spam patterns
            const spamPatterns = ['discord.gg/', 'nitro', 'free', 'giveaway', 'gift'];
            if (spamPatterns.some(pattern => message.content.toLowerCase().includes(pattern))) {
              shouldDelete = true;
              reason = 'spam';
              deletionReasons.spam++;
            }

            if (shouldDelete && message.deletable) {
              try {
                await message.delete();
                totalDeleted++;
              } catch (err) {
                console.error(`Failed to delete message ${message.id}:`, err);
              }
            }
          }
        } catch (err) {
          console.error(`Failed to process channel ${channel.id}:`, err);
        }
      }

      // Create incident record
      await storage.createIncident({
        type: 'auto_purge',
        severity: 'high',
        title: 'AUTO-PURGE EXECUTED',
        description: `Ultra aggressive automatic message purge across ${channelsProcessed} channels`,
        serverId,
        serverName,
        affectedUsers: Array.from(suspiciousUserIds),
        actionsPerformed: [
          `Scanned ${totalScanned} messages`,
          `Deleted ${totalDeleted} suspicious messages`,
          `Processed ${channelsProcessed} channels`
        ],
        evidence: {
          hours,
          deleteLinks,
          deleteMentions,
          totalScanned,
          totalDeleted,
          channelsProcessed,
          deletionReasons,
          executedBy: interaction.user.id,
          executedByUsername: interaction.user.username,
          timestamp: new Date().toISOString()
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('🗑️💥 ULTRA AGGRESSIVE AUTO-PURGE COMPLETE 💥🗑️')
        .setDescription(
          `**Scanned last ${hours} hours**\n\n` +
          `🔍 **${totalScanned}** messages scanned\n` +
          `🗑️ **${totalDeleted}** messages deleted\n` +
          `📺 **${channelsProcessed}** channels processed`
        )
        .setColor(totalDeleted > 0 ? 0xFF0000 : 0x00FF00)
        .addFields([
          { name: '⚖️ Executed By', value: interaction.user.username, inline: true },
          { name: '⏱️ Time Range', value: `Last ${hours} hours`, inline: true },
          { 
            name: '📊 DELETION BREAKDOWN', 
            value: 
              `• 🔗 Links: **${deletionReasons.links}**\n` +
              `• 📢 Mass mentions: **${deletionReasons.mentions}**\n` +
              `• 🚨 Threat users: **${deletionReasons.threats}**\n` +
              `• ⚠️ Spam patterns: **${deletionReasons.spam}**`,
            inline: false 
          },
          { 
            name: '🛡️ FILTERS APPLIED', 
            value: 
              `• ${deleteLinks ? '✅' : '❌'} Delete links: **${deleteLinks ? 'YES' : 'NO'}**\n` +
              `• ${deleteMentions ? '✅' : '❌'} Delete mentions: **${deleteMentions ? 'YES' : 'NO'}**\n` +
              `• ✅ Suspicious users: **YES**\n` +
              `• ✅ Spam patterns: **YES**`,
            inline: false 
          },
          { 
            name: '🚨 POST-PURGE ACTIONS', 
            value: 
              '1. 🔍 Review `/audit` for details\n' +
              '2. 📊 Check `/stats` for updates\n' +
              '3. 🛡️ Run `/scan type:quick`\n' +
              '4. ⚠️ Monitor for retaliation',
            inline: false 
          }
        ])
        .setFooter({ text: `Auto-purge completed - ${totalDeleted} messages removed` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'auto-purge',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { hours, deleteLinks, deleteMentions },
        result: `Auto-purged ${totalDeleted} messages from ${channelsProcessed} channels`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { 
          hours,
          deleteLinks,
          deleteMentions,
          totalScanned,
          totalDeleted,
          channelsProcessed,
          deletionReasons
        }
      });

    } catch (error) {
      console.error('Error in auto-purge command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await storage.createCommandLog({
        commandName: 'auto-purge',
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

      await interaction.editReply(`❌ Error executing auto-purge: ${errorMessage}`);
    }
  }
};
