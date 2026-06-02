// PROJ-005 — compose the renderer-consumed body fields for PM documents.
//
// The shared PDF renderer (doctpl) only renders `data.introduction` for the body
// section of letter-style templates (header/body/footer, no line-item table).
// PM templates were seeded with rich data (project, PM contact, milestones, notes)
// that the renderer silently discarded. This pure helper folds all of that
// meaningful content into the single `introduction` string the BodyRenderer
// consumes, plus maps override keys onto the header fields the HeaderRenderer reads.
//
// Pure & side-effect-free so it can be unit-tested at the output-content level.

export const PM_TEMPLATE_TYPES = [
  'project_appointment_confirmation',
  'project_status_report',
  'project_completion_certificate',
];

const STATUS_LABELS_DE = {
  PLANNED: 'Geplant',
  IN_PROGRESS: 'In Arbeit',
  COMPLETED: 'Abgeschlossen',
  DELAYED: 'Verzögert',
  CANCELLED: 'Storniert',
  BLOCKED: 'Blockiert',
};

const SALUTATION_DEFAULT = 'Sehr geehrte Damen und Herren';

function statusLabel(status) {
  if (!status) return '';
  return STATUS_LABELS_DE[status] || status;
}

/** Render milestones as readable German lines (the letter body cannot draw a table). */
function formatMilestones(milestones) {
  if (!Array.isArray(milestones) || milestones.length === 0) return '';
  const lines = milestones.map((m) => {
    const parts = [`• ${m.name || '—'}`];
    if (m.date) parts.push(m.date);
    const status = statusLabel(m.status);
    if (status) parts.push(`(${status})`);
    return parts.join('  ');
  });
  return ['Meilensteine:', ...lines].join('\n');
}

/** PM contact block (recipient salutation + project manager + contact details). */
function contactBlock(data) {
  const lines = [];
  const recipient = data.recipientName || (data.customer && data.customer.name) || null;
  lines.push(recipient ? `${SALUTATION_DEFAULT} ${recipient}` : `${SALUTATION_DEFAULT},`);
  return lines.join('\n');
}

function projectBlock(data) {
  const lines = [];
  if (data.projectName) lines.push(`Projekt: ${data.projectName}`);
  if (data.projectNumber) lines.push(`Projektnummer: ${data.projectNumber}`);
  if (data.site && data.site.address) lines.push(`Objekt: ${data.site.address}`);
  return lines.join('\n');
}

function pmBlock(data) {
  const lines = [];
  if (data.projectManager) lines.push(`Projektleiter: ${data.projectManager}`);
  if (data.pmEmail) lines.push(`E-Mail: ${data.pmEmail}`);
  if (data.pmPhone) lines.push(`Telefon: ${data.pmPhone}`);
  if (lines.length === 0) return '';
  return ['Ihr Ansprechpartner:', ...lines].join('\n');
}

/**
 * Compose the renderer-consumed fields for a PM document.
 *
 * @param {string} templateType one of PM_TEMPLATE_TYPES
 * @param {object} templateData computed templateData merged with overrides
 * @returns {{ introduction: string }} body field(s) the renderer actually reads.
 *   Returns an empty object for non-PM template types (backward compatible).
 */
export function buildPmDocumentBody(templateType, templateData = {}) {
  if (!PM_TEMPLATE_TYPES.includes(templateType)) return {};

  const data = templateData || {};

  // Override mapping: `intro` and `description` both feed the intro paragraph,
  // with the explicit `intro` override winning. `notes` is appended at the end.
  const introOverride = data.intro || null;
  const description = data.description || null;

  const blocks = [];

  // 1. Salutation / recipient line.
  blocks.push(contactBlock(data));

  // 2. Lead paragraph: explicit intro override > description.
  const lead = introOverride || description;
  if (lead) blocks.push(lead);

  // 3. Project identification block.
  const project = projectBlock(data);
  if (project) blocks.push(project);

  // 4. Milestones (status report / completion certificate especially).
  const milestones = formatMilestones(data.milestones);
  if (milestones) blocks.push(milestones);

  // 5. PM contact block (so recipient knows who to reach).
  const pm = pmBlock(data);
  if (pm) blocks.push(pm);

  // 6. Notes / closing remarks.
  if (data.notes) blocks.push(data.notes);

  const introduction = blocks.filter(Boolean).join('\n\n');
  return { introduction };
}

export default buildPmDocumentBody;
