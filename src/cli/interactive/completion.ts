/**
 * Auto-completion for interactive CLI
 */

export class AutoCompleter {
  private tools: string[] = [];
  private commands: string[] = [
    '/help',
    '/quit',
    '/exit',
    '/clear',
    '/history',
    '/tools',
    '/status',
    '/export',
    '/save',
    '/load'
  ];
  
  private commonPhrases: string[] = [
    'research',
    'create',
    'generate',
    'analyze',
    'map',
    'curate',
    'list',
    'show',
    'explain',
    'help me with',
    'how to',
    'what is',
    'can you'
  ];
  
  /**
   * Set available tools
   */
  setTools(tools: string[]): void {
    this.tools = tools;
  }
  
  /**
   * Set available commands
   */
  setCommands(commands: string[]): void {
    this.commands = commands;
  }
  
  /**
   * Complete input
   */
  complete(line: string): [string[], string] {
    const completions: string[] = [];
    const lowerLine = line.toLowerCase();
    
    if (line.startsWith('/')) {
      // Complete slash commands
      completions.push(...this.commands.filter(cmd => 
        cmd.toLowerCase().startsWith(lowerLine)
      ));
    } else {
      // Complete common phrases and tool names
      const words = line.split(' ');
      const lastWord = words[words.length - 1].toLowerCase();
      
      // Check if we're starting a new phrase
      if (words.length === 1) {
        // Complete common starting phrases
        completions.push(...this.commonPhrases.filter(phrase =>
          phrase.toLowerCase().startsWith(lastWord)
        ));
      }
      
      // Check for tool names
      if (line.includes('use') || line.includes('run') || line.includes('execute')) {
        completions.push(...this.tools.filter(tool =>
          tool.toLowerCase().includes(lastWord)
        ));
      }
      
      // Add contextual completions based on the phrase
      if (lowerLine.includes('research')) {
        completions.push('research TypeScript best practices', 'research React hooks', 'research Node.js performance');
      } else if (lowerLine.includes('generate')) {
        completions.push('generate PRD', 'generate user stories', 'generate task list', 'generate rules');
      } else if (lowerLine.includes('create')) {
        completions.push('create fullstack app', 'create React component', 'create API endpoint');
      } else if (lowerLine.includes('map')) {
        completions.push('map codebase', 'map dependencies', 'map architecture');
      }
    }
    
    // Remove duplicates and sort
    const uniqueCompletions = [...new Set(completions)].sort();
    
    return [uniqueCompletions, line];
  }
  
  /**
   * Get suggestions for empty input
   */
  getSuggestions(): string[] {
    return [
      'Try: "research [topic]" to search for information',
      'Try: "generate PRD for [product]" to create requirements',
      'Try: "map codebase" to analyze code structure',
      'Try: "/help" to see all commands',
      'Try: "/tools" to list available tools'
    ];
  }
}