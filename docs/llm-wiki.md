# MB Boiler — LLM Agent Wiki

> **Audience:** AI/ML engineers extending the agent, and the LLM itself as a reference for system context.  
> **Last updated:** 2026-05-05

---

## 1. System Overview

MB Boiler is a Swiss HVAC ERP system. The AI agent is a LangGraph-based orchestrator that:

1. Classifies user intent using a zero-temperature `gpt-4o` call
2. Routes to the matching workflow (TASK_AUTOMATION, NOTIFICATION, GENERAL)
3. Executes LangChain tools within the workflow
4. Persists results to MongoDB and streams updates via WebSocket

**Stack:** Node.js 22 · Express 5 · LangChain 0.3 · LangGraph 0.2 · BullMQ · MongoDB · Redis

---

## 2. Intent Classification

The agent classifies every input before routing. Classification uses a strict JSON-only prompt at `temperature: 0`.

### Supported Intents

| Intent | Workflow | Trigger phrases |
|--------|----------|----------------|
| `create_task` | TASK_AUTOMATION | "Create a task", "Add a task", "Aufgabe erstellen", "neue Aufgabe" |
| `update_task` | TASK_AUTOMATION | "Update task", "Mark task as done", "Change status", "assign to" |
| `send_notification` | NOTIFICATION | "Send notification", "Notify user", "Alert team", "Benachrichtigung senden" |
| `general` | GENERAL | Everything else — questions, greetings, ERP queries |

### Classification Prompt (Reference)

```
You are an ERP intent classifier. Given user input, return JSON only:
{"intent": "<one of: create_task, update_task, send_notification, general>", "confidence": 0.0-1.0}
```

**Fallback:** If confidence < 0.5 or JSON parsing fails, the agent falls through to the GENERAL workflow.

---

## 3. Workflow Architecture

```
User Input
    │
    ▼
Intent Classifier (gpt-4o, temp=0)
    │
    ├─ create_task / update_task ──► TASK_AUTOMATION workflow
    ├─ send_notification ──────────► NOTIFICATION workflow
    └─ general / fallback ─────────► GENERAL workflow
```

### 3.1 TASK_AUTOMATION Workflow

**Graph:** `validate_entities → execute_tools → END`  
(any node can short-circuit to `handle_failure`)

| Node | Purpose |
|------|---------|
| `validate_entities` | Checks input length ≥ 3, enforces MAX_STEPS guard |
| `execute_tools` | Invokes `create_task` or `update_task` tool, parses JSON output |
| `handle_failure` | Logs structured error to AgentRun, transitions to END |

**Required permissions:** `tasks:write`

### 3.2 NOTIFICATION Workflow

**Graph:** `resolve_recipients → execute_tools → END`

| Node | Purpose |
|------|---------|
| `resolve_recipients` | Resolves recipient ObjectIds from entities (CUSTOMER_NAME) or keywords |
| `execute_tools` | Invokes `send_notification` tool |

**Required permissions:** `notifications:write`

### 3.3 GENERAL Workflow

**Graph:** `respond → END`

Single LLM call at `temperature: 0.7`. No tools, no permission requirements. Used for:
- Greetings and small talk
- ERP questions without actionable intent
- Fallback when other workflows are unavailable

---

## 4. Tool Reference

### `create_task`

Creates a task in the task management module.

```json
{
  "title": "string (3–500 chars, required)",
  "description": "string (max 2000, optional)",
  "assignedTo": "MongoDB ObjectId (optional)",
  "dueDate": "ISO 8601 datetime with offset (optional)",
  "priority": "NONE | LOW | MEDIUM | HIGH | URGENT (default: MEDIUM)",
  "projectId": "MongoDB ObjectId (optional)"
}
```

**Permission required:** `tasks:write`  
**Output:** `{ taskId, title, status, priority }`

### `update_task`

Updates an existing task. At least one field required.

```json
{
  "taskId": "MongoDB ObjectId (required)",
  "status": "OPEN | IN_PROGRESS | COMPLETED | CANCELLED (optional)",
  "assignedTo": "MongoDB ObjectId (optional)",
  "dueDate": "ISO 8601 datetime with offset (optional)",
  "priority": "NONE | LOW | MEDIUM | HIGH | URGENT (optional)"
}
```

**Permission required:** `tasks:write`  
**Output:** `{ taskId, status }`

### `send_notification`

Sends an in-app notification to one or more users.

```json
{
  "recipientIds": ["MongoDB ObjectId"] (1–50 items, required)",
  "title": "string (max 255, required)",
  "body": "string (max 1000, required)",
  "type": "INFO | WARNING | SUCCESS | ACTION_REQUIRED (default: INFO)"
}
```

**Permission required:** `notifications:write`  
**Output:** `{ sent: number, failed: number }`  
**Channel:** Always `IN_APP`. External adapters (email, SMS) are handled by the notification service pipeline separately.

---

## 5. Permission Model

Permissions follow `module:action` format. Valid actions: `read | write | delete | admin`.

### AI-Relevant Permissions

| Permission | Who has it | Used by |
|-----------|-----------|---------|
| `tasks:write` | Admin, Projektleiter, Techniker, Disponent, User | create_task, update_task tools |
| `tasks:read` | All roles | Not currently tool-gated; used by UI |
| `notifications:write` | Admin, Projektleiter, Disponent | send_notification tool |
| `notifications:read` | All roles | UI only |

### Admin Bypass

Admin users receive `permissions: ['*']` in the agent context. The tool runner treats `'*'` as a wildcard that bypasses all permission checks.

### How Permissions Flow

```
HTTP Request
  → authenticate middleware (sets req.user with role)
  → agent.controller.run()
      → loadUserPermissions(req.user)  ← DB/cache lookup
      → agentService.run(input, userId, permissions)
          → BullMQ job { permissions }
              → agent.executor → workflow state { permissions }
                  → tool.runner.createTool() checks permissions
```

---

## 6. Workflow State Fields

```typescript
{
  agentRunId: string;          // MongoDB ObjectId for audit trail
  userId: string;              // Authenticated user ObjectId
  permissions: string[];       // e.g. ['tasks:write', 'crm:read'] or ['*'] for Admin
  input: string;               // Raw user input (sanitized, max 2000 chars)
  workflowType: string;        // 'TASK_AUTOMATION' | 'NOTIFICATION' | 'GENERAL'
  entities: Record<string, any>; // NLP-extracted named entities
  context: Record<string, any>;  // Supplemental ERP data (projects, users)
  output: object | null;       // Final workflow result
  error: {                     // Present on failure
    code: string;
    message: string;
    node: string;              // Which graph node failed
  } | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stepCount: number;           // Guards against infinite loops (MAX_STEPS = 10)
  retryCount: number;
  toolResults: object[];       // Accumulated per-tool outputs
}
```

---

## 7. Error Codes

| Code | Origin | Meaning |
|------|--------|---------|
| `RBAC_DENIED` | tool.runner.js | User lacks the required permission for this tool |
| `TOOL_ERROR` | task/notification workflow | Tool invocation threw — wrapped error from service/DB |
| `MAX_STEPS_EXCEEDED` | agent.guardrails.js | Workflow exceeded 10 steps (loop protection) |
| `AGENT_TIMEOUT` | agent.executor.js | BullMQ job timed out |
| `WORKFLOW_NOT_FOUND` | agent.executor.js | No workflow registered for the classified workflowType |
| `UNHANDLED_ERROR` | agent.executor.js | Unexpected exception in the executor |
| `QUEUE_UNAVAILABLE` | agent.service.js | Redis/BullMQ unavailable when queuing job |

### Client-Side Classification (retry-classifier.js)

| Error | isTransient | Retry |
|-------|------------|-------|
| HTTP 429, 503, 504 | ✅ | Auto-retry with backoff |
| `QUEUE_UNAVAILABLE` | ✅ | Auto-retry |
| `AGENT_TIMEOUT` | ✅ | Auto-retry |
| `RBAC_DENIED` | ❌ | Hard error — no retry |
| `WORKFLOW_NOT_FOUND` | ❌ | Hard error — no retry |
| HTTP 400, 403 | ❌ | Hard error — no retry |

---

## 8. Adding a New Tool

1. **Create tool file** in `server/src/modules/ai/tools/your-tool.js`:

```js
import { z } from 'zod';
import { createTool } from './tool.runner.js';

export const myTool = createTool({
  name: 'my_action',
  description: 'One sentence describing when the LLM should call this.',
  schema: z.object({
    field: z.string().describe('What this field is'),
  }),
  requiredPermission: 'module:write',  // must match a seeded permission
  execute: async ({ field }, { userId }) => {
    const { default: myService } = await import('../../my-module/my.service.js');
    const result = await myService.create({ field }, userId, { source: 'ai-agent' });
    return { id: result._id.toString() };
  },
});
```

2. **Add the permission to `seed.js`** under `PERMISSION_DEFINITIONS`:
```js
{ module: 'my-module', action: 'write', description: 'Create/update my module data' },
```

3. **Add to relevant roles** in `ROLE_DEFINITIONS` in `seed.js`.

4. **Add to `roles.js` constants**:
```js
MY_MODULE_WRITE: 'my-module:write',
```

5. **Wire into a workflow** (new or existing):
```js
import { myTool } from '../tools/your-tool.js';
// ... use in execute_tools node
```

6. **Register the intent** in `agent.service.js`:
```js
const INTENT_TO_WORKFLOW = {
  my_new_intent: 'MY_WORKFLOW',
  // ...
};
```

7. **Register the workflow** in `workflows/index.js`.

---

## 9. Domain Knowledge — MB Boiler HVAC ERP

### Business Context

MB Boiler is a Swiss HVAC service company managing:
- **Field technicians** doing boiler installations, maintenance, and repairs
- **Dispatch/planning** scheduling technician visits
- **Project management** for larger installation projects
- **Customer management** (CRM) for residential and commercial clients
- **Financial operations** — invoicing, quotations, accounting

### Task Lifecycle

```
OPEN → IN_PROGRESS → COMPLETED
  ↓
CANCELLED
```

**Common task operations via AI:**
- "Create a maintenance task for Müller GmbH" → `create_task` with customer context
- "Mark task #123 as complete" → `update_task { status: 'COMPLETED' }`
- "Assign the boiler inspection to Max" → `update_task { assignedTo: <userId> }`
- "Set the Zürich job to urgent" → `update_task { priority: 'URGENT' }`

### Notification Types (AI-generated)

| Type | Use case |
|------|---------|
| `AI_AGENT_INFO` | General information notifications |
| `AI_AGENT_WARNING` | Warnings requiring attention |
| `AI_AGENT_SUCCESS` | Confirmation of completed actions |
| `AI_AGENT_ACTION_REQUIRED` | User must take action |

### Language Support

The system supports German (primary), English, French, and Italian — reflecting Swiss HVAC market reality. The LLM should respond in the same language the user used. STT is configured with `recognition.lang = ''` to auto-detect user language.

### Role Reference

| Role | German Title | Key Capabilities |
|------|-------------|-----------------|
| Admin | Administrator | Everything |
| Projektleiter | Project Manager | Projects, CRM, tasks, scheduling, quotations |
| Techniker | Technician | Field service, time tracking, tasks |
| Buchhalter | Accountant | Invoicing, accounting, reports |
| Disponent | Dispatcher | Scheduling, task assignment, notifications |
| Lehrling | Apprentice | Limited field access, time tracking |
| User | User | Basic read + tasks + time tracking |

---

## 10. General Workflow System Prompt (Reference)

The `respond` node uses this system context:

```
You are a helpful AI assistant for an HVAC ERP system (MB Boiler & Heizung AG).
Answer questions helpfully and concisely.
If the user asks about creating tasks, notifications, or leads, let them know
they can just tell you what they want and you will handle it.
```

**Best practices for extending the system prompt:**
- Keep it under 500 tokens
- Include the company name and domain
- List actionable capabilities so users know what the AI can do
- Use the user's language when responding
- Never fabricate task IDs, user names, or financial figures

---

## 11. Guardrails

| Guard | Value | File |
|-------|-------|------|
| MAX_STEPS | 10 | `agent.guardrails.js` |
| Input max length | 2000 chars | `agent.service.js` (sanitize) |
| Tool output max | 4096 chars | `tool.runner.js` MAX_OUTPUT_CHARS |
| Retry max attempts | 3 | `use-message-retry.js` |
| Retry backoff | 1s → 2s → 4s | `use-message-retry.js` |
| TTS chunk max | 200 chars | `tts-chunker.js` |
| STT silence timeout | 1500ms | `use-voice-interaction.js` |

---

## 12. Debugging Checklist

**Agent run fails with `RBAC_DENIED`:**
1. Check `agent.controller.js` — is `loadUserPermissions` being called?
2. Check the user's role permissions in DB: `db.roles.findOne({name: 'Techniker'}, {permissions: 1})`
3. Check the permission exists: `db.permissions.findOne({module: 'tasks', action: 'write'})`
4. Check the tool's `requiredPermission` matches a seeded `module:action` key
5. If the user is Admin, verify `permissions: ['*']` is being passed

**`TOOL_ERROR` wrapping `RBAC_DENIED`:**
- The RBAC_DENIED happened inside the tool execution, not at the HTTP layer
- The tool runner caught it and wrapped it as `TOOL_ERROR`
- Check `toolExecution` documents for the specific `errorMessage`

**Intent misclassified:**
- Check `agent.service.js` intent classification prompt
- Add more trigger phrases to the classification prompt
- Lower confidence threshold in `INTENT_TO_WORKFLOW` routing

**Workflow stuck on `processing` (client):**
- The `voiceState` should transition to `'idle'` after `onTranscriptFinal` in non-hands-free mode
- Check WebSocket connection — runs may be completing on server without client notification
- Check BullMQ job status: `redis-cli LRANGE bull:ai-agent:wait 0 -1`
