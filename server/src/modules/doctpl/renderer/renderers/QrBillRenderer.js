export default class QrBillRenderer {
  async draw(doc, pm, ciConfig, data, language) {
    const qrData = data.qrBill;
    if (!qrData?.iban) return;
    // Try swissqrbill integration; if invoice QR rendering is requested, failure
    // must stop generation so users do not send non-compliant invoices.
    const swissqrbill = await import('swissqrbill');
    const SwissQRBill = swissqrbill.SwissQRBill || swissqrbill.default?.SwissQRBill || swissqrbill.default;
    if (!SwissQRBill) throw new Error('Swiss QR-bill renderer is unavailable');

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
      reference: qrData.reference || undefined,
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
