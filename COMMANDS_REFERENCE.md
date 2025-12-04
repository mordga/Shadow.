# Discord Bot Commands Reference

This file contains the list of all bot commands identified from the configuration menu. Each command is stubbed out in `server/services/discord-commands.ts` and ready for implementation.

## Command List

### 1. **quarantine**
- **File**: `quarantineCommand` in `discord-commands.ts`
- **Description**: Manage user quarantine for suspicious behavior
- **Status**: Stub created - needs implementation
- **Parameters**: user (required), reason (optional)

### 2. **reputation**
- **File**: `reputationCommand` in `discord-commands.ts`
- **Description**: Check user reputation and behavior score
- **Status**: Stub created - needs implementation
- **Parameters**: user (required)

### 3. **restore**
- **File**: `restoreCommand` in `discord-commands.ts`
- **Description**: Advanced server restoration with templates and backups
- **Status**: Stub created - needs implementation
- **Parameters**: template_id (optional)

### 4. **rhelp**
- **File**: `rhelpCommand` in `discord-commands.ts`
- **Description**: Comprehensive help system for bot commands
- **Status**: Stub created - needs implementation
- **Parameters**: command (optional)

### 5. **roles**
- **File**: `rolesCommand` in `discord-commands.ts`
- **Description**: Manage security roles and permissions
- **Status**: Stub created - needs implementation
- **Subcommands**: create, delete, list

### 6. **say**
- **File**: `sayCommand` in `discord-commands.ts`
- **Description**: Send a custom message or embed to any channel
- **Status**: Stub created - needs implementation
- **Parameters**: channel (required), message (required)

### 7. **scan**
- **File**: `scanCommand` in `discord-commands.ts`
- **Description**: Scan server for security threats and suspicious activity
- **Status**: Stub created - needs implementation
- **Parameters**: type (optional) - full, quick, members, channels

### 8. **slowmode**
- **File**: `slowmodeCommand` in `discord-commands.ts`
- **Description**: Configure slow mode for channels
- **Status**: Stub created - needs implementation
- **Parameters**: channel (required), seconds (required, 0-21600)

### 9. **stats**
- **File**: `statsCommand` in `discord-commands.ts`
- **Description**: Show detailed server and bot statistics
- **Status**: Stub created - needs implementation
- **Parameters**: type (optional) - bot, server, security, all

### 10. **status**
- **File**: `statusCommand` in `discord-commands.ts`
- **Description**: Show comprehensive bot activity and system status
- **Status**: Stub created - needs implementation
- **Parameters**: none

### 11. **trace**
- **File**: `traceCommand` in `discord-commands.ts`
- **Description**: View command execution trace for sensitive commands
- **Status**: Stub created - needs implementation
- **Parameters**: command_id (optional), limit (optional, 1-50)

---

## Implementation Guide

All command stubs are located in: `server/services/discord-commands.ts`

Each command has:
- ✅ Basic structure defined
- ✅ Slash command builder with parameters
- ✅ Placeholder execute function with TODO comment
- ⏳ Implementation logic (to be added later)

To implement a command, find its section in the file (search for the command name in CAPS, e.g., "// QUARANTINE COMMAND") and replace the TODO section with your logic.

## Command Registration

### Discord.js v14 Integration

Commands should be registered when the bot is ready. Here's the proper setup:

```typescript
import { Client, GatewayIntentBits } from 'discord.js';
import { registerCommands, handleCommandInteraction } from './services/discord-commands';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // Add other intents as needed
  ]
});

// Register commands when bot is ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  
  try {
    await registerCommands(client);
    console.log('Commands registered successfully');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
});

// Handle command interactions (Discord.js v14)
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleCommandInteraction(interaction);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
```

### Key v14 Changes

- ✅ Use `interaction.isChatInputCommand()` instead of `interaction.isCommand()`
- ✅ All command handlers use `ChatInputCommandInteraction` type
- ✅ Long-running commands (scan, stats, restore, trace) use `deferReply()` for better UX
- ✅ Permission-sensitive commands (roles, slowmode, say) have TODO comments for permission checks
- ✅ Commands are registered in `client.once('ready')` event for reliability
