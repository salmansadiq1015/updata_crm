/**
 * Tools the live voice model may call.
 *
 * Two kinds:
 *  - SERVER tools run here, on behalf of the signed-in person, with the same
 *    permission each module's own HTTP route requires and the same scoping
 *    (owner for e-mail/notifications, viewer for follow-ups, lead governance
 *    for leads). The ERP agent pipeline (crm_request) carries its own RBAC.
 *  - CLIENT tools (open_page, end_conversation) are declared here so the model
 *    sees one tool list, but the browser executes them.
 *
 * Every executor returns { result, display }: `result` is what the model reads
 * (compact, no secrets), `display` is what the screen renders as a card.
 */
import { satisfiesPermission, loadUserPermissions } from '../../../shared/middleware/authenticate.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { runCrmRequest, confirmPendingRun } from './voiceAgent.agentBridge.js';

// ── Pages the assistant may open ────────────────────────────────────────────
export const VOICE_PAGES = Object.freeze({
  dashboard: '/dashboard',
  tasks: '/tasks',
  calendar: '/scheduling/calendar',
  meetings: '/scheduling/meetings',
  email: '/email',
  notifications: '/notifications',
  chat: '/field-ops/chat',
  assistant: '/ai',
  employees: '/settings/users',
  leads: '/leads',
  follow_ups: '/leads/follow-ups',
  lead_generation: '/lead-generation',
  ai_calling: '/ai-calling',
  incoming_calls: '/incoming-calls',
  customers: '/crm/customers',
  sites: '/crm/sites',
  installations: '/crm/installations',
  maintenance: '/crm/asset-maintenance',
  quotes: '/quotes',
  projects: '/projects',
  orders: '/field-ops/orders',
  reports: '/field-ops/reports',
  time_tracking: '/field-ops/time',
  documents: '/documents',
  accounting: '/accounting',
  vehicles: '/vehicles',
  profile: '/profile',
});

// ── Permission helpers ──────────────────────────────────────────────────────
async function permissionChecker(user, permissions) {
  const isAdmin = user?.role?.name === 'Admin' || permissions?.includes('*');
  const perms = isAdmin ? [] : (permissions?.length ? permissions : await loadUserPermissions(user));
  return (permission) => isAdmin || satisfiesPermission(perms, permission);
}

function denied(permission) {
  return {
    result: { status: 'failed', code: 'PERMISSION_DENIED', message: `The person lacks the permission "${permission}" for this.` },
    display: null,
  };
}

const clampLimit = (n, def = 8, max = 20) => Math.max(1, Math.min(Number(n) || def, max));
const userName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || null : null);

// ── Time: the model speaks in the person's local time, never UTC ───────────
/** Minutes the zone is ahead of UTC at that instant (Zurich summer = 120). */
export function zoneOffsetMinutes(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/**
 * Reads a date the model produced. An explicit offset/Z is honoured; a bare
 * date or a date-time without offset is the person's LOCAL time (that is what
 * the instructions ask the model for) — not the server's.
 */
export function parseZoned(value, timeZone = 'Europe/Zurich') {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  // Two passes settle the offset across a DST change.
  let guess = new Date(wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60000);
  guess = new Date(wall - zoneOffsetMinutes(guess, timeZone) * 60000);
  return Number.isNaN(guess.getTime()) ? null : guess;
}

/** "2026-11-06 14:30" in the person's zone — what the model reads and says. */
export function localTime(d, timeZone = 'Europe/Zurich') {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Local day boundaries: [from, to) — default the person's today. */
export function dayRange(from, to, timeZone = 'Europe/Zurich', now = new Date()) {
  const today = now.toLocaleDateString('en-CA', { timeZone });
  const start = parseZoned(from, timeZone) || parseZoned(today, timeZone);
  let end = parseZoned(to, timeZone);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(to).trim()) && end) {
    // A bare end date means "through that day".
    end = parseZoned(new Date(end.getTime() + 36 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone }), timeZone);
  }
  if (!end || end <= start) end = parseZoned(new Date(start.getTime() + 36 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone }), timeZone);
  return { start, end };
}

// ── Lead governance (team scoping + PII masking), as the HTTP router applies ─
async function withLeadGovernance(user, fn) {
  const [{ getGovernanceSettings }, { runWithAccessContext }, leadAccess, masking] = await Promise.all([
    import('../../../shared/security/governanceSettings.js'),
    import('../../../shared/security/requestAccessContext.js'),
    import('../../governance/leadAccess.js'),
    import('../../../shared/security/fieldMasking.js'),
  ]);
  const settings = getGovernanceSettings();
  const ctx = { settings, scope: null };
  if (settings.teamMode) ctx.scope = await leadAccess.resolveLeadScope(user, settings);
  const value = await runWithAccessContext(ctx, fn);
  if (settings.piiMaskingEnabled && !(await leadAccess.userHasPermission(user, masking.PII_UNMASK_PERMISSION))) {
    return masking.maskSensitive(value);
  }
  return value;
}

async function viewerFor(user, has) {
  return {
    id: String(user._id),
    department: user.department || null,
    isSupervisor: has('lead:assign-policy'),
    canSeeAllTranscripts: has('ai-calling:admin'),
  };
}

function summarizeLead(lead) {
  return {
    id: String(lead._id || lead.id),
    name: lead.name,
    number: lead.leadNumber || null,
    status: lead.status,
    city: lead.address?.city || null,
    phone: lead.mobile || lead.phone || null,
    email: lead.email || null,
    assignedTo: userName(lead.assignedTo) || null,
  };
}

function summarizeFollowUp(fu, tz) {
  return {
    id: fu.id,
    lead: fu.lead?.name,
    leadId: fu.leadId,
    due: localTime(fu.nextDueAt || fu.dueAt, tz),
    bucket: fu.bucket,
    channel: fu.channel,
    note: fu.note ? String(fu.note).slice(0, 200) : null,
    priority: fu.priority,
    owner: fu.owner?.name || null,
    status: fu.status,
  };
}

// ── Executors ───────────────────────────────────────────────────────────────
const EXECUTORS = {
  async crm_request(args, ctx) {
    const request = String(args.request || '').trim();
    if (!request) throw new AppError('request is required', 400, 'VALIDATION_ERROR');
    return runCrmRequest({
      request,
      continuesPrevious: Boolean(args.continues_previous),
      replyLanguage: args.reply_language,
      user: ctx.user,
      permissions: ctx.permissions,
      threadId: ctx.threadId,
      context: ctx.requestContext,
      meta: { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
    });
  },

  async confirm_pending_action(args, ctx) {
    if (!args.run_id) throw new AppError('run_id is required', 400, 'VALIDATION_ERROR');
    return confirmPendingRun({ runId: String(args.run_id), approve: args.approve === true, replyLanguage: args.reply_language, user: ctx.user });
  },

  async get_my_day(args, ctx) {
    const has = ctx.has;
    const userId = String(ctx.user._id);
    const { start, end } = dayRange(args.date, null, ctx.timeZone);
    const sections = {};
    const jobs = [];

    if (has('tasks:read')) {
      jobs.push((async () => {
        const Task = (await import('../../tasks/task.model.js')).default;
        const open = { $in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] };
        const mine = { $or: [{ assigneeIds: ctx.user._id }, { assigneeId: ctx.user._id }] };
        const [due, overdue] = await Promise.all([
          Task.find({ ...mine, status: open, dueDate: { $gte: start, $lt: end }, isDeleted: false }).select('title dueDate priority status').limit(10).lean(),
          Task.countDocuments({ ...mine, status: open, dueDate: { $lt: start }, isDeleted: false }),
        ]);
        sections.tasks = { dueToday: due.map((t) => ({ id: String(t._id), title: t.title, priority: t.priority, due: localTime(t.dueDate, ctx.timeZone) })), overdueCount: overdue };
      })().catch(() => { sections.tasks = { error: 'unavailable' }; }));
    }
    if (has('meetings:read')) {
      jobs.push((async () => {
        const meetingRepository = (await import('../../meetings/meeting.repository.js')).default;
        const page = await meetingRepository.findWithCursor({ limit: 10, sortBy: 'startAt', sortOrder: 'asc', filters: { dateFrom: start, dateTo: end, participantId: userId } });
        sections.meetings = (page.data || []).map((m) => ({ id: String(m._id), title: m.title, start: localTime(m.startAt, ctx.timeZone), end: localTime(m.endAt, ctx.timeZone), location: m.location || null }));
      })().catch(() => { sections.meetings = { error: 'unavailable' }; }));
    }
    if (has('scheduling:read')) {
      jobs.push((async () => {
        const calendarService = (await import('../../deploy/calendar.service.js')).default;
        const rows = await calendarService.getCalendarData(start, end, { employeeIds: [userId] });
        const assignments = (rows || []).flatMap((r) => r.assignments || []);
        sections.assignments = assignments.slice(0, 10).map((a) => ({
          id: String(a._id), title: a.title || a.assignmentType, start: localTime(a.startDatetime, ctx.timeZone), end: localTime(a.endDatetime, ctx.timeZone),
          customer: a.customerId?.name || a.customerName || null,
        }));
      })().catch(() => { sections.assignments = { error: 'unavailable' }; }));
    }
    if (has('lead:read')) {
      jobs.push((async () => {
        const leadFollowUpService = (await import('../../crm/leadFollowUp.service.js')).default;
        const viewer = await viewerFor(ctx.user, has);
        const summary = await withLeadGovernance(ctx.user, () => leadFollowUpService.summary({ scope: 'mine', tz: ctx.timeZone }, viewer));
        sections.followUps = { overdue: summary.overdue ?? 0, today: summary.today ?? 0, upcoming: summary.upcoming ?? 0 };
      })().catch(() => { sections.followUps = { error: 'unavailable' }; }));
    }
    if (has('notifications:feed')) {
      jobs.push((async () => {
        const feed = (await import('../../notifications/notificationFeed.service.js')).default;
        sections.unreadNotifications = await feed.getUnreadCount(userId);
      })().catch(() => { sections.unreadNotifications = null; }));
    }
    if (has('email:read')) {
      jobs.push((async () => {
        const email = await import('../../email/email.service.js');
        const page = await email.listMessages(userId, { folder: 'inbox', unread: 'true', limit: 5 });
        sections.unreadEmails = (page.items || []).map((m) => ({ subject: m.subject, from: m.from?.name || m.from?.address || m.from || null }));
      })().catch(() => { sections.unreadEmails = { error: 'unavailable' }; }));
    }
    await Promise.all(jobs);
    return {
      result: { status: 'completed', date: start.toLocaleDateString('en-CA', { timeZone: ctx.timeZone }), timeZone: ctx.timeZone, ...sections },
      display: { kind: 'briefing', date: start.toISOString(), sections },
    };
  },

  async search_leads(args, ctx) {
    if (!ctx.has('lead:read')) return denied('lead:read');
    const leadService = (await import('../../crm/lead.service.js')).default;
    const params = { limit: clampLimit(args.limit), sortBy: 'createdAt', sortOrder: 'desc' };
    if (args.query) params.q = String(args.query).slice(0, 120);
    if (args.status) params.status = args.status;
    if (args.city) params.city = String(args.city).slice(0, 80);
    const page = await withLeadGovernance(ctx.user, () => leadService.list(params));
    const leads = (page.data || []).map(summarizeLead);
    return {
      result: { status: 'completed', total: page.pagination?.total ?? leads.length, leads },
      display: { kind: 'leads', leads },
    };
  },

  async create_lead(args, ctx) {
    if (!ctx.has('lead:write')) return denied('lead:write');
    const name = String(args.name || '').trim();
    if (!name) return { result: { status: 'needs_follow_up', message: 'Ask for the lead\'s name.' }, display: null };
    const leadService = (await import('../../crm/lead.service.js')).default;
    const data = {
      name,
      type: args.type === 'private' ? 'private' : 'business',
      source: 'manual',
      ...(args.phone ? { phone: String(args.phone) } : {}),
      ...(args.email ? { email: String(args.email).toLowerCase() } : {}),
      ...(args.city ? { address: { city: String(args.city) } } : {}),
      ...(args.notes ? { notes: String(args.notes).slice(0, 2000) } : {}),
    };
    const lead = await withLeadGovernance(ctx.user, () => leadService.create(data, ctx.user._id, { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, source: 'ai-voice' }));
    const summary = summarizeLead(lead);
    return {
      result: { status: 'completed', lead: summary, duplicateWarning: Boolean(lead.duplicateWarning) },
      display: { kind: 'record', recordType: 'lead', id: summary.id, title: summary.name, subtitle: summary.number, href: `/leads?leadId=${summary.id}` },
    };
  },

  async update_lead_status(args, ctx) {
    if (!ctx.has('lead:write')) return denied('lead:write');
    const leadService = (await import('../../crm/lead.service.js')).default;
    const STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];
    if (!STATUSES.includes(args.status)) return { result: { status: 'failed', message: `Status must be one of ${STATUSES.join(', ')}.` }, display: null };
    let leadId = args.lead_id;
    if (!leadId) {
      const page = await withLeadGovernance(ctx.user, () => leadService.list({ q: String(args.lead_name || ''), limit: 5 }));
      const matches = page.data || [];
      if (!matches.length) return { result: { status: 'failed', message: 'No lead with that name was found.' }, display: null };
      if (matches.length > 1) {
        return { result: { status: 'needs_follow_up', message: 'Several leads match; ask which one.', candidates: matches.map(summarizeLead) }, display: { kind: 'leads', leads: matches.map(summarizeLead) } };
      }
      leadId = String(matches[0]._id);
    }
    const lead = await withLeadGovernance(ctx.user, () => leadService.update(leadId, { status: args.status }, { userId: ctx.user._id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }));
    const summary = summarizeLead(lead);
    return {
      result: { status: 'completed', lead: summary },
      display: { kind: 'record', recordType: 'lead', id: summary.id, title: summary.name, subtitle: args.status, href: `/leads?leadId=${summary.id}` },
    };
  },

  async list_follow_ups(args, ctx) {
    if (!ctx.has('lead:read')) return denied('lead:read');
    const leadFollowUpService = (await import('../../crm/leadFollowUp.service.js')).default;
    const viewer = await viewerFor(ctx.user, ctx.has);
    const bucket = ['overdue', 'today', 'upcoming', 'open', 'done'].includes(args.bucket) ? args.bucket : 'open';
    const page = await withLeadGovernance(ctx.user, () => leadFollowUpService.list({ scope: 'mine', bucket, limit: clampLimit(args.limit), tz: ctx.timeZone }, viewer));
    const items = (page.data || []).map((f) => summarizeFollowUp(f, ctx.timeZone));
    return {
      result: { status: 'completed', bucket, count: items.length, hasMore: Boolean(page.pagination?.hasNext), followUps: items },
      display: { kind: 'follow_ups', bucket, followUps: items },
    };
  },

  async create_follow_up(args, ctx) {
    if (!ctx.has('lead:write')) return denied('lead:write');
    const due = parseZoned(args.due_at, ctx.timeZone);
    if (!due) return { result: { status: 'needs_follow_up', message: 'Ask when the follow-up is due.' }, display: null };
    const leadService = (await import('../../crm/lead.service.js')).default;
    const leadFollowUpService = (await import('../../crm/leadFollowUp.service.js')).default;
    let leadId = args.lead_id;
    if (!leadId) {
      const page = await withLeadGovernance(ctx.user, () => leadService.list({ q: String(args.lead_name || ''), limit: 5 }));
      const matches = page.data || [];
      if (!matches.length) return { result: { status: 'failed', message: 'No lead with that name was found.' }, display: null };
      if (matches.length > 1) return { result: { status: 'needs_follow_up', message: 'Several leads match; ask which one.', candidates: matches.map(summarizeLead) }, display: null };
      leadId = String(matches[0]._id);
    }
    const CHANNELS = ['phone', 'sms', 'email', 'whatsapp', 'in_person', 'letter', 'other'];
    const viewer = await viewerFor(ctx.user, ctx.has);
    const fu = await withLeadGovernance(ctx.user, () => leadFollowUpService.create({
      leadId,
      dueAt: due,
      timezone: ctx.timeZone,
      channel: CHANNELS.includes(args.channel) ? args.channel : null,
      note: args.note ? String(args.note).slice(0, 1000) : null,
      priority: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(args.priority) ? args.priority : 'NORMAL',
    }, viewer, { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }));
    const summary = summarizeFollowUp(fu, ctx.timeZone);
    return {
      result: { status: 'completed', followUp: summary },
      display: { kind: 'record', recordType: 'follow_up', id: summary.id, title: summary.lead, subtitle: summary.due, href: '/leads/follow-ups' },
    };
  },

  async complete_follow_up(args, ctx) {
    if (!ctx.has('lead:write')) return denied('lead:write');
    if (!args.follow_up_id) return { result: { status: 'needs_follow_up', message: 'List the follow-ups first to know which one.' }, display: null };
    const leadFollowUpService = (await import('../../crm/leadFollowUp.service.js')).default;
    const viewer = await viewerFor(ctx.user, ctx.has);
    const fu = await withLeadGovernance(ctx.user, () => leadFollowUpService.complete(String(args.follow_up_id), { note: args.note || null }, viewer, { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }));
    return { result: { status: 'completed', followUp: summarizeFollowUp(fu, ctx.timeZone) }, display: null };
  },

  async list_calendar(args, ctx) {
    const { start, end } = dayRange(args.date_from, args.date_to, ctx.timeZone);
    const userId = String(ctx.user._id);
    const out = { status: 'completed', from: localTime(start, ctx.timeZone), to: localTime(end, ctx.timeZone), timeZone: ctx.timeZone };
    if (ctx.has('meetings:read')) {
      const meetingRepository = (await import('../../meetings/meeting.repository.js')).default;
      const page = await meetingRepository.findWithCursor({ limit: 20, sortBy: 'startAt', sortOrder: 'asc', filters: { dateFrom: start, dateTo: end, participantId: userId } });
      out.meetings = (page.data || []).map((m) => ({ id: String(m._id), title: m.title, start: localTime(m.startAt, ctx.timeZone), end: localTime(m.endAt, ctx.timeZone), location: m.location || null }));
    }
    if (ctx.has('scheduling:read')) {
      const calendarService = (await import('../../deploy/calendar.service.js')).default;
      const rows = await calendarService.getCalendarData(start, end, { employeeIds: [userId] });
      out.assignments = (rows || []).flatMap((r) => r.assignments || []).slice(0, 20).map((a) => ({
        id: String(a._id), title: a.title || a.assignmentType, start: localTime(a.startDatetime, ctx.timeZone), end: localTime(a.endDatetime, ctx.timeZone), status: a.status,
      }));
    }
    if (!out.meetings && !out.assignments) return denied('meetings:read');
    return { result: out, display: { kind: 'calendar', ...out } };
  },

  async create_meeting(args, ctx) {
    if (!ctx.has('meetings:write')) return denied('meetings:write');
    const title = String(args.title || '').trim();
    const startAt = parseZoned(args.start_at, ctx.timeZone);
    if (title.length < 2 || !startAt) return { result: { status: 'needs_follow_up', message: 'Ask for the meeting title and start time.' }, display: null };
    const minutes = Math.max(5, Math.min(Number(args.duration_minutes) || 30, 12 * 60));
    const endAt = parseZoned(args.end_at, ctx.timeZone) || new Date(startAt.getTime() + minutes * 60000);
    const participants = [];
    if (Array.isArray(args.participant_names) && args.participant_names.length) {
      const userService = (await import('../../auth/user.service.js')).default;
      for (const name of args.participant_names.slice(0, 10)) {
        const found = await userService.listUsers({ search: String(name), status: 'active', limit: 1 });
        const u = found.data?.[0];
        if (u) participants.push({ userId: u._id, displayName: userName(u), role: 'REQUIRED' });
      }
    }
    const meetingService = (await import('../../meetings/meeting.service.js')).default;
    const meeting = await meetingService.create({
      title, startAt, endAt, timezone: ctx.timeZone,
      ...(args.description ? { description: String(args.description).slice(0, 2000) } : {}),
      ...(args.location ? { location: String(args.location).slice(0, 200) } : {}),
      ...(participants.length ? { participants } : {}),
    }, ctx.user._id, { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    const id = String(meeting._id);
    return {
      result: { status: 'completed', meeting: { id, title, start: localTime(startAt, ctx.timeZone), end: localTime(endAt, ctx.timeZone), participants: participants.map((p) => p.displayName) } },
      display: { kind: 'record', recordType: 'meeting', id, title, subtitle: localTime(startAt, ctx.timeZone), href: '/scheduling/meetings' },
    };
  },

  async list_notifications(args, ctx) {
    if (!ctx.has('notifications:feed')) return denied('notifications:feed');
    const feed = (await import('../../notifications/notificationFeed.service.js')).default;
    const page = await feed.getFeed(String(ctx.user._id), { limit: clampLimit(args.limit), ...(args.unread_only === false ? {} : { isRead: false }) });
    const items = (page.data || []).map((n) => ({ id: String(n._id), title: n.title, body: n.body ? String(n.body).slice(0, 200) : null, category: n.category, at: localTime(n.sentAt || n.createdAt, ctx.timeZone), read: Boolean(n.isRead) }));
    return {
      result: { status: 'completed', unread: page.summary?.unread ?? null, notifications: items },
      display: { kind: 'notifications', notifications: items },
    };
  },

  async mark_notifications_read(_args, ctx) {
    if (!ctx.has('notifications:feed')) return denied('notifications:feed');
    const feed = (await import('../../notifications/notificationFeed.service.js')).default;
    const res = await feed.markAllRead(String(ctx.user._id));
    return { result: { status: 'completed', marked: res?.modifiedCount ?? 0 }, display: null };
  },

  async find_employee(args, ctx) {
    const userService = (await import('../../auth/user.service.js')).default;
    const search = String(args.name || '').trim();
    if (!search) return { result: { status: 'needs_follow_up', message: 'Ask for the name.' }, display: null };
    const page = await userService.listUsers({ search, status: 'active', limit: 5, sortBy: 'firstName', sortOrder: 'asc' });
    const full = ctx.has('users:read');
    const people = (page.data || []).map((u) => ({
      id: String(u._id),
      name: userName(u),
      email: u.email,
      ...(full ? { phone: u.phone || null, role: u.role?.name || null, department: u.department || null, position: u.position || null } : {}),
    }));
    return { result: { status: 'completed', people }, display: { kind: 'people', people } };
  },

  async list_inbox(args, ctx) {
    if (!ctx.has('email:read')) return denied('email:read');
    const email = await import('../../email/email.service.js');
    const query = { folder: 'inbox', limit: clampLimit(args.limit) };
    if (args.unread_only !== false) query.unread = 'true';
    if (args.query) query.q = String(args.query).slice(0, 120);
    const page = await email.listMessages(String(ctx.user._id), query);
    const items = (page.items || []).map((m) => ({
      id: String(m._id || m.id), subject: m.subject || '(no subject)',
      from: m.from?.name || m.from?.address || (typeof m.from === 'string' ? m.from : null),
      at: localTime(m.date, ctx.timeZone), snippet: m.snippet ? String(m.snippet).slice(0, 160) : null, unread: Boolean(m.unread),
    }));
    return { result: { status: 'completed', messages: items }, display: { kind: 'emails', messages: items } };
  },
};

// ── Declarations for the realtime session ───────────────────────────────────
const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  name,
  description,
  parameters: { type: 'object', properties, required, additionalProperties: false },
});

export const CLIENT_TOOLS = Object.freeze(['open_page', 'end_conversation']);

export function toolDeclarations() {
  return [
    fn('crm_request', 'Call this IMMEDIATELY with whatever the person asked, even if details seem missing (e.g. "create an order for Meier") — never ask for details first; the result tells you exactly what to ask. Runs any ERP request in natural language through the Updata agent: create/update/delete/search tasks, customers, projects, orders/jobs, assignments/appointments, service reports, notes, quotations, invoices, reminders; record hours; send internal chat messages or notifications; workforce availability, who can take a slot, maintenance due, material status, permits, project figures, supplier payments, document filing, closing checks, sales follow-ups, vehicle fleet (create/update vehicles, status, meter reading, drivers, service and fuel logs, pool bookings, what is due), draft customer messages, company knowledge questions.', {
      request: { type: 'string', description: 'The complete request in one sentence with every detail the person gave (names, dates, times, priority, amounts). Any language.' },
      continues_previous: { type: 'boolean', description: 'true only when this answers a question the previous crm_request result asked (needs_follow_up).' },
      reply_language: { type: 'string', description: 'ISO 639-1 code of the language the person is speaking right now (e.g. en, de, fr, ur, ar). The result comes back in that language.' },
    }, ['request', 'reply_language']),
    fn('confirm_pending_action', 'Approve or cancel an action that is awaiting confirmation. Only after the person clearly said yes (approve=true) or no (approve=false).', {
      run_id: { type: 'string', description: 'run_id from the awaiting_confirmation result.' },
      approve: { type: 'boolean' },
      reply_language: { type: 'string', description: 'ISO 639-1 code of the language the person is speaking.' },
    }, ['run_id', 'approve']),
    fn('get_my_day', 'Daily briefing for the person: tasks due and overdue, meetings, field assignments, lead follow-ups, unread notifications and e-mails.', {
      date: { type: 'string', description: 'ISO date (YYYY-MM-DD); default today.' },
    }),
    fn('search_leads', 'Search CRM leads (prospects) by name, number, contact, city or status.', {
      query: { type: 'string' },
      status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted'] },
      city: { type: 'string' },
      limit: { type: 'integer' },
    }),
    fn('create_lead', 'Create a new CRM lead (prospect).', {
      name: { type: 'string', description: 'Company or person name.' },
      type: { type: 'string', enum: ['business', 'private'] },
      phone: { type: 'string' },
      email: { type: 'string' },
      city: { type: 'string' },
      notes: { type: 'string' },
    }, ['name']),
    fn('update_lead_status', 'Change the status of a lead.', {
      lead_id: { type: 'string', description: 'Lead id if known from a previous result.' },
      lead_name: { type: 'string', description: 'Lead name if no id is known.' },
      status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted'] },
    }, ['status']),
    fn('list_follow_ups', 'List the person\'s lead follow-ups.', {
      bucket: { type: 'string', enum: ['overdue', 'today', 'upcoming', 'open', 'done'] },
      limit: { type: 'integer' },
    }),
    fn('create_follow_up', 'Schedule a follow-up on a lead.', {
      lead_id: { type: 'string' },
      lead_name: { type: 'string' },
      due_at: { type: 'string', description: 'ISO date-time in the person\'s local time.' },
      channel: { type: 'string', enum: ['phone', 'sms', 'email', 'whatsapp', 'in_person', 'letter', 'other'] },
      note: { type: 'string' },
      priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] },
    }, ['due_at']),
    fn('complete_follow_up', 'Mark a follow-up as done. Needs the id from list_follow_ups.', {
      follow_up_id: { type: 'string' },
      note: { type: 'string' },
    }, ['follow_up_id']),
    fn('list_calendar', 'The person\'s meetings and field assignments in a date range (default today).', {
      date_from: { type: 'string', description: 'ISO date or date-time.' },
      date_to: { type: 'string', description: 'ISO date or date-time (exclusive).' },
    }),
    fn('create_meeting', 'Create a meeting / calendar event. (Field-service appointments for technicians go through crm_request.)', {
      title: { type: 'string' },
      start_at: { type: 'string', description: 'ISO date-time, local time.' },
      duration_minutes: { type: 'integer' },
      end_at: { type: 'string' },
      location: { type: 'string' },
      description: { type: 'string' },
      participant_names: { type: 'array', items: { type: 'string' }, description: 'Colleagues to invite, by name.' },
    }, ['title', 'start_at']),
    fn('list_notifications', 'The person\'s in-app notifications (unread by default).', {
      unread_only: { type: 'boolean' },
      limit: { type: 'integer' },
    }),
    fn('mark_notifications_read', 'Mark all of the person\'s notifications as read.'),
    fn('find_employee', 'Find a colleague by name: e-mail, phone, role, department.', {
      name: { type: 'string' },
    }, ['name']),
    fn('list_inbox', 'Recent e-mails in the person\'s inbox (unread by default).', {
      unread_only: { type: 'boolean' },
      query: { type: 'string' },
      limit: { type: 'integer' },
    }),
    fn('open_page', 'Open a page of the app on the person\'s screen.', {
      page: { type: 'string', enum: Object.keys(VOICE_PAGES) },
    }, ['page']),
    fn('end_conversation', 'End the voice conversation after saying goodbye.'),
  ];
}

export const SERVER_TOOLS = Object.freeze(Object.keys(EXECUTORS));

/**
 * Runs one server tool for one person. Unknown names and client tools are
 * refused here — the browser must never be able to reach an executor that is
 * not on the list.
 */
export async function executeVoiceTool(name, args, ctx) {
  const executor = Object.prototype.hasOwnProperty.call(EXECUTORS, name) ? EXECUTORS[name] : null;
  if (!executor) throw new AppError(`Unknown voice tool: ${name}`, 400, 'VOICE_TOOL_UNKNOWN');
  const has = await permissionChecker(ctx.user, ctx.permissions);
  return executor(args && typeof args === 'object' ? args : {}, { ...ctx, has, timeZone: ctx.timeZone || 'Europe/Zurich' });
}
