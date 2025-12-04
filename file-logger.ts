import { promises as fs } from 'fs';
import * as path from 'path';

export type LogLevel = 'info' | 'warn' | 'error' | 'security' | 'command' | 'threat';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export class FileLogger {
  private logsDir: string;
  private maxLogAgeDays: number;
  private rotationCheckInterval?: NodeJS.Timeout;

  constructor(logsDir: string = 'logs', maxLogAgeDays: number = 30) {
    this.logsDir = logsDir;
    this.maxLogAgeDays = maxLogAgeDays;
    this.ensureLogsDirectory();
    this.startAutomaticRotation();
  }

  private async ensureLogsDirectory(): Promise<void> {
    try {
      await fs.access(this.logsDir);
    } catch {
      await fs.mkdir(this.logsDir, { recursive: true });
      console.log(`[FileLogger] Created logs directory: ${this.logsDir}`);
    }
  }

  private getLogFileName(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `bot-${year}-${month}-${day}.log`;
  }

  private getLogFilePath(): string {
    return path.join(this.logsDir, this.getLogFileName());
  }

  private async writeLog(entry: LogEntry): Promise<void> {
    try {
      await this.ensureLogsDirectory();
      
      const logLine = JSON.stringify(entry) + '\n';
      const logFilePath = this.getLogFilePath();
      
      await fs.appendFile(logFilePath, logLine, 'utf8');
    } catch (error) {
      console.error('[FileLogger] Error writing log:', error);
    }
  }

  private createLogEntry(
    level: LogLevel,
    category: string,
    message: string,
    metadata?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      metadata: metadata || {}
    };
  }

  async info(category: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const entry = this.createLogEntry('info', category, message, metadata);
    await this.writeLog(entry);
  }

  async warn(category: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const entry = this.createLogEntry('warn', category, message, metadata);
    await this.writeLog(entry);
  }

  async error(category: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const entry = this.createLogEntry('error', category, message, metadata);
    await this.writeLog(entry);
  }

  async security(category: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const entry = this.createLogEntry('security', category, message, metadata);
    await this.writeLog(entry);
  }

  async command(category: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const entry = this.createLogEntry('command', category, message, metadata);
    await this.writeLog(entry);
  }

  async threat(category: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const entry = this.createLogEntry('threat', category, message, metadata);
    await this.writeLog(entry);
  }

  private async rotateOldLogs(): Promise<void> {
    try {
      try {
        await fs.access(this.logsDir);
      } catch {
        return;
      }

      const now = Date.now();
      const maxAgeMs = this.maxLogAgeDays * 24 * 60 * 60 * 1000;

      const files = await fs.readdir(this.logsDir);
      let deletedCount = 0;

      for (const file of files) {
        if (file.startsWith('bot-') && file.endsWith('.log')) {
          const filePath = path.join(this.logsDir, file);
          try {
            const stats = await fs.stat(filePath);
            const fileAge = now - stats.mtime.getTime();

            if (fileAge > maxAgeMs) {
              await fs.unlink(filePath);
              deletedCount++;
              console.log(`[FileLogger] Deleted old log file: ${file}`);
            }
          } catch (error) {
            console.error(`[FileLogger] Error processing file ${file}:`, error);
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`[FileLogger] Rotation complete: ${deletedCount} old log file(s) deleted`);
      }
    } catch (error) {
      console.error('[FileLogger] Error during log rotation:', error);
    }
  }

  private startAutomaticRotation(): void {
    this.rotateOldLogs();
    
    this.rotationCheckInterval = setInterval(() => {
      this.rotateOldLogs();
    }, 24 * 60 * 60 * 1000);

    console.log(`[FileLogger] Automatic log rotation started (max age: ${this.maxLogAgeDays} days)`);
  }

  destroy(): void {
    if (this.rotationCheckInterval) {
      clearInterval(this.rotationCheckInterval);
      this.rotationCheckInterval = undefined;
      console.log('[FileLogger] Automatic log rotation stopped');
    }
  }
}

export const fileLogger = new FileLogger();
