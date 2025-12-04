import { Client, ChatInputCommandInteraction } from 'discord.js';
import { fileLogger } from '../services/file-logger';

import { quarantineCommand } from './security/quarantine-command';
import { scanCommand } from './security/scan-command';
import { automodCommand } from './security/automod-command';
import { blacklistCommand } from './security/blacklist-command';
import { whitelistCommand } from './security/whitelist-command';
import { configCommand } from './security/config-command';
import { aiAnalyzeCommand } from './security/ai-analyze-command';
import { threatPredictCommand } from './security/threat-predict-command';
import { forensicsCommand } from './security/forensics-command';
import { honeypotCommand } from './security/honeypot-command';
import { sentinelCommand } from './security/sentinel-command';
import { deepbanCommand } from './security/deepban-command';
import { firewallCommand } from './security/firewall-command';
import { ultraPurgeCommand } from './security/ultra-purge-command';
import { predatorModeCommand } from './security/predator-mode-command';
import { nukeShieldCommand } from './security/nuke-shield-command';
import { intelligenceCoreCommand } from './security/intelligence-core-command';
import { tokenCommand } from './security/token-command';
import { aggressivenessCommand } from './security/aggressiveness-command';
import { threatIntelCommand } from './security/threat-intel-command';
import { behaviorProfileCommand } from './security/behavior-profile-command';
import { stealthAuditCommand } from './security/stealth-audit-command';
import { memberSyncDetectorCommand } from './security/member-sync-detector-command';
import { temporalParadoxCommand } from './security/temporal-paradox-command';
import { socialGraphImmunityCommand } from './security/social-graph-immunity-command';
import { quantumForesightCommand } from './security/quantum-foresight-command';
import { deepfakeScanCommand } from './security/deepfake-scan-command';
import { voiceSentinelCommand } from './security/voice-sentinel-command';
import { sentimentFieldCommand } from './security/sentiment-field-command';
import { neuralIntentCommand } from './security/neural-intent-command';
import { collectiveDefenseCommand } from './security/collective-defense-command';
import { realityDistortionCommand } from './security/reality-distortion-command';
import { predictiveHoneypotCommand } from './security/predictive-honeypot-command';

import { rolesCommand } from './management/roles-command';
import { slowmodeCommand } from './management/slowmode-command';
import { sayCommand } from './management/say-command';
import { authorizeInviteCommand } from './management/authorize-invite-command';
import { backupCommand } from './management/backup-command';
import { highrolesCommand } from './management/highroles-command';

import { statsCommand } from './monitoring/stats-command';
import { statusCommand } from './monitoring/status-command';
import { traceCommand } from './monitoring/trace-command';
import { reputationCommand } from './monitoring/reputation-command';
import { auditCommand } from './monitoring/audit-command';
import * as healthCommand from './monitoring/health-command';
import { deletionsCommand } from './monitoring/deletions-command';
import { analyticsCommand } from './monitoring/analytics-command';
import { inspectCommand } from './monitoring/inspect-command';
import { reportCommand } from './monitoring/report-command';
import { autoHealingCommand } from './monitoring/auto-healing-command';
import { mlSecurityCommand } from './monitoring/ml-security-command';

import { rhelpCommand } from './utility/rhelp-command';
import { restoreCommand } from './utility/restore-command';
import { helpCommand } from './utility/help-command';
import { pingCommand } from './utility/ping-command';
import { logsCommand } from './utility/logs-command';
import { simulateCommand } from './utility/simulate-command';
import { exportCommand } from './utility/export-command';
import { settingsCommand } from './utility/settings-command';
import { claudeSyncCommand } from './utility/claude-sync-command';
import { shadowModeCommand } from './utility/shadow-mode-command';

import { defenserestoreCommand } from './defense/defenserestore-command';
import { defensestatusCommand } from './defense/defensestatus-command';
import { protectCommand } from './defense/protect-command';
import { antinukeCommand } from './defense/antinuke-command';
import { antiraidCommand } from './defense/antiraid-command';
import { antispamCommand } from './defense/antispam-command';

import { kickCommand } from './moderation/kick-command';
import { muteCommand } from './moderation/mute-command';
import { unmuteCommand } from './moderation/unmute-command';
import { lockdownCommand } from './moderation/lockdown-command';
import { unlockCommand } from './moderation/unlock-command';
import { purgeCommand } from './moderation/purge-command';
import { purgechannelsCommand } from './moderation/purge-channels-command';
import { banCommand } from './moderation/ban-command';
import { unbanCommand } from './moderation/unban-command';
import { warnCommand } from './moderation/warn-command';
import { lockserverCommand } from './moderation/lockserver-command';
import { massbanCommand } from './moderation/massban-command';
import { autoPurgeCommand } from './moderation/auto-purge-command';

import { raidDefenseCommand } from './defense/raid-defense-command';

export const allCommands = [
  // Security
  quarantineCommand,
  scanCommand,
  automodCommand,
  blacklistCommand,
  whitelistCommand,
  configCommand,
  aiAnalyzeCommand,
  threatPredictCommand,
  forensicsCommand,
  honeypotCommand,
  sentinelCommand,
  deepbanCommand,
  firewallCommand,
  tokenCommand,
  ultraPurgeCommand,
  predatorModeCommand,
  nukeShieldCommand,
  intelligenceCoreCommand,
  aggressivenessCommand,
  threatIntelCommand,
  behaviorProfileCommand,
  stealthAuditCommand,
  memberSyncDetectorCommand,
  temporalParadoxCommand,
  socialGraphImmunityCommand,
  quantumForesightCommand,
  deepfakeScanCommand,
  voiceSentinelCommand,
  sentimentFieldCommand,
  neuralIntentCommand,
  collectiveDefenseCommand,
  realityDistortionCommand,
  predictiveHoneypotCommand,
  // Management
  rolesCommand,
  slowmodeCommand,
  sayCommand,
  authorizeInviteCommand,
  backupCommand,
  highrolesCommand,
  // Monitoring
  statsCommand,
  statusCommand,
  traceCommand,
  reputationCommand,
  auditCommand,
  healthCommand,
  deletionsCommand,
  analyticsCommand,
  inspectCommand,
  reportCommand,
  autoHealingCommand,
  mlSecurityCommand,
  // Utility
  rhelpCommand,
  restoreCommand,
  helpCommand,
  pingCommand,
  logsCommand,
  simulateCommand,
  exportCommand,
  settingsCommand,
  claudeSyncCommand,
  shadowModeCommand,
  // Defense
  defenserestoreCommand,
  defensestatusCommand,
  protectCommand,
  antinukeCommand,
  antiraidCommand,
  antispamCommand,
  raidDefenseCommand,
  // Moderation
  kickCommand,
  muteCommand,
  unmuteCommand,
  lockdownCommand,
  unlockCommand,
  purgeCommand,
  purgechannelsCommand,
  banCommand,
  unbanCommand,
  warnCommand,
  lockserverCommand,
  massbanCommand,
  autoPurgeCommand
];

export async function registerCommands(client: Client) {
  if (!client.application) {
    throw new Error('Client application not ready');
  }

  try {
    console.log('Started registering slash commands...');
    
    const commandsData = allCommands.map(cmd => cmd.data.toJSON());
    await client.application.commands.set(commandsData);
    
    console.log(`Successfully registered ${commandsData.length} slash commands`);
    await fileLogger.info('commands', `Successfully registered ${commandsData.length} slash commands`, {
      commandCount: commandsData.length,
      commands: commandsData.map(cmd => cmd.name)
    });
  } catch (error) {
    console.error('Error registering commands:', error);
    await fileLogger.error('commands', 'Error registering commands', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function handleCommandInteraction(interaction: ChatInputCommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = allCommands.find(cmd => cmd.data.name === interaction.commandName);
  
  if (!command) {
    await interaction.reply({ content: 'Command not found', ephemeral: true });
    await fileLogger.warn('commands', 'Command not found', {
      commandName: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId
    });
    return;
  }

  try {
    await fileLogger.command('execution', `Command executed: ${interaction.commandName}`, {
      commandName: interaction.commandName,
      userId: interaction.user.id,
      username: interaction.user.username,
      guildId: interaction.guildId,
      channelId: interaction.channelId
    });
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    await fileLogger.error('commands', `Error executing command ${interaction.commandName}`, {
      commandName: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    const errorMessage = { content: 'Error executing command', ephemeral: true };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
}
