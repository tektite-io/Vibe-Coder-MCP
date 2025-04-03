// src/tools/code-refactor-generator/schema.ts
import { z } from 'zod';

export const codeRefactorInputSchema = z.object({
    language: z.string().min(1)
        .describe("The programming language of the code snippet (e.g., 'typescript', 'python', 'javascript')"),
    codeContent: z.string().min(1)
        .describe("The actual code snippet to be refactored."),
    refactoringInstructions: z.string().min(1)
        .describe("Specific instructions on how the code should be refactored (e.g., 'extract the loop into a separate function', 'improve variable names', 'add error handling', 'convert promises to async/await')."),
    contextFilePath: z.string().optional()
         .describe("Optional relative path to a file whose content provides broader context for the refactoring task."),
});

export type CodeRefactorInput = z.infer<typeof codeRefactorInputSchema>;
