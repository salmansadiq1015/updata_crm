/**
 * Run context resolution. Condition fields are resolved from the source of truth at
 * evaluation time (fresh lead, live message status, inbound replies, link clicks,
 * contact policy), never from stale snapshots — except call/analysis data, which the
 * AI nodes snapshot into the run context when they finish.
 */
import mongoose from 'mongoose';

const get = (obj, path) => path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

export async function loadLead(leadId) {
  const { default: Lead } = await import('../../crm/lead.model.js');
  return Lead.findById(leadId).select('-qualification.history').lean();
}

function qualificationValue(lead, key) {
  const field = (lead?.qualification?.fields || []).find((f) => f.fieldKey === key);
  if (!field || field.status !== 'answered') return undefined;
  return field.value;
}

/**
 * @param {Iterable<string>} fields
 * @param {{ run: object, lead?: object|null, now?: Date }} ctx
 * @returns {Promise<Map<string, any>>}
 */
export async function resolveFields(fields, { run, lead = undefined }) {
  const out = new Map();
  const list = [...fields];
  if (!list.length) return out;
  const needLead = list.some((f) => f.startsWith('lead.'));
  const leadDoc = needLead ? (lead === undefined ? await loadLead(run.leadId) : lead) : null;
  const ctx = run.context || {};
  const message = ctx.message || null;

  let messageRecipient; let replied; let clicked; const consent = new Map();
  for (const field of list) {
    const [root, ...rest] = field.split('.');
    const sub = rest.join('.');
    let value;
    switch (root) {
      case 'lead': {
        if (!leadDoc) { value = undefined; break; }
        if (sub === 'hasPhone') value = Boolean(leadDoc.mobile || leadDoc.phone || leadDoc.normalizedPhone);
        else if (sub === 'hasEmail') value = Boolean(leadDoc.email);
        else if (sub === 'assigned') value = Boolean(leadDoc.assignedTo);
        else if (sub === 'score') value = leadDoc.score?.value ?? leadDoc.scoreValue ?? null;
        else if (sub === 'scoreBand') value = leadDoc.score?.band ?? null;
        else if (sub === 'country') value = leadDoc.address?.country ?? null;
        else if (sub === 'city') value = leadDoc.address?.city ?? null;
        else if (sub.startsWith('qualification.')) value = qualificationValue(leadDoc, sub.slice('qualification.'.length));
        else if (sub.startsWith('customFields.')) value = leadDoc.customFields?.[sub.slice('customFields.'.length)] ?? null;
        else value = get(leadDoc, sub);
        break;
      }
      case 'call': {
        const call = ctx.call || {};
        if (sub.startsWith('answers.')) value = call.answers?.[sub.slice('answers.'.length)];
        else value = call[sub];
        break;
      }
      case 'analysis': {
        const a = ctx.analysis || {};
        value = sub.startsWith('fields.') ? a.fields?.[sub.slice('fields.'.length)] : a[sub];
        break;
      }
      case 'message': {
        if (!message?.recipientId) { value = ['replied', 'delivered', 'opened'].includes(sub) ? false : undefined; break; }
        if (sub === 'channel') { value = message.channel; break; }
        if (sub === 'opened') {
          const { WorkflowLink } = await import('../workflow.models.js');
          value = Boolean(await WorkflowLink.exists({ runId: run._id, kind: 'open', humanClicks: { $gt: 0 } }));
          break;
        }
        if (sub === 'replied') {
          if (replied === undefined) {
            const { default: DeliveryEvent } = await import('../../messaging/deliveryEvent.model.js');
            replied = Boolean(await DeliveryEvent.exists({
              leadId: run.leadId, direction: 'inbound', ...(message.channel ? { channel: message.channel } : {}),
              occurredAt: { $gte: new Date(message.queuedAt || run.createdAt) },
            }));
          }
          value = replied; break;
        }
        if (messageRecipient === undefined) {
          const { default: MessageRecipient } = await import('../../messaging/messageRecipient.model.js');
          messageRecipient = await MessageRecipient.findById(message.recipientId).select('status').lean();
        }
        const status = messageRecipient?.status ?? message.status ?? null;
        value = sub === 'delivered' ? ['delivered', 'read'].includes(status) : status;
        break;
      }
      case 'link': {
        if (clicked === undefined) {
          const { WorkflowLink } = await import('../workflow.models.js');
          clicked = Boolean(await WorkflowLink.exists({ runId: run._id, kind: { $ne: 'open' }, humanClicks: { $gt: 0 } }));
        }
        value = clicked; break;
      }
      case 'consent': {
        const channel = sub === 'voice' ? 'phone' : sub;
        if (!consent.has(channel)) {
          const { checkContactSuppression } = await import('../../crm/leadContactSuppression.js');
          const r = await checkContactSuppression(run.leadId, channel).catch(() => ({ suppressed: true }));
          consent.set(channel, !r?.suppressed);
        }
        value = consent.get(channel); break;
      }
      case 'run': {
        if (sub === 'visits') value = run.stepCount || 0;
        else if (sub.startsWith('attempts.')) value = (run.visits || {})[sub.slice('attempts.'.length)] || 0;
        break;
      }
      case 'event': value = get(ctx.event || {}, sub); break;
      default: value = undefined;
    }
    out.set(field, value);
  }
  return out;
}

/**
 * Text templates for internal text (notes, notifications, tasks, qualification values):
 *   {{lead.name}} {{lead.phone}} {{call.disposition}} {{analysis.qualification}} {{workflow.name}}
 * Plain messaging variables ({{firstName}}, {{businessName}}, …) are accepted too.
 * Unknown variables render as an empty string — internal text never blocks a run.
 */
export function renderText(template, { lead = null, run = null, workflowName = '' } = {}) {
  const ctx = run?.context || {};
  const name = lead?.name || [lead?.firstName, lead?.lastName].filter(Boolean).join(' ') || '';
  const flat = {
    firstName: lead?.firstName || name.split(' ')[0] || '', lastName: lead?.lastName || '', fullName: name, businessName: lead?.businessName || lead?.name || '',
    email: lead?.email || '', phone: lead?.mobile || lead?.phone || '', city: lead?.address?.city || '', country: lead?.address?.country || '',
  };
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path) => {
    if (!path.includes('.')) return flat[path] ?? '';
    const [root, ...rest] = path.split('.');
    const sub = rest.join('.');
    let v;
    if (root === 'lead') v = sub === 'name' ? name : sub === 'phone' ? flat.phone : get(lead || {}, sub);
    else if (root === 'call') v = get(ctx.call || {}, sub);
    else if (root === 'analysis') v = get(ctx.analysis || {}, sub);
    else if (root === 'event') v = get(ctx.event || {}, sub);
    else if (root === 'workflow' && sub === 'name') v = workflowName;
    if (v === null || v === undefined || typeof v === 'object') return '';
    return String(v);
  }).slice(0, 5000);
}

export const isObjectId = (v) => mongoose.isValidObjectId(v) && String(v).length === 24;
