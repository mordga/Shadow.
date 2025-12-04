import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { storage } from '../../storage';

export const rhelpCommand = {
  data: new SlashCommandBuilder()
    .setName('rhelp')
    .setDescription('Comprehensive help system for bot commands')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('Specific command to get help for')
        .addChoices(
          { name: 'quarantine', value: 'quarantine' },
          { name: 'reputation', value: 'reputation' },
          { name: 'scan', value: 'scan' },
          { name: 'stats', value: 'stats' },
          { name: 'status', value: 'status' },
          { name: 'trace', value: 'trace' },
          { name: 'roles', value: 'roles' },
          { name: 'say', value: 'say' },
          { name: 'slowmode', value: 'slowmode' },
          { name: 'restore', value: 'restore' }
        )
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    
    try {
      const command = interaction.options.getString('command');
      const serverId = interaction.guildId || 'DM';
      const serverName = interaction.guild?.name || 'Direct Message';

      if (command) {
        const commandHelp: Record<string, { title: string; description: string; usage: string; examples: string; permissions?: string }> = {
          quarantine: {
            title: '🚨 Quarantine Command',
            description: 'Manage user quarantine for suspicious behavior. Temporarily restrict a user\'s permissions while monitoring their activity.',
            usage: '`/quarantine add <user> [reason] [hours]` - Quarantine a user\n`/quarantine release <user>` - Release a user from quarantine\n`/quarantine list` - List all quarantined users',
            examples: '• `/quarantine add @BadUser reason:Spam hours:24`\n• `/quarantine release @BadUser`\n• `/quarantine list`',
            permissions: 'Requires: Manage Members'
          },
          reputation: {
            title: '📊 Reputation Command',
            description: 'Check user reputation and behavior score. View detailed information about a user\'s trust level, violations, and activity history.',
            usage: '`/reputation <user>` - Check reputation for a specific user',
            examples: '• `/reputation @User`\n• Check violations, positive actions, and trust level\n• View recent threats and quarantine history',
            permissions: 'Available to all users'
          },
          scan: {
            title: '🔍 Scan Command',
            description: 'Scan server for security threats and suspicious activity. Detects new accounts, suspicious usernames, low reputation users, and dangerous permissions.',
            usage: '`/scan [type]` - Perform a security scan\n\n**Scan Types:**\n• `full` - Complete scan of members and channels\n• `quick` - Fast scan of critical threats\n• `members` - Scan members only\n• `channels` - Scan channels only',
            examples: '• `/scan type:full` - Complete security scan\n• `/scan type:quick` - Quick scan for immediate threats\n• `/scan type:members` - Check all members',
            permissions: 'Requires: Manage Server'
          },
          stats: {
            title: '📊 Stats Command',
            description: 'Show detailed server and bot statistics including bot performance, server metrics, and security statistics.',
            usage: '`/stats [type]` - Display statistics\n\n**Stat Types:**\n• `bot` - Bot performance stats\n• `server` - Server metrics\n• `security` - Security statistics\n• `all` - All statistics',
            examples: '• `/stats type:all` - Show all statistics\n• `/stats type:bot` - Bot performance only\n• `/stats type:security` - Security metrics',
            permissions: 'Available to all users'
          },
          status: {
            title: '🟢 Status Command',
            description: 'Show comprehensive bot activity and system status including health metrics, protection modules, and recent activity.',
            usage: '`/status` - Display current system status',
            examples: '• `/status` - View complete system status\n• Check CPU/RAM usage\n• View protection modules status\n• See recent command activity',
            permissions: 'Available to all users'
          },
          trace: {
            title: '🔍 Trace Command',
            description: 'View command execution trace for sensitive commands. Track who executed commands, when, and what the results were.',
            usage: '`/trace [command_id]` - Trace a specific command\n`/trace [limit]` - Show recent command traces',
            examples: '• `/trace limit:10` - Show 10 recent commands\n• `/trace command_id:abc123` - Trace specific command\n• View execution details and metadata',
            permissions: 'Requires: Manage Server'
          },
          roles: {
            title: '🎭 Roles Command',
            description: 'Manage security roles and permissions. Create, delete, assign, and remove roles from users.',
            usage: '`/roles create <name> [color] [mentionable]` - Create a role\n`/roles delete <role>` - Delete a role\n`/roles list` - List all roles\n`/roles assign <user> <role>` - Assign role to user\n`/roles remove <user> <role>` - Remove role from user',
            examples: '• `/roles create name:Moderator color:#ff0000`\n• `/roles assign user:@User role:@Moderator`\n• `/roles list` - View all roles',
            permissions: 'Requires: Manage Roles'
          },
          say: {
            title: '📢 Say Command',
            description: 'Send a custom message or embed to any channel. Useful for announcements and notifications.',
            usage: '`/say <channel> <message> [embed] [color]` - Send a message',
            examples: '• `/say channel:#general message:Hello!`\n• `/say channel:#announcements message:Important! embed:true color:#ff0000`',
            permissions: 'Requires: Manage Messages'
          },
          slowmode: {
            title: '⏱️ Slowmode Command',
            description: 'Configure slow mode for channels to limit message frequency and prevent spam.',
            usage: '`/slowmode <channel> <seconds>` - Set slowmode duration\n\n**Note:** Set seconds to 0 to disable slowmode',
            examples: '• `/slowmode channel:#general seconds:10` - 10 second slowmode\n• `/slowmode channel:#chat seconds:0` - Disable slowmode',
            permissions: 'Requires: Manage Channels'
          },
          restore: {
            title: '🔄 Restore Command',
            description: 'Advanced server restoration with templates and backups. (Feature in development)',
            usage: '`/restore [template_id]` - Restore from a template',
            examples: '• Coming soon: Server backup and restoration features',
            permissions: 'Requires: Administrator'
          }
        };

        const helpData = commandHelp[command];
        
        if (!helpData) {
          await interaction.reply('❌ Help information not found for this command');
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(helpData.title)
          .setDescription(helpData.description)
          .setColor(0x5865F2)
          .addFields([
            { name: '📝 Usage', value: helpData.usage, inline: false },
            { name: '💡 Examples', value: helpData.examples, inline: false }
          ])
          .setTimestamp();

        if (helpData.permissions) {
          embed.addFields({ name: '🔒 Permissions', value: helpData.permissions, inline: false });
        }

        await interaction.reply({ embeds: [embed] });

        await storage.createCommandLog({
          commandName: 'rhelp',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { command },
          result: `Help displayed for command: ${command}`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { command }
        });

      } else {
        const mainEmbed = new EmbedBuilder()
          .setTitle('🤖 Shadow Security Bot - Command Help')
          .setDescription('Comprehensive security and management bot for Discord servers')
          .setColor(0x5865F2)
          .addFields([
            {
              name: '🔒 Security Commands',
              value: '• `/quarantine` - Manage user quarantine\n• `/scan` - Scan for security threats\n• `/reputation` - Check user reputation',
              inline: false
            },
            {
              name: '📊 Monitoring Commands',
              value: '• `/stats` - View statistics\n• `/status` - System status\n• `/trace` - Command execution trace',
              inline: false
            },
            {
              name: '⚙️ Management Commands',
              value: '• `/roles` - Manage roles\n• `/say` - Send messages\n• `/slowmode` - Configure slowmode',
              inline: false
            },
            {
              name: '🛠️ Utility Commands',
              value: '• `/restore` - Server restoration (coming soon)\n• `/rhelp <command>` - Get detailed help',
              inline: false
            },
            {
              name: '💡 Getting Started',
              value: 'Use `/rhelp <command>` to get detailed information about a specific command.\n\nExample: `/rhelp quarantine`',
              inline: false
            }
          ])
          .setFooter({ text: 'Use /rhelp <command> for detailed help on each command' })
          .setTimestamp();

        await interaction.reply({ embeds: [mainEmbed] });

        await storage.createCommandLog({
          commandName: 'rhelp',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: {},
          result: 'Main help menu displayed',
          success: true,
          duration: Date.now() - startTime,
          metadata: { type: 'main_menu' }
        });
      }

    } catch (error) {
      console.error('Error in rhelp command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.reply({
        content: `❌ Error displaying help: ${errorMessage}`,
        ephemeral: true
      });

      await storage.createCommandLog({
        commandName: 'rhelp',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: interaction.guildId || 'DM',
        serverName: interaction.guild?.name || 'Direct Message',
        parameters: { command: interaction.options.getString('command') },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
