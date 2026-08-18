import mongoose from 'mongoose';

function toId(value) {
  if (!value) return null;
  return value._id || value.id || value;
}

function isObjectId(value) {
  return value && mongoose.Types.ObjectId.isValid(String(value));
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function normalizeVatBreakdown(items = []) {
  return items.map((vat) => ({
    rate: Number(vat.rate || 0),
    base: Number(vat.base || 0),
    amount: Number(vat.amount || 0),
  }));
}

function normalizeLineItems(items = []) {
  return items.map((item, index) => ({
    position: item.position || index + 1,
    type: item.type || 'service',
    articleNumber: item.articleNumber || '',
    description: item.description || '',
    unit: item.unit || 'pcs',
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.unitPrice || 0),
    discountPercent: Number(item.discountPercent || 0),
    vatRate: Number(item.vatRate || 0),
    lineTotal: Number(item.lineTotal || 0),
    image: item.image && item.image.fileId
      ? { fileId: String(item.image.fileId), url: item.image.url || '', size: item.image.size || 'medium' }
      : null,
  }));
}

function invoiceTemplateType(invoiceType) {
  if (invoiceType === 'ADVANCE') return 'invoice_advance';
  if (invoiceType === 'FINAL') return 'invoice_final';
  return 'invoice_standard';
}

async function loadCustomer(customerId) {
  const id = toId(customerId);
  if (!isObjectId(id)) return null;
  const Customer = (await import('../crm/customer.model.js')).default;
  return Customer.findById(id)
    .select('customerNumber name street addressSupplement postalCode city canton country phone mobile email')
    .lean();
}

async function loadContact(contactId) {
  const id = toId(contactId);
  if (!isObjectId(id)) return null;
  const Contact = (await import('../crm/contact.model.js')).default;
  return Contact.findById(id)
    .select('firstName lastName email phone mobile')
    .lean();
}

async function loadProject(projectId) {
  const id = toId(projectId);
  if (!isObjectId(id)) return null;
  const Project = (await import('../pm/project.model.js')).default;
  return Project.findById(id)
    .select('projectNumber name')
    .lean();
}

// Object-level billing address (Rechnungsadresse) for an invoice — feedback #10.
// Resolves Invoice → project.siteId → Site.billingAddress. Only returned when it
// carries a real street, so an incomplete block never replaces the customer address.
async function loadSiteBillingAddress(projectId) {
  const id = toId(projectId);
  if (!isObjectId(id)) return null;
  const Project = (await import('../pm/project.model.js')).default;
  const project = await Project.findById(id).select('siteId').lean();
  const siteId = toId(project?.siteId);
  if (!isObjectId(siteId)) return null;
  const Site = (await import('../crm/site.model.js')).default;
  const site = await Site.findById(siteId).select('billingAddress').lean();
  const billing = site?.billingAddress;
  return billing && billing.street ? billing : null;
}

// Object address (Objektadresse) for the document filename convention.
// Returns "Street, City" (without PLZ) or null. Prefers the document's own
// siteId (Objekt-first flow) and falls back to the project's site.
async function loadSiteAddress(projectId, directSiteId = null) {
  let siteId = toId(directSiteId);
  if (!isObjectId(siteId)) {
    const id = toId(projectId);
    if (!isObjectId(id)) return null;
    const Project = (await import('../pm/project.model.js')).default;
    const project = await Project.findById(id).select('siteId').lean();
    siteId = toId(project?.siteId);
  }
  if (!isObjectId(siteId)) return null;
  const Site = (await import('../crm/site.model.js')).default;
  const site = await Site.findById(siteId).select('street city').lean();
  if (!site?.street) return null;
  return [site.street, site.city].filter(Boolean).join(', ');
}

// The party chosen on the document (billingAddressSource) resolved from its
// site: the Objekt's billing address, its owner or its property management.
// Returns null for 'customer' (default) or when the party carries no street,
// so an empty block never replaces the customer address.
async function loadChosenSiteParty(siteId, source) {
  const id = toId(siteId);
  if (!isObjectId(id) || !source || source === 'customer') return null;
  const fieldBySource = {
    site_billing: 'billingAddress',
    site_ownership: 'ownership',
    site_management: 'management',
  };
  const field = fieldBySource[source];
  if (!field) return null;
  const Site = (await import('../crm/site.model.js')).default;
  const site = await Site.findById(id).select(field).lean();
  const party = site?.[field];
  return party && party.street ? party : null;
}

function buildCustomerBlock(document, customer, contact, billing = null) {
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(' ')
    : '';
  const email = contact?.email || customer?.email || null;
  const phone = contact?.mobile || contact?.phone || customer?.mobile || customer?.phone || null;

  // When the object carries a billing address (Rechnungsadresse), it becomes the
  // printed recipient + QR-bill debtor. Otherwise everything stays on the customer
  // address (unchanged behaviour). `qrAddress` keeps the street for the QR-bill so
  // the c/o line never lands in the payment slip's address field.
  const useBilling = !!(billing && billing.street);
  const recipientName = (useBilling && billing.name) || document.customerName || customer?.name || '';
  const hasSupplement = !useBilling && !!customer?.addressSupplement;
  const addressLine1 = useBilling
    ? (billing.careOf ? `c/o ${billing.careOf}` : (billing.street || ''))
    : (hasSupplement ? customer.addressSupplement : (customer?.street || ''));
  const addressLine2 = useBilling
    ? (billing.careOf ? (billing.street || '') : '')
    : (hasSupplement ? (customer?.street || '') : '');
  const plz = useBilling ? (billing.postalCode || '') : (customer?.postalCode || '');
  const city = useBilling ? (billing.city || '') : (customer?.city || '');

  return {
    customer: {
      number: customer?.customerNumber || '',
      name: recipientName,
      contactName,
      addressLine1,
      addressLine2,
      plz,
      city,
      country: customer?.country || 'CH',
      email,
      phone,
      ...(useBilling ? { qrAddress: billing.street || '' } : {}),
      ...(hasSupplement ? { qrAddress: customer.street || '' } : {}),
    },
    customerEmail: email,
    customerPhone: phone,
    contactName,
  };
}

function buildBaseData({ document, customer, contact, project, templateType, documentNumber, documentDate, billing = null, objectAddress = null }) {
  const customerBlock = buildCustomerBlock(document, customer, contact, billing);
  const projectName = project?.name || document.projectName || '';
  const customerId = toId(document.customerId || customer);
  const projectId = toId(document.projectId || project);
  const departmentId = toId(document.departmentId);

  return {
    templateType,
    documentNumber,
    documentDate,
    customerId,
    projectId,
    departmentId,
    sourceCustomerId: customerId,
    sourceProjectId: projectId,
    sourceDepartmentId: departmentId,
    customerName: document.customerName || customer?.name || '',
    ...customerBlock,
    project: project ? {
      _id: project._id,
      projectNumber: project.projectNumber,
      name: project.name,
    } : null,
    projectName,
    objectAddress: objectAddress || null,
    reference: project?.projectNumber || document.sourceQuotationNumber || '',
    title: document.title || '',
    language: document.language || 'de',
    currency: document.currency || 'CHF',
    lineItems: normalizeLineItems(document.lineItems || []),
    subtotal: Number(document.subtotal || 0),
    vatBreakdown: normalizeVatBreakdown(document.vatBreakdown || []),
    grandTotal: Number(document.grandTotal || 0),
    grandTotalRounded: Number(document.grandTotalRounded ?? document.amountDue ?? document.grandTotal ?? 0),
    paymentTerms: document.paymentTerms || document.paymentTermsText || '',
    notes: document.notes || '',
    termsAndConditions: document.termsAndConditions || '',
    metadata: {
      customerName: document.customerName || customer?.name || '',
      projectName,
      documentNumber,
      templateType,
      sourceCustomerId: customerId,
      sourceProjectId: projectId,
      sourceDepartmentId: departmentId,
    },
  };
}

class QopDocumentPayloadService {
  async buildQuotationPayload(quotationOrId) {
    const quotation = await this._resolveDocument('quotation', quotationOrId);
    if (!quotation) throw new Error(`Quotation not found: ${quotationOrId}`);
    const [customer, contact, project, objectAddress, billing] = await Promise.all([
      loadCustomer(quotation.customerId),
      loadContact(quotation.contactId),
      loadProject(quotation.projectId),
      loadSiteAddress(quotation.projectId, quotation.siteId),
      loadChosenSiteParty(quotation.siteId, quotation.billingAddressSource),
    ]);

    const data = {
      ...buildBaseData({
        document: quotation,
        customer,
        contact,
        project,
        templateType: 'quotation',
        documentNumber: quotation.quotationNumber,
        documentDate: formatDate(quotation.createdAt || quotation.validFrom),
        billing,
        objectAddress,
      }),
      salutation: quotation.salutation || '',
      introduction: quotation.introduction || '',
      validUntil: formatDate(quotation.validUntil),
      subsidyAmount: Number(quotation.subsidyAmount || 0),
      subsidyNote: quotation.subsidyNote || '',
      clientSideWorks: quotation.clientSideWorks || '',
    };

    return {
      templateType: 'quotation',
      sourceModule: 'qop',
      sourceRecordId: toId(quotation),
      language: quotation.language || 'de',
      data,
      recipient: {
        email: data.customerEmail,
        phone: data.customerPhone,
        name: data.contactName || data.customerName,
      },
    };
  }

  async buildOrderPayload(orderOrId) {
    const order = await this._resolveDocument('order', orderOrId);
    if (!order) throw new Error(`Order not found: ${orderOrId}`);
    const [customer, contact, project, objectAddress, billing] = await Promise.all([
      loadCustomer(order.customerId),
      loadContact(order.contactId),
      loadProject(order.projectId),
      loadSiteAddress(order.projectId, order.siteId),
      loadChosenSiteParty(order.siteId, order.billingAddressSource),
    ]);

    const data = {
      ...buildBaseData({
        document: order,
        customer,
        contact,
        project,
        templateType: 'order_confirmation',
        documentNumber: order.orderNumber,
        documentDate: formatDate(order.createdAt),
        billing,
        objectAddress,
      }),
      sourceQuotationNumber: order.sourceQuotationNumber || '',
      requestedDate: formatDate(order.requestedDate),
      specialInstructions: order.specialInstructions || '',
    };

    return {
      templateType: 'order_confirmation',
      sourceModule: 'qop',
      sourceRecordId: toId(order),
      language: order.language || 'de',
      data,
      recipient: {
        email: data.customerEmail,
        phone: data.customerPhone,
        name: data.contactName || data.customerName,
      },
    };
  }

  async buildInvoicePayload(invoiceOrId) {
    const invoice = await this._resolveDocument('invoice', invoiceOrId);
    if (!invoice) throw new Error(`Invoice not found: ${invoiceOrId}`);
    const [customer, contact, project, chosenParty, projectBilling, objectAddress] = await Promise.all([
      loadCustomer(invoice.customerId),
      loadContact(invoice.contactId),
      loadProject(invoice.projectId),
      loadChosenSiteParty(invoice.siteId, invoice.billingAddressSource),
      loadSiteBillingAddress(invoice.projectId),
      loadSiteAddress(invoice.projectId, invoice.siteId),
    ]);
    // The party explicitly chosen on the document wins. Documents carrying
    // their own siteId made an explicit choice (even 'customer'), so the
    // project-route fallback only applies to older records without one.
    const billing = chosenParty || (toId(invoice.siteId) ? null : projectBilling);
    const templateType = invoiceTemplateType(invoice.invoiceType);
    const advanceDeductions = (invoice.advanceDeductions || []).map((deduction) => ({
      invoiceNumber: deduction.advanceInvoiceNumber,
      date: formatDate(deduction.advanceInvoiceDate),
      netAmount: Number(deduction.netAmount || 0),
      vatAmount: Number(deduction.vatAmount || 0),
      totalAmount: Number(deduction.totalAmount || 0),
      amount: Number(deduction.totalAmount || 0),
    }));

    const data = {
      ...buildBaseData({
        document: invoice,
        customer,
        contact,
        project,
        templateType,
        documentNumber: invoice.invoiceNumber,
        documentDate: formatDate(invoice.invoiceDate || invoice.createdAt),
        billing,
        objectAddress,
      }),
      invoiceType: templateType,
      dueDate: formatDate(invoice.dueDate),
      paymentTermsDays: invoice.paymentTermsDays || 0,
      amountDue: Number(invoice.amountDue || 0),
      amountPaid: Number(invoice.amountPaid || 0),
      advanceDeductions,
      netBalance: invoice.invoiceType === 'FINAL'
        ? Number(invoice.netSubtotal || invoice.amountDue || 0)
        : null,
    };

    return {
      templateType,
      sourceModule: 'qop',
      sourceRecordId: toId(invoice),
      language: invoice.language || 'de',
      data,
      recipient: {
        email: data.customerEmail,
        phone: data.customerPhone,
        name: data.contactName || data.customerName,
      },
    };
  }

  async buildPayload(documentType, documentOrId) {
    if (documentType === 'quotation') return this.buildQuotationPayload(documentOrId);
    if (documentType === 'order') return this.buildOrderPayload(documentOrId);
    if (documentType === 'invoice') return this.buildInvoicePayload(documentOrId);
    throw new Error(`Unsupported QOP document type: ${documentType}`);
  }

  async generateDocument({ documentType, documentOrId, generatedBy, meta = {} }) {
    const payload = await this.buildPayload(documentType, documentOrId);
    const { default: documentGenerationService } = await import('../doctpl/documentGeneration.service.js');
    const generatedDocument = await documentGenerationService.generate({
      templateType: payload.templateType,
      sourceModule: payload.sourceModule,
      sourceRecordId: payload.sourceRecordId,
      data: payload.data,
      language: payload.language,
      generatedBy,
      meta,
    });

    const { default: fileService } = await import('../files/file.service.js');
    let downloadUrl = null;
    try {
      downloadUrl = await fileService.getDownloadUrl(generatedDocument.fileId);
    } catch {
      downloadUrl = null;
    }

    return {
      document: generatedDocument,
      documentId: generatedDocument._id,
      fileId: generatedDocument.fileId,
      fileName: generatedDocument.fileName,
      downloadUrl,
    };
  }

  async _resolveDocument(documentType, documentOrId) {
    if (documentOrId && typeof documentOrId === 'object') return documentOrId;
    if (documentType === 'quotation') {
      const { default: quotationRepository } = await import('./quotation.repository.js');
      return quotationRepository.findById(documentOrId);
    }
    if (documentType === 'order') {
      const { default: orderRepository } = await import('./order.repository.js');
      return orderRepository.findById(documentOrId);
    }
    if (documentType === 'invoice') {
      const { default: invoiceRepository } = await import('./invoice.repository.js');
      return invoiceRepository.findById(documentOrId);
    }
    return null;
  }
}

const qopDocumentPayloadService = new QopDocumentPayloadService();
export default qopDocumentPayloadService;
