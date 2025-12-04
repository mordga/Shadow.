import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { storage } from '../../storage';
import { firewall } from '../../services/firewall';

export const tokenCommand = {
  data: new SlashCommandBuilder()
    .setName('token')
    .setDescription('🔑 Manage rotating access tokens for secure API access')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('generate')
        .setDescription('Generate a new rotating access token')
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('Token expiration in hours (default: 24)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(8760))
        .addBooleanOption(option =>
          option.setName('server-specific')
            .setDescription('Make token specific to this server only (default: false)')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('max-uses')
            .setDescription('Maximum number of times this token can be used (optional)')
            .setRequired(false)
            .setMinValue(1)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all active access tokens'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('revoke')
        .setDescription('Revoke an access token')
        .addStringOption(option =>
          option.setName('token')
            .setDescription('Token to revoke (full token or last 8 characters)')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('rotate')
        .setDescription('Rotate a token (revoke old, generate new with same settings)')
        .addStringOption(option =>
          option.setName('token')
            .setDescription('Token to rotate (full token or last 8 characters)')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('validate')
        .setDescription('Test if a token is valid')
        .addStringOption(option =>
          option.setName('token')
            .setDescription('Token to validate')
            .setRequired(true))),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const startTime = Date.now();
    const subcommand = interaction.options.getSubcommand();
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

    await interaction.deferReply({ ephemeral: true });

    try {
      if (subcommand === 'generate') {
        const duration = interaction.options.getInteger('duration') || 24;
        const serverSpecific = interaction.options.getBoolean('server-specific') || false;
        const maxUses = interaction.options.getInteger('max-uses') || undefined;

        const token = firewall.generateToken(
          interaction.user.username,
          serverSpecific ? guild.id : undefined,
          duration
        );

        if (maxUses) {
          token.maxUses = maxUses;
        }

        const embed = new EmbedBuilder()
          .setTitle('🔑 ACCESS TOKEN GENERATED')
          .setDescription('⚠️ **SAVE THIS TOKEN SECURELY** - It will not be shown again!')
          .setColor(0x00FF00)
          .addFields([
            {
              name: '🔐 Token',
              value: `\`\`\`${token.token}\`\`\``,
              inline: false
            },
            {
              name: '👤 Created By',
              value: interaction.user.username,
              inline: true
            },
            {
              name: '⏰ Expires',
              value: `<t:${Math.floor(token.expiresAt.getTime() / 1000)}:R>`,
              inline: true
            },
            {
              name: '⏱️ Duration',
              value: `${duration} hours`,
              inline: true
            },
            {
              name: '🌐 Scope',
              value: serverSpecific ? `Server: **${guild.name}**` : '**Global** (all servers)',
              inline: true
            },
            {
              name: '📊 Max Uses',
              value: maxUses ? `**${maxUses}** uses` : '**Unlimited**',
              inline: true
            },
            {
              name: '🔄 Status',
              value: '✅ **Active**',
              inline: true
            },
            {
              name: '🛡️ Security Notes',
              value: [
                '• Store this token in a secure location',
                '• Never share tokens publicly',
                '• Use tokens in API requests for authenticated access',
                '• Tokens bypass rate limiting for trusted access',
                '• Revoke immediately if compromised'
              ].join('\n'),
              inline: false
            }
          ])
          .setFooter({ text: `Generated at ${new Date().toLocaleString()} • Expires in ${duration}h` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createThreat({
          type: 'token_generated',
          severity: 'low',
          description: `🔑 ACCESS TOKEN: Generated by ${interaction.user.username} (${duration}h, ${serverSpecific ? 'server-specific' : 'global'})`,
          serverId: guild.id,
          serverName: guild.name,
          userId: interaction.user.id,
          username: interaction.user.username,
          action: 'warn',
          metadata: { duration, serverSpecific, maxUses }
        });

      } else if (subcommand === 'list') {
        const activeTokens = firewall.getActiveTokens();

        if (activeTokens.length === 0) {
          await interaction.editReply('📋 No active tokens found');
          return;
        }

        const tokenList = activeTokens.map((token, index) => {
          const maskedToken = `${token.token.substring(0, 4)}...${token.token.substring(token.token.length - 8)}`;
          const expiresIn = Math.floor((token.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
          const scope = token.serverId ? `Server-specific` : 'Global';
          const uses = token.maxUses ? `${token.uses}/${token.maxUses}` : `${token.uses}/∞`;
          
          return `**${index + 1}.** \`${maskedToken}\`\n` +
                 `   Created by: **${token.createdBy}** | Expires in: **${expiresIn}h**\n` +
                 `   Scope: **${scope}** | Uses: **${uses}**`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
          .setTitle('🔑 ACTIVE ACCESS TOKENS')
          .setDescription(tokenList.substring(0, 4000))
          .setColor(0x00AAFF)
          .addFields([
            {
              name: '📊 Summary',
              value: `Total Active Tokens: **${activeTokens.length}**`,
              inline: false
            },
            {
              name: '💡 Token Management',
              value: '• Use `/token revoke` to revoke a token\n• Use `/token rotate` to rotate a token\n• Use `/token validate` to test a token',
              inline: false
            }
          ])
          .setFooter({ text: 'Tokens shown with masked values for security' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === 'revoke') {
        const tokenInput = interaction.options.getString('token', true);
        
        let tokenToRevoke: string | null = null;
        
        if (tokenInput.length >= 40) {
          tokenToRevoke = tokenInput;
        } else {
          const activeTokens = firewall.getActiveTokens();
          const match = activeTokens.find(t => t.token.endsWith(tokenInput));
          if (match) {
            tokenToRevoke = match.token;
          }
        }

        if (!tokenToRevoke) {
          await interaction.editReply('❌ Token not found. Provide the full token or the last 8 characters.');
          return;
        }

        const revoked = firewall.revokeToken(tokenToRevoke, interaction.user.username);

        if (!revoked) {
          await interaction.editReply('❌ Failed to revoke token. Token may not exist.');
          return;
        }

        const maskedToken = `${tokenToRevoke.substring(0, 4)}...${tokenToRevoke.substring(tokenToRevoke.length - 8)}`;

        const embed = new EmbedBuilder()
          .setTitle('🚫 TOKEN REVOKED')
          .setDescription('Access token has been permanently revoked')
          .setColor(0xFF0000)
          .addFields([
            {
              name: '🔑 Token',
              value: `\`${maskedToken}\``,
              inline: false
            },
            {
              name: '👤 Revoked By',
              value: interaction.user.username,
              inline: true
            },
            {
              name: '⏰ Revoked At',
              value: new Date().toLocaleString(),
              inline: true
            },
            {
              name: '⚠️ Effect',
              value: 'Token is now **inactive** and cannot be used for authentication',
              inline: false
            }
          ])
          .setFooter({ text: 'Revoked tokens cannot be reactivated' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createThreat({
          type: 'token_revoked',
          severity: 'low',
          description: `🚫 ACCESS TOKEN: Revoked by ${interaction.user.username}`,
          serverId: guild.id,
          serverName: guild.name,
          userId: interaction.user.id,
          username: interaction.user.username,
          action: 'warn',
          metadata: { maskedToken }
        });

      } else if (subcommand === 'rotate') {
        const tokenInput = interaction.options.getString('token', true);
        
        let tokenToRotate: string | null = null;
        
        if (tokenInput.length >= 40) {
          tokenToRotate = tokenInput;
        } else {
          const activeTokens = firewall.getActiveTokens();
          const match = activeTokens.find(t => t.token.endsWith(tokenInput));
          if (match) {
            tokenToRotate = match.token;
          }
        }

        if (!tokenToRotate) {
          await interaction.editReply('❌ Token not found. Provide the full token or the last 8 characters.');
          return;
        }

        const newToken = firewall.rotateToken(tokenToRotate, interaction.user.username);

        if (!newToken) {
          await interaction.editReply('❌ Failed to rotate token. Token may not exist.');
          return;
        }

        const oldMasked = `${tokenToRotate.substring(0, 4)}...${tokenToRotate.substring(tokenToRotate.length - 8)}`;
        const newMasked = `${newToken.token.substring(0, 4)}...${newToken.token.substring(newToken.token.length - 8)}`;

        const embed = new EmbedBuilder()
          .setTitle('🔄 TOKEN ROTATED')
          .setDescription('Old token revoked, new token generated with same configuration')
          .setColor(0x00AAFF)
          .addFields([
            {
              name: '🔑 Old Token (Revoked)',
              value: `\`${oldMasked}\``,
              inline: false
            },
            {
              name: '🔑 New Token',
              value: `\`\`\`${newToken.token}\`\`\`\n⚠️ **SAVE THIS TOKEN SECURELY** - It will not be shown again!`,
              inline: false
            },
            {
              name: '👤 Rotated By',
              value: interaction.user.username,
              inline: true
            },
            {
              name: '⏰ Expires',
              value: `<t:${Math.floor(newToken.expiresAt.getTime() / 1000)}:R>`,
              inline: true
            },
            {
              name: '🔄 Status',
              value: '✅ **Active**',
              inline: true
            },
            {
              name: '💡 Next Steps',
              value: '• Update your API configuration with the new token\n• Old token is no longer valid\n• New token has same settings as the old one',
              inline: false
            }
          ])
          .setFooter({ text: 'Token rotation completed successfully' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await storage.createThreat({
          type: 'token_rotated',
          severity: 'low',
          description: `🔄 ACCESS TOKEN: Rotated by ${interaction.user.username}`,
          serverId: guild.id,
          serverName: guild.name,
          userId: interaction.user.id,
          username: interaction.user.username,
          action: 'warn',
          metadata: { oldMasked, newMasked }
        });

      } else if (subcommand === 'validate') {
        const tokenInput = interaction.options.getString('token', true);
        
        const validation = firewall.validateToken(tokenInput);

        if (validation.valid && validation.token) {
          const token = validation.token;
          const maskedToken = `${tokenInput.substring(0, 4)}...${tokenInput.substring(tokenInput.length - 8)}`;
          const expiresIn = Math.floor((token.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
          const scope = token.serverId ? `Server: ${token.serverId}` : 'Global (all servers)';
          const uses = token.maxUses ? `${token.uses}/${token.maxUses}` : `${token.uses}/∞`;

          const embed = new EmbedBuilder()
            .setTitle('✅ TOKEN VALID')
            .setDescription('This token is active and can be used for authentication')
            .setColor(0x00FF00)
            .addFields([
              {
                name: '🔑 Token',
                value: `\`${maskedToken}\``,
                inline: false
              },
              {
                name: '👤 Created By',
                value: token.createdBy,
                inline: true
              },
              {
                name: '⏰ Expires In',
                value: `**${expiresIn}** hours`,
                inline: true
              },
              {
                name: '🔄 Status',
                value: '✅ **Active**',
                inline: true
              },
              {
                name: '🌐 Scope',
                value: scope,
                inline: true
              },
              {
                name: '📊 Usage',
                value: uses,
                inline: true
              },
              {
                name: '📅 Created',
                value: token.createdAt.toLocaleString(),
                inline: true
              }
            ])
            .setFooter({ text: 'Token validation successful' })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        } else {
          const embed = new EmbedBuilder()
            .setTitle('❌ TOKEN INVALID')
            .setDescription(validation.reason || 'Token validation failed')
            .setColor(0xFF0000)
            .addFields([
              {
                name: '⚠️ Reason',
                value: validation.reason || 'Unknown error',
                inline: false
              },
              {
                name: '💡 Possible Causes',
                value: '• Token has expired\n• Token has been revoked\n• Token usage limit exceeded\n• Invalid token string\n• Too many validation attempts',
                inline: false
              }
            ])
            .setFooter({ text: 'Token validation failed' })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        }
      }

      await storage.createCommandLog({
        commandName: 'token',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Token ${subcommand} executed successfully`,
        success: true,
        duration: Date.now() - startTime,
        metadata: { subcommand }
      });

    } catch (error) {
      console.error('Error in token command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await interaction.editReply(`❌ Error: ${errorMessage}`);
      
      await storage.createCommandLog({
        commandName: 'token',
        executedBy: interaction.user.tag,
        userId: interaction.user.id,
        username: interaction.user.username,
        serverId: guild.id,
        serverName: guild.name,
        parameters: { subcommand },
        result: `Error: ${errorMessage}`,
        success: false,
        duration: Date.now() - startTime,
        metadata: { error: errorMessage }
      });
    }
  }
};
