/**
 * Enhanced CLI utilities with strict typing - extends existing CLIUtils
 * Follows DRY principle by extending, not duplicating
 */

import chalk from 'chalk';
import boxen from 'boxen';
import Table from 'cli-table3';
import { CLIUtils } from '../../tools/vibe-task-manager/cli/commands/index.js';

/**
 * Enhanced CLI utilities with beautification features
 * Extends existing CLIUtils to maintain DRY principle
 */
export class EnhancedCLIUtils extends CLIUtils {
  /**
   * Format success message with green checkmark
   */
  static formatSuccess(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  /**
   * Format error message with red X
   */
  static formatError(message: string): void {
    console.error(chalk.red(`✗ ${message}`));
  }

  /**
   * Format info message with blue info icon
   */
  static formatInfo(message: string): void {
    console.log(chalk.blue(`ℹ ${message}`));
  }

  /**
   * Format warning message with yellow warning icon
   */
  static formatWarning(message: string): void {
    console.log(chalk.yellow(`⚠ ${message}`));
  }

  /**
   * Format content in a styled box with title
   */
  static formatBox(content: string, title: string): void {
    console.log(boxen(content, {
      title,
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      titleAlignment: 'center'
    }));
  }

  /**
   * Format data as a styled table
   */
  static formatTable(headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>): void {
    const table = new Table({
      head: headers.map(h => chalk.cyan(h)),
      style: { 
        head: [], 
        border: [] 
      }
    });

    rows.forEach(row => {
      table.push([...row]); // Create mutable copy for table
    });

    console.log(table.toString());
  }

  /**
   * Format a heading with underline
   */
  static formatHeading(text: string): void {
    console.log(chalk.bold.cyan(text));
    console.log(chalk.cyan('─'.repeat(text.length)));
  }

  /**
   * Format command example
   */
  static formatExample(command: string, description: string): void {
    console.log(`  ${chalk.green(command)}`);
    console.log(`    ${chalk.gray(description)}`);
    console.log();
  }

  /**
   * Format loading dots animation (static version)
   */
  static formatLoading(message: string): void {
    console.log(chalk.blue(`○ ${message}`));
  }

  /**
   * Format key-value pairs in aligned columns
   */
  static formatKeyValue(data: Record<string, string>): void {
    const entries = Object.entries(data);
    const maxKeyLength = Math.max(...entries.map(([key]) => key.length));

    entries.forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      console.log(`${chalk.cyan(paddedKey)} : ${value}`);
    });
  }

  /**
   * Format a list with bullets
   */
  static formatList(items: ReadonlyArray<string>): void {
    items.forEach(item => {
      console.log(`• ${item}`);
    });
  }

  /**
   * Format numbered list
   */
  static formatNumberedList(items: ReadonlyArray<string>): void {
    items.forEach((item, index) => {
      console.log(`${chalk.cyan(`${index + 1}.`)} ${item}`);
    });
  }

  /**
   * Format separator line
   */
  static formatSeparator(character: string = '─', length: number = 50): void {
    console.log(chalk.gray(character.repeat(length)));
  }

  /**
   * Clear console with proper typing
   */
  static clear(): void {
    console.clear();
  }
}