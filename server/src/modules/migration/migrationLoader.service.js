import Customer from '../crm/customer.model.js';
import Contact from '../crm/contact.model.js';
import Site from '../crm/site.model.js';
import Installation from '../crm/installation.model.js';
import Quotation from '../qop/quotation.model.js';
import Invoice from '../qop/invoice.model.js';
import counterService from '../crm/counter.service.js';
import { calculateTotals } from '../qop/vatCalculation.js';
import migrationRepository from './migration.repository.js';
import {
  DOMAIN_SOURCE_SYSTEM,
  DOMAIN_SOURCE_TABLE,
  TARGET_TABLES,
} from './migration.constants.js';
import {
  buildAddress,
  compactString,
  getSourceId,
  migrationStamp,
  normalizeEmail,
  normalizeLineItems,
  normalizePhone,
  splitName,
  toDateOrNull,
  toNumber,
  toObjectId,
} from './migration.utils.js';

const CUSTOMER_DOMAINS = ['addresses_of', 'addresses_messerli'];

const INSTALLATION_TYPE_MAP = {
  boiler: 'boiler',
  kessel: 'boiler',
  heat_pump: 'heat_pump',
  waermepumpe: 'heat_pump',
  solar: 'solar_thermal',
  ventilation: 'ventilation',
  lueftung: 'ventilation',
  radiator: 'radiator_system',
  warmwasser: 'hot_water',
};

function sourceContext(domain, payload, index) {
  return {
    sourceSystem: DOMAIN_SOURCE_SYSTEM[domain],
    sourceTable: DOMAIN_SOURCE_TABLE[domain],
    sourceId: getSourceId(payload, domain, index),
  };
}

function mapInstallationType(value) {
  const key = compactString(value, 80)?.toLowerCase().replace(/\s+/g, '_');
  return INSTALLATION_TYPE_MAP[key] || 'other';
}

function mapFuelType(value) {
  const key = compactString(value, 80)?.toLowerCase();
  if (['gas', 'oil', 'electric', 'pellet'].includes(key)) return key;
  if (key === 'oel' || key === 'öl') return 'oil';
  if (key === 'strom') return 'electric';
  return key ? 'other' : null;
}

function mapSiteType(value) {
  const key = compactString(value, 80)?.toLowerCase();
  if (['commercial', 'industrial', 'residential'].includes(key)) return key;
  if (['gewerbe', 'business'].includes(key)) return 'commercial';
  if (['industrie'].includes(key)) return 'industrial';
  return 'residential';
}

function mapInvoiceType(value) {
  const key = compactString(value, 80)?.toLowerCase();
  const map = {
    standard: 'STANDARD',
    advance: 'ADVANCE',
    akonto: 'ADVANCE',
    final: 'FINAL',
    schlussrechnung: 'FINAL',
    credit_note: 'CREDIT_NOTE',
    gutschrift: 'CREDIT_NOTE',
  };
  return map[key] || 'STANDARD';
}

function mapQuotationStatus(value) {
  const key = compactString(value, 80)?.toLowerCase();
  const map = {
    draft: 'DRAFT',
    offen: 'SENT',
    sent: 'SENT',
    viewed: 'VIEWED',
    accepted: 'ACCEPTED',
    angenommen: 'ACCEPTED',
    declined: 'DECLINED',
    abgelehnt: 'DECLINED',
    expired: 'EXPIRED',
    cancelled: 'CANCELLED',
    storniert: 'CANCELLED',
    converted: 'CONVERTED',
  };
  return map[key] || 'SENT';
}

function mapInvoiceStatus(payload) {
  const key = compactString(payload.status || payload.zahlstatus, 80)?.toLowerCase();
  if (['paid', 'bezahlt'].includes(key)) return 'PAID';
  if (['partial', 'teilbezahlt', 'partially_paid'].includes(key)) return 'PARTIALLY_PAID';
  if (['cancelled', 'storniert'].includes(key)) return 'CANCELLED';
  if (['written_off', 'abgeschrieben'].includes(key)) return 'WRITTEN_OFF';
  const dueDate = toDateOrNull(payload.dueDate || payload.faellig_am);
  if (dueDate && dueDate < new Date()) return 'OVERDUE';
  return 'SENT';
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function totalsFromPayload(payload, fallbackDescription) {
  const currency = compactString(payload.currency || payload.waehrung, 3) || 'CHF';
  const lineItems = normalizeLineItems(payload.lineItems || payload.positions, fallbackDescription);
  const totals = calculateTotals(lineItems, toNumber(payload.globalDiscountPercent || payload.rabatt_total, 0), currency);
  const sourceTotal = toNumber(payload.total || payload.grandTotal || payload.betrag_total, null);
  const mismatch = sourceTotal !== null && Math.abs(totals.grandTotalRounded - sourceTotal) > 0.05;
  return { currency, ...totals, sourceTotal, mismatch };
}

class MigrationLoaderService {
  async load(domain, run, sourceRecord, index) {
    if (run.runType === 'dry_run') {
      return { action: 'skipped', target: null, targetTable: null, issues: [] };
    }

    const payload = sourceRecord.payload || {};
    const method = this[`load_${domain}`];
    if (!method) throw new Error(`Unsupported migration domain: ${domain}`);
    return method.call(this, run, payload, index);
  }

  async load_addresses_of(run, payload, index) {
    return this.upsertCustomerWithOptionalContact('addresses_of', run, payload, index);
  }

  async load_addresses_messerli(run, payload, index) {
    return this.upsertCustomerWithOptionalContact('addresses_messerli', run, payload, index);
  }

  async upsertCustomerWithOptionalContact(domain, run, payload, index) {
    const ctx = sourceContext(domain, payload, index);
    const mapped = await migrationRepository.findRecordMap(
      ctx.sourceSystem,
      ctx.sourceTable,
      ctx.sourceId,
      TARGET_TABLES.customers,
    );

    const email = normalizeEmail(payload.email || payload.e_mail);
    const phone = normalizePhone(payload.phone || payload.telefon);
    const mobile = normalizePhone(payload.mobile || payload.mobil);
    const address = buildAddress(payload);
    const displayName = compactString(payload.company || payload.name || payload.firma || payload.displayName || payload.contactName || payload.kontakt, 255);
    const type = payload.type === 'private' || payload.customerType === 'private' ? 'private' : 'business';
    const existing = mapped
      ? await Customer.findById(mapped.targetId)
      : await this.findCustomerDuplicate(displayName, email, phone, address.postalCode);

    const customerData = {
      name: displayName,
      type,
      ...address,
      phone,
      mobile,
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      notes: compactString(payload.notes || payload.bemerkung, 5000),
      createdBy: run.createdBy,
      migration: migrationStamp(run, ctx.sourceSystem, ctx.sourceId),
    };

    let customer = existing;
    let action = existing ? 'merged' : 'created';
    if (customer) {
      customer.set(Object.fromEntries(Object.entries(customerData).filter(([, value]) => value !== null && value !== undefined)));
      await customer.save();
    } else {
      customer = await Customer.create({
        ...customerData,
        customerNumber: compactString(payload.customerNumber || payload.kunden_nr, 50) || await counterService.getNextCustomerNumber(),
      });
    }

    await migrationRepository.upsertRecordMap({
      runId: run._id,
      domain,
      ...ctx,
      targetTable: TARGET_TABLES.customers,
      targetId: customer._id,
      action,
    });

    const contactName = compactString(payload.contactName || payload.kontakt || payload.person, 255);
    if (contactName || type === 'private') {
      await this.upsertContact(domain, run, payload, ctx, customer, contactName || displayName);
    }

    return {
      action,
      target: customer,
      targetTable: TARGET_TABLES.customers,
      issues: action === 'merged' ? [{ severity: 'info', errorType: 'duplicate', errorField: 'customer', errorMessage: 'Customer merged with existing CRM record' }] : [],
    };
  }

  async upsertContact(domain, run, payload, ctx, customer, contactName) {
    const { firstName, lastName } = splitName(contactName);
    if (!firstName || !lastName) return null;

    const email = normalizeEmail(payload.contactEmail || payload.email || payload.e_mail);
    const existing = email
      ? await Contact.findOne({ customerId: customer._id, email })
      : await Contact.findOne({ customerId: customer._id, firstName, lastName });

    const contactData = {
      customerId: customer._id,
      firstName,
      lastName,
      functionTitle: compactString(payload.functionTitle || payload.funktion, 100),
      phone: normalizePhone(payload.contactPhone || payload.phone || payload.telefon),
      mobile: normalizePhone(payload.contactMobile || payload.mobile || payload.mobil),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      isPrimary: Boolean(payload.isPrimary || payload.hauptkontakt),
      notes: compactString(payload.contactNotes || payload.notes, 2000),
      migration: migrationStamp(run, ctx.sourceSystem, ctx.sourceId),
    };

    const contact = existing || new Contact(contactData);
    contact.set(contactData);
    await contact.save();

    await migrationRepository.upsertRecordMap({
      runId: run._id,
      domain,
      ...ctx,
      targetTable: TARGET_TABLES.contacts,
      targetId: contact._id,
      action: existing ? 'updated' : 'created',
    });
    return contact;
  }

  async load_plants(run, payload, index) {
    const ctx = sourceContext('plants', payload, index);
    const customer = await this.resolveCustomer(payload);
    if (!customer) throw new Error('Customer reference could not be resolved for plant');

    const site = await this.upsertSite(run, payload, ctx, customer);
    const mapped = await migrationRepository.findRecordMap(ctx.sourceSystem, ctx.sourceTable, ctx.sourceId, TARGET_TABLES.installations);
    const existing = mapped ? await Installation.findById(mapped.targetId) : null;
    const installationData = {
      siteId: site._id,
      type: mapInstallationType(payload.type || payload.anlage_typ || payload.category),
      manufacturer: compactString(payload.manufacturer || payload.hersteller, 100),
      model: compactString(payload.model || payload.modell, 100),
      serialNumber: compactString(payload.serialNumber || payload.serien_nr || payload.serial, 100),
      commissioningDate: toDateOrNull(payload.commissioningDate || payload.inbetriebnahme),
      warrantyEndDate: toDateOrNull(payload.warrantyEndDate || payload.garantie_bis),
      powerOutputKw: toNumber(payload.powerOutputKw || payload.leistung_kw, null),
      fuelType: mapFuelType(payload.fuelType || payload.brennstoff),
      yearOfManufacture: toNumber(payload.yearOfManufacture || payload.baujahr, null),
      technicalNotes: compactString(payload.technicalNotes || payload.notes || payload.bemerkung, 5000),
      status: payload.status === 'decommissioned' || payload.ausser_betrieb ? 'decommissioned' : 'active',
      createdBy: run.createdBy,
      migration: migrationStamp(run, ctx.sourceSystem, ctx.sourceId),
    };

    const installation = existing || new Installation({
      installationNumber: compactString(payload.installationNumber || payload.anlage_nr, 50) || await counterService.getNextInstallationNumber(),
    });
    installation.set(installationData);
    await installation.save();

    const action = existing ? 'updated' : 'created';
    await migrationRepository.upsertRecordMap({
      runId: run._id,
      domain: 'plants',
      ...ctx,
      targetTable: TARGET_TABLES.installations,
      targetId: installation._id,
      action,
    });

    return { action, target: installation, targetTable: TARGET_TABLES.installations, issues: [] };
  }

  async upsertSite(run, payload, ctx, customer) {
    const siteSourceId = compactString(payload.site_source_id || payload.objekt_id || payload.siteId || ctx.sourceId, 120);
    const existingMap = await migrationRepository.findRecordMap(ctx.sourceSystem, 'objekte', siteSourceId, TARGET_TABLES.sites);
    const existing = existingMap ? await Site.findById(existingMap.targetId) : null;
    const address = buildAddress(payload);
    const site = existing || new Site({
      customerId: customer._id,
      siteNumber: compactString(payload.siteNumber || payload.objekt_nr, 50) || await counterService.getNextSiteNumber(customer._id),
    });
    site.set({
      customerId: customer._id,
      name: compactString(payload.siteName || payload.objekt || payload.name, 255) || customer.name,
      ...address,
      siteType: mapSiteType(payload.siteType || payload.objekt_typ),
      accessInstructions: compactString(payload.accessInstructions || payload.zugang, 2000),
      status: payload.siteStatus === 'inactive' ? 'inactive' : 'active',
      createdBy: run.createdBy,
      migration: migrationStamp(run, ctx.sourceSystem, siteSourceId),
    });
    await site.save();
    await migrationRepository.upsertRecordMap({
      runId: run._id,
      domain: 'plants',
      sourceSystem: ctx.sourceSystem,
      sourceTable: 'objekte',
      sourceId: siteSourceId,
      targetTable: TARGET_TABLES.sites,
      targetId: site._id,
      action: existing ? 'updated' : 'created',
    });
    return site;
  }

  async load_quotations(run, payload, index) {
    const ctx = sourceContext('quotations', payload, index);
    const customer = await this.resolveCustomer(payload);
    if (!customer) throw new Error('Customer reference could not be resolved for quotation');

    const mapped = await migrationRepository.findRecordMap(ctx.sourceSystem, ctx.sourceTable, ctx.sourceId, TARGET_TABLES.quotations);
    const existing = mapped ? await Quotation.findById(mapped.targetId) : null;
    const totals = totalsFromPayload(payload, `Migrated quotation ${ctx.sourceId}`);
    const validFrom = toDateOrNull(payload.validFrom || payload.datum) || new Date();
    const quotation = existing || new Quotation({
      quotationNumber: compactString(payload.quotationNumber || payload.offert_nr || payload.offerte_nr, 50) || `MIG-Q-${ctx.sourceId}`,
    });
    quotation.set({
      customerId: customer._id,
      customerName: customer.name,
      status: mapQuotationStatus(payload.status),
      language: payload.language || 'de',
      title: compactString(payload.title || payload.betreff, 500) || `Legacy quotation ${ctx.sourceId}`,
      validFrom,
      validUntil: toDateOrNull(payload.validUntil || payload.gueltig_bis) || addDays(validFrom, 30),
      currency: totals.currency,
      lineItems: totals.lineItems,
      subtotal: totals.subtotal,
      vatBreakdown: totals.vatBreakdown,
      grandTotal: totals.grandTotal,
      roundingAmount: totals.roundingAmount,
      grandTotalRounded: totals.grandTotalRounded,
      notes: compactString(payload.notes || payload.bemerkung, 5000) || '',
      createdBy: run.createdBy,
      migration: migrationStamp(run, ctx.sourceSystem, ctx.sourceId),
    });
    await quotation.save();

    const action = existing ? 'updated' : 'created';
    await migrationRepository.upsertRecordMap({
      runId: run._id,
      domain: 'quotations',
      ...ctx,
      targetTable: TARGET_TABLES.quotations,
      targetId: quotation._id,
      action,
    });

    return {
      action,
      target: quotation,
      targetTable: TARGET_TABLES.quotations,
      issues: totals.mismatch ? [{ severity: 'warning', errorType: 'financial_mismatch', errorField: 'total', errorMessage: 'Quotation total differs from recalculated target total' }] : [],
    };
  }

  async load_invoices(run, payload, index) {
    const ctx = sourceContext('invoices', payload, index);
    const customer = await this.resolveCustomer(payload);
    if (!customer) throw new Error('Customer reference could not be resolved for invoice');

    const mapped = await migrationRepository.findRecordMap(ctx.sourceSystem, ctx.sourceTable, ctx.sourceId, TARGET_TABLES.invoices);
    const existing = mapped ? await Invoice.findById(mapped.targetId) : null;
    const totals = totalsFromPayload(payload, `Migrated invoice ${ctx.sourceId}`);
    const invoiceDate = toDateOrNull(payload.invoiceDate || payload.datum) || new Date();
    const amountPaid = toNumber(payload.amountPaid || payload.bezahlt, mapInvoiceStatus(payload) === 'PAID' ? totals.grandTotalRounded : 0);
    const invoice = existing || new Invoice({
      invoiceNumber: compactString(payload.invoiceNumber || payload.rechnung_nr || payload.rechnungs_nr, 50) || `MIG-I-${ctx.sourceId}`,
    });
    invoice.set({
      invoiceType: mapInvoiceType(payload.invoiceType || payload.rechnung_typ),
      customerId: customer._id,
      customerName: customer.name,
      language: payload.language || 'de',
      title: compactString(payload.title || payload.betreff, 500) || `Legacy invoice ${ctx.sourceId}`,
      lineItems: totals.lineItems,
      currency: totals.currency,
      subtotal: totals.subtotal,
      vatBreakdown: totals.vatBreakdown,
      grandTotal: totals.grandTotal,
      roundingAmount: totals.roundingAmount,
      grandTotalRounded: totals.grandTotalRounded,
      invoiceDate,
      dueDate: toDateOrNull(payload.dueDate || payload.faellig_am) || addDays(invoiceDate, 30),
      amountPaid,
      amountDue: Math.max(Math.round((totals.grandTotalRounded - amountPaid) * 100) / 100, 0),
      status: mapInvoiceStatus(payload),
      createdBy: run.createdBy,
      migration: migrationStamp(run, ctx.sourceSystem, ctx.sourceId),
    });
    await invoice.save();

    const action = existing ? 'updated' : 'created';
    await migrationRepository.upsertRecordMap({
      runId: run._id,
      domain: 'invoices',
      ...ctx,
      targetTable: TARGET_TABLES.invoices,
      targetId: invoice._id,
      action,
    });

    return {
      action,
      target: invoice,
      targetTable: TARGET_TABLES.invoices,
      issues: totals.mismatch ? [{ severity: 'warning', errorType: 'financial_mismatch', errorField: 'total', errorMessage: 'Invoice total differs from recalculated target total' }] : [],
    };
  }

  async findCustomerDuplicate(name, email, phone, postalCode) {
    const clauses = [];
    if (email) clauses.push({ email });
    if (phone) clauses.push({ phone });
    if (name && postalCode) clauses.push({ name, postalCode });
    if (!clauses.length) return null;
    return Customer.findOne({ $or: clauses });
  }

  async resolveCustomer(payload) {
    const directId = toObjectId(payload.customerId);
    if (directId) return Customer.findById(directId);

    const sourceId = compactString(payload.customer_source_id || payload.adr_id || payload.kunden_id, 120);
    if (!sourceId) return null;
    for (const domain of CUSTOMER_DOMAINS) {
      const map = await migrationRepository.findRecordMap(
        DOMAIN_SOURCE_SYSTEM[domain],
        DOMAIN_SOURCE_TABLE[domain],
        sourceId,
        TARGET_TABLES.customers,
      );
      if (map) return Customer.findById(map.targetId);
    }
    return null;
  }
}

const migrationLoaderService = new MigrationLoaderService();
export default migrationLoaderService;
