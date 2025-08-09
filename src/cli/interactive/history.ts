/**
 * Command history management for interactive CLI
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export class CommandHistory {
  private history: string[] = [];
  private currentIndex = -1;
  private maxSize: number;
  private historyFile: string;
  private tempCommand = '';
  
  constructor(maxSize: number = 100, historyFile?: string) {
    this.maxSize = maxSize;
    // Default history file in user's home directory
    this.historyFile = historyFile || path.join(os.homedir(), '.vibe', 'history.txt');
    this.loadHistory();
  }
  
  /**
   * Load history from file
   */
  private async loadHistory(): Promise<void> {
    try {
      if (await fs.pathExists(this.historyFile)) {
        const content = await fs.readFile(this.historyFile, 'utf-8');
        this.history = content.split('\n').filter(line => line.trim());
        // Limit to max size
        if (this.history.length > this.maxSize) {
          this.history = this.history.slice(-this.maxSize);
        }
        this.currentIndex = this.history.length;
      }
    } catch {
      // Silently fail - history is not critical
    }
  }
  
  /**
   * Save history to file
   */
  async saveHistory(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.historyFile));
      await fs.writeFile(this.historyFile, this.history.join('\n'));
    } catch {
      // Silently fail - history is not critical
    }
  }
  
  /**
   * Add command to history
   */
  add(command: string): void {
    if (command && command.trim()) {
      // Don't add duplicates of the last command
      if (this.history.length === 0 || this.history[this.history.length - 1] !== command) {
        this.history.push(command);
        if (this.history.length > this.maxSize) {
          this.history.shift();
        }
      }
      this.currentIndex = this.history.length;
      this.tempCommand = '';
      
      // Save to file asynchronously
      this.saveHistory().catch(() => {});
    }
  }
  
  /**
   * Get previous command
   */
  getPrevious(currentInput?: string): string | undefined {
    // Save current input as temp if we're at the end
    if (this.currentIndex === this.history.length && currentInput) {
      this.tempCommand = currentInput;
    }
    
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return undefined;
  }
  
  /**
   * Get next command
   */
  getNext(): string | undefined {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    } else if (this.currentIndex === this.history.length - 1) {
      this.currentIndex = this.history.length;
      return this.tempCommand;
    }
    return '';
  }
  
  /**
   * Reset navigation position
   */
  resetPosition(): void {
    this.currentIndex = this.history.length;
    this.tempCommand = '';
  }
  
  /**
   * Get all history
   */
  getAll(): string[] {
    return [...this.history];
  }
  
  /**
   * Clear all history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.tempCommand = '';
    this.saveHistory().catch(() => {});
  }
  
  /**
   * Search history
   */
  search(query: string): string[] {
    return this.history.filter(cmd => cmd.includes(query));
  }
}