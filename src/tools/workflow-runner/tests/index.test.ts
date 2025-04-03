// src/tools/workflow-runner/tests/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as workflowExecutor from '../../../services/workflows/workflowExecutor.js'; // Module to mock - Corrected path
// Assume the tool executor is exported from '../index.js' - Needs creation first
// import { runWorkflowTool } from '../index.js';
import { OpenRouterConfig } from '../../../types/workflow.js'; // Corrected path
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Corrected path
import logger from '../../../logger.js'; // Corrected path
// AppError is imported but not used

// Mock workflowExecutor
const executeWorkflowMock = vi.spyOn(workflowExecutor, 'executeWorkflow');

// Mock logger
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'error').mockImplementation(() => {});

const mockConfig: OpenRouterConfig = { baseUrl: '', apiKey: '', geminiModel: '', perplexityModel: '' };

// Placeholder for the actual executor function until it's created
// In a real scenario, this would be imported from the tool's index file
// Use more specific types instead of 'any'
// Use more specific type interface instead of Record<string, unknown>
interface WorkflowToolParams {
  workflowName: string;
  workflowInput?: Record<string, unknown>;
}

const runWorkflowTool = async (
  params: WorkflowToolParams,
  config: OpenRouterConfig
): Promise<CallToolResult> => {
    const { workflowName, workflowInput = {} } = params;
    logger.info(`Running workflow: ${workflowName}`);
    try {
        // Assume executeWorkflow is called correctly
        // Note: The actual tool implementation might pass a sessionId if available
        const result = await workflowExecutor.executeWorkflow(workflowName, workflowInput, config);

        // Format the result based on success/failure
        if (result.success) {
            let outputText = `## Workflow Execution: Completed\n\n**Status:** ${result.message}\n`;
            if (result.outputs && Object.keys(result.outputs).length > 0) {
                outputText += '\n**Workflow Output Summary:**\n';
                for (const [key, value] of Object.entries(result.outputs)) {
                    outputText += `- ${key}: ${JSON.stringify(value)}\n`;
                }
            }
            return { content: [{ type: 'text', text: outputText }], isError: false };
        } else {
            let errorText = `## Workflow Execution: Failed\n\n**Status:** ${result.message}\n`;
            if (result.error) {
                errorText += '\n**Error Details:**\n';
                if (result.error.stepId) errorText += `- Step ID: ${result.error.stepId}\n`;
                if (result.error.toolName) errorText += `- Tool: ${result.error.toolName}\n`;
                errorText += `- Message: ${result.error.message}\n`;
            }
            return {
                content: [{ type: 'text', text: errorText }],
                isError: true,
                errorDetails: result.error // Pass through the structured error
            };
        }
    } catch (error) {
        logger.error({ err: error, tool: 'run-workflow', workflowName }, `Unexpected error running workflow`);
        const message = error instanceof Error ? error.message : 'Unknown error in workflow runner.';
        return {
            content: [{ type: 'text', text: `Workflow Runner Error: ${message}` }],
            isError: true,
            errorDetails: { type: 'WorkflowRunnerError', message }
        };
    }
};


describe('runWorkflowTool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call executeWorkflow with correct parameters', async () => {
        const mockSuccessResult: workflowExecutor.WorkflowResult = {
            success: true,
            message: 'Workflow completed ok.',
            outputs: { summary: 'Workflow completed ok.' }
        };
        executeWorkflowMock.mockResolvedValue(mockSuccessResult);

        const params = { workflowName: 'myFlow', workflowInput: { key: 'value' } };
        await runWorkflowTool(params, mockConfig);

        expect(executeWorkflowMock).toHaveBeenCalledTimes(1);
        // Check arguments passed to the mock - removed the final undefined sessionId
        expect(executeWorkflowMock).toHaveBeenCalledWith(
            'myFlow',           // workflowName
            { key: 'value' },   // workflowInput
            mockConfig          // config
        );
    });

    it('should format successful workflow result correctly', async () => {
         const mockSuccessResult: workflowExecutor.WorkflowResult = {
             success: true,
             message: 'Workflow completed ok.',
             outputs: { finalMsg: 'All done!' }
         };
         executeWorkflowMock.mockResolvedValue(mockSuccessResult);

         const result = await runWorkflowTool({ workflowName: 'myFlow' }, mockConfig);

         expect(result.isError).toBe(false); // Workflow success means tool success
         expect(result.content[0].text).toContain('## Workflow Execution: Completed');
         expect(result.content[0].text).toContain('**Status:** Workflow completed ok.');
         expect(result.content[0].text).toContain('**Workflow Output Summary:**');
         // Use JSON.stringify for comparison as the placeholder does
         expect(result.content[0].text).toContain(`- finalMsg: ${JSON.stringify('All done!')}`);
    });

    it('should format failed workflow result correctly', async () => {
         const mockFailResult: workflowExecutor.WorkflowResult = {
             success: false,
             message: 'Workflow "myFlow" failed at step 1 (toolA): Tool Error',
             error: { stepId: 'step1', toolName: 'toolA', message: 'Tool Error' }
         };
         executeWorkflowMock.mockResolvedValue(mockFailResult);

         const result = await runWorkflowTool({ workflowName: 'myFlow' }, mockConfig);

         expect(result.isError).toBe(true); // Workflow fail means tool error result
         expect(result.content[0].text).toContain('## Workflow Execution: Failed');
         expect(result.content[0].text).toContain('**Status:** Workflow "myFlow" failed at step 1 (toolA): Tool Error');
         expect(result.content[0].text).toContain('**Error Details:**');
         expect(result.content[0].text).toContain('- Step ID: step1');
         expect(result.content[0].text).toContain('- Tool: toolA');
         expect(result.content[0].text).toContain('- Message: Tool Error');
         expect(result.errorDetails).toEqual(mockFailResult.error); // Pass through error details
    });

     it('should handle unexpected errors from executeWorkflow itself', async () => {
          const unexpectedError = new Error('Executor service crashed');
          executeWorkflowMock.mockRejectedValue(unexpectedError);

          const result = await runWorkflowTool({ workflowName: 'myFlow' }, mockConfig);

          expect(result.isError).toBe(true);
          expect(result.content[0].text).toContain(`Workflow Runner Error: ${unexpectedError.message}`);
          expect((result.errorDetails as { type: string })?.type).toBe('WorkflowRunnerError'); // Or AppError if wrapped
     });
});
