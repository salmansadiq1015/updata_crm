import PDFDocument from 'pdfkit';
import PageManager from './PageManager.js';
import FooterRenderer from './renderers/FooterRenderer.js';
import HeaderRenderer from './renderers/HeaderRenderer.js';
import BodyRenderer from './renderers/BodyRenderer.js';
import TableRenderer from './renderers/TableRenderer.js';
import TotalsRenderer from './renderers/TotalsRenderer.js';
import QrBillRenderer from './renderers/QrBillRenderer.js';

const MM_TO_PT = 2.83465;

const DEFAULT_SECTIONS = [
  { id:'header',  name:'Header',     type:'header',  position:0,  isVisible:true, isConditional:false },
  { id:'body',    name:'Body',       type:'body',    position:1,  isVisible:true, isConditional:true, conditionField:'introduction' },
  { id:'table',   name:'Line Items', type:'table',   position:2,  isVisible:true, isConditional:false },
  { id:'totals',  name:'Totals',     type:'totals',  position:3,  isVisible:true, isConditional:false },
  { id:'footer',  name:'Footer',     type:'footer',  position:99, isVisible:true, isConditional:false },
];

export default class DocumentRenderer {
  async render(template, ciConfig, data, language = 'de') {
    const margins = template.layout?.margins || { top:25, bottom:20, left:20, right:15 };

    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top:    margins.top    * MM_TO_PT,
        bottom: margins.bottom * MM_TO_PT,
        left:   margins.left   * MM_TO_PT,
        right:  margins.right  * MM_TO_PT,
      },
      bufferPages: true,
      autoFirstPage: true,
    });

    const pm = new PageManager(doc, margins);
    const footer = new FooterRenderer(doc, pm, ciConfig, language);

    const rendererMap = {
      header:  new HeaderRenderer(),
      body:    new BodyRenderer(),
      table:   new TableRenderer(),
      totals:  new TotalsRenderer(),
      deductions: new TotalsRenderer(), // handled inside TotalsRenderer via data.advanceDeductions
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

      if (renderer.draw.constructor.name === 'AsyncFunction') {
        await renderer.draw(doc, pm, ciConfig, data, language, section.config || {});
      } else {
        renderer.draw(doc, pm, ciConfig, data, language, section.config || {});
      }
    }

    return new Promise((resolve, reject) => {
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        footer.stampPageNumbers(pm.pageCount);
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', reject);
      doc.end();
    });
  }
}
