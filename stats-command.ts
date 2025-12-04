import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { storage } from '../../storage';

export const statsCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show detailed server and bot statistics')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of statistics to show')
        .addChoices(
          { name: 'Bot Stats', value: 'bot' },
          { name: 'Server Stats', value: 'server' },
          { name: 'Security Stats', value: 'security' },
          { name: 'All Stats', value: 'all' }
        )
        .setRequired(false))
    .setDMPermission(false),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
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
      
      const type = interaction.options.getString('type') || 'all';
      const serverId = guild.id;
      const serverName = guild.name;

      const embeds: EmbedBuilder[] = [];

      if (type === 'bot' || type === 'all') {
        const botStats = await storage.getBotStats();
        const botEmbed = new EmbedBuilder()
          .setTitle('🤖 Bot Statistics')
          .setColor(0x5865F2)
          .addFields([
            { name: '⏰ Uptime', value: botStats?.uptime || '0d 0h 0m', inline: true },
            { name: '💾 Memory Usage', value: botStats?.memoryUsage || '0MB', inline: true },
            { name: '📡 API Latency', value: botStats?.apiLatency || '0ms', inline: true },
            { name: '🛡️ Threats Blocked', value: botStats?.threatsBlocked.toString() || '0', inline: true },
            { name: '📊 Detection Rate', value: botStats?.detectionRate || '0%', inline: true },
            { name: '🌐 Active Servers', value: botStats?.activeServers.toString() || '0', inline: true },
            { name: '🚨 Active Raids', value: botStats?.activeRaids.toString() || '0', inline: true },
            { name: '🔞 NSFW Detected', value: botStats?.nsfwDetected.toString() || '0', inline: true },
            { name: '🔄 Bypass Attempts', value: botStats?.bypassAttempts.toString() || '0', inline: true },
          ])
          .setTimestamp();
        embeds.push(botEmbed);
      }

      if (type === 'server' || type === 'all') {
        const guild = interaction.guild;
        const quarantinedInServer = await storage.getQuarantinedUsers(serverId);
        const activeQuarantined = quarantinedInServer.filter(q => !q.released).length;
        const serverThreats = await storage.getThreats();
        const serverSpecificThreats = serverThreats.filter(t => t.serverId === serverId);
        
        const recentMembers = guild?.members.cache.filter(m => {
          const joinedAt = m.joinedAt;
          if (!joinedAt) return false;
          const daysSinceJoin = (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceJoin <= 7;
        }).size || 0;

        const serverEmbed = new EmbedBuilder()
          .setTitle(`📊 Server Statistics - ${serverName}`)
          .setColor(0x57F287)
          .addFields([
            { name: '👥 Total Members', value: guild?.memberCount.toString() || '0', inline: true },
            { name: '📝 Channels', value: guild?.channels.cache.size.toString() || '0', inline: true },
            { name: '🎭 Roles', value: guild?.roles.cache.size.toString() || '0', inline: true },
            { name: '🆕 Recent Joins (7d)', value: recentMembers.toString(), inline: true },
            { name: '🔒 Quarantined Users', value: activeQuarantined.toString(), inline: true },
            { name: '⚠️ Threats Detected', value: serverSpecificThreats.length.toString(), inline: true },
          ])
          .setTimestamp();
        embeds.push(serverEmbed);
      }

      if (type === 'security' || type === 'all') {
        const threats = await storage.getThreats(100);
        const bypassPatterns = await storage.getBypassPatterns();
        
        const threatsByType = threats.reduce((acc, threat) => {
          acc[threat.type] = (acc[threat.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const activePatterns = bypassPatterns.filter(p => p.active).length;
        const totalDetections = bypassPatterns.reduce((sum, p) => sum + p.detectedCount, 0);
        
        const raidThreats = threatsByType['raid'] || 0;
        const spamThreats = threatsByType['spam'] || 0;
        const nsfwThreats = threatsByType['nsfw'] || 0;
        const bypassThreats = threatsByType['bypass'] || 0;

        const securityEmbed = new EmbedBuilder()
          .setTitle('🔐 Security Statistics')
          .setColor(0xED4245)
          .addFields([
            { name: '🚨 Raid Attempts', value: raidThreats.toString(), inline: true },
            { name: '💬 Spam Detected', value: spamThreats.toString(), inline: true },
            { name: '🔞 NSFW Blocked', value: nsfwThreats.toString(), inline: true },
            { name: '🔄 Bypass Patterns', value: activePatterns.toString(), inline: true },
            { name: '📈 Total Detections', value: totalDetections.toString(), inline: true },
            { name: '🛡️ Bypass Attempts', value: bypassThreats.toString(), inline: true },
          ])
          .setTimestamp();
        embeds.push(securityEmbed);
      }

      await interaction.editReply({ embeds });

      await storage.createCommandLog({
        commandName: 'stats',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { type },
        result: `Stats displayed: ${type}`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { embedsCount: embeds.length }
      });

    } catch (error) {
      console.error('Error in stats command:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply({
        content: `❌ Error retrieving statistics: ${errorMessage}`
      });

      await storage.createCommandLog({
        commandName: 'stats',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: { type: interaction.options.getString('type') || 'all' },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
