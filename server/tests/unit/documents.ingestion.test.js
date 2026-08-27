import { describe, expect, test } from '@jest/globals';
import ingestionService, { findRecordNumbers } from '../../src/modules/documents/ingestion/ingestion.service.js';
import { isWorthTaking as mailAttachmentWorthTaking, readConfig as readMailboxConfig } from '../../src/modules/documents/ingestion/mailbox.source.js';
import { isWorthTaking as scanFileWorthTaking, readConfig as readFolderConfig } from '../../src/modules/documents/ingestion/scanFolder.source.js';

/**
 * The paperwork that arrives without anybody uploading it.
 *
 * Ingestion runs when nobody is watching, which is what makes its mistakes
 * expensive: a permit filed against the wrong job makes Behörden AI report a
 * document present that is not there, and the site starts without it. Every
 * rule below exists to keep a wrong answer from being preferred to no answer.
 */
const file = (name, opts = {}) => ({
  isFile: () => opts.isFile !== false,
  name,
});
const stat = (size, ageSeconds = 300) => ({ size, mtimeMs: Date.now() - ageSeconds * 1000 });

describe('which attachments are worth taking in', () => {
  test('a PDF of a real size is taken', () => {
    expect(mailAttachmentWorthTaking({
      filename: 'Rechnung 4711.pdf', contentType: 'application/pdf', size: 90_000,
    })).toBe(true);
  });

  test('a signature image riding along in the body is not an attachment', () => {
    // Every mail from a firm with a letterhead carries one; filing them would
    // bury the real documents.
    expect(mailAttachmentWorthTaking({
      filename: 'logo.png', contentType: 'image/png', size: 40_000, related: true,
    })).toBe(false);
  });

  test('something too small to be a document is left alone', () => {
    expect(mailAttachmentWorthTaking({
      filename: 'unterschrift.png', contentType: 'image/png', size: 2_000,
    })).toBe(false);
  });

  test('a calendar invite or a zip is not paperwork', () => {
    for (const type of ['text/calendar', 'application/zip', 'text/html']) {
      expect(mailAttachmentWorthTaking({ filename: `x.${type}`, contentType: type, size: 90_000 })).toBe(false);
    }
  });

  test('a photo of the plant counts — the closing checklist asks for them', () => {
    expect(mailAttachmentWorthTaking({
      filename: 'IMG_4821.jpg', contentType: 'image/jpeg', size: 900_000,
    })).toBe(true);
  });
});

describe('which scanned files are worth taking in', () => {
  test('a scan that has stopped being written is taken', () => {
    expect(scanFileWorthTaking(file('scan0042.pdf'), stat(90_000, 120))).toBe(true);
  });

  test('a scan still being written is left for the next pass', () => {
    // A copier writes its file in pieces; reading it mid-write files a
    // truncated PDF nobody can open, and the mark says it was done.
    expect(scanFileWorthTaking(file('scan0042.pdf'), stat(90_000, 2))).toBe(false);
  });

  test('hidden files and directories are not documents', () => {
    expect(scanFileWorthTaking(file('.DS_Store'), stat(90_000))).toBe(false);
    expect(scanFileWorthTaking(file('Archiv', { isFile: false }), stat(90_000))).toBe(false);
  });

  test('an extension nobody scans to is skipped', () => {
    for (const name of ['notiz.txt', 'daten.csv', 'archiv.zip']) {
      expect(scanFileWorthTaking(file(name), stat(90_000))).toBe(false);
    }
  });
});

describe('the mailbox will not connect on half a configuration', () => {
  test('it names every missing piece at once, not one per attempt', () => {
    const read = readMailboxConfig({});
    expect(read.ok).toBe(false);
    expect(read.problems).toHaveLength(3);
    expect(read.problems.join(' ')).toMatch(/IMAP-Server/);
    expect(read.problems.join(' ')).toMatch(/Benutzer/);
  });

  test('the password is read from the environment, never from the form', () => {
    const read = readMailboxConfig({ host: 'imap.example.test', user: 'a@b.test', passwordEnv: 'NOT_SET_ANYWHERE' });
    expect(read.ok).toBe(false);
    // And the message says where to put it, because the person reading it is
    // the one with access to the server.
    expect(read.problems.join(' ')).toContain('NOT_SET_ANYWHERE');
  });

  test('with the password in the environment it is ready', () => {
    process.env.ZZTEST_INBOX_PASSWORD = 'geheim';
    const read = readMailboxConfig({ host: 'imap.example.test', user: 'a@b.test', passwordEnv: 'ZZTEST_INBOX_PASSWORD' });
    expect(read.ok).toBe(true);
    expect(read.options.auth.pass).toBe('geheim');
    expect(read.options.port).toBe(993);
    delete process.env.ZZTEST_INBOX_PASSWORD;
  });

  test('a folder without a path is not a source', () => {
    expect(readFolderConfig({}).ok).toBe(false);
    expect(readFolderConfig({ folder: '/srv/scans' }).ok).toBe(true);
  });
});

describe('what a name and a subject say about which job this is', () => {
  test('a project number is found even behind an underscore', () => {
    // "\\bPRJ" never matched inside this, and this is how an office names a file.
    expect(findRecordNumbers({ fileName: 'Bohrbewilligung_PRJ-2026-00042.pdf' }))
      .toEqual({ projectNumber: 'PRJ-2026-00042', orderNumber: null });
  });

  test('the subject line counts as much as the file name', () => {
    // Forwarded scans arrive as "Scan.pdf"; the number is in what was typed.
    expect(findRecordNumbers({
      fileName: 'Scan.pdf',
      origin: 'Bohrbewilligung zu AUF-2026-0052 — von gemeinde@bern.test',
    }).orderNumber).toBe('AUF-2026-0052');
  });

  test('lower case is the same number', () => {
    expect(findRecordNumbers({ fileName: 'prj-2026-00042 rechnung.pdf' }).projectNumber)
      .toBe('PRJ-2026-00042');
  });

  test('a customer name is not evidence', () => {
    // Two jobs for the same customer is the normal case, not the exception.
    expect(findRecordNumbers({
      fileName: 'Rechnung Weber.pdf',
      origin: 'Rechnung — von buchhaltung@weber.test',
    })).toEqual({ projectNumber: null, orderNumber: null });
  });

  test('nothing recognisable is nothing — not the newest project', () => {
    expect(findRecordNumbers({ fileName: 'scan0042.pdf', origin: 'Scan-Ordner /srv/scans' }))
      .toEqual({ projectNumber: null, orderNumber: null });
  });

  test('a document that says nothing is refused before the database is touched', async () => {
    const result = await ingestionService.resolveProject({ fileName: 'scan0042.pdf' });
    expect(result.project).toBeNull();
    expect(result.reason).toMatch(/Weder Projekt- noch Auftragsnummer/);
  });
});
