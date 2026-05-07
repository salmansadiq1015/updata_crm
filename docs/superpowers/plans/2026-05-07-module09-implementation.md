# Module 09: Document Templates Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute.

**Goal:** Complete Module 09 — server PDF engine + full client UI.
**Architecture:** Section-pipeline PDF renderer (PDFKit + swissqrbill), Next.js client module.
**Tech Stack:** Node.js/Express, PDFKit, swissqrbill, MongoDB/Mongoose, Next.js, React Query, shadcn/ui

---

## PHASE 1 — SERVER FOUNDATION

### Task 1: Install dependencies + template CREATE endpoint
**Files:**
- Modify: `server/package.json`
- Modify: `server/src/modules/doctpl/template.service.js`
- Modify: `server/src/modules/doctpl/template.controller.js`
- Modify: `server/src/modules/doctpl/template.routes.js`
- Modify: `server/src/modules/doctpl/template.validation.js`

- [ ] In `server/`, run: `npm install pdfkit swissqrbill`
- [ ] Add `createTemplateSchema` to `template.validation.js`:
```js
export const createTemplateSchema = {
  body: Joi.object({
    templateType: Joi.string().valid(...TEMPLATE_TYPES).required(),
    name: Joi.string().trim().max(255).required(),
    description: Joi.string().max(1000).allow('', null),
    layout: Joi.object({
      pageSize: Joi.string().valid('A4', 'Letter').default('A4'),
      orientation: Joi.string().valid('portrait', 'landscape').default('portrait'),
      margins: Joi.object({ top: Joi.number().default(25), bottom: Joi.number().default(20), left: Joi.number().default(20), right: Joi.number().default(15) }),
      headerHeight: Joi.number().default(45),
      footerHeight: Joi.number().default(30),
    }),
    sections: Joi.array().items(Joi.object({ id: Joi.string().required(), name: Joi.string().required(), type: Joi.string().valid('header','body','table','totals','deductions','qr_bill','footer','custom').required(), position: Joi.number().required(), isVisible: Joi.boolean().default(true), isConditional: Joi.boolean().default(false), conditionField: Joi.string().allow(null,''), config: Joi.object().default({}) })),
    textBlocks: Joi.object(),
    tableColumns: Joi.array(),
  }),
};
```
- [ ] Add `create(data, userId, meta)` to `template.service.js`:
```js
async create(data, userId, meta = {}) {
  const created = await documentTemplateRepository.create({ ...data, createdBy: userId });
  await this._invalidateListCache();
  eventBus.publish(EVENT_TYPES.DOCTPL_TEMPLATE_CREATED, { templateId: created._id, templateType: created.templateType, createdBy: userId }, { source: 'doctpl:templates' });
  auditService.logEvent({ eventType: 'doctpl.template.created', userId, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', details: { templateId: created._id, templateType: created.templateType }, module: 'doctpl' });
  return created;
}
```
- [ ] Add `create` to `template.controller.js`:
```js
async create(req, res, next) {
  try {
    const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
    const template = await templateService.create(req.body, req.user._id, meta);
    return res.success({ data: template, statusCode: 201 });
  } catch (err) { next(err); }
}
```
- [ ] Add to `template.routes.js` (before other routes):
```js
import { createTemplateSchema } from './template.validation.js';
router.post('/', authenticate, requirePermission('templates:write'), validate(createTemplateSchema), (req, res, next) => templateController.create(req, res, next));
```
- [ ] Add `DOCTPL_TEMPLATE_CREATED` to `server/src/shared/events/eventTypes.js` if not present
- [ ] Write test `server/tests/unit/doctpl.template.test.js`:
```js
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let DocumentTemplate;
beforeAll(async () => {
  await connectTestDb();
  const m = await import('../../src/modules/doctpl/documentTemplate.model.js');
  DocumentTemplate = m.default;
});
afterEach(() => clearTestDb());
afterAll(() => disconnectTestDb());

const userId = new mongoose.Types.ObjectId();

test('creates template with required fields', async () => {
  const t = await DocumentTemplate.create({ templateType: 'quotation', name: 'Test', createdBy: userId });
  expect(t._id).toBeDefined();
  expect(t.currentVersion).toBe(1);
  expect(t.isActive).toBe(true);
});

test('soft-delete pre-hook hides deleted templates', async () => {
  const t = await DocumentTemplate.create({ templateType: 'invoice_standard', name: 'Del', createdBy: userId, isDeleted: true, deletedAt: new Date() });
  const found = await DocumentTemplate.findById(t._id);
  expect(found).toBeNull();
});
```
- [ ] Run: `cd server && npm test -- --testPathPattern=doctpl.template`
- [ ] Commit: `git add -A && git commit -m "feat(doctpl): install pdfkit+swissqrbill, add template CREATE endpoint"`

---

### Task 2: i18n labels + PageManager
**Files:**
- Create: `server/src/modules/doctpl/renderer/i18n.js`
- Create: `server/src/modules/doctpl/renderer/PageManager.js`
- Create: `server/tests/unit/doctpl.renderer.test.js`

- [ ] Create `server/src/modules/doctpl/renderer/i18n.js`:
```js
export const LABELS = {
  de: { subtotal:'Zwischensumme', vat:'MwSt.', grandTotal:'Gesamtbetrag', advanceDeduction:'Abzüglich Akonto', netBalance:'Nettobetrag', page:'Seite', of:'von', position:'Pos.', description:'Beschreibung', quantity:'Menge', unitPrice:'Einzelpreis', discount:'Rabatt', total:'Total', optional:'(optional)', validUntil:'Gültig bis', dueDate:'Fällig am', currency:'CHF' },
  fr: { subtotal:'Sous-total', vat:'TVA', grandTotal:'Total général', advanceDeduction:'Déduction acompte', netBalance:'Montant net', page:'Page', of:'sur', position:'Pos.', description:'Description', quantity:'Quantité', unitPrice:'Prix unitaire', discount:'Remise', total:'Total', optional:'(optionnel)', validUntil:"Valable jusqu'au", dueDate:'Échéance', currency:'CHF' },
  it: { subtotal:'Totale parziale', vat:'IVA', grandTotal:'Totale complessivo', advanceDeduction:'Deduzione acconto', netBalance:'Importo netto', page:'Pagina', of:'di', position:'Pos.', description:'Descrizione', quantity:'Quantità', unitPrice:'Prezzo unitario', discount:'Sconto', total:'Totale', optional:'(opzionale)', validUntil:'Valido fino al', dueDate:'Scadenza', currency:'CHF' },
  en: { subtotal:'Subtotal', vat:'VAT', grandTotal:'Grand Total', advanceDeduction:'Less advance payments', netBalance:'Net balance', page:'Page', of:'of', position:'Pos.', description:'Description', quantity:'Qty', unitPrice:'Unit Price', discount:'Discount', total:'Total', optional:'(optional)', validUntil:'Valid until', dueDate:'Due date', currency:'CHF' },
};
export const t = (language, key) => LABELS[language]?.[key] ?? LABELS.de[key] ?? key;
```
- [ ] Create `server/src/modules/doctpl/renderer/PageManager.js`:
```js
const MM_TO_PT = 2.83465;

export default class PageManager {
  constructor(doc, margins) {
    this.doc = doc;
    this.margins = { top: (margins.top||25)*MM_TO_PT, bottom: (margins.bottom||20)*MM_TO_PT, left: (margins.left||20)*MM_TO_PT, right: (margins.right||15)*MM_TO_PT };
    this.pageHeight = doc.page.height;
    this.pageWidth = doc.page.width;
    this.currentY = this.margins.top;
    this.pageCount = 1;
    this.footerY = this.pageHeight - this.margins.bottom - 20;
  }
  get contentWidth() { return this.pageWidth - this.margins.left - this.margins.right; }
  get availableHeight() { return this.footerY - this.currentY; }
  checkSpace(requiredPts) {
    if (this.currentY + requiredPts > this.footerY) { this.addPage(); return true; }
    return false;
  }
  addPage() {
    this.doc.addPage();
    this.pageCount++;
    this.currentY = this.margins.top;
  }
  moveDown(pts) { this.currentY += pts; this.doc.y = this.currentY; }
  setY(y) { this.currentY = y; this.doc.y = y; }
}
```
- [ ] Add to `server/tests/unit/doctpl.renderer.test.js`:
```js
import { t, LABELS } from '../../src/modules/doctpl/renderer/i18n.js';

test('t() resolves label for known language', () => {
  expect(t('de', 'subtotal')).toBe('Zwischensumme');
  expect(t('fr', 'subtotal')).toBe('Sous-total');
  expect(t('en', 'grandTotal')).toBe('Grand Total');
});
test('t() falls back to de for unknown language', () => {
  expect(t('xx', 'subtotal')).toBe('Zwischensumme');
});
test('t() returns key for unknown key', () => {
  expect(t('de', 'nonexistent')).toBe('nonexistent');
});
```
- [ ] Run: `cd server && npm test -- --testPathPattern=doctpl.renderer`
- [ ] Commit: `git commit -am "feat(doctpl): add i18n labels and PageManager"`

---

## PHASE 2 — PDF RENDERERS

### Task 3: FooterRenderer + HeaderRenderer
**Files:**
- Create: `server/src/modules/doctpl/renderer/renderers/FooterRenderer.js`
- Create: `server/src/modules/doctpl/renderer/renderers/HeaderRenderer.js`

- [ ] Create `FooterRenderer.js`:
```js
import { t } from '../i18n.js';
const MM_TO_PT = 2.83465;

export default class FooterRenderer {
  constructor(doc, pageManager, ciConfig, language) {
    this.doc = doc; this.pm = pageManager; this.ci = ciConfig; this.lang = language;
    this.footerYPositions = [];
    doc.on('pageAdded', () => this._drawFooterLayout());
    this._drawFooterLayout();
  }
  _drawFooterLayout() {
    const y = this.pm.footerY + 5;
    this.footerYPositions.push({ pageIndex: this.pm.pageCount - 1, y });
    const doc = this.doc;
    const left = this.pm.margins.left;
    const width = this.pm.contentWidth;
    doc.save();
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor('#CCCCCC').stroke();
    doc.fontSize(7).fillColor('#888888');
    const company = this.ci?.companyName || 'MB Boiler & Heizung AG';
    const vat = this.ci?.companyDetails?.vatNumber || '';
    const bank = this.ci?.companyDetails?.bankName || '';
    doc.text(`${company} | ${vat} | ${bank}`, left, y + 6, { width, align: 'center' });
    doc.text(`__PAGE__`, left + width - 60, y + 6, { width: 60, align: 'right' });
    doc.restore();
  }
  stampPageNumbers(totalPages) {
    const range = this.doc.bufferedPageRange();
    for (let i = 0; i < totalPages; i++) {
      this.doc.switchToPage(range.start + i);
      const y = this.footerYPositions[i]?.y || (this.pm.footerY + 6 + 6);
      const left = this.pm.margins.left;
      const width = this.pm.contentWidth;
      this.doc.save();
      this.doc.fontSize(7).fillColor('#888888');
      this.doc.text(`${t(this.lang,'page')} ${i+1} ${t(this.lang,'of')} ${totalPages}`, left + width - 60, y + 6, { width: 60, align: 'right' });
      this.doc.restore();
    }
  }
}
```
- [ ] Create `HeaderRenderer.js`:
```js
import path from 'path';
import { t } from '../i18n.js';
const MM_TO_PT = 2.83465;
const DOC_TITLES = { quotation:{de:'Offerte',fr:'Offre',it:'Offerta',en:'Quotation'}, order_confirmation:{de:'Auftragsbestätigung',fr:'Confirmation de commande',it:'Conferma d\'ordine',en:'Order Confirmation'}, invoice_standard:{de:'Rechnung',fr:'Facture',it:'Fattura',en:'Invoice'}, invoice_advance:{de:'Akontorechnung',fr:'Facture d\'acompte',it:'Fattura d\'acconto',en:'Advance Invoice'}, invoice_final:{de:'Schlussrechnung',fr:'Facture finale',it:'Fattura finale',en:'Final Invoice'}, cover_letter:{de:'Begleitschreiben',fr:'Lettre d\'accompagnement',it:'Lettera d\'accompagnamento',en:'Cover Letter'}, service_report:{de:'Servicebericht',fr:'Rapport de service',it:'Rapporto di servizio',en:'Service Report'}, inspection_certificate:{de:'Inspektionszertifikat',fr:'Certificat d\'inspection',it:'Certificato d\'ispezione',en:'Inspection Certificate'} };

export default class HeaderRenderer {
  async draw(doc, pm, ciConfig, data, language, config = {}) {
    const left = pm.margins.left;
    const right = pm.pageWidth - pm.margins.right;
    const width = pm.contentWidth;
    let y = pm.margins.top;

    // Logo
    if (ciConfig?.logoPath) {
      try { doc.image(ciConfig.logoPath, left, y, { height: 30 }); } catch {}
    }
    // Company block (top right)
    const ci = ciConfig?.companyDetails || {};
    doc.save().fontSize(8).fillColor('#1B3F8B');
    const companyLines = [ciConfig?.companyName||'MB Boiler & Heizung AG', ci.address?.street||'', `${ci.address?.zip||''} ${ci.address?.city||''}`, ci.phone||'', ci.email||''].filter(Boolean);
    let compY = y;
    for (const line of companyLines) { doc.text(line, left + width * 0.55, compY, { width: width * 0.45, align: 'right' }); compY += 11; }
    doc.restore();

    // Customer address window (DIN 5008: top 27mm from page top, left 20mm)
    const addrY = 27 * MM_TO_PT;
    if (data.customer) {
      doc.save().fontSize(9).fillColor('#1A1A1A');
      const cust = data.customer;
      const addrLines = [cust.name, cust.addressLine1, cust.addressLine2, `${cust.plz||cust.zip||''} ${cust.city||''}`.trim(), cust.country].filter(Boolean);
      let ay = addrY;
      for (const line of addrLines) { doc.text(line, left, ay, { width: 85 * MM_TO_PT }); ay += 12; }
      doc.restore();
    }

    // Document title + meta (right side)
    const titleY = addrY;
    const templateType = data.templateType || config.templateType || 'quotation';
    const title = DOC_TITLES[templateType]?.[language] || DOC_TITLES[templateType]?.de || templateType;
    doc.save().fontSize(14).fillColor('#1B3F8B').font('Helvetica-Bold');
    doc.text(title, left + width * 0.55, titleY, { width: width * 0.45, align: 'right' });
    doc.restore();
    doc.save().fontSize(9).fillColor('#1A1A1A');
    let metaY = titleY + 22;
    if (data.documentNumber) { doc.text(`Nr: ${data.documentNumber}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.documentDate) { doc.text(`Datum: ${data.documentDate}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.validUntil) { doc.text(`${t(language,'validUntil')}: ${data.validUntil}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.dueDate) { doc.text(`${t(language,'dueDate')}: ${data.dueDate}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.reference) { doc.text(`Ref: ${data.reference}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    doc.restore();
    const newY = Math.max(addrY + 60, metaY) + 10;
    pm.setY(newY);
  }
}
```
- [ ] Commit: `git commit -am "feat(doctpl): add FooterRenderer and HeaderRenderer"`

---

### Task 4: BodyRenderer + TableRenderer
**Files:**
- Create: `server/src/modules/doctpl/renderer/renderers/BodyRenderer.js`
- Create: `server/src/modules/doctpl/renderer/renderers/TableRenderer.js`

- [ ] Create `BodyRenderer.js`:
```js
export default class BodyRenderer {
  draw(doc, pm, ciConfig, data, language, config = {}) {
    const text = data.introduction || (data.textBlocks?.[language]?.introduction) || '';
    if (!text) return;
    pm.checkSpace(30);
    doc.save().fontSize(10).fillColor('#1A1A1A');
    doc.text(text, pm.margins.left, pm.currentY, { width: pm.contentWidth });
    pm.moveDown(doc.heightOfString(text, { width: pm.contentWidth }) + 10);
    doc.restore();
  }
}
```
- [ ] Create `TableRenderer.js`:
```js
import { t } from '../i18n.js';
const ROW_HEIGHT = 16;
const HEADER_HEIGHT = 18;

export default class TableRenderer {
  draw(doc, pm, ciConfig, data, language, config = {}) {
    const items = data.lineItems || [];
    if (!items.length) return;
    const left = pm.margins.left;
    const width = pm.contentWidth;
    const cols = this._buildCols(config.tableColumns, width, language);
    this._drawTableHeader(doc, pm, cols, left, language);
    for (const item of items) { this._drawRow(doc, pm, item, cols, left, language); }
    pm.moveDown(4);
  }
  _buildCols(tableColumns, width, language) {
    if (tableColumns?.length) {
      let x = 0;
      return tableColumns.map(c => {
        const col = { field: c.field, label: c.label?.[language] || c.field, width: width * (c.widthPercent / 100), align: c.alignment || 'left', format: c.format || 'text', x };
        x += col.width; return col;
      });
    }
    const pct = [0.05, 0.40, 0.10, 0.15, 0.10, 0.20];
    const fields = ['position','description','quantity','unitPrice','discount','total'];
    const labels = [t(language,'position'), t(language,'description'), t(language,'quantity'), t(language,'unitPrice'), t(language,'discount'), t(language,'total')];
    const aligns = ['left','left','right','right','right','right'];
    let x = 0;
    return fields.map((f,i) => { const col = { field:f, label:labels[i], width:width*pct[i], align:aligns[i], x }; x+=col.width; return col; });
  }
  _drawTableHeader(doc, pm, cols, left, language) {
    pm.checkSpace(HEADER_HEIGHT + 4);
    const y = pm.currentY;
    doc.save().fontSize(8).fillColor('#1B3F8B').font('Helvetica-Bold');
    for (const col of cols) { doc.text(col.label, left + col.x, y, { width: col.width - 4, align: col.align }); }
    doc.restore();
    pm.moveDown(HEADER_HEIGHT);
    doc.moveTo(left, pm.currentY).lineTo(left + pm.contentWidth, pm.currentY).lineWidth(0.5).strokeColor('#CCCCCC').stroke();
    pm.moveDown(3);
  }
  _drawRow(doc, pm, item, cols, left, language) {
    if (item.type === 'text') {
      pm.checkSpace(ROW_HEIGHT);
      doc.save().fontSize(9).fillColor('#444444').font('Helvetica-Oblique');
      doc.text(item.description || '', left, pm.currentY, { width: pm.contentWidth });
      pm.moveDown(ROW_HEIGHT); doc.restore(); return;
    }
    const isOptional = item.isOptional || item.type === 'optional';
    pm.checkSpace(ROW_HEIGHT);
    const y = pm.currentY;
    doc.save().fontSize(9).fillColor('#1A1A1A');
    if (isOptional) doc.font('Helvetica-Oblique');
    const vals = { position: item.position != null ? String(item.position) : '', description: (isOptional ? `${t(language,'optional')} ` : '') + (item.description||''), quantity: item.quantity != null ? String(item.quantity) : '', unitPrice: item.unitPrice != null ? item.unitPrice.toFixed(2) : '', discount: item.discountPercent ? `${item.discountPercent}%` : '', total: (item.total ?? item.lineTotal) != null ? (item.total ?? item.lineTotal).toFixed(2) : '' };
    for (const col of cols) { const v = vals[col.field] ?? ''; doc.text(v, left + col.x, y, { width: col.width - 4, align: col.align }); }
    doc.restore();
    pm.moveDown(ROW_HEIGHT);
  }
}
```
- [ ] Add table renderer test to `server/tests/unit/doctpl.renderer.test.js`:
```js
import TableRenderer from '../../src/modules/doctpl/renderer/renderers/TableRenderer.js';

test('TableRenderer._buildCols uses defaults when no tableColumns', () => {
  const r = new TableRenderer();
  const cols = r._buildCols(null, 500, 'de');
  expect(cols.length).toBe(6);
  expect(cols[0].field).toBe('position');
  const totalWidth = cols.reduce((s,c)=>s+c.width,0);
  expect(Math.abs(totalWidth - 500)).toBeLessThan(1);
});
```
- [ ] Run: `cd server && npm test -- --testPathPattern=doctpl.renderer`
- [ ] Commit: `git commit -am "feat(doctpl): add BodyRenderer and TableRenderer"`

---

### Task 5: TotalsRenderer + QrBillRenderer + DocumentRenderer
**Files:**
- Create: `server/src/modules/doctpl/renderer/renderers/TotalsRenderer.js`
- Create: `server/src/modules/doctpl/renderer/renderers/QrBillRenderer.js`
- Create: `server/src/modules/doctpl/renderer/DocumentRenderer.js`
- Create: `server/src/modules/doctpl/renderer/index.js`

- [ ] Create `TotalsRenderer.js`:
```js
import { t } from '../i18n.js';
const LINE = 16;

export default class TotalsRenderer {
  draw(doc, pm, ciConfig, data, language, config = {}) {
    const left = pm.margins.left;
    const width = pm.contentWidth;
    const labelX = left + width * 0.6;
    const labelW = width * 0.25;
    const valueX = left + width * 0.85;
    const valueW = width * 0.15;
    const currency = data.currency || t(language,'currency');

    pm.checkSpace(LINE * 6);
    doc.moveTo(left + width * 0.6, pm.currentY).lineTo(left + width, pm.currentY).lineWidth(0.5).strokeColor('#CCCCCC').stroke();
    pm.moveDown(6);

    const row = (label, value, bold = false) => {
      pm.checkSpace(LINE);
      doc.save().fontSize(bold ? 11 : 9).fillColor(bold ? '#1B3F8B' : '#1A1A1A');
      if (bold) doc.font('Helvetica-Bold');
      doc.text(label, labelX, pm.currentY, { width: labelW });
      doc.text(value, valueX, pm.currentY, { width: valueW, align: 'right' });
      doc.restore();
      pm.moveDown(LINE);
    };

    if (data.subtotal != null) row(t(language,'subtotal'), `${currency} ${data.subtotal.toFixed(2)}`);
    for (const vat of (data.vatBreakdown || [])) { row(`${t(language,'vat')} ${(vat.rate * 100).toFixed(1)}%`, `${currency} ${vat.amount.toFixed(2)}`); }

    // Advance deductions (final invoice)
    if (data.advanceDeductions?.length) {
      pm.checkSpace(LINE * (data.advanceDeductions.length + 2));
      doc.save().fontSize(9).fillColor('#1A1A1A').font('Helvetica-Bold');
      doc.text(t(language,'advanceDeduction'), labelX, pm.currentY, { width: labelW + valueW }); pm.moveDown(LINE);
      doc.restore();
      for (const d of data.advanceDeductions) {
        row(`${d.invoiceNumber} (${d.date})`, `-${currency} ${d.amount.toFixed(2)}`);
      }
      if (data.netBalance != null) row(t(language,'netBalance'), `${currency} ${data.netBalance.toFixed(2)}`);
    }

    row(t(language,'grandTotal'), `${currency} ${(data.grandTotalRounded ?? data.grandTotal ?? 0).toFixed(2)}`, true);
  }
}
```
- [ ] Create `QrBillRenderer.js`:
```js
export default class QrBillRenderer {
  async draw(doc, pm, ciConfig, data, language) {
    const qrData = data.qrBill;
    if (!qrData?.iban) return;
    try {
      const { SwissQRBill } = await import('swissqrbill/pdf');
      const billData = {
        currency: qrData.currency || 'CHF',
        amount: qrData.amount,
        creditor: { name: ciConfig?.companyName || 'MB Boiler & Heizung AG', address: ciConfig?.companyDetails?.address?.street || '', zip: ciConfig?.companyDetails?.address?.zip || '0000', city: ciConfig?.companyDetails?.address?.city || '', country: 'CH', account: qrData.iban },
        debtor: qrData.debtor || undefined,
        reference: qrData.reference,
        message: qrData.message,
      };
      const qrBill = new SwissQRBill(billData);
      qrBill.attachTo(doc);
    } catch (err) {
      // Log and skip if swissqrbill API differs — do not crash generation
      console.error('QrBillRenderer: swissqrbill error', err.message);
    }
  }
}
```
- [ ] Create `DocumentRenderer.js`:
```js
import PDFDocument from 'pdfkit';
import PageManager from './PageManager.js';
import FooterRenderer from './renderers/FooterRenderer.js';
import HeaderRenderer from './renderers/HeaderRenderer.js';
import BodyRenderer from './renderers/BodyRenderer.js';
import TableRenderer from './renderers/TableRenderer.js';
import TotalsRenderer from './renderers/TotalsRenderer.js';
import QrBillRenderer from './renderers/QrBillRenderer.js';

const MM_TO_PT = 2.83465;

export default class DocumentRenderer {
  async render(template, ciConfig, data, language = 'de') {
    const margins = template.layout?.margins || { top:25, bottom:20, left:20, right:15 };
    const doc = new PDFDocument({ size: 'A4', margins: { top: margins.top*MM_TO_PT, bottom: margins.bottom*MM_TO_PT, left: margins.left*MM_TO_PT, right: margins.right*MM_TO_PT }, bufferPages: true, autoFirstPage: true });
    const pm = new PageManager(doc, margins);
    const footer = new FooterRenderer(doc, pm, ciConfig, language);

    const renderers = { header: new HeaderRenderer(), body: new BodyRenderer(), table: new TableRenderer(), totals: new TotalsRenderer(), qr_bill: new QrBillRenderer() };

    const sections = [...(template.sections || [{ id:'h',name:'Header',type:'header',position:0 },{ id:'b',name:'Body',type:'body',position:1 },{ id:'t',name:'Table',type:'table',position:2 },{ id:'tot',name:'Totals',type:'totals',position:3 },{ id:'f',name:'Footer',type:'footer',position:99 }])].sort((a,b) => a.position - b.position);

    for (const section of sections) {
      if (section.type === 'footer') continue;
      if (section.isConditional && section.conditionField) {
        const val = section.conditionField.split('.').reduce((o,k) => o?.[k], data);
        if (!val || (Array.isArray(val) && !val.length)) continue;
      }
      if (!section.isVisible && section.isVisible !== undefined) continue;
      const renderer = renderers[section.type];
      if (!renderer) continue;
      if (renderer.draw.constructor.name === 'AsyncFunction') { await renderer.draw(doc, pm, ciConfig, data, language, section.config || {}); }
      else { renderer.draw(doc, pm, ciConfig, data, language, section.config || {}); }
    }

    return new Promise((resolve, reject) => {
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => { footer.stampPageNumbers(pm.pageCount); resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);
      doc.end();
    });
  }
}
```
- [ ] Create `server/src/modules/doctpl/renderer/index.js`:
```js
export { default as DocumentRenderer } from './DocumentRenderer.js';
export { default as PageManager } from './PageManager.js';
```
- [ ] Commit: `git commit -am "feat(doctpl): add TotalsRenderer, QrBillRenderer, DocumentRenderer"`

---

### Task 6: Wire DocumentRenderer + preview into service
**Files:**
- Modify: `server/src/modules/doctpl/documentGeneration.service.js`
- Modify: `server/src/modules/doctpl/template.service.js`

- [ ] Replace `_generatePdf` in `documentGeneration.service.js`:
```js
// Replace the entire _generatePdf method with:
async _generatePdf(template, ciConfig, data, language) {
  const { DocumentRenderer } = await import('./renderer/index.js');
  const renderer = new DocumentRenderer();
  return renderer.render(template, ciConfig, data, language);
}
```
- [ ] Replace `preview` in `template.service.js`:
```js
async preview(templateId, sampleData = {}, language = 'de') {
  const template = await documentTemplateRepository.findById(templateId);
  if (!template) throw new NotFoundError('DocumentTemplate', templateId);
  const CIConfiguration = (await import('./ciConfiguration.model.js')).default;
  const ciConfig = await CIConfiguration.findOne({ isActive: true }).lean();
  const { DocumentRenderer } = await import('./renderer/index.js');
  const renderer = new DocumentRenderer();
  const buffer = await renderer.render(template, ciConfig, sampleData, language);
  const { default: fileService } = await import('../files/file.service.js');
  const fileMeta = await fileService.upload({ buffer, originalName: `preview_${templateId}_${language}.pdf`, mimeType: 'application/pdf', sizeBytes: buffer.length, module: 'doctpl', entityType: 'preview', entityId: templateId, uploadedBy: sampleData._previewBy || null, bucket: 'documents' });
  const downloadUrl = await fileService.getDownloadUrl(fileMeta._id);
  return { downloadUrl, sizeBytes: buffer.length };
}
```
- [ ] Commit: `git commit -am "feat(doctpl): wire DocumentRenderer into generation service and preview"`

---

## PHASE 3 — CLIENT MODULE

### Task 7: ENDPOINTS + query keys + services
**Files:**
- Modify: `client/src/lib/api/endpoints.js`
- Modify: `client/src/lib/query/keys.js`
- Create: `client/src/modules/doctpl/services/TemplateService.js`
- Create: `client/src/modules/doctpl/services/DocumentService.js`
- Create: `client/src/modules/doctpl/services/CIService.js`
- Create: `client/src/modules/doctpl/services/EmailService.js`

- [ ] Add to `endpoints.js` (after existing entries):
```js
DOCTPL: {
  TEMPLATES: '/doctpl/templates',
  TEMPLATE_BY_ID: (id) => `/doctpl/templates/${id}`,
  TEMPLATE_VERSIONS: (id) => `/doctpl/templates/${id}/versions`,
  TEMPLATE_VERSION: (id, v) => `/doctpl/templates/${id}/versions/${v}`,
  TEMPLATE_REVERT: (id, v) => `/doctpl/templates/${id}/versions/${v}/revert`,
  TEMPLATE_PREVIEW: (id) => `/doctpl/templates/${id}/preview`,
  DOCUMENTS: '/doctpl/documents',
  DOCUMENT_GENERATE: '/doctpl/documents/generate',
  DOCUMENT_GENERATE_BATCH: '/doctpl/documents/generate/batch',
  DOCUMENT_BY_ID: (id) => `/doctpl/documents/${id}`,
  DOCUMENT_DOWNLOAD: (id) => `/doctpl/documents/${id}/download`,
  DOCUMENT_BY_SOURCE: (mod, rid) => `/doctpl/documents/source/${mod}/${rid}`,
  CI_CONFIG: '/doctpl/ci',
  CI_ASSETS: '/doctpl/ci/assets',
  CI_ASSET_BY_ID: (id) => `/doctpl/ci/assets/${id}`,
  EMAILS: '/doctpl/emails',
  EMAIL_COMPOSE: '/doctpl/emails/compose',
  EMAIL_BY_ID: (id) => `/doctpl/emails/${id}`,
  EMAIL_RETRY: (id) => `/doctpl/emails/${id}/retry`,
  EMAIL_TEMPLATES: '/doctpl/email-templates',
},
```
- [ ] Add to `keys.js`:
```js
doctpl: {
  templates: { list: (f) => ['doctpl','templates','list',f], detail: (id) => ['doctpl','templates','detail',id], versions: (id) => ['doctpl','templates','versions',id] },
  documents: { list: (f) => ['doctpl','documents','list',f], detail: (id) => ['doctpl','documents','detail',id], bySource: (mod,rid) => ['doctpl','documents','source',mod,rid] },
  ci: { config: () => ['doctpl','ci','config'], assets: () => ['doctpl','ci','assets'] },
  emails: { list: (f) => ['doctpl','emails','list',f] },
},
```
- [ ] Create `TemplateService.js`:
```js
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const templateService = {
  list:        (p={}) => apiClient.get(E.TEMPLATES, { params: p }),
  getById:     (id)   => apiClient.get(E.TEMPLATE_BY_ID(id)),
  create:      (d)    => apiClient.post(E.TEMPLATES, d),
  update:      (id,d) => apiClient.put(E.TEMPLATE_BY_ID(id), d),
  listVersions:(id,p) => apiClient.get(E.TEMPLATE_VERSIONS(id), { params: p }),
  getVersion:  (id,v) => apiClient.get(E.TEMPLATE_VERSION(id,v)),
  revert:      (id,v) => apiClient.post(E.TEMPLATE_REVERT(id,v)),
  preview:     (id,d) => apiClient.post(E.TEMPLATE_PREVIEW(id), d),
};
```
- [ ] Create `DocumentService.js`:
```js
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const documentService = {
  list:        (p={}) => apiClient.get(E.DOCUMENTS, { params: p }),
  getById:     (id)   => apiClient.get(E.DOCUMENT_BY_ID(id)),
  generate:    (d)    => apiClient.post(E.DOCUMENT_GENERATE, d),
  download:    (id)   => apiClient.get(E.DOCUMENT_DOWNLOAD(id)),
  bySource:    (mod,rid) => apiClient.get(E.DOCUMENT_BY_SOURCE(mod,rid)),
  delete:      (id)   => apiClient.delete(E.DOCUMENT_BY_ID(id)),
};
```
- [ ] Create `CIService.js`:
```js
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const ciService = {
  getConfig:    ()    => apiClient.get(E.CI_CONFIG),
  updateConfig: (d)   => apiClient.put(E.CI_CONFIG, d),
  listAssets:   ()    => apiClient.get(E.CI_ASSETS),
  uploadAsset:  (fd)  => apiClient.post(E.CI_ASSETS, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAsset:  (id)  => apiClient.delete(E.CI_ASSET_BY_ID(id)),
};
```
- [ ] Create `EmailService.js`:
```js
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const emailService = {
  compose: (d)    => apiClient.post(E.EMAIL_COMPOSE, d),
  send:    (d)    => apiClient.post(E.EMAILS, d),
  list:    (p={}) => apiClient.get(E.EMAILS, { params: p }),
  getById: (id)   => apiClient.get(E.EMAIL_BY_ID(id)),
  retry:   (id)   => apiClient.post(E.EMAIL_RETRY(id)),
};
```
- [ ] Commit: `git commit -am "feat(doctpl): add client services and API endpoints"`

---

### Task 8: Hooks
**Files:** `client/src/modules/doctpl/hooks/` (7 files)

- [ ] Create `useTemplateQueries.js`:
```js
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { templateService } from '../services/TemplateService';
export const useTemplates = (f={}) => useQuery({ queryKey: queryKeys.doctpl.templates.list(f), queryFn: () => templateService.list(f), select: r => ({ items: r?.data ?? [], pagination: r?.pagination }) });
export const useTemplateDetail = (id) => useQuery({ queryKey: queryKeys.doctpl.templates.detail(id), queryFn: () => templateService.getById(id), enabled: !!id, select: r => r?.data });
export const useTemplateVersions = (id) => useQuery({ queryKey: queryKeys.doctpl.templates.versions(id), queryFn: () => templateService.listVersions(id), enabled: !!id, select: r => ({ items: r?.data ?? [], total: r?.total ?? 0 }) });
```
- [ ] Create `useTemplateMutations.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { templateService } from '../services/TemplateService';
export const useCreateTemplate = () => { const qc = useQueryClient(); return useMutation({ mutationFn: templateService.create, onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl','templates'] }) }); };
export const useUpdateTemplate = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...d }) => templateService.update(id, d), onSuccess: (_,v) => { qc.invalidateQueries({ queryKey: queryKeys.doctpl.templates.detail(v.id) }); qc.invalidateQueries({ queryKey: ['doctpl','templates','list'] }); } }); };
export const useRevertTemplate = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, version }) => templateService.revert(id, version), onSuccess: (_,v) => qc.invalidateQueries({ queryKey: queryKeys.doctpl.templates.detail(v.id) }) }); };
export const usePreviewTemplate = () => useMutation({ mutationFn: ({ id, sampleData, language }) => templateService.preview(id, { sampleData, language }), select: r => r?.data });
```
- [ ] Create `useDocumentQueries.js`:
```js
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { documentService } from '../services/DocumentService';
export const useDocuments = (f={}) => useQuery({ queryKey: queryKeys.doctpl.documents.list(f), queryFn: () => documentService.list(f), select: r => ({ items: r?.data ?? [], pagination: r?.pagination }) });
export const useDocumentDetail = (id) => useQuery({ queryKey: queryKeys.doctpl.documents.detail(id), queryFn: () => documentService.getById(id), enabled: !!id, select: r => r?.data });
export const useDocumentsBySource = (mod, rid) => useQuery({ queryKey: queryKeys.doctpl.documents.bySource(mod,rid), queryFn: () => documentService.bySource(mod, rid), enabled: !!(mod && rid), select: r => r?.data ?? [] });
```
- [ ] Create `useDocumentMutations.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { documentService } from '../services/DocumentService';
export const useGenerateDocument = () => { const qc = useQueryClient(); return useMutation({ mutationFn: documentService.generate, onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl','documents'] }) }); };
export const useDeleteDocument = () => { const qc = useQueryClient(); return useMutation({ mutationFn: documentService.delete, onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl','documents'] }) }); };
export const useDownloadDocument = () => useMutation({ mutationFn: (id) => documentService.download(id), onSuccess: (r) => { if (r?.data?.downloadUrl) window.open(r.data.downloadUrl, '_blank'); } });
```
- [ ] Create `useCIQueries.js`:
```js
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { ciService } from '../services/CIService';
export const useCIConfig = () => useQuery({ queryKey: queryKeys.doctpl.ci.config(), queryFn: ciService.getConfig, select: r => r?.data });
export const useCIAssets = () => useQuery({ queryKey: queryKeys.doctpl.ci.assets(), queryFn: ciService.listAssets, select: r => r?.data ?? [] });
```
- [ ] Create `useCIMutations.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { ciService } from '../services/CIService';
export const useUpdateCIConfig = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ciService.updateConfig, onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.doctpl.ci.config() }) }); };
export const useUploadCIAsset = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ciService.uploadAsset, onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.doctpl.ci.assets() }) }); };
export const useDeleteCIAsset = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ciService.deleteAsset, onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.doctpl.ci.assets() }) }); };
```
- [ ] Create `useEmailMutations.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emailService } from '../services/EmailService';
export const useComposeEmail = () => useMutation({ mutationFn: emailService.compose });
export const useSendEmail = () => { const qc = useQueryClient(); return useMutation({ mutationFn: emailService.send, onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl','emails'] }) }); };
export const useRetryEmail = () => { const qc = useQueryClient(); return useMutation({ mutationFn: emailService.retry, onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl','emails'] }) }); };
```
- [ ] Commit: `git commit -am "feat(doctpl): add client hooks"`

---

## PHASE 4 — CLIENT COMPONENTS

### Task 9: EmailStatusBadge + DocumentPreviewDrawer + EmailComposeModal
**Files:** 3 component files

- [ ] Create `client/src/modules/doctpl/components/EmailStatusBadge/index.jsx`:
```jsx
'use client';
const MAP = { QUEUED:{label:'Queued',cls:'bg-yellow-100 text-yellow-800'}, SENT:{label:'Sent',cls:'bg-blue-100 text-blue-800'}, DELIVERED:{label:'Delivered',cls:'bg-green-100 text-green-800'}, BOUNCED:{label:'Bounced',cls:'bg-red-100 text-red-800'}, FAILED:{label:'Failed',cls:'bg-red-200 text-red-900'} };
export function EmailStatusBadge({ status }) {
  const { label, cls } = MAP[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
```
- [ ] Create `client/src/modules/doctpl/components/DocumentPreviewDrawer/index.jsx`:
```jsx
'use client';
import { X, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
export function DocumentPreviewDrawer({ open, url, fileName, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-4xl flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium truncate max-w-sm">{fileName || 'Document Preview'}</span>
          <div className="flex gap-2">
            {url && <Button size="sm" variant="outline" onClick={() => window.open(url, '_blank')}><Download className="h-4 w-4 mr-1" />Download</Button>}
            <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {url ? <iframe src={url} className="h-full w-full border-0" title="PDF Preview" /> : <div className="flex h-full items-center justify-center text-muted-foreground">No preview available</div>}
        </div>
      </div>
    </div>
  );
}
```
- [ ] Create `client/src/modules/doctpl/components/EmailComposeModal/index.jsx`:
```jsx
'use client';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSendEmail } from '../../hooks/useEmailMutations';
export function EmailComposeModal({ open, onClose, initialValues = {} }) {
  const [form, setForm] = useState({ to: '', cc: '', subject: '', bodyHtml: '', ...initialValues });
  useEffect(() => { if (initialValues) setForm(f => ({ ...f, ...initialValues })); }, [open]);
  const send = useSendEmail();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const handleSend = async () => {
    await send.mutateAsync({ ...form, to: form.to.split(',').map(s=>s.trim()).filter(Boolean), cc: form.cc ? form.cc.split(',').map(s=>s.trim()).filter(Boolean) : [] });
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Send by Email</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>To</Label><Input value={form.to} onChange={set('to')} placeholder="email@example.com" /></div>
          <div><Label>CC</Label><Input value={form.cc} onChange={set('cc')} placeholder="optional" /></div>
          <div><Label>Subject</Label><Input value={form.subject} onChange={set('subject')} /></div>
          <div><Label>Message</Label><Textarea rows={6} value={form.bodyHtml} onChange={set('bodyHtml')} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={send.isPending}>{send.isPending ? 'Sending...' : 'Send'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
- [ ] Commit: `git commit -am "feat(doctpl): add EmailStatusBadge, DocumentPreviewDrawer, EmailComposeModal"`

---

### Task 10: DocumentsTable + TemplateVersionHistory
**Files:** 2 component files

- [ ] Create `client/src/modules/doctpl/components/DocumentsTable/index.jsx`:
```jsx
'use client';
import { useState } from 'react';
import { FileText, Download, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentPreviewDrawer } from '../DocumentPreviewDrawer';
import { useDocumentMutations } from '../../hooks/useDocumentMutations';

const TYPE_LABELS = { quotation:'Quotation', order_confirmation:'Order Conf.', invoice_standard:'Invoice', invoice_advance:'Advance Inv.', invoice_final:'Final Inv.', cover_letter:'Cover Letter', service_report:'Service Report', inspection_certificate:'Inspection Cert.' };

export function DocumentsTable({ documents = [], loading = false, onRefresh }) {
  const [preview, setPreview] = useState(null);
  const { mutate: deleteFn } = useDocumentMutations().useDeleteDocument?.() || {};
  const { mutateAsync: download } = useDocumentMutations().useDownloadDocument?.() || { mutateAsync: async () => {} };

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  if (!documents.length) return <div className="py-8 text-center text-muted-foreground">No documents generated yet.</div>;

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50"><th className="px-4 py-2 text-left font-medium">Type</th><th className="px-4 py-2 text-left font-medium">File</th><th className="px-4 py-2 text-left font-medium">Date</th><th className="px-4 py-2 text-left font-medium">Size</th><th className="px-4 py-2" /></tr></thead>
          <tbody>{documents.map(doc => (
            <tr key={doc._id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2"><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5" />{TYPE_LABELS[doc.documentType] || doc.documentType}</span></td>
              <td className="px-4 py-2 font-mono text-xs truncate max-w-xs">{doc.fileName}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{doc.generatedAt ? new Date(doc.generatedAt).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{doc.fileSizeBytes ? `${Math.round(doc.fileSizeBytes/1024)}KB` : '—'}</td>
              <td className="px-4 py-2"><div className="flex gap-1 justify-end">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => { const r = await download(doc._id); setPreview({ url: r?.data?.downloadUrl, fileName: doc.fileName }); }}><Eye className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => { await download(doc._id); }}><Download className="h-3.5 w-3.5" /></Button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <DocumentPreviewDrawer open={!!preview} url={preview?.url} fileName={preview?.fileName} onClose={() => setPreview(null)} />
    </>
  );
}
```
- [ ] Create `client/src/modules/doctpl/components/TemplateVersionHistory/index.jsx`:
```jsx
'use client';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTemplateVersions } from '../../hooks/useTemplateQueries';
import { useRevertTemplate } from '../../hooks/useTemplateMutations';
export function TemplateVersionHistory({ templateId }) {
  const { data, isLoading } = useTemplateVersions(templateId);
  const revert = useRevertTemplate();
  if (isLoading) return <div className="text-xs text-muted-foreground py-2">Loading versions...</div>;
  const items = data?.items || [];
  if (!items.length) return <div className="text-xs text-muted-foreground py-2">No version history yet.</div>;
  return (
    <div className="space-y-1">
      {items.map(v => (
        <div key={v._id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
          <div><span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">v{v.version}</span><span className="ml-2 text-muted-foreground text-xs">{v.changeDescription || 'No description'}</span></div>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" title="Revert to this version" onClick={() => revert.mutate({ id: templateId, version: v.version })}><RotateCcw className="h-3 w-3" /></Button></div>
        </div>
      ))}
    </div>
  );
}
```
- [ ] Commit: `git commit -am "feat(doctpl): add DocumentsTable and TemplateVersionHistory"`

---

### Task 11: CIConfigForm + CIAssetUploader
**Files:** 2 component files

- [ ] Create `client/src/modules/doctpl/components/CIAssetUploader/index.jsx`:
```jsx
'use client';
import { useRef } from 'react';
import { Upload, Trash2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUploadCIAsset, useDeleteCIAsset } from '../../hooks/useCIMutations';
import { useCIAssets } from '../../hooks/useCIQueries';

const ASSET_DEFS = [
  { type: 'logo_rgb', label: 'Logo (RGB PNG)', accept: 'image/png,image/jpeg' },
  { type: 'logo_cmyk', label: 'Logo (CMYK EPS)', accept: '.eps,application/postscript' },
  { type: 'font_300', label: 'Font Light (300)', accept: '.ttf,.otf' },
  { type: 'font_500', label: 'Font Medium (500)', accept: '.ttf,.otf' },
  { type: 'font_700', label: 'Font Bold (700)', accept: '.ttf,.otf' },
];

export function CIAssetUploader() {
  const { data: assets = [] } = useCIAssets();
  const upload = useUploadCIAsset();
  const del = useDeleteCIAsset();
  const fileRefs = useRef({});
  const getAsset = (type) => assets.find(a => a.assetType === type);
  const handleUpload = (type, file) => {
    const fd = new FormData(); fd.append('file', file); fd.append('assetType', type);
    upload.mutate(fd);
  };
  return (
    <div className="space-y-3">
      {ASSET_DEFS.map(({ type, label, accept }) => {
        const existing = getAsset(type);
        return (
          <div key={type} className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="flex items-center gap-3">
              {existing ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
              <div><p className="text-sm font-medium">{label}</p>{existing && <p className="text-xs text-muted-foreground">{existing.fileName}</p>}</div>
            </div>
            <div className="flex gap-2">
              <input ref={el => fileRefs.current[type] = el} type="file" accept={accept} className="hidden" onChange={e => e.target.files[0] && handleUpload(type, e.target.files[0])} />
              <Button size="sm" variant="outline" onClick={() => fileRefs.current[type]?.click()}>{existing ? 'Replace' : 'Upload'}</Button>
              {existing && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del.mutate(existing._id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```
- [ ] Create `client/src/modules/doctpl/components/CIConfigForm/index.jsx`:
```jsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCIConfig } from '../../hooks/useCIQueries';
import { useUpdateCIConfig } from '../../hooks/useCIMutations';

export function CIConfigForm() {
  const { data: config, isLoading } = useCIConfig();
  const update = useUpdateCIConfig();
  const [form, setForm] = useState({ companyName:'', vatNumber:'', iban:'', qrIban:'', bankName:'', street:'', zip:'', city:'', phone:'', email:'' });
  useEffect(() => {
    if (config) setForm({ companyName: config.companyName||'', vatNumber: config.companyDetails?.vatNumber||'', iban: config.companyDetails?.bankDetails?.iban||'', qrIban: config.companyDetails?.bankDetails?.qrIban||'', bankName: config.companyDetails?.bankName||'', street: config.companyDetails?.address?.street||'', zip: config.companyDetails?.address?.zip||'', city: config.companyDetails?.address?.city||'', phone: config.companyDetails?.phone||'', email: config.companyDetails?.email||'' });
  }, [config]);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const handleSave = () => update.mutate({ companyName: form.companyName, companyDetails: { vatNumber: form.vatNumber, bankName: form.bankName, bankDetails: { iban: form.iban, qrIban: form.qrIban }, address: { street: form.street, zip: form.zip, city: form.city }, phone: form.phone, email: form.email } });
  if (isLoading) return <div className="py-4 text-muted-foreground">Loading...</div>;
  const field = (label, key, placeholder='') => (<div><Label>{label}</Label><Input value={form[key]} onChange={set(key)} placeholder={placeholder} /></div>);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {field('Company Name','companyName','MB Boiler & Heizung AG')}
        {field('VAT Number','vatNumber','CHE-000.000.000 MWST')}
        {field('IBAN','iban','CH...')}
        {field('QR-IBAN','qrIban','CH...')}
        {field('Bank Name','bankName')}
        {field('Street','street')}
        {field('ZIP','zip')}
        {field('City','city')}
        {field('Phone','phone')}
        {field('Email','email')}
      </div>
      <Button onClick={handleSave} disabled={update.isPending}>{update.isPending ? 'Saving...' : 'Save CI Configuration'}</Button>
    </div>
  );
}
```
- [ ] Commit: `git commit -am "feat(doctpl): add CIConfigForm and CIAssetUploader"`

---

### Task 12: TemplateEditor
**Files:** `client/src/modules/doctpl/components/TemplateEditor/` (5 files)

- [ ] Create `LayoutTab.jsx`:
```jsx
'use client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
export function LayoutTab({ layout = {}, onChange }) {
  const margins = layout.margins || { top:25, bottom:20, left:20, right:15 };
  const set = (path, val) => { const parts = path.split('.'); if (parts.length===2) onChange({ ...layout, [parts[0]]: { ...(layout[parts[0]]||{}), [parts[1]]: Number(val) } }); else onChange({ ...layout, [path]: val }); };
  return (
    <div className="space-y-4">
      <div><p className="text-sm font-medium mb-2">Page Margins (mm)</p>
        <div className="grid grid-cols-4 gap-3">
          {['top','bottom','left','right'].map(k => (<div key={k}><Label className="text-xs capitalize">{k}</Label><Input type="number" min={5} max={50} value={margins[k]??0} onChange={e=>set(`margins.${k}`,e.target.value)} /></div>))}
        </div>
      </div>
    </div>
  );
}
```
- [ ] Create `TextBlocksTab.jsx`:
```jsx
'use client';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
const LANGS = [['de','Deutsch'],['fr','Français'],['it','Italiano'],['en','English']];
const FIELDS = [['introduction','Introduction'],['terms','Terms & Conditions'],['footer','Footer Text'],['emailSubject','Email Subject'],['emailBody','Email Body']];
export function TextBlocksTab({ textBlocks = {}, onChange }) {
  const [lang, setLang] = useState('de');
  const set = (field, val) => onChange({ ...textBlocks, [lang]: { ...(textBlocks[lang]||{}), [field]: val } });
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b pb-2">{LANGS.map(([code,label]) => (<button key={code} onClick={()=>setLang(code)} className={`px-3 py-1 text-sm rounded ${lang===code?'bg-primary text-primary-foreground':'text-muted-foreground hover:text-foreground'}`}>{label}</button>))}</div>
      <div className="space-y-3">{FIELDS.map(([field,label]) => (<div key={field}><Label>{label}</Label><Textarea rows={field==='terms'?6:3} value={textBlocks[lang]?.[field]||''} onChange={e=>set(field,e.target.value)} /></div>))}</div>
    </div>
  );
}
```
- [ ] Create `ColumnsTab.jsx`:
```jsx
'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
const LANGS = ['de','fr','it','en'];
export function ColumnsTab({ tableColumns = [], onChange }) {
  const total = tableColumns.reduce((s,c)=>s+(c.widthPercent||0),0);
  const set = (i, key, val) => { const cols = [...tableColumns]; cols[i] = { ...cols[i], [key]: key==='widthPercent'?Number(val):val }; onChange(cols); };
  const setLabel = (i, lang, val) => { const cols = [...tableColumns]; cols[i] = { ...cols[i], label: { ...(cols[i].label||{}), [lang]: val } }; onChange(cols); };
  return (
    <div className="space-y-3">
      <p className={`text-xs ${Math.abs(total-100)>1?'text-destructive':'text-muted-foreground'}`}>Total width: {total}% {Math.abs(total-100)>1&&'(must equal 100%)'}</p>
      {tableColumns.map((col,i) => (
        <div key={col.field||i} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-3"><span className="font-mono text-xs bg-muted px-1.5 rounded">{col.field}</span><div className="flex items-center gap-1 ml-auto"><Label className="text-xs">Width %</Label><Input type="number" min={1} max={100} className="w-20" value={col.widthPercent||0} onChange={e=>set(i,'widthPercent',e.target.value)} /></div></div>
          <div className="grid grid-cols-4 gap-2">{LANGS.map(l => (<div key={l}><Label className="text-xs uppercase">{l}</Label><Input value={col.label?.[l]||''} onChange={e=>setLabel(i,l,e.target.value)} /></div>))}</div>
        </div>
      ))}
    </div>
  );
}
```
- [ ] Create `SectionsTab.jsx`:
```jsx
'use client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
export function SectionsTab({ sections = [], onChange }) {
  const toggle = (id, key, val) => onChange(sections.map(s => s.id===id ? {...s,[key]:val} : s));
  const sorted = [...sections].sort((a,b)=>a.position-b.position);
  return (
    <div className="space-y-2">
      {sorted.map(s => (
        <div key={s.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div><p className="text-sm font-medium capitalize">{s.name}</p><p className="text-xs text-muted-foreground">{s.type}{s.isConditional ? ' · conditional' : ''}</p></div>
          <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground">Visible</Label><Switch checked={s.isVisible!==false} onCheckedChange={v=>toggle(s.id,'isVisible',v)} /></div>
        </div>
      ))}
    </div>
  );
}
```
- [ ] Create `index.jsx`:
```jsx
'use client';
import { useState } from 'react';
import { LayoutTab } from './LayoutTab';
import { TextBlocksTab } from './TextBlocksTab';
import { ColumnsTab } from './ColumnsTab';
import { SectionsTab } from './SectionsTab';
const TABS = [['layout','Layout'],['textBlocks','Text Blocks'],['columns','Columns'],['sections','Sections']];
export function TemplateEditor({ template, onChange }) {
  const [tab, setTab] = useState('layout');
  if (!template) return null;
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b pb-2">{TABS.map(([key,label]) => (<button key={key} onClick={()=>setTab(key)} className={`px-3 py-1.5 text-sm rounded-md ${tab===key?'bg-primary text-primary-foreground':'text-muted-foreground hover:text-foreground'}`}>{label}</button>))}</div>
      {tab==='layout'    && <LayoutTab     layout={template.layout}       onChange={v=>onChange({...template,layout:v})} />}
      {tab==='textBlocks'&& <TextBlocksTab textBlocks={template.textBlocks} onChange={v=>onChange({...template,textBlocks:v})} />}
      {tab==='columns'   && <ColumnsTab    tableColumns={template.tableColumns} onChange={v=>onChange({...template,tableColumns:v})} />}
      {tab==='sections'  && <SectionsTab   sections={template.sections}   onChange={v=>onChange({...template,sections:v})} />}
    </div>
  );
}
```
- [ ] Commit: `git commit -am "feat(doctpl): add TemplateEditor with 4 tabs"`

---

## PHASE 5 — CLIENT PAGES

### Task 13: /documents page
**File:** `client/src/app/(platform)/documents/page.jsx`

- [ ] Create `client/src/app/(platform)/documents/page.jsx`:
```jsx
'use client';
import { useState } from 'react';
import { PageHeader } from '@/shared/components/page-header';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DocumentsTable } from '@/modules/doctpl/components/DocumentsTable';
import { useDocuments } from '@/modules/doctpl/hooks/useDocumentQueries';
import { useDownloadDocument, useDeleteDocument } from '@/modules/doctpl/hooks/useDocumentMutations';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';

const DOC_TYPES = ['','quotation','order_confirmation','invoice_standard','invoice_advance','invoice_final','cover_letter','service_report','inspection_certificate'];
const TYPE_LABELS = { '':'All Types', quotation:'Quotation', order_confirmation:'Order Conf.', invoice_standard:'Invoice', invoice_advance:'Advance Inv.', invoice_final:'Final Inv.', cover_letter:'Cover Letter', service_report:'Service Report', inspection_certificate:'Inspection Cert.' };

export default function DocumentsPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [preview, setPreview] = useState(null);
  const { data, isLoading } = useDocuments(typeFilter ? { documentType: typeFilter } : {});
  const download = useDownloadDocument();
  const documents = data?.items || [];
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Generated Documents" description="All PDFs generated by the system" />
      <div className="flex gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by type" /></SelectTrigger>
          <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DocumentsTable
        documents={documents}
        loading={isLoading}
        onPreview={async (doc) => { const r = await download.mutateAsync(doc._id); setPreview({ url: r?.data?.downloadUrl, fileName: doc.fileName }); }}
        onDownload={async (doc) => { const r = await download.mutateAsync(doc._id); if (r?.data?.downloadUrl) window.open(r.data.downloadUrl, '_blank'); }}
      />
      <DocumentPreviewDrawer open={!!preview} url={preview?.url} fileName={preview?.fileName} onClose={() => setPreview(null)} />
    </div>
  );
}
```
- [ ] Commit: `git commit -am "feat(doctpl): add /documents page"`

---

### Task 14: /admin/templates + /admin/templates/ci pages
**Files:** 2 pages

- [ ] Create `client/src/app/(platform)/admin/templates/page.jsx`:
```jsx
'use client';
import Link from 'next/link';
import { Settings2, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTemplates } from '@/modules/doctpl/hooks/useTemplateQueries';
import { useUpdateTemplate } from '@/modules/doctpl/hooks/useTemplateMutations';

const TYPE_LABELS = { quotation:'Quotation', order_confirmation:'Order Confirmation', invoice_standard:'Invoice', invoice_advance:'Advance Invoice', invoice_final:'Final Invoice', cover_letter:'Cover Letter', service_report:'Service Report', inspection_certificate:'Inspection Certificate' };

export default function AdminTemplatesPage() {
  const { data, isLoading } = useTemplates();
  const update = useUpdateTemplate();
  const templates = data?.items || [];
  const toggle = (t) => update.mutate({ id: t._id, isActive: !t.isActive, changeDescription: `${t.isActive ? 'Deactivated' : 'Activated'} template` });
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Document Templates" description="Manage PDF templates for all document types" />
        <Link href="/admin/templates/ci"><Button variant="outline" className="gap-2"><Settings2 className="h-4 w-4" />CI Configuration</Button></Link>
      </div>
      {isLoading ? <div className="text-muted-foreground">Loading...</div> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <div key={t._id} className="rounded-xl border bg-card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /><span className="font-medium text-sm">{t.name}</span></div>
                <Badge variant={t.isActive ? 'default' : 'secondary'}>{t.isActive ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{TYPE_LABELS[t.templateType] || t.templateType}</p>
              <p className="text-xs text-muted-foreground">v{t.currentVersion} · Updated {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : '—'}</p>
              <div className="flex gap-2 mt-auto pt-2 border-t">
                <Link href={`/admin/templates/${t._id}`} className="flex-1"><Button size="sm" variant="outline" className="w-full">Edit</Button></Link>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggle(t)}>{t.isActive ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```
- [ ] Create `client/src/app/(platform)/admin/templates/ci/page.jsx`:
```jsx
'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/shared/components/page-header';
import { CIConfigForm } from '@/modules/doctpl/components/CIConfigForm';
import { CIAssetUploader } from '@/modules/doctpl/components/CIAssetUploader';
import { Separator } from '@/components/ui/separator';
export default function CIConfigPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/templates"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <PageHeader title="CI Configuration" description="Company identity settings for all generated documents" />
      </div>
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold">Company Details</h3>
        <CIConfigForm />
      </div>
      <Separator />
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold">Brand Assets</h3>
        <p className="text-sm text-muted-foreground">Upload logo and Museo Sans font files. These are used in all generated PDFs.</p>
        <CIAssetUploader />
      </div>
    </div>
  );
}
```
- [ ] Commit: `git commit -am "feat(doctpl): add /admin/templates and /admin/templates/ci pages"`

---

### Task 15: /admin/templates/[id] page + quotes integration
**Files:** 2 files

- [ ] Create `client/src/app/(platform)/admin/templates/[id]/page.jsx`:
```jsx
'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, Save, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/shared/components/page-header';
import { TemplateEditor } from '@/modules/doctpl/components/TemplateEditor';
import { TemplateVersionHistory } from '@/modules/doctpl/components/TemplateVersionHistory';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';
import { useTemplateDetail } from '@/modules/doctpl/hooks/useTemplateQueries';
import { useUpdateTemplate, usePreviewTemplate } from '@/modules/doctpl/hooks/useTemplateMutations';

export default function TemplateDetailPage() {
  const { id } = useParams();
  const { data: template, isLoading } = useTemplateDetail(id);
  const update = useUpdateTemplate();
  const preview = usePreviewTemplate();
  const [draft, setDraft] = useState(null);
  const [changeDesc, setChangeDesc] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [previewState, setPreviewState] = useState(null);
  const current = draft || template;
  const handleSave = () => { if (!changeDesc) return; update.mutate({ id, ...draft, changeDescription: changeDesc }); setDraft(null); setChangeDesc(''); };
  const handlePreview = async () => { const r = await preview.mutateAsync({ id, sampleData: {}, language: 'de' }); setPreviewState({ url: r?.data?.downloadUrl }); };
  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!current) return <div className="p-6 text-muted-foreground">Template not found.</div>;
  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><Link href="/admin/templates"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link><PageHeader title={current.name} description={`v${current.currentVersion} · ${current.templateType}`} /></div>
        <div className="flex gap-2"><Button variant="outline" className="gap-1" onClick={handlePreview} disabled={preview.isPending}><Eye className="h-4 w-4" />{preview.isPending ? 'Generating...' : 'Preview'}</Button><Button variant="outline" className="gap-1" onClick={() => setShowHistory(!showHistory)}><History className="h-4 w-4" />History</Button></div>
      </div>
      <div className="flex gap-6">
        <div className="flex-1 rounded-xl border bg-card p-5">
          <TemplateEditor template={current} onChange={setDraft} />
          {draft && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div><Label>Change description (required to save)</Label><Input value={changeDesc} onChange={e => setChangeDesc(e.target.value)} placeholder="e.g. Updated margin sizes" /></div>
              <div className="flex gap-2"><Button onClick={handleSave} disabled={!changeDesc || update.isPending} className="gap-1"><Save className="h-4 w-4" />{update.isPending ? 'Saving...' : 'Save Changes'}</Button><Button variant="ghost" onClick={() => { setDraft(null); setChangeDesc(''); }}>Discard</Button></div>
            </div>
          )}
        </div>
        {showHistory && <div className="w-80 rounded-xl border bg-card p-5"><h3 className="font-semibold mb-3 text-sm">Version History</h3><TemplateVersionHistory templateId={id} /></div>}
      </div>
      <DocumentPreviewDrawer open={!!previewState} url={previewState?.url} onClose={() => setPreviewState(null)} />
    </div>
  );
}
```
- [ ] Create quotes integration component `client/src/modules/doctpl/components/SourceDocumentsPanel/index.jsx`:
```jsx
'use client';
import { useState } from 'react';
import { FileText, Mail, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentsTable } from '../DocumentsTable';
import { EmailComposeModal } from '../EmailComposeModal';
import { DocumentPreviewDrawer } from '../DocumentPreviewDrawer';
import { useDocumentsBySource } from '../../hooks/useDocumentQueries';
import { useGenerateDocument } from '../../hooks/useDocumentMutations';
import { useComposeEmail } from '../../hooks/useEmailMutations';
import { useDownloadDocument } from '../../hooks/useDocumentMutations';

export function SourceDocumentsPanel({ sourceModule, sourceRecordId, templateType, documentData, language = 'de' }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailInit, setEmailInit] = useState({});
  const [preview, setPreview] = useState(null);
  const { data: docs = [], refetch } = useDocumentsBySource(sourceModule, sourceRecordId);
  const generate = useGenerateDocument();
  const compose = useComposeEmail();
  const download = useDownloadDocument();

  const handleGenerate = async () => {
    await generate.mutateAsync({ templateType, sourceModule, sourceRecordId, data: documentData, language });
    refetch();
  };

  const handleEmailOpen = async () => {
    const r = await compose.mutateAsync({ templateType, language, data: documentData, documentId: docs[0]?._id });
    setEmailInit({ to: r?.data?.to?.join(', ')||'', subject: r?.data?.subject||'', bodyHtml: r?.data?.bodyHtml||'', documentId: docs[0]?._id, sourceModule, sourceRecordId });
    setEmailOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" />Documents</h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generate.isPending} className="gap-1">
            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Generate PDF
          </Button>
          {docs.length > 0 && <Button size="sm" variant="outline" onClick={handleEmailOpen} className="gap-1"><Mail className="h-3.5 w-3.5" />Send</Button>}
        </div>
      </div>
      <DocumentsTable documents={docs} onPreview={async (doc) => { const r = await download.mutateAsync(doc._id); setPreview({ url: r?.data?.downloadUrl, fileName: doc.fileName }); }} onDownload={async (doc) => { const r = await download.mutateAsync(doc._id); if (r?.data?.downloadUrl) window.open(r.data.downloadUrl,'_blank'); }} />
      <EmailComposeModal open={emailOpen} onClose={() => setEmailOpen(false)} initialValues={emailInit} />
      <DocumentPreviewDrawer open={!!preview} url={preview?.url} fileName={preview?.fileName} onClose={() => setPreview(null)} />
    </div>
  );
}
```
- [ ] Commit: `git commit -am "feat(doctpl): add template detail page and SourceDocumentsPanel"`

---

## PHASE 6 — SEED DATA

### Task 16: Seed default templates
**File:** `server/src/seed/` (new file or add to existing)

- [ ] Create `server/src/seed/doctplSeed.js`:
```js
import mongoose from 'mongoose';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

const DEFAULT_SECTIONS = (includeQrBill = false, includeDeductions = false) => [
  { id:'header', name:'Header', type:'header', position:0, isVisible:true, isConditional:false, config:{} },
  { id:'body', name:'Introduction', type:'body', position:1, isVisible:true, isConditional:true, conditionField:'introduction', config:{} },
  { id:'table', name:'Line Items', type:'table', position:2, isVisible:true, isConditional:false, config:{} },
  ...(includeDeductions ? [{ id:'deductions', name:'Advance Deductions', type:'deductions', position:3, isVisible:true, isConditional:true, conditionField:'advanceDeductions', config:{} }] : []),
  { id:'totals', name:'Totals', type:'totals', position:4, isVisible:true, isConditional:false, config:{} },
  ...(includeQrBill ? [{ id:'qr_bill', name:'QR Bill', type:'qr_bill', position:5, isVisible:true, isConditional:true, conditionField:'qrBill', config:{} }] : []),
  { id:'footer', name:'Footer', type:'footer', position:99, isVisible:true, isConditional:false, config:{} },
];

const DEFAULT_COLUMNS = (lang='de') => [
  { field:'position', label:{de:'Pos.',fr:'Pos.',it:'Pos.',en:'Pos.'}, widthPercent:5, alignment:'left', format:'text' },
  { field:'description', label:{de:'Beschreibung',fr:'Description',it:'Descrizione',en:'Description'}, widthPercent:40, alignment:'left', format:'text' },
  { field:'quantity', label:{de:'Menge',fr:'Quantité',it:'Quantità',en:'Qty'}, widthPercent:10, alignment:'right', format:'number' },
  { field:'unitPrice', label:{de:'Einzelpreis',fr:'Prix unitaire',it:'Prezzo unitario',en:'Unit Price'}, widthPercent:15, alignment:'right', format:'currency' },
  { field:'discount', label:{de:'Rabatt',fr:'Remise',it:'Sconto',en:'Discount'}, widthPercent:10, alignment:'right', format:'percent' },
  { field:'total', label:{de:'Total',fr:'Total',it:'Totale',en:'Total'}, widthPercent:20, alignment:'right', format:'currency' },
];

const TEMPLATES = [
  { templateType:'quotation', name:'Standard Offerte', sections:DEFAULT_SECTIONS(), tableColumns:DEFAULT_COLUMNS() },
  { templateType:'order_confirmation', name:'Auftragsbestätigung', sections:DEFAULT_SECTIONS(), tableColumns:DEFAULT_COLUMNS() },
  { templateType:'invoice_standard', name:'Standard Rechnung', sections:DEFAULT_SECTIONS(true), tableColumns:DEFAULT_COLUMNS() },
  { templateType:'invoice_advance', name:'Akontorechnung', sections:DEFAULT_SECTIONS(true), tableColumns:DEFAULT_COLUMNS() },
  { templateType:'invoice_final', name:'Schlussrechnung', sections:DEFAULT_SECTIONS(true, true), tableColumns:DEFAULT_COLUMNS() },
  { templateType:'cover_letter', name:'Begleitschreiben', sections:[{ id:'header',name:'Header',type:'header',position:0,isVisible:true,isConditional:false,config:{} },{ id:'body',name:'Body',type:'body',position:1,isVisible:true,isConditional:false,config:{} },{ id:'footer',name:'Footer',type:'footer',position:99,isVisible:true,isConditional:false,config:{} }], tableColumns:[] },
  { templateType:'service_report', name:'Servicebericht', sections:DEFAULT_SECTIONS(), tableColumns:DEFAULT_COLUMNS() },
  { templateType:'inspection_certificate', name:'Inspektionszertifikat', sections:DEFAULT_SECTIONS(), tableColumns:DEFAULT_COLUMNS() },
];

export async function seedDoctplTemplates(adminUserId) {
  const { default: DocumentTemplate } = await import('../modules/doctpl/documentTemplate.model.js');
  let created = 0;
  for (const tmpl of TEMPLATES) {
    const exists = await DocumentTemplate.findOne({ templateType: tmpl.templateType });
    if (!exists) {
      await DocumentTemplate.create({ ...tmpl, createdBy: adminUserId, isActive: true });
      created++;
      logger.info(`Seeded template: ${tmpl.templateType}`);
    }
  }
  logger.info(`DocTpl seed complete: ${created} templates created`);
}
```
- [ ] Add call to existing `server/src/seed/reseed.js` (or run manually):
```js
// In reseed.js after other seeds:
import { seedDoctplTemplates } from './doctplSeed.js';
// find or create an admin user ID, then:
await seedDoctplTemplates(adminUser._id);
```
- [ ] Commit: `git commit -am "feat(doctpl): add default template seed data"`
