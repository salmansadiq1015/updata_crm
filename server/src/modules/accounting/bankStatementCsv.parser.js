import { currencyDigits } from '../../shared/data/currencies.js';
import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

// A deliberately explicit template: amounts are signed decimal numbers, dates ISO.
export function parseBankStatementCsv(buffer, account) {
  const fail = (message) => { throw new AppError(message, 400, ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED); };
  let rows;
  try {
    rows = parse(buffer, { columns: true, bom: true, skip_empty_lines: true, trim: true, max_record_size: 10000 });
  } catch { fail('Invalid CSV. Use the bank statement CSV template.'); }
  if (!rows.length || rows.length > 20000) fail('CSV must contain between 1 and 20000 transactions.');
  const transactions = rows.map((row, index) => {
    const line = index + 2;
    const date = row.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail(`Invalid ISO date on CSV line ${line}.`);
    const digits = currencyDigits(account.currency);
    const amountPattern = new RegExp(`^-?\\d+${digits ? `(\\.\\d{1,${digits}})?` : ''}$`);
    if (!amountPattern.test(row.amount || '') || !Number.isSafeInteger(Math.round(Number(row.amount) * 10 ** digits))) fail(`Invalid signed amount on CSV line ${line}.`);
    if (row.currency !== account.currency) fail(`Currency mismatch on CSV line ${line}. Expected ${account.currency}.`);
    if (!row.description || row.description.length > 1000 || (row.reference || '').length > 100 || (row.counterparty || '').length > 200) fail(`Invalid description, reference or counterparty on CSV line ${line}.`);
    return { transactionDate: new Date(date), valueDate: new Date(date), amount: Number(row.amount), currency: row.currency, bookingText: row.description, reference: row.reference || '', payerPayeeName: row.counterparty || '' };
  });
  // Canonical rows make repeat uploads independent of BOM and line endings.
  const statementId = `CSV-${createHash('sha256').update(JSON.stringify(transactions)).digest('hex').slice(0, 40)}`;
  return { statementId, accountIban: account.iban, transactions };
}
