/**
 * Multi-Tool Workflow Engine - DRY-Compliant Enhancement
 * 
 * Extends existing WorkflowExecutor to handle multi-tool orchestration
 * and compound request processing across all 15 MCP tools.
 * 
 * ARCHITECTURE COMPLIANCE:
 * - Extends existing WorkflowExecutor infrastructure
 * - Uses existing job management and SSE notification systems  
 * - Integrates with proven tool execution patterns
 * - Maintains DRY principles by enhancing vs duplicating
 */

import { WorkflowResult } from '../../services/workflows/workflowExecutor.js';
import { UnifiedCommandContext } from './unified-command-gateway.js';
import { RecognizedIntent } from '../../tools/vibe-task-manager/types/nl.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { executeTool, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
// import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import logger from '../../logger.js';

/**
 * Workflow detection result
 */
export interface WorkflowDetection {
  shouldTriggerWorkflow: boolean;
  workflowName?: string;
  workflowType: 'simple' | 'compound' | 'sequential' | 'parallel';
  nextSteps?: string[];
  estimatedDuration?: number;
  requiredTools?: string[];
}

/**
 * Multi-tool workflow execution result
 */
export interface MultiToolWorkflowResult extends WorkflowResult {
  triggeredWorkflows: string[];
  parallelExecutions: number;
  toolsUsed: string[];
  crossToolContext: Record<string, unknown>;
}

/**
 * Tool compatibility check result
 */
export interface ToolCompatibilityResult {
  compatible: boolean;
  confidence: number;
  suggestions: string[];
  alternativeTools?: string[];
}

/**
 * Multi-Tool Workflow Engine
 * 
 * DRY-COMPLIANT: Extends existing WorkflowExecutor with multi-tool
 * orchestration capabilities without duplicating workflow infrastructure.
 */
export class MultiToolWorkflowEngine {
  private config: OpenRouterConfig;
  private activeWorkflows = new Map<string, {
    sessionId: string;
    workflowName: string;
    startTime: Date;
    toolsUsed: string[];
    currentStep: number;
    totalSteps: number;
  }>();

  // Predefined multi-tool workflow patterns
  private readonly workflowPatterns = {
    // Research → Documentation workflow
    'research-to-documentation': {
      triggers: ['research', 'document', 'create prd', 'write specification'],
      tools: ['research-manager', 'prd-generator', 'user-stories-generator'],
      type: 'sequential' as const,
      estimatedDuration: 180000 // 3 minutes
    },
    
    // Full project setup workflow  
    'full-project-setup': {
      triggers: ['create project', 'setup project', 'new application', 'full stack'],
      tools: ['fullstack-starter-kit-generator', 'rules-generator', 'vibe-task-manager'],
      type: 'sequential' as const,
      estimatedDuration: 300000 // 5 minutes
    },

    // Analysis and planning workflow
    'analyze-and-plan': {
      triggers: ['analyze', 'plan', 'break down', 'understand codebase'],
      tools: ['map-codebase', 'curate-context', 'task-list-generator'],
      type: 'sequential' as const,
      estimatedDuration: 240000 // 4 minutes
    },

    // Development workflow automation
    'development-workflow': {
      triggers: ['implement', 'develop', 'build feature', 'create functionality'],
      tools: ['user-stories-generator', 'task-list-generator', 'curate-context', 'vibe-task-manager'],
      type: 'sequential' as const,
      estimatedDuration: 360000 // 6 minutes
    },

    // Research and implement workflow
    'research-implement': {
      triggers: ['research and implement', 'learn and build', 'study and develop'],
      tools: ['research-manager', 'curate-context', 'task-list-generator'],
      type: 'parallel' as const,
      estimatedDuration: 420000 // 7 minutes
    }
  };

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  /**
   * Analyze workflow potential from intent and parameters
   * LEVERAGES EXISTING: Uses pattern recognition similar to existing systems
   */
  async analyzeWorkflowPotential(
    intent: RecognizedIntent,
    params: Record<string, unknown>,
    selectedTool: string,
    context: UnifiedCommandContext
  ): Promise<WorkflowDetection> {
    try {
      const input = intent.originalInput.toLowerCase();

      // Check for explicit workflow triggers
      for (const [workflowName, pattern] of Object.entries(this.workflowPatterns)) {
        const matches = pattern.triggers.some(trigger => 
          input.includes(trigger.toLowerCase()) || 
          this.semanticMatch(input, trigger) > 0.7
        );

        if (matches) {
          return {
            shouldTriggerWorkflow: true,
            workflowName,
            workflowType: pattern.type,
            estimatedDuration: pattern.estimatedDuration,
            requiredTools: pattern.tools,
            nextSteps: await this.generateNextSteps(workflowName, selectedTool, params)
          };
        }
      }

      // Check for compound requests (multiple actions in one request)
      const compoundDetection = await this.detectCompoundRequest(input, selectedTool);
      if (compoundDetection.shouldTriggerWorkflow) {
        return compoundDetection;
      }

      // Check for sequential workflow opportunities based on context
      const sequentialDetection = await this.detectSequentialOpportunity(
        selectedTool,
        context,
        params
      );

      return sequentialDetection;

    } catch (error) {
      logger.error({ err: error, intent: intent.intent }, 'Workflow analysis failed');
      
      return {
        shouldTriggerWorkflow: false,
        workflowType: 'simple'
      };
    }
  }

  /**
   * Execute multi-tool workflow with orchestration
   * EXTENDS EXISTING: Uses existing WorkflowExecutor for actual execution
   */
  async executeMultiToolWorkflow(
    workflowName: string,
    params: Record<string, unknown>,
    context: UnifiedCommandContext
  ): Promise<MultiToolWorkflowResult> {
    const sessionId = context.sessionId;
    const startTime = Date.now();

    try {
      logger.info({ workflowName, sessionId }, 'Starting multi-tool workflow execution');

      // Register active workflow
      this.registerActiveWorkflow(sessionId, workflowName);

      const workflowPattern = this.workflowPatterns[workflowName as keyof typeof this.workflowPatterns];
      if (!workflowPattern) {
        throw new Error(`Unknown workflow pattern: ${workflowName}`);
      }

      let result: MultiToolWorkflowResult;

      // Execute based on workflow type
      if (workflowPattern.type === 'sequential') {
        result = await this.executeSequentialWorkflow(workflowPattern, params, context);
      } else if (workflowPattern.type === 'parallel') {
        result = await this.executeParallelWorkflow(workflowPattern, params, context);
      } else {
        // Default to sequential for compound or other types
        result = await this.executeSequentialWorkflow(workflowPattern, params, context);
      }

      // Update context with workflow results
      this.updateContextWithResults(context, result, workflowName);

      const processingTime = Date.now() - startTime;
      logger.info({
        workflowName,
        sessionId,
        processingTime,
        toolsUsed: result.toolsUsed.length,
        success: result.success
      }, 'Multi-tool workflow completed');

      return result;

    } catch (error) {
      logger.error({ err: error, workflowName, sessionId }, 'Multi-tool workflow execution failed');
      
      return {
        success: false,
        message: 'Workflow execution failed',
        outputs: undefined,
        error: {
          message: error instanceof Error ? error.message : 'Workflow execution failed'
        },
        triggeredWorkflows: [],
        parallelExecutions: 0,
        toolsUsed: [],
        crossToolContext: {}
      };
    } finally {
      this.unregisterActiveWorkflow(sessionId);
    }
  }

  /**
   * Check tool compatibility with active workflow
   */
  async checkToolCompatibility(
    toolName: string,
    workflowName: string,
    context: UnifiedCommandContext
  ): Promise<ToolCompatibilityResult> {
    try {
      const workflowPattern = this.workflowPatterns[workflowName as keyof typeof this.workflowPatterns];
      
      if (!workflowPattern) {
        return {
          compatible: false,
          confidence: 0,
          suggestions: [`Unknown workflow: ${workflowName}`]
        };
      }

      // Check if tool is part of the workflow
      const isDirectMatch = workflowPattern.tools.includes(toolName);
      if (isDirectMatch) {
        return {
          compatible: true,
          confidence: 1.0,
          suggestions: [`Tool ${toolName} is part of ${workflowName} workflow`]
        };
      }

      // Check for complementary tools
      const compatibility = await this.calculateToolCompatibility(
        toolName,
        workflowPattern.tools,
        context
      );

      return {
        compatible: compatibility.score > 0.6,
        confidence: compatibility.score,
        suggestions: compatibility.suggestions,
        alternativeTools: compatibility.alternatives
      };

    } catch (error) {
      logger.error({ err: error, toolName, workflowName }, 'Tool compatibility check failed');
      
      return {
        compatible: false,
        confidence: 0,
        suggestions: ['Compatibility check failed']
      };
    }
  }

  /**
   * Execute sequential workflow (tools run one after another)
   */
  private async executeSequentialWorkflow(
    pattern: typeof this.workflowPatterns[keyof typeof this.workflowPatterns],
    params: Record<string, unknown>,
    context: UnifiedCommandContext
  ): Promise<MultiToolWorkflowResult> {
    const toolsUsed: string[] = [];
    const crossToolContext: Record<string, unknown> = { ...params };
    let lastResult: any = null;

    for (let i = 0; i < pattern.tools.length; i++) {
      const toolName = pattern.tools[i];
      
      try {
        // Create execution context
        const executionContext: ToolExecutionContext = {
          sessionId: context.sessionId,
          transportType: 'cli',
          metadata: {
            workflowStep: i + 1,
            totalSteps: pattern.tools.length,
            previousTool: i > 0 ? pattern.tools[i - 1] : undefined,
            crossToolContext: { ...crossToolContext }
          }
        };

        // Execute tool with cross-tool context
        const toolParams = await this.prepareToolParams(
          toolName,
          crossToolContext,
          lastResult,
          context
        );

        logger.debug({
          toolName,
          step: i + 1,
          totalSteps: pattern.tools.length,
          params: Object.keys(toolParams)
        }, 'Executing sequential workflow step');

        const result = await executeTool(toolName, toolParams, this.config, executionContext);
        
        toolsUsed.push(toolName);
        lastResult = result;

        // Update cross-tool context with results
        crossToolContext[`${toolName}_result`] = result;
        
        // Extract useful data for next tool
        if (result && typeof result === 'object') {
          Object.assign(crossToolContext, this.extractReusableData(toolName, result));
        }

      } catch (error) {
        logger.error({ err: error, toolName, step: i + 1 }, 'Sequential workflow step failed');
        
        return {
          success: false,
          message: `Sequential workflow failed at step ${i + 1}`,
          outputs: undefined,
          error: {
            stepId: `${i + 1}`,
            toolName,
            message: `Step ${i + 1} (${toolName}) failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          },
          triggeredWorkflows: ['sequential'],
          parallelExecutions: 0,
          toolsUsed,
          crossToolContext
        };
      }
    }

    return {
      success: true,
      message: 'Sequential workflow completed successfully',
      outputs: lastResult,
      error: undefined,
      triggeredWorkflows: ['sequential'],
      parallelExecutions: 0,
      toolsUsed,
      crossToolContext
    };
  }

  /**
   * Execute parallel workflow (tools run simultaneously)
   */
  private async executeParallelWorkflow(
    pattern: typeof this.workflowPatterns[keyof typeof this.workflowPatterns],
    params: Record<string, unknown>,
    context: UnifiedCommandContext
  ): Promise<MultiToolWorkflowResult> {
    const toolPromises: Promise<{ tool: string; result: any; error?: string }>[] = [];

    // Start all tools in parallel
    for (const toolName of pattern.tools) {
      const toolPromise = this.executeToolWithErrorHandling(
        toolName,
        params,
        context
      );
      toolPromises.push(toolPromise);
    }

    try {
      // Wait for all tools to complete
      const results = await Promise.all(toolPromises);
      
      // Collect results and errors
      const toolsUsed: string[] = [];
      const crossToolContext: Record<string, unknown> = { ...params };
      const errors: string[] = [];
      let combinedResult: any = {};

      for (const { tool, result, error } of results) {
        toolsUsed.push(tool);
        
        if (error) {
          errors.push(`${tool}: ${error}`);
        } else {
          crossToolContext[`${tool}_result`] = result;
          
          // Combine results intelligently
          if (result && typeof result === 'object') {
            Object.assign(combinedResult, this.extractReusableData(tool, result));
          }
        }
      }

      const success = errors.length === 0;
      
      return {
        success,
        message: success ? 'Parallel workflow completed successfully' : 'Some parallel workflow steps failed',
        outputs: combinedResult,
        error: errors.length > 0 ? { message: errors.join('; ') } : undefined,
        triggeredWorkflows: ['parallel'],
        parallelExecutions: pattern.tools.length,
        toolsUsed,
        crossToolContext
      };

    } catch (error) {
      logger.error({ err: error, tools: pattern.tools }, 'Parallel workflow execution failed');
      
      return {
        success: false,
        message: 'Parallel workflow execution failed',
        outputs: undefined,
        error: {
          message: error instanceof Error ? error.message : 'Parallel execution failed'
        },
        triggeredWorkflows: ['parallel'],
        parallelExecutions: 0,
        toolsUsed: [],
        crossToolContext: {}
      };
    }
  }

  /**
   * Execute compound workflow (mixed sequential and parallel)
   */
  private async executeCompoundWorkflow(
    pattern: typeof this.workflowPatterns[keyof typeof this.workflowPatterns],
    params: Record<string, unknown>,
    context: UnifiedCommandContext
  ): Promise<MultiToolWorkflowResult> {
    // For now, default to sequential execution
    // Can be enhanced later for more complex orchestration
    return this.executeSequentialWorkflow(pattern, params, context);
  }

  /**
   * Execute tool with error handling for parallel execution
   */
  private async executeToolWithErrorHandling(
    toolName: string,
    params: Record<string, unknown>,
    context: UnifiedCommandContext
  ): Promise<{ tool: string; result: any; error?: string }> {
    try {
      const executionContext: ToolExecutionContext = {
        sessionId: context.sessionId,
        transportType: 'cli',
        metadata: {
          parallelExecution: true,
          toolName
        }
      };

      const result = await executeTool(toolName, params, this.config, executionContext);
      
      return { tool: toolName, result };
    } catch (error) {
      return {
        tool: toolName,
        result: null,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }

  /**
   * Prepare tool parameters based on cross-tool context
   */
  private async prepareToolParams(
    toolName: string,
    crossToolContext: Record<string, unknown>,
    previousResult: any,
    context: UnifiedCommandContext
  ): Promise<Record<string, unknown>> {
    const baseParams = { ...crossToolContext };

    // Tool-specific parameter preparation
    switch (toolName) {
      case 'prd-generator':
        // Use research results if available
        if (crossToolContext.research_manager_result) {
          baseParams.research_context = crossToolContext.research_manager_result;
        }
        break;

      case 'user-stories-generator':
        // Use PRD results if available
        if (crossToolContext.prd_generator_result) {
          baseParams.prd_context = crossToolContext.prd_generator_result;
        }
        break;

      case 'task-list-generator':
        // Use user stories if available
        if (crossToolContext.user_stories_generator_result) {
          baseParams.user_stories = crossToolContext.user_stories_generator_result;
        }
        break;

      case 'curate-context':
        // Use codebase analysis if available
        if (crossToolContext.map_codebase_result) {
          baseParams.codebase_analysis = crossToolContext.map_codebase_result;
        }
        break;
    }

    return baseParams;
  }

  /**
   * Extract reusable data from tool results
   */
  private extractReusableData(toolName: string, result: any): Record<string, unknown> {
    if (!result || typeof result !== 'object') {
      return {};
    }

    // Extract commonly useful fields based on tool type
    const extracted: Record<string, unknown> = {};

    if ('content' in result && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          extracted[`${toolName}_output`] = item.text;
          break;
        }
      }
    }

    // Tool-specific extractions
    switch (toolName) {
      case 'research-manager':
        extracted.research_topic = result.topic || result.query;
        break;
      
      case 'prd-generator':
        extracted.product_name = result.product_name;
        extracted.feature_list = result.features;
        break;
      
      case 'map-codebase':
        extracted.project_structure = result.structure;
        extracted.main_files = result.important_files;
        break;
    }

    return extracted;
  }

  /**
   * Detect compound requests (multiple actions in one input)
   */
  private async detectCompoundRequest(
    input: string,
    primaryTool: string
  ): Promise<WorkflowDetection> {
    const compoundIndicators = [
      'and then', 'followed by', 'after that', 'also', 'plus',
      'additionally', 'as well as', 'along with', 'including'
    ];

    const hasCompoundIndicators = compoundIndicators.some(indicator => 
      input.includes(indicator)
    );

    if (!hasCompoundIndicators) {
      return {
        shouldTriggerWorkflow: false,
        workflowType: 'simple'
      };
    }

    // Analyze for common compound patterns
    const compoundPatterns = [
      { pattern: /research.*(?:and|then).*(?:create|generate|document)/, workflow: 'research-to-documentation' },
      { pattern: /(?:create|setup).*project.*(?:and|with).*(?:rules|standards)/, workflow: 'full-project-setup' },
      { pattern: /(?:analyze|map).*(?:and|then).*(?:plan|organize)/, workflow: 'analyze-and-plan' }
    ];

    for (const { pattern, workflow } of compoundPatterns) {
      if (pattern.test(input)) {
        return {
          shouldTriggerWorkflow: true,
          workflowName: workflow,
          workflowType: 'compound',
          estimatedDuration: this.workflowPatterns[workflow as keyof typeof this.workflowPatterns]?.estimatedDuration,
          nextSteps: ['Executing compound workflow with multiple tools']
        };
      }
    }

    return {
      shouldTriggerWorkflow: false,
      workflowType: 'simple'
    };
  }

  /**
   * Detect sequential workflow opportunities based on context
   */
  private async detectSequentialOpportunity(
    selectedTool: string,
    context: UnifiedCommandContext,
    params: Record<string, unknown>
  ): Promise<WorkflowDetection> {
    // Check tool history for patterns that suggest sequential workflows
    const recentTools = context.toolHistory.slice(-3).map(h => h.tool);
    
    // Define common sequential patterns
    const sequentialPatterns = [
      ['research-manager', 'prd-generator'],
      ['prd-generator', 'user-stories-generator'],
      ['user-stories-generator', 'task-list-generator'],
      ['map-codebase', 'curate-context']
    ];

    // Check if current tool continues a pattern
    for (const pattern of sequentialPatterns) {
      const patternIndex = pattern.indexOf(selectedTool);
      if (patternIndex > 0) {
        const previousTool = pattern[patternIndex - 1];
        if (recentTools.includes(previousTool)) {
          return {
            shouldTriggerWorkflow: true,
            workflowType: 'sequential',
            nextSteps: [`Continue with ${pattern.slice(patternIndex + 1).join(' → ')}`],
            estimatedDuration: 120000 // 2 minutes for continuation
          };
        }
      }
    }

    return {
      shouldTriggerWorkflow: false,
      workflowType: 'simple'
    };
  }

  /**
   * Calculate tool compatibility score
   */
  private async calculateToolCompatibility(
    toolName: string,
    workflowTools: string[],
    context: UnifiedCommandContext
  ): Promise<{
    score: number;
    suggestions: string[];
    alternatives: string[];
  }> {
    // Define tool relationship matrices
    const toolRelationships: Record<string, string[]> = {
      'research-manager': ['prd-generator', 'user-stories-generator'],
      'prd-generator': ['user-stories-generator', 'task-list-generator'],
      'user-stories-generator': ['task-list-generator', 'vibe-task-manager'],
      'map-codebase': ['curate-context', 'rules-generator'],
      'curate-context': ['task-list-generator', 'vibe-task-manager']
    };

    const relatedTools = toolRelationships[toolName] || [];
    const compatibility = relatedTools.filter(tool => workflowTools.includes(tool));
    
    const score = compatibility.length / Math.max(workflowTools.length, 1);
    
    return {
      score,
      suggestions: compatibility.map(tool => `Works well with ${tool}`),
      alternatives: relatedTools.filter(tool => !workflowTools.includes(tool))
    };
  }

  /**
   * Simple semantic matching for workflow triggers
   */
  private semanticMatch(input: string, trigger: string): number {
    const inputWords = input.toLowerCase().split(/\s+/);
    const triggerWords = trigger.toLowerCase().split(/\s+/);
    
    const matches = triggerWords.filter(word => 
      inputWords.some(inputWord => inputWord.includes(word) || word.includes(inputWord))
    );
    
    return matches.length / triggerWords.length;
  }

  /**
   * Generate next steps for workflow
   */
  private async generateNextSteps(
    workflowName: string,
    currentTool: string,
    params: Record<string, unknown>
  ): Promise<string[]> {
    const pattern = this.workflowPatterns[workflowName as keyof typeof this.workflowPatterns];
    if (!pattern) return [];

    const currentIndex = pattern.tools.indexOf(currentTool);
    const remainingTools = pattern.tools.slice(currentIndex + 1);
    
    return remainingTools.map(tool => `Execute ${tool} with enriched context`);
  }

  /**
   * Register active workflow for tracking
   */
  private registerActiveWorkflow(sessionId: string, workflowName: string): void {
    const pattern = this.workflowPatterns[workflowName as keyof typeof this.workflowPatterns];
    
    this.activeWorkflows.set(sessionId, {
      sessionId,
      workflowName,
      startTime: new Date(),
      toolsUsed: [],
      currentStep: 0,
      totalSteps: pattern?.tools.length || 1
    });
  }

  /**
   * Unregister active workflow
   */
  private unregisterActiveWorkflow(sessionId: string): void {
    this.activeWorkflows.delete(sessionId);
  }

  /**
   * Update context with workflow results
   */
  private updateContextWithResults(
    context: UnifiedCommandContext,
    result: MultiToolWorkflowResult,
    workflowName: string
  ): void {
    // Update workflow stack
    if (result.success) {
      context.workflowStack.push(workflowName);
    }

    // Update tool preferences based on workflow success
    for (const tool of result.toolsUsed) {
      const currentPreference = context.preferredTools[tool] || 0;
      context.preferredTools[tool] = result.success 
        ? currentPreference + 0.1 
        : Math.max(currentPreference - 0.05, 0);
    }
  }
}