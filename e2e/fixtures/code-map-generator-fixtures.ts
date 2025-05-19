/**
 * Fixtures for Code Map Generator end-to-end tests
 */

import { JobStatus } from '../../src/services/job-manager/index.js';

/**
 * Create a simple project structure for testing
 * @returns Map of file paths to file contents
 */
export function createSimpleProjectStructure(): Map<string, string> {
  return new Map<string, string>([
    ['index.js', 'const utils = require("./utils");\n\nfunction main() {\n  utils.helper();\n}\n\nmain();'],
    ['utils.js', 'function helper() {\n  console.log("Helper function");\n}\n\nmodule.exports = { helper };'],
    ['src/app.js', 'const config = require("../config");\n\nclass App {\n  constructor() {\n    this.config = config;\n  }\n\n  start() {\n    console.log("App started");\n  }\n}\n\nmodule.exports = App;'],
    ['config.js', 'module.exports = {\n  port: 3000,\n  host: "localhost"\n};'],
  ]);
}

/**
 * Create a complex project structure for testing
 * @returns Map of file paths to file contents
 */
export function createComplexProjectStructure(): Map<string, string> {
  return new Map<string, string>([
    ['index.js', 'const express = require("express");\nconst app = require("./src/app");\n\nconst server = new app();\nserver.start();\n'],
    ['src/app.js', 'const config = require("./config");\nconst routes = require("./routes");\nconst db = require("./db");\n\nclass App {\n  constructor() {\n    this.config = config;\n    this.db = new db();\n    this.routes = routes;\n  }\n\n  start() {\n    console.log("App started on port", this.config.port);\n    this.db.connect();\n  }\n}\n\nmodule.exports = App;'],
    ['src/config.js', 'module.exports = {\n  port: 3000,\n  host: "localhost",\n  db: {\n    host: "localhost",\n    port: 27017,\n    name: "test"\n  }\n};'],
    ['src/db.js', 'class Database {\n  constructor() {\n    this.connected = false;\n  }\n\n  connect() {\n    this.connected = true;\n    console.log("Database connected");\n  }\n\n  disconnect() {\n    this.connected = false;\n    console.log("Database disconnected");\n  }\n}\n\nmodule.exports = Database;'],
    ['src/routes.js', 'const express = require("express");\nconst router = express.Router();\nconst userController = require("./controllers/user");\n\nrouter.get("/users", userController.getUsers);\nrouter.post("/users", userController.createUser);\n\nmodule.exports = router;'],
    ['src/controllers/user.js', 'const User = require("../models/user");\n\nfunction getUsers(req, res) {\n  const users = User.findAll();\n  res.json(users);\n}\n\nfunction createUser(req, res) {\n  const user = new User(req.body);\n  user.save();\n  res.json(user);\n}\n\nmodule.exports = {\n  getUsers,\n  createUser\n};'],
    ['src/models/user.js', 'class User {\n  constructor(data) {\n    this.id = data.id || Math.random().toString(36).substr(2, 9);\n    this.name = data.name;\n    this.email = data.email;\n  }\n\n  save() {\n    console.log("User saved");\n    return this;\n  }\n\n  static findAll() {\n    return [];\n  }\n}\n\nmodule.exports = User;'],
  ]);
}

/**
 * Create expected job status updates for Code Map Generator
 * @param jobId Job ID
 * @returns Expected job status updates
 */
export function createExpectedCodeMapJobStatusUpdates(jobId: string) {
  return [
    {
      jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Initializing code map generator',
      progress: 10,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Scanning files',
      progress: 30,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Parsing files',
      progress: 50,
      pollInterval: 800,
    },
    {
      jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Building dependency graph',
      progress: 70,
      pollInterval: 500,
    },
    {
      jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Generating diagrams',
      progress: 90,
      pollInterval: 200,
    },
    {
      jobId,
      status: JobStatus.COMPLETED,
      message: 'Code map generated successfully',
      progress: 100,
      pollInterval: 0,
    },
  ];
}

/**
 * Create expected markdown sections for Code Map Generator
 * @returns Expected markdown sections
 */
export function createExpectedMarkdownSections() {
  return [
    'Code Map for project',
    'File Dependency Diagram',
    'Class Diagram',
    'Function Call Diagram',
    'Detailed Code Structure',
  ];
}

/**
 * Create expected error messages for Code Map Generator
 * @returns Expected error messages
 */
export function createExpectedErrorMessages() {
  return [
    'Error: ENOENT: no such file or directory',
    'Error: Failed to scan directory',
    'Error: Failed to parse file',
    'Error: Failed to build dependency graph',
    'Error: Failed to generate diagrams',
  ];
}
