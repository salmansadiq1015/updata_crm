/**
 * The mailbox source.
 *
 * A dedicated address the office forwards paperwork to — a supplier invoice,
 * a permit, a delivery note. Every unread message is opened, its attachments
 * are taken in, and the message is marked read so the next pass skips it.
 *
 * Only a dedicated address. This must never be pointed at somebody's personal
 * mailbox: it reads every unread message and marks them all as read.
 *
 * The password never lives in the database. The configuration names an
 * environment variable, and the value is read from there at connection time —
 * the same shape the integration model already had in `credentialsRef`.
 */
import ingestionService from './ingestion.service.js';
import logger from '../../../shared/logger/index.js';

/** Nothing else is worth taking in; the rest is signatures and logos. */
const ACCEPTED = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/heic', 'image/tiff',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-excel',
]);

/** Below this it is a signature image, not a document. */
const MIN_BYTES = 8 * 1024;
const MAX_BYTES = 25 * 1024 * 1024;

export function isWorthTaking(attachment) {
  if (!attachment?.filename) return false;
  if (attachment.related) return false; // inline image in the body
  const size = attachment.size ?? attachment.content?.length ?? 0;
  if (size < MIN_BYTES || size > MAX_BYTES) return false;
  return ACCEPTED.has(String(attachment.contentType || '').toLowerCase());
}

/** Everything the connection needs, or the reason it cannot be made. */
export function readConfig(config = {}) {
  const problems = [];
  const host = config.host?.trim();
  const user = config.user?.trim();
  const passwordEnv = config.passwordEnv?.trim() || 'DOCUMENT_INBOX_PASSWORD';
  const password = process.env[passwordEnv];

  if (!host) problems.push('Kein IMAP-Server hinterlegt.');
  if (!user) problems.push('Kein Postfach-Benutzer hinterlegt.');
  if (!password) problems.push(`Kein Passwort: die Umgebungsvariable ${passwordEnv} ist auf dem Server nicht gesetzt.`);

  return {
    ok: problems.length === 0,
    problems,
    passwordEnv,
    options: {
      host,
      port: Number(config.port) || 993,
      secure: config.secure !== false,
      auth: { user, pass: password },
      logger: false,
    },
    folder: config.folder?.trim() || 'INBOX',
    maxPerRun: Math.min(Number(config.maxPerRun) || 20, 100),
  };
}

/** Opens the mailbox and closes it again, saying only whether it worked. */
export async function testConnection(config = {}) {
  const read = readConfig(config);
  if (!read.ok) return { ok: false, message: read.problems.join(' ') };

  let client;
  try {
    const { ImapFlow } = await import('imapflow');
    client = new ImapFlow(read.options);
    await client.connect();
    const box = await client.mailboxOpen(read.folder, { readOnly: true });
    const unseen = box.exists ? await client.search({ seen: false }) : [];
    await client.logout();
    return {
      ok: true,
      message: `Verbunden. Ordner „${read.folder}": ${box.exists} Nachricht(en), davon ${unseen.length || 0} ungelesen.`,
    };
  } catch (err) {
    try { await client?.close(); } catch { /* already gone */ }
    return { ok: false, message: `Verbindung fehlgeschlagen: ${err.message}` };
  }
}

/**
 * One pass over the mailbox.
 *
 * A message is marked read only once every one of its attachments has been
 * through ingestion — which records each one, success or failure. Marking
 * first would lose a paper on any crash in between.
 */
export async function collect(config = {}, { userId = null } = {}) {
  const read = readConfig(config);
  if (!read.ok) return { ok: false, message: read.problems.join(' '), taken: 0 };

  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');
  const client = new ImapFlow(read.options);
  const results = [];
  let messages = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(read.folder);
    try {
      const unseen = await client.search({ seen: false });
      for (const uid of (unseen || []).slice(0, read.maxPerRun)) {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message?.source) continue;
        messages += 1;

        const parsed = await simpleParser(message.source);
        const from = parsed.from?.text || 'unbekannt';
        const origin = `${parsed.subject || '(kein Betreff)'} — von ${from}`;

        for (const attachment of parsed.attachments || []) {
          if (!isWorthTaking(attachment)) continue;
          results.push(await ingestionService.ingest({
            source: 'mailbox',
            // Stable across runs, and unique per attachment within a message.
            sourceRef: `${parsed.messageId || uid}::${attachment.filename}`,
            fileName: attachment.filename,
            mimeType: attachment.contentType,
            buffer: attachment.content,
            origin,
            userId,
          }));
        }

        // Only now: everything this message carried has been accounted for.
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    try { await client.close(); } catch { /* already gone */ }
    logger.warn('Mailbox ingestion run failed', {
      module: 'document-ingestion', action: 'mailbox', error: err.message,
    });
    return { ok: false, message: `Postfach nicht erreichbar: ${err.message}`, taken: results.length, results };
  }

  return {
    ok: true,
    message: `${messages} Nachricht(en) gelesen, ${results.length} Anhang/Anhänge verarbeitet.`,
    taken: results.length,
    results,
  };
}

export default { collect, testConnection, readConfig, isWorthTaking };
