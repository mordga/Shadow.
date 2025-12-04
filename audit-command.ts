import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';

export const auditCommand = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('📋 Review recent critical security events')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of events to show (1-50)')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(false))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Filter by event type')
        .addChoices(
          { name: 'All Events', value: 'all' },
          { name: 'Raid', value: 'raid' },
          { name: 'Spam', value: 'spam' },
          { name: 'Bypass', value: 'bypass' },
          { name: 'NSFW', value: 'nsfw' },
          { name: 'Bans', value: 'banned' },
          { name: 'Kicks', value: 'kicked' }
        )
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
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

    try {
      const limit = interaction.options.getInteger('limit') || 10;
      const type = interaction.options.getString('type') || 'all';

      let threats;
      if (type === 'all') {
        threats = await storage.getThreats(limit);
      } else {
        threats = await storage.getThreatsByType(type, limit);
      }

      const serverThreats = threats.filter(t => t.serverId === guild.id);

      if (serverThreats.length === 0) {
        await interaction.editReply('✅ No security events found. Your server is clean!');
        return;
      }

      const criticalCount = serverThreats.filter(t => t.severity === 'critical').length;
      const highCount = serverThreats.filter(t => t.severity === 'high').length;
      const mediumCount = serverThreats.filter(t => t.severity === 'medium').length;

      const embed = new EmbedBuilder()
        .setTitle('📋 SECURITY AUDIT REPORT')
        .setDescription(`Showing **${serverThreats.length}** most recent events ${type !== 'all' ? `(Type: **${type}**)` : ''}`)
        .setColor(criticalCount > 0 ? 0xFF0000 : highCount > 0 ? 0xFF6600 : 0xFFA500)
        .addFields([
          { name: '🔴 Critical', value: criticalCount.toString(), inline: true },
          { name: '🟠 High', value: highCount.toString(), inline: true },
          { name: '🟡 Medium', value: mediumCount.toString(), inline: true }
        ]);

      const eventsList = serverThreats.slice(0, 10).map((threat, index) => {
        const severityEmoji = {
          'critical': '🔴',
          'high': '🟠',
          'medium': '🟡',
          'low': '🟢'
        }[threat.severity] || '⚪';

        const timeAgo = Math.floor((Date.now() - threat.timestamp.getTime()) / 1000 / 60);
        const timeStr = timeAgo < 1 ? 'Just now' : timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;

        return `${severityEmoji} **${threat.type.toUpperCase()}** - ${threat.description.substring(0, 50)}...\n` +
               `   User: <@${threat.userId}> | ${timeStr} | Action: ${threat.action}`;
      }).join('\n\n');

      embed.addFields([
        { name: '📜 Recent Events', value: eventsList || 'No events', inline: false }
      ]);

      embed.setFooter({ text: `Audit requested by ${interaction.user.username} | Total events: ${serverThreats.length}` })
           .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await storage.createCommandLog({
        commandName: 'audit',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { limit, type },
        result: `Audit completed: ${serverThreats.length} events found`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { eventsFound: serverThreats.length, type }
      });

    } catch (error) {
      console.error('Error in audit command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'audit',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: {},
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
