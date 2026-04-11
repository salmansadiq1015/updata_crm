/**
 * ISO 20022 parser for Swiss banking standards.
 * Handles camt.053 (end-of-day statements), camt.054 (intraday notifications),
 * and pain.001 (payment order generation).
 *
 * Uses simple regex/string parsing — no external XML library required
 * for the structured Swiss banking XML format.
 *
 * All methods are pure functions (stateless, testable).
 */

/**
 * Extract text content between XML tags.
 * @param {string} xml - XML string
 * @param {string} tag - Tag name (without angle brackets)
 * @returns {string|null} Text content or null
 */
function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract all occurrences of a block between opening and closing tags.
 * @param {string} xml - XML string
 * @param {string} tag - Tag name
 * @returns {string[]} Array of inner XML blocks
 */
function extractAllBlocks(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  const blocks = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

/**
 * Parse a camt.053 end-of-day bank statement.
 *
 * @param {string} xmlString - Raw XML string
 * @returns {{ statementId: string, accountIban: string, balance: number, transactions: Array }}
 */
export function parseCamt053(xmlString) {
  const statementId = extractTag(xmlString, 'StmtId') || extractTag(xmlString, 'Id') || '';
  const accountIban = extractTag(xmlString, 'IBAN') || '';

  // Extract closing balance
  let balance = 0;
  const balBlocks = extractAllBlocks(xmlString, 'Bal');
  for (const balBlock of balBlocks) {
    const balTp = extractTag(balBlock, 'Cd');
    if (balTp === 'CLBD' || balTp === 'CLAV') {
      const amtStr = extractTag(balBlock, 'Amt');
      const cdtDbt = extractTag(balBlock, 'CdtDbtInd');
      if (amtStr) {
        balance = parseFloat(amtStr);
        if (cdtDbt === 'DBIT') balance = -balance;
      }
      break;
    }
  }

  // Extract transactions from Ntry blocks
  const transactions = parseEntries(xmlString);

  return { statementId, accountIban, balance, transactions };
}

/**
 * Parse a camt.054 intraday notification.
 *
 * @param {string} xmlString - Raw XML string
 * @returns {{ statementId: string, accountIban: string, balance: number|undefined, transactions: Array }}
 */
export function parseCamt054(xmlString) {
  const statementId = extractTag(xmlString, 'NtfctnId') || extractTag(xmlString, 'Id') || '';
  const accountIban = extractTag(xmlString, 'IBAN') || '';

  const transactions = parseEntries(xmlString);

  return { statementId, accountIban, balance: undefined, transactions };
}

/**
 * Parse Ntry (entry) blocks common to camt.053 and camt.054.
 *
 * @param {string} xmlString - XML string containing Ntry blocks
 * @returns {Array<{ transactionDate: Date, valueDate: Date, amount: number, currency: string, reference: string, payerPayeeName: string, payerPayeeIban: string, bookingText: string }>}
 */
function parseEntries(xmlString) {
  const entryBlocks = extractAllBlocks(xmlString, 'Ntry');
  const transactions = [];

  for (const entry of entryBlocks) {
    const amtMatch = entry.match(/<Amt\s+Ccy="([^"]*)"[^>]*>([^<]*)<\/Amt>/);
    const currency = amtMatch ? amtMatch[1] : '';
    let amount = amtMatch ? parseFloat(amtMatch[2]) : 0;

    const cdtDbt = extractTag(entry, 'CdtDbtInd');
    if (cdtDbt === 'DBIT') amount = -amount;

    const bookgDt = extractTag(entry, 'Dt') || '';
    const valDt = extractTag(entry, 'Dt') || bookgDt;

    // Extract booking date from BookgDt block
    const bookgDtBlocks = extractAllBlocks(entry, 'BookgDt');
    const bookingDate = bookgDtBlocks.length > 0 ? extractTag(bookgDtBlocks[0], 'Dt') || bookgDt : bookgDt;

    // Extract value date from ValDt block
    const valDtBlocks = extractAllBlocks(entry, 'ValDt');
    const valueDate = valDtBlocks.length > 0 ? extractTag(valDtBlocks[0], 'Dt') || valDt : valDt;

    // Extract reference (QR/ESR)
    const reference = extractTag(entry, 'Ref')
      || extractTag(entry, 'EndToEndId')
      || '';

    // Extract payer/payee info from RltdPties
    const rltdPties = extractAllBlocks(entry, 'RltdPties');
    let payerPayeeName = '';
    let payerPayeeIban = '';
    if (rltdPties.length > 0) {
      payerPayeeName = extractTag(rltdPties[0], 'Nm') || '';
      payerPayeeIban = extractTag(rltdPties[0], 'IBAN') || '';
    }

    // Booking text from additional entry info
    const bookingText = extractTag(entry, 'AddtlNtryInf')
      || extractTag(entry, 'Ustrd')
      || '';

    transactions.push({
      transactionDate: bookingDate ? new Date(bookingDate) : new Date(),
      valueDate: valueDate ? new Date(valueDate) : new Date(),
      amount,
      currency,
      reference,
      payerPayeeName,
      payerPayeeIban,
      bookingText,
    });
  }

  return transactions;
}

/**
 * Generate a pain.001 payment order XML string.
 *
 * @param {{ batchNumber: string, invoiceIds: Array, totalAmount: number, invoiceCount: number }} paymentBatch
 * @param {{ name: string, iban: string, bic: string, currency: string }} bankAccount
 * @returns {string} XML string
 */
export function generatePain001(paymentBatch, bankAccount) {
  const now = new Date();
  const creationDateTime = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const requestedDate = now.toISOString().slice(0, 10);

  const msgId = `MSG-${paymentBatch.batchNumber}-${Date.now()}`;

  let pmtInfXml = '';

  // Generate a PmtInf block — in a real implementation each invoice would have its own CdtTrfTxInf
  pmtInfXml += `
    <PmtInf>
      <PmtInfId>${paymentBatch.batchNumber}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${paymentBatch.invoiceCount}</NbOfTxs>
      <CtrlSum>${paymentBatch.totalAmount.toFixed(2)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${requestedDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(bankAccount.name)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${bankAccount.iban}</IBAN>
        </Id>
        <Ccy>${bankAccount.currency || 'CHF'}</Ccy>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${bankAccount.bic || ''}</BIC>
        </FinInstnId>
      </DbtrAgt>
    </PmtInf>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${paymentBatch.invoiceCount}</NbOfTxs>
      <CtrlSum>${paymentBatch.totalAmount.toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(bankAccount.name)}</Nm>
      </InitgPty>
    </GrpHdr>${pmtInfXml}
  </CstmrCdtTrfInitn>
</Document>`;

  return xml;
}

/**
 * Escape special XML characters.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
