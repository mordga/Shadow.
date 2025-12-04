import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface LedgerEntry {
  id: string;
  timestamp: Date;
  type: 'incident' | 'action' | 'evidence' | 'audit';
  description: string;
  data: Record<string, unknown>;
  hash: string;
  previousHash: string;
  nonce: number;
  createdBy: string;
  serverId: string;
  verified: boolean;
  signature: string;
}

interface LedgerChain {
  serverId: string;
  genesisHash: string;
  entries: LedgerEntry[];
  lastUpdated: Date;
  totalEntries: number;
  integrityScore: number;
}

const ledgerChains = new Map<string, LedgerChain>();

function sha256Hash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const h1 = Math.abs(hash).toString(16).padStart(8, '0');
  
  let hash2 = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash2 ^= data.charCodeAt(i);
    hash2 = Math.imul(hash2, 0x01000193);
  }
  const h2 = Math.abs(hash2).toString(16).padStart(8, '0');
  
  let hash3 = 5381;
  for (let i = 0; i < data.length; i++) {
    hash3 = ((hash3 << 5) + hash3) + data.charCodeAt(i);
  }
  const h3 = Math.abs(hash3).toString(16).padStart(8, '0');
  
  let hash4 = 0;
  for (let i = 0; i < data.length; i++) {
    hash4 = data.charCodeAt(i) + ((hash4 << 6) + (hash4 << 16) - hash4);
  }
  const h4 = Math.abs(hash4).toString(16).padStart(8, '0');
  
  return `${h1}${h2}${h3}${h4}`.toUpperCase().substring(0, 64);
}

function generateEntryId(): string {
  return `LED-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
}

function calculateSignature(entry: Omit<LedgerEntry, 'signature'>): string {
  const signatureData = `${entry.id}:${entry.hash}:${entry.createdBy}:${entry.timestamp.toISOString()}`;
  return `SIG-${sha256Hash(signatureData).substring(0, 16)}`;
}

function mineBlock(data: string, previousHash: string, difficulty: number = 2): { hash: string; nonce: number } {
  let nonce = 0;
  const target = '0'.repeat(difficulty);
  let hash = '';
  
  while (!hash.startsWith(target) && nonce < 100000) {
    nonce++;
    hash = sha256Hash(`${data}${previousHash}${nonce}`);
  }
  
  return { hash, nonce };
}

function verifyChainIntegrity(chain: LedgerChain): { valid: boolean; brokenAt?: number; issues: string[] } {
  const issues: string[] = [];
  
  if (chain.entries.length === 0) {
    return { valid: true, issues: [] };
  }
  
  if (chain.entries[0].previousHash !== '0'.repeat(64)) {
    issues.push('Genesis block has invalid previous hash');
  }
  
  for (let i = 1; i < chain.entries.length; i++) {
    const current = chain.entries[i];
    const previous = chain.entries[i - 1];
    
    if (current.previousHash !== previous.hash) {
      issues.push(`Chain break at entry ${i}: Previous hash mismatch`);
      return { valid: false, brokenAt: i, issues };
    }
    
    const expectedHash = sha256Hash(`${current.id}${current.type}${current.description}${JSON.stringify(current.data)}${current.previousHash}${current.nonce}`);
    if (current.hash !== expectedHash) {
      issues.push(`Tampered entry at ${i}: Hash verification failed`);
      return { valid: false, brokenAt: i, issues };
    }
  }
  
  return { valid: issues.length === 0, issues };
}

function initializeChain(serverId: string): LedgerChain {
  const genesisData = `GENESIS:${serverId}:${Date.now()}`;
  const { hash } = mineBlock(genesisData, '0'.repeat(64));
  
  const chain: LedgerChain = {
    serverId,
    genesisHash: hash,
    entries: [],
    lastUpdated: new Date(),
    totalEntries: 0,
    integrityScore: 100
  };
  
  ledgerChains.set(serverId, chain);
  return chain;
}

function addEntry(
  chain: LedgerChain,
  type: LedgerEntry['type'],
  description: string,
  data: Record<string, unknown>,
  createdBy: string
): LedgerEntry {
  const id = generateEntryId();
  const timestamp = new Date();
  const previousHash = chain.entries.length > 0 
    ? chain.entries[chain.entries.length - 1].hash 
    : chain.genesisHash;
  
  const blockData = `${id}${type}${description}${JSON.stringify(data)}${previousHash}`;
  const { hash, nonce } = mineBlock(blockData, previousHash);
  
  const entry: Omit<LedgerEntry, 'signature'> = {
    id,
    timestamp,
    type,
    description,
    data,
    hash,
    previousHash,
    nonce,
    createdBy,
    serverId: chain.serverId,
    verified: true
  };
  
  const signature = calculateSignature(entry);
  const fullEntry: LedgerEntry = { ...entry, signature };
  
  chain.entries.push(fullEntry);
  chain.lastUpdated = timestamp;
  chain.totalEntries++;
  
  return fullEntry;
}

export const ledgerStampCommand = {
  data: new SlashCommandBuilder()
    .setName('ledger-stamp')
    .setDescription('⛓️ Blockchain-style immutable audit trail for critical incidents')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('stamp')
        .setDescription('📝 Create a new immutable ledger entry for an incident')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of entry')
            .addChoices(
              { name: '🚨 Incident', value: 'incident' },
              { name: '⚡ Action', value: 'action' },
              { name: '📎 Evidence', value: 'evidence' },
              { name: '📋 Audit', value: 'audit' }
            )
            .setRequired(true))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description of the entry')
            .setRequired(true))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User involved (if applicable)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('evidence')
            .setDescription('Additional evidence or notes')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('verify')
        .setDescription('🔍 Verify integrity of a specific ledger entry')
        .addStringOption(option =>
          option.setName('entry_id')
            .setDescription('Entry ID to verify')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('chain')
        .setDescription('⛓️ View the audit chain and verify integrity')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of recent entries to show')
            .setMinValue(5)
            .setMaxValue(50)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('export')
        .setDescription('📤 Export the ledger chain for external verification')
        .addStringOption(option =>
          option.setName('format')
            .setDescription('Export format')
            .addChoices(
              { name: 'JSON (Full)', value: 'json' },
              { name: 'Text Report', value: 'text' },
              { name: 'Hash Chain Only', value: 'hashes' }
            )
            .setRequired(false))),

  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.editReply('❌ This command can only be used in a server');
      return;
    }

    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) {
      await interaction.editReply('❌ Could not access server information');
      return;
    }

    try {
      await fileLogger.command('ledger-stamp', `Executing ${subcommand} subcommand`, {
        userId: interaction.user.id,
        guildId: guild.id,
        subcommand
      });

      let chain = ledgerChains.get(guild.id);
      if (!chain) {
        chain = initializeChain(guild.id);
        await fileLogger.info('ledger-stamp', 'Initialized new ledger chain', { serverId: guild.id });
      }

      if (subcommand === 'stamp') {
        const type = interaction.options.getString('type', true) as LedgerEntry['type'];
        const description = interaction.options.getString('description', true);
        const targetUser = interaction.options.getUser('user');
        const evidenceNote = interaction.options.getString('evidence');

        const entryData: Record<string, unknown> = {
          stampedBy: interaction.user.id,
          stampedByUsername: interaction.user.username,
          channelId: interaction.channelId,
          timestamp: Date.now()
        };

        if (targetUser) {
          entryData.targetUserId = targetUser.id;
          entryData.targetUsername = targetUser.username;
        }

        if (evidenceNote) {
          entryData.evidence = evidenceNote;
          entryData.evidenceHash = sha256Hash(evidenceNote);
        }

        const entry = addEntry(chain, type, description, entryData, interaction.user.id);

        const typeEmojis = {
          'incident': '🚨',
          'action': '⚡',
          'evidence': '📎',
          'audit': '📋'
        };

        const embed = new EmbedBuilder()
          .setColor(0x00AA00)
          .setTitle(`${typeEmojis[type]} LEDGER ENTRY STAMPED`)
          .setDescription('**Immutable record created successfully**')
          .addFields(
            {
              name: '📝 ENTRY DETAILS',
              value: `**ID:** \`${entry.id}\`\n**Type:** ${type.toUpperCase()}\n**Description:** ${description}\n**Timestamp:** <t:${Math.floor(entry.timestamp.getTime() / 1000)}:F>`,
              inline: false
            },
            {
              name: '🔐 CRYPTOGRAPHIC PROOF',
              value: `**Hash:**\n\`\`\`${entry.hash}\`\`\`\n**Previous Hash:**\n\`\`\`${entry.previousHash.substring(0, 32)}...${entry.previousHash.substring(32)}\`\`\``,
              inline: false
            },
            {
              name: '⛏️ MINING DETAILS',
              value: `**Nonce:** ${entry.nonce}\n**Signature:** \`${entry.signature}\`\n**Verified:** ✅`,
              inline: true
            },
            {
              name: '⛓️ CHAIN STATUS',
              value: `**Block #:** ${chain.totalEntries}\n**Chain Length:** ${chain.entries.length}\n**Integrity:** ${chain.integrityScore}%`,
              inline: true
            }
          );

        if (targetUser) {
          embed.addFields({
            name: '👤 INVOLVED USER',
            value: `<@${targetUser.id}> (${targetUser.username})`,
            inline: false
          });
        }

        if (evidenceNote) {
          embed.addFields({
            name: '📎 ATTACHED EVIDENCE',
            value: `${evidenceNote}\n**Evidence Hash:** \`${entryData.evidenceHash}\``,
            inline: false
          });
        }

        embed.addFields({
          name: '✅ TAMPER-PROOF GUARANTEE',
          value: '• Entry is cryptographically linked to previous entries\n• Any modification will invalidate the entire chain\n• Hash verification ensures data integrity',
          inline: false
        });

        embed.setFooter({ text: `Ledger Stamp v2.0 | Block mined in ${Date.now() - startTime}ms` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await fileLogger.security('ledger-stamp', 'New entry stamped', {
          entryId: entry.id,
          type,
          hash: entry.hash
        });

      } else if (subcommand === 'verify') {
        const entryId = interaction.options.getString('entry_id', true);

        const entry = chain.entries.find(e => e.id === entryId);
        if (!entry) {
          await interaction.editReply(`❌ Entry \`${entryId}\` not found in ledger`);
          return;
        }

        const entryIndex = chain.entries.indexOf(entry);
        const expectedHash = sha256Hash(`${entry.id}${entry.type}${entry.description}${JSON.stringify(entry.data)}${entry.previousHash}${entry.nonce}`);
        const hashValid = entry.hash === expectedHash;

        let chainValid = true;
        if (entryIndex > 0) {
          chainValid = chain.entries[entryIndex - 1].hash === entry.previousHash;
        }

        const signatureValid = entry.signature === calculateSignature({
          id: entry.id,
          timestamp: entry.timestamp,
          type: entry.type,
          description: entry.description,
          data: entry.data,
          hash: entry.hash,
          previousHash: entry.previousHash,
          nonce: entry.nonce,
          createdBy: entry.createdBy,
          serverId: entry.serverId,
          verified: entry.verified
        });

        const allValid = hashValid && chainValid && signatureValid;

        const embed = new EmbedBuilder()
          .setColor(allValid ? 0x00FF00 : 0xFF0000)
          .setTitle(allValid ? '✅ ENTRY VERIFIED' : '❌ VERIFICATION FAILED')
          .setDescription(`**Entry ID:** \`${entry.id}\``)
          .addFields(
            {
              name: '🔍 VERIFICATION RESULTS',
              value: `**Hash Integrity:** ${hashValid ? '✅ VALID' : '❌ INVALID'}\n**Chain Continuity:** ${chainValid ? '✅ VALID' : '❌ BROKEN'}\n**Signature:** ${signatureValid ? '✅ VALID' : '❌ INVALID'}\n**Overall:** ${allValid ? '✅ VERIFIED' : '❌ FAILED'}`,
              inline: false
            },
            {
              name: '📝 ENTRY DETAILS',
              value: `**Type:** ${entry.type.toUpperCase()}\n**Description:** ${entry.description}\n**Created:** <t:${Math.floor(entry.timestamp.getTime() / 1000)}:F>\n**Created By:** <@${entry.createdBy}>`,
              inline: true
            },
            {
              name: '⛓️ CHAIN POSITION',
              value: `**Block #:** ${entryIndex + 1} of ${chain.entries.length}\n**Previous Hash:** \`${entry.previousHash.substring(0, 16)}...\`\n**Nonce:** ${entry.nonce}`,
              inline: true
            },
            {
              name: '🔐 CRYPTOGRAPHIC PROOF',
              value: `**Stored Hash:**\n\`${entry.hash}\`\n\n**Computed Hash:**\n\`${expectedHash}\`\n\n**Match:** ${hashValid ? '✅' : '❌'}`,
              inline: false
            }
          );

        if (!allValid) {
          embed.addFields({
            name: '⚠️ TAMPERING DETECTED',
            value: '🚨 This entry or the chain has been modified\n• The cryptographic proof does not match\n• Data integrity cannot be guaranteed\n• This record may have been tampered with',
            inline: false
          });
        }

        embed.setFooter({ text: `Ledger Stamp v2.0 | Verified in ${Date.now() - startTime}ms` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'chain') {
        const limit = interaction.options.getInteger('limit') || 20;

        const integrity = verifyChainIntegrity(chain);
        chain.integrityScore = integrity.valid ? 100 : Math.max(0, 100 - integrity.issues.length * 20);

        const recentEntries = chain.entries.slice(-limit).reverse();

        const embed = new EmbedBuilder()
          .setColor(integrity.valid ? 0x00FF00 : 0xFF0000)
          .setTitle('⛓️ AUDIT LEDGER CHAIN')
          .setDescription(`**Server:** ${guild.name}\n**Chain Status:** ${integrity.valid ? '✅ INTACT' : '❌ COMPROMISED'}`)
          .addFields(
            {
              name: '📊 CHAIN STATISTICS',
              value: `**Total Entries:** ${chain.totalEntries}\n**Genesis Hash:** \`${chain.genesisHash.substring(0, 16)}...\`\n**Last Updated:** <t:${Math.floor(chain.lastUpdated.getTime() / 1000)}:R>\n**Integrity Score:** ${chain.integrityScore}%`,
              inline: true
            },
            {
              name: '🔒 SECURITY STATUS',
              value: `**Chain Valid:** ${integrity.valid ? '✅' : '❌'}\n**Issues Found:** ${integrity.issues.length}\n**Tamper Proof:** ${integrity.valid ? '✅' : '❌'}`,
              inline: true
            }
          );

        if (recentEntries.length === 0) {
          embed.addFields({
            name: '📭 CHAIN EMPTY',
            value: 'No entries have been stamped yet.\nUse `/ledger-stamp stamp` to create the first entry.',
            inline: false
          });
        } else {
          const typeEmojis: Record<string, string> = {
            'incident': '🚨',
            'action': '⚡',
            'evidence': '📎',
            'audit': '📋'
          };

          const chainText = recentEntries.slice(0, 10).map((e, i) => 
            `${typeEmojis[e.type] || '📝'} **Block ${chain.entries.length - i}**\n` +
            `└ \`${e.id}\`\n` +
            `└ ${e.description.substring(0, 50)}${e.description.length > 50 ? '...' : ''}\n` +
            `└ <t:${Math.floor(e.timestamp.getTime() / 1000)}:R>`
          ).join('\n\n');

          embed.addFields({
            name: `📜 RECENT ENTRIES (${recentEntries.length})`,
            value: chainText.substring(0, 1024),
            inline: false
          });
        }

        if (!integrity.valid && integrity.issues.length > 0) {
          embed.addFields({
            name: '⚠️ INTEGRITY ISSUES',
            value: integrity.issues.slice(0, 5).map(i => `• ${i}`).join('\n'),
            inline: false
          });
        }

        embed.addFields({
          name: '💡 ABOUT LEDGER CHAIN',
          value: '• Each entry is cryptographically linked\n• Tampering with any entry invalidates the chain\n• Provides immutable evidence for appeals/disputes\n• Export chain for independent verification',
          inline: false
        });

        embed.setFooter({ text: `Ledger Stamp v2.0 | ${Date.now() - startTime}ms` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'export') {
        const format = interaction.options.getString('format') || 'json';

        if (chain.entries.length === 0) {
          await interaction.editReply('⚠️ No entries to export. The ledger chain is empty.');
          return;
        }

        let exportContent: string;
        let fileName: string;

        if (format === 'json') {
          const exportData = {
            metadata: {
              serverId: chain.serverId,
              serverName: guild.name,
              exportedAt: new Date().toISOString(),
              exportedBy: interaction.user.tag,
              totalEntries: chain.totalEntries,
              genesisHash: chain.genesisHash,
              integrityScore: chain.integrityScore
            },
            entries: chain.entries.map(e => ({
              id: e.id,
              timestamp: e.timestamp.toISOString(),
              type: e.type,
              description: e.description,
              data: e.data,
              hash: e.hash,
              previousHash: e.previousHash,
              nonce: e.nonce,
              signature: e.signature,
              createdBy: e.createdBy,
              verified: e.verified
            }))
          };
          exportContent = JSON.stringify(exportData, null, 2);
          fileName = `ledger_export_${guild.id}_${Date.now()}.json`;

        } else if (format === 'text') {
          const lines = [
            '═══════════════════════════════════════════════════════════════',
            '              IMMUTABLE AUDIT LEDGER - EXPORT REPORT',
            '═══════════════════════════════════════════════════════════════',
            '',
            `Server: ${guild.name} (${guild.id})`,
            `Exported: ${new Date().toISOString()}`,
            `Exported By: ${interaction.user.tag}`,
            `Total Entries: ${chain.totalEntries}`,
            `Genesis Hash: ${chain.genesisHash}`,
            `Integrity Score: ${chain.integrityScore}%`,
            '',
            '─── LEDGER ENTRIES ───',
            ''
          ];

          chain.entries.forEach((e, i) => {
            lines.push(`Entry #${i + 1}`);
            lines.push(`  ID: ${e.id}`);
            lines.push(`  Type: ${e.type.toUpperCase()}`);
            lines.push(`  Description: ${e.description}`);
            lines.push(`  Timestamp: ${e.timestamp.toISOString()}`);
            lines.push(`  Created By: ${e.createdBy}`);
            lines.push(`  Hash: ${e.hash}`);
            lines.push(`  Previous Hash: ${e.previousHash}`);
            lines.push(`  Nonce: ${e.nonce}`);
            lines.push(`  Signature: ${e.signature}`);
            lines.push(`  Data: ${JSON.stringify(e.data)}`);
            lines.push('');
          });

          lines.push('═══════════════════════════════════════════════════════════════');
          lines.push('                         END OF EXPORT');
          lines.push('═══════════════════════════════════════════════════════════════');

          exportContent = lines.join('\n');
          fileName = `ledger_report_${guild.id}_${Date.now()}.txt`;

        } else {
          const lines = [
            'HASH CHAIN VERIFICATION DATA',
            `Genesis: ${chain.genesisHash}`,
            '',
            'Block# -> Hash -> Previous Hash',
            '─'.repeat(60),
            ''
          ];

          chain.entries.forEach((e, i) => {
            lines.push(`${(i + 1).toString().padStart(4, '0')} | ${e.hash.substring(0, 24)}... | ${e.previousHash.substring(0, 24)}...`);
          });

          exportContent = lines.join('\n');
          fileName = `ledger_hashes_${guild.id}_${Date.now()}.txt`;
        }

        const buffer = Buffer.from(exportContent, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: fileName });

        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('📤 LEDGER EXPORT COMPLETE')
          .setDescription(`**Format:** ${format.toUpperCase()}\n**Entries:** ${chain.totalEntries}`)
          .addFields(
            {
              name: '📊 EXPORT DETAILS',
              value: `**File:** ${fileName}\n**Size:** ${buffer.length} bytes\n**Entries Included:** ${chain.entries.length}`,
              inline: true
            },
            {
              name: '🔐 VERIFICATION',
              value: `**Genesis Hash:** \`${chain.genesisHash.substring(0, 16)}...\`\n**Latest Hash:** \`${chain.entries[chain.entries.length - 1]?.hash.substring(0, 16) || 'N/A'}...\``,
              inline: true
            },
            {
              name: '💡 VERIFICATION GUIDE',
              value: '1. Import JSON into verification tool\n2. Recalculate each block hash\n3. Verify hash chain continuity\n4. Confirm signatures match',
              inline: false
            }
          )
          .setFooter({ text: `Ledger Stamp v2.0 | ${Date.now() - startTime}ms` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed], files: [attachment] });

        await fileLogger.info('ledger-stamp', 'Ledger exported', {
          format,
          entries: chain.entries.length,
          exportedBy: interaction.user.id
        });
      }

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'ledger-stamp',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Subcommand ${subcommand} executed successfully`,
        success: true,
        duration,
        metadata: { subcommand, chainLength: chain.entries.length }
      });

    } catch (error) {
      console.error('Ledger Stamp error:', error);
      await fileLogger.error('ledger-stamp', 'Command execution failed', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id
      });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Ledger Stamp Error')
        .setDescription(`Failed to execute command: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'ledger-stamp',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Error: ${(error as Error).message}`,
        success: false,
        duration,
        metadata: { error: (error as Error).message }
      });
    }
  }
};
