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
    const logoSource = ciConfig?.logoBuffer;
    if (logoSource) {
      doc.image(logoSource, left, y, {
        width: Math.min(Number(ciConfig?.logo?.width || 120), width * 0.4),
        height: 30,
        fit: [width * 0.4, 30],
      });
    }

    // Company block (top-right)
    const ci = ciConfig?.companyDetails || {};
    doc.save().font(fonts.body).fontSize(8).fillColor(colors.primary);
    const companyLines = [
      ciConfig?.companyName || 'MB Boiler & Heizung AG',
      ci.address?.street || '',
      `${ci.address?.zip || ''} ${ci.address?.city || ''}`.trim(),
      ci.phone || '',
      ci.email || '',
    ].filter(Boolean);
    let compY = y;
    for (const line of companyLines) {
      doc.text(line, left + width * 0.55, compY, { width: width * 0.45, align: 'right' });
      compY += 11;
    }
    doc.restore();

    // Customer address window: DIN 5008 position (27mm from top, 20mm from left)
    const addrY = 27 * MM_TO_PT;
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
    doc.save().font(fonts.bold).fontSize(14).fillColor(colors.primary);
    doc.text(title, left + width * 0.55, addrY, { width: width * 0.45, align: 'right' });
    doc.restore();

    doc.save().font(fonts.body).fontSize(9).fillColor(colors.text);
    let metaY = addrY + 22;
    if (data.documentNumber) { doc.text(`${t(language, 'documentNumber')}: ${data.documentNumber}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.documentDate)   { doc.text(`${t(language, 'date')}: ${data.documentDate}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.validUntil)     { doc.text(`${t(language,'validUntil')}: ${data.validUntil}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.dueDate)        { doc.text(`${t(language,'dueDate')}: ${data.dueDate}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.reference)      { doc.text(`${t(language, 'reference')}: ${data.reference}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    doc.restore();

    const newY = Math.max(addrY + 60, metaY) + 10;
    pm.setY(newY);
  }
}
