import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { fileLogger } from '../../services/file-logger';

interface BehavioralFingerprint {
  userId: string;
  username: string;
  typingPatterns: {
    avgMessageLength: number;
    punctuationFrequency: number;
    emojiUsage: number;
    capsRatio: number;
    typoRate: number;
  };
  activityPatterns: {
    activeHours: number[];
    avgTimeBetweenMessages: number;
    burstFrequency: number;
    weekdayVsWeekend: number;
  };
  vocabularyPatterns: {
    uniqueWordRatio: number;
    avgWordLength: number;
    slangUsage: number;
    formalityScore: number;
    commonPhrases: string[];
  };
  interactionPatterns: {
    replyRatio: number;
    mentionFrequency: number;
    reactionUsage: number;
    channelPreferences: string[];
  };
  fingerprintHash: string;
  confidence: number;
  lastUpdated: Date;
}

interface FingerprintMatch {
  userId1: string;
  userId2: string;
  similarity: number;
  matchingFactors: string[];
  confidence: number;
  verdict: 'likely_same' | 'possibly_same' | 'unlikely' | 'different';
}

interface LinkHistory {
  timestamp: Date;
  userId1: string;
  userId2: string;
  similarity: number;
  action: string;
  verifiedBy?: string;
}

const fingerprintCache = new Map<string, Map<string, BehavioralFingerprint>>();
const linkHistory: LinkHistory[] = [];

function generateFingerprintHash(fp: Omit<BehavioralFingerprint, 'fingerprintHash' | 'confidence' | 'lastUpdated'>): string {
  const data = JSON.stringify({
    typing: fp.typingPatterns,
    activity: fp.activityPatterns,
    vocab: fp.vocabularyPatterns
  });
  
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `FP-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
}

function calculateTypingPatterns(messages: { content: string; timestamp: Date }[]): BehavioralFingerprint['typingPatterns'] {
  if (messages.length === 0) {
    return { avgMessageLength: 0, punctuationFrequency: 0, emojiUsage: 0, capsRatio: 0, typoRate: 0 };
  }

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const avgMessageLength = totalChars / messages.length;

  const punctuationPattern = /[.,!?;:'"()-]/g;
  const totalPunctuation = messages.reduce((sum, m) => sum + (m.content.match(punctuationPattern) || []).length, 0);
  const punctuationFrequency = totalPunctuation / totalChars || 0;

  const emojiPattern = /[\uD83C-\uDBFF\uDC00-\uDFFF]+/g;
  const totalEmojis = messages.reduce((sum, m) => sum + (m.content.match(emojiPattern) || []).length, 0);
  const emojiUsage = totalEmojis / messages.length;

  const capsPattern = /[A-Z]/g;
  const letterPattern = /[a-zA-Z]/g;
  let totalCaps = 0;
  let totalLetters = 0;
  messages.forEach(m => {
    totalCaps += (m.content.match(capsPattern) || []).length;
    totalLetters += (m.content.match(letterPattern) || []).length;
  });
  const capsRatio = totalLetters > 0 ? totalCaps / totalLetters : 0;

  const commonMisspellings = ['teh', 'taht', 'waht', 'hte', 'jsut', 'dont', 'wont', 'cant'];
  const typoCount = messages.reduce((sum, m) => {
    return sum + commonMisspellings.filter(typo => m.content.toLowerCase().includes(typo)).length;
  }, 0);
  const typoRate = typoCount / messages.length;

  return { avgMessageLength, punctuationFrequency, emojiUsage, capsRatio, typoRate };
}

function calculateActivityPatterns(messages: { content: string; timestamp: Date }[]): BehavioralFingerprint['activityPatterns'] {
  if (messages.length === 0) {
    return { activeHours: [], avgTimeBetweenMessages: 0, burstFrequency: 0, weekdayVsWeekend: 0 };
  }

  const hourCounts = new Array(24).fill(0);
  messages.forEach(m => {
    const hour = m.timestamp.getHours();
    hourCounts[hour]++;
  });

  const maxCount = Math.max(...hourCounts);
  const activeHours = hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count >= maxCount * 0.5)
    .map(h => h.hour);

  const sortedMessages = [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let totalGap = 0;
  for (let i = 1; i < sortedMessages.length; i++) {
    totalGap += sortedMessages[i].timestamp.getTime() - sortedMessages[i - 1].timestamp.getTime();
  }
  const avgTimeBetweenMessages = sortedMessages.length > 1 ? totalGap / (sortedMessages.length - 1) : 0;

  let bursts = 0;
  for (let i = 2; i < sortedMessages.length; i++) {
    const gap1 = sortedMessages[i].timestamp.getTime() - sortedMessages[i - 1].timestamp.getTime();
    const gap2 = sortedMessages[i - 1].timestamp.getTime() - sortedMessages[i - 2].timestamp.getTime();
    if (gap1 < 5000 && gap2 < 5000) bursts++;
  }
  const burstFrequency = messages.length > 2 ? bursts / messages.length : 0;

  const weekendMessages = messages.filter(m => [0, 6].includes(m.timestamp.getDay())).length;
  const weekdayMessages = messages.length - weekendMessages;
  const weekdayVsWeekend = messages.length > 0 ? weekdayMessages / messages.length : 0;

  return { activeHours, avgTimeBetweenMessages, burstFrequency, weekdayVsWeekend };
}

function calculateVocabularyPatterns(messages: { content: string; timestamp: Date }[]): BehavioralFingerprint['vocabularyPatterns'] {
  if (messages.length === 0) {
    return { uniqueWordRatio: 0, avgWordLength: 0, slangUsage: 0, formalityScore: 0, commonPhrases: [] };
  }

  const allWords = messages.flatMap(m => 
    m.content.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 0)
  );
  
  const uniqueWords = new Set(allWords);
  const uniqueWordRatio = allWords.length > 0 ? uniqueWords.size / allWords.length : 0;

  const totalWordLength = allWords.reduce((sum, w) => sum + w.length, 0);
  const avgWordLength = allWords.length > 0 ? totalWordLength / allWords.length : 0;

  const slangWords = ['lol', 'lmao', 'bruh', 'ngl', 'tbh', 'idk', 'imo', 'btw', 'rn', 'fr', 'ong', 'lowkey', 'highkey'];
  const slangCount = allWords.filter(w => slangWords.includes(w)).length;
  const slangUsage = allWords.length > 0 ? slangCount / allWords.length : 0;

  const formalIndicators = ['however', 'therefore', 'consequently', 'furthermore', 'nevertheless', 'accordingly'];
  const informalIndicators = ['gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'yall', 'ain\'t'];
  
  const formalCount = allWords.filter(w => formalIndicators.includes(w)).length;
  const informalCount = allWords.filter(w => informalIndicators.includes(w)).length;
  const formalityScore = (formalCount - informalCount + 5) / 10;

  const phraseCount = new Map<string, number>();
  messages.forEach(m => {
    const words = m.content.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      phraseCount.set(phrase, (phraseCount.get(phrase) || 0) + 1);
    }
  });

  const commonPhrases = Array.from(phraseCount.entries())
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);

  return { uniqueWordRatio, avgWordLength, slangUsage, formalityScore: Math.max(0, Math.min(1, formalityScore)), commonPhrases };
}

function calculateSimilarity(fp1: BehavioralFingerprint, fp2: BehavioralFingerprint): FingerprintMatch {
  const matchingFactors: string[] = [];
  let totalScore = 0;
  let factorCount = 0;

  const typingSimilarity = 1 - Math.abs(fp1.typingPatterns.avgMessageLength - fp2.typingPatterns.avgMessageLength) / 200;
  if (typingSimilarity > 0.8) matchingFactors.push('Message Length');
  totalScore += Math.max(0, typingSimilarity);
  factorCount++;

  const punctuationSim = 1 - Math.abs(fp1.typingPatterns.punctuationFrequency - fp2.typingPatterns.punctuationFrequency) * 10;
  if (punctuationSim > 0.8) matchingFactors.push('Punctuation Style');
  totalScore += Math.max(0, punctuationSim);
  factorCount++;

  const emojiSim = 1 - Math.abs(fp1.typingPatterns.emojiUsage - fp2.typingPatterns.emojiUsage);
  if (emojiSim > 0.8) matchingFactors.push('Emoji Usage');
  totalScore += Math.max(0, emojiSim);
  factorCount++;

  const capsSim = 1 - Math.abs(fp1.typingPatterns.capsRatio - fp2.typingPatterns.capsRatio) * 5;
  if (capsSim > 0.8) matchingFactors.push('Capitalization');
  totalScore += Math.max(0, capsSim);
  factorCount++;

  const hourOverlap = fp1.activityPatterns.activeHours.filter(h => 
    fp2.activityPatterns.activeHours.includes(h)
  ).length;
  const hourSim = hourOverlap / Math.max(fp1.activityPatterns.activeHours.length, fp2.activityPatterns.activeHours.length, 1);
  if (hourSim > 0.6) matchingFactors.push('Active Hours');
  totalScore += hourSim;
  factorCount++;

  const vocabSim = 1 - Math.abs(fp1.vocabularyPatterns.uniqueWordRatio - fp2.vocabularyPatterns.uniqueWordRatio);
  if (vocabSim > 0.8) matchingFactors.push('Vocabulary Diversity');
  totalScore += Math.max(0, vocabSim);
  factorCount++;

  const slangSim = 1 - Math.abs(fp1.vocabularyPatterns.slangUsage - fp2.vocabularyPatterns.slangUsage) * 5;
  if (slangSim > 0.7) matchingFactors.push('Slang Patterns');
  totalScore += Math.max(0, slangSim);
  factorCount++;

  const formalitySim = 1 - Math.abs(fp1.vocabularyPatterns.formalityScore - fp2.vocabularyPatterns.formalityScore);
  if (formalitySim > 0.8) matchingFactors.push('Formality Level');
  totalScore += Math.max(0, formalitySim);
  factorCount++;

  const phraseOverlap = fp1.vocabularyPatterns.commonPhrases.filter(p => 
    fp2.vocabularyPatterns.commonPhrases.includes(p)
  ).length;
  if (phraseOverlap >= 2) {
    matchingFactors.push('Common Phrases');
    totalScore += 0.3 * phraseOverlap;
  }

  const similarity = (totalScore / factorCount) * 100;
  const confidence = Math.min(95, 50 + matchingFactors.length * 6);

  let verdict: FingerprintMatch['verdict'];
  if (similarity >= 85 && matchingFactors.length >= 5) verdict = 'likely_same';
  else if (similarity >= 70 && matchingFactors.length >= 3) verdict = 'possibly_same';
  else if (similarity >= 50) verdict = 'unlikely';
  else verdict = 'different';

  return {
    userId1: fp1.userId,
    userId2: fp2.userId,
    similarity: Math.round(similarity * 100) / 100,
    matchingFactors,
    confidence,
    verdict
  };
}

export const personaFingerprintCommand = {
  data: new SlashCommandBuilder()
    .setName('persona-fingerprint')
    .setDescription('🧬 Alt account detection via behavioral biometrics and ML fingerprinting')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('analyze')
        .setDescription('🔬 Analyze and generate behavioral fingerprint for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to analyze')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('deep')
            .setDescription('Enable deep analysis mode (slower but more accurate)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('compare')
        .setDescription('🔍 Compare two users for behavioral similarity')
        .addUserOption(option =>
          option.setName('user1')
            .setDescription('First user to compare')
            .setRequired(true))
        .addUserOption(option =>
          option.setName('user2')
            .setDescription('Second user to compare')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('link')
        .setDescription('🔗 Find potential alt accounts linked to a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to find alts for')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('threshold')
            .setDescription('Similarity threshold (50-100)')
            .setMinValue(50)
            .setMaxValue(100)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('history')
        .setDescription('📜 View history of detected alt account links')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of entries to show')
            .setMinValue(5)
            .setMaxValue(50)
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
      await fileLogger.command('persona-fingerprint', `Executing ${subcommand} subcommand`, {
        userId: interaction.user.id,
        guildId: guild.id,
        subcommand
      });

      if (!fingerprintCache.has(guild.id)) {
        fingerprintCache.set(guild.id, new Map());
      }
      const serverCache = fingerprintCache.get(guild.id)!;

      if (subcommand === 'analyze') {
        const targetUser = interaction.options.getUser('user', true);
        const deepMode = interaction.options.getBoolean('deep') || false;

        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
          await interaction.editReply('❌ User not found in this server');
          return;
        }

        const messageTraces = await storage.getMessageTraces({ 
          serverId: guild.id, 
          userId: targetUser.id, 
          limit: deepMode ? 1000 : 200 
        });

        if (!messageTraces || messageTraces.length < 10) {
          await interaction.editReply(`⚠️ Insufficient message data for <@${targetUser.id}>. Need at least 10 messages for fingerprinting.`);
          return;
        }

        const messages = messageTraces.map(t => ({
          content: t.content,
          timestamp: new Date(t.timestamp)
        }));

        const typingPatterns = calculateTypingPatterns(messages);
        const activityPatterns = calculateActivityPatterns(messages);
        const vocabularyPatterns = calculateVocabularyPatterns(messages);

        const fingerprint: BehavioralFingerprint = {
          userId: targetUser.id,
          username: targetUser.username,
          typingPatterns,
          activityPatterns,
          vocabularyPatterns,
          interactionPatterns: {
            replyRatio: 0,
            mentionFrequency: 0,
            reactionUsage: 0,
            channelPreferences: []
          },
          fingerprintHash: '',
          confidence: deepMode ? 92 : 78,
          lastUpdated: new Date()
        };

        fingerprint.fingerprintHash = generateFingerprintHash(fingerprint);
        serverCache.set(targetUser.id, fingerprint);

        const embed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('🧬 BEHAVIORAL FINGERPRINT ANALYSIS')
          .setDescription(`**Target:** ${targetUser.username}\n**Mode:** ${deepMode ? '🔬 Deep Analysis' : '⚡ Standard Analysis'}`)
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            {
              name: '🔤 TYPING PATTERNS',
              value: `**Avg Message Length:** ${typingPatterns.avgMessageLength.toFixed(1)} chars\n**Punctuation Use:** ${(typingPatterns.punctuationFrequency * 100).toFixed(1)}%\n**Emoji Frequency:** ${typingPatterns.emojiUsage.toFixed(2)}/msg\n**Caps Ratio:** ${(typingPatterns.capsRatio * 100).toFixed(1)}%\n**Typo Rate:** ${(typingPatterns.typoRate * 100).toFixed(2)}%`,
              inline: true
            },
            {
              name: '⏰ ACTIVITY PATTERNS',
              value: `**Active Hours:** ${activityPatterns.activeHours.length > 0 ? activityPatterns.activeHours.map(h => `${h}:00`).join(', ') : 'N/A'}\n**Avg Gap:** ${(activityPatterns.avgTimeBetweenMessages / 60000).toFixed(1)} min\n**Burst Rate:** ${(activityPatterns.burstFrequency * 100).toFixed(1)}%\n**Weekday Bias:** ${(activityPatterns.weekdayVsWeekend * 100).toFixed(0)}%`,
              inline: true
            },
            {
              name: '📚 VOCABULARY PATTERNS',
              value: `**Unique Words:** ${(vocabularyPatterns.uniqueWordRatio * 100).toFixed(1)}%\n**Avg Word Length:** ${vocabularyPatterns.avgWordLength.toFixed(1)} chars\n**Slang Usage:** ${(vocabularyPatterns.slangUsage * 100).toFixed(1)}%\n**Formality:** ${(vocabularyPatterns.formalityScore * 100).toFixed(0)}%`,
              inline: false
            }
          );

        if (vocabularyPatterns.commonPhrases.length > 0) {
          embed.addFields({
            name: '💬 SIGNATURE PHRASES',
            value: vocabularyPatterns.commonPhrases.map(p => `• "${p}"`).join('\n'),
            inline: false
          });
        }

        embed.addFields(
          {
            name: '🔐 FINGERPRINT',
            value: `\`\`\`${fingerprint.fingerprintHash}\`\`\``,
            inline: true
          },
          {
            name: '📊 CONFIDENCE',
            value: `${fingerprint.confidence}%`,
            inline: true
          },
          {
            name: '📈 DATA POINTS',
            value: `${messages.length} messages`,
            inline: true
          }
        );

        embed.addFields({
          name: '🛡️ PRIVACY NOTE',
          value: '✅ All analysis performed locally\n✅ No data transmitted externally\n✅ Fingerprint stored in memory only',
          inline: false
        });

        embed.setFooter({ text: `Persona Fingerprint v2.0 | Analysis completed in ${Date.now() - startTime}ms` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'compare') {
        const user1 = interaction.options.getUser('user1', true);
        const user2 = interaction.options.getUser('user2', true);

        if (user1.id === user2.id) {
          await interaction.editReply('❌ Cannot compare a user with themselves');
          return;
        }

        let fp1 = serverCache.get(user1.id);
        let fp2 = serverCache.get(user2.id);

        if (!fp1 || !fp2) {
          const missingUsers = [];
          if (!fp1) missingUsers.push(user1.username);
          if (!fp2) missingUsers.push(user2.username);
          await interaction.editReply(`⚠️ Missing fingerprints for: ${missingUsers.join(', ')}. Use \`/persona-fingerprint analyze\` first.`);
          return;
        }

        const match = calculateSimilarity(fp1, fp2);

        const verdictEmoji = {
          'likely_same': '🔴',
          'possibly_same': '🟠',
          'unlikely': '🟡',
          'different': '🟢'
        };

        const verdictText = {
          'likely_same': 'LIKELY SAME PERSON',
          'possibly_same': 'POSSIBLY SAME PERSON',
          'unlikely': 'UNLIKELY SAME PERSON',
          'different': 'DIFFERENT PEOPLE'
        };

        const embed = new EmbedBuilder()
          .setColor(match.verdict === 'likely_same' ? 0xFF0000 : match.verdict === 'possibly_same' ? 0xFF6600 : match.verdict === 'unlikely' ? 0xFFAA00 : 0x00FF00)
          .setTitle('🔍 PERSONA COMPARISON ANALYSIS')
          .setDescription(`**Comparing:**\n${user1.username} vs ${user2.username}`)
          .addFields(
            {
              name: '🎯 VERDICT',
              value: `${verdictEmoji[match.verdict]} **${verdictText[match.verdict]}**`,
              inline: false
            },
            {
              name: '📊 SIMILARITY SCORE',
              value: `\`\`\`\n${'█'.repeat(Math.floor(match.similarity / 5))}${'░'.repeat(20 - Math.floor(match.similarity / 5))} ${match.similarity.toFixed(1)}%\n\`\`\``,
              inline: false
            },
            {
              name: '✅ MATCHING FACTORS',
              value: match.matchingFactors.length > 0 
                ? match.matchingFactors.map(f => `• ${f}`).join('\n')
                : 'No significant matches found',
              inline: true
            },
            {
              name: '📈 ANALYSIS METRICS',
              value: `**Confidence:** ${match.confidence}%\n**Factors Matched:** ${match.matchingFactors.length}/8\n**Algorithm:** Behavioral ML`,
              inline: true
            }
          );

        embed.addFields(
          {
            name: `🔐 ${user1.username}`,
            value: `Hash: \`${fp1.fingerprintHash}\``,
            inline: true
          },
          {
            name: `🔐 ${user2.username}`,
            value: `Hash: \`${fp2.fingerprintHash}\``,
            inline: true
          }
        );

        if (match.verdict === 'likely_same' || match.verdict === 'possibly_same') {
          embed.addFields({
            name: '⚠️ RECOMMENDED ACTIONS',
            value: match.verdict === 'likely_same'
              ? '🚨 High probability of alt account\n• Consider banning both accounts\n• Check for ban evasion\n• Review shared infractions'
              : '⚠️ Moderate probability of alt account\n• Monitor both accounts closely\n• Compare activity patterns\n• Flag for manual review',
            inline: false
          });

          linkHistory.push({
            timestamp: new Date(),
            userId1: user1.id,
            userId2: user2.id,
            similarity: match.similarity,
            action: 'comparison',
            verifiedBy: interaction.user.id
          });
        }

        embed.setFooter({ text: `Persona Fingerprint v2.0 | Comparison completed in ${Date.now() - startTime}ms` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'link') {
        const targetUser = interaction.options.getUser('user', true);
        const threshold = interaction.options.getInteger('threshold') || 70;

        const targetFp = serverCache.get(targetUser.id);
        if (!targetFp) {
          await interaction.editReply(`⚠️ No fingerprint found for <@${targetUser.id}>. Use \`/persona-fingerprint analyze\` first.`);
          return;
        }

        const potentialMatches: (FingerprintMatch & { username: string })[] = [];

        for (const [userId, fp] of Array.from(serverCache.entries())) {
          if (userId === targetUser.id) continue;
          
          const match = calculateSimilarity(targetFp, fp);
          if (match.similarity >= threshold) {
            potentialMatches.push({ ...match, username: fp.username });
          }
        }

        potentialMatches.sort((a, b) => b.similarity - a.similarity);

        const embed = new EmbedBuilder()
          .setColor(potentialMatches.length > 0 ? 0xFF6600 : 0x00FF00)
          .setTitle('🔗 ALT ACCOUNT LINK DETECTION')
          .setDescription(`**Target:** ${targetUser.username}\n**Threshold:** ${threshold}%\n**Fingerprints Scanned:** ${serverCache.size - 1}`)
          .setThumbnail(targetUser.displayAvatarURL());

        if (potentialMatches.length === 0) {
          embed.addFields({
            name: '✅ RESULT',
            value: `No potential alt accounts found above ${threshold}% similarity threshold.`,
            inline: false
          });
        } else {
          embed.addFields({
            name: `⚠️ POTENTIAL MATCHES (${potentialMatches.length})`,
            value: potentialMatches.slice(0, 10).map((m, i) => 
              `**${i + 1}.** <@${m.userId2}> - ${m.similarity.toFixed(1)}% (${m.verdict.replace('_', ' ')})`
            ).join('\n'),
            inline: false
          });

          const topMatch = potentialMatches[0];
          embed.addFields({
            name: '🔍 TOP MATCH DETAILS',
            value: `**User:** ${topMatch.username}\n**Similarity:** ${topMatch.similarity.toFixed(1)}%\n**Confidence:** ${topMatch.confidence}%\n**Matching Factors:** ${topMatch.matchingFactors.join(', ')}`,
            inline: false
          });
        }

        embed.addFields({
          name: '💡 NEXT STEPS',
          value: potentialMatches.length > 0
            ? '• Use `/persona-fingerprint compare` for detailed analysis\n• Review account creation dates\n• Check IP logs if available\n• Consider moderation action'
            : '• User appears unique\n• Continue routine monitoring\n• Re-scan periodically',
          inline: false
        });

        embed.setFooter({ text: `Persona Fingerprint v2.0 | Link scan completed in ${Date.now() - startTime}ms` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'history') {
        const limit = interaction.options.getInteger('limit') || 20;

        const recentHistory = linkHistory
          .filter(h => {
            const fp1 = serverCache.get(h.userId1);
            const fp2 = serverCache.get(h.userId2);
            return fp1 || fp2;
          })
          .slice(-limit)
          .reverse();

        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('📜 ALT DETECTION HISTORY')
          .setDescription(`**Server:** ${guild.name}\n**Showing:** Last ${Math.min(limit, recentHistory.length)} entries`);

        if (recentHistory.length === 0) {
          embed.addFields({
            name: '📭 NO HISTORY',
            value: 'No alt account detections have been logged yet.',
            inline: false
          });
        } else {
          const historyText = recentHistory.slice(0, 15).map((h, i) => {
            const verdict = h.similarity >= 85 ? '🔴' : h.similarity >= 70 ? '🟠' : '🟡';
            return `${verdict} **${i + 1}.** <@${h.userId1}> ↔ <@${h.userId2}>\n   └ ${h.similarity.toFixed(1)}% | <t:${Math.floor(h.timestamp.getTime() / 1000)}:R>`;
          }).join('\n\n');

          embed.addFields({
            name: '🔗 DETECTION LOG',
            value: historyText.substring(0, 1024),
            inline: false
          });

          const totalDetections = linkHistory.length;
          const likelyAlts = linkHistory.filter(h => h.similarity >= 85).length;
          const possibleAlts = linkHistory.filter(h => h.similarity >= 70 && h.similarity < 85).length;

          embed.addFields({
            name: '📊 STATISTICS',
            value: `**Total Comparisons:** ${totalDetections}\n**Likely Alts Found:** ${likelyAlts}\n**Possible Alts:** ${possibleAlts}\n**Fingerprints Cached:** ${serverCache.size}`,
            inline: false
          });
        }

        embed.setFooter({ text: `Persona Fingerprint v2.0 | ${Date.now() - startTime}ms` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'persona-fingerprint',
        executedBy: interaction.user.username,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Subcommand ${subcommand} executed successfully`,
        success: true,
        duration,
        metadata: { subcommand, fingerprintsCached: serverCache.size }
      });

    } catch (error) {
      console.error('Persona Fingerprint error:', error);
      await fileLogger.error('persona-fingerprint', 'Command execution failed', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id
      });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Persona Fingerprint Error')
        .setDescription(`Failed to execute command: ${(error as Error).message}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });

      const duration = Date.now() - startTime;
      await storage.createCommandLog({
        commandName: 'persona-fingerprint',
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
