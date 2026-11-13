// Public examples mirror the supported builder scenarios without importing its
// authenticated catalog, canvas library, or workflow mutation hooks.
export const workflowScenarios = [
  {
    id: 'qualification', label: 'AI lead qualification', icon: 'call',
    summary: 'From a new lead to a clear next step.',
    nodes: [
      { title: 'New lead created', detail: 'CRM trigger', icon: 'lead', tone: 'green' },
      { title: 'AI qualification call', detail: 'Ask your prepared questions', icon: 'call', tone: 'blue' },
      { title: 'Analyse the answers', detail: 'Route by conversation outcome', icon: 'brain', tone: 'violet' },
      { title: 'Notify the sales rep', detail: 'Qualified → assigned teammate', icon: 'bell', tone: 'green' },
      { title: 'Schedule a callback', detail: 'Callback requested → later call', icon: 'clock', tone: 'amber' },
      { title: 'Record the outcome', detail: 'Every branch has a clear ending', icon: 'check', tone: 'green' },
    ],
    branches: ['Qualified', 'Callback requested'],
    steps: [
      ['Start with the right signal', 'A new CRM lead starts the workflow. Choose the event that matches the process you want to automate.'],
      ['Make the first connection', 'Your configured AI agent calls the lead, asks the prepared questions and waits for a call result.'],
      ['Turn a conversation into context', 'Analyse captured answers to distinguish qualified leads, callback requests and results that need review.'],
      ['Bring in the right person', 'A qualified lead alerts the assigned sales rep, so the handoff has a clear owner.'],
      ['Make room for “later”', 'A callback request follows its own branch. Unclear answers and unreachable leads can have separate paths, too.'],
      ['Close the loop', 'End each branch with an explicit outcome, keeping execution history and reporting useful.'],
      ['Check. Test. Then publish.', 'Validate the workflow and test with a sample lead before activating real calls, messages or CRM actions.'],
    ],
  },
  {
    id: 'missed-call', label: 'Missed call → SMS', icon: 'missed',
    summary: 'Give every missed conversation a next step.',
    nodes: [
      { title: 'Incoming call missed', detail: 'Filtered call event', icon: 'missed', tone: 'amber' },
      { title: 'Send a helpful SMS', detail: 'Check consent before sending', icon: 'message', tone: 'blue' },
      { title: 'Wait for a reply', detail: 'Reply received or 24-hour timeout', icon: 'clock', tone: 'violet' },
      { title: 'Alert the assigned rep', detail: 'Reply received → continue talking', icon: 'bell', tone: 'green' },
      { title: 'Create a callback task', detail: 'No reply → a person follows up', icon: 'task', tone: 'amber' },
      { title: 'Save the next step', detail: 'A clear owner and outcome', icon: 'check', tone: 'green' },
    ],
    branches: ['Reply received', '24 hours elapsed'],
    steps: [
      ['Catch the missed connection', 'An incoming-call trigger filtered to missed calls starts the recovery process.'],
      ['Make it easy to reconnect', 'Send a short service SMS through a configured channel. Messaging consent and opt-outs are checked before sending.'],
      ['Wait with a clear limit', 'Pause for a reply, with a 24-hour timeout in this example. Every waiting step needs a way forward.'],
      ['Keep the conversation personal', 'When a reply arrives, notify the assigned teammate so they can take the conversation forward.'],
      ['Give silence a next step', 'If the timeout passes without a reply, create a callback task with a due date.'],
      ['Keep the result visible', 'Record the follow-up outcome. Blocked or failed messages follow their own configured paths.'],
      ['Review before going live', 'Check recipients, message wording, channel settings and every branch, then test before publishing.'],
    ],
  },
  {
    id: 'email', label: 'Email → AI follow-up', icon: 'mail',
    summary: 'Connect email engagement to a considered follow-up.',
    nodes: [
      { title: 'Leads imported', detail: 'Contact import trigger', icon: 'lead', tone: 'green' },
      { title: 'Send a tailored email', detail: 'Configured email channel', icon: 'mail', tone: 'blue' },
      { title: 'Wait for engagement', detail: 'Open signal or 72-hour timeout', icon: 'clock', tone: 'violet' },
      { title: 'Follow up with an AI call', detail: 'Open signal → configured agent', icon: 'call', tone: 'green' },
      { title: 'Tag for a later campaign', detail: 'No open signal → CRM tag', icon: 'tag', tone: 'amber' },
      { title: 'Keep the CRM in sync', detail: 'Save the outcome and context', icon: 'check', tone: 'green' },
    ],
    branches: ['Open signal', '72 hours elapsed'],
    steps: [
      ['Give new contacts a clear path', 'Imported leads enter a workflow designed around the next conversation you want to have.'],
      ['Start with a useful email', 'Send relevant content from your configured email channel. Enable open tracking when appropriate.'],
      ['Listen for a signal', 'This example waits up to 72 hours for an open event. An open is a signal, not proof of interest: email apps can preload images.'],
      ['Connect engagement to a next step', 'An open event can route the lead to a configured AI calling agent, subject to calling settings and consent.'],
      ['Keep the other branch useful', 'When the wait expires, add a CRM tag so the lead can be considered for a later campaign.'],
      ['Preserve the context', 'Record each branch outcome and retain execution history for your team to review.'],
      ['Publish with intention', 'Review the email, tracking choice, call settings and timeout. Test the complete flow before real outreach begins.'],
    ],
  },
];

export const automationFaqs = [
  ['What is CRM workflow automation?', 'CRM workflow automation connects a business event to a sequence of actions. In Updata, a new lead, contact import or supported call event can start a workflow that sends a message, places an AI call, waits for a response, updates the CRM or assigns work to a teammate.'],
  ['Can I build a workflow without writing code?', 'Yes. Use the visual builder to connect triggers, actions, conditions and waiting steps. Start from a template or describe a process to the workflow copilot, then review and configure the resulting workflow before publishing.'],
  ['How do email and workflow automation work together?', 'An email step can send a message from a configured channel. Waiting steps can respond to supported events such as a reply or an email open, or continue after a timeout. An open event is an engagement signal rather than proof that someone read a message, because mail applications may preload tracking images.'],
  ['Can my team keep control of AI-generated emails?', 'The email workspace supports AI-assisted drafts with a review and approval flow. Workflow email steps follow the published workflow configuration. Review the content, sending account, recipient rules and permissions before activating an automated send.'],
  ['What happens when a workflow cannot complete an action?', 'Use explicit branches for blocked messages, unanswered calls, failures and timeouts. Execution history helps your team inspect the path taken, while notifications and tasks can hand work back to a person.'],
  ['Can I test a workflow before it sends real messages?', 'Yes. Run the builder’s checks and use its sample-lead test before publishing. The test previews workflow behavior without sending real messages or placing calls. Publishing enables the configured live actions.'],
  ['What do I need to get started?', 'You need access to workflow automation in your Updata workspace, suitable CRM contacts and the permissions for the actions you choose. Configure sending accounts, phone connections or AI agents where your workflow uses them.'],
];
