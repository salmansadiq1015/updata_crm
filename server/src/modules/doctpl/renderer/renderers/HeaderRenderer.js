import { t } from '../i18n.js';

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

    // Logo (top-left) — skip gracefully if path missing/invalid
    if (ciConfig?.logoPath) {
      try { doc.image(ciConfig.logoPath, left, y, { height: 30 }); } catch {}
    }

    // Company block (top-right)
    const ci = ciConfig?.companyDetails || {};
    doc.save().fontSize(8).fillColor('#1B3F8B');
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
      doc.save().fontSize(9).fillColor('#1A1A1A');
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
    const title = DOC_TITLES[templateType]?.[language] || DOC_TITLES[templateType]?.de || templateType;
    doc.save().fontSize(14).fillColor('#1B3F8B').font('Helvetica-Bold');
    doc.text(title, left + width * 0.55, addrY, { width: width * 0.45, align: 'right' });
    doc.restore();

    doc.save().fontSize(9).fillColor('#1A1A1A');
    let metaY = addrY + 22;
    if (data.documentNumber) { doc.text(`Nr: ${data.documentNumber}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.documentDate)   { doc.text(`Datum: ${data.documentDate}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.validUntil)     { doc.text(`${t(language,'validUntil')}: ${data.validUntil}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.dueDate)        { doc.text(`${t(language,'dueDate')}: ${data.dueDate}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    if (data.reference)      { doc.text(`Ref: ${data.reference}`, left + width * 0.55, metaY, { width: width * 0.45, align: 'right' }); metaY += 13; }
    doc.restore();

    const newY = Math.max(addrY + 60, metaY) + 10;
    pm.setY(newY);
  }
}
