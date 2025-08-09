/**
 * Banner display for interactive CLI
 */

// import chalk from 'chalk';
import boxen from 'boxen';
import figlet from 'figlet';
import { themeManager } from '../themes.js';

/**
 * Get ASCII art banner
 */
export function getAsciiBanner(): string {
  try {
    return figlet.textSync('Vibe', {
      font: 'Standard',
      horizontalLayout: 'default',
      verticalLayout: 'default'
    });
  } catch {
    // Fallback if figlet fails
    return 'VIBE';
  }
}

/**
 * Get formatted welcome banner
 */
export function getBanner(): string {
  const asciiArt = getAsciiBanner();
  const colors = themeManager.getColors();
  
  const content = colors.primary(asciiArt) + '\n\n' +
    colors.textBright('AI Development Assistant v1.0.0') + '\n' +
    colors.textMuted('Powered by OpenRouter & Claude') + '\n\n' +
    colors.warning('Quick Commands:') + '\n' +
    colors.success('  /help   ') + colors.textMuted('Show available commands') + '\n' +
    colors.success('  /tools  ') + colors.textMuted('List available tools') + '\n' +
    colors.success('  /quit   ') + colors.textMuted('Exit interactive mode');
  
  return boxen(content, {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
    title: '🤖 Vibe Interactive Mode',
    titleAlignment: 'center'
  });
}

/**
 * Get session start message
 */
export function getSessionStartMessage(): string {
  const time = new Date().toLocaleTimeString();
  const colors = themeManager.getColors();
  return colors.textMuted(`Session started at ${time}`);
}

/**
 * Get formatted prompt
 */
export function getPrompt(): string {
  const colors = themeManager.getColors();
  return colors.prompt('vibe> ');
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  const colors = themeManager.getColors();
  return colors.success('✅ ' + message);
}

/**
 * Format error message
 */
export function formatError(message: string): string {
  const colors = themeManager.getColors();
  return colors.error('❌ ' + message);
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  const colors = themeManager.getColors();
  return colors.warning('⚠️  ' + message);
}

/**
 * Format info message
 */
export function formatInfo(message: string): string {
  const colors = themeManager.getColors();
  return colors.info('ℹ️  ' + message);
}