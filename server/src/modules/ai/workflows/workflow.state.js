/**
 * Shared LangGraph state annotation for AI agentic workflows.
 *
 * Uses LangGraph 1.2.9 Annotation.Root API. Each field declares a reducer
 * that controls how updates from nodes are merged into the graph state.
 */
import { Annotation } from '@langchain/langgraph';

export const WorkflowState = Annotation.Root({
  /** Authenticated user performing the agent action. */
  userId: Annotation({
    reducer: (x, y) => (y != null ? y : x),
    default: () => '',
  }),

  /** MongoDB ObjectId of the AgentRun document for audit/step logging. */
  agentRunId: Annotation({
    reducer: (x, y) => (y != null ? y : x),
    default: () => '',
  }),

  /** RBAC permission strings granted to the user (e.g. 'tasks:create'). */
  permissions: Annotation({
    reducer: (_x, y) => y,
    default: () => [],
  }),

  /** Raw natural-language input from the user. */
  input: Annotation({
    reducer: (_x, y) => y,
    default: () => '',
  }),

  /** NLP-extracted named entities keyed by type (DATE, DESCRIPTION, etc.). */
  entities: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),

  /** Supplemental context fetched from the ERP (projects, users, etc.). */
  context: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),

  /** Accumulated raw tool results across all nodes. */
  toolResults: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  /** Number of nodes executed so far — used to enforce MAX_STEPS. */
  stepCount: Annotation({
    reducer: (_x, y) => y,
    default: () => 0,
  }),

  /** Number of retry attempts for transient failures. */
  retryCount: Annotation({
    reducer: (_x, y) => y,
    default: () => 0,
  }),

  /**
   * Workflow lifecycle status.
   * @type {'pending'|'running'|'completed'|'failed'}
   */
  status: Annotation({
    reducer: (_x, y) => y,
    default: () => 'pending',
  }),

  /** Structured error payload set by any node that encounters a failure. */
  error: Annotation({
    reducer: (_x, y) => y,
    default: () => null,
  }),

  /** Final structured output produced by the workflow (set by execute nodes). */
  output: Annotation({
    reducer: (_x, y) => y,
    default: () => null,
  }),
});
