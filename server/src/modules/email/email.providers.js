import { randomBytes, createHash } from 'node:crypto';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { EmailAccount, EmailOAuth } from './email.models.js';
import { seal, open, digest, mailHost } from './email.security.js';
import { AppError, ConflictError, ValidationError, ServiceUnavailableError } from '../../shared/errors/AppError.js';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GRAPH = 'https://graph.microsoft.com/v1.0/me';
export const FOLDERS = { inbox: 'inbox', sentitems: 'sent', drafts: 'drafts', archive: 'archive', junkemail: 'spam', deleteditems: 'trash' };
function oauthConfig(provider) {
  const google = provider === 'google', prefix = google ? 'EMAIL_GOOGLE' : 'EMAIL_MICROSOFT';
  const clientId = process.env[`${prefix}_CLIENT_ID`], clientSecret = process.env[`${prefix}_CLIENT_SECRET`], redirectUri = process.env[`${prefix}_REDIRECT_URI`];
  if (!clientId || !clientSecret || !redirectUri) throw new ServiceUnavailableError(`${prefix} OAuth is not configured`);
  return { clientId, clientSecret, redirectUri, auth: google ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: google ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: google ? 'https://www.googleapis.com/auth/gmail.modify' : 'offline_access User.Read Mail.ReadWrite Mail.Send' };
}
export async function request(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
  if (!res.ok) {
    const error = new AppError(`Email provider returned HTTP ${res.status}`, res.status === 429 ? 429 : 502, 'EMAIL_PROVIDER_ERROR');
    error.providerStatus = res.status; error.retryAfter = Math.min(3600, Math.max(60, Number(res.headers.get('retry-after')) || 60));
    throw error;
  }
  return res.status === 204 || res.status === 202 ? {} : res.json();
}
async function tokenRequest(provider, params) {
  const c = oauthConfig(provider);
  return request(c.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }) });
}
export async function startOAuth(ownerId, provider) {
  const c = oauthConfig(provider), state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  await EmailOAuth.create({ digest: digest(state), ownerId, provider, verifier: seal(verifier, String(ownerId)), expiresAt: new Date(Date.now() + 600000) });
  const url = new URL(c.auth);
  url.search = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.redirectUri, response_type: 'code', scope: c.scope, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', ...(provider === 'google' ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' } : { prompt: 'select_account' }) }).toString();
  return { url: url.toString() };
}
export async function finishOAuth(provider, state, code) {
  const pending = await EmailOAuth.findOneAndDelete({ digest: digest(state), provider, expiresAt: { $gt: new Date() } }).select('+verifier');
  if (!pending) throw new ValidationError('OAuth state is invalid or expired. Connect the account again.');
  const c = oauthConfig(provider), tokens = await tokenRequest(provider, { grant_type: 'authorization_code', code, redirect_uri: c.redirectUri, code_verifier: open(pending.verifier, String(pending.ownerId)) });
  const profile = await request(provider === 'google' ? `${GMAIL}/profile` : `${GRAPH}?$select=mail,userPrincipalName,displayName`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const address = (profile.emailAddress || profile.mail || profile.userPrincipalName || '').toLowerCase();
  if (!address) throw new ValidationError('The provider did not return a mailbox address');
  const old = await EmailAccount.findOne({ ownerId: pending.ownerId, address }).select('+credentials');
  const previous = old?.credentials && old.provider === provider ? open(old.credentials, String(pending.ownerId)) : {};
  const credentials = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || previous.refreshToken, expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000 };
  if (!credentials.refreshToken) throw new ValidationError('Offline access was not granted. Reconnect with consent.');
  const account = await EmailAccount.findOneAndUpdate({ ownerId: pending.ownerId, address }, { $set: { provider, name: profile.displayName || address, status: 'connected', credentials: seal(credentials, String(pending.ownerId)), cursor: {}, syncLease: null, syncLeaseToken: null, nextSyncAt: new Date(), lastError: null, failures: 0 } }, { upsert: true, returnDocument: 'after' });
  return account;
}
export async function credentials(account) {
  let value = open(account.credentials, String(account.ownerId));
  if (account.provider === 'imap' || value.expiresAt > Date.now() + 120000) return value;
  const locked = await EmailAccount.findOneAndUpdate({ _id: account._id, $or: [{ credentialLease: null }, { credentialLease: { $lt: new Date() } }] }, { $set: { credentialLease: new Date(Date.now() + 60000) } });
  if (!locked) throw new ConflictError('Email credentials are being refreshed; retry shortly');
  try {
    const fresh = await EmailAccount.findById(account._id).select('+credentials');
    value = open(fresh.credentials, String(account.ownerId));
    if (value.expiresAt <= Date.now() + 120000) {
      const tokens = await tokenRequest(account.provider, { grant_type: 'refresh_token', refresh_token: value.refreshToken });
      value = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || value.refreshToken, expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000 };
      await EmailAccount.updateOne({ _id: account._id, status: 'connected' }, { $set: { credentials: seal(value, String(account.ownerId)) } });
    }
    return value;
  } finally { await EmailAccount.updateOne({ _id: account._id }, { $set: { credentialLease: null } }); }
}
async function api(account, path, options = {}) {
  const c = await credentials(account), base = account.provider === 'google' ? GMAIL : GRAPH;
  if (path.startsWith('https://') && !path.startsWith(`${base}/`)) throw new ValidationError('Invalid provider pagination URL');
  return request(path.startsWith('https://') ? path : `${base}${path}`, { ...options, headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json', Prefer: 'IdType="ImmutableId"', ...options.headers } });
}
export function parsedMessage(parsed, extra = {}) {
  const address = v => v?.value?.flatMap(x => x.address ? [x.address] : (x.group || []).map(y => y.address)) || [];
  return { messageId: parsed.messageId, inReplyTo: parsed.inReplyTo, references: parsed.references || [], from: parsed.from?.text || '', to: address(parsed.to), cc: address(parsed.cc), subject: parsed.subject || '', text: (parsed.text || '').slice(0, 200000), html: String(parsed.html || '').slice(0, 400000), date: parsed.date || new Date(), files: (parsed.attachments || []).filter(x => x.content.length <= 8 * 1024 * 1024).slice(0, 10).map(x => ({ name: x.filename || 'attachment', mime: x.contentType, content: x.content, size: x.content.length })), ...extra };
}
export function gmailFolder(labels = []) { return labels.includes('TRASH') ? 'trash' : labels.includes('SPAM') ? 'spam' : labels.includes('DRAFT') ? 'drafts' : labels.includes('SENT') && !labels.includes('INBOX') ? 'sent' : labels.includes('INBOX') ? 'inbox' : 'archive'; }
async function googleSync(account, persist) {
  const cursor = { ...(account.cursor || {}) };
  if (!cursor.history && !cursor.baseline) cursor.baseline = (await api(account, '/profile')).historyId;
  let ids, result;
  if (cursor.history) {
    try { result = await api(account, `/history?startHistoryId=${encodeURIComponent(cursor.history)}&maxResults=50${cursor.page ? `&pageToken=${encodeURIComponent(cursor.page)}` : ''}`); }
    catch (e) { if (e.providerStatus === 404) return {}; throw e; }
    ids = [...new Set((result.history || []).flatMap(h => ['messages', 'messagesAdded', 'messagesDeleted', 'labelsAdded', 'labelsRemoved'].flatMap(k => (h[k] || []).map(m => m.message?.id || m.id))))];
  } else {
    result = await api(account, `/messages?maxResults=50&includeSpamTrash=true${cursor.page ? `&pageToken=${encodeURIComponent(cursor.page)}` : ''}`);
    ids = (result.messages || []).map(m => m.id);
  }
  for (const id of ids) {
    let m;
    try { m = await api(account, `/messages/${encodeURIComponent(id)}?format=raw`); }
    catch (e) { if (e.providerStatus === 404) { await persist({ externalId: id, removed: true }); continue; } throw e; }
    const parsed = await simpleParser(Buffer.from(m.raw, 'base64url'));
    await persist(parsedMessage(parsed, { externalId: id, threadKey: m.threadId, folder: gmailFolder(m.labelIds), labels: m.labelIds || [], unread: m.labelIds?.includes('UNREAD'), starred: m.labelIds?.includes('STARRED'), important: m.labelIds?.includes('IMPORTANT') }));
  }
  return result.nextPageToken ? { ...cursor, page: result.nextPageToken } : { history: cursor.history ? result.historyId : cursor.baseline };
}
async function microsoftSync(account, persist) {
  const cursor = { ...(account.cursor || {}) }, keys = Object.keys(FOLDERS), index = cursor.index || 0, folder = keys[index];
  const url = cursor[folder] || `/mailFolders/${folder}/messages/delta?$top=25`;
  const result = await api(account, url);
  for (const m of result.value || []) {
    if (m['@removed']) { await persist({ externalId: m.id, removed: true, folder: FOLDERS[folder] }); continue; }
    let files = [];
    if (m.hasAttachments) {
      const attachments = await api(account, `/messages/${encodeURIComponent(m.id)}/attachments?$top=10`);
      files = (attachments.value || []).filter(a => a.contentBytes && a.size <= 8 * 1024 * 1024).map(a => ({ name: a.name, mime: a.contentType, size: a.size, content: Buffer.from(a.contentBytes, 'base64') }));
    }
    await persist({ externalId: m.id, threadKey: m.conversationId || m.id, messageId: m.internetMessageId, from: m.from?.emailAddress?.address || '', to: (m.toRecipients || []).map(r => r.emailAddress.address), cc: (m.ccRecipients || []).map(r => r.emailAddress.address), subject: m.subject || '', text: m.body?.contentType === 'text' ? m.body.content : m.bodyPreview || '', html: m.body?.contentType === 'html' ? m.body.content : '', date: new Date(m.receivedDateTime || m.sentDateTime || Date.now()), folder: FOLDERS[folder], unread: !m.isRead, starred: m.flag?.flagStatus === 'flagged', important: m.importance === 'high', labels: m.categories || [], files });
  }
  cursor[folder] = result['@odata.nextLink'] || result['@odata.deltaLink'];
  cursor.index = result['@odata.nextLink'] ? index : (index + 1) % keys.length;
  return cursor;
}
async function imapClient(account) {
  const c = await credentials(account), host = await mailHost(c.imapHost);
  return new ImapFlow({ host: host.host, port: c.imapPort, secure: true, tls: { servername: host.servername, rejectUnauthorized: true }, auth: { user: c.user, pass: c.password }, logger: false, connectionTimeout: 15000, socketTimeout: 30000 });
}
async function withImap(account, run) {
  const client = await imapClient(account);
  try { await client.connect(); return await run(client); } finally { await client.logout().catch(() => client.close()); }
}
const imapFolder = box => ({ '\\Inbox': 'inbox', '\\Sent': 'sent', '\\Drafts': 'drafts', '\\Archive': 'archive', '\\Junk': 'spam', '\\Trash': 'trash' })[box.specialUse] || (box.path.toUpperCase() === 'INBOX' ? 'inbox' : null);
async function imapSync(account, persist) {
  return withImap(account, async client => {
    const boxes = (await client.list()).filter(b => imapFolder(b)), cursor = { ...(account.cursor || {}) };
    if (!boxes.length) return cursor;
    const index = (cursor.index || 0) % boxes.length, box = boxes[index], folder = imapFolder(box);
    const mailbox = await client.mailboxOpen(box.path, { readOnly: true });
    const validity = String(mailbox.uidValidity), saved = cursor[box.path], last = saved?.validity === validity ? saved.uid : 0;
    const uids = await client.search({ uid: `${last + 1}:*` }, { uid: true });
    const selected = (uids || []).filter(u => u > last).sort((a,b) => a-b).slice(0, 25);
    for (const uid of selected) {
      const meta = await client.fetchOne(String(uid), { size: true, flags: true, envelope: true }, { uid: true });
      if (!meta) continue;
      if (meta.size > 12 * 1024 * 1024) { cursor[box.path] = { validity, uid }; continue; }
      const m = await client.fetchOne(String(uid), { source: true, flags: true }, { uid: true });
      if (!m?.source) continue;
      const parsed = await simpleParser(m.source), root = parsed.references?.[0] || parsed.inReplyTo || parsed.messageId || `${box.path}:${validity}:${uid}`;
      await persist(parsedMessage(parsed, { externalId: `${box.path}:${validity}:${uid}`, threadKey: digest(root), folder, unread: !m.flags.has('\\Seen'), starred: m.flags.has('\\Flagged') }));
      cursor[box.path] = { validity, uid };
    }
    // Refresh recent flags without opening or marking messages as read.
    if (mailbox.exists) {
      for await (const m of client.fetch(`${Math.max(1, mailbox.exists - 99)}:*`, { uid: true, flags: true })) {
        await persist({ externalId: `${box.path}:${validity}:${m.uid}`, flagsOnly: true, unread: !m.flags.has('\\Seen'), starred: m.flags.has('\\Flagged') });
      }
    }
    cursor.index = selected.length === 25 ? index : (index + 1) % boxes.length;
    return cursor;
  });
}
export async function syncProvider(account, persist) { return account.provider === 'google' ? googleSync(account, persist) : account.provider === 'microsoft' ? microsoftSync(account, persist) : imapSync(account, persist); }
export async function verifyImap(account) {
  await withImap(account, async c => c.mailboxOpen('INBOX', { readOnly: true }));
  const t = await smtp(account); try { await t.verify(); } finally { t.close(); }
}
async function smtp(account) {
  const c = await credentials(account), host = await mailHost(c.smtpHost);
  return nodemailer.createTransport({ host: host.host, port: c.smtpPort, secure: c.smtpPort === 465, requireTLS: true, tls: { servername: host.servername, rejectUnauthorized: true }, auth: { user: c.user, pass: c.password }, connectionTimeout: 15000, socketTimeout: 30000 });
}
export async function mimeMessage(account, message, files) {
  return new MailComposer({ from: account.address, to: message.to, cc: message.cc, bcc: message.bcc, subject: message.subject, text: message.text, html: message.html || undefined, messageId: message.messageId, inReplyTo: message.inReplyTo, references: message.references, attachments: files.map(f => ({ filename: f.name, contentType: f.mime, content: f.content })), disableFileAccess: true, disableUrlAccess: true, keepBcc: false }).compile().build();
}
export async function sendProvider(account, message, files) {
  if (account.provider === 'microsoft') {
    // MIME transport retains reply headers and the stable RFC Message-ID. Graph
    // accepts BCC via MIME, so retain that header only for the provider submission.
    const raw = await new MailComposer({ from: account.address, to: message.to, cc: message.cc, bcc: message.bcc, subject: message.subject, text: message.text, html: message.html || undefined, messageId: message.messageId, inReplyTo: message.inReplyTo, references: message.references, attachments: files.map(f => ({ filename: f.name, contentType: f.mime, content: f.content })), disableFileAccess: true, disableUrlAccess: true }).compile();
    raw.keepBcc = true;
    return api(account, '/sendMail', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: (await raw.build()).toString('base64') });
  }
  if (account.provider === 'google') {
    const composer = new MailComposer({ from: account.address, to: message.to, cc: message.cc, bcc: message.bcc, subject: message.subject, text: message.text, html: message.html || undefined, messageId: message.messageId, inReplyTo: message.inReplyTo, references: message.references, attachments: files.map(f => ({ filename: f.name, contentType: f.mime, content: f.content })), disableFileAccess: true, disableUrlAccess: true }).compile();
    composer.keepBcc = true;
    return api(account, '/messages/send', { method: 'POST', body: JSON.stringify({ raw: (await composer.build()).toString('base64url'), ...(message.threadKey && !message.threadKey.startsWith('local:') ? { threadId: message.threadKey } : {}) }) });
  }
  const raw = await mimeMessage(account, message, files), transport = await smtp(account);
  let result;
  try { result = await transport.sendMail({ envelope: { from: account.address, to: [...message.to, ...message.cc, ...message.bcc] }, raw }); }
  finally { transport.close(); }
  // A Sent-folder append failure must never cause an already accepted SMTP send
  // to be retried. The durable local sent copy remains available.
  await withImap(account, async c => { const sent = (await c.list()).find(b => b.specialUse === '\\Sent'); if (sent) await c.append(sent.path, raw, ['\\Seen']); }).catch(() => {});
  return result;
}
export async function mutateProvider(account, message, patch) {
  const id = encodeURIComponent(message.externalId);
  if (account.provider === 'google') {
    const add = [], remove = [];
    for (const [key, label, invert] of [['unread', 'UNREAD', false], ['starred', 'STARRED', false], ['important', 'IMPORTANT', false]]) {
      if (patch[key] !== undefined) ((patch[key] !== invert) ? add : remove).push(label);
    }
    if (patch.folder) {
      remove.push('INBOX', 'SPAM', 'TRASH');
      const label = { inbox: 'INBOX', spam: 'SPAM', trash: 'TRASH' }[patch.folder];
      if (label) { remove.splice(remove.indexOf(label), 1); add.push(label); }
    }
    // Resolve label display names to provider label IDs, creating missing labels.
    if (patch.labels) {
      const available = await api(account, '/labels');
      for (const name of patch.labels) {
        let label = available.labels?.find(l => l.name === name || l.id === name);
        if (!label) label = await api(account, '/labels', { method: 'POST', body: JSON.stringify({ name }) });
        add.push(label.id);
      }
      remove.push(...(message.labels || []).filter(l => l.startsWith('Label_') && !add.includes(l)));
    }
    await api(account, `/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }) });
  } else if (account.provider === 'microsoft') {
    const body = { ...(patch.unread !== undefined ? { isRead: !patch.unread } : {}), ...(patch.starred !== undefined ? { flag: { flagStatus: patch.starred ? 'flagged' : 'notFlagged' } } : {}), ...(patch.important !== undefined ? { importance: patch.important ? 'high' : 'normal' } : {}), ...(patch.labels ? { categories: patch.labels } : {}) };
    if (Object.keys(body).length) await api(account, `/messages/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (patch.folder) await api(account, `/messages/${id}/move`, { method: 'POST', body: JSON.stringify({ destinationId: { inbox: 'inbox', archive: 'archive', spam: 'junkemail', trash: 'deleteditems' }[patch.folder] }) });
  } else {
    if (patch.labels || patch.important !== undefined) throw new ValidationError('Custom IMAP supports read, star and folders; labels and importance require Gmail or Microsoft');
    const parts = message.externalId.split(':'), uid = parts.pop(), validity = parts.pop(), path = parts.join(':');
    return withImap(account, async c => {
      const box = await c.mailboxOpen(path);
      if (String(box.uidValidity) !== validity) throw new ConflictError('Mailbox identity changed; synchronize before editing');
      for (const [key, flag, invert] of [['unread', '\\Seen', true], ['starred', '\\Flagged', false]]) {
        if (patch[key] !== undefined) await c[patch[key] !== invert ? 'messageFlagsAdd' : 'messageFlagsRemove'](uid, [flag], { uid: true });
      }
      if (patch.folder && patch.folder !== message.folder) {
        const target = (await c.list()).find(b => imapFolder(b) === patch.folder);
        if (!target) throw new ValidationError('This provider has no matching destination folder');
        const moved = await c.messageMove(uid, target.path, { uid: true });
        const targetBox = await c.mailboxOpen(target.path, { readOnly: true });
        const newUid = moved?.uidMap?.get(Number(uid));
        if (newUid) return { externalId: `${target.path}:${targetBox.uidValidity}:${newUid}` };
        throw new ConflictError('Message moved. Synchronize before making further changes.');
      }
    });
  }
}

/** Optional provider push accelerates the durable polling fallback. */
export async function renewWatch(account) {
  if (account.provider === 'google' && process.env.EMAIL_GOOGLE_PUBSUB_TOPIC) {
    const watch = await api(account, '/watch', { method: 'POST', body: JSON.stringify({ topicName: process.env.EMAIL_GOOGLE_PUBSUB_TOPIC }) });
    return { watchExpiresAt: new Date(Number(watch.expiration)) };
  }
  if (account.provider === 'microsoft' && process.env.EMAIL_WEBHOOK_BASE_URL) {
    const clientState = randomBytes(32).toString('base64url');
    // Maximum Outlook subscription lifetime varies by resource; 48h is safely
    // inside the non-rich-notification message limit and is renewed daily.
    const expirationDateTime = new Date(Date.now() + 48 * 3600000).toISOString();
    const c = await credentials(account);
    if (account.subscriptionId) {
      try {
        const result = await request(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(account.subscriptionId)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expirationDateTime }) });
        return { watchExpiresAt: new Date(result.expirationDateTime) };
      } catch (e) { if (e.providerStatus !== 404) throw e; }
    }
    const result = await request('https://graph.microsoft.com/v1.0/subscriptions', { method: 'POST', headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ changeType: 'created,updated,deleted', notificationUrl: `${process.env.EMAIL_WEBHOOK_BASE_URL.replace(/\/$/, '')}/api/v1/email/webhooks/microsoft`, resource: 'me/messages', expirationDateTime, clientState }) });
    return { subscriptionId: result.id, webhookSecret: digest(clientState), watchExpiresAt: new Date(result.expirationDateTime) };
  }
  return null;
}
