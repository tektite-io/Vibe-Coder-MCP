import { Command } from 'commander';
import { getProjectOperations, ProjectQueryParams } from '../../core/operations/project-operations.js';
import { getTaskOperations, TaskQueryParams } from '../../core/operations/task-operations.js';
import { CLIUtils } from './index.js';
import logger from '../../../../logger.js';

/**
 * List command for projects, epics, and tasks
 */
export const listCommand = new Command('list')
  .description('List projects, epics, or tasks')
  .configureHelp({
    sortSubcommands: true
  });

/**
 * List projects subcommand
 */
const listProjectsCommand = new Command('projects')
  .description('List all projects')
  .option('-s, --status <status>', 'Filter by status (pending|in_progress|completed|blocked|cancelled)')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('--created-after <date>', 'Filter by creation date (YYYY-MM-DD)')
  .option('--created-before <date>', 'Filter by creation date (YYYY-MM-DD)')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('-o, --offset <number>', 'Offset for pagination', '0')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .action(async (options) => {
    try {
      logger.info({ options }, 'Listing projects via CLI');

      // Parse options
      const limit = parseInt(options.limit);
      const offset = parseInt(options.offset);
      
      if (isNaN(limit) || limit < 1) {
        CLIUtils.error('Limit must be a positive number');
      }
      
      if (isNaN(offset) || offset < 0) {
        CLIUtils.error('Offset must be a non-negative number');
      }

      const tags = CLIUtils.parseTags(options.tags);
      
      // Parse dates
      let createdAfter: Date | undefined;
      let createdBefore: Date | undefined;
      
      if (options.createdAfter) {
        createdAfter = new Date(options.createdAfter);
        if (isNaN(createdAfter.getTime())) {
          CLIUtils.error('Invalid created-after date format. Use YYYY-MM-DD');
        }
      }
      
      if (options.createdBefore) {
        createdBefore = new Date(options.createdBefore);
        if (isNaN(createdBefore.getTime())) {
          CLIUtils.error('Invalid created-before date format. Use YYYY-MM-DD');
        }
      }

      // Validate status
      if (options.status) {
        const validStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];
        if (!validStatuses.includes(options.status)) {
          CLIUtils.error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }
      }

      // Prepare query parameters
      const queryParams: ProjectQueryParams = {
        status: options.status,
        tags: tags.length > 0 ? tags : undefined,
        createdAfter,
        createdBefore,
        limit,
        offset
      };

      // Get projects
      const projectOperations = getProjectOperations();
      const result = await projectOperations.listProjects(queryParams);

      if (!result.success) {
        CLIUtils.error(`Failed to list projects: ${result.error}`);
      }

      const projects = result.data!;

      if (projects.length === 0) {
        CLIUtils.info('No projects found matching the criteria.');
        return;
      }

      // Display projects
      console.log(`Found ${projects.length} project(s):\n`);

      if (options.format === 'table') {
        const displayData = projects.map(project => ({
          ID: project.id,
          Name: CLIUtils.truncate(project.name, 30),
          Status: project.status,
          'Tech Stack': project.techStack.languages.slice(0, 2).join(', ') + 
                       (project.techStack.languages.length > 2 ? '...' : ''),
          'Created': CLIUtils.formatDate(project.metadata.createdAt).split(' ')[0],
          Tags: CLIUtils.truncate(project.metadata.tags.join(', '), 20) || 'None'
        }));

        console.log(CLIUtils.formatOutput(displayData, 'table'));
      } else {
        console.log(CLIUtils.formatOutput(projects, options.format));
      }

      // Show pagination info
      if (projects.length === limit) {
        CLIUtils.info(`Showing ${limit} results. Use --offset ${offset + limit} to see more.`);
      }

      logger.info({ projectCount: projects.length }, 'Listed projects successfully via CLI');

    } catch (error) {
      logger.error({ err: error, options }, 'Failed to list projects via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * List tasks subcommand
 */
const listTasksCommand = new Command('tasks')
  .description('List tasks')
  .option('-p, --project <projectId>', 'Filter by project ID')
  .option('-e, --epic <epicId>', 'Filter by epic ID')
  .option('-s, --status <status>', 'Filter by status (pending|in_progress|completed|blocked|cancelled)')
  .option('--priority <priority>', 'Filter by priority (low|medium|high|critical)')
  .option('--type <type>', 'Filter by type (development|testing|documentation|research)')
  .option('-a, --agent <agent>', 'Filter by assigned agent')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('--created-after <date>', 'Filter by creation date (YYYY-MM-DD)')
  .option('--created-before <date>', 'Filter by creation date (YYYY-MM-DD)')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('-o, --offset <number>', 'Offset for pagination', '0')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .action(async (options) => {
    try {
      logger.info({ options }, 'Listing tasks via CLI');

      // Parse options
      const limit = parseInt(options.limit);
      const offset = parseInt(options.offset);
      
      if (isNaN(limit) || limit < 1) {
        CLIUtils.error('Limit must be a positive number');
      }
      
      if (isNaN(offset) || offset < 0) {
        CLIUtils.error('Offset must be a non-negative number');
      }

      const tags = CLIUtils.parseTags(options.tags);
      
      // Parse dates
      let createdAfter: Date | undefined;
      let createdBefore: Date | undefined;
      
      if (options.createdAfter) {
        createdAfter = new Date(options.createdAfter);
        if (isNaN(createdAfter.getTime())) {
          CLIUtils.error('Invalid created-after date format. Use YYYY-MM-DD');
        }
      }
      
      if (options.createdBefore) {
        createdBefore = new Date(options.createdBefore);
        if (isNaN(createdBefore.getTime())) {
          CLIUtils.error('Invalid created-before date format. Use YYYY-MM-DD');
        }
      }

      // Validate enum values
      if (options.status) {
        const validStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];
        if (!validStatuses.includes(options.status)) {
          CLIUtils.error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }
      }

      if (options.priority) {
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (!validPriorities.includes(options.priority)) {
          CLIUtils.error(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
        }
      }

      if (options.type) {
        const validTypes = ['development', 'testing', 'documentation', 'research'];
        if (!validTypes.includes(options.type)) {
          CLIUtils.error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
        }
      }

      // Prepare query parameters
      const queryParams: TaskQueryParams = {
        projectId: options.project,
        epicId: options.epic,
        status: options.status,
        priority: options.priority,
        type: options.type,
        assignedAgent: options.agent,
        tags: tags.length > 0 ? tags : undefined,
        createdAfter,
        createdBefore,
        limit,
        offset
      };

      // Get tasks
      const taskOperations = getTaskOperations();
      const result = await taskOperations.listTasks(queryParams);

      if (!result.success) {
        CLIUtils.error(`Failed to list tasks: ${result.error}`);
      }

      const tasks = result.data!;

      if (tasks.length === 0) {
        CLIUtils.info('No tasks found matching the criteria.');
        return;
      }

      // Display tasks
      console.log(`Found ${tasks.length} task(s):\n`);

      if (options.format === 'table') {
        const displayData = tasks.map(task => ({
          ID: task.id,
          Title: CLIUtils.truncate(task.title, 30),
          Status: task.status,
          Priority: task.priority,
          Type: task.type,
          'Project': task.projectId,
          'Epic': task.epicId,
          'Hours': task.estimatedHours,
          'Agent': CLIUtils.truncate(task.assignedAgent || 'None', 15),
          'Created': CLIUtils.formatDate(task.metadata.createdAt).split(' ')[0]
        }));

        console.log(CLIUtils.formatOutput(displayData, 'table'));
      } else {
        console.log(CLIUtils.formatOutput(tasks, options.format));
      }

      // Show pagination info
      if (tasks.length === limit) {
        CLIUtils.info(`Showing ${limit} results. Use --offset ${offset + limit} to see more.`);
      }

      logger.info({ taskCount: tasks.length }, 'Listed tasks successfully via CLI');

    } catch (error) {
      logger.error({ err: error, options }, 'Failed to list tasks via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * List epics subcommand (placeholder for future implementation)
 */
const listEpicsCommand = new Command('epics')
  .description('List epics')
  .option('-p, --project <projectId>', 'Filter by project ID')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .action(async (options) => {
    try {
      logger.info({ options }, 'Listing epics via CLI');

      CLIUtils.warning('Epic listing is not yet implemented.');
      CLIUtils.info('This feature will be available in a future release.');
      
      if (options.project) {
        CLIUtils.info(`Would list epics for project: ${options.project}`);
      } else {
        CLIUtils.info('Would list all epics');
      }

    } catch (error) {
      logger.error({ err: error, options }, 'Failed to list epics via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

// Add subcommands to list command
listCommand.addCommand(listProjectsCommand);
listCommand.addCommand(listTasksCommand);
listCommand.addCommand(listEpicsCommand);

// Add help examples
listCommand.addHelpText('after', `
Examples:
  $ vibe-tasks list projects --status in_progress --limit 10
  $ vibe-tasks list tasks --project PID-WEBAPP-001 --status pending --priority high
  $ vibe-tasks list tasks --agent "development-agent" --created-after 2024-01-01
  $ vibe-tasks list epics --project PID-WEBAPP-001
`);
