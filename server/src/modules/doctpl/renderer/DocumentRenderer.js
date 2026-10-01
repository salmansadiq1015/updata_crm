import PDFDocument from 'pdfkit';
import PageManager from './PageManager.js';
import FooterRenderer from './renderers/FooterRenderer.js';
import HeaderRenderer from './renderers/HeaderRenderer.js';
import BodyRenderer from './renderers/BodyRenderer.js';
import TableRenderer from './renderers/TableRenderer.js';
import TotalsRenderer from './renderers/TotalsRenderer.js';
import QrBillRenderer from './renderers/QrBillRenderer.js';
import TermsRenderer from './renderers/TermsRenderer.js';
import ReportRenderer from './renderers/ReportRenderer.js';
import { registerCiFonts } from './renderers/fonts.js';

const MM_TO_PT = 2.83465;

const DEFAULT_SECTIONS = [
  { id:'header',  name:'Header',     type:'header',  position:0,  isVisible:true, isConditional:false },
  { id:'body',    name:'Body',       type:'body',    position:1,  isVisible:true, isConditional:false },
  { id:'table',   name:'Line Items', type:'table',   position:2,  isVisible:true, isConditional:false },
  { id:'totals',  name:'Totals',     type:'totals',  position:3,  isVisible:true, isConditional:false },
  { id:'footer',  name:'Footer',     type:'footer',  position:99, isVisible:true, isConditional:false },
];

export default class DocumentRenderer {
  async render(template, ciConfig, data, language = 'de') {
    const result = await this.renderWithMetadata(template, ciConfig, data, language);
    return result.buffer;
  }

  async renderWithMetadata(template, ciConfig, data, language = 'de') {
    const layout = template.layout || {};
    const margins = layout.margins || { top:25, bottom:20, left:20, right:15 };
    const templateType = data.templateType || template.templateType || 'quotation';

    const doc = new PDFDocument({
      size: layout.pageSize || 'A4',
      layout: layout.orientation || 'portrait',
      margins: {
        top:    margins.top    * MM_TO_PT,
        bottom: margins.bottom * MM_TO_PT,
        left:   margins.left   * MM_TO_PT,
        right:  margins.right  * MM_TO_PT,
      },
      bufferPages: true,
      autoFirstPage: true,
    });

    doc.info.Title = data.documentNumber || templateType || 'Document';
    doc.info.Author = ciConfig?.companyName || 'Updata';
    doc.info.Creator = 'Updata ERP';
    doc.info.CreationDate = new Date();
    registerCiFonts(doc, ciConfig);

    const pm = new PageManager(doc, margins, layout);
    const footer = new FooterRenderer(doc, pm, ciConfig, language, template, data);
    const qrBillPages = [];

    const rendererMap = {
      header:  new HeaderRenderer(),
      body:    new BodyRenderer(),
      table:   new TableRenderer(),
      totals:  new TotalsRenderer(),
      deductions: new TotalsRenderer(), // handled inside TotalsRenderer via data.advanceDeductions
      terms: new TermsRenderer(),
      report: new ReportRenderer(),
      qr_bill: new QrBillRenderer(),
    };

    const sections = [...(template.sections?.length ? template.sections : DEFAULT_SECTIONS)]
      .sort((a, b) => a.position - b.position);

    for (const section of sections) {
      // Skip footer — drawn automatically via pageAdded event
      if (section.type === 'footer') continue;

      // Visibility check
      if (section.isVisible === false) continue;

      // Conditional check
      if (section.isConditional && section.conditionField) {
        const val = section.conditionField.split('.').reduce((o, k) => o?.[k], data);
        if (!val || (Array.isArray(val) && val.length === 0)) continue;
      }

      const renderer = rendererMap[section.type];
      if (!renderer) continue;

      if (section.type === 'qr_bill' && this._requiresQrBill(templateType)) {
        this._assertQrBillData(data.qrBill);
      }

      const sectionConfig = {
        ...(section.config || {}),
        template,
        templateType,
        layout,
        tableColumns: template.tableColumns || [],
      };
      if (renderer.draw.constructor.name === 'AsyncFunction') {
        await renderer.draw(doc, pm, ciConfig, data, language, sectionConfig);
      } else {
        renderer.draw(doc, pm, ciConfig, data, language, sectionConfig);
      }

      // The payment part must stay free of any other content, so the page the
      // QR-bill landed on gets no footer. swissqrbill draws on the current
      // page or opens a new one, so the page it ended on is the one to skip.
      if (section.type === 'qr_bill' && data.qrBill?.iban) {
        qrBillPages.push(doc.bufferedPageRange().count - 1);
      }
    }

    const totalPages = doc.bufferedPageRange().count;

    return new Promise((resolve, reject) => {
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        resolve({ buffer: Buffer.concat(chunks), pageCount: totalPages });
      });
      doc.on('error', reject);
      try {
        footer.render({ skipPages: qrBillPages });
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  _requiresQrBill(templateType) {
    return ['invoice_standard', 'invoice_advance', 'invoice_final'].includes(templateType);
  }

  _assertQrBillData(qrBill) {
    const missing = [];
    if (!`${qrBill?.iban || ''}`.trim()) missing.push('iban');
    if (qrBill?.amount == null || Number(qrBill.amount) <= 0) missing.push('amount');
    if (!`${qrBill?.reference || ''}`.trim()) missing.push('reference');
    if (missing.length) {
      throw new Error(`QR-bill data is required for invoice documents: ${missing.join(', ')}`);
    }
  }
}
