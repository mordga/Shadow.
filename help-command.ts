import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { storage } from '../../storage';

const commandCategories = [
  {
    id: 'security',
    name: '🔒 Seguridad',
    emoji: '🔒',
    description: 'Comandos de protección avanzada',
    commands: [
      { cmd: 'quarantine', desc: 'Aislar usuarios sospechosos' },
      { cmd: 'scan', desc: 'Escanear amenazas en el servidor' },
      { cmd: 'automod', desc: 'Configurar moderación automática' },
      { cmd: 'blacklist', desc: 'Lista negra de usuarios/palabras' },
      { cmd: 'whitelist', desc: 'Lista blanca de usuarios confiables' },
      { cmd: 'config', desc: 'Configuración de seguridad' },
      { cmd: 'ai-analyze', desc: 'Análisis con IA de mensajes' },
      { cmd: 'threat-predict', desc: 'Predicción de amenazas' },
      { cmd: 'forensics', desc: 'Análisis forense de usuarios' },
      { cmd: 'honeypot', desc: 'Trampas para detectar raiders' },
      { cmd: 'sentinel', desc: 'Vigilancia automática' },
      { cmd: 'deepban', desc: 'Baneo profundo anti-evasión' },
      { cmd: 'firewall', desc: 'Firewall inteligente' },
      { cmd: 'nuke-shield', desc: 'Escudo anti-nuke' },
      { cmd: 'predator-mode', desc: 'Modo cazador de amenazas' },
      { cmd: 'aggressiveness', desc: 'Nivel de agresividad del bot' },
      { cmd: 'threat-intel', desc: 'Inteligencia de amenazas' },
      { cmd: 'behavior-profile', desc: 'Perfil de comportamiento' },
      { cmd: 'stealth-audit', desc: 'Auditoría silenciosa' },
      { cmd: 'quantum-foresight', desc: 'Predicción cuántica' },
      { cmd: 'neural-intent', desc: 'Detección de intenciones' },
      { cmd: 'collective-defense', desc: 'Defensa colectiva' },
    ]
  },
  {
    id: 'defense',
    name: '🛡️ Defensa',
    emoji: '🛡️',
    description: 'Sistemas de defensa del servidor',
    commands: [
      { cmd: 'protect', desc: 'Activar protección del servidor' },
      { cmd: 'defensestatus', desc: 'Ver estado de defensas' },
      { cmd: 'defenserestore', desc: 'Restaurar todas las defensas' },
      { cmd: 'antinuke', desc: 'Protección anti-nuke' },
      { cmd: 'antiraid', desc: 'Protección anti-raid' },
      { cmd: 'antispam', desc: 'Protección anti-spam' },
      { cmd: 'raid-defense', desc: 'Defensa contra raids' },
    ]
  },
  {
    id: 'moderation',
    name: '⚖️ Moderación',
    emoji: '⚖️',
    description: 'Herramientas de moderación',
    commands: [
      { cmd: 'kick', desc: 'Expulsar a un usuario' },
      { cmd: 'ban', desc: 'Banear a un usuario' },
      { cmd: 'unban', desc: 'Desbanear a un usuario' },
      { cmd: 'mute', desc: 'Silenciar a un usuario' },
      { cmd: 'unmute', desc: 'Quitar silencio a un usuario' },
      { cmd: 'warn', desc: 'Advertir a un usuario' },
      { cmd: 'lockdown', desc: 'Bloqueo de emergencia' },
      { cmd: 'unlock', desc: 'Desbloquear canal' },
      { cmd: 'lockserver', desc: 'Bloquear todo el servidor' },
      { cmd: 'purge', desc: 'Borrar mensajes masivamente' },
      { cmd: 'purge-channels', desc: 'Borrar canales por patrón' },
      { cmd: 'massban', desc: 'Baneo masivo de usuarios' },
      { cmd: 'auto-purge', desc: 'Purga automática programada' },
    ]
  },
  {
    id: 'monitoring',
    name: '📊 Monitoreo',
    emoji: '📊',
    description: 'Vigilancia y estadísticas',
    commands: [
      { cmd: 'stats', desc: 'Ver estadísticas del bot' },
      { cmd: 'status', desc: 'Estado del sistema' },
      { cmd: 'trace', desc: 'Rastrear ejecución de comandos' },
      { cmd: 'reputation', desc: 'Ver reputación de usuario' },
      { cmd: 'audit', desc: 'Auditoría de acciones' },
      { cmd: 'health', desc: 'Salud del sistema' },
      { cmd: 'deletions', desc: 'Ver mensajes eliminados' },
      { cmd: 'analytics', desc: 'Análisis detallado' },
      { cmd: 'inspect', desc: 'Inspeccionar usuario/canal' },
      { cmd: 'report', desc: 'Generar reporte' },
      { cmd: 'auto-healing', desc: 'Auto-reparación del sistema' },
      { cmd: 'ml-security', desc: 'Seguridad con Machine Learning' },
    ]
  },
  {
    id: 'management',
    name: '⚙️ Gestión',
    emoji: '⚙️',
    description: 'Administración del servidor',
    commands: [
      { cmd: 'roles', desc: 'Gestionar roles' },
      { cmd: 'slowmode', desc: 'Configurar modo lento' },
      { cmd: 'say', desc: 'Enviar mensaje como el bot' },
      { cmd: 'authorize-invite', desc: 'Autorizar invitaciones' },
      { cmd: 'backup', desc: 'Backup del servidor' },
      { cmd: 'highroles', desc: 'Gestionar roles altos' },
    ]
  },
  {
    id: 'utility',
    name: '🛠️ Utilidades',
    emoji: '🛠️',
    description: 'Comandos de utilidad',
    commands: [
      { cmd: 'help', desc: 'Mostrar esta ayuda' },
      { cmd: 'rhelp', desc: 'Ayuda detallada de comando' },
      { cmd: 'ping', desc: 'Ver latencia del bot' },
      { cmd: 'logs', desc: 'Ver logs del sistema' },
      { cmd: 'settings', desc: 'Configuración del bot' },
      { cmd: 'simulate', desc: 'Simular ataques (testing)' },
      { cmd: 'export', desc: 'Exportar datos' },
      { cmd: 'restore', desc: 'Restaurar servidor' },
      { cmd: 'shadow-mode', desc: 'Modo sigiloso' },
    ]
  }
];

export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📚 Muestra todos los comandos disponibles'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      const createMainEmbed = () => {
        const totalCommands = commandCategories.reduce((acc, cat) => acc + cat.commands.length, 0);
        return new EmbedBuilder()
          .setTitle('🤖 CortexGuard - Centro de Ayuda')
          .setDescription(
            `¡Bienvenido al sistema de ayuda interactivo!\n\n` +
            `**📌 Total de comandos:** \`${totalCommands}\`\n` +
            `**🔧 Categorías:** \`${commandCategories.length}\`\n\n` +
            `Selecciona una categoría con los botones de abajo:`
          )
          .setColor(0x5865F2)
          .addFields(
            commandCategories.map(cat => ({
              name: `${cat.emoji} ${cat.name}`,
              value: `${cat.description}\n\`${cat.commands.length} comandos\``,
              inline: true
            }))
          )
          .setFooter({ text: '💡 Usa /rhelp <comando> para más detalles' })
          .setTimestamp();
      };

      const createCategoryEmbed = (categoryId: string) => {
        const category = commandCategories.find(c => c.id === categoryId);
        if (!category) return createMainEmbed();

        const commandList = category.commands
          .map(c => `\`/${c.cmd}\` → ${c.desc}`)
          .join('\n');

        return new EmbedBuilder()
          .setTitle(`${category.emoji} ${category.name}`)
          .setDescription(
            `${category.description}\n\n` +
            `**Comandos disponibles:**\n${commandList}`
          )
          .setColor(0x5865F2)
          .setFooter({ text: '🏠 Presiona "Menú Principal" para volver | 💡 Usa /rhelp <comando> para más detalles' })
          .setTimestamp();
      };

      const createButtons = (showHome: boolean = false) => {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        
        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('help_security')
            .setLabel('Seguridad')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('help_defense')
            .setLabel('Defensa')
            .setEmoji('🛡️')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('help_moderation')
            .setLabel('Moderación')
            .setEmoji('⚖️')
            .setStyle(ButtonStyle.Primary)
        );

        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('help_monitoring')
            .setLabel('Monitoreo')
            .setEmoji('📊')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('help_management')
            .setLabel('Gestión')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('help_utility')
            .setLabel('Utilidades')
            .setEmoji('🛠️')
            .setStyle(ButtonStyle.Secondary)
        );

        const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('help_home')
            .setLabel('Menú Principal')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!showHome)
        );

        rows.push(row1, row2, row3);
        return rows;
      };

      const response = await interaction.reply({
        embeds: [createMainEmbed()],
        components: createButtons(false),
        fetchReply: true
      });

      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000
      });

      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: '❌ Solo quien usó el comando puede interactuar.', ephemeral: true });
          return;
        }

        const action = i.customId.replace('help_', '');

        if (action === 'home') {
          await i.update({
            embeds: [createMainEmbed()],
            components: createButtons(false)
          });
        } else {
          await i.update({
            embeds: [createCategoryEmbed(action)],
            components: createButtons(true)
          });
        }
      });

      collector.on('end', async () => {
        try {
          await interaction.editReply({
            components: []
          });
        } catch {}
      });

      await storage.createCommandLog({
        commandName: 'help',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId,
        serverName,
        parameters: {},
        result: 'Interactive help displayed',
        success: true,
        duration: Date.now() - startTime,
        metadata: { interactive: true }
      });

    } catch (error) {
      console.error('Error in help command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (!interaction.replied) {
        await interaction.reply({
          content: `❌ Error mostrando ayuda: ${errorMessage}`,
          ephemeral: true
        });
      }
    }
  }
};
