/**
 * LangGraph StateGraph workflow for sending AI-agent notifications.
 *
 * Graph:
 *   __start__ → resolve_recipients → [conditional] → execute_tools → [conditional] → END
 *                                                ↘ handle_failure             ↘ handle_failure
 *
 * resolve_recipients handles two paths:
 *   - Voice path: CUSTOMER_NAME entities with resolvedId (from NLP pipeline)
 *   - Text path:  No entities — resolves recipients from input text keywords
 *                 ("team", "all", "everyone") → all active users, else → sender only
 */
import { StateGraph, END } from '@langchain/langgraph';

import { MAX_STEPS } from '../agent/agent.guardrails.js';
import agentRunRepository from '../agent/agentRun.repository.js';
import { sendNotificationTool } from '../tools/notification.tools.js';
import { WorkflowState } from './workflow.state.js';
import agentGovernance from '../governance/agentGovernance.service.js';
import { RISK_LEVEL_LABELS } from '../governance/agent.risk.js';
import logger from '../../../shared/logger/index.js';

const TEAM_KEYWORDS = /\b(team|all|everyone|staff|users|group|company|organisation|organization|alle|mitarbeiter)\b/i;

async function resolveRecipientsFromText(input, userId) {
  if (TEAM_KEYWORDS.test(input)) {
    const { default: User } = await import('../../auth/user.model.js');
    const members = await User.find({ isActive: true }).select('_id').limit(100).lean();
    return members.map((u) => u._id.toString());
  }
  // Fallback: notify the sender themselves (useful for testing)
  return [userId];
}

// ---------------------------------------------------------------------------
// Node: resolve_recipients
// ---------------------------------------------------------------------------
async function resolveRecipients(state) {
  const stepCount = state.stepCount + 1;

  if (stepCount >= MAX_STEPS) {
    return {
      stepCount,
      status: 'failed',
      error: { code: 'MAX_STEPS_EXCEEDED', message: `Max agent steps (${MAX_STEPS}) exceeded`, node: 'resolve_recipients' },
    };
  }

  if (!state.input || state.input.length === 0) {
    return {
      stepCount,
      status: 'failed',
      error: { code: 'INVALID_INPUT', message: 'Input is required to generate notification body', node: 'resolve_recipients' },
    };
  }

  // Voice path: entities already carry resolved IDs
  const voiceRecipients = (state.entities?.CUSTOMER_NAME || [])
    .map((e) => e.resolvedId)
    .filter(Boolean);

  let recipientIds = voiceRecipients;

  // Text path: no pre-resolved entities — derive from input text
  if (recipientIds.length === 0) {
    try {
      recipientIds = await resolveRecipientsFromText(state.input, state.userId);
    } catch (err) {
      logger.warn('Failed to resolve recipients from text', {
        module: 'ai-workflows',
        action: 'notification.resolve_recipients',
        agentRunId: state.agentRunId,
        error: err.message,
      });
      return {
        stepCount,
        status: 'failed',
        error: { code: 'RECIPIENT_RESOLUTION_FAILED', message: 'Could not resolve notification recipients', node: 'resolve_recipients' },
      };
    }
  }

  if (recipientIds.length === 0) {
    return {
      stepCount,
      status: 'failed',
      error: { code: 'NO_RECIPIENTS', message: 'No recipients found to notify', node: 'resolve_recipients' },
    };
  }

  return {
    stepCount,
    status: 'running',
    entities: {
      ...state.entities,
      _resolvedRecipientIds: recipientIds,
    },
  };
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

  const recipientIds = state.entities?._resolvedRecipientIds || [];
  const body = (state.entities?.DESCRIPTION?.[0]?.value || state.input).slice(0, 1000);

  // Reaching people is never done unsupervised: same gate as every other action.
  const decision = await agentGovernance.evaluate('SEND_NOTIFICATION', {
    confirmed: Boolean(state.confirmed),
    agentKey: state.agentKey || null,
  });
  if (!decision.allowed) {
    await agentGovernance.record(decision, {
      action: 'SEND_NOTIFICATION',
      userId: state.userId,
      agentRunId: state.agentRunId,
      input: state.input,
    });
    return { stepCount, status: 'completed', output: decision.block };
  }
  if (decision.requiresApproval) {
    await agentGovernance.record(decision, {
      action: 'SEND_NOTIFICATION',
      userId: state.userId,
      agentRunId: state.agentRunId,
      input: state.input,
    });
    return {
      stepCount,
      status: 'awaiting_confirmation',
      output: {
        action: 'SEND_NOTIFICATION',
        status: 'awaiting_confirmation',
        riskLevel: decision.riskLevel,
        message: `Ich soll ${recipientIds.length} Empfänger benachrichtigen. ${RISK_LEVEL_LABELS[decision.riskLevel]}. Soll ich fortfahren?`,
        confirmation: {
          action: 'SEND_NOTIFICATION',
          riskLevel: decision.riskLevel,
          label: 'Benachrichtigung senden',
          effect: `${recipientIds.length} Empfänger`,
        },
      },
    };
  }

  const toolInput = {
    recipientIds,
    // The colleague who receives this reads German everywhere else in the
    // system; an English heading was the one line that said otherwise.
    title: 'Nachricht aus dem KI-Assistenten',
    body,
    type: 'INFO',
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
    rawResult = await sendNotificationTool.invoke(toolInput, toolConfig);
  } catch (err) {
    logger.warn('Notification tool invocation failed', {
      module: 'ai-workflows',
      action: 'notification.execute_tools',
      agentRunId: state.agentRunId,
      error: err.message,
    });
    return {
      stepCount,
      status: 'failed',
      error: { code: 'TOOL_ERROR', message: err.message, node: 'execute_tools' },
    };
  }

  let result;
  try {
    result = JSON.parse(rawResult);
  } catch {
    result = { raw: rawResult };
  }

  try {
    await agentRunRepository.pushStep(state.agentRunId, {
      stepIndex: stepCount,
      node: 'execute_tools',
      type: 'TOOL_CALL',
      toolName: 'send_notification',
      toolInput,
      toolOutput: result,
      timestamp: new Date(),
    });
  } catch (dbErr) {
    logger.warn('AgentRun.pushStep failed — continuing workflow', {
      module: 'ai-workflows',
      action: 'notification.execute_tools.pushStep',
      agentRunId: state.agentRunId,
      error: dbErr.message,
    });
  }

  return {
    stepCount,
    status: 'completed',
    output: { ...result, recipientCount: recipientIds.length },
    toolResults: [result],
  };
}

// ---------------------------------------------------------------------------
// Node: handle_failure
// ---------------------------------------------------------------------------
async function handleFailure(state) {
  logger.warn('Notification workflow entering handle_failure', {
    module: 'ai-workflows',
    action: 'notification.handle_failure',
    agentRunId: state.agentRunId,
    error: state.error,
  });
  return { status: 'failed' };
}

// ---------------------------------------------------------------------------
// Conditional routing
// ---------------------------------------------------------------------------
function routeAfterResolve(state) {
  return state.status === 'failed' ? 'handle_failure' : 'execute_tools';
}

function routeAfterExecution(state) {
  return state.status === 'failed' ? 'handle_failure' : END;
}

// ---------------------------------------------------------------------------
// Build and compile
// ---------------------------------------------------------------------------
const graph = new StateGraph(WorkflowState);

graph.addNode('resolve_recipients', resolveRecipients);
graph.addNode('execute_tools', executeTools);
graph.addNode('handle_failure', handleFailure);

graph.addEdge('__start__', 'resolve_recipients');
graph.addConditionalEdges('resolve_recipients', routeAfterResolve, {
  handle_failure: 'handle_failure',
  execute_tools: 'execute_tools',
});
graph.addConditionalEdges('execute_tools', routeAfterExecution, {
  handle_failure: 'handle_failure',
  [END]: END,
});
graph.addEdge('handle_failure', END);

export const notificationWorkflow = graph.compile();
