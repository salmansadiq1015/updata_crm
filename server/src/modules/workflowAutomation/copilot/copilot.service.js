/**
 * Workflow Copilot — builds and edits workflows from natural language.
 *
 * The model can only act through the structured, schema-validated operations in
 * graphOps.js, applied to a COPY of the editor's current graph. Every applied operation is
 * streamed to the browser, which applies it to the real canvas immediately (live build).
 * The copilot never saves, publishes, starts campaigns or touches CRM data; resources
 * (agents, templates, users) are checked against what exists, so nothing can be invented.
 */
import mongoose from 'mongoose';
import config from '../../../config/index.js';
import { createOpenAiClient } from '../../../shared/ai/llmFactory.js';
import logger from '../../../shared/logger/index.js';
import { CONDITION_FIELDS, QUALIFICATION_FIELD_KEYS } from '../engine/nodeConfig.js';
import { sanitizeGraph, validateGraph } from '../engine/graph.js';
import { END_OUTCOMES, LEAD_STATUSES, NODE_CATALOG, WAITABLE_EVENTS, CONDITION_OPERATORS } from '../workflow.constants.js';
import { NODE_SPEC, PORT_SPEC } from './spec.js';
import { OPS, OpError } from './graphOps.js';
import { buildTemplate, TEMPLATE_KEYS } from '../workflow.templates.js';

const MAX_ROUNDS = 18;
const REPAIR_ROUNDS = 2;
const MAX_TOOL_CALLS = 60;
const STEP_PACE_MS = Number(process.env.WORKFLOW_COPILOT_PACE_MS ?? 160);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const step = { type: 'string', description: 'Short progress label shown to the user, e.g. "Adding the AI call step"' };
const TOOLS = [
  { name: 'add_node', description: 'Add a step. Optionally connect it after an existing step branch (after.node + after.port).', parameters: { type: 'object', additionalProperties: false, required: ['step', 'type'], properties: {
    step, type: { type: 'string', enum: Object.keys(NODE_CATALOG) }, label: { type: 'string', description: 'Short, clear step name' },
    config: { type: 'object', description: 'Step settings (see spec). Use only real ids from the resources list.' },
    after: { type: 'object', additionalProperties: false, properties: { node: { type: 'string' }, port: { type: 'string' } } },
  } } },
  { name: 'start_from_template', description: 'ONLY when the canvas is empty: load a proven template as the starting point, then customise it with update_node/add_node/connect_nodes. Templates: ai-lead-qualification, unanswered-call-recovery, interested-lead-follow-up, callback-automation, lead-nurturing, incoming-call-automation, sms-follow-up, whatsapp-follow-up, email-follow-up, multi-channel-qualification.', parameters: { type: 'object', additionalProperties: false, required: ['step', 'template'], properties: { step, template: { type: 'string', enum: TEMPLATE_KEYS } } } },
  { name: 'update_node', description: 'Change the name and/or settings of an existing step (settings are merged).', parameters: { type: 'object', additionalProperties: false, required: ['step', 'node'], properties: { step, node: { type: 'string' }, label: { type: 'string' }, config: { type: 'object' } } } },
  { name: 'connect_nodes', description: 'Connect a branch of one step to another step (replaces what that branch pointed to).', parameters: { type: 'object', additionalProperties: false, required: ['step', 'from', 'port', 'to'], properties: { step, from: { type: 'string' }, port: { type: 'string' }, to: { type: 'string' } } } },
  { name: 'disconnect', description: 'Remove the connection of one branch.', parameters: { type: 'object', additionalProperties: false, required: ['step', 'from', 'port'], properties: { step, from: { type: 'string' }, port: { type: 'string' } } } },
  { name: 'remove_node', description: 'Delete a step. ONLY when the user explicitly asked to remove or replace it; quote their words.', parameters: { type: 'object', additionalProperties: false, required: ['step', 'node', 'userRequestQuote'], properties: { step, node: { type: 'string' }, userRequestQuote: { type: 'string', description: 'Exact words from the user asking for this removal/replacement' } } } },
  { name: 'tidy_layout', description: 'Arrange all steps neatly (do this once after building or restructuring).', parameters: { type: 'object', additionalProperties: false, required: ['step'], properties: { step } } },
  { name: 'set_workflow_name', description: 'Rename the workflow (only when it has a generic name or the user asks).', parameters: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string' } } } },
  { name: 'validate_workflow', description: 'Check the workflow for problems. Do this before finishing.', parameters: { type: 'object', additionalProperties: false, properties: {} } },
  { name: 'ask_user', description: 'Ask ONE question when required information is missing or ambiguous (e.g. which agent, which template, retry policy). Ends your turn.', parameters: { type: 'object', additionalProperties: false, required: ['question'], properties: {
    question: { type: 'string' }, kind: { type: 'string', enum: ['agent', 'template', 'user', 'choice', 'text'] },
    options: { type: 'array', minItems: 1, description: 'Always 2-6 concrete options (real resource ids as value for agent/template/user; include sensible alternatives, e.g. "Send an SMS instead")', items: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: { label: { type: 'string' }, value: { type: 'string' }, description: { type: 'string' }, apply: { type: 'object', additionalProperties: false, required: ['node', 'config'], description: 'Optional: when choosing this option simply sets settings on ONE existing step (e.g. the agent of step "call"), give that change so it is applied instantly: { node: step id, config: settings to merge }.', properties: { node: { type: 'string' }, config: { type: 'object' } } } } } },
    allowFreeText: { type: 'boolean' },
  } } },
].map((f) => ({ type: 'function', function: f }));

async function loadResources(userId) {
  const [{ default: CallingAgent }, { default: MessageTemplate }, { default: User }] = await Promise.all([
    import('../../aiCalling/callingAgent.model.js'), import('../../messaging/messageTemplate.model.js'), import('../../auth/user.model.js'),
  ]);
  const [agents, templates, users] = await Promise.all([
    CallingAgent.find({ availability: { $ne: 'archived' } }).select('name title description usage availability agentType agentConfig.language followUp.enabled questionnaire.questions.fieldKey').limit(50).lean(),
    MessageTemplate.find({ isArchived: false, $or: [{ createdBy: userId }, { isShared: true }] }).select('name channel purpose whatsapp.approvalStatus').limit(80).lean(),
    User.find({ status: 'active' }).select('firstName lastName email').limit(100).lean(),
  ]);
  const map = (list, fn) => new Map(list.map((x) => [String(x._id), fn(x)]));
  return {
    agents: map(agents, (a) => ({ id: String(a._id), name: a.name, title: a.title || '', usage: a.usage || 'outbound', availability: a.availability, type: a.agentType || 'custom', language: a.agentConfig?.language || 'auto', followUpEnabled: Boolean(a.followUp?.enabled), questions: (a.questionnaire?.questions || []).map((q) => q.fieldKey).slice(0, 12), description: String(a.description || '').slice(0, 160) })),
    templates: map(templates, (t) => ({ id: String(t._id), name: t.name, channel: t.channel, purpose: t.purpose, approval: t.whatsapp?.approvalStatus || null })),
    users: map(users, (u) => ({ id: String(u._id), name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email })),
  };
}

function compactGraph(graph) {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, label: n.data?.label || '', config: n.data?.config || {} })),
    edges: graph.edges.map((e) => `${e.source}.${e.sourceHandle || 'out'} -> ${e.target}`),
  };
}

function systemPrompt({ resources, graph, selectedNodeId, workflowName, locale }) {
  const spec = Object.entries(NODE_SPEC).map(([type, s]) => {
    const meta = NODE_CATALOG[type];
    const fields = Object.entries(s.fields).map(([k, v]) => `${k}: ${v}`).join('; ');
    return `- ${type} [${meta.category}] branches: ${meta.outputs.join(', ') || '—'}. ${s.purpose}${fields ? ` Settings: ${fields}` : ''}${PORT_SPEC[type] ? ` Branch meaning: ${PORT_SPEC[type]}` : ''}`;
  }).join('\n');
  const list = (m) => JSON.stringify([...m.values()]);
  const validation = validateGraph(graph);
  return `You are the Updata Workflow Copilot inside the visual workflow builder of a CRM (Swiss HVAC company). You build and edit the CURRENT workflow by calling tools; every tool call is applied live to the user's canvas.

RULES
1. Use tools for every change; never just describe a workflow you did not build. Build step by step in a logical order (trigger → actions → branches → end states), connecting each new step with add_node.after or connect_nodes.
2. Never invent agents, templates, users, phone numbers, URLs or providers. Use only ids from RESOURCES. If something required is missing or ambiguous (e.g. several agents fit and the user named none, no approved WhatsApp template, an external URL), call ask_user with concrete options (kind agent/template/user with value = the id). If exactly one resource clearly matches the user's words, use it without asking.
3. Ask only for information that is truly needed and not already in the CRM. Sensible defaults are fine (e.g. 2 call attempts, 24h retry delay, transactional purpose for requested information). Mention the defaults you chose.
4. EDITING: preserve every unrelated step, setting and connection. Change only what was asked. Remove steps only when the user explicitly asked (quote them in remove_node).
5. Retry loops must contain a wait (logic.delay) and a stop condition (e.g. logic.condition on run.attempts.<callStepId> lt N) so the workflow cannot loop forever. Unknown/unclear AI analysis results must never lead to "qualified" handling.
6. Prefer end states for every branch the user cares about (end with outcome) so results are recorded. Messages to leads need consent unless purpose is transactional/support (information the lead asked for).
7. Before finishing a build/edit, call tidy_layout (after structural changes) and validate_workflow, fix errors you can fix, then reply with a short summary (what you built/changed, defaults chosen, anything the user must still do such as choosing a template or publishing). Never publish, save or start campaigns — the user does that.
8. If the user only asks a question ("explain this workflow"), answer without tools.
10. When the canvas is empty and a template fits the request, start_from_template first, then adapt it (agent, texts, waits, extra steps). Keep the template structure unless the user wants it different.

PROVEN RECIPES
- Call with waiting retries ("if unanswered wait 24h and retry, max 3 attempts"): ai.call with maxAttempts 1 → its "unanswered" AND "failed" branches → logic.condition { op:"and", rules:[{ field:"run.attempts.<callStepId>", operator:"lt", value:3 }] } → "yes" → logic.delay { mode:"duration", amount:24, unit:"hours" } → connect delay "out" back to the ai.call step; condition "no" → end { outcome:"unreachable" }. The retry delay lives in the delay step (change it there).
- Qualification after a call: ai.call "answered" → ai.analyze; analyze "qualified" → actions → end qualified; "not_qualified" → end not_qualified; "callback" → ai.callback → end callback_scheduled; "unknown" → crm.follow_up or end follow_up_required. Do not add a condition that re-checks qualification.
- Interest without qualification: logic.condition on analysis.interest or lead.qualification.interest.
- Every branch of ai.call (answered, unanswered, failed, blocked), ai.analyze and msg.* (sent, blocked, failed) should lead somewhere: a next step or an end step (blocked → end opted_out or a different channel). Only leave a branch open on purpose by setting config.intentionalEnd = true on that step.
- Notifications to "the sales team / the rep": recipients "assigned" unless the user names people.
- After tool errors, correct the arguments and try again; never give up silently.
- If a requested channel needs a resource that does not exist (e.g. no approved WhatsApp template), do NOT silently drop the step: keep or add it unconfigured (it shows a warning) and ask_user with options such as choosing a template or using SMS/email instead.
9. Reply in the user's language (UI locale: ${locale}). Be concise and non-technical; never show internal ids in prose.

STEP TYPES
${spec}

CONDITIONS: rules = { op: "and"|"or", rules: [ { field, operator, value } ] } (groups can nest).
Fields: ${CONDITION_FIELDS.join(', ')} (entries ending with "." take a key, e.g. call.answers.budget, lead.qualification.interest, run.attempts.<stepId>).
Operators: ${CONDITION_OPERATORS.join(', ')}. Lead statuses: ${LEAD_STATUSES.join(', ')}. Qualification keys: ${QUALIFICATION_FIELD_KEYS.join(', ')}.
Waitable events: ${WAITABLE_EVENTS.join(', ')}. End outcomes: ${END_OUTCOMES.join(', ')}.
Message variables: {{firstName}} {{lastName}} {{fullName}} {{businessName}} {{city}} {{assignedUserName}} {{companyName}} {{senderName}} {{callSummary}} {{link}}. Internal text (notes, notifications, tasks) may use {{lead.name}} {{call.summary}} {{call.disposition}} {{analysis.qualification}} {{workflow.name}}.

RESOURCES (real, current)
Agents: ${list(resources.agents)}
Message templates: ${list(resources.templates)}
Users: ${list(resources.users)}

CURRENT WORKFLOW "${workflowName}"
${JSON.stringify(compactGraph(graph))}
Validation: ${validation.errors.length} errors ${JSON.stringify(validation.errors.slice(0, 15))}; ${validation.warnings.length} warnings.
${selectedNodeId ? `The user has selected step "${selectedNodeId}". Questions like "help me configure this step" refer to it; ask only what that step needs.` : ''}`;
}

function parseArgs(raw) {
  try { return JSON.parse(raw || '{}'); } catch { throw new OpError('bad_arguments', 'Tool arguments were not valid JSON.'); }
}

// A pre-existing step may only be removed when the user explicitly asked: the quote must be
// the user's own words (≥10 chars) AND contain a removal/replacement verb (de/en/fr/ar).
const REMOVAL_INTENT = /\b(remove|delete|drop|replace|instead|get rid|entfern|lösch|loesch|ersetz|statt|weg|supprim|enlev|remplac|au lieu)|احذف|أزل|ازل|استبدل|بدلا|بدلاً/i;
export const quoteMatches = (quote, userTexts) => {
  const q = String(quote || '').trim().toLowerCase();
  return q.length >= 10 && REMOVAL_INTENT.test(q) && userTexts.some((t) => t.toLowerCase().includes(q));
};

class WorkflowCopilot {
  /**
   * @param {{ workflow: object, messages: Array<{role:'user'|'assistant', content:string}>, graph: object, selectedNodeId?: string, locale?: string, userId: string, signal?: AbortSignal }} input
   * @returns {AsyncGenerator<object>} events
   */
  async *run({ workflow, messages, graph: inputGraph, selectedNodeId = null, locale = 'en', userId, signal, apply = null }) {
    let graph = sanitizeGraph(inputGraph || workflow.draft || { nodes: [], edges: [] });
    const initial = JSON.stringify(graph);
    yield { type: 'status', key: 'understanding' };
    const resources = await loadResources(new mongoose.Types.ObjectId(String(userId)));
    yield { type: 'status', key: 'resources', agents: resources.agents.size, templates: resources.templates.size };

    // Direct apply: the user picked an option that is a plain settings change. Apply it through
    // the same validated operation (resource checks included) before the model continues.
    let applyNote = '';
    if (apply?.node && apply.config && typeof apply.config === 'object') {
      try {
        const result = OPS.update_node(graph, { node: String(apply.node), config: apply.config }, resources);
        graph = result.graph;
        yield { type: 'op', name: 'update_node', step: '', change: { ...result.change, direct: true }, graph };
        applyNote = `SYSTEM NOTE (not from the user): the user's choice was ALREADY applied to step "${apply.node}" (${JSON.stringify(apply.config).slice(0, 300)}). Do not repeat that change; continue with whatever else the request needs, then summarise briefly.`;
      } catch (error) {
        const op = error instanceof OpError ? error : new OpError('error', error.message);
        yield { type: 'op_error', name: 'update_node', code: op.code, message: op.message };
        applyNote = `SYSTEM NOTE (not from the user): applying the user's choice to step "${apply.node}" failed (${op.code}: ${op.message}). Handle the answer yourself.`;
      }
    }
    const directOps = applyNote && !applyNote.includes('failed') ? 1 : 0;

    const client = await createOpenAiClient();
    const userTexts = messages.filter((m) => m.role === 'user').map((m) => String(m.content || ''));
    const convo = [
      { role: 'system', content: systemPrompt({ resources, graph, selectedNodeId, workflowName: workflow.name, locale }) },
      ...messages.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) })),
      ...(applyNote ? [{ role: 'user', content: applyNote }] : []),
    ];
    let toolCalls = 0; let name = workflow.name; let opsApplied = directOps; let repairs = 0;
    const addedThisTurn = new Set();

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (signal?.aborted) return;
      const res = await client.chat.completions.create({
        model: config.ai.model || 'gpt-4o', temperature: 0.2, messages: convo, tools: TOOLS, tool_choice: 'auto', parallel_tool_calls: false,
      }, { signal });
      const msg = res.choices?.[0]?.message;
      if (!msg) break;
      convo.push({ role: 'assistant', content: msg.content || null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
      if (!msg.tool_calls?.length) {
        const validation = validateGraph(graph);
        const changedSoFar = JSON.stringify(graph) !== initial;
        if (changedSoFar && validation.errors.length && repairs < REPAIR_ROUNDS) {
          // Do not hand back a broken workflow: make the model fix what it built.
          repairs += 1;
          yield { type: 'status', key: 'validating' };
          convo.push({ role: 'user', content: `SYSTEM CHECK (not from the user): the workflow still has blocking errors: ${JSON.stringify(validation.errors.slice(0, 15))}. Fix them now with tools: connect the steps you added in this turn, or remove steps you added in this turn (never delete steps that existed before), follow the recipes, then validate and summarise.` });
          continue;
        }
        yield { type: 'message', text: msg.content || '' };
        yield { type: 'done', graph, name, changed: JSON.stringify(graph) !== initial, opsApplied, validation };
        return;
      }
      for (const call of msg.tool_calls) {
        toolCalls += 1;
        const fn = call.function?.name;
        let content;
        try {
          if (toolCalls > MAX_TOOL_CALLS) throw new OpError('limit', 'Too many changes in one turn; summarise and stop.');
          const args = parseArgs(call.function?.arguments);
          if (fn === 'ask_user') {
            if (msg.content) yield { type: 'message', text: msg.content };
            yield { type: 'question', question: String(args.question || '').slice(0, 500), kind: args.kind || 'choice', options: (args.options || []).slice(0, 8), allowFreeText: args.allowFreeText !== false };
            yield { type: 'done', graph, name, changed: JSON.stringify(graph) !== initial, opsApplied, validation: validateGraph(graph), awaitingAnswer: true };
            return;
          }
          if (fn === 'validate_workflow') {
            const v = validateGraph(graph);
            yield { type: 'status', key: 'validating' };
            content = JSON.stringify({ valid: v.valid, errors: v.errors.slice(0, 20), warnings: v.warnings.slice(0, 20) });
          } else if (fn === 'start_from_template') {
            if (graph.nodes.length) throw new OpError('canvas_not_empty', 'start_from_template only works on an empty canvas; edit the existing steps instead.');
            const tpl = buildTemplate(args.template);
            if (!tpl) throw new OpError('unknown_template', `Unknown template ${args.template}`);
            graph = sanitizeGraph(tpl);
            for (const n of graph.nodes) addedThisTurn.add(n.id);
            opsApplied += 1;
            yield { type: 'op', name: fn, step: String(args.step || '').slice(0, 120), change: { kind: 'template', template: args.template }, graph };
            if (STEP_PACE_MS) await sleep(STEP_PACE_MS);
            content = JSON.stringify({ ok: true, loaded: args.template, graph: compactGraph(graph), note: 'These template steps ARE the workflow now. Customise them in place with update_node on their ids (agents, texts, waits), insert extra steps between them with add_node/connect_nodes, remove template steps the user does not want. Never build a second trigger or a second parallel path.' });
          } else if (fn === 'set_workflow_name') {
            name = String(args.name || '').trim().slice(0, 160) || name;
            yield { type: 'rename', name };
            content = JSON.stringify({ ok: true, name });
          } else if (OPS[fn]) {
            if (fn === 'remove_node' && !addedThisTurn.has(String(args.node)) && !quoteMatches(args.userRequestQuote, userTexts)) {
              throw new OpError('removal_not_requested', 'This step existed before your turn and the user did not explicitly ask to remove it. Keep it (edit it instead), or ask the user.');
            }
            const result = OPS[fn](graph, args, resources);
            graph = result.graph;
            if (fn === 'add_node' && result.change.nodeId) addedThisTurn.add(result.change.nodeId);
            opsApplied += 1;
            yield { type: 'op', name: fn, step: String(args.step || '').slice(0, 120), change: result.change, graph };
            if (STEP_PACE_MS) await sleep(STEP_PACE_MS);
            content = JSON.stringify({ ok: true, ...result.change });
          } else {
            throw new OpError('unknown_tool', `Unknown tool ${fn}`);
          }
        } catch (error) {
          const op = error instanceof OpError ? error : new OpError('error', error.message);
          if (!(error instanceof OpError)) logger.warn('Workflow copilot tool failed', { module: 'workflow-copilot', tool: fn, error: error.message });
          yield { type: 'op_error', name: fn, code: op.code, message: op.message };
          content = JSON.stringify({ ok: false, error: op.code, message: op.message });
        }
        convo.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }
    yield { type: 'message', text: '' };
    yield { type: 'done', graph, name, changed: JSON.stringify(graph) !== initial, opsApplied, validation: validateGraph(graph), truncated: true };
  }
}

export const __test__ = { systemPrompt, loadResources, quoteMatches, TOOLS };
export default new WorkflowCopilot();
