/**
 * The scan folder source.
 *
 * The office copier scans to a folder — a network share, a synced directory,
 * or a path on the server itself. Every new file in it is taken in.
 *
 * A scanned file has no sender and no subject, so the file name is the only
 * thing that says anything. That is why the copier's naming matters: a scan
 * called `PRJ-2026-00042 Bohrbewilligung.pdf` files itself, and one called
 * `scan0042.pdf` cannot be placed and waits for a person.
 *
 * Files are read, never moved or deleted. Whatever else uses that folder — a
 * backup, the person who scanned it — still finds what it expects. The mark
 * against filing twice is kept in the database, not by shuffling files around.
 */
import path from 'path';
import { promises as fs } from 'fs';
import ingestionService from './ingestion.service.js';
import logger from '../../../shared/logger/index.js';

const ACCEPTED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.heic', '.docx', '.xlsx']);
const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.heic': 'image/heic',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const MIN_BYTES = 4 * 1024;
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * A scanner writes its file in pieces. Taking one in mid-write files a
 * truncated PDF that nobody can open, so a file is left alone until it has
 * stopped changing.
 */
const SETTLE_SECONDS = 30;

export function isWorthTaking(entry, stat, now = Date.now()) {
  if (!entry.isFile()) return false;
  if (entry.name.startsWith('.')) return false;
  if (!ACCEPTED_EXT.has(path.extname(entry.name).toLowerCase())) return false;
  if (stat.size < MIN_BYTES || stat.size > MAX_BYTES) return false;
  return now - stat.mtimeMs >= SETTLE_SECONDS * 1000;
}

export function readConfig(config = {}) {
  const folder = config.folder?.trim();
  return {
    ok: Boolean(folder),
    problems: folder ? [] : ['Kein Scan-Ordner hinterlegt.'],
    folder,
    maxPerRun: Math.min(Number(config.maxPerRun) || 30, 200),
  };
}

/** Says whether the folder is there and readable, and what is in it. */
export async function testConnection(config = {}) {
  const read = readConfig(config);
  if (!read.ok) return { ok: false, message: read.problems.join(' ') };

  try {
    const stat = await fs.stat(read.folder);
    if (!stat.isDirectory()) return { ok: false, message: `${read.folder} ist kein Ordner.` };
    await fs.access(read.folder, (await import('fs')).constants.R_OK);
    const entries = await fs.readdir(read.folder, { withFileTypes: true });
    const usable = entries.filter((e) => e.isFile() && ACCEPTED_EXT.has(path.extname(e.name).toLowerCase()));
    return { ok: true, message: `Ordner lesbar. ${entries.length} Eintrag/Einträge, davon ${usable.length} verwertbar.` };
  } catch (err) {
    return {
      ok: false,
      message: err.code === 'ENOENT'
        ? `Der Ordner ${read.folder} existiert für den Server nicht — bei einem Netzlaufwerk prüfen, ob es eingebunden ist.`
        : `Ordner nicht lesbar: ${err.message}`,
    };
  }
}

/** One sweep of the folder. */
export async function collect(config = {}, { userId = null } = {}) {
  const read = readConfig(config);
  if (!read.ok) return { ok: false, message: read.problems.join(' '), taken: 0 };

  const results = [];
  try {
    const entries = await fs.readdir(read.folder, { withFileTypes: true });
    const now = Date.now();
    let looked = 0;

    for (const entry of entries) {
      if (results.length >= read.maxPerRun) break;
      const full = path.join(read.folder, entry.name);
      let stat;
      try { stat = await fs.stat(full); } catch { continue; }
      if (!isWorthTaking(entry, stat, now)) continue;
      looked += 1;

      // Path and size together: a rescan under the same name is a new file.
      const sourceRef = `${full}::${stat.size}`;
      if (await ingestionService.alreadySeen('scan_folder', sourceRef)) continue;

      const buffer = await fs.readFile(full);
      results.push(await ingestionService.ingest({
        source: 'scan_folder',
        sourceRef,
        fileName: entry.name,
        mimeType: MIME_BY_EXT[path.extname(entry.name).toLowerCase()] || 'application/octet-stream',
        buffer,
        origin: `Scan-Ordner ${read.folder}`,
        userId,
      }));
    }

    return {
      ok: true,
      message: `${looked} Datei(en) geprüft, ${results.length} neu verarbeitet.`,
      taken: results.length,
      results,
    };
  } catch (err) {
    logger.warn('Scan folder ingestion run failed', {
      module: 'document-ingestion', action: 'scanFolder', folder: read.folder, error: err.message,
    });
    return { ok: false, message: `Scan-Ordner nicht lesbar: ${err.message}`, taken: results.length, results };
  }
}

export default { collect, testConnection, readConfig, isWorthTaking };
