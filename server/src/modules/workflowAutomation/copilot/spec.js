/**
 * Human-readable node specification for the Workflow Copilot (the model reads this).
 * Keep in sync with engine/nodeConfig.js — copilot.spec.test.js checks every catalog
 * type is described and every described field exists in the node defaults.
 */
export const NODE_SPEC = {
  'trigger.manual': { purpose: 'Leads enter when an admin starts a workflow campaign for selected leads.', fields: {} },
  'trigger.lead_created': { purpose: 'Starts for every new lead (manual, widget, extension, import).', fields: {} },
  'trigger.leads_imported': { purpose: 'Starts for each lead created by a contact-list upload.', fields: {} },
  'trigger.lead_updated': { purpose: 'Starts when a lead changes.', fields: { toStatus: 'optional lead status that must be reached', fields: 'optional array of changed fields: status, assignedTo, tags, pipelineStage, email, phone, notes' } },
  'trigger.call_completed': { purpose: 'Starts after an outgoing AI call was processed.', fields: { outcome: 'any | answered | unanswered | failed | qualified | not_qualified | callback_requested | do_not_contact', agentId: 'optional agent id filter' } },
  'trigger.inbound_call': { purpose: 'Starts after the AI receptionist finished an incoming call.', fields: { outcome: 'any | handled | missed | qualified' } },
  'trigger.message_received': { purpose: 'Starts when a lead replies by SMS/WhatsApp (STOP replies never start a run).', fields: { channel: 'any | sms | whatsapp', keyword: 'optional text the reply must contain' } },
  'trigger.message_status': { purpose: 'Starts on a delivery report.', fields: { channel: 'any | sms | whatsapp | email', status: 'delivered | read | failed' } },
  'trigger.link_clicked': { purpose: 'Starts on the first genuine click of a tracked workflow link.', fields: {} },
  'trigger.webhook': { purpose: 'Starts when an external system POSTs to the secret URL (generated on save).', fields: {} },
  'trigger.schedule': { purpose: 'Enrolls a lead segment on chosen days at a time.', fields: { time: 'HH:MM', days: 'array of weekday numbers 0=Sun..6=Sat', timezone: 'IANA zone', limit: '1-500 leads per firing', segment: '{ statuses:[], tags:[], sources:[] } at least one filter' } },
  'ai.call': { purpose: 'An existing AI agent calls the lead; continues when the call result is known.', fields: { agentId: 'REQUIRED: id of an available outbound agent (never invent)', maxAttempts: '1-10 dial attempts inside this step (default 2)', retryDelayMinutes: 'minutes between those attempts (default 60)', timeoutHours: 'give up after (default 72)' } },
  'ai.analyze': { purpose: 'Reads the last AI call of this run: validated answers + evidence. Unknown answers route to "unknown" (never treated as qualified).', fields: { waitForIntelligenceMinutes: '0-60 (default 10)' } },
  'ai.callback': { purpose: 'Schedules a callback at the time the lead asked for (within calling hours); optional AI agent places it.', fields: { agentId: 'optional agent id for an AI callback (agent must have follow-up calling enabled); empty = a person calls back', useRequestedTime: 'boolean (default true)', delayMinutes: 'fallback delay (default 120)', waitForCompletion: 'boolean', timeoutHours: 'when waiting' } },
  'msg.sms': { purpose: 'Sends an SMS through the messaging module (consent/opt-out checked right before sending).', fields: { body: 'text, variables {{firstName}} {{businessName}} {{link}} …', templateId: 'optional SMS template id', purpose: 'transactional | promotional (needs consent) | support', trackedLinkUrl: 'https URL, required when the body uses {{link}}' } },
  'msg.whatsapp': { purpose: 'Sends an approved WhatsApp template.', fields: { templateId: 'REQUIRED: id of an approved WhatsApp template (never invent)', purpose: 'transactional | promotional | support', trackedLinkUrl: 'optional https URL' } },
  'msg.email': { purpose: 'Sends an email.', fields: { subject: 'required unless templateId', body: 'required unless templateId', templateId: 'optional email template id', purpose: 'transactional | promotional | support', trackedLinkUrl: 'https URL when body uses {{link}}' } },
  'notify.user': { purpose: 'In-app + push notification to people.', fields: { recipients: 'assigned | owner | users', userIds: 'user ids when recipients=users', title: 'text (variables {{lead.name}} {{call.summary}})', message: 'text', priority: 'LOW | NORMAL | HIGH | CRITICAL' } },
  'task.create': { purpose: 'Creates a task.', fields: { title: 'text', description: 'text', assignee: 'assigned | owner | user', userId: 'when assignee=user', dueInHours: 'number', priority: 'NONE | LOW | MEDIUM | HIGH | URGENT' } },
  'crm.update_lead': { purpose: 'Sets lead status and/or pipeline stage (never moves a converted lead back).', fields: { status: 'new | contacted | qualified | unqualified | converted', pipelineStage: 'LEAD | FOLLOW_UP' } },
  'crm.add_tags': { purpose: 'Adds/removes tags.', fields: { add: 'array of tags', remove: 'array of tags' } },
  'crm.assign': { purpose: 'Assigns the lead to a user.', fields: { userId: 'REQUIRED user id (never invent)' } },
  'crm.add_note': { purpose: 'Adds a timeline note.', fields: { text: 'text' } },
  'crm.qualification': { purpose: 'Writes a qualification answer.', fields: { fieldKey: 'need | current_solution | role | decision_authority | budget | timeline | interest | objections | preferred_channel | callback_time | requested_info | next_action', value: 'text' } },
  'crm.custom_fields': { purpose: 'Sets/removes custom fields on the lead (key/value; values may use {{templates}}). Readable later via condition lead.customFields.<key>.', fields: { set: 'array of { key: letters/digits/_ (max 40), value: text ≤500 }', remove: 'array of keys' } },
  'crm.follow_up': { purpose: 'Creates a follow-up for a person in the follow-up inbox.', fields: { dueInHours: 'number', channel: 'phone | sms | email | whatsapp | in_person | other', assignee: 'assigned | owner | user', userId: 'when assignee=user', note: 'text' } },
  'integration.webhook': { purpose: 'POSTs the lead and step data to an external HTTPS endpoint (signed, idempotent).', fields: { url: 'REQUIRED https URL given by the user (never invent)', includeLead: 'boolean', timeoutSeconds: '1-30' } },
  'logic.condition': { purpose: 'YES/NO branch on data.', fields: { rules: '{ op: "and"|"or", rules: [ { field, operator, value } | nested group ] }' } },
  'logic.delay': { purpose: 'Waits, timezone-aware.', fields: { mode: 'duration | until | time_of_day | next_business_day', amount: 'number (duration)', unit: 'minutes | hours | days', time: 'HH:MM', until: 'ISO date', timezoneMode: 'lead | fixed', timezone: 'IANA zone', businessHours: '{ enabled, start "HH:MM", end "HH:MM", days [1..5] }' } },
  'logic.wait_event': { purpose: 'Waits for an event, with a timeout branch.', fields: { events: 'array of waitable events', timeoutHours: 'number' } },
  end: { purpose: 'Ends the run with an outcome; can update the lead status.', fields: { outcome: 'end outcome', updateLeadStatus: 'boolean (qualified→qualified, not_qualified/not_interested/opted_out→unqualified, converted→converted)', note: 'optional timeline note' } },
};

export const PORT_SPEC = {
  'ai.call': 'answered = a person was on the line; unanswered = all attempts no answer/busy/voicemail; failed = technical failure or launch refused; blocked = not allowed to call (consent, do-not-call, missing phone)',
  'ai.analyze': 'qualified; not_qualified; callback (callback requested); unknown (unclear — never treat as qualified)',
  'msg.sms': 'sent; blocked (consent/opt-out/missing number); failed', 'msg.whatsapp': 'sent; blocked; failed', 'msg.email': 'sent; blocked; failed',
  'logic.condition': 'yes; no', 'logic.wait_event': 'matched; timeout', 'ai.callback': 'out; failed', 'integration.webhook': 'out; failed',
};
