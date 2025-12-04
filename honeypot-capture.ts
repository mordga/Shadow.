import { GuildMember, TextChannel, Message, VoiceState, GuildChannel } from 'discord.js';
import { storage } from '../storage';
import { fileLogger } from './file-logger';

interface HoneypotChannel {
  channelId: string;
  serverId: string;
  lureType: 'admin_bait' | 'token_bait' | 'permission_bait';
  createdAt: Date;
}

interface HoneypotRole {
  roleId: string;
  serverId: string;
  lureType: 'admin_role' | 'owner_access' | 'god_mode';
  createdAt: Date;
}

interface CapturedUser {
  userId: string;
  username: string;
  serverId: string;
  capturedAt: Date;
  triggerType: 'channel_access' | 'role_request' | 'message_send' | 'voice_join';
  honeypotId: string;
  evidence: string[];
  actionTaken: 'ban' | 'quarantine' | 'monitor' | 'none';
}

const honeypotChannels = new Map<string, HoneypotChannel>();
const honeypotRoles = new Map<string, HoneypotRole>();
const capturedUsers = new Map<string, CapturedUser[]>();

const HONEYPOT_CHANNEL_PATTERNS = [
  /admin[-_]?secret/i,
  /owner[-_]?only/i,
  /free[-_]?admin/i,
  /get[-_]?admin/i,
  /nuke[-_]?commands/i,
  /token[-_]?drop/i,
  /mod[-_]?leak/i,
  /staff[-_]?backdoor/i,
  /private[-_]?access/i,
  /bot[-_]?control/i
];

const HONEYPOT_ROLE_PATTERNS = [
  /god[-_]?mode/i,
  /owner[-_]?access/i,
  /admin[-_]?god/i,
  /full[-_]?perms/i,
  /unrestricted/i,
  /super[-_]?admin/i
];

export class HoneypotCaptureService {
  private static instance: HoneypotCaptureService;

  private constructor() {}

  static getInstance(): HoneypotCaptureService {
    if (!HoneypotCaptureService.instance) {
      HoneypotCaptureService.instance = new HoneypotCaptureService();
    }
    return HoneypotCaptureService.instance;
  }

  registerHoneypotChannel(channelId: string, serverId: string, lureType: HoneypotChannel['lureType']): void {
    honeypotChannels.set(channelId, {
      channelId,
      serverId,
      lureType,
      createdAt: new Date()
    });
    
    fileLogger.security('honeypot', 'Registered honeypot channel', {
      channelId,
      serverId,
      lureType
    });
  }

  registerHoneypotRole(roleId: string, serverId: string, lureType: HoneypotRole['lureType']): void {
    honeypotRoles.set(roleId, {
      roleId,
      serverId,
      lureType,
      createdAt: new Date()
    });
    
    fileLogger.security('honeypot', 'Registered honeypot role', {
      roleId,
      serverId,
      lureType
    });
  }

  isHoneypotChannel(channelId: string): boolean {
    return honeypotChannels.has(channelId);
  }

  isHoneypotRole(roleId: string): boolean {
    return honeypotRoles.has(roleId);
  }

  detectHoneypotChannelByName(channelName: string): boolean {
    return HONEYPOT_CHANNEL_PATTERNS.some(pattern => pattern.test(channelName));
  }

  detectHoneypotRoleByName(roleName: string): boolean {
    return HONEYPOT_ROLE_PATTERNS.some(pattern => pattern.test(roleName));
  }

  async captureUser(
    member: GuildMember,
    triggerType: CapturedUser['triggerType'],
    honeypotId: string,
    evidence: string[]
  ): Promise<CapturedUser | null> {
    try {
      const serverId = member.guild.id;
      
      const existingCaptures = capturedUsers.get(serverId) || [];
      const alreadyCaptured = existingCaptures.some(c => 
        c.userId === member.id && 
        Date.now() - c.capturedAt.getTime() < 3600000
      );
      
      if (alreadyCaptured) {
        return null;
      }

      const capture: CapturedUser = {
        userId: member.id,
        username: member.user.username,
        serverId,
        capturedAt: new Date(),
        triggerType,
        honeypotId,
        evidence,
        actionTaken: 'monitor'
      };

      existingCaptures.push(capture);
      capturedUsers.set(serverId, existingCaptures);

      await storage.createThreat({
        type: 'honeypot_capture',
        severity: 'high',
        description: `User ${member.user.username} triggered honeypot: ${triggerType}`,
        userId: member.id,
        username: member.user.username,
        serverId,
        serverName: member.guild.name,
        action: 'quarantine',
        metadata: {
          honeypotId,
          triggerType,
          evidence,
          capturedAt: capture.capturedAt.toISOString()
        }
      });

      await fileLogger.security('honeypot', 'User captured', {
        userId: member.id,
        username: member.user.username,
        serverId,
        triggerType,
        honeypotId
      });

      return capture;
    } catch (error) {
      console.error('Error capturing user:', error);
      return null;
    }
  }

  async handleMessageInHoneypot(message: Message): Promise<boolean> {
    if (!message.guild || message.author.bot) return false;
    
    const channel = message.channel as TextChannel;
    
    const isRegisteredHoneypot = this.isHoneypotChannel(channel.id);
    const isNameBasedHoneypot = this.detectHoneypotChannelByName(channel.name);
    
    if (isRegisteredHoneypot || isNameBasedHoneypot) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!member) return false;

      const capture = await this.captureUser(
        member,
        'message_send',
        channel.id,
        [
          `Message content: "${message.content.substring(0, 100)}..."`,
          `Channel: ${channel.name}`,
          `Timestamp: ${new Date().toISOString()}`
        ]
      );

      if (capture) {
        await message.delete().catch(() => {});
        
        try {
          await message.author.send({
            content: '⚠️ Your activity has been flagged by the security system. A moderator will review your account.'
          }).catch(() => {});
        } catch {}

        return true;
      }
    }
    
    return false;
  }

  async handleVoiceJoinHoneypot(oldState: VoiceState, newState: VoiceState): Promise<boolean> {
    if (!newState.channel || !newState.member || newState.member.user.bot) return false;
    
    const isRegisteredHoneypot = this.isHoneypotChannel(newState.channel.id);
    const isNameBasedHoneypot = this.detectHoneypotChannelByName(newState.channel.name);
    
    if (isRegisteredHoneypot || isNameBasedHoneypot) {
      const capture = await this.captureUser(
        newState.member,
        'voice_join',
        newState.channel.id,
        [
          `Voice channel: ${newState.channel.name}`,
          `Previous channel: ${oldState.channel?.name || 'None'}`,
          `Timestamp: ${new Date().toISOString()}`
        ]
      );

      if (capture) {
        await newState.disconnect().catch(() => {});
        return true;
      }
    }
    
    return false;
  }

  async handleChannelAccessAttempt(member: GuildMember, channel: GuildChannel): Promise<boolean> {
    const isRegisteredHoneypot = this.isHoneypotChannel(channel.id);
    const isNameBasedHoneypot = this.detectHoneypotChannelByName(channel.name);
    
    if (isRegisteredHoneypot || isNameBasedHoneypot) {
      const capture = await this.captureUser(
        member,
        'channel_access',
        channel.id,
        [
          `Channel attempted: ${channel.name}`,
          `Channel type: ${channel.type}`,
          `Timestamp: ${new Date().toISOString()}`
        ]
      );

      return capture !== null;
    }
    
    return false;
  }

  async handleRoleRequest(member: GuildMember, roleId: string, roleName: string): Promise<boolean> {
    const isRegisteredHoneypot = this.isHoneypotRole(roleId);
    const isNameBasedHoneypot = this.detectHoneypotRoleByName(roleName);
    
    if (isRegisteredHoneypot || isNameBasedHoneypot) {
      const capture = await this.captureUser(
        member,
        'role_request',
        roleId,
        [
          `Role requested: ${roleName}`,
          `Role ID: ${roleId}`,
          `Timestamp: ${new Date().toISOString()}`
        ]
      );

      return capture !== null;
    }
    
    return false;
  }

  getCapturedUsers(serverId: string): CapturedUser[] {
    return capturedUsers.get(serverId) || [];
  }

  getRecentCaptures(serverId: string, hours: number = 24): CapturedUser[] {
    const all = this.getCapturedUsers(serverId);
    const cutoff = Date.now() - (hours * 3600000);
    return all.filter(c => c.capturedAt.getTime() > cutoff);
  }

  getStats(serverId: string): {
    totalCaptures: number;
    recentCaptures: number;
    activeHoneypotChannels: number;
    activeHoneypotRoles: number;
    capturesByType: Record<string, number>;
  } {
    const captures = this.getCapturedUsers(serverId);
    const recentCaptures = this.getRecentCaptures(serverId);
    
    const activeChannels = Array.from(honeypotChannels.values())
      .filter(h => h.serverId === serverId).length;
    const activeRoles = Array.from(honeypotRoles.values())
      .filter(h => h.serverId === serverId).length;
    
    const capturesByType: Record<string, number> = {};
    for (const capture of captures) {
      capturesByType[capture.triggerType] = (capturesByType[capture.triggerType] || 0) + 1;
    }
    
    return {
      totalCaptures: captures.length,
      recentCaptures: recentCaptures.length,
      activeHoneypotChannels: activeChannels,
      activeHoneypotRoles: activeRoles,
      capturesByType
    };
  }
}

export const honeypotCaptureService = HoneypotCaptureService.getInstance();
