export default class QrBillRenderer {
  async draw(doc, pm, ciConfig, data, language) {
    const qrData = data.qrBill;
    if (!qrData?.iban) return;
    // Try swissqrbill integration; if invoice QR rendering is requested, failure
    // must stop generation so users do not send non-compliant invoices.
    // swissqrbill v4 removed the package main entry; the PDF renderer lives under the /pdf subpath.
    const swissqrbill = await import('swissqrbill/pdf');
    const SwissQRBill = swissqrbill.SwissQRBill || swissqrbill.default?.SwissQRBill || swissqrbill.default;
    if (!SwissQRBill) throw new Error('Swiss QR-bill renderer is unavailable');

    // A QR-IBAN (IID 30000-31999) requires a compliant 27-char QR reference (QRR).
    // The document reference (project/quotation number) isn't one, so derive a valid
    // QRR from its digits using swissqrbill's checksum helper.
    const account = String(qrData.iban || '').replace(/\s/g, '');
    const isQrIban = /^CH\d{2}3[01]\d{3}/.test(account);
    let reference = qrData.reference || undefined;
    if (isQrIban) {
      const { calculateQRReferenceChecksum } = await import('swissqrbill/utils');
      const seed = String(qrData.reference || account).replace(/\D/g, '').slice(-26).padStart(26, '0');
      reference = seed + calculateQRReferenceChecksum(seed);
    }

    const billData = {
      currency: qrData.currency || 'CHF',
      amount: qrData.amount,
      creditor: {
        name: ciConfig?.companyName || 'MB Boiler & Heizung AG',
        address: ciConfig?.companyDetails?.address?.street || '',
        zip: String(ciConfig?.companyDetails?.address?.zip || '3000'),
        city: ciConfig?.companyDetails?.address?.city || 'Bern',
        country: 'CH',
        account: qrData.iban,
      },
      debtor: qrData.debtor || undefined,
      reference,
      message: qrData.message || undefined,
    };

    const langMap = { de:'DE', fr:'FR', it:'IT', en:'EN' };
    const qrBill = new SwissQRBill(billData, { language: langMap[language] || 'DE' });
    if (typeof qrBill.attachTo !== 'function') {
      throw new Error('Swiss QR-bill attachTo API is unavailable');
    }
    qrBill.attachTo(doc);
  }
}
