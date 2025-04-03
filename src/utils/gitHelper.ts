// src/utils/gitHelper.ts
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import logger from '../logger.js'; // Adjust path if necessary
import { AppError } from './errors.js'; // Adjust path if necessary

const options: Partial<SimpleGitOptions> = {
   baseDir: process.cwd(), // Use the current working directory
   binary: 'git',
   maxConcurrentProcesses: 6,
   trimmed: false,
};

// Initialize simple-git
// Note: This assumes the CWD is the root of the intended repository.
// For MCP tools, the baseDir might need to be configurable or passed in.
const git: SimpleGit = simpleGit(options);

/**
 * Options for retrieving Git diff summary.
 */
interface GitDiffOptions {
   /** If true, get the diff for staged changes only (git diff --staged). Otherwise, get unstaged changes. */
   staged?: boolean;
   // Add other options like target branch later if needed
}

/**
 * Retrieves a summary of the current Git differences (diff).
 * Checks if the current directory is a Git repository before executing diff.
 *
 * @param options Options to control the diff (e.g., staged only). Defaults to unstaged changes.
 * @returns A promise that resolves with the diff output string, or a message indicating no changes.
 * @throws {AppError} If the command fails, it's not a Git repository, or git is not found.
 */
export async function getGitDiffSummary(options: GitDiffOptions = {}): Promise<string> {
  logger.debug(`Getting Git diff summary (staged: ${!!options.staged}) in directory: ${process.cwd()}`);
  try {
    // Check if it's a repo first. This also implicitly checks if git command is available.
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      // Consider if this should be a specific error type, e.g., NotAGitRepoError
      throw new AppError('Not a Git repository or git command not found.');
    }

    // Prepare diff options for simple-git's diff method
    const diffArgs: string[] = []; // simple-git diff takes an array of string options
    if (options.staged) {
      diffArgs.push('--staged');
    }
    // By default (no --staged), git.diff() shows unstaged changes against HEAD.

    // Execute the diff command
    const diffSummary = await git.diff(diffArgs);

    // Handle the case where there are no changes
    if (!diffSummary) {
        const noChangesMessage = options.staged ? "No staged changes found." : "No unstaged changes found.";
        logger.info(noChangesMessage);
        return noChangesMessage;
    }

    logger.info(`Successfully retrieved Git diff (staged: ${!!options.staged})`);
    return diffSummary;

  } catch (error: unknown) {
    logger.error({ err: error, options }, 'Failed to get Git diff summary.');

    // Improve error message based on simple-git errors if possible
    let errorMessage = 'Failed to get Git diff.';
    if (error instanceof AppError) {
        // Re-throw specific errors like "Not a Git repository"
        throw error;
    } else if (error instanceof Error) {
        // Include message from simple-git error
        errorMessage += ` Reason: ${error.message}`;
    } else if (typeof error === 'object' && error !== null && 'message' in error) {
        // Handle error objects with message property
        errorMessage += ` Reason: ${String((error as {message: unknown}).message)}`;
    }

    // Wrap other errors in AppError
    throw new AppError(errorMessage, { options }, error instanceof Error ? error : undefined);
  }
}
