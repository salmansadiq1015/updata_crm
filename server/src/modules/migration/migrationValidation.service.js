import {
  compactString,
  normalizeEmail,
  toDateOrNull,
  toNumber,
} from './migration.utils.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issue(severity, errorType, errorField, errorMessage, sourceValue = null, suggestedFix = '') {
  return { severity, errorType, errorField, errorMessage, sourceValue, suggestedFix };
}

class MigrationValidationService {
  validate(domain, payload) {
    const method = this[`validate_${domain}`];
    if (!method) {
      return [issue('error', 'validation_failed', 'domain', `Unsupported migration domain: ${domain}`)];
    }
    return method.call(this, payload);
  }

  validate_addresses_of(payload) {
    const issues = this.validateAddress(payload);
    if (!compactString(payload.company || payload.name || payload.firma || payload.displayName)) {
      issues.push(issue('error', 'validation_failed', 'name', 'Address record has no customer name', null, 'Provide company, name or firma'));
    }
    return issues;
  }

  validate_addresses_messerli(payload) {
    const issues = this.validateAddress(payload);
    if (!compactString(payload.company || payload.name || payload.firma || payload.contactName || payload.kontakt)) {
      issues.push(issue('error', 'validation_failed', 'name', 'Messerli contact has no usable name', null, 'Provide company, name or contactName'));
    }
    return issues;
  }

  validate_plants(payload) {
    const issues = [];
    if (!compactString(payload.customer_source_id || payload.adr_id || payload.customerId || payload.kunden_id)) {
      issues.push(issue('error', 'ref_integrity', 'customer_source_id', 'Plant has no source customer reference', null, 'Provide adr_id or customer_source_id'));
    }
    if (!compactString(payload.type || payload.anlage_typ || payload.category)) {
      issues.push(issue('warning', 'mapping_error', 'type', 'Plant type missing; imported as other', null, 'Provide plant type for precise mapping'));
    }
    return issues;
  }

  validate_quotations(payload) {
    const issues = this.validateFinancialDocument(payload, 'quotation');
    if (!toDateOrNull(payload.validUntil || payload.gueltig_bis)) {
      issues.push(issue('warning', 'format_error', 'validUntil', 'Quotation validity date missing; defaulting to 30 days', null, 'Provide validUntil'));
    }
    return issues;
  }

  validate_invoices(payload) {
    const issues = this.validateFinancialDocument(payload, 'invoice');
    if (!toDateOrNull(payload.dueDate || payload.faellig_am)) {
      issues.push(issue('warning', 'format_error', 'dueDate', 'Invoice due date missing; defaulting to invoice date + 30 days', null, 'Provide dueDate'));
    }
    return issues;
  }

  validateAddress(payload) {
    const issues = [];
    const email = normalizeEmail(payload.email || payload.e_mail);
    if (email && !EMAIL_RE.test(email)) {
      issues.push(issue('warning', 'format_error', 'email', 'Email format is invalid and will be skipped', email, 'Correct email address'));
    }
    if (!compactString(payload.street || payload.strasse || payload.address || payload.adresse)) {
      issues.push(issue('info', 'validation_failed', 'street', 'Street is missing', null, 'Spot-check address quality'));
    }
    return issues;
  }

  validateFinancialDocument(payload, label) {
    const issues = [];
    if (!compactString(payload.customer_source_id || payload.adr_id || payload.customerId || payload.kunden_id)) {
      issues.push(issue('error', 'ref_integrity', 'customer_source_id', `${label} has no source customer reference`, null, 'Provide adr_id or customer_source_id'));
    }

    const sourceTotal = toNumber(payload.total || payload.grandTotal || payload.betrag_total, null);
    const lines = Array.isArray(payload.lineItems || payload.positions)
      ? payload.lineItems || payload.positions
      : [];
    if (!lines.length && sourceTotal === null) {
      issues.push(issue('warning', 'financial_mismatch', 'lineItems', `${label} has no lines and no source total`, null, 'Provide line positions or total'));
    }
    return issues;
  }

  hasBlockingErrors(issues) {
    return issues.some((item) => item.severity === 'error');
  }
}

const migrationValidationService = new MigrationValidationService();
export default migrationValidationService;
