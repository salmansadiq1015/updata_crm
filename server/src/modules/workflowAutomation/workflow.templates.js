/**
 * Built-in workflow templates. Cloning a template creates an ordinary draft workflow;
 * agent/user/URL placeholders are left empty on purpose so validation asks the admin to
 * choose them before publishing (a template can never call with a guessed agent).
 */

let seq = 0;
const n = (id, type, label, config = {}) => ({ id, type, position: { x: 0, y: 0 }, data: { label, config } });
const e = (source, sourceHandle, target) => { seq += 1; return { id: `e${seq}_${source}_${sourceHandle}`, source, sourceHandle, target }; };

const COL = 300; const ROW = 150;
/** Layered layout: depth = BFS distance from the trigger (back edges ignored). */
export function layoutGraph(graph) {
  const trigger = graph.nodes[0];
  const depth = new Map([[trigger.id, 0]]); const order = [trigger.id];
  for (let i = 0; i < order.length; i += 1) {
    const id = order[i];
    for (const edge of graph.edges.filter((x) => x.source === id)) {
      if (!depth.has(edge.target)) { depth.set(edge.target, depth.get(id) + 1); order.push(edge.target); }
    }
  }
  const rows = new Map();
  for (const id of order) { const d = depth.get(id); if (!rows.has(d)) rows.set(d, []); rows.get(d).push(id); }
  const pos = new Map();
  for (const [d, ids] of rows) ids.forEach((id, i) => pos.set(id, { x: (i - (ids.length - 1) / 2) * COL, y: d * ROW }));
  return { ...graph, nodes: graph.nodes.map((node) => ({ ...node, position: pos.get(node.id) || { x: 0, y: 0 } })) };
}

const T = {
  'ai-lead-qualification': () => ({
    nodes: [
      n('trigger', 'trigger.lead_created', 'New lead'),
      n('call', 'ai.call', 'AI qualification call', { agentId: null, maxAttempts: 2, retryDelayMinutes: 120, timeoutHours: 72 }),
      n('analyze', 'ai.analyze', 'Analyse conversation', { waitForIntelligenceMinutes: 10 }),
      n('mark', 'crm.update_lead', 'Mark qualified', { status: 'qualified' }),
      n('notify', 'notify.user', 'Notify sales rep', { recipients: 'assigned', title: 'Qualified lead: {{lead.name}}', message: 'The AI call qualified {{lead.name}}. Summary: {{call.summary}}', priority: 'HIGH' }),
      n('callback', 'ai.callback', 'Schedule callback', { useRequestedTime: true, delayMinutes: 120 }),
      n('review', 'crm.add_tags', 'Tag for review', { add: ['needs-review'] }),
      n('endQ', 'end', 'Qualified', { outcome: 'qualified', updateLeadStatus: true }),
      n('endN', 'end', 'Not interested', { outcome: 'not_interested', updateLeadStatus: true }),
      n('endC', 'end', 'Callback scheduled', { outcome: 'callback_scheduled', updateLeadStatus: false }),
      n('endR', 'end', 'Needs review', { outcome: 'follow_up_required', updateLeadStatus: false }),
      n('endU', 'end', 'Unreachable', { outcome: 'unreachable', updateLeadStatus: false }),
    ],
    edges: [
      e('trigger', 'out', 'call'), e('call', 'answered', 'analyze'), e('call', 'unanswered', 'endU'), e('call', 'blocked', 'endU'),
      e('analyze', 'qualified', 'mark'), e('mark', 'out', 'notify'), e('notify', 'out', 'endQ'),
      e('analyze', 'not_qualified', 'endN'), e('analyze', 'callback', 'callback'), e('callback', 'out', 'endC'),
      e('analyze', 'unknown', 'review'), e('review', 'out', 'endR'),
    ],
  }),

  'unanswered-call-recovery': () => ({
    nodes: [
      n('trigger', 'trigger.manual', 'Campaign start'),
      n('call', 'ai.call', 'AI call', { agentId: null, maxAttempts: 1, retryDelayMinutes: 60, timeoutHours: 48, maxVisits: 4 }),
      n('check', 'logic.condition', 'Attempts left?', { rules: { op: 'and', rules: [{ field: 'run.attempts.call', operator: 'lt', value: 3 }] } }),
      n('wait', 'logic.delay', 'Wait 24 hours', { mode: 'duration', amount: 24, unit: 'hours', businessHours: { enabled: true, start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] } }),
      n('tag', 'crm.add_tags', 'Tag unreachable', { add: ['unreachable'] }),
      n('endU', 'end', 'Unreachable', { outcome: 'unreachable', updateLeadStatus: false }),
      n('endOk', 'end', 'Reached', { outcome: 'completed', updateLeadStatus: false }),
    ],
    edges: [
      e('trigger', 'out', 'call'), e('call', 'answered', 'endOk'), e('call', 'unanswered', 'check'), e('call', 'failed', 'check'), e('call', 'blocked', 'endU'),
      e('check', 'yes', 'wait'), e('wait', 'out', 'call'), e('check', 'no', 'tag'), e('tag', 'out', 'endU'),
    ],
  }),

  'interested-lead-follow-up': () => ({
    nodes: [
      n('trigger', 'trigger.call_completed', 'Call answered', { outcome: 'answered' }),
      n('interested', 'logic.condition', 'Interested?', { rules: { op: 'or', rules: [
        { field: 'event.qualification', operator: 'equals', value: 'qualified' },
        { field: 'lead.qualification.interest', operator: 'in', value: 'yes,interested,high' },
      ] } }),
      n('sms', 'msg.sms', 'Send info via SMS', { body: 'Hi {{firstName}}, thanks for the call! Here is the information we promised: {{link}}', purpose: 'transactional', trackedLinkUrl: '' }),
      n('waitClick', 'logic.wait_event', 'Wait for link click', { events: ['link.clicked'], timeoutHours: 72 }),
      n('notify', 'notify.user', 'Alert sales rep', { recipients: 'assigned', title: 'Hot lead: {{lead.name}} opened your link', message: '{{lead.name}} just opened the information link.', priority: 'HIGH' }),
      n('task', 'task.create', 'Follow-up task', { title: 'Follow up with {{lead.name}}', assignee: 'assigned', dueInHours: 24, priority: 'MEDIUM' }),
      n('endQ', 'end', 'Engaged', { outcome: 'qualified', updateLeadStatus: true }),
      n('endF', 'end', 'Follow-up required', { outcome: 'follow_up_required', updateLeadStatus: false }),
      n('endX', 'end', 'Not interested', { outcome: 'completed', updateLeadStatus: false }),
    ],
    edges: [
      e('trigger', 'out', 'interested'), e('interested', 'yes', 'sms'), e('interested', 'no', 'endX'),
      e('sms', 'sent', 'waitClick'), e('sms', 'blocked', 'task'), e('waitClick', 'matched', 'notify'), e('notify', 'out', 'endQ'),
      e('waitClick', 'timeout', 'task'), e('task', 'out', 'endF'),
    ],
  }),

  'callback-automation': () => ({
    nodes: [
      n('trigger', 'trigger.manual', 'Campaign start'),
      n('call', 'ai.call', 'AI call', { agentId: null, maxAttempts: 2, retryDelayMinutes: 60, timeoutHours: 72 }),
      n('asked', 'logic.condition', 'Callback requested?', { rules: { op: 'and', rules: [{ field: 'call.callbackRequested', operator: 'is_true' }] } }),
      n('callback', 'ai.callback', 'Schedule AI callback', { agentId: null, useRequestedTime: true, delayMinutes: 120, waitForCompletion: true, timeoutHours: 168 }),
      n('note', 'crm.add_note', 'Log callback', { text: 'Callback completed by workflow "{{workflow.name}}".' }),
      n('notify', 'notify.user', 'Callback not completed', { recipients: 'assigned', title: 'Callback for {{lead.name}} needs attention', message: 'The scheduled callback was not completed in time.', priority: 'HIGH' }),
      n('endC', 'end', 'Callback done', { outcome: 'completed', updateLeadStatus: false }),
      n('endF', 'end', 'Follow-up required', { outcome: 'follow_up_required', updateLeadStatus: false }),
      n('endOk', 'end', 'Completed', { outcome: 'completed', updateLeadStatus: false }),
      n('endU', 'end', 'Unreachable', { outcome: 'unreachable', updateLeadStatus: false }),
    ],
    edges: [
      e('trigger', 'out', 'call'), e('call', 'answered', 'asked'), e('call', 'unanswered', 'endU'), e('call', 'failed', 'endU'), e('call', 'blocked', 'endU'),
      e('asked', 'yes', 'callback'), e('asked', 'no', 'endOk'), e('callback', 'out', 'note'), e('note', 'out', 'endC'),
      e('callback', 'failed', 'notify'), e('notify', 'out', 'endF'),
    ],
  }),

  'lead-nurturing': () => ({
    nodes: [
      n('trigger', 'trigger.call_completed', 'Qualified on call', { outcome: 'qualified' }),
      n('email', 'msg.email', 'Send information', { subject: 'The information you asked for', body: 'Hello {{firstName}},\n\nas promised on the phone, here is our information.\n\nBest regards', purpose: 'transactional' }),
      n('wait', 'logic.delay', 'Wait 2 days', { mode: 'duration', amount: 2, unit: 'days' }),
      n('replied', 'logic.condition', 'Replied?', { rules: { op: 'and', rules: [{ field: 'message.replied', operator: 'is_true' }] } }),
      n('task', 'task.create', 'Answer the reply', { title: 'Reply received from {{lead.name}}', assignee: 'assigned', dueInHours: 8, priority: 'HIGH' }),
      n('sms', 'msg.sms', 'Reminder SMS', { body: 'Hi {{firstName}}, did you get a chance to look at our information? Just reply to this message with any questions.', purpose: 'transactional' }),
      n('waitReply', 'logic.wait_event', 'Wait for reply', { events: ['message.replied'], timeoutHours: 72 }),
      n('notify', 'notify.user', 'Notify rep', { recipients: 'assigned', title: '{{lead.name}} replied', message: '{{lead.name}} replied to the nurturing sequence.', priority: 'NORMAL' }),
      n('endF', 'end', 'Follow-up required', { outcome: 'follow_up_required', updateLeadStatus: false }),
      n('endQ', 'end', 'Engaged', { outcome: 'qualified', updateLeadStatus: false }),
      n('endN', 'end', 'No response', { outcome: 'not_interested', updateLeadStatus: false }),
    ],
    edges: [
      e('trigger', 'out', 'email'), e('email', 'sent', 'wait'), e('email', 'blocked', 'sms'), e('wait', 'out', 'replied'),
      e('replied', 'yes', 'task'), e('task', 'out', 'endF'), e('replied', 'no', 'sms'), e('sms', 'sent', 'waitReply'), e('sms', 'blocked', 'endN'),
      e('waitReply', 'matched', 'notify'), e('notify', 'out', 'endQ'), e('waitReply', 'timeout', 'endN'),
    ],
  }),

  'incoming-call-automation': () => ({
    nodes: [
      n('trigger', 'trigger.inbound_call', 'Incoming AI call', { outcome: 'any' }),
      n('qualified', 'logic.condition', 'Qualified caller?', { rules: { op: 'and', rules: [{ field: 'event.qualification', operator: 'equals', value: 'qualified' }] } }),
      n('mark', 'crm.update_lead', 'Mark qualified', { status: 'qualified' }),
      n('notify', 'notify.user', 'Notify sales rep', { recipients: 'assigned', title: 'Qualified inbound caller: {{lead.name}}', message: '{{lead.name}} called and was qualified by the AI receptionist.', priority: 'HIGH' }),
      n('missed', 'logic.condition', 'Missed call?', { rules: { op: 'and', rules: [{ field: 'event.outcome', operator: 'in', value: 'missed,unanswered,rejected' }] } }),
      n('task', 'task.create', 'Call back', { title: 'Call back {{lead.name}} (missed call)', assignee: 'assigned', dueInHours: 2, priority: 'HIGH' }),
      n('note', 'crm.add_note', 'Log call', { text: 'Incoming call handled ({{event.outcome}}).' }),
      n('endQ', 'end', 'Qualified', { outcome: 'qualified', updateLeadStatus: false }),
      n('endF', 'end', 'Callback needed', { outcome: 'follow_up_required', updateLeadStatus: false }),
      n('endOk', 'end', 'Logged', { outcome: 'completed', updateLeadStatus: false }),
    ],
    edges: [
      e('trigger', 'out', 'qualified'), e('qualified', 'yes', 'mark'), e('mark', 'out', 'notify'), e('notify', 'out', 'endQ'),
      e('qualified', 'no', 'missed'), e('missed', 'yes', 'task'), e('task', 'out', 'endF'), e('missed', 'no', 'note'), e('note', 'out', 'endOk'),
    ],
  }),

  'sms-follow-up': () => ({
    nodes: [
      n('trigger', 'trigger.call_completed', 'Call answered', { outcome: 'answered' }),
      n('sms', 'msg.sms', 'Thank-you SMS', { body: 'Hi {{firstName}}, thank you for your time today. Reply to this message if you have any questions.', purpose: 'transactional' }),
      n('wait', 'logic.wait_event', 'Wait for reply', { events: ['message.replied'], timeoutHours: 72 }),
      n('notify', 'notify.user', 'Tell the rep', { recipients: 'assigned', title: '{{lead.name}} replied by SMS', message: '{{lead.name}} answered the follow-up SMS.', priority: 'NORMAL' }),
      n('endR', 'end', 'Replied', { outcome: 'interested', updateLeadStatus: false }),
      n('endN', 'end', 'No reply', { outcome: 'completed', updateLeadStatus: false }),
      n('endB', 'end', 'Not allowed', { outcome: 'opted_out', updateLeadStatus: false }),
    ],
    edges: [e('trigger', 'out', 'sms'), e('sms', 'sent', 'wait'), e('sms', 'blocked', 'endB'), e('wait', 'matched', 'notify'), e('notify', 'out', 'endR'), e('wait', 'timeout', 'endN')],
  }),

  'whatsapp-follow-up': () => ({
    nodes: [
      n('trigger', 'trigger.call_completed', 'Qualified on call', { outcome: 'qualified' }),
      n('wa', 'msg.whatsapp', 'WhatsApp info', { templateId: null, purpose: 'transactional' }),
      n('wait', 'logic.wait_event', 'Wait for reply', { events: ['message.replied'], timeoutHours: 48 }),
      n('task', 'task.create', 'Call back', { title: 'Follow up with {{lead.name}} (WhatsApp)', assignee: 'assigned', dueInHours: 24, priority: 'HIGH' }),
      n('endR', 'end', 'Engaged', { outcome: 'interested', updateLeadStatus: false }),
      n('endF', 'end', 'Follow-up required', { outcome: 'follow_up_required', updateLeadStatus: false }),
      n('endB', 'end', 'Not allowed', { outcome: 'opted_out', updateLeadStatus: false }),
    ],
    edges: [e('trigger', 'out', 'wa'), e('wa', 'sent', 'wait'), e('wa', 'blocked', 'endB'), e('wait', 'matched', 'endR'), e('wait', 'timeout', 'task'), e('task', 'out', 'endF')],
  }),

  'email-follow-up': () => ({
    nodes: [
      n('trigger', 'trigger.manual', 'Campaign start'),
      n('email', 'msg.email', 'Information email', { subject: 'Your information from {{companyName}}', body: 'Hello {{firstName}},\n\nhere is the information you asked for: {{link}}\n\nBest regards', purpose: 'transactional', trackedLinkUrl: '' }),
      n('wait', 'logic.wait_event', 'Wait for click', { events: ['link.clicked'], timeoutHours: 120 }),
      n('fu', 'crm.follow_up', 'Follow-up for the rep', { dueInHours: 4, channel: 'phone', assignee: 'assigned', note: '{{lead.name}} opened the information link.' }),
      n('endI', 'end', 'Interested', { outcome: 'interested', updateLeadStatus: false }),
      n('endN', 'end', 'No reaction', { outcome: 'completed', updateLeadStatus: false }),
      n('endB', 'end', 'Not allowed', { outcome: 'opted_out', updateLeadStatus: false }),
    ],
    edges: [e('trigger', 'out', 'email'), e('email', 'sent', 'wait'), e('email', 'blocked', 'endB'), e('wait', 'matched', 'fu'), e('fu', 'out', 'endI'), e('wait', 'timeout', 'endN')],
  }),

  'multi-channel-qualification': () => ({
    nodes: [
      n('trigger', 'trigger.lead_created', 'New lead'),
      n('call', 'ai.call', 'AI qualification call', { agentId: null, maxAttempts: 2, retryDelayMinutes: 120, timeoutHours: 72 }),
      n('analyze', 'ai.analyze', 'Analyse conversation', { waitForIntelligenceMinutes: 10 }),
      n('mark', 'crm.update_lead', 'Mark qualified', { status: 'qualified' }),
      n('notify', 'notify.user', 'Notify sales', { recipients: 'assigned', title: 'Qualified lead: {{lead.name}}', message: 'Qualified by the AI call. {{call.summary}}', priority: 'HIGH' }),
      n('sms', 'msg.sms', 'SMS when unreachable', { body: 'Hi {{firstName}}, we tried to reach you about your enquiry. When is a good time to call? Just reply here.', purpose: 'transactional' }),
      n('waitSms', 'logic.wait_event', 'Wait for reply', { events: ['message.replied'], timeoutHours: 48 }),
      n('email', 'msg.email', 'Email as last try', { subject: 'We could not reach you', body: 'Hello {{firstName}},\n\nwe tried to call you about your enquiry. Simply reply to this email with a good time.\n\nBest regards', purpose: 'transactional' }),
      n('fu', 'crm.follow_up', 'Call back (replied)', { dueInHours: 2, channel: 'phone', assignee: 'assigned', note: '{{lead.name}} replied by SMS.' }),
      n('endQ', 'end', 'Qualified', { outcome: 'qualified', updateLeadStatus: true }),
      n('endN', 'end', 'Not qualified', { outcome: 'not_qualified', updateLeadStatus: true }),
      n('endF', 'end', 'Follow-up required', { outcome: 'follow_up_required', updateLeadStatus: false }),
      n('endU', 'end', 'Unreachable', { outcome: 'unreachable', updateLeadStatus: false }),
    ],
    edges: [
      e('trigger', 'out', 'call'), e('call', 'answered', 'analyze'), e('call', 'unanswered', 'sms'), e('call', 'failed', 'sms'), e('call', 'blocked', 'endU'),
      e('analyze', 'qualified', 'mark'), e('mark', 'out', 'notify'), e('notify', 'out', 'endQ'), e('analyze', 'not_qualified', 'endN'), e('analyze', 'callback', 'fu'), e('analyze', 'unknown', 'fu'),
      e('sms', 'sent', 'waitSms'), e('sms', 'blocked', 'email'), e('waitSms', 'matched', 'fu'), e('fu', 'out', 'endF'), e('waitSms', 'timeout', 'email'),
      e('email', 'sent', 'endU'), e('email', 'blocked', 'endU'),
    ],
  }),
};

export const TEMPLATE_META = Object.freeze([
  { key: 'ai-lead-qualification', category: 'qualification', icon: 'sparkles', nodes: 12 },
  { key: 'unanswered-call-recovery', category: 'calling', icon: 'phone-missed', nodes: 7 },
  { key: 'interested-lead-follow-up', category: 'follow_up', icon: 'mouse-pointer-click', nodes: 9 },
  { key: 'callback-automation', category: 'calling', icon: 'phone-callback', nodes: 10 },
  { key: 'lead-nurturing', category: 'nurturing', icon: 'sprout', nodes: 11 },
  { key: 'incoming-call-automation', category: 'inbound', icon: 'phone-incoming', nodes: 10 },
  { key: 'sms-follow-up', category: 'follow_up', icon: 'message-square-text', nodes: 7 },
  { key: 'whatsapp-follow-up', category: 'follow_up', icon: 'message-circle', nodes: 7 },
  { key: 'email-follow-up', category: 'follow_up', icon: 'mail', nodes: 7 },
  { key: 'multi-channel-qualification', category: 'qualification', icon: 'layers', nodes: 13 },
]);

export function buildTemplate(key) {
  const build = T[key];
  if (!build) return null;
  seq = 0;
  return layoutGraph(build());
}

export const TEMPLATE_KEYS = Object.freeze(Object.keys(T));
