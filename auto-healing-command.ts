import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { getAutoHealing } from '../../services/auto-healing';

export const autoHealingCommand = {
  data: new SlashCommandBuilder()
    .setName('auto-healing')
    .setDescription('Gestionar el sistema de auto-reparación del bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Ver el estado del sistema de auto-reparación')
    )
    .addSubcommand(sub =>
      sub.setName('incidents')
        .setDescription('Ver incidentes activos detectados')
    )
    .addSubcommand(sub =>
      sub.setName('force')
        .setDescription('Forzar remediación de un módulo')
        .addStringOption(opt =>
          opt.setName('module')
            .setDescription('Nombre del módulo a reparar')
            .setRequired(true)
            .addChoices(
              { name: 'Discord Bot', value: 'Discord Bot' },
              { name: 'Security Engine', value: 'Security Engine' },
              { name: 'Recovery Engine', value: 'Recovery Engine' },
              { name: 'WebSocket Service', value: 'WebSocket Service' },
              { name: 'Storage Service', value: 'Storage Service' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('config')
        .setDescription('Configurar el sistema de auto-reparación')
        .addBooleanOption(opt =>
          opt.setName('enabled')
            .setDescription('Activar/desactivar auto-reparación')
        )
        .addIntegerOption(opt =>
          opt.setName('max_attempts')
            .setDescription('Máximo de intentos de reparación (1-10)')
            .setMinValue(1)
            .setMaxValue(10)
        )
        .addIntegerOption(opt =>
          opt.setName('cooldown')
            .setDescription('Tiempo de espera entre intentos (segundos)')
            .setMinValue(10)
            .setMaxValue(300)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'status':
        await showStatus(interaction);
        break;
      case 'incidents':
        await showIncidents(interaction);
        break;
      case 'force':
        await forceRemediation(interaction);
        break;
      case 'config':
        await updateConfig(interaction);
        break;
    }
  }
};

async function showStatus(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const autoHealing = getAutoHealing();
    const status = autoHealing.getStatus();

    const statusEmoji = status.running ? '🟢' : '🔴';
    const enabledEmoji = status.config.enabled ? '✅' : '❌';

    const embed = new EmbedBuilder()
      .setTitle('🔧 Sistema de Auto-Reparación')
      .setColor(status.running && status.config.enabled ? 0x00FF00 : 0xFF0000)
      .addFields(
        { name: 'Estado', value: `${statusEmoji} ${status.running ? 'Activo' : 'Inactivo'}`, inline: true },
        { name: 'Habilitado', value: `${enabledEmoji} ${status.config.enabled ? 'Sí' : 'No'}`, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '⚙️ Configuración', value: '\u200B', inline: false },
        { name: 'Max Intentos', value: `${status.config.maxRemediationAttempts}`, inline: true },
        { name: 'Cooldown', value: `${status.config.cooldownBetweenAttempts / 1000}s`, inline: true },
        { name: 'Umbral Escalación', value: `${status.config.escalationThreshold}`, inline: true },
        { name: '🔄 Handlers Registrados', value: status.registeredHandlers.length > 0 
          ? status.registeredHandlers.map(h => `\`${h}\``).join(', ')
          : 'Ninguno', inline: false },
        { name: '🔧 Restarters Registrados', value: status.registeredRestarters.length > 0
          ? status.registeredRestarters.map(r => `\`${r}\``).join(', ')
          : 'Ninguno', inline: false },
        { name: '🚨 Incidentes Activos', value: `${status.activeIncidents.length}`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - Auto-Healing System' });

    if (status.remediationStats.length > 0) {
      const statsText = status.remediationStats
        .filter(s => s.attempts > 0)
        .map(s => `• **${s.moduleName}**: ${s.attempts} intentos`)
        .join('\n');
      
      if (statsText) {
        embed.addFields({ name: '📊 Estadísticas de Remediación', value: statsText, inline: false });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[AutoHealingCommand] Error:', error);
    await interaction.editReply('❌ Error al obtener el estado del sistema de auto-reparación.');
  }
}

async function showIncidents(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const autoHealing = getAutoHealing();
    const status = autoHealing.getStatus();

    const embed = new EmbedBuilder()
      .setTitle('🚨 Incidentes Activos')
      .setColor(status.activeIncidents.length > 0 ? 0xFF6600 : 0x00FF00)
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - Auto-Healing System' });

    if (status.activeIncidents.length === 0) {
      embed.setDescription('✅ No hay incidentes activos en este momento.');
    } else {
      for (const incident of status.activeIncidents) {
        const severityEmoji: Record<string, string> = {
          'minor': '🟡',
          'moderate': '🟠',
          'major': '🔴',
          'critical': '🚨'
        };

        embed.addFields({
          name: `${severityEmoji[incident.severity] || '⚠️'} ${incident.id}`,
          value: [
            `**Severidad:** ${incident.severity.toUpperCase()}`,
            `**Módulos afectados:** ${incident.modules.join(', ')}`,
            `**Inicio:** <t:${Math.floor(incident.startTime.getTime() / 1000)}:R>`,
            `**Intentos de reparación:** ${incident.remediationAttempts}`,
            incident.rootCause ? `**Causa raíz:** ${incident.rootCause}` : ''
          ].filter(Boolean).join('\n'),
          inline: false
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[AutoHealingCommand] Error:', error);
    await interaction.editReply('❌ Error al obtener los incidentes.');
  }
}

async function forceRemediation(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const moduleName = interaction.options.getString('module', true);
    const autoHealing = getAutoHealing();

    const result = await autoHealing.forceRemediation(moduleName);

    const embed = new EmbedBuilder()
      .setTitle('🔧 Remediación Forzada')
      .setColor(result?.success ? 0x00FF00 : 0xFF0000)
      .addFields(
        { name: 'Módulo', value: moduleName, inline: true },
        { name: 'Resultado', value: result?.success ? '✅ Iniciada' : '❌ Fallida', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - Auto-Healing System' });

    if (result?.message) {
      embed.addFields({ name: 'Mensaje', value: result.message, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[AutoHealingCommand] Error:', error);
    await interaction.editReply('❌ Error al forzar la remediación.');
  }
}

async function updateConfig(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const autoHealing = getAutoHealing();
    const updates: Record<string, any> = {};

    const enabled = interaction.options.getBoolean('enabled');
    const maxAttempts = interaction.options.getInteger('max_attempts');
    const cooldown = interaction.options.getInteger('cooldown');

    if (enabled !== null) updates.enabled = enabled;
    if (maxAttempts !== null) updates.maxRemediationAttempts = maxAttempts;
    if (cooldown !== null) updates.cooldownBetweenAttempts = cooldown * 1000;

    if (Object.keys(updates).length === 0) {
      await interaction.editReply('⚠️ No se proporcionaron cambios de configuración.');
      return;
    }

    autoHealing.updateConfig(updates);
    const newStatus = autoHealing.getStatus();

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Configuración Actualizada')
      .setColor(0x00FF00)
      .addFields(
        { name: 'Habilitado', value: newStatus.config.enabled ? '✅ Sí' : '❌ No', inline: true },
        { name: 'Max Intentos', value: `${newStatus.config.maxRemediationAttempts}`, inline: true },
        { name: 'Cooldown', value: `${newStatus.config.cooldownBetweenAttempts / 1000}s`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'SecureBot Pro - Auto-Healing System' });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[AutoHealingCommand] Error:', error);
    await interaction.editReply('❌ Error al actualizar la configuración.');
  }
}
