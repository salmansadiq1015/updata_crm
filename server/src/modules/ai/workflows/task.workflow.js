/**
 * LangGraph StateGraph workflow for task creation automation.
 *
 * Graph:
 *   __start__ → validate_entities → [conditional] → execute_tools → [conditional] → END
 *                                               ↘ handle_failure
 *
 * Nodes increment stepCount on entry and check MAX_STEPS before doing work.
 */
import { StateGraph, END } from '@langchain/langgraph';

import { MAX_STEPS, MIN_AGENT_INPUT_LENGTH } from '../agent/agent.guardrails.js';
import agentRunRepository from '../agent/agentRun.repository.js';
import { createTaskTool } from '../tools/task.tools.js';
import { WorkflowState } from './workflow.state.js';
import logger from '../../../shared/logger/index.js';

// ---------------------------------------------------------------------------
// Node: validate_entities
// ---------------------------------------------------------------------------
async function validateEntities(state) {
  const stepCount = state.stepCount + 1;

  if (stepCount >= MAX_STEPS) {
    return {
      stepCount,
      status: 'failed',
      error: { code: 'MAX_STEPS_EXCEEDED', message: `Max agent steps (${MAX_STEPS}) exceeded`, node: 'validate_entities' },
    };
  }

  const input = state.input || '';
  if (input.length < MIN_AGENT_INPUT_LENGTH) {
    return {
      stepCount,
      status: 'failed',
      error: { code: 'INVALID_INPUT', message: `Input must be at least ${MIN_AGENT_INPUT_LENGTH} characters`, node: 'validate_entities' },
    };
  }

  return { stepCount, status: 'running' };
}

// ---------------------------------------------------------------------------
// Node: execute_tools
// ---------------------------------------------------------------------------
async function executeTools(state) {
  const stepCount = state.stepCount + 1;

  if (stepCount >= MAX_STEPS) {
    return {
      stepCount,
      status: 'failed',
      error: { code: 'MAX_STEPS_EXCEEDED', message: `Max agent steps (${MAX_STEPS}) exceeded`, node: 'execute_tools' },
    };
  }

  // Build tool input from extracted entities.
  const title = (state.entities?.DESCRIPTION?.[0]?.value || state.input).slice(0, 500);
  const dueDate = state.entities?.DATE?.[0]?.normalizedValue;
  const priority = state.entities?.URGENCY?.[0]?.value || 'MEDIUM';

  const validPriorities = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const safePriority = validPriorities.includes(priority) ? priority : 'MEDIUM';

  const toolInput = {
    title,
    priority: safePriority,
    ...(dueDate && { dueDate }),
  };

  const toolConfig = {
    configurable: {
      userId: state.userId,
      permissions: state.permissions,
      agentRunId: state.agentRunId,
    },
  };

  let rawResult;
  try {
    rawResult = await createTaskTool.invoke(toolInput, toolConfig);
  } catch (err) {
    logger.warn('Task tool invocation failed', {
      module: 'ai-workflows',
      action: 'task.execute_tools',
      agentRunId: state.agentRunId,
      error: err.message,
    });
    return {
      stepCount,
      status: 'failed',
      error: { code: 'TOOL_ERROR', message: err.message, node: 'execute_tools' },
    };
  }

  // Tool runner returns a JSON string — parse it.
  let result;
  try {
    result = JSON.parse(rawResult);
  } catch {
    result = { raw: rawResult };
  }

  // Log the step to AgentRun — non-fatal.
  try {
    await agentRunRepository.pushStep(state.agentRunId, {
      stepIndex: stepCount,
      node: 'execute_tools',
      type: 'TOOL_CALL',
      toolName: 'create_task',
      toolInput,
      toolOutput: result,
      timestamp: new Date(),
    });
  } catch (dbErr) {
    logger.warn('AgentRun.pushStep failed — continuing workflow', {
      module: 'ai-workflows',
      action: 'task.execute_tools.pushStep',
      agentRunId: state.agentRunId,
      error: dbErr.message,
    });
  }

  return {
    stepCount,
    status: 'completed',
    output: result,
    toolResults: [result],
  };
}

// ---------------------------------------------------------------------------
// Node: handle_failure
// ---------------------------------------------------------------------------
async function handleFailure(state) {
  logger.warn('Task workflow entering handle_failure', {
    module: 'ai-workflows',
    action: 'task.handle_failure',
    agentRunId: state.agentRunId,
    error: state.error,
  });

  return { status: 'failed' };
}

// ---------------------------------------------------------------------------
// Conditional routing functions
// ---------------------------------------------------------------------------
function routeAfterValidation(state) {
  return state.status === 'failed' ? 'handle_failure' : 'execute_tools';
}

function routeAfterExecution(state) {
  return state.status === 'failed' ? 'handle_failure' : END;
}

// ---------------------------------------------------------------------------
// Build and compile the graph
// ---------------------------------------------------------------------------
const graph = new StateGraph(WorkflowState);

graph.addNode('validate_entities', validateEntities);
graph.addNode('execute_tools', executeTools);
graph.addNode('handle_failure', handleFailure);

graph.addEdge('__start__', 'validate_entities');
graph.addConditionalEdges('validate_entities', routeAfterValidation, {
  handle_failure: 'handle_failure',
  execute_tools: 'execute_tools',
});
graph.addConditionalEdges('execute_tools', routeAfterExecution, {
  handle_failure: 'handle_failure',
  [END]: END,
});
graph.addEdge('handle_failure', END);

export const taskWorkflow = graph.compile();
