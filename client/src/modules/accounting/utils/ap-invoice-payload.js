export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function emptyApLine() {
  return {
    description: '',
    quantity: '1',
    unit: 'pcs',
    unitPrice: '',
    vatRate: '8.1',
    accountId: '',
    costCenter: '',
    projectReference: '',
    orderReference: '',
  };
}

export function calculateApLineTotal(line) {
  return roundMoney(Number(line.quantity || 0) * Number(line.unitPrice || 0));
}

export function calculateApInvoicePreview(lines) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + calculateApLineTotal(line), 0));
  const vatTotal = roundMoney(lines.reduce((sum, line) => (
    sum + calculateApLineTotal(line) * (Number(line.vatRate || 0) / 100)
  ), 0));

  return {
    subtotal,
    vatTotal,
    total: roundMoney(subtotal + vatTotal),
  };
}

export function buildApInvoicePayload(form, lines) {
  const lineItems = lines.map((line, index) => {
    const lineTotal = calculateApLineTotal(line);
    const accountId = String(line.accountId || '').trim();
    const costCenter = String(line.costCenter || '').trim() || null;
    const projectReference = String(line.projectReference || '').trim()
      || String(form.projectReference || '').trim()
      || null;
    const orderReference = String(line.orderReference || '').trim()
      || String(form.orderReference || '').trim()
      || null;

    return {
      position: index + 1,
      description: String(line.description || '').trim(),
      quantity: Number(line.quantity || 0),
      unit: String(line.unit || '').trim() || 'pcs',
      unitPrice: Number(line.unitPrice || 0),
      vatRate: Number(line.vatRate || 0),
      accountId,
      costCenter,
      allocations: [{
        accountId,
        amount: lineTotal,
        costCenter,
        projectReference,
        orderReference,
      }],
    };
  });

  return {
    supplierId: String(form.supplierId || '').trim(),
    supplierName: String(form.supplierName || '').trim(),
    supplierIban: String(form.supplierIban || '').trim() || null,
    supplierBic: String(form.supplierBic || '').trim() || null,
    supplierInvoiceNumber: String(form.supplierInvoiceNumber || '').trim(),
    invoiceDate: form.invoiceDate,
    dueDate: form.dueDate,
    paymentTermsDays: Number(form.paymentTermsDays || 0),
    currency: form.currency,
    projectReference: String(form.projectReference || '').trim() || null,
    orderReference: String(form.orderReference || '').trim() || null,
    lineItems,
  };
}
