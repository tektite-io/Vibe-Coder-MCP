/**
 * CLI Mode Detector
 * Determines whether CLI should run in interactive, one-shot, or help mode
 */

export type CLIMode = 'interactive' | 'oneshot' | 'help';

/**
 * Detect CLI mode based on command line arguments
 * @param args Command line arguments (without node and script)
 * @returns The detected CLI mode
 */
export function detectCLIMode(args: string[]): CLIMode {
  // Help mode has highest priority
  if (args.includes('--help') || args.includes('-h')) {
    return 'help';
  }
  
  // If no arguments or explicit interactive flag, start interactive mode
  if (args.length === 0 || args.includes('--interactive') || args.includes('-i')) {
    return 'interactive';
  }
  
  // Any other arguments mean one-shot mode
  return 'oneshot';
}

/**
 * Check if the CLI should start in interactive mode
 * @param args Command line arguments
 * @returns true if interactive mode should be used
 */
export function isInteractiveMode(args: string[]): boolean {
  return detectCLIMode(args) === 'interactive';
}

/**
 * Extract the request from arguments (filters out flags)
 * @param args Command line arguments
 * @returns The request string without flags
 */
export function extractRequest(args: string[]): string {
  const nonFlagArgs = args.filter(arg => !arg.startsWith('-'));
  return nonFlagArgs.join(' ');
}