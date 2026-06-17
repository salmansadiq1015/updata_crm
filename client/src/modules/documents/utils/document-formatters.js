export const DOCUMENT_SOURCE_OPTIONS = [
  { value: 'all', labelKey: 'documents.repository.source.all' },
  { value: 'repository', labelKey: 'documents.repository.source.repository' },
  { value: 'generated', labelKey: 'documents.repository.source.generated' },
  { value: 'project', labelKey: 'documents.repository.source.project' },
  { value: 'customer', labelKey: 'documents.repository.source.customer' },
  { value: 'accounting', labelKey: 'documents.repository.source.accounting' },
  { value: 'mobile', labelKey: 'documents.repository.source.mobile' },
];

export const DOCUMENT_ORIGIN_OPTIONS = [
  { value: 'all', labelKey: 'documents.repository.origin.all' },
  { value: 'uploaded', labelKey: 'documents.repository.origin.uploaded' },
  { value: 'generated', labelKey: 'documents.repository.origin.generated' },
  { value: 'received', labelKey: 'documents.repository.origin.received' },
  { value: 'draft', labelKey: 'documents.repository.origin.draft' },
];

export const LINK_TYPE_OPTIONS = [
  { value: 'none', labelKey: 'documents.repository.link.none' },
  { value: 'customer', labelKey: 'documents.repository.link.customer' },
  { value: 'project', labelKey: 'documents.repository.link.project' },
  { value: 'job', labelKey: 'documents.repository.link.job' },
  { value: 'employee', labelKey: 'documents.repository.link.employee' },
];

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'OTHER', labelKey: 'documents.repository.type.other' },
  { value: 'CONTRACT', labelKey: 'documents.repository.type.contract' },
  { value: 'OFFER', labelKey: 'documents.repository.type.offer' },
  { value: 'ORDER', labelKey: 'documents.repository.type.order' },
  { value: 'INVOICE', labelKey: 'documents.repository.type.invoice' },
  { value: 'DELIVERY_NOTE', labelKey: 'documents.repository.type.deliveryNote' },
  { value: 'SERVICE_REPORT', labelKey: 'documents.repository.type.serviceReport' },
  { value: 'PHOTO', labelKey: 'documents.repository.type.photo' },
  { value: 'CERTIFICATE', labelKey: 'documents.repository.type.certificate' },
];

export const DOCUMENT_CATEGORY_OPTIONS = [
  { value: 'OTHER', labelKey: 'documents.repository.category.other' },
  { value: 'COMMERCIAL', labelKey: 'documents.repository.category.commercial' },
  { value: 'TECHNICAL', labelKey: 'documents.repository.category.technical' },
  { value: 'LEGAL', labelKey: 'documents.repository.category.legal' },
  { value: 'ACCOUNTING', labelKey: 'documents.repository.category.accounting' },
  { value: 'PROJECT', labelKey: 'documents.repository.category.project' },
  { value: 'CUSTOMER', labelKey: 'documents.repository.category.customer' },
  { value: 'JOB', labelKey: 'documents.repository.category.job' },
];

export const SOURCE_BADGE_CLASS = {
  repository: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  generated: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  project: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  customer: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  accounting: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  mobile: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
};

export function formatDocumentDate(value, locale = 'de-CH') {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function describeDocumentLinks(doc = {}) {
  const links = [
    ['customer', doc.customerId],
    ['project', doc.projectId],
    ['job', doc.jobId],
    ['employee', doc.employeeId],
  ].filter(([, value]) => Boolean(value));

  if (!links.length && doc.sourceRecordType && doc.sourceRecordId) {
    links.push([doc.sourceRecordType, doc.sourceRecordId]);
  }

  return links.map(([type, value]) => ({
    type,
    labelKey: `documents.repository.link.${type}`,
    value: String(value),
  }));
}
