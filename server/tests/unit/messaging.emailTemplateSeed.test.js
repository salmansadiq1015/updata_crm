import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import {
  ALLOWED_VARIABLES, extractVariables, renderPersonalized,
} from '../../src/modules/messaging/personalization.js';

let MessageTemplate;
let OUTREACH_EMAIL_TEMPLATES;
let seedMessagingEmailTemplates;

beforeAll(async () => {
  await connectTestDb();
  MessageTemplate = (await import('../../src/modules/messaging/messageTemplate.model.js')).default;
  ({ OUTREACH_EMAIL_TEMPLATES, seedMessagingEmailTemplates } = await import('../../src/seed/messagingEmailTemplateSeed.js'));
});

beforeEach(() => clearTestDb());
afterAll(() => disconnectTestDb());

describe('Outreach email template seed', () => {
  it('defines ten valid, shared email templates with HTML and plain-text alternatives', () => {
    expect(OUTREACH_EMAIL_TEMPLATES).toHaveLength(10);
    expect(new Set(OUTREACH_EMAIL_TEMPLATES.map((item) => item.name)).size).toBe(10);

    for (const item of OUTREACH_EMAIL_TEMPLATES) {
      expect(item).toMatchObject({ channel: 'email', isShared: true, isArchived: false });
      expect(item.subject).toBeTruthy();
      expect(item.bodyHtml).toContain('<!doctype html>');
      expect(item.bodyText).toBeTruthy();
      expect(item.requiredVariables).toEqual(extractVariables(item.subject, item.bodyHtml, item.bodyText));
      expect(item.requiredVariables.every((name) => ALLOWED_VARIABLES.includes(name))).toBe(true);

      const options = { fallbacks: item.fallbackValues, required: item.requiredVariables };
      for (const rendered of [
        renderPersonalized(item.subject, {}, options),
        renderPersonalized(item.bodyText, {}, options),
        renderPersonalized(item.bodyHtml, {}, { ...options, html: true }),
      ]) {
        expect(rendered.value).not.toMatch(/\{\{/);
        expect(rendered.missing).toEqual([]);
        expect(rendered.unresolved).toEqual([]);
      }
    }
  });

  it('is idempotent and preserves administrator edits', async () => {
    const adminUserId = new mongoose.Types.ObjectId();
    await expect(seedMessagingEmailTemplates(adminUserId)).resolves.toEqual({ created: 10, existing: 0 });
    await MessageTemplate.updateOne(
      { channel: 'email', name: 'Business Introduction', createdBy: adminUserId },
      { $set: { subject: 'Administrator edited subject' } },
    );

    await expect(seedMessagingEmailTemplates(adminUserId)).resolves.toEqual({ created: 0, existing: 10 });
    expect(await MessageTemplate.countDocuments({ channel: 'email', createdBy: adminUserId })).toBe(10);
    const edited = await MessageTemplate.findOne({ name: 'Business Introduction', createdBy: adminUserId });
    expect(edited.subject).toBe('Administrator edited subject');
  });
});
