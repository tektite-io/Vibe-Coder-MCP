/**
 * Session persistence for interactive CLI
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface SessionData {
  sessionId: string;
  startTime: Date;
  lastUpdated: Date;
  conversationHistory: Array<{role: string, content: string}>;
  metadata?: Record<string, unknown>;
}

export class SessionPersistence {
  private sessionDir: string;
  
  constructor(sessionDir?: string) {
    this.sessionDir = sessionDir || path.join(os.homedir(), '.vibe', 'sessions');
  }
  
  /**
   * Save session data
   */
  async saveSession(sessionId: string, data: SessionData): Promise<void> {
    try {
      await fs.ensureDir(this.sessionDir);
      const file = path.join(this.sessionDir, `${sessionId}.json`);
      await fs.writeJson(file, {
        ...data,
        lastUpdated: new Date()
      }, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to save session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Load session data
   */
  async loadSession(sessionId: string): Promise<SessionData | null> {
    try {
      const file = path.join(this.sessionDir, `${sessionId}.json`);
      if (await fs.pathExists(file)) {
        const data = await fs.readJson(file);
        // Convert date strings back to Date objects
        data.startTime = new Date(data.startTime);
        data.lastUpdated = new Date(data.lastUpdated);
        return data;
      }
      return null;
    } catch (error) {
      throw new Error(`Failed to load session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * List all sessions
   */
  async listSessions(): Promise<Array<{id: string, startTime: Date, lastUpdated: Date}>> {
    try {
      await fs.ensureDir(this.sessionDir);
      const files = await fs.readdir(this.sessionDir);
      const sessions = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const sessionId = file.replace('.json', '');
            const data = await this.loadSession(sessionId);
            if (data) {
              sessions.push({
                id: sessionId,
                startTime: data.startTime,
                lastUpdated: data.lastUpdated
              });
            }
          } catch {
            // Skip invalid session files
          }
        }
      }
      
      // Sort by last updated, most recent first
      sessions.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
      
      return sessions;
    } catch (error) {
      throw new Error(`Failed to list sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const file = path.join(this.sessionDir, `${sessionId}.json`);
      if (await fs.pathExists(file)) {
        await fs.remove(file);
      }
    } catch (error) {
      throw new Error(`Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Export session to markdown
   */
  async exportSession(sessionId: string, outputPath?: string): Promise<string> {
    try {
      const session = await this.loadSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      let markdown = `# Vibe Interactive Session\n\n`;
      markdown += `**Session ID:** ${session.sessionId}\n`;
      markdown += `**Started:** ${session.startTime.toLocaleString()}\n`;
      markdown += `**Last Updated:** ${session.lastUpdated.toLocaleString()}\n\n`;
      markdown += `---\n\n`;
      markdown += `## Conversation\n\n`;
      
      session.conversationHistory.forEach((entry, index) => {
        const role = entry.role === 'user' ? '👤 You' : '🤖 Vibe';
        markdown += `### ${role}\n\n`;
        markdown += entry.content + '\n\n';
        
        if (index < session.conversationHistory.length - 1) {
          markdown += `---\n\n`;
        }
      });
      
      const output = outputPath || path.join(process.cwd(), `session-${sessionId}.md`);
      await fs.writeFile(output, markdown);
      
      return output;
    } catch (error) {
      throw new Error(`Failed to export session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Clean old sessions (older than days specified)
   */
  async cleanOldSessions(daysToKeep: number = 30): Promise<number> {
    try {
      const sessions = await this.listSessions();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      let deleted = 0;
      for (const session of sessions) {
        if (session.lastUpdated < cutoffDate) {
          await this.deleteSession(session.id);
          deleted++;
        }
      }
      
      return deleted;
    } catch (error) {
      throw new Error(`Failed to clean sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}