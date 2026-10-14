import MessageTemplate from '../modules/messaging/messageTemplate.model.js';
import { extractVariables } from '../modules/messaging/personalization.js';
import logger from '../shared/logger/index.js';

const BRAND = {
  primary: '#315CF4',
  ink: '#172033',
  muted: '#667085',
  border: '#E4E7EC',
  surface: '#F8FAFC',
};

function emailHtml({ eyebrow, heading, paragraphs, cta = 'Reply to this email' }) {
  const content = paragraphs.map((paragraph) => (
    `<p style="margin:0 0 16px;font:400 16px/1.65 Arial,sans-serif;color:${BRAND.ink};">${paragraph}</p>`
  )).join('');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title></head>
<body style="margin:0;padding:0;background:${BRAND.surface};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.surface};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fff;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(16,24,40,.06);">
        <tr><td style="height:5px;background:${BRAND.primary};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:34px 34px 12px;">
          <p style="margin:0 0 10px;font:700 12px/1.4 Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase;color:${BRAND.primary};">${eyebrow}</p>
          <h1 style="margin:0 0 24px;font:700 26px/1.25 Arial,sans-serif;color:${BRAND.ink};">${heading}</h1>
          ${content}
        </td></tr>
        <tr><td style="padding:4px 34px 30px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:8px;background:${BRAND.primary};padding:12px 18px;">
            <span style="font:700 14px/1 Arial,sans-serif;color:#fff;">${cta}</span>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:22px 34px;background:${BRAND.surface};border-top:1px solid ${BRAND.border};">
          <p style="margin:0 0 4px;font:700 14px/1.5 Arial,sans-serif;color:${BRAND.ink};">{{senderName}}</p>
          <p style="margin:0;font:400 13px/1.5 Arial,sans-serif;color:${BRAND.muted};">{{companyName}}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function template({ name, purpose, category, description, subject, heading, eyebrow, paragraphs, bodyText, cta }) {
  const bodyHtml = emailHtml({ eyebrow, heading, paragraphs, cta });
  return {
    name,
    channel: 'email',
    purpose,
    category,
    description,
    subject,
    bodyHtml,
    bodyText,
    requiredVariables: extractVariables(subject, bodyHtml, bodyText),
    fallbackValues: {
      firstName: 'there',
      businessName: 'your team',
      companyName: 'Updata.ai',
      senderName: 'Updata.ai team',
      city: 'your area',
    },
    isShared: true,
    isArchived: false,
  };
}

export const OUTREACH_EMAIL_TEMPLATES = Object.freeze([
  template({
    name: 'Business Introduction', purpose: 'promotional', category: 'business-introduction',
    description: 'A concise first introduction to a new business lead.',
    subject: 'A quick introduction from {{companyName}}', eyebrow: 'Introduction',
    heading: 'Hello {{firstName}},',
    paragraphs: [
      'I’m {{senderName}} from {{companyName}}. I wanted to introduce our team and learn more about the priorities at {{businessName}}.',
      'If a short conversation would be useful, simply reply with a convenient time. There is no obligation and we will keep it focused on your needs.',
    ],
    bodyText: 'Hello {{firstName}},\n\nI’m {{senderName}} from {{companyName}}. I wanted to introduce our team and learn more about the priorities at {{businessName}}.\n\nIf a short conversation would be useful, simply reply with a convenient time. There is no obligation and we will keep it focused on your needs.\n\n{{senderName}}\n{{companyName}}',
  }),
  template({
    name: 'Sales Outreach', purpose: 'promotional', category: 'sales-outreach',
    description: 'A consultative outreach message focused on the lead’s needs.',
    subject: 'A practical idea for {{businessName}}', eyebrow: 'A practical idea',
    heading: 'Could we help with your next priority?',
    paragraphs: [
      'Hello {{firstName}}, I’m reaching out because {{businessName}} may be evaluating ways to improve its current workflow.',
      'At {{companyName}}, we begin by understanding the problem before suggesting a service. Would you be open to a brief conversation to see whether there is a useful fit?',
    ],
    bodyText: 'Hello {{firstName}},\n\nI’m reaching out because {{businessName}} may be evaluating ways to improve its current workflow. At {{companyName}}, we begin by understanding the problem before suggesting a service.\n\nWould you be open to a brief conversation to see whether there is a useful fit?\n\n{{senderName}}\n{{companyName}}',
  }),
  template({
    name: 'Lead Follow-up', purpose: 'promotional', category: 'lead-follow-up',
    description: 'A respectful follow-up after an earlier outreach.',
    subject: 'Following up with {{businessName}}', eyebrow: 'Follow-up',
    heading: 'A quick follow-up, {{firstName}}',
    paragraphs: [
      'I wanted to follow up on my earlier note in case it arrived at a busy time.',
      'If this is relevant for {{businessName}}, I would be glad to answer questions or arrange a short conversation. If it is not a priority, no response is needed.',
    ],
    bodyText: 'Hello {{firstName}},\n\nI wanted to follow up on my earlier note in case it arrived at a busy time. If this is relevant for {{businessName}}, I would be glad to answer questions or arrange a short conversation. If it is not a priority, no response is needed.\n\n{{senderName}}\n{{companyName}}',
  }),
  template({
    name: 'Meeting Request', purpose: 'promotional', category: 'meeting-request',
    description: 'Invite a lead to choose a convenient time for a short meeting.',
    subject: 'A short meeting with {{companyName}}?', eyebrow: 'Meeting request',
    heading: 'Would a short conversation help?',
    paragraphs: [
      'Hello {{firstName}}, I would appreciate the opportunity to learn about the current goals at {{businessName}}.',
      'If you are open to it, reply with a day and time that suits you. I will confirm the details and keep the meeting concise.',
    ],
    bodyText: 'Hello {{firstName}},\n\nI would appreciate the opportunity to learn about the current goals at {{businessName}}. If you are open to it, reply with a day and time that suits you. I will confirm the details and keep the meeting concise.\n\n{{senderName}}\n{{companyName}}',
    cta: 'Suggest a time',
  }),
  template({
    name: 'Quote Follow-up', purpose: 'transactional', category: 'quote-follow-up',
    description: 'Check whether a lead has questions about an existing quote.',
    subject: 'Any questions about your quote, {{firstName}}?', eyebrow: 'Quote follow-up',
    heading: 'We are here if you need clarification',
    paragraphs: [
      'Hello {{firstName}}, I’m checking in regarding the quote shared with {{businessName}}.',
      'Please reply if you would like us to clarify an item, discuss timing, or update the scope. We will not make any changes without your confirmation.',
    ],
    bodyText: 'Hello {{firstName}},\n\nI’m checking in regarding the quote shared with {{businessName}}. Please reply if you would like us to clarify an item, discuss timing, or update the scope. We will not make any changes without your confirmation.\n\n{{senderName}}\n{{companyName}}',
  }),
  template({
    name: 'Customer Support Check-in', purpose: 'support', category: 'customer-support',
    description: 'A helpful check-in after a support interaction.',
    subject: 'How is everything going, {{firstName}}?', eyebrow: 'Customer care',
    heading: 'Checking in after your support request',
    paragraphs: [
      'Hello {{firstName}}, I wanted to check that everything is working as expected for {{businessName}}.',
      'If anything remains unresolved, reply to this message with the details and our team will review them.',
    ],
    bodyText: 'Hello {{firstName}},\n\nI wanted to check that everything is working as expected for {{businessName}}. If anything remains unresolved, reply to this message with the details and our team will review them.\n\n{{senderName}}\n{{companyName}}',
  }),
  template({
    name: 'Thank You', purpose: 'transactional', category: 'thank-you',
    description: 'Thank a lead or customer after a conversation or meeting.',
    subject: 'Thank you for your time, {{firstName}}', eyebrow: 'Thank you',
    heading: 'It was good speaking with you',
    paragraphs: [
      'Thank you for taking the time to speak with us about {{businessName}}.',
      'We appreciate the context you shared. If another question comes up, reply at any time and we will be happy to help.',
    ],
    bodyText: 'Hello {{firstName}},\n\nThank you for taking the time to speak with us about {{businessName}}. We appreciate the context you shared. If another question comes up, reply at any time and we will be happy to help.\n\n{{senderName}}\n{{companyName}}',
  }),
  template({
    name: 'Re-engagement', purpose: 'promotional', category: 're-engagement',
    description: 'Reconnect with a previously engaged lead without applying pressure.',
    subject: 'Is this still relevant for {{businessName}}?', eyebrow: 'Reconnecting',
    heading: 'Checking whether priorities have changed',
    paragraphs: [
      'Hello {{firstName}}, it has been a while since we last connected, so I wanted to ask whether this topic is still relevant for {{businessName}}.',
      'If the timing is better now, I would be happy to pick up the conversation. If not, there is nothing you need to do.',
    ],
    bodyText: 'Hello {{firstName}},\n\nIt has been a while since we last connected, so I wanted to ask whether this topic is still relevant for {{businessName}}. If the timing is better now, I would be happy to pick up the conversation. If not, there is nothing you need to do.\n\n{{senderName}}\n{{companyName}}',
  }),
  template({
    name: 'Service Overview', purpose: 'promotional', category: 'service-promotion',
    description: 'Introduce services without fabricated claims, prices, or discounts.',
    subject: 'How {{companyName}} could support {{businessName}}', eyebrow: 'Service overview',
    heading: 'Support shaped around your requirements',
    paragraphs: [
      'Hello {{firstName}}, {{companyName}} works with organisations that want practical support tailored to their existing process.',
      'Rather than assume what {{businessName}} needs, we would first learn about your requirements and then explain which options may be suitable.',
    ],
    bodyText: 'Hello {{firstName}},\n\n{{companyName}} works with organisations that want practical support tailored to their existing process. Rather than assume what {{businessName}} needs, we would first learn about your requirements and then explain which options may be suitable.\n\n{{senderName}}\n{{companyName}}',
  }),
  template({
    name: 'Appointment Reminder', purpose: 'transactional', category: 'appointment-reminder',
    description: 'A neutral reminder for an appointment already arranged with the lead.',
    subject: 'A reminder about your appointment with {{companyName}}', eyebrow: 'Appointment reminder',
    heading: 'We look forward to speaking with you',
    paragraphs: [
      'Hello {{firstName}}, this is a friendly reminder about the appointment arranged with {{companyName}}.',
      'If the timing no longer works for you, reply to this email and we will help reschedule it.',
    ],
    bodyText: 'Hello {{firstName}},\n\nThis is a friendly reminder about the appointment arranged with {{companyName}}. If the timing no longer works for you, reply to this email and we will help reschedule it.\n\n{{senderName}}\n{{companyName}}',
    cta: 'Request a change',
  }),
]);

/**
 * Seed the shared Outreach email library for the single-tenant deployment.
 * Existing records are never overwritten, so administrator edits survive
 * restarts and repeated seed runs.
 */
export async function seedMessagingEmailTemplates(adminUserId) {
  if (!adminUserId) {
    logger.warn('No admin user found — skipping Outreach email template seed', { module: 'seed' });
    return { created: 0, existing: 0 };
  }

  let created = 0;
  let existing = 0;
  for (const item of OUTREACH_EMAIL_TEMPLATES) {
    const result = await MessageTemplate.updateOne(
      // This deployment is single-tenant and these records are shared. Keying
      // the library to its owner would duplicate all templates when the
      // configured administrator changes.
      { channel: 'email', name: item.name, isShared: true },
      { $setOnInsert: { ...item, createdBy: adminUserId, updatedBy: adminUserId } },
      { upsert: true, runValidators: true },
    );
    if (result.upsertedCount) created += 1;
    else existing += 1;
  }

  logger.info('Outreach email template seed complete', {
    module: 'seed', action: 'messaging-email-templates', created, existing,
  });
  return { created, existing };
}

export default seedMessagingEmailTemplates;
