import { t } from '../i18n.js';
import { pdfColors } from './colors.js';
import { pdfFonts } from './fonts.js';

const MM_TO_PT = 2.83465;

const DOC_TITLES = {
  quotation: { de:'Offerte', fr:'Offre', it:'Offerta', en:'Quotation' },
  order_confirmation: { de:'Auftragsbestätigung', fr:'Confirmation de commande', it:"Conferma d'ordine", en:'Order Confirmation' },
  invoice_standard: { de:'Rechnung', fr:'Facture', it:'Fattura', en:'Invoice' },
  invoice_advance: { de:'Akontorechnung', fr:"Facture d'acompte", it:"Fattura d'acconto", en:'Advance Invoice' },
  invoice_final: { de:'Schlussrechnung', fr:'Facture finale', it:'Fattura finale', en:'Final Invoice' },
  cover_letter: { de:'Begleitschreiben', fr:"Lettre d'accompagnement", it:"Lettera d'accompagnamento", en:'Cover Letter' },
  service_report: { de:'Servicebericht', fr:'Rapport de service', it:'Rapporto di servizio', en:'Service Report' },
  inspection_certificate: { de:'Inspektionszertifikat', fr:"Certificat d'inspection", it:"Certificato d'ispezione", en:'Inspection Certificate' },
  project_appointment_confirmation: { de:'Terminbestätigung', fr:'Confirmation de rendez-vous', it:'Conferma di appuntamento', en:'Appointment Confirmation' },
  project_status_report: { de:'Projekt-Statusbericht', fr:"Rapport d'état du projet", it:'Rapporto sullo stato del progetto', en:'Project Status Report' },
  project_completion_certificate: { de:'Abnahmeprotokoll', fr:'Procès-verbal de réception', it:'Verbale di collaudo', en:'Completion Certificate' },
};

export default class HeaderRenderer {
  draw(doc, pm, ciConfig, data, language, config = {}) {
    const left = pm.margins.left;
    const width = pm.contentWidth;
    let y = pm.margins.top;
    const colors = pdfColors(ciConfig);
    const fonts = pdfFonts(ciConfig);

    // Logo (top-left) — skip gracefully if path missing/invalid
    const LOGO_HEIGHT = 30;
    const logoSource = ciConfig?.logoBuffer;
    if (logoSource) {
      doc.image(logoSource, left, y, {
        width: Math.min(Number(ciConfig?.logo?.width || 120), width * 0.4),
        height: LOGO_HEIGHT,
        fit: [width * 0.4, LOGO_HEIGHT],
      });
    }

    // Company block, right column, starting below the logo. It used to start at
    // the very top like the logo, ran five lines down, and the document title
    // was then drawn into the middle of it — both live in the same right column.
    const COMPANY_LINE_HEIGHT = 11;
    const ci = ciConfig?.companyDetails || {};
    doc.save().font(fonts.body).fontSize(8).fillColor(colors.primary);
    const companyLines = [
      ciConfig?.companyName || 'Updata',
      ci.address?.street || '',
      `${ci.address?.zip || ''} ${ci.address?.city || ''}`.trim(),
      ci.phone || '',
      ci.email || '',
    ].filter(Boolean);
    let compY = logoSource ? y + LOGO_HEIGHT + 8 : y;
    for (const line of companyLines) {
      doc.text(line, left + width * 0.55, compY, { width: width * 0.45, align: 'right' });
      compY += COMPANY_LINE_HEIGHT;
    }
    const companyBottom = compY;
    doc.restore();

    // Customer address window, DIN 5008. Form A puts it at 27mm, which is for
    // letters without a letterhead — with a logo drawn at the top-left it lands
    // underneath it. Form B (45mm) is the letterhead variant, and matches the
    // 45mm header this layout already declares.
    const addrY = (logoSource ? 45 : 27) * MM_TO_PT;
    if (data.customer) {
      doc.save().font(fonts.body).fontSize(9).fillColor(colors.text);
      const cust = data.customer;
      const addrLines = [
        cust.name,
        cust.addressLine1,
        cust.addressLine2,
        `${cust.plz || cust.zip || ''} ${cust.city || ''}`.trim(),
        cust.country,
      ].filter(Boolean);
      let ay = addrY;
      for (const line of addrLines) {
        doc.text(line, left, ay, { width: 85 * MM_TO_PT });
        ay += 12;
      }
      doc.restore();
    }

    // Document title + meta (right column)
    const templateType = data.templateType || config.templateType || 'quotation';
    const titleKey = `title.${templateType}`;
    const translatedTitle = t(language, titleKey);
    const title = translatedTitle === titleKey
      ? DOC_TITLES[templateType]?.[language] || DOC_TITLES[templateType]?.de || templateType
      : translatedTitle;
    // Keep the title clear of the company block above it; the address window on
    // the left keeps its DIN 5008 position regardless.
    const titleY = Math.max(addrY, companyBottom + 14);
    doc.save().font(fonts.bold).fontSize(14).fillColor(colors.primary);
    doc.text(title, left + width * 0.55, titleY, { width: width * 0.45, align: 'right' });
    doc.restore();

    doc.save().font(fonts.body).fontSize(9).fillColor(colors.text);
    let metaY = titleY + 22;
    if (data.documentNumber) { doc.text(`${t(language, 'documentNumber')}: ${data.documentNumber}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.documentDate)   { doc.text(`${t(language, 'date')}: ${data.documentDate}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.validUntil)     { doc.text(`${t(language,'validUntil')}: ${data.validUntil}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.dueDate)        { doc.text(`${t(language,'dueDate')}: ${data.dueDate}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.sourceQuotationRef) { doc.text(`${t(language, 'sourceQuotation')}: ${data.sourceQuotationRef}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.reference)      { doc.text(`${t(language, 'reference')}: ${data.reference}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    doc.restore();

    // Requested delivery date is shown prominently (bold, primary colour) for order confirmations.
    if (data.requestedDeliveryDate) {
      doc.save().font(fonts.bold).fontSize(10).fillColor(colors.primary);
      doc.text(`${t(language, 'requestedDeliveryDate')}: ${data.requestedDeliveryDate}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' });
      doc.restore();
      metaY += 14;
    }

    const headerHeight = Number(config.layout?.headerHeight ?? 45) * MM_TO_PT;
    const newY = Math.max(addrY + 60, metaY, pm.margins.top + headerHeight) + 10;
    pm.setY(newY);
  }
}
