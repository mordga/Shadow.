# AI_SERVICE.md - Persistent Bot Memory & Context

> **Last Updated:** October 8, 2025
> **Bot Identity:** SecureBot Pro - Ultra-Aggressive Discord Security Platform
> **AI Provider:** Distributed AI System (Mistral AI, Hugging Face, Gemma, Letta) - 100% Free APIs

---

## 🤖 Bot Identity & Core Purpose

**SecureBot Pro** is an autonomous, AI-powered Discord security platform designed to provide comprehensive, aggressive threat detection and mitigation for Discord servers. The bot operates in **ULTRA-STRICT MODE** with **ZERO TOLERANCE** policies for security violations.

### Primary Objectives:
1. **Protect Discord communities** from raids, spam, NSFW content, bypass attempts, and coordinated attacks
2. **Analyze threats in real-time** using distributed AI engines with paranoid security prompting
3. **Enforce immediate, severe actions** against detected threats (permanent bans, instant kicks)
4. **Maintain complete audit trails** of all security events and moderation actions
5. **Operate autonomously 24/7** with self-healing capabilities and automatic recovery

---

## 🛡️ Operating Modes

### 1. **Ultra-Aggressive Mode** (Default)
- ZERO TOLERANCE for security violations
- Instant permanent bans for severe threats (90%+ AI confidence)
- New accounts (<3 days) automatically banned
- Maximum 1 warning before permanent ban
- All violations logged and traced

### 2. **Shadow Mode (Modo Sombra)** ✅
- **Purpose:** Passive observation without direct intervention
- Bot monitors all activities silently
- Logs everything but takes no moderation actions
- Used for: forensic analysis, pattern detection, trust building
- Can be activated per-server or globally
- **Status:** Implemented and operational

### 3. **Stealth Mode** (Trusted Users)
- High-reputation users (reputation ≥70) bypass some checks
- Reduces false positives for legitimate power users
- Still logs all actions for audit trails
- Can be revoked if behavior becomes suspicious

---

## 🔒 Security Configuration (ZERO TOLERANCE MODE)

### Current Thresholds:
| Parameter | Value | Penalty |
|-----------|-------|---------|
| **Account Age** | 3 days minimum | INSTANT BAN |
| **Reputation Score** | 70+ required | Critical threat if <70 |
| **Warnings Before Ban** | 1 warning only | Permanent ban after 1st |
| **Anti-Nuke Limits** | 2 channel/role deletes, 3 bans/kicks per minute | PERMANENT BAN |
| **Anti-Raid** | 1 join/minute, 2 joins/hour | INSTANT PERMANENT BAN |
| **Anti-Spam** | 2 messages/minute, 1 duplicate | PERMANENT BAN |
| **Firewall Rate Limit** | 5 requests/minute | Auto-block at 3 violations |
| **AI Confidence** | Block at 70%+, instant ban at 90%+ | Progressive enforcement |

### Penalties:
- **Spam:** -200 reputation + PERMANENT BAN
- **Raid:** -500 reputation + PERMANENT BAN
- **Bypass Attempt:** INSTANT PERMANENT BAN
- **New Account (<3 days):** IMMEDIATE BAN
- **Low Reputation (<70):** Critical threat classification
- **NSFW Content:** INSTANT PERMANENT BAN

---

## 📡 System Architecture

### Core Services:
1. **Discord Bot Service** (`discord-bot.ts`)
   - Handles all Discord API interactions
   - Event processing (messages, joins, deletions)
   - Anti-nuke protection system
   - Auto-recovery mechanisms

2. **Security Engine** (`security-engine.ts`)
   - Real-time threat analysis
   - Spam/raid/bypass detection
   - Pattern recognition and tracking
   - User reputation management

3. **Distributed AI Service** (`ai-service.ts`)
   - **Multi-Engine Architecture:** Mistral AI, Hugging Face, Gemma, Letta
   - **Cost:** $0 - 100% free and unlimited APIs
   - Ultra-aggressive threat analysis with paranoid prompting
   - Image content moderation (NSFW detection)
   - Behavior pattern analysis
   - Trust scoring and risk assessment
   - Automatic fallback to heuristics if all AI engines fail
   - **Engine Selection:** Automatic per task type with heuristic fallback

4. **File Logger** (`file-logger.ts`)
   - Asynchronous non-blocking log writes
   - Daily timestamped logs (bot-YYYY-MM-DD.log)
   - Automatic 30-day log rotation
   - JSON format for easy parsing
   - All security events, commands, threats logged

5. **Health Monitor** (`health-monitor.ts`)
   - Continuous service health checks
   - Auto-recovery with circuit breaker patterns
   - Failover management for critical services
   - Real-time status reporting

6. **Firewall System** (`firewall-module.ts`)
   - Rate limiting (5 req/min, 50 req/hour)
   - IP and user blocking
   - Pattern detection for bots and automation
   - AI-powered threat detection
   - Token-based validation

7. **Recovery Engine** (`recovery-engine.ts`)
   - Automated server backup system
   - Server configuration restoration
   - Disaster recovery capabilities

8. **WebSocket Service** (`websocket.ts`)
   - Real-time updates to web dashboard
   - Bidirectional communication
   - Live threat monitoring

### Data Storage:
- **PostgreSQL** (Neon serverless) for persistent data
- **Drizzle ORM** for type-safe queries
- **In-memory caching** for performance
- **File-based logs** for audit trails

### External Dependencies:
- **Discord.js** - Discord API integration
- **Distributed AI** - Multiple free AI providers (Mistral, Hugging Face, Gemma, Letta)
- **Axios** - HTTP requests
- **WebSocket (ws)** - Real-time communication
- **React + Vite** - Web dashboard frontend

---

## 🎯 Command Reference

### Security Commands (14):
1. `/quarantine` - Manage user quarantine with time-based release
2. `/scan` - Full server security scan for threats
3. `/automod` - Configure automatic moderation rules
4. `/blacklist` - Manage blacklisted users/IPs
5. `/whitelist` - Manage whitelisted trusted users
6. `/config` - Advanced security configuration
7. `/ai_analyze` - Manual AI threat analysis
8. `/threat_predict` - Predictive threat modeling
9. `/forensics` - Post-incident forensic analysis
10. `/honeypot` - Deploy honeypot traps for attackers
11. `/sentinel` - Advanced monitoring and alerting
12. `/threat-intel` - **NEW** - Global threat intelligence analysis with pattern recognition
13. `/behavior-profile` - **NEW** - Deep behavioral profile analysis with AI psychological assessment
14. `/stealth-audit` - **NEW** - Silent security audit without leaving traces or alerting users

### Firewall Commands (8):
1. `/firewall enable` - Activate ultra-aggressive firewall
2. `/firewall disable` - Disable firewall (NOT RECOMMENDED)
3. `/firewall status` - View protection statistics
4. `/firewall rules` - List all active firewall rules
5. `/firewall block` - Manually block IP or user
6. `/firewall unblock` - Remove from blocklist
7. `/firewall addrule` - Add custom firewall rule
8. `/firewall blocked` - List all blocked entities

### Monitoring Commands (7):
1. `/stats` - Server and bot statistics
2. `/status` - Comprehensive bot system status
3. `/trace` - Command execution trace logs
4. `/reputation` - User reputation and behavior score
5. `/audit` - Full audit trail of moderation actions
6. `/health` - System health and service status
7. `/deletions` - Track deleted messages

### Management Commands (6):
1. `/roles` - Security role management
2. `/slowmode` - Channel slowmode configuration
3. `/say` - Send rich embeds with bot
4. `/authorize_invite` - Manage authorized invites
5. `/backup` - Create/restore server backups
6. `/highroles` - Manage high-privilege role users

### Utility Commands (6):
1. `/help` - General help system
2. `/rhelp` - Advanced help with examples
3. `/ping` - Bot latency and response time
4. `/logs` - Filtered log viewing
5. `/simulate` - Simulate security scenarios
6. `/export` - Export security data (JSON/CSV/TXT)

### Advanced Commands (6):
1. `/deepban` - Permanent IP-level ban
2. `/ultra_purge` - Advanced message purging
3. `/predator_mode` - Maximum aggression mode
4. `/nuke_shield` - Anti-nuke protection toggle
5. `/intelligence_core` - AI intelligence dashboard
6. `/settings` - Bot configuration management

### Analytics Commands (4):
1. `/analytics overview` - Complete security overview
2. `/analytics threats` - Threat breakdown by type
3. `/analytics users` - User reputation analysis
4. `/analytics activity` - Message activity patterns

---

## 🧠 Distributed AI Integration

### AI Engine Architecture:
The bot uses a **distributed AI system** with automatic failover:

1. **Mistral AI** (Primary for most tasks)
   - Free tier with generous rate limits
   - Fast response times
   - Excellent for threat analysis

2. **Hugging Face** (Vision & Text)
   - Free API with monthly credits
   - Supports Gemma models
   - Image analysis capabilities

3. **Gemma** (via Hugging Face)
   - Google's open model
   - Strong reasoning capabilities
   - Self-hosted option available

4. **Letta** (Optional)
   - Memory-enhanced AI
   - Cloud or self-hosted
   - Advanced context retention

5. **Heuristic Engine** (Fallback)
   - Zero-cost rule-based analysis
   - Always available
   - Aggressive by default

### AI Capabilities:
1. **Ultra-Aggressive Threat Analysis**
   - Paranoid security prompting
   - Zero-tolerance policy recommendations
   - Pattern recognition across users/servers

2. **Content Moderation**
   - NSFW image detection with vision API
   - Text bypass technique detection
   - Unicode/invisible character analysis

3. **Behavioral Analysis**
   - User trust scoring (0-100)
   - Anomaly detection
   - Predictive threat modeling

4. **Firewall Intelligence**
   - Real-time threat assessment
   - Automated blocking decisions
   - Pattern-based rule generation

5. **Security Reporting**
   - Comprehensive Markdown reports
   - Incident summaries
   - Countermeasure recommendations

### Failover & Resilience:
- **Engine Selection:** Automatic per-task routing to best available engine
- **Fallback Chain:** Mistral → HuggingFace → Gemma → Letta → Heuristics
- **Circuit Breaker:** Prevents cascading failures
- **Auto-Recovery:** Automatic service restoration
- **Cost:** $0 - All APIs are free and unlimited

---

## 📊 Logging & Traceability

### Database Logging:
- **Threats:** All detected security threats
- **Command Logs:** Every command execution with parameters
- **Message Trace:** All messages processed with decisions
- **Message Deletions:** Complete deletion audit trail
- **Incidents:** Major security events
- **Health Events:** Service status changes
- **User Reputation:** Reputation score history
- **AI Engine Audits:** Track which engine handled each request

### File Logging:
- **Location:** `logs/` directory
- **Format:** JSON with ISO timestamps
- **Rotation:** Daily logs, 30-day retention
- **Filename:** `bot-YYYY-MM-DD.log`
- **Fields:** timestamp, level, category, message, metadata
- **Categories:** info, warn, error, security, command, threat

### Log Levels:
- **INFO:** Normal operations (bot events, command execution)
- **WARN:** Suspicious behavior, potential issues
- **ERROR:** System errors, service failures
- **SECURITY:** Security threats, moderation actions
- **COMMAND:** All command executions
- **THREAT:** Detected threats with AI analysis

---

## 🔐 Security Features

### Multi-Layered Protection:
1. **Message Scanning:** Real-time content analysis
2. **User Tracking:** Reputation and behavior monitoring
3. **Anti-Raid:** Join pattern detection and blocking
4. **Anti-Spam:** Duplicate message and rate limiting
5. **Anti-Nuke:** Mass action detection and prevention
6. **NSFW Detection:** AI-powered image analysis
7. **Bypass Detection:** Unicode, invisible chars, homoglyphs
8. **Firewall:** IP blocking, rate limiting, AI threat detection

### Graduated Response System:
1. **Monitor** (Confidence <50%): Log only, no action
2. **Warn** (50-70%): User warning, reputation penalty
3. **Quarantine** (70-85%): Temporary isolation
4. **Ban** (85-90%): Permanent server ban
5. **Deepban** (90%+): IP-level permanent ban

### False Positive Prevention:
- User reputation consideration
- Context-aware analysis
- Stealth mode for trusted users
- Confidence-based thresholds
- Manual override capabilities

---

## 🚀 Recent Updates & Changes

### November 2025:
- ✅ **3 NEW Unique Commands** - Threat Intel, Behavior Profile, Stealth Audit
- ✅ **Removed /benchmark** - Eliminated unnecessary comparison command

### October 2025:
- ✅ **Migrated to Distributed AI** - Removed all paid APIs (Claude)
- ✅ **100% Free AI Stack** - Mistral, HuggingFace, Gemma, Letta
- ✅ **AI Engine Manager** - Automatic routing and failover
- ✅ **Enhanced Logging** - AI engine tracking and auditing
- ✅ **Shadow Mode** - Passive observation mode implemented
- ✅ **File Logger** - Async I/O and 30-day rotation

### Previous Updates:
- ✅ Ultra-aggressive security thresholds
- ✅ Extended message traceability system
- ✅ Firewall system with 8 commands
- ✅ Health monitoring with auto-recovery
- ✅ Backup and recovery system
- ✅ Analytics and export commands
- ✅ Anti-nuke protection
- ✅ Settings management system

---

## 🎨 Bot Personality & Style

### Communication Style:
- **Professional but accessible** - Clear, concise language
- **Security-focused** - Emphasize protection and safety
- **Transparent** - Explain actions and reasoning
- **Confident** - Decisive in threat responses
- **Helpful** - Assist server admins with security

### Response Patterns:
- Use emojis for visual clarity (🛡️ security, ⚠️ warnings, ✅ success)
- Color-coded embeds (Red=Critical, Orange=High, Yellow=Medium, Green=Safe)
- Detailed explanations in logs and reports
- Progressive severity in warnings

### Operational Principles:
1. **Security First:** Always prioritize community safety
2. **Transparency:** Log and explain all actions
3. **Autonomy:** Operate independently without constant supervision
4. **Resilience:** Self-heal and recover from failures
5. **Accuracy:** Minimize false positives while catching real threats

---

## 🔄 Operational Status

### System Health:
- **Discord Bot:** ✅ Online and connected
- **Distributed AI:** ✅ Operational with multi-engine failover
- **Security Engine:** ✅ Active and monitoring
- **File Logger:** ✅ Writing to daily logs
- **Health Monitor:** ✅ All services healthy
- **WebSocket:** ✅ Dashboard connected
- **Database:** ✅ PostgreSQL operational

### Deployment:
- **Platform:** Replit (Node.js 20)
- **Port:** 5000 (Express + Vite)
- **Workflow:** Auto-restart enabled
- **Uptime Target:** 24/7 continuous operation
- **Deployment Type:** Autoscale (Reserved VM recommended for production)

### Monitoring:
- **Health Checks:** Every 30 seconds
- **Log Rotation:** Daily at midnight UTC
- **Backup Schedule:** On-demand via `/backup` command
- **Stats Update:** Every 60 seconds

---

## 📝 Notes & Context

### Important Considerations:
1. **Replit Auto-Restart:** No need for PM2 or supervisor - workflows handle this
2. **Environment Variables:** All secrets managed via Replit Secrets
3. **Database:** Use Replit's built-in PostgreSQL, not external services
4. **File System:** Logs persist, but temporary files may not survive republish
5. **Port Configuration:** Always bind to 0.0.0.0:5000
6. **AI API Keys:** Configure MISTRAL_API_KEY, HUGGINGFACE_API_KEY, LETTA_API_KEY in Secrets

### Future Enhancements:
- [ ] Advanced ML pattern recognition
- [ ] Cross-server threat intelligence sharing
- [ ] Automated incident response playbooks
- [ ] Integration with external threat databases
- [ ] Local AI model deployment (Gemma, Llama)

### Known Issues:
- None currently - system operational

---

## 🤝 Integration Points

### Discord API:
- **Gateway Intents:** Guilds, Messages, Members, Content, Moderation
- **Events Monitored:** 15+ events (messages, joins, deletions, roles, etc.)
- **Slash Commands:** 50+ registered commands
- **Permissions Required:** Administrator (for full functionality)

### Distributed AI APIs:
- **Mistral AI:** Free tier, auto rate limiting
- **Hugging Face:** Free credits monthly, vision API
- **Gemma:** Via HuggingFace or local deployment
- **Letta:** Cloud or self-hosted option
- **Timeout:** 30 seconds per request
- **Max Retries:** 2 attempts per engine
- **Fallback:** Heuristic analysis on complete failure

### Web Dashboard:
- **Frontend:** React + Vite + TailwindCSS
- **State Management:** TanStack Query
- **Real-time:** WebSocket connection
- **Port:** 5000 (same as backend)

---

**This document serves as the authoritative reference for SecureBot Pro's capabilities, configuration, and operational context. Keep it updated as the system evolves.**

*Generated for Distributed AI System - October 2025*
