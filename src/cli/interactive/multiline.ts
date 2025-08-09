/**
 * Multi-line input support for interactive CLI
 */

import chalk from 'chalk';

export class MultilineInput {
  private buffer: string[] = [];
  private isMultiline = false;
  private startDelimiter = '```';
  private endDelimiter = '```';
  
  /**
   * Check if input starts multi-line mode
   */
  isStarting(line: string): boolean {
    // Check for triple backticks or opening brace/bracket on its own
    return line.trim() === this.startDelimiter || 
           line.trim() === '{' || 
           line.trim() === '[' ||
           line.endsWith(' \\');  // Backslash continuation
  }
  
  /**
   * Check if input ends multi-line mode
   */
  isEnding(line: string): boolean {
    // Check for closing delimiter
    if (this.buffer.length > 0) {
      const firstLine = this.buffer[0].trim();
      
      // If started with ```, end with ```
      if (firstLine === this.startDelimiter) {
        return line.trim() === this.endDelimiter;
      }
      
      // If started with {, end with }
      if (firstLine === '{') {
        return line.trim() === '}';
      }
      
      // If started with [, end with ]
      if (firstLine === '[') {
        return line.trim() === ']';
      }
      
      // If using backslash continuation, end when no backslash
      if (firstLine.endsWith(' \\')) {
        return !line.endsWith(' \\');
      }
    }
    
    return false;
  }
  
  /**
   * Start multi-line input mode
   */
  startMultiline(): void {
    this.isMultiline = true;
    this.buffer = [];
    console.log(chalk.gray('Entering multi-line mode. End with ``` on a new line (or matching bracket/brace).'));
  }
  
  /**
   * Add a line to the buffer
   */
  addLine(line: string): boolean {
    if (!this.isMultiline && this.isStarting(line)) {
      this.startMultiline();
      this.buffer.push(line);
      return false; // Continue collecting
    }
    
    if (this.isMultiline) {
      if (this.isEnding(line)) {
        // Don't include the ending delimiter in code blocks
        if (line.trim() !== this.endDelimiter) {
          this.buffer.push(line);
        }
        this.isMultiline = false;
        return true; // Complete
      }
      
      this.buffer.push(line);
      return false; // Continue collecting
    }
    
    return true; // Single line, complete immediately
  }
  
  /**
   * Get the complete content
   */
  getContent(): string {
    if (this.buffer.length === 0) {
      return '';
    }
    
    // Check if it's a code block
    const firstLine = this.buffer[0].trim();
    if (firstLine === this.startDelimiter || firstLine.startsWith(this.startDelimiter)) {
      // Remove the opening ``` line
      const content = this.buffer.slice(1);
      
      // If first line had a language specifier, preserve it
      if (firstLine.length > 3) {
        const language = firstLine.substring(3).trim();
        return `[Code: ${language}]\n${content.join('\n')}`;
      }
      
      return content.join('\n');
    }
    
    // For JSON/array objects, join with newlines
    if (firstLine === '{' || firstLine === '[') {
      return this.buffer.join('\n');
    }
    
    // For backslash continuation, join with spaces
    if (this.buffer[0].endsWith(' \\')) {
      return this.buffer.map(line => 
        line.endsWith(' \\') ? line.slice(0, -2) : line
      ).join(' ');
    }
    
    return this.buffer.join('\n');
  }
  
  /**
   * Check if currently in multi-line mode
   */
  isActive(): boolean {
    return this.isMultiline;
  }
  
  /**
   * Reset the multi-line input
   */
  reset(): void {
    this.buffer = [];
    this.isMultiline = false;
  }
  
  /**
   * Get a prompt for multi-line mode
   */
  getPrompt(): string {
    if (!this.isMultiline) {
      return chalk.green('vibe> ');
    }
    
    // Show line number in multi-line mode
    const lineNum = this.buffer.length + 1;
    return chalk.gray(`  ${lineNum.toString().padStart(2)}| `);
  }
  
  /**
   * Get current buffer (for display)
   */
  getCurrentBuffer(): string[] {
    return [...this.buffer];
  }
}