import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { getMLSecurityEngine } from '../../services/ml-security-engine';

export const mlSecurityCommand = {
  data: new SlashCommandBuilder()
    .setName('ml-security')
    .setDescription('Motor de seguridad con aprendizaje automático')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Ver el estado del motor de ML')
    )
    .addSubcommand(sub =>
      sub.setName('metrics')
        .setDescription('Ver métricas de aprendizaje')
    )
    .addSubcommand(sub =>
      sub.setName('models')
        .setDescription('Ver los modelos de detección de amenazas')
    )
    .addSubcommand(sub =>
      sub.setName('predict')
        .setDescription('Predecir amenaza de un usuario')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Usuario a analizar')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('Mensaje de ejemplo para analizar')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('risk')
        .setDescription('Evaluar perfil de riesgo de un usuario')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Usuario a evaluar')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('learn')
        .setDescription('Forzar un ciclo de aprendizaje')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'status':
        await showStatus(interaction);
        break;
      case 'metrics':
        await showMetrics(interaction);
        break;
      case 'models':
        await showModels(interaction);
        break;
      case 'predict':
        await predictThreat(interaction);
        break;
      case 'risk':
        await assessRisk(interaction);
        break;
      case 'learn':
        await runLearning(interaction);
        break;
    }
  }
};

async function showStatus(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const mlEngine = getMLSecurityEngine();
    const health = await mlEngine.healthCheck();

    const statusEmoji: Record<string, string> = {
      'healthy': '🟢',
      'degraded': '🟡',
      'unhealthy': '🔴'
    };

    const embed = new EmbedBuilder()
      .setTitle('🧠 Motor de Seguridad ML')
      .setColor(health.status === 'healthy' ? 0x00FF00 : health.status === 'degraded' ? 0xFFFF00 : 0xFF0000)
      .addFields(
        { name: 'Estado', value: `${statusEmoji[health.status]} ${health.status.toUpperCase()}`, inline: true },
        { name: 'Modelos Cargados', value: `${health.modelsLoaded}`, inline: true },
        { name: 'Versión', value: health.metrics.modelVersion, inline: true },
        { name: 'Caché de Características', value: `${health.cacheSize} usuarios`, inline: true },
        { name: 'Perfiles Rastreados', value: `${health.profilesTracked}`, inline: true },
        { name: 'Muestras Analizadas', value: `${health.metrics.totalSamples}`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - ML Security Engine' });

    if (health.metrics.lastTrainingTime) {
      embed.addFields({
        name: 'Último Entrenamiento',
        value: `<t:${Math.floor(new Date(health.metrics.lastTrainingTime).getTime() / 1000)}:R>`,
        inline: true
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[MLSecurityCommand] Error:', error);
    await interaction.editReply('❌ Error al obtener el estado del motor ML.');
  }
}

async function showMetrics(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const mlEngine = getMLSecurityEngine();
    const metrics = mlEngine.getMetrics();

    const embed = new EmbedBuilder()
      .setTitle('📊 Métricas de Aprendizaje ML')
      .setColor(0x3498DB)
      .addFields(
        { name: 'Total de Muestras', value: `${metrics.totalSamples}`, inline: true },
        { name: 'Versión del Modelo', value: metrics.modelVersion, inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - ML Security Engine' });

    if (Object.keys(metrics.threatDistribution).length > 0) {
      const distributionText = Object.entries(metrics.threatDistribution)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `• **${type}**: ${count}`)
        .join('\n');
      
      embed.addFields({ 
        name: '📈 Distribución de Amenazas', 
        value: distributionText || 'Sin datos', 
        inline: false 
      });
    }

    if (metrics.lastTrainingTime) {
      embed.addFields({
        name: '🕐 Último Entrenamiento',
        value: `<t:${Math.floor(new Date(metrics.lastTrainingTime).getTime() / 1000)}:F>`,
        inline: false
      });
    }

    embed.addFields(
      { name: 'Tasa de Falsos Positivos', value: `${(metrics.falsePositiveRate * 100).toFixed(2)}%`, inline: true },
      { name: 'Tasa de Falsos Negativos', value: `${(metrics.falseNegativeRate * 100).toFixed(2)}%`, inline: true }
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[MLSecurityCommand] Error:', error);
    await interaction.editReply('❌ Error al obtener las métricas.');
  }
}

async function showModels(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const mlEngine = getMLSecurityEngine();
    const models = await mlEngine.exportModels();

    const embed = new EmbedBuilder()
      .setTitle('🎯 Modelos de Detección de Amenazas')
      .setColor(0x9B59B6)
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - ML Security Engine' });

    for (const [type, model] of Object.entries(models)) {
      const topFeatures = model.features
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
        .slice(0, 5)
        .map(f => `\`${f.name}\` (${f.weight > 0 ? '+' : ''}${(f.weight * 100).toFixed(0)}%)`)
        .join('\n');

      embed.addFields({
        name: `📌 ${type.toUpperCase()}`,
        value: [
          `**Umbral base:** ${(model.baseThreshold * 100).toFixed(0)}%`,
          `**Confianza mínima:** ${(model.minConfidence * 100).toFixed(0)}%`,
          `**Características principales:**`,
          topFeatures
        ].join('\n'),
        inline: true
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[MLSecurityCommand] Error:', error);
    await interaction.editReply('❌ Error al obtener los modelos.');
  }
}

async function predictThreat(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const user = interaction.options.getUser('user', true);
    const message = interaction.options.getString('message') || 'Mensaje de prueba para análisis';
    const serverId = interaction.guildId || 'unknown';

    const mlEngine = getMLSecurityEngine();
    
    const features = await mlEngine.extractFeatures(
      user.id,
      serverId,
      message,
      {
        accountAge: Math.floor((Date.now() - user.createdTimestamp) / (24 * 60 * 60 * 1000)),
        isNewMember: false
      }
    );

    const predictions = await mlEngine.predictThreat(features);

    const embed = new EmbedBuilder()
      .setTitle(`🔮 Predicción de Amenaza: ${user.username}`)
      .setColor(predictions.length > 0 && predictions[0].probability > 0.7 ? 0xFF0000 : 0x00FF00)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Usuario', value: `<@${user.id}>`, inline: true },
        { name: 'Violaciones Previas', value: `${features.previousViolations}`, inline: true },
        { name: 'Puntuación Reputación', value: `${features.reputationScore}`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - ML Security Engine' });

    if (predictions.length === 0) {
      embed.addFields({
        name: '✅ Resultado',
        value: 'No se detectaron amenazas potenciales',
        inline: false
      });
    } else {
      for (const pred of predictions.slice(0, 3)) {
        const actionEmoji: Record<string, string> = {
          'monitor': '👁️',
          'warn': '⚠️',
          'restrict': '🔒',
          'ban': '🚫'
        };

        embed.addFields({
          name: `${actionEmoji[pred.suggestedAction] || '⚠️'} ${pred.predictedThreatType.toUpperCase()}`,
          value: [
            `**Probabilidad:** ${(pred.probability * 100).toFixed(1)}%`,
            `**Puntuación de Riesgo:** ${pred.riskScore}/100`,
            `**Confianza:** ${(pred.confidence * 100).toFixed(1)}%`,
            `**Acción Sugerida:** ${pred.suggestedAction}`,
            pred.reasoning.length > 0 ? `**Factores:** ${pred.reasoning.slice(0, 3).join(', ')}` : ''
          ].filter(Boolean).join('\n'),
          inline: false
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[MLSecurityCommand] Error:', error);
    await interaction.editReply('❌ Error al predecir amenaza.');
  }
}

async function assessRisk(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const user = interaction.options.getUser('user', true);
    const serverId = interaction.guildId || 'unknown';

    const mlEngine = getMLSecurityEngine();
    const profile = await mlEngine.assessUserRisk(user.id, serverId);

    const riskColor = profile.overallRiskScore >= 70 ? 0xFF0000 :
                      profile.overallRiskScore >= 40 ? 0xFFFF00 : 0x00FF00;

    const trendEmoji: Record<string, string> = {
      'increasing': '📈',
      'stable': '➡️',
      'decreasing': '📉'
    };

    const embed = new EmbedBuilder()
      .setTitle(`📊 Perfil de Riesgo: ${user.username}`)
      .setColor(riskColor)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Puntuación de Riesgo', value: `**${profile.overallRiskScore}/100**`, inline: true },
        { name: 'Tendencia', value: `${trendEmoji[profile.riskTrend]} ${profile.riskTrend}`, inline: true },
        { name: 'Precisión del Modelo', value: `${(profile.predictionAccuracy * 100).toFixed(0)}%`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - ML Security Engine' });

    if (profile.behaviorPatterns.length > 0) {
      const patternEmoji: Record<string, string> = {
        'repeat_offender': '🔄',
        'spam_prone': '📨',
        'bypass_attempts': '🔓',
        'critical_threat_history': '🚨'
      };

      const patternsText = profile.behaviorPatterns
        .map(p => `${patternEmoji[p] || '•'} ${p.replace(/_/g, ' ')}`)
        .join('\n');

      embed.addFields({
        name: '🔍 Patrones de Comportamiento',
        value: patternsText,
        inline: false
      });
    }

    if (profile.threatHistory.length > 0) {
      const historyText = profile.threatHistory
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(h => `• **${h.type}**: ${h.count}x (severidad avg: ${h.avgSeverity.toFixed(1)})`)
        .join('\n');

      embed.addFields({
        name: '📜 Historial de Amenazas',
        value: historyText || 'Sin historial',
        inline: false
      });
    }

    embed.addFields({
      name: 'Última Evaluación',
      value: `<t:${Math.floor(profile.lastAssessment.getTime() / 1000)}:R>`,
      inline: true
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[MLSecurityCommand] Error:', error);
    await interaction.editReply('❌ Error al evaluar el perfil de riesgo.');
  }
}

async function runLearning(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const mlEngine = getMLSecurityEngine();
    
    const embed = new EmbedBuilder()
      .setTitle('🧠 Ciclo de Aprendizaje')
      .setColor(0x3498DB)
      .setDescription('Iniciando ciclo de aprendizaje... Esto puede tomar unos segundos.')
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - ML Security Engine' });

    await interaction.editReply({ embeds: [embed] });

    await mlEngine.runLearningCycle();

    const metrics = mlEngine.getMetrics();

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Ciclo de Aprendizaje Completado')
      .setColor(0x00FF00)
      .addFields(
        { name: 'Muestras Analizadas', value: `${metrics.totalSamples}`, inline: true },
        { name: 'Versión del Modelo', value: metrics.modelVersion, inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - ML Security Engine' });

    if (Object.keys(metrics.threatDistribution).length > 0) {
      const topThreats = Object.entries(metrics.threatDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => `• ${type}: ${count}`)
        .join('\n');

      successEmbed.addFields({
        name: 'Top Amenazas Detectadas',
        value: topThreats || 'Sin datos',
        inline: false
      });
    }

    await interaction.editReply({ embeds: [successEmbed] });
  } catch (error) {
    console.error('[MLSecurityCommand] Error:', error);
    await interaction.editReply('❌ Error al ejecutar el ciclo de aprendizaje.');
  }
}
