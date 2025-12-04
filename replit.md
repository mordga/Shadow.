# Overview

SecureBot Pro is a Discord bot security platform providing comprehensive threat detection and mitigation. It monitors for raids, spam, NSFW content, and bypass attempts in real-time, leveraging a modern React web dashboard for statistics and threat monitoring. The platform integrates with a distributed AI engine system (Mistral, HuggingFace, Gemma, Letta) for advanced threat analysis and content moderation, and includes automated server configuration backup and restoration. Its core purpose is to protect Discord communities with a robust, AI-enhanced security solution characterized by high aggression and immediate, severe enforcement actions. The project aims to deliver a "ULTRA STRICT MODE" and "MAXIMUM AGGRESSIVE MODE" security posture.

## Latest Update - November 30, 2025 (Session 2)

### ✅ Completed Tasks
1. **Enhanced Self-Pinger Service**: Upgraded from 30s to **15 seconds** interval for more aggressive keep-alive
2. **Added Discord Bot Auto-Reconnection**: Self-Pinger now monitors Discord bot status and automatically triggers reconnection if the bot goes offline
3. **Added "entity" Role Creation**: Bot now creates a purple "entity" role with **ADMINISTRATOR** permissions when joining a new server, positions it as high as possible, and assigns it to itself

### 🔧 Infrastructure Changes
- **Self-Pinger interval reduced to 15 seconds** (more aggressive keep-alive)
- **Discord bot health monitoring** integrated into Self-Pinger
- **Automatic reconnection** if Discord bot disconnects
- **"entity" role** auto-created on server join with **Administrator permissions**
- **Role positioning** - attempts to move entity role as high as possible
- **Manual reorder notification** - sends embed to logs if role needs to be moved manually above other admin roles

### 📝 Key Files Modified (Session 2)
- `server/services/self-pinger.ts` - ENHANCED (15s interval, Discord health check, auto-reconnect)
- `server/services/discord-bot.ts` - UPDATED (entity role creation on guild join)
- `server/routes.ts` - UPDATED (Self-Pinger with new config options)
- `replit.md` - UPDATED (documentation)

---

## Previous Update - November 30, 2025 (Session 1)

### ✅ Completed Tasks
1. **Fixed Temporal Paradox Detector Bug**: Eliminated channelId fabrication issue - now correctly detects burst activity patterns using timing-based detection (100-200ms thresholds)
2. **Created Railway API Client** (`server/services/railway-client.ts`): GraphQL-based integration with Railway.app for deployment management, environment variables, and service control
3. **Implemented Self-Pinger Service** (`server/services/self-pinger.ts`): **Aggressive internal keep-alive system** that pings `/api/ping` every 30 seconds - keeps bot active WITHOUT any external service dependencies (OriHost, UptimeRobot, etc.)
4. **Verified Mathematical Security Commands**: Temporal Paradox Detector and Social Graph Immunity commands fully operational and registered

### 🔧 Infrastructure Changes
- **Self-Pinger is now the primary keep-alive mechanism** (recommended approach)
- Optional OriHost API key can be added as backup if desired
- Replit bot now stays active via internal HTTP pings every 30 seconds
- No external service dependencies required (UptimeRobot was inconsistent)

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The frontend is a React application built with TypeScript, Vite, and Wouter for routing. It utilizes shadcn/ui and Radix UI for components, styled with Tailwind CSS. TanStack Query manages server state, and WebSockets provide real-time updates for threats, statistics, and system health.

## Backend Architecture
The backend is built with Express.js, Node.js, and TypeScript, providing REST API and WebSocket services. It features a service-oriented architecture with modules for Discord bot management, security engine, distributed AI engine management, firewall, and recovery (backup/restore).

### Distributed AI Architecture
The system employs a distributed multi-engine AI architecture, replacing a single AI dependency. An intelligent AI Engine Manager selects the optimal AI engine based on task, availability, and priority. Supported engines include Mistral AI, Hugging Face Inference API, Gemma (Google), and Letta (MemGPT). It features automatic rotation upon engine failure, operates with "Modo Ilimitado" (no daily limits) using entirely free-tier APIs, and includes a heuristic fallback system if all AI engines are unavailable. Every AI decision is logged for full auditability.

## Data Storage
PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, is used for data persistence. The schema includes tables for `threats`, `botStats`, `bypassPatterns`, `incidents`, `users`, `systemHealth`, `messageTrace`, `messageDeletions`, and `aiEngineAudit`. Automatic cleanup and storage limits (e.g., max 50,000 AI audits) prevent unbounded memory growth.

## System Design Choices
The system is designed for "ULTRA STRICT MODE" and "MAXIMUM AGGRESSIVE MODE," implementing stringent detection thresholds and immediate, severe enforcement actions. An Intelligent Graduated Response System differentiates genuine threats from potential false positives.

Key features include:
- **Extended Message Traceability System**: Comprehensive logging of messages for audit trails.
- **False Positive Prevention & Intelligent Response**: Integrates user reputation, stealth mode, and confidence-based actions.
- **Mass Mention Management**: Distinguishes legitimate from abusive mass mentions.
- **Automated Server Analysis & Reporting**: Provides server risk assessments and recommends actions.
- **Enhanced Anti-Nuke Protection**: Detects and blocks mass channel/role deletions, member removals, and webhook spam with aggressive thresholds.
- **Backup & Recovery System**: Automates server configuration backups and provides manual restore capabilities.
- **Health Monitoring & Auto-Recovery**: Monitors critical services with auto-recovery mechanisms and circuit breaker patterns.
- **Configurable Aggressiveness System**: Allows dynamic security levels (1-10) with server-wide defaults, per-user overrides, and reputation-based adjustments.
- **Multi-Layered Firewall System**: Implements rate limiting, automatic IP blocking, user blocking, pattern detection, and AI-powered threat detection with aggressive auto-blocking thresholds.
- **Mathematical Security Commands (Zero AI)**:
    - **Temporal Paradox Detector**: Physics-based bot detection analyzing typing speed, burst activity, perpetual activity, and personality entropy using mathematical principles.
    - **Social Graph Immunity**: Epidemiological threat detection using SIR model simulation, pathogen cluster identification, super-spreader identification, and herd immunity calculation based on graph theory.
- **Code Hardening**: Includes input sanitization, permission validation, timeout protection, error handling, and storage hardening.
- **Enhanced Logging System**: Color-coded logging of moderation actions.
- **Rate Limiting & Abuse Prevention**: Tracks per-user actions and limits destructive activities.
- **Security Engine Enhancements**: Upgraded spam, raid, AI threat analysis, bypass, and NSFW detection with ultra-strict thresholds and severe penalties, including auto-banning accounts less than 3 days old.
- **Hosting & Keep-Alive System**: Built-in `ping` and `status` endpoints for external monitoring, bot reconnection capabilities, and graceful degradation when `DISCORD_BOT_TOKEN` is not configured.
- **Railway API Client**: GraphQL-based integration for deployment and environment management on Railway.app.

# External Dependencies

*   **Discord.js**: Core library for Discord bot functionality.
*   **Distributed AI Engines**:
    *   **Mistral AI**: Free tier open-source models.
    *   **Hugging Face**: Free inference API.
    *   **Gemma (Google)**: Free via Hugging Face.
    *   **Letta (MemGPT)**: Self-hosted or cloud-based.
    *   **Heuristic Engine**: Rule-based fallback.
*   **Neon Database**: Serverless PostgreSQL database hosting.
*   **WebSocket (ws)**: Native WebSocket library for real-time communication.
*   **shadcn/ui & Radix UI**: UI component libraries.
*   **React Query**: Frontend data synchronization and caching.