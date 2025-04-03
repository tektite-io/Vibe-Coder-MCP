import { z } from 'zod';
export declare const workflowRunnerInputSchema: z.ZodObject<{
    workflowName: z.ZodString;
    workflowInput: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    workflowName: string;
    workflowInput?: Record<string, any> | undefined;
}, {
    workflowName: string;
    workflowInput?: Record<string, any> | undefined;
}>;
export type WorkflowRunnerInput = z.infer<typeof workflowRunnerInputSchema>;
