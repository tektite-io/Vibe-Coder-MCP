/**
 * Markdown rendering for interactive CLI
 */

// import chalk from 'chalk';
import wrapAnsi from 'wrap-ansi';
import { themeManager } from '../themes.js';

export class MarkdownRenderer {
  private static readonly MAX_WIDTH = process.stdout.columns || 80;
  private static readonly CONTENT_WIDTH = Math.min(MarkdownRenderer.MAX_WIDTH - 4, 76);
  
  /**
   * Render markdown text to terminal-friendly format
   */
  static render(text: string): string {
    let output = text;
    
    // Headers
    output = this.renderHeaders(output);
    
    // Code blocks
    output = this.renderCodeBlocks(output);
    
    // Inline code
    output = this.renderInlineCode(output);
    
    // Bold
    output = this.renderBold(output);
    
    // Italic
    output = this.renderItalic(output);
    
    // Links
    output = this.renderLinks(output);
    
    // Lists
    output = this.renderLists(output);
    
    // Blockquotes
    output = this.renderBlockquotes(output);
    
    // Horizontal rules
    output = this.renderHorizontalRules(output);
    
    // Tables
    output = this.renderTables(output);
    
    return output;
  }
  
  /**
   * Render headers with color and formatting
   */
  private static renderHeaders(text: string): string {
    const colors = themeManager.getColors();
    // H1
    text = text.replace(/^# (.+)$/gm, (_, content) => 
      '\n' + colors.heading1(content.toUpperCase()) + '\n'
    );
    
    // H2
    text = text.replace(/^## (.+)$/gm, (_, content) => 
      '\n' + colors.heading2(content) + '\n'
    );
    
    // H3
    text = text.replace(/^### (.+)$/gm, (_, content) => 
      colors.heading3(content)
    );
    
    // H4-H6
    text = text.replace(/^#{4,6} (.+)$/gm, (_, content) => 
      colors.bold(content)
    );
    
    return text;
  }
  
  /**
   * Render code blocks with syntax highlighting hint
   */
  private static renderCodeBlocks(text: string): string {
    const colors = themeManager.getColors();
    // Match code blocks with optional language
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    
    text = text.replace(codeBlockRegex, (_, language, code) => {
      const lang = language ? colors.textMuted(`[${language}]`) : '';
      const border = colors.border('─'.repeat(40));
      
      // Indent code block
      const indentedCode = code
        .split('\n')
        .map((line: string) => '  ' + colors.code(line))
        .join('\n');
      
      return `${lang}\n${border}\n${indentedCode}\n${border}`;
    });
    
    return text;
  }
  
  /**
   * Render inline code
   */
  private static renderInlineCode(text: string): string {
    const colors = themeManager.getColors();
    return text.replace(/`([^`]+)`/g, (_, code) => 
      colors.code(` ${code} `)
    );
  }
  
  /**
   * Render bold text
   */
  private static renderBold(text: string): string {
    const colors = themeManager.getColors();
    // **text** or __text__
    text = text.replace(/\*\*([^*]+)\*\*/g, (_, content) => 
      colors.bold(content)
    );
    text = text.replace(/__([^_]+)__/g, (_, content) => 
      colors.bold(content)
    );
    return text;
  }
  
  /**
   * Render italic text
   */
  private static renderItalic(text: string): string {
    const colors = themeManager.getColors();
    // *text* or _text_ (but not ** or __)
    text = text.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, (_, content) => 
      colors.italic(content)
    );
    text = text.replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, (_, content) => 
      colors.italic(content)
    );
    return text;
  }
  
  /**
   * Render links
   */
  private static renderLinks(text: string): string {
    const colors = themeManager.getColors();
    // [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => 
      colors.link(linkText) + colors.textMuted(` (${url})`)
    );
    
    // Plain URLs
    text = text.replace(/(?<![[(])(https?:\/\/[^\s)]+)/g, url => 
      colors.link(url)
    );
    
    return text;
  }
  
  /**
   * Render lists
   */
  private static renderLists(text: string): string {
    const colors = themeManager.getColors();
    // Unordered lists
    text = text.replace(/^[*\-+] (.+)$/gm, (_, content) => 
      colors.listMarker('  •') + ' ' + content
    );
    
    // Ordered lists
    text = text.replace(/^\d+\. (.+)$/gm, (match, content) => {
      const number = match.match(/^(\d+)/)?.[1] || '1';
      return colors.listMarker(`  ${number}.`) + ' ' + content;
    });
    
    // Nested lists (simple support)
    text = text.replace(/^ {2}[*\-+] (.+)$/gm, (_, content) => 
      colors.textMuted('    ◦') + ' ' + content
    );
    
    return text;
  }
  
  /**
   * Render blockquotes
   */
  private static renderBlockquotes(text: string): string {
    const lines = text.split('\n');
    const processed: string[] = [];
    let inBlockquote = false;
    let blockquoteLines: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('>')) {
        inBlockquote = true;
        blockquoteLines.push(line.substring(1).trim());
      } else if (inBlockquote && line.trim() === '') {
        // Empty line might continue blockquote
        blockquoteLines.push('');
      } else {
        if (inBlockquote) {
          // End of blockquote, render it
          const colors = themeManager.getColors();
          const quoted = blockquoteLines
            .map(l => colors.border('│ ') + colors.blockquote(l))
            .join('\n');
          processed.push(quoted);
          blockquoteLines = [];
          inBlockquote = false;
        }
        processed.push(line);
      }
    }
    
    // Handle blockquote at end of text
    if (inBlockquote && blockquoteLines.length > 0) {
      const colors = themeManager.getColors();
      const quoted = blockquoteLines
        .map(l => colors.border('│ ') + colors.blockquote(l))
        .join('\n');
      processed.push(quoted);
    }
    
    return processed.join('\n');
  }
  
  /**
   * Render horizontal rules
   */
  private static renderHorizontalRules(text: string): string {
    const colors = themeManager.getColors();
    const hr = colors.border('─'.repeat(Math.min(50, this.CONTENT_WIDTH)));
    
    // --- or *** or ___
    text = text.replace(/^[-*_]{3,}$/gm, hr);
    
    return text;
  }
  
  /**
   * Render simple tables
   */
  private static renderTables(text: string): string {
    const lines = text.split('\n');
    const processed: string[] = [];
    let i = 0;
    
    while (i < lines.length) {
      // Check if this looks like a table
      if (i + 2 < lines.length && 
          lines[i].includes('|') && 
          lines[i + 1].match(/^\|?[\s\-:|]+\|?$/) &&
          lines[i + 2].includes('|')) {
        
        // Found a table, collect all rows
        const tableRows: string[] = [lines[i]];
        i += 2; // Skip separator
        
        while (i < lines.length && lines[i].includes('|')) {
          tableRows.push(lines[i]);
          i++;
        }
        
        // Render table
        processed.push(this.renderTableRows(tableRows));
      } else {
        processed.push(lines[i]);
        i++;
      }
    }
    
    return processed.join('\n');
  }
  
  /**
   * Helper to render table rows
   */
  private static renderTableRows(rows: string[]): string {
    const colors = themeManager.getColors();
    const processedRows = rows.map(row => {
      const cells = row
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0);
      
      return '│ ' + cells.map(cell => colors.text(cell)).join(' │ ') + ' │';
    });
    
    // Add borders
    const width = Math.min(70, this.CONTENT_WIDTH);
    const border = colors.border('─'.repeat(width));
    
    return border + '\n' + processedRows.join('\n') + '\n' + border;
  }
  
  /**
   * Render markdown with wrapping
   */
  static renderWrapped(text: string): string {
    const rendered = this.render(text);
    
    // Wrap long lines
    const lines = rendered.split('\n');
    const wrapped = lines.map(line => {
      // Don't wrap code blocks or tables
      if (line.includes('│') || line.startsWith('  ')) {
        return line;
      }
      return wrapAnsi(line, this.CONTENT_WIDTH);
    });
    
    return wrapped.join('\n');
  }
}