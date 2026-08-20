/**
 * LangGraph StateGraph workflow for general / conversational queries.
 *
 * Handles greetings, questions, and anything that doesn't map to a specific
 * ERP action (create_task, send_notification, etc.). Uses the LLM directly
 * to respond — no tool calls, no permission requirements.
 *
 * Graph: __start__ → respond → END
 */
import { StateGraph, END } from '@langchain/langgraph';

import { MAX_STEPS } from '../agent/agent.guardrails.js';
import { WorkflowState } from './workflow.state.js';
import { createChatModel } from '../../../shared/ai/llmFactory.js';
import logger from '../../../shared/logger/index.js';

async function respond(state) {
  const stepCount = state.stepCount + 1;

  if (stepCount >= MAX_STEPS) {
    return {
      stepCount,
      status: 'failed',
      error: { code: 'MAX_STEPS_EXCEEDED', message: `Max agent steps (${MAX_STEPS}) exceeded`, node: 'respond' },
    };
  }

  try {
    const llm = await createChatModel({ temperature: 0.7 });

    const response = await llm.invoke([
      {
        role: 'system',
        content:
          'You are the assistant of the MB Boiler & Heizungen AG ERP (Swiss HVAC company). ' +
          'Answer helpfully and concisely, always in the language the user writes in (usually German). '
          + 'In German always use the formal Sie-Form, never du — this is a business tool. ' +
          'You can create tasks, orders, quotations and reports, schedule work, search data and send notifications — ' +
          'if the user asks what you can do, tell them to simply state what they want in their own words.',
      },
      { role: 'user', content: state.input },
    ]);

    return {
      stepCount,
      status: 'completed',
      output: { message: response.content },
    };
  } catch (err) {
    logger.warn('General workflow LLM call failed', {
      module: 'ai-workflows',
      action: 'general.respond',
      agentRunId: state.agentRunId,
      error: err.message,
    });
    return {
      stepCount,
      status: 'completed',
      output: { message: "I'm here to help! You can ask me to create tasks, send notifications, or answer questions about your ERP system." },
    };
  }
}

const graph = new StateGraph(WorkflowState);
graph.addNode('respond', respond);
graph.addEdge('__start__', 'respond');
graph.addEdge('respond', END);

export const generalWorkflow = graph.compile();
