import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';

const emailSend = jest.fn(async () => ({ _id: 'email-record-1' }));
jest.unstable_mockModule('../../src/modules/doctpl/email.service.js', () => ({ default: { send: emailSend } }));

let ExistingEmailProvider;
let createUnsubscribeToken;
let verifyUnsubscribeToken;
let originalSmtp;

beforeAll(async () => {
  originalSmtp = process.env.SMTP_MAIL;
  process.env.SMTP_MAIL = 'sender@example.com';
  ({ ExistingEmailProvider } = await import('../../src/modules/messaging/providers/existingEmail.provider.js'));
  ({ createUnsubscribeToken, verifyUnsubscribeToken } = await import('../../src/modules/messaging/unsubscribeToken.js'));
});

afterAll(() => {
  if (originalSmtp === undefined) delete process.env.SMTP_MAIL;
  else process.env.SMTP_MAIL = originalSmtp;
});

afterEach(() => {
  emailSend.mockClear();
  delete process.env.MESSAGING_PUBLIC_API_URL;
});

describe('email outreach compliance', () => {
  it('signs expiring unsubscribe tokens and rejects tampering', () => {
    const token = createUnsubscribeToken({ leadId: '507f1f77bcf86cd799439011', destinationHash: 'hash-1' });
    expect(verifyUnsubscribeToken(token)).toMatchObject({ leadId: '507f1f77bcf86cd799439011', destinationHash: 'hash-1' });
    expect(verifyUnsubscribeToken(`${token}tampered`)).toBeNull();
  });

  it('fails promotional email safely when no public unsubscribe URL is configured', async () => {
    const provider = new ExistingEmailProvider();
    const result = await provider.send({
      to: 'lead@example.com', subject: 'Offer', bodyHtml: '<p>Hello</p>', bodyText: 'Hello',
      leadId: '507f1f77bcf86cd799439011', createdBy: '507f1f77bcf86cd799439012', purpose: 'promotional',
    });
    expect(result).toMatchObject({ outcome: 'rejected', errorCode: 'UNSUBSCRIBE_NOT_CONFIGURED' });
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('adds signed HTML and plain-text unsubscribe links to promotional email', async () => {
    process.env.MESSAGING_PUBLIC_API_URL = 'https://api.example.com';
    const provider = new ExistingEmailProvider();
    const result = await provider.send({
      to: 'lead@example.com', subject: 'Offer', bodyHtml: '<p>Hello</p>', bodyText: 'Hello',
      leadId: '507f1f77bcf86cd799439011', createdBy: '507f1f77bcf86cd799439012', purpose: 'promotional',
    });
    expect(result).toMatchObject({ outcome: 'accepted', providerMessageId: 'email-record-1' });
    expect(emailSend).toHaveBeenCalledWith(expect.objectContaining({
      bodyHtml: expect.stringContaining('/api/v1/webhooks/messaging/unsubscribe?token='),
      bodyText: expect.stringContaining('Unsubscribe: https://api.example.com/'),
    }));
  });
});
