import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { SimulationModule, SimulationScenario, IntensityLevel } from '../../services/simulation-module';

const simulationModule = new SimulationModule();

const scenarioMap: Record<string, SimulationScenario> = {
  'raid': 'raid',
  'spam': 'spam',
  'nuke': 'nuke',
  'invites': 'suspicious_invites',
  'roles': 'mass_role_creation',
  'channels': 'mass_channel_deletion',
  'bypass': 'bypass_attempts',
  'nsfw': 'nsfw_flood',
  'mentions': 'mention_spam',
  'coordinated': 'coordinated_attack',
  'stress-test': 'coordinated_attack'
};

const scenarioDescriptions: Record<string, string> = {
  'raid': '🚨 Mass user join simulation',
  'spam': '💬 Spam message flood',
  'nuke': '💥 Server nuke attempt',
  'invites': '🔗 Suspicious invite links',
  'roles': '👑 Mass role creation',
  'channels': '🗑️ Mass channel deletion',
  'bypass': '🔄 Filter bypass attempts',
  'nsfw': '🔞 NSFW content flood',
  'mentions': '📢 Mention spam attack',
  'coordinated': '🎯 Multi-vector coordinated attack',
  'stress-test': '⚡ Full system stress test'
};

export const simulateCommand = {
  data: new SlashCommandBuilder()
    .setName('simulate')
    .setDescription('🧪 Run security simulation to test bot defenses (Admin only)')
    .addStringOption(option =>
      option.setName('scenario')
        .setDescription('Type of attack scenario to simulate')
        .setRequired(true)
        .addChoices(
          { name: '🚨 Raid - Mass user joins', value: 'raid' },
          { name: '💬 Spam - Message flood', value: 'spam' },
          { name: '💥 Nuke - Server destruction', value: 'nuke' },
          { name: '🔗 Invites - Suspicious links', value: 'invites' },
          { name: '👑 Roles - Mass role creation', value: 'roles' },
          { name: '🗑️ Channels - Mass deletion', value: 'channels' },
          { name: '🔄 Bypass - Filter evasion', value: 'bypass' },
          { name: '🔞 NSFW - Inappropriate content', value: 'nsfw' },
          { name: '📢 Mentions - Mention spam', value: 'mentions' },
          { name: '🎯 Coordinated - Multi-attack', value: 'coordinated' },
          { name: '⚡ Stress Test - Full system test', value: 'stress-test' }
        ))
    .addStringOption(option =>
      option.setName('intensity')
        .setDescription('Attack intensity level')
        .setRequired(false)
        .addChoices(
          { name: 'Low - Light testing', value: 'low' },
          { name: 'Medium - Standard test', value: 'medium' },
          { name: 'High - Aggressive test', value: 'high' },
          { name: 'Extreme - Stress test', value: 'extreme' }
        ))
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Simulation duration in seconds (default: 60)')
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(300))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      await interaction.deferReply();
      
      const scenarioKey = interaction.options.getString('scenario', true);
      const scenario = scenarioMap[scenarioKey];
      const intensity = (interaction.options.getString('intensity') || 'medium') as IntensityLevel;
      const duration = interaction.options.getInteger('duration') || 60;
      
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      if (serverId === 'DM') {
        await interaction.editReply({
          content: '❌ Simulations can only be run in a server, not in DMs.'
        });
        return;
      }

      const initialEmbed = new EmbedBuilder()
        .setTitle('🧪 Security Simulation Starting')
        .setDescription(`Preparing to simulate **${scenarioDescriptions[scenarioKey]}**`)
        .setColor(0xFEE75C)
        .addFields([
          { name: '📋 Scenario', value: scenarioDescriptions[scenarioKey], inline: true },
          { name: '⚡ Intensity', value: intensity.toUpperCase(), inline: true },
          { name: '⏱️ Duration', value: `${duration}s`, inline: true },
          { name: '📍 Server', value: serverName, inline: false },
          { name: '⚠️ Warning', value: 'This will generate simulated threats to test your defenses. No real actions will be taken against actual users.', inline: false }
        ])
        .setTimestamp();

      await interaction.editReply({ embeds: [initialEmbed] });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const progressEmbed = new EmbedBuilder()
        .setTitle('🧪 Simulation In Progress')
        .setDescription('⏳ Running security simulation...')
        .setColor(0x5865F2)
        .addFields([
          { name: 'Status', value: '🔄 Generating simulated threats...', inline: false },
          { name: 'Please Wait', value: `This will take approximately ${duration} seconds`, inline: false }
        ])
        .setTimestamp();

      await interaction.editReply({ embeds: [progressEmbed] });

      const config = {
        scenario,
        intensity,
        duration,
        serverId,
        serverName
      };

      const result = await simulationModule.runSimulation(config);

      const threatColors: Record<string, number> = {
        low: 0x57F287,
        medium: 0xFEE75C,
        high: 0xF26522,
        extreme: 0xED4245
      };

      const color = threatColors[intensity] || 0x5865F2;

      const actionsText = Object.entries(result.metrics.actionsPerformed)
        .filter(([_, count]) => count > 0)
        .map(([action, count]) => `**${action}:** ${count}`)
        .join('\n') || 'No actions taken';

      const resultsEmbed = new EmbedBuilder()
        .setTitle('✅ Simulation Complete')
        .setDescription(`**${scenarioDescriptions[scenarioKey]}** simulation finished`)
        .setColor(result.metrics.successful ? color : 0xED4245)
        .addFields([
          {
            name: '📊 Metrics Summary',
            value: [
              `**Events Generated:** ${result.metrics.eventsGenerated}`,
              `**Threats Detected:** ${result.metrics.threatsDetected}`,
              `**Detection Rate:** ${result.metrics.detectionRate.toFixed(1)}%`,
              `**Duration:** ${result.metrics.duration}s`
            ].join('\n'),
            inline: true
          },
          {
            name: '🛡️ Actions Performed',
            value: actionsText,
            inline: true
          },
          {
            name: '⚡ Response Time',
            value: [
              `**Average:** ${result.metrics.responseTime.average.toFixed(0)}ms`,
              `**Min:** ${result.metrics.responseTime.min === Infinity ? 'N/A' : result.metrics.responseTime.min.toFixed(0) + 'ms'}`,
              `**Max:** ${result.metrics.responseTime.max.toFixed(0)}ms`
            ].join('\n'),
            inline: true
          },
          {
            name: '💻 System Health',
            value: [
              `**Memory Usage:** ${result.metrics.systemHealth.memoryUsage}MB`,
              `**Circuit Breaker:** ${result.metrics.systemHealth.circuitBreakerTripped ? '🔴 Tripped' : '🟢 Normal'}`,
              `**Failovers:** ${result.metrics.systemHealth.failoversTriggered}`
            ].join('\n'),
            inline: true
          }
        ]);

      if (result.recommendations.length > 0) {
        resultsEmbed.addFields({
          name: '💡 Recommendations',
          value: result.recommendations.slice(0, 5).map(r => `• ${r}`).join('\n'),
          inline: false
        });
      }

      if (result.metrics.errors.length > 0) {
        resultsEmbed.addFields({
          name: '❌ Errors',
          value: result.metrics.errors.slice(0, 3).map(e => `• ${e}`).join('\n'),
          inline: false
        });
      }

      if (result.metrics.warnings.length > 0) {
        resultsEmbed.addFields({
          name: '⚠️ Warnings',
          value: result.metrics.warnings.slice(0, 3).map(w => `• ${w}`).join('\n'),
          inline: false
        });
      }

      resultsEmbed.addFields({
        name: '📈 Performance Report',
        value: result.performanceReport.substring(0, 500) + (result.performanceReport.length > 500 ? '...' : ''),
        inline: false
      });

      resultsEmbed.setFooter({ 
        text: `Simulation ID: ${result.metrics.startTime.getTime()} • Run by ${interaction.user.tag}` 
      });
      resultsEmbed.setTimestamp();

      await interaction.editReply({ embeds: [resultsEmbed] });

      await storage.createCommandLog({
        commandName: 'simulate',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: { scenario: scenarioKey, intensity, duration },
        result: `Simulation completed: ${result.metrics.eventsGenerated} events, ${result.metrics.threatsDetected} detected (${result.metrics.detectionRate.toFixed(1)}%)`,
        success: result.metrics.successful,
        duration: Date.now() - startTime,
        metadata: { 
          metrics: result.metrics,
          recommendations: result.recommendations
        }
      });

    } catch (error) {
      console.error('Error in simulate command:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Simulation Failed')
        .setDescription(`An error occurred during the simulation`)
        .setColor(0xED4245)
        .addFields([
          { name: 'Error', value: errorMessage, inline: false },
          { name: 'Tip', value: 'Try reducing the intensity or duration, or contact an administrator', inline: false }
        ])
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      await storage.createCommandLog({
        commandName: 'simulate',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: { 
          scenario: interaction.options.getString('scenario'),
          intensity: interaction.options.getString('intensity'),
          duration: interaction.options.getInteger('duration')
        },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
