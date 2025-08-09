/**
 * Progress indicator for interactive CLI
 */

import ora, { Ora } from 'ora';
// import chalk from 'chalk';
import { themeManager } from '../themes.js';

export class ProgressIndicator {
  private spinner: Ora | null = null;
  private startTime: number = 0;
  
  /**
   * Start progress indicator
   */
  start(message: string = 'Processing...'): void {
    this.startTime = Date.now();
    // const colors = themeManager.getColors();
    this.spinner = ora({
      text: message,
      color: 'cyan', // ora requires specific color names
      spinner: 'dots12'
    }).start();
  }
  
  /**
   * Update progress message
   */
  update(message: string): void {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }
  
  /**
   * Show success and stop
   */
  success(message?: string): void {
    if (this.spinner) {
      const duration = this.getDuration();
      const colors = themeManager.getColors();
      const finalMessage = message ? `${message} ${colors.textMuted(`(${duration})`)}` : `Done ${colors.textMuted(`(${duration})`)}`;
      this.spinner.succeed(finalMessage);
      this.spinner = null;
    }
  }
  
  /**
   * Show failure and stop
   */
  fail(message?: string): void {
    if (this.spinner) {
      const duration = this.getDuration();
      const colors = themeManager.getColors();
      const finalMessage = message ? `${message} ${colors.textMuted(`(${duration})`)}` : `Failed ${colors.textMuted(`(${duration})`)}`;
      this.spinner.fail(finalMessage);
      this.spinner = null;
    }
  }
  
  /**
   * Show warning and stop
   */
  warn(message?: string): void {
    if (this.spinner) {
      const duration = this.getDuration();
      const colors = themeManager.getColors();
      const finalMessage = message ? `${message} ${colors.textMuted(`(${duration})`)}` : `Warning ${colors.textMuted(`(${duration})`)}`;
      this.spinner.warn(finalMessage);
      this.spinner = null;
    }
  }
  
  /**
   * Stop without status
   */
  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }
  
  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.spinner !== null && this.spinner.isSpinning;
  }
  
  /**
   * Get duration string
   */
  private getDuration(): string {
    const ms = Date.now() - this.startTime;
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  }
}

/**
 * Singleton progress indicator
 */
export const progress = new ProgressIndicator();