import { Command } from 'commander';
import { getProjectOperations, CreateProjectParams } from '../../core/operations/project-operations.js';
import { getTaskOperations, CreateTaskParams } from '../../core/operations/task-operations.js';
import { CLIUtils } from './index.js';
import logger from '../../../../logger.js';

/**
 * Create command for projects, epics, and tasks
 */
export const createCommand = new Command('create')
  .description('Create new projects, epics, or tasks')
  .configureHelp({
    sortSubcommands: true
  });

/**
 * Create project subcommand
 */
const createProjectCommand = new Command('project')
  .description('Create a new project')
  .argument('<name>', 'Project name')
  .argument('<description>', 'Project description')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('-l, --languages <languages>', 'Programming languages (comma-separated)')
  .option('-f, --frameworks <frameworks>', 'Frameworks (comma-separated)')
  .option('-t, --tools <tools>', 'Development tools (comma-separated)')
  .option('--tags <tags>', 'Project tags (comma-separated)')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .action(async (name: string, description: string, options) => {
    try {
      logger.info({ name, description, options }, 'Creating project via CLI');

      // Validate required parameters
      CLIUtils.validateRequired({ name, description }, ['name', 'description']);

      // Parse options
      const languages = CLIUtils.parseTags(options.languages);
      const frameworks = CLIUtils.parseTags(options.frameworks);
      const tools = CLIUtils.parseTags(options.tools);
      const tags = CLIUtils.parseTags(options.tags);

      // Prepare project creation parameters
      const createParams: CreateProjectParams = {
        name,
        description,
        rootPath: options.path,
        techStack: {
          languages,
          frameworks,
          tools
        },
        tags
      };

      // Create project
      const projectOperations = getProjectOperations();
      const result = await projectOperations.createProject(createParams, 'cli-user');

      if (!result.success) {
        CLIUtils.error(`Failed to create project: ${result.error}`);
      }

      const project = result.data!;

      // Display success message
      CLIUtils.success(`Project created successfully!`);
      
      // Display project details
      const displayData = {
        ID: project.id,
        Name: project.name,
        Description: CLIUtils.truncate(project.description, 60),
        Status: project.status,
        'Root Path': project.rootPath,
        'Created At': CLIUtils.formatDate(project.metadata.createdAt),
        Tags: project.metadata.tags.join(', ') || 'None'
      };

      console.log('\nProject Details:');
      console.log(CLIUtils.formatOutput(displayData, options.format));

      if (project.techStack.languages.length > 0 || 
          project.techStack.frameworks.length > 0 || 
          project.techStack.tools.length > 0) {
        console.log('\nTech Stack:');
        const techStackData = {
          Languages: project.techStack.languages.join(', ') || 'None',
          Frameworks: project.techStack.frameworks.join(', ') || 'None',
          Tools: project.techStack.tools.join(', ') || 'None'
        };
        console.log(CLIUtils.formatOutput(techStackData, options.format));
      }

      logger.info({ projectId: project.id }, 'Project created successfully via CLI');

    } catch (error) {
      logger.error({ err: error, name, description }, 'Failed to create project via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Create task subcommand
 */
const createTaskCommand = new Command('task')
  .description('Create a new task')
  .argument('<title>', 'Task title')
  .argument('<description>', 'Task description')
  .requiredOption('-p, --project <projectId>', 'Project ID')
  .requiredOption('-e, --epic <epicId>', 'Epic ID')
  .option('--priority <priority>', 'Task priority (low|medium|high|critical)', 'medium')
  .option('--type <type>', 'Task type (development|testing|documentation|research)', 'development')
  .option('--hours <hours>', 'Estimated hours', '4')
  .option('--files <files>', 'File paths (comma-separated)')
  .option('--criteria <criteria>', 'Acceptance criteria (comma-separated)')
  .option('--tags <tags>', 'Task tags (comma-separated)')
  .option('--agent <agent>', 'Assigned agent')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .action(async (title: string, description: string, options) => {
    try {
      logger.info({ title, description, options }, 'Creating task via CLI');

      // Validate required parameters
      CLIUtils.validateRequired({ title, description, project: options.project, epic: options.epic }, 
        ['title', 'description', 'project', 'epic']);

      // Parse options
      const estimatedHours = parseFloat(options.hours);
      if (isNaN(estimatedHours) || estimatedHours < 0) {
        CLIUtils.error('Estimated hours must be a non-negative number');
      }

      const filePaths = CLIUtils.parseTags(options.files);
      const acceptanceCriteria = CLIUtils.parseTags(options.criteria);
      const tags = CLIUtils.parseTags(options.tags);

      // Validate priority and type
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(options.priority)) {
        CLIUtils.error(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
      }

      const validTypes = ['development', 'testing', 'documentation', 'research'];
      if (!validTypes.includes(options.type)) {
        CLIUtils.error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
      }

      // Prepare task creation parameters
      const createParams: CreateTaskParams = {
        title,
        description,
        projectId: options.project,
        epicId: options.epic,
        priority: options.priority,
        type: options.type,
        estimatedHours,
        filePaths,
        acceptanceCriteria,
        tags,
        assignedAgent: options.agent
      };

      // Create task
      const taskOperations = getTaskOperations();
      const result = await taskOperations.createTask(createParams, 'cli-user');

      if (!result.success) {
        CLIUtils.error(`Failed to create task: ${result.error}`);
      }

      const task = result.data!;

      // Display success message
      CLIUtils.success(`Task created successfully!`);
      
      // Display task details
      const displayData = {
        ID: task.id,
        Title: task.title,
        Description: CLIUtils.truncate(task.description, 60),
        Status: task.status,
        Priority: task.priority,
        Type: task.type,
        'Project ID': task.projectId,
        'Epic ID': task.epicId,
        'Estimated Hours': task.estimatedHours,
        'Assigned Agent': task.assignedAgent || 'None',
        'Created At': CLIUtils.formatDate(task.metadata.createdAt),
        Tags: task.metadata.tags.join(', ') || 'None'
      };

      console.log('\nTask Details:');
      console.log(CLIUtils.formatOutput(displayData, options.format));

      if (task.filePaths.length > 0) {
        console.log('\nFile Paths:');
        task.filePaths.forEach((filePath, index) => {
          console.log(`  ${index + 1}. ${filePath}`);
        });
      }

      if (task.acceptanceCriteria.length > 0) {
        console.log('\nAcceptance Criteria:');
        task.acceptanceCriteria.forEach((criteria, index) => {
          console.log(`  ${index + 1}. ${criteria}`);
        });
      }

      logger.info({ taskId: task.id }, 'Task created successfully via CLI');

    } catch (error) {
      logger.error({ err: error, title, description }, 'Failed to create task via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

/**
 * Create epic subcommand (placeholder for future implementation)
 */
const createEpicCommand = new Command('epic')
  .description('Create a new epic')
  .argument('<title>', 'Epic title')
  .argument('<description>', 'Epic description')
  .requiredOption('-p, --project <projectId>', 'Project ID')
  .option('--priority <priority>', 'Epic priority (low|medium|high|critical)', 'medium')
  .option('--hours <hours>', 'Estimated hours', '40')
  .option('--tags <tags>', 'Epic tags (comma-separated)')
  .option('--format <format>', 'Output format (table|json|yaml)', 'table')
  .action(async (title: string, description: string, options) => {
    try {
      logger.info({ title, description, options }, 'Creating epic via CLI');

      CLIUtils.warning('Epic creation is not yet implemented.');
      CLIUtils.info('This feature will be available in a future release.');
      
      // For now, just show what would be created
      console.log('\nEpic would be created with:');
      const displayData = {
        Title: title,
        Description: CLIUtils.truncate(description, 60),
        'Project ID': options.project,
        Priority: options.priority,
        'Estimated Hours': options.hours,
        Tags: options.tags || 'None'
      };
      console.log(CLIUtils.formatOutput(displayData, options.format));

    } catch (error) {
      logger.error({ err: error, title, description }, 'Failed to create epic via CLI');
      CLIUtils.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  });

// Add subcommands to create command
createCommand.addCommand(createProjectCommand);
createCommand.addCommand(createTaskCommand);
createCommand.addCommand(createEpicCommand);

// Add help examples
createCommand.addHelpText('after', `
Examples:
  $ vibe-tasks create project "My Web App" "A modern web application" --languages typescript,javascript --frameworks react,node.js
  $ vibe-tasks create task "Implement login" "Create user authentication system" --project PID-WEBAPP-001 --epic E001 --priority high
  $ vibe-tasks create epic "User Management" "Complete user management system" --project PID-WEBAPP-001
`);
