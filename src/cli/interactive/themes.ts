/**
 * Theme system for interactive CLI
 * Provides color schemes and theme management
 */

import chalk, { ChalkInstance } from 'chalk';

/**
 * Theme color definitions
 */
export interface ThemeColors {
  // Primary colors
  primary: ChalkInstance;
  secondary: ChalkInstance;
  accent: ChalkInstance;
  
  // Status colors
  success: ChalkInstance;
  error: ChalkInstance;
  warning: ChalkInstance;
  info: ChalkInstance;
  
  // Text colors
  text: ChalkInstance;
  textMuted: ChalkInstance;
  textBright: ChalkInstance;
  
  // UI element colors
  prompt: ChalkInstance;
  command: ChalkInstance;
  response: ChalkInstance;
  border: ChalkInstance;
  background: ChalkInstance;
  
  // Code colors
  codeKeyword: ChalkInstance;
  codeString: ChalkInstance;
  codeComment: ChalkInstance;
  codeFunction: ChalkInstance;
  codeVariable: ChalkInstance;
  
  // Markdown colors
  heading1: ChalkInstance;
  heading2: ChalkInstance;
  heading3: ChalkInstance;
  bold: ChalkInstance;
  italic: ChalkInstance;
  link: ChalkInstance;
  code: ChalkInstance;
  blockquote: ChalkInstance;
  listMarker: ChalkInstance;
  
  // Special elements
  spinner: ChalkInstance;
  progressBar: ChalkInstance;
  badge: ChalkInstance;
  highlight: ChalkInstance;
}

/**
 * Theme definition
 */
export interface Theme {
  name: string;
  description: string;
  colors: ThemeColors;
}

/**
 * Default theme - Balanced colors for general use
 */
const defaultTheme: Theme = {
  name: 'default',
  description: 'Default balanced color scheme',
  colors: {
    // Primary colors
    primary: chalk.blue,
    secondary: chalk.cyan,
    accent: chalk.magenta,
    
    // Status colors
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.cyan,
    
    // Text colors
    text: chalk.white,
    textMuted: chalk.gray,
    textBright: chalk.whiteBright,
    
    // UI element colors
    prompt: chalk.green,
    command: chalk.cyan,
    response: chalk.white,
    border: chalk.gray,
    background: chalk.black,
    
    // Code colors
    codeKeyword: chalk.blue,
    codeString: chalk.green,
    codeComment: chalk.gray,
    codeFunction: chalk.yellow,
    codeVariable: chalk.cyan,
    
    // Markdown colors
    heading1: chalk.bold.cyan.underline,
    heading2: chalk.bold.yellow,
    heading3: chalk.bold.green,
    bold: chalk.bold,
    italic: chalk.italic,
    link: chalk.blue.underline,
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    listMarker: chalk.cyan,
    
    // Special elements
    spinner: chalk.cyan,
    progressBar: chalk.blue,
    badge: chalk.bgBlue.white,
    highlight: chalk.bgYellow.black
  }
};

/**
 * Dark theme - High contrast for dark terminals
 */
const darkTheme: Theme = {
  name: 'dark',
  description: 'High contrast theme for dark terminals',
  colors: {
    // Primary colors
    primary: chalk.blueBright,
    secondary: chalk.cyanBright,
    accent: chalk.magentaBright,
    
    // Status colors
    success: chalk.greenBright,
    error: chalk.redBright,
    warning: chalk.yellowBright,
    info: chalk.cyanBright,
    
    // Text colors
    text: chalk.whiteBright,
    textMuted: chalk.gray,
    textBright: chalk.whiteBright,
    
    // UI element colors
    prompt: chalk.greenBright,
    command: chalk.cyanBright,
    response: chalk.whiteBright,
    border: chalk.gray,
    background: chalk.black,
    
    // Code colors
    codeKeyword: chalk.blueBright,
    codeString: chalk.greenBright,
    codeComment: chalk.gray,
    codeFunction: chalk.yellowBright,
    codeVariable: chalk.cyanBright,
    
    // Markdown colors
    heading1: chalk.bold.cyanBright.underline,
    heading2: chalk.bold.yellowBright,
    heading3: chalk.bold.greenBright,
    bold: chalk.bold.whiteBright,
    italic: chalk.italic.white,
    link: chalk.blueBright.underline,
    code: chalk.cyanBright,
    blockquote: chalk.gray.italic,
    listMarker: chalk.cyanBright,
    
    // Special elements
    spinner: chalk.cyanBright,
    progressBar: chalk.blueBright,
    badge: chalk.bgBlueBright.white,
    highlight: chalk.bgYellowBright.black
  }
};

/**
 * Light theme - Softer colors for light terminals
 */
const lightTheme: Theme = {
  name: 'light',
  description: 'Soft colors optimized for light terminals',
  colors: {
    // Primary colors
    primary: chalk.blue,
    secondary: chalk.cyan,
    accent: chalk.magenta,
    
    // Status colors
    success: chalk.green,
    error: chalk.red,
    warning: chalk.hex('#FFA500'), // Orange
    info: chalk.blue,
    
    // Text colors
    text: chalk.black,
    textMuted: chalk.gray,
    textBright: chalk.blackBright,
    
    // UI element colors
    prompt: chalk.green,
    command: chalk.blue,
    response: chalk.black,
    border: chalk.gray,
    background: chalk.white,
    
    // Code colors
    codeKeyword: chalk.blue,
    codeString: chalk.green,
    codeComment: chalk.gray,
    codeFunction: chalk.magenta,
    codeVariable: chalk.cyan,
    
    // Markdown colors
    heading1: chalk.bold.blue.underline,
    heading2: chalk.bold.magenta,
    heading3: chalk.bold.green,
    bold: chalk.bold.black,
    italic: chalk.italic.blackBright,
    link: chalk.blue.underline,
    code: chalk.blue,
    blockquote: chalk.gray.italic,
    listMarker: chalk.blue,
    
    // Special elements
    spinner: chalk.blue,
    progressBar: chalk.green,
    badge: chalk.bgBlue.white,
    highlight: chalk.bgYellow.black
  }
};

/**
 * Ocean theme - Blue and aqua tones
 */
const oceanTheme: Theme = {
  name: 'ocean',
  description: 'Ocean-inspired blue and aqua color scheme',
  colors: {
    // Primary colors
    primary: chalk.hex('#006994'), // Deep ocean blue
    secondary: chalk.hex('#00A8CC'), // Bright aqua
    accent: chalk.hex('#00D4FF'), // Light aqua
    
    // Status colors
    success: chalk.hex('#00FF88'), // Sea green
    error: chalk.hex('#FF6B6B'), // Coral red
    warning: chalk.hex('#FFD93D'), // Sandy yellow
    info: chalk.hex('#6BCEFF'), // Sky blue
    
    // Text colors
    text: chalk.hex('#E8F5FF'), // Very light blue
    textMuted: chalk.hex('#7FCDFF'), // Muted blue
    textBright: chalk.white,
    
    // UI element colors
    prompt: chalk.hex('#00FF88'),
    command: chalk.hex('#00D4FF'),
    response: chalk.hex('#E8F5FF'),
    border: chalk.hex('#4A90A4'),
    background: chalk.hex('#001F3F'), // Navy
    
    // Code colors
    codeKeyword: chalk.hex('#00A8CC'),
    codeString: chalk.hex('#00FF88'),
    codeComment: chalk.hex('#7FCDFF'),
    codeFunction: chalk.hex('#FFD93D'),
    codeVariable: chalk.hex('#00D4FF'),
    
    // Markdown colors
    heading1: chalk.bold.hex('#00D4FF').underline,
    heading2: chalk.bold.hex('#00A8CC'),
    heading3: chalk.bold.hex('#00FF88'),
    bold: chalk.bold.hex('#E8F5FF'),
    italic: chalk.italic.hex('#E8F5FF'),
    link: chalk.hex('#6BCEFF').underline,
    code: chalk.hex('#00D4FF'),
    blockquote: chalk.hex('#7FCDFF').italic,
    listMarker: chalk.hex('#00A8CC'),
    
    // Special elements
    spinner: chalk.hex('#00D4FF'),
    progressBar: chalk.hex('#00A8CC'),
    badge: chalk.bgHex('#006994').hex('#E8F5FF'),
    highlight: chalk.bgHex('#FFD93D').hex('#001F3F')
  }
};

/**
 * Forest theme - Green and earth tones
 */
const forestTheme: Theme = {
  name: 'forest',
  description: 'Forest-inspired green and earth color scheme',
  colors: {
    // Primary colors
    primary: chalk.hex('#2D5016'), // Deep forest green
    secondary: chalk.hex('#73A942'), // Leaf green
    accent: chalk.hex('#AAD576'), // Light green
    
    // Status colors
    success: chalk.hex('#5CB85C'), // Success green
    error: chalk.hex('#D9534F'), // Earthy red
    warning: chalk.hex('#F0AD4E'), // Amber
    info: chalk.hex('#5BC0DE'), // Sky blue
    
    // Text colors
    text: chalk.hex('#F5F5DC'), // Beige
    textMuted: chalk.hex('#8B7355'), // Tan
    textBright: chalk.hex('#FFFACD'), // Light yellow
    
    // UI element colors
    prompt: chalk.hex('#73A942'),
    command: chalk.hex('#AAD576'),
    response: chalk.hex('#F5F5DC'),
    border: chalk.hex('#5D4E37'), // Brown
    background: chalk.hex('#1B1B0F'), // Dark earth
    
    // Code colors
    codeKeyword: chalk.hex('#73A942'),
    codeString: chalk.hex('#AAD576'),
    codeComment: chalk.hex('#8B7355'),
    codeFunction: chalk.hex('#F0AD4E'),
    codeVariable: chalk.hex('#5BC0DE'),
    
    // Markdown colors
    heading1: chalk.bold.hex('#AAD576').underline,
    heading2: chalk.bold.hex('#73A942'),
    heading3: chalk.bold.hex('#5CB85C'),
    bold: chalk.bold.hex('#F5F5DC'),
    italic: chalk.italic.hex('#F5F5DC'),
    link: chalk.hex('#5BC0DE').underline,
    code: chalk.hex('#AAD576'),
    blockquote: chalk.hex('#8B7355').italic,
    listMarker: chalk.hex('#73A942'),
    
    // Special elements
    spinner: chalk.hex('#AAD576'),
    progressBar: chalk.hex('#73A942'),
    badge: chalk.bgHex('#2D5016').hex('#F5F5DC'),
    highlight: chalk.bgHex('#F0AD4E').hex('#1B1B0F')
  }
};

/**
 * Available themes
 */
export const themes: Record<string, Theme> = {
  default: defaultTheme,
  dark: darkTheme,
  light: lightTheme,
  ocean: oceanTheme,
  forest: forestTheme
};

/**
 * Theme manager singleton
 */
export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: Theme = defaultTheme;
  private themeOverrides: Partial<ThemeColors> = {};
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }
  
  /**
   * Set the current theme
   */
  setTheme(themeName: string): boolean {
    if (themeName in themes) {
      this.currentTheme = themes[themeName];
      return true;
    }
    return false;
  }
  
  /**
   * Get current theme
   */
  getCurrentTheme(): Theme {
    return this.currentTheme;
  }
  
  /**
   * Get current theme name
   */
  getCurrentThemeName(): string {
    return this.currentTheme.name;
  }
  
  /**
   * Get theme colors
   */
  getColors(): ThemeColors {
    // Merge base theme with any overrides
    return {
      ...this.currentTheme.colors,
      ...this.themeOverrides
    };
  }
  
  /**
   * Get a specific color
   */
  getColor(colorName: keyof ThemeColors): ChalkInstance {
    const colors = this.getColors();
    return colors[colorName];
  }
  
  /**
   * Set color override
   */
  setColorOverride(colorName: keyof ThemeColors, color: ChalkInstance): void {
    this.themeOverrides[colorName] = color;
  }
  
  /**
   * Clear all color overrides
   */
  clearOverrides(): void {
    this.themeOverrides = {};
  }
  
  /**
   * Get available theme names
   */
  getAvailableThemes(): string[] {
    return Object.keys(themes);
  }
  
  /**
   * Get theme description
   */
  getThemeDescription(themeName: string): string | undefined {
    return themes[themeName]?.description;
  }
  
  /**
   * Apply theme to chalk (for global styling)
   */
  applyTheme(): void {
    // This method can be extended to apply theme globally
    // For now, components will use getColors() directly
  }
  
  /**
   * Create custom theme
   */
  createCustomTheme(name: string, description: string, colors: Partial<ThemeColors>): Theme {
    // Start with default theme and override with custom colors
    const customTheme: Theme = {
      name,
      description,
      colors: {
        ...defaultTheme.colors,
        ...colors
      } as ThemeColors
    };
    
    // Add to available themes
    themes[name] = customTheme;
    
    return customTheme;
  }
  
  /**
   * Export theme as JSON
   */
  exportTheme(themeName?: string): string {
    const theme = themeName ? themes[themeName] : this.currentTheme;
    if (!theme) {
      throw new Error(`Theme '${themeName}' not found`);
    }
    
    // Convert chalk instances to color names/hex values
    const exportableTheme = {
      name: theme.name,
      description: theme.description,
      colors: Object.entries(theme.colors).reduce((acc, [key, _value]) => {
        // Store color names as strings (simplified for export)
        acc[key] = key; // In real implementation, we'd extract actual color values
        return acc;
      }, {} as Record<string, string>)
    };
    
    return JSON.stringify(exportableTheme, null, 2);
  }
}

// Export singleton instance
export const themeManager = ThemeManager.getInstance();