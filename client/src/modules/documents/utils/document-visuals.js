import {
  FileText, FileImage, FileSpreadsheet, FileArchive, FileVideo, FileAudio, FileCode, File as FileIcon, FileType2,
  Building2, FolderKanban, Wrench, UserRound, Cog, Truck, Link2,
} from 'lucide-react';

const EXT = (name = '') => String(name).split('.').pop()?.toLowerCase() || '';

/**
 * File kind from MIME type, falling back to the extension. Each kind has its
 * own glyph and a restrained tone so a long list scans at a glance.
 */
export function fileKindOf(doc = {}) {
  const mime = String(doc.mimeType || '').toLowerCase();
  const ext = EXT(doc.fileName || doc.title);
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'svg', 'avif'].includes(ext)) return 'image';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv' || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet';
  if (mime.includes('word') || mime.includes('opendocument.text') || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'doc';
  if (mime.includes('zip') || mime.includes('compressed') || ['zip', 'rar', '7z', 'gz'].includes(ext)) return 'archive';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('xml') || mime.includes('json') || ['xml', 'json'].includes(ext)) return 'code';
  if (mime.startsWith('text/') || ['txt', 'md'].includes(ext)) return 'text';
  return 'file';
}

export const FILE_KIND_META = {
  pdf: { icon: FileText, tone: 'bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-300', label: 'PDF' },
  image: { icon: FileImage, tone: 'bg-cyan-500/10 text-cyan-600 ring-cyan-500/20 dark:text-cyan-300', label: 'IMG' },
  sheet: { icon: FileSpreadsheet, tone: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-300', label: 'XLS' },
  doc: { icon: FileType2, tone: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-300', label: 'DOC' },
  archive: { icon: FileArchive, tone: 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-300', label: 'ZIP' },
  video: { icon: FileVideo, tone: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-300', label: 'VID' },
  audio: { icon: FileAudio, tone: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-300', label: 'AUD' },
  code: { icon: FileCode, tone: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300', label: 'XML' },
  text: { icon: FileText, tone: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300', label: 'TXT' },
  file: { icon: FileIcon, tone: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300', label: 'FILE' },
};

export const LINK_META = {
  customer: { icon: Building2, href: (id) => `/crm/customers/${id}` },
  project: { icon: FolderKanban, href: (id) => `/projects/${id}` },
  job: { icon: Wrench, href: (id) => `/field-ops/orders/${id}` },
  employee: { icon: UserRound, href: null },
  installation: { icon: Cog, href: (id) => `/crm/installations/${id}` },
  vehicle: { icon: Truck, href: (id) => `/vehicles/${id}` },
};
export const DEFAULT_LINK_META = { icon: Link2, href: null };

/** Links from the server (named) or, for older payloads, derived from raw ids. */
export function documentLinks(doc = {}) {
  if (Array.isArray(doc.links)) return doc.links;
  const out = [];
  for (const [type, key] of [['customer', 'customerId'], ['project', 'projectId'], ['job', 'jobId'], ['employee', 'employeeId'], ['installation', 'installationId']]) {
    if (doc[key]) out.push({ type, id: String(doc[key]) });
  }
  if (!out.length && doc.sourceRecordType && doc.sourceRecordId) out.push({ type: doc.sourceRecordType, id: String(doc.sourceRecordId) });
  return out;
}

export function formatBytes(bytes, locale) {
  const size = Number(bytes || 0);
  if (!size) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** exp;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value >= 10 || exp === 0 ? 0 : 1 }).format(value)} ${units[exp]}`;
}

/** A document type code ("invoice_final", "SERVICE_REPORT") as words. */
export function humanizeCode(value) {
  if (!value) return '';
  const text = String(value).replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
