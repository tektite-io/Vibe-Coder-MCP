import { z } from 'zod';

// Define reusable schemas for nested parts
const techStackItemSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  rationale: z.string(),
});

// Lazy-loaded schema for recursive directory structures
const fileStructureItemSchemaContents: z.ZodTypeAny = z.lazy(() =>
  z.object({
    path: z.string().min(1, "Path cannot be empty"),
    type: z.enum(['file', 'directory']),
    content: z.string().nullable(),
    generationPrompt: z.string().nullable().optional(),
    children: z.array(fileStructureItemSchemaContents).optional(), // Recursive part
  }).refine(data => data.type === 'directory' || (data.children === undefined || data.children.length === 0) , {
    message: "Files cannot have children arrays (unless empty or undefined).", path: ["children"]
  }).refine(data => {
    if (data.type === 'directory' && (data.content !== null && data.content !== undefined)) {
        return false; // Directories should not have direct content string
    }
    return true;
  }, {
    message: "Directories should have null content.", path: ["content"]
  }).refine(data => {
    if (data.content !== null && data.content !== undefined) {
      return data.generationPrompt === null || data.generationPrompt === undefined;
    }
    return true;
  }, {
    message: "Cannot have both direct content and a generationPrompt for a file.", path: ["content"]
  })
);

// Export the Zod schema itself for validation elsewhere
export const fileStructureItemSchema = fileStructureItemSchemaContents;

// Export the inferred TypeScript type for this schema
export type FileStructureItem = z.infer<typeof fileStructureItemSchemaContents>;


// Define the main schema
export const starterKitDefinitionSchema = z.object({
  projectName: z.string().min(1),
  description: z.string(),
  techStack: z.record(techStackItemSchema),
  directoryStructure: z.array(fileStructureItemSchema), // Uses the exported recursive type
  dependencies: z.object({
    npm: z.object({
      root: z.object({
        dependencies: z.record(z.string()).optional(),
        devDependencies: z.record(z.string()).optional(),
      }).optional(),
    }).catchall(z.object({ // Allows for sub-directories like 'client', 'server'
      dependencies: z.record(z.string()).optional(),
      devDependencies: z.record(z.string()).optional(),
    })).optional(),
    // Potentially add other package managers here like 'yarn', 'pnpm'
  }),
  setupCommands: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

export type StarterKitDefinition = z.infer<typeof starterKitDefinitionSchema>;