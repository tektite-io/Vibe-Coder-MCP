/**
 * Response formatter for interactive CLI
 */

// import chalk from 'chalk';
import boxen, { Options as BoxenOptions } from 'boxen';
import wrapAnsi from 'wrap-ansi';
import { themeManager } from '../themes.js';

/**
 * Format response with proper styling
 */
export class ResponseFormatter {
  private static readonly MAX_WIDTH = process.stdout.columns || 80;
  private static readonly CONTENT_WIDTH = Math.min(ResponseFormatter.MAX_WIDTH - 4, 76);
  
  /**
   * Format AI response
   */
  static formatResponse(text: string, title?: string): void {
    // Wrap text to fit terminal width
    const wrapped = wrapAnsi(text, ResponseFormatter.CONTENT_WIDTH);
    const colors = themeManager.getColors();
    
    const boxOptions: BoxenOptions = {
      padding: 1,
      borderStyle: 'single',
      borderColor: 'blue',
      title: title || '🤖 Response',
      titleAlignment: 'left'
    };
    
    console.log(boxen(colors.response(wrapped), boxOptions));
  }
  
  /**
   * Format error message
   */
  static formatError(error: string): void {
    const colors = themeManager.getColors();
    console.log(colors.error('❌ ' + error));
  }
  
  /**
   * Format success message
   */
  static formatSuccess(message: string): void {
    const colors = themeManager.getColors();
    console.log(colors.success('✅ ' + message));
  }
  
  /**
   * Format info message
   */
  static formatInfo(message: string): void {
    const colors = themeManager.getColors();
    console.log(colors.info('ℹ️  ' + message));
  }
  
  /**
   * Format warning message
   */
  static formatWarning(message: string): void {
    const colors = themeManager.getColors();
    console.log(colors.warning('⚠️  ' + message));
  }
  
  /**
   * Format code block
   */
  static formatCode(code: string, language?: string): void {
    const colors = themeManager.getColors();
    const header = language ? colors.textMuted(`\`\`\`${language}`) : colors.textMuted('```');
    const footer = colors.textMuted('```');
    
    console.log(header);
    console.log(colors.code(code));
    console.log(footer);
  }
  
  /**
   * Format list
   */
  static formatList(items: string[], title?: string): void {
    const colors = themeManager.getColors();
    if (title) {
      console.log(colors.warning(title));
    }
    
    items.forEach(item => {
      console.log(colors.listMarker('  • ') + colors.text(item));
    });
  }
  
  /**
   * Format table
   */
  static formatTable(headers: string[], rows: string[][]): void {
    const colors = themeManager.getColors();
    // Calculate column widths
    const widths = headers.map((h, i) => {
      const headerWidth = h.length;
      const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').length));
      return Math.max(headerWidth, maxRowWidth) + 2;
    });
    
    // Print headers
    const headerRow = headers.map((h, i) => colors.bold(h.padEnd(widths[i]))).join('│');
    console.log(colors.border('┌' + widths.map(w => '─'.repeat(w)).join('┬') + '┐'));
    console.log(colors.border('│') + headerRow + colors.border('│'));
    console.log(colors.border('├' + widths.map(w => '─'.repeat(w)).join('┼') + '┤'));
    
    // Print rows
    rows.forEach(row => {
      const dataRow = row.map((cell, i) => (cell || '').padEnd(widths[i])).join('│');
      console.log(colors.border('│') + dataRow + colors.border('│'));
    });
    
    console.log(colors.border('└' + widths.map(w => '─'.repeat(w)).join('┴') + '┘'));
  }
  
  /**
   * Format key-value pairs
   */
  static formatKeyValue(pairs: Record<string, string | number | boolean>, title?: string): void {
    const colors = themeManager.getColors();
    if (title) {
      console.log(colors.warning(title));
    }
    
    const maxKeyLength = Math.max(...Object.keys(pairs).map(k => k.length));
    
    Object.entries(pairs).forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      const formattedValue = typeof value === 'boolean' 
        ? (value ? colors.success('Yes') : colors.error('No'))
        : colors.text(String(value));
      
      console.log(colors.info(`  ${paddedKey}: `) + formattedValue);
    });
  }
}