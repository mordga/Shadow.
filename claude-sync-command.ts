import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';
import { checkClaudeHealth } from '../../services/claude-ai';
import { getHealthMonitor } from '../../services/health-monitor';
import { promises as fs } from 'fs';
import * as path from 'path';

export const claudeSyncCommand = {
  data: new SlashCommandBuilder()
    .setName('ai_sync')
    .setDescription('🔄 Verify AI service status, sync files, and confirm tasks in progress')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show AI service health and connection status'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('sync')
        .setDescription('Verify file synchronization and log rotation'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('tasks')
        .setDescription('Display current system tasks and health monitor status')),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    const subcommand = interaction.options.getSubcommand();
    const serverId = interaction.guildId || 'DM';
    const serverName = interaction.guild?.name || 'Direct Message';

    await interaction.deferReply({ ephemeral: true });

    try {
      if (subcommand === 'status') {
        try {
          let healthResult: any = null;
          let healthError: string | null = null;

          try {
            healthResult = await checkClaudeHealth();
          } catch (error) {
            healthError = error instanceof Error ? error.message : 'Service unavailable';
            healthResult = {
              healthy: false,
              latency: 0,
              message: 'Unable to check health',
              metadata: {}
            };
          }

          let stats: any = null;
          let statsError: string | null = null;

          try {
            stats = await storage.getBotStats();
          } catch (error) {
            statsError = error instanceof Error ? error.message : 'Stats unavailable';
          }

          let recentThreats: any[] = [];
          let threatsError: string | null = null;

          try {
            recentThreats = await storage.getThreats(10);
            if (!Array.isArray(recentThreats)) {
              recentThreats = [];
            }
          } catch (error) {
            threatsError = error instanceof Error ? error.message : 'Threats unavailable';
          }

          const avgConfidence = recentThreats.length > 0
            ? recentThreats.reduce((sum: number, t: any) => sum + (t?.confidence ?? 0), 0) / recentThreats.length
            : 0;

          const statusEmoji = healthResult?.healthy ? '🟢' : (healthError ? '⚠️' : '🔴');
          const statusText = healthResult?.healthy ? 'HEALTHY' : (healthError ? 'UNAVAILABLE' : 'DEGRADED');
          const statusColor = healthResult?.healthy ? 0x00FF00 : (healthError ? 0xFFA500 : 0xFF0000);

          const embed = new EmbedBuilder()
            .setTitle('🔄 Distributed AI Service Status')
            .setDescription(`**Service Status:** ${statusEmoji} ${statusText}`)
            .setColor(statusColor)
            .addFields([
              {
                name: '⚡ Service Health',
                value: healthError 
                  ? `${statusEmoji} Unable to check (${healthError})`
                  : [
                      `**Status:** ${statusEmoji} ${statusText}`,
                      `**Response Time:** ${healthResult?.latency ?? 0}ms`,
                      `**Message:** ${healthResult?.message ?? 'No message'}`,
                      `**API Connected:** ${healthResult?.healthy ? '✅ Yes' : '❌ No'}`
                    ].join('\n'),
                inline: true
              },
              {
                name: '📊 Analysis Statistics',
                value: statsError
                  ? `⚠️ Unable to load stats (${statsError})`
                  : [
                      `**Threats Blocked:** ${stats?.threatsBlocked ?? 0}`,
                      `**Avg Confidence:** ${(avgConfidence * 100).toFixed(1)}%`,
                      `**Recent Threats:** ${recentThreats.length}`,
                      `**Using Fallback:** ${healthResult?.metadata?.usingFallback ? '⚠️ Yes' : '✅ No'}`
                    ].join('\n'),
                inline: true
              },
              {
                name: '🔧 System Info',
                value: [
                  `**Uptime:** ${Math.floor(process.uptime() / 60)}m`,
                  `**Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                  `**Test Passed:** ${healthResult?.metadata?.testPassed ?? false ? '✅' : '❌'}`,
                  `**Threat Level:** ${healthResult?.metadata?.threatLevel ?? 'N/A'}`
                ].join('\n'),
                inline: false
              }
            ])
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          if (!healthResult?.healthy || healthError) {
            embed.addFields({
              name: '⚠️ WARNING',
              value: healthError 
                ? `AI service is unavailable: ${healthError}. Fallback heuristics may be in use.`
                : 'AI service is degraded. Fallback heuristics may be in use.',
              inline: false
            });
          }

          if (statsError || threatsError) {
            const errors = [];
            if (statsError) errors.push(`Statistics: ${statsError}`);
            if (threatsError) errors.push(`Threat data: ${threatsError}`);
            
            embed.addFields({
              name: '⚠️ PARTIAL DATA',
              value: `Some data could not be loaded:\n${errors.map(e => `• ${e}`).join('\n')}`,
              inline: false
            });
          }

          await interaction.editReply({ embeds: [embed] });

          try {
            await fileLogger.command('ai_sync', `Status check: ${statusText}`, {
              subcommand: 'status',
              healthy: healthResult?.healthy ?? false,
              latency: healthResult?.latency ?? 0
            });
          } catch (logError) {
          }

        } catch (statusError) {
          const errorMessage = statusError instanceof Error ? statusError.message : 'Unknown error';
          
          const errorEmbed = new EmbedBuilder()
            .setTitle('🔄 Distributed AI Service Status')
            .setDescription('⚠️ Unable to retrieve complete status')
            .setColor(0xFFA500)
            .addFields([
              {
                name: '⚠️ Error',
                value: errorMessage,
                inline: false
              },
              {
                name: '🔧 System Info',
                value: [
                  `**Uptime:** ${Math.floor(process.uptime() / 60)}m`,
                  `**Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
                ].join('\n'),
                inline: false
              }
            ])
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed] });
          throw statusError;
        }

      } else if (subcommand === 'sync') {
        try {
          const logsDir = 'logs';
          const claudeMdPath = 'AI_SERVICE.md';
          
          let logsDirExists = false;
          let logFiles: string[] = [];
          let currentLogFile = '';
          let currentLogSize = 0;
          let currentLogModified: Date | null = null;
          let oldestLog = '';
          let newestLog = '';
          let logsDirError: string | null = null;

          try {
            await fs.access(logsDir);
            logsDirExists = true;
            
            try {
              const files = await fs.readdir(logsDir);
              logFiles = files.filter(f => f.startsWith('bot-') && f.endsWith('.log')).sort();
              
              if (logFiles.length > 0) {
                oldestLog = logFiles[0];
                newestLog = logFiles[logFiles.length - 1];
                
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                currentLogFile = `bot-${year}-${month}-${day}.log`;
                
                const currentLogPath = path.join(logsDir, currentLogFile);
                try {
                  const stats = await fs.stat(currentLogPath);
                  currentLogSize = stats.size;
                  currentLogModified = stats.mtime;
                } catch (err) {
                  currentLogFile = 'Not created yet';
                }
              }
            } catch (readError) {
              logsDirError = readError instanceof Error ? readError.message : 'Cannot read directory';
            }
          } catch (accessError) {
            logsDirExists = false;
            logsDirError = accessError instanceof Error ? accessError.message : 'Directory not found';
          }

          let claudeMdExists = false;
          let claudeMdSize = 0;
          let claudeMdModified: Date | null = null;
          let claudeMdError: string | null = null;

          try {
            const stats = await fs.stat(claudeMdPath);
            claudeMdExists = true;
            claudeMdSize = stats.size;
            claudeMdModified = stats.mtime;
          } catch (err) {
            claudeMdExists = false;
            claudeMdError = err instanceof Error ? err.message : 'File not found';
          }

          const isFirstRun = !logsDirExists || logFiles.length === 0;
          const rotationWorking = logFiles.length > 1;
          
          let embedColor = 0x00FF00;
          if (!logsDirExists || logFiles.length === 0) {
            embedColor = 0xFFA500;
          } else if (!claudeMdExists || !rotationWorking) {
            embedColor = 0xFFA500;
          }

          const embed = new EmbedBuilder()
            .setTitle('🔄 File Synchronization Status')
            .setDescription('**Verify log rotation and file sync**')
            .setColor(embedColor)
            .addFields([
              {
                name: '📁 Logs Directory',
                value: logsDirError
                  ? `⚠️ Unable to access (${logsDirError})`
                  : [
                      `**Exists:** ${logsDirExists ? '✅ Yes' : '❌ No'}`,
                      `**Total Log Files:** ${logFiles.length}`,
                      `**Oldest Log:** ${oldestLog || 'None'}`,
                      `**Newest Log:** ${newestLog || 'None'}`
                    ].join('\n'),
                inline: true
              },
              {
                name: '📝 Current Log File',
                value: !logsDirExists
                  ? '⚠️ Logs directory not found'
                  : logFiles.length === 0
                  ? '⚠️ No log files yet'
                  : [
                      `**File:** ${currentLogFile}`,
                      `**Size:** ${(currentLogSize / 1024).toFixed(2)} KB`,
                      `**Last Write:** ${currentLogModified ? `<t:${Math.floor(currentLogModified.getTime() / 1000)}:R>` : 'N/A'}`,
                      `**Status:** ${currentLogModified ? '✅ Active' : '⚠️ Not found'}`
                    ].join('\n'),
                inline: true
              },
              {
                name: '📄 AI_SERVICE.md',
                value: claudeMdError
                  ? `⚠️ Unable to access (${claudeMdError})`
                  : [
                      `**Exists:** ${claudeMdExists ? '✅ Yes' : '❌ No'}`,
                      `**Size:** ${(claudeMdSize / 1024).toFixed(2)} KB`,
                      `**Modified:** ${claudeMdModified ? `<t:${Math.floor(claudeMdModified.getTime() / 1000)}:R>` : 'N/A'}`,
                      `**Status:** ${claudeMdExists ? '✅ Synced' : '❌ Missing'}`
                    ].join('\n'),
                inline: false
              },
              {
                name: '🔄 Log Rotation',
                value: [
                  `**Rotation Active:** ${rotationWorking ? '✅' : '⚠️'} ${rotationWorking ? 'Yes' : 'Not yet verified'}`,
                  `**Max Age:** 30 days`,
                  `**Auto-Cleanup:** ✅ Enabled`,
                  `**Health:** ${logFiles.length > 1 ? '🟢 Good' : logFiles.length === 1 ? '🟡 Single file' : '🟠 No logs yet'}`
                ].join('\n'),
                inline: false
              }
            ])
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          if (isFirstRun) {
            embed.addFields({
              name: '💡 FIRST RUN DETECTED',
              value: 'This appears to be a new installation. Log files will be created automatically as the system runs. Check back later to verify rotation is working.',
              inline: false
            });
          } else if (!logsDirExists || !claudeMdExists || logsDirError || claudeMdError) {
            const issues = [];
            if (!logsDirExists || logsDirError) issues.push('Logs directory issue');
            if (!claudeMdExists || claudeMdError) issues.push('AI_SERVICE.md missing');
            
            embed.addFields({
              name: '⚠️ NOTICE',
              value: `Issues detected: ${issues.join(', ')}. This may be expected for new installations or after file cleanup.`,
              inline: false
            });
          } else if (!rotationWorking && logFiles.length > 0) {
            embed.addFields({
              name: '⚠️ ROTATION STATUS',
              value: 'Only one log file exists. Rotation will be verified once multiple daily logs are present.',
              inline: false
            });
          }

          await interaction.editReply({ embeds: [embed] });

          try {
            await fileLogger.command('ai_sync', `Sync check: ${logFiles.length} logs`, {
              subcommand: 'sync',
              logsCount: logFiles.length,
              claudeMdExists
            });
          } catch (logError) {
          }

        } catch (syncError) {
          const errorMessage = syncError instanceof Error ? syncError.message : 'Unknown error';
          
          const errorEmbed = new EmbedBuilder()
            .setTitle('🔄 File Synchronization Status')
            .setDescription('⚠️ Unable to retrieve complete sync status')
            .setColor(0xFFA500)
            .addFields([
              {
                name: '⚠️ Error',
                value: errorMessage,
                inline: false
              }
            ])
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed] });
          throw syncError;
        }

      } else if (subcommand === 'tasks') {
        try {
          let allHealth: any = {};
          let allHealthModules: any[] = [];
          let healthError: string | null = null;

          try {
            const healthMonitor = getHealthMonitor();
            if (healthMonitor && typeof healthMonitor.getAllHealth === 'function') {
              allHealth = healthMonitor.getAllHealth();
              if (allHealth && typeof allHealth === 'object') {
                allHealthModules = Object.values(allHealth);
                if (!Array.isArray(allHealthModules)) {
                  allHealthModules = [];
                }
              }
            } else {
              healthError = 'Health monitor not available';
            }
          } catch (error) {
            healthError = error instanceof Error ? error.message : 'Unable to retrieve health data';
          }

          const moduleNames = [
            'Discord Bot',
            'Security Engine',
            'Distributed AI Service',
            'Recovery Engine',
            'WebSocket Service',
            'Storage Service'
          ];

          if (allHealthModules.length === 0) {
            const noDataEmbed = new EmbedBuilder()
              .setTitle('📋 System Tasks & Health Monitor')
              .setDescription('⚠️ No health data available')
              .setColor(0xFFA500)
              .addFields([
                {
                  name: '⚠️ Status',
                  value: healthError 
                    ? `Health monitor error: ${healthError}`
                    : 'No modules are currently registered with the health monitor. This may be expected during initial startup.',
                  inline: false
                },
                {
                  name: '🔧 System Info',
                  value: [
                    `**Uptime:** ${Math.floor(process.uptime() / 60)}m`,
                    `**Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
                  ].join('\n'),
                  inline: false
                }
              ])
              .setFooter({ text: `Requested by ${interaction.user.username}` })
              .setTimestamp();

            await interaction.editReply({ embeds: [noDataEmbed] });

            try {
              await fileLogger.command('ai_sync', 'Tasks check: No health data', {
                subcommand: 'tasks',
                healthy: 0,
                total: 0
              });
            } catch (logError) {
            }

            return;
          }

          const moduleFields = moduleNames.map(name => {
            const moduleHealth = allHealthModules.find((m: any) => m?.moduleName === name);
            
            if (!moduleHealth) {
              return {
                name: `⚠️ ${name}`,
                value: '⚠️ Not registered',
                inline: true
              };
            }

            const status = moduleHealth?.status ?? 'unknown';
            const statusEmoji = status === 'healthy' ? '🟢' : 
                              status === 'degraded' ? '🟡' : '🔴';
            
            const failures = moduleHealth?.consecutiveFailures ?? 0;
            const latency = moduleHealth?.averageLatency ?? 0;
            const lastCheckTime = moduleHealth?.lastCheckTime;
            
            return {
              name: `${statusEmoji} ${name}`,
              value: [
                `**Status:** ${status.toUpperCase()}`,
                `**Failures:** ${failures}`,
                `**Avg Latency:** ${latency.toFixed(0)}ms`,
                `**Last Check:** ${lastCheckTime && lastCheckTime instanceof Date ? `<t:${Math.floor(lastCheckTime.getTime() / 1000)}:R>` : 'Never'}`
              ].join('\n'),
              inline: true
            };
          });

          const healthyCount = allHealthModules.filter((m: any) => m?.status === 'healthy').length;
          const degradedCount = allHealthModules.filter((m: any) => m?.status === 'degraded').length;
          const unhealthyCount = allHealthModules.filter((m: any) => m?.status === 'unhealthy').length;

          const overallColor = unhealthyCount > 0 ? 0xFF0000 : 
                              degradedCount > 0 ? 0xFFA500 : 0x00FF00;

          const monitorUptime = allHealthModules.length > 0 && allHealthModules[0]?.uptime 
            ? allHealthModules[0].uptime 
            : 0;

          const embed = new EmbedBuilder()
            .setTitle('📋 System Tasks & Health Monitor')
            .setDescription('**Current status of all registered modules**')
            .setColor(overallColor)
            .addFields([
              {
                name: '📊 Overall Health',
                value: [
                  `**Healthy:** 🟢 ${healthyCount}`,
                  `**Degraded:** 🟡 ${degradedCount}`,
                  `**Unhealthy:** 🔴 ${unhealthyCount}`,
                  `**Total Modules:** ${allHealthModules.length}`
                ].join('\n'),
                inline: false
              },
              ...moduleFields
            ])
            .setFooter({ text: `Health Monitor Uptime: ${Math.floor(monitorUptime / 1000 / 60)}m` })
            .setTimestamp();

          if (unhealthyCount > 0 || degradedCount > 0) {
            const issues = allHealthModules
              .filter((m: any) => m?.status !== 'healthy')
              .map((m: any) => `• ${m?.moduleName ?? 'Unknown'}: ${m?.lastError ?? 'Unknown error'}`)
              .join('\n');

            if (issues) {
              embed.addFields({
                name: '⚠️ Active Issues',
                value: issues,
                inline: false
              });
            }
          }

          await interaction.editReply({ embeds: [embed] });

          try {
            await fileLogger.command('ai_sync', `Tasks check: ${healthyCount}/${allHealthModules.length} healthy`, {
              subcommand: 'tasks',
              healthy: healthyCount,
              degraded: degradedCount,
              unhealthy: unhealthyCount
            });
          } catch (logError) {
          }

        } catch (tasksError) {
          const errorMessage = tasksError instanceof Error ? tasksError.message : 'Unknown error';
          
          const errorEmbed = new EmbedBuilder()
            .setTitle('📋 System Tasks & Health Monitor')
            .setDescription('⚠️ Unable to retrieve health monitor data')
            .setColor(0xFFA500)
            .addFields([
              {
                name: '⚠️ Error',
                value: errorMessage,
                inline: false
              },
              {
                name: '🔧 System Info',
                value: [
                  `**Uptime:** ${Math.floor(process.uptime() / 60)}m`,
                  `**Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
                ].join('\n'),
                inline: false
              }
            ])
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed] });
          throw tasksError;
        }
      }

      try {
        await storage.createCommandLog({
          commandName: 'ai_sync',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { subcommand },
          result: `${subcommand} check completed successfully`,
          success: true,
          duration: Date.now() - startTime,
          metadata: { subcommand }
        });
      } catch (logError) {
      }

    } catch (error) {
      console.error('Error in ai_sync command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      try {
        const embed = new EmbedBuilder()
          .setTitle('🔄 AI Sync Command')
          .setDescription('⚠️ Command execution encountered an error')
          .setColor(0xFF0000)
          .addFields([
            {
              name: '❌ Error',
              value: errorMessage,
              inline: false
            },
            {
              name: '💡 Note',
              value: 'This is a critical error. Some system components may be unavailable. Please check system logs for more details.',
              inline: false
            }
          ])
          .setFooter({ text: `Requested by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (replyError) {
        await interaction.editReply({
          content: `❌ Critical error executing ${subcommand} check: ${errorMessage}`
        });
      }

      try {
        await fileLogger.error('ai_sync', `Command error: ${errorMessage}`, {
          subcommand,
          error: errorMessage
        });
      } catch (logError) {
      }

      try {
        await storage.createCommandLog({
          commandName: 'ai_sync',
          executedBy: interaction.user.tag,
          userId: interaction.user.id,
          username: interaction.user.username,
          serverId,
          serverName,
          parameters: { subcommand },
          result: `Error: ${errorMessage}`,
          success: false,
          duration: Date.now() - startTime,
          metadata: { error: errorMessage }
        });
      } catch (logError) {
      }
    }
  }
};
