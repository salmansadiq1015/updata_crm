import logger from '../shared/logger/index.js';

const DEFAULT_SECTIONS = (includeQrBill = false, includeDeductions = false) => [
  { id: 'header',     name: 'Header',     type: 'header',  position: 0,  isVisible: true,  isConditional: false, config: {} },
  { id: 'body',       name: 'Introduction', type: 'body',   position: 1,  isVisible: true,  isConditional: true,  conditionField: 'introduction', config: {} },
  { id: 'table',      name: 'Line Items', type: 'table',   position: 2,  isVisible: true,  isConditional: false, config: {} },
  ...(includeDeductions ? [{ id: 'deductions', name: 'Advance Deductions', type: 'deductions', position: 3, isVisible: true, isConditional: true, conditionField: 'advanceDeductions', config: {} }] : []),
  { id: 'totals',     name: 'Totals',     type: 'totals',  position: 4,  isVisible: true,  isConditional: false, config: {} },
  ...(includeQrBill   ? [{ id: 'qr_bill', name: 'QR Bill', type: 'qr_bill', position: 5, isVisible: true, isConditional: true, conditionField: 'qrBill', config: {} }] : []),
  { id: 'footer',     name: 'Footer',     type: 'footer',  position: 99, isVisible: true,  isConditional: false, config: {} },
];

const DEFAULT_COLUMNS = () => [
  { field: 'position',    label: { de: 'Pos.',          fr: 'Pos.',          it: 'Pos.',           en: 'Pos.'         }, widthPercent: 5,  alignment: 'left',  format: 'text'     },
  { field: 'description', label: { de: 'Beschreibung',  fr: 'Description',   it: 'Descrizione',    en: 'Description'  }, widthPercent: 40, alignment: 'left',  format: 'text'     },
  { field: 'quantity',    label: { de: 'Menge',         fr: 'Quantité',      it: 'Quantità',       en: 'Qty'          }, widthPercent: 10, alignment: 'right', format: 'number'   },
  { field: 'unitPrice',   label: { de: 'Einzelpreis',   fr: 'Prix unitaire', it: 'Prezzo unitario',en: 'Unit Price'   }, widthPercent: 15, alignment: 'right', format: 'currency' },
  { field: 'discount',    label: { de: 'Rabatt',        fr: 'Remise',        it: 'Sconto',         en: 'Discount'     }, widthPercent: 10, alignment: 'right', format: 'percent'  },
  { field: 'total',       label: { de: 'Total',         fr: 'Total',         it: 'Totale',         en: 'Total'        }, widthPercent: 20, alignment: 'right', format: 'currency' },
];

const LETTER_SECTIONS = () => [
  { id: 'header', name: 'Header', type: 'header', position: 0, isVisible: true, isConditional: false, config: {} },
  { id: 'body',   name: 'Body',   type: 'body',   position: 1, isVisible: true, isConditional: false, config: {} },
  { id: 'footer', name: 'Footer', type: 'footer', position: 99, isVisible: true, isConditional: false, config: {} },
];

const TEMPLATES = [
  { templateType: 'quotation',             name: 'Standard Offerte',         sections: DEFAULT_SECTIONS(),           tableColumns: DEFAULT_COLUMNS() },
  { templateType: 'order_confirmation',    name: 'Auftragsbestätigung',       sections: DEFAULT_SECTIONS(),           tableColumns: DEFAULT_COLUMNS() },
  { templateType: 'invoice_standard',      name: 'Standard Rechnung',         sections: DEFAULT_SECTIONS(true),       tableColumns: DEFAULT_COLUMNS() },
  { templateType: 'invoice_advance',       name: 'Akontorechnung',            sections: DEFAULT_SECTIONS(true),       tableColumns: DEFAULT_COLUMNS() },
  { templateType: 'invoice_final',         name: 'Schlussrechnung',           sections: DEFAULT_SECTIONS(true, true), tableColumns: DEFAULT_COLUMNS() },
  { templateType: 'cover_letter',          name: 'Begleitschreiben',          sections: LETTER_SECTIONS(),            tableColumns: [] },
  { templateType: 'service_report',        name: 'Servicebericht',            sections: DEFAULT_SECTIONS(),           tableColumns: DEFAULT_COLUMNS() },
  { templateType: 'inspection_certificate',name: 'Inspektionszertifikat',     sections: DEFAULT_SECTIONS(),           tableColumns: DEFAULT_COLUMNS() },
  // PM project documents — text-style documents (header/body/footer, no line-item table).
  { templateType: 'project_appointment_confirmation', name: 'Terminbestätigung',     sections: LETTER_SECTIONS(), tableColumns: [] },
  { templateType: 'project_status_report',            name: 'Projekt-Statusbericht', sections: LETTER_SECTIONS(), tableColumns: [] },
  { templateType: 'project_completion_certificate',   name: 'Abschlusszertifikat',   sections: LETTER_SECTIONS(), tableColumns: [] },
  { templateType: 'project_schedule',                 name: 'Bauplan / Terminplan',  sections: LETTER_SECTIONS(), tableColumns: [] },
];

export async function seedDoctplTemplates(adminUserId) {
  const { default: DocumentTemplate } = await import('../modules/doctpl/documentTemplate.model.js');
  let created = 0;
  for (const tmpl of TEMPLATES) {
    const exists = await DocumentTemplate.findOne({ templateType: tmpl.templateType }).setOptions({ includeDeleted: true });
    if (!exists) {
      await DocumentTemplate.create({
        ...tmpl,
        createdBy: adminUserId,
        isActive: true,
        approvalStatus: 'approved',
        approvedBy: adminUserId,
        approvedAt: new Date(),
      });
      created++;
      logger.info(`Seeded template: ${tmpl.templateType}`, { module: 'seed', action: 'doctpl' });
    }
  }

  // Backfill legacy templates that predate the approval workflow so existing
  // document generation keeps working after upgrade.
  const backfill = await DocumentTemplate.updateMany(
    { approvalStatus: { $exists: false } },
    { $set: { approvalStatus: 'approved', approvedBy: adminUserId, approvedAt: new Date() } },
  );
  if (backfill?.modifiedCount) {
    logger.info(`DocTpl approval backfill: ${backfill.modifiedCount} legacy templates approved`, { module: 'seed', action: 'doctpl' });
  }

  logger.info(`DocTpl seed complete: ${created} new templates created`, { module: 'seed', action: 'doctpl' });
  return created;
}
