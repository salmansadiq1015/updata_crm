import { beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { simpleParser } from 'mailparser';
const transport = { verify: jest.fn(async () => true), sendMail: jest.fn(async () => ({ messageId: 'smtp-accepted' })), close: jest.fn() };
const options = [];
class ImapClient {
 constructor(config) { options.push(config); this.mailbox = { exists: 1, uidValidity: 99n }; }
 async connect() {} async logout() {} close() {}
 async list() { return [{ path: 'INBOX', specialUse: '\\Inbox' }, { path: 'Sent', specialUse: '\\Sent' }]; }
 async mailboxOpen(path, opts) { this.opened = { path, opts }; return { exists: 1, uidValidity: 99n }; }
 async search() { return [1]; }
 async fetchOne(uid, opts) { if (opts.size) return { size: 100 }; return { source: Buffer.from('From: sender@example.com\r\nTo: inbox@example.com\r\nSubject: IMAP mail\r\nMessage-ID: <imap-1@example.com>\r\n\r\nHello'), flags: new Set() }; }
 async *fetch() { yield { uid: 1, flags: new Set() }; }
 async append() {} async messageFlagsAdd() {} async messageFlagsRemove() {}
}
jest.unstable_mockModule('imapflow', () => ({ ImapFlow: ImapClient }));
jest.unstable_mockModule('nodemailer', () => ({ default: { createTransport: jest.fn(() => transport) } }));
jest.unstable_mockModule('node:dns/promises', () => ({ lookup: jest.fn(async host => [{ address: host === 'private.example.com' ? '127.0.0.1' : '203.0.113.20', family: 4 }]) }));
const { seal, mailHost } = await import('../../src/modules/email/email.security.js');
const provider = await import('../../src/modules/email/email.providers.js');
const originalFetch = global.fetch;
const ownerId = '507f1f77bcf86cd799439011';
function account(kind, cursor = {}) { return { _id: '507f1f77bcf86cd799439012', ownerId, address: 'inbox@example.com', provider: kind, cursor, credentials: seal(kind === 'imap' ? { user: 'inbox', password: 'secret', imapHost: 'imap.example.com', imapPort: 993, smtpHost: 'smtp.example.com', smtpPort: 465 } : { accessToken: 'token', expiresAt: Date.now() + 3600000 }, ownerId) }; }
const response = body => ({ ok: true, status: 200, json: async () => body });
beforeEach(() => { process.env.EMAIL_CREDENTIAL_SECRET = 'cd'.repeat(32); process.env.EMAIL_ALLOWED_MAIL_HOSTS = 'imap.example.com,smtp.example.com,private.example.com'; global.fetch = jest.fn(); jest.clearAllMocks(); options.length = 0; });
afterEach(() => { global.fetch = originalFetch; });
test('Gmail paginates the initial inbox and stores baseline history only when backfill completes', async () => {
 const raw = Buffer.from('From: buyer@example.com\r\nTo: inbox@example.com\r\nSubject: Quote\r\nMessage-ID: <g1@example.com>\r\n\r\nPlease send pricing').toString('base64url');
 global.fetch.mockResolvedValueOnce(response({ historyId: '100' })).mockResolvedValueOnce(response({ messages: [{ id: 'g1' }], nextPageToken: 'next' })).mockResolvedValueOnce(response({ raw, threadId: 't1', labelIds: ['INBOX', 'UNREAD', 'STARRED'] }));
 const persist = jest.fn(), cursor = await provider.syncProvider(account('google'), persist);
 expect(cursor).toEqual({ baseline: '100', page: 'next' }); expect(persist.mock.calls[0][0]).toMatchObject({ externalId: 'g1', threadKey: 't1', folder: 'inbox', unread: true, starred: true, text: 'Please send pricing' });
 global.fetch.mockResolvedValueOnce(response({ messages: [] })); expect(await provider.syncProvider(account('google', cursor), persist)).toEqual({ history: '100' });
 expect(global.fetch.mock.calls[3][0]).toContain('pageToken=next');
});
test('Gmail incremental changes deduplicate history IDs and expired history restarts backfill', async () => {
 const raw = Buffer.from('From: buyer@example.com\r\nSubject: Update\r\n\r\nUpdated').toString('base64url');
 global.fetch.mockResolvedValueOnce(response({ history: [{ messages: [{ id: 'g1' }, { id: 'g1' }] }], historyId: '201' })).mockResolvedValueOnce(response({ raw, threadId: 't1', labelIds: ['SENT'] }));
 const persist = jest.fn(); expect(await provider.syncProvider(account('google', { history: '200' }), persist)).toEqual({ history: '201' }); expect(persist).toHaveBeenCalledTimes(1);
 global.fetch.mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() }); expect(await provider.syncProvider(account('google', { history: 'old' }), persist)).toEqual({});
});
test('Microsoft consumes folder delta links with immutable IDs and normalizes messages', async () => {
 global.fetch.mockResolvedValueOnce(response({ value: [{ id: 'm1', conversationId: 'thread1', subject: 'Proposal', from: { emailAddress: { address: 'buyer@example.com' } }, body: { contentType: 'html', content: '<p>Hello</p>' }, isRead: false, receivedDateTime: '2026-11-05T12:00:00Z', categories: ['Sales'] }], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?token=1' }));
 const persist = jest.fn(), cursor = await provider.syncProvider(account('microsoft'), persist);
 expect(cursor.index).toBe(1); expect(cursor.inbox).toContain('token=1'); expect(persist.mock.calls[0][0]).toMatchObject({ externalId: 'm1', folder: 'inbox', unread: true, labels: ['Sales'] }); expect(global.fetch.mock.calls[0][1].headers.Prefer).toBe('IdType="ImmutableId"');
 await expect(provider.syncProvider(account('microsoft', { inbox: 'https://attacker.example.com/steal-token' }), persist)).rejects.toThrow(/pagination URL/);
});
test('OAuth transport preserves BCC and attachments while replies retain conversation headers', async () => {
 global.fetch.mockResolvedValueOnce(response({ id: 'accepted' }));
 const m = { to: ['buyer@example.com'], cc: [], bcc: ['hidden@example.com'], subject: 'Re: Quote', text: 'Here you go', messageId: '<reply@example.com>', inReplyTo: '<original@example.com>', references: ['<original@example.com>'], threadKey: 'gmail-thread' };
 await provider.sendProvider(account('google'), m, [{ name: 'quote.txt', mime: 'text/plain', content: Buffer.from('quote') }]);
 const body = JSON.parse(global.fetch.mock.calls[0][1].body), mime = Buffer.from(body.raw, 'base64url').toString(); expect(mime).toContain('Bcc: hidden@example.com'); expect(body.threadId).toBe('gmail-thread');
 const parsed = await simpleParser(Buffer.from(body.raw, 'base64url')); expect(parsed.inReplyTo).toBe('<original@example.com>'); expect(parsed.attachments[0].content.toString()).toBe('quote');
});
test('custom IMAP uses pinned TLS and readonly folder reads, and SMTP includes envelope BCC', async () => {
 const persist = jest.fn(); const cursor = await provider.syncProvider(account('imap'), persist); expect(cursor.INBOX).toEqual({ validity: '99', uid: 1 }); expect(persist.mock.calls[0][0]).toMatchObject({ externalId: 'INBOX:99:1', unread: true, subject: 'IMAP mail' });
 expect(options[0]).toMatchObject({ host: '203.0.113.20', secure: true, tls: { servername: 'imap.example.com', rejectUnauthorized: true } });
 await provider.sendProvider(account('imap'), { to: ['buyer@example.com'], cc: [], bcc: ['hidden@example.com'], text: 'Hello', subject: 'Hi', messageId: '<new@example.com>' }, []);
 expect(transport.sendMail.mock.calls[0][0].envelope.to).toContain('hidden@example.com'); expect(transport.close).toHaveBeenCalled();
});
test('custom mail endpoints reject private addresses and hosts absent from the deployment allowlist', async () => {
 await expect(mailHost('private.example.com')).rejects.toThrow(/public/); await expect(mailHost('internal.example.com')).rejects.toThrow(/listed/); await expect(mailHost('127.0.0.1')).rejects.toThrow(/listed/);
});
test('provider rate limit retry hints are bounded and authentication errors carry no token data', async () => {
 global.fetch.mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'retry-after': '86400' }) }); await expect(provider.request('https://gmail.googleapis.com')).rejects.toMatchObject({ statusCode: 429, retryAfter: 3600 });
 global.fetch.mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() }); await expect(provider.request('https://gmail.googleapis.com')).rejects.toMatchObject({ providerStatus: 401, message: 'Email provider returned HTTP 401' });
});
test('Gmail organization writes remote flags and folder labels before the local UI can confirm', async () => {
 global.fetch.mockResolvedValueOnce(response({ id: 'g1' }));
 await provider.mutateProvider(account('google'), { externalId: 'g1', labels: ['INBOX', 'UNREAD'] }, { unread: false, starred: true, folder: 'archive' });
 const sent = JSON.parse(global.fetch.mock.calls[0][1].body); expect(sent.addLabelIds).toContain('STARRED'); expect(sent.removeLabelIds).toContain('UNREAD'); expect(sent.removeLabelIds).toContain('INBOX'); expect(global.fetch.mock.calls[0][0]).toContain('/messages/g1/modify');
});
