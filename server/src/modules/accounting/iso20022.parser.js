import { CURRENCY_CODES, currencyDigits, roundCurrency } from '../../shared/data/currencies.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const CAMT053_ROOT = 'BkToCstmrStmt';
const CAMT054_ROOT = 'BkToCstmrDbtCdtNtfctn';
const PAIN002_ROOT = 'CstmrPmtStsRpt';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_CURRENCIES = new Set(CURRENCY_CODES);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tagName(tag) {
  return `(?:[A-Za-z_][\\w.-]*:)?${escapeRegex(tag)}`;
}

function findLocation(xml, index) {
  if (index < 0) return { line: undefined, column: undefined };

  const prior = xml.slice(0, index);
  const lines = prior.split(/\r\n|\r|\n/);
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function findLine(xml, index) {
  return findLocation(xml, index).line;
}

function snippetAt(xml, index) {
  if (index < 0) return undefined;

  const lineStart = Math.max(xml.lastIndexOf('\n', index - 1) + 1, 0);
  const lineEndCandidates = [
    xml.indexOf('\n', index),
    xml.indexOf('\r', index),
  ].filter((position) => position >= 0);
  const lineEnd = lineEndCandidates.length ? Math.min(...lineEndCandidates) : xml.length;
  const snippet = xml.slice(lineStart, lineEnd).trim();
  return snippet.length > 160 ? `${snippet.slice(0, 157)}...` : snippet;
}

function detectMessageType(xml) {
  if (!xml) return 'unknown';
  if (hasTag(xml, CAMT053_ROOT)) return 'camt.053';
  if (hasTag(xml, CAMT054_ROOT)) return 'camt.054';
  if (hasTag(xml, PAIN002_ROOT)) return 'pain.002';
  if (hasTag(xml, 'CstmrCdtTrfInitn')) return 'pain.001';
  return 'unknown';
}

function fail(message, xml, marker, expected, actual = null) {
  const index = marker ? xml.search(marker instanceof RegExp ? marker : new RegExp(escapeRegex(marker))) : -1;
  const location = findLocation(xml, index);
  throw new AppError(message, 400, ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED, [{
    line: location.line,
    column: location.column,
    expected,
    actual,
    messageType: detectMessageType(xml),
    snippet: snippetAt(xml, index),
  }]);
}

function assertXml(xmlString) {
  if (typeof xmlString !== 'string' || !xmlString.trim()) {
    fail('ISO 20022 XML payload is empty', '', null, 'non-empty XML payload');
  }
  const xml = xmlString.replace(/^\uFEFF/, '').trim();
  if (!xml.startsWith('<')) {
    fail('ISO 20022 payload is not XML', xml, null, 'XML document');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    fail('ISO 20022 XML must not contain DTD or entity declarations', xml, /<!DOCTYPE|<!ENTITY/i, 'DTD-free XML');
  }
  if (!new RegExp(`<${tagName('Document')}\\b`).test(xml)) {
    fail('ISO 20022 XML is missing Document root', xml, null, '<Document>');
  }
  return xml;
}

function hasTag(xml, tag) {
  return new RegExp(`<${tagName(tag)}\\b`).test(xml);
}

function extractTag(xml, tag) {
  const name = tagName(tag);
  const regex = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i');
  const match = xml.match(regex);
  if (!match) return null;
  return match[1].replace(/<[^>]*>/g, '').trim();
}

function extractAllBlocks(xml, tag) {
  const name = tagName(tag);
  const regex = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'gi');
  const blocks = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push({ xml: match[1], line: findLine(xml, match.index) });
  }
  return blocks;
}

function removeAllBlocks(xml, tag) {
  const name = tagName(tag);
  return xml.replace(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?</${name}>`, 'gi'), '');
}

function extractAmount(block, sourceXml) {
  const amountRegex = new RegExp(`<${tagName('Amt')}\\b[^>]*\\bCcy="([^"]+)"[^>]*>([^<]+)</${tagName('Amt')}>`, 'i');
  const match = block.xml.match(amountRegex);
  if (!match) {
    fail('Bank transaction entry is missing amount/currency', sourceXml, '<Ntry', '<Amt Ccy="...">');
  }

  const currency = match[1].trim();
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    fail('Unsupported bank transaction currency', sourceXml, match[0], 'supported ISO 4217 currency', currency);
  }

  const amount = Number(match[2]);
  if (!Number.isFinite(amount) || amount <= 0) {
    fail('Bank transaction amount must be a positive number', sourceXml, match[0], 'positive decimal amount', match[2]);
  }

  return { amount, currency };
}

function parseIsoDate(value, sourceXml, label) {
  if (!value || !DATE_RE.test(value)) {
    fail(`Bank transaction ${label} is missing or invalid`, sourceXml, value || '<Ntry', 'YYYY-MM-DD', value || null);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function extractDateFromBlock(entry, blockName) {
  const blocks = extractAllBlocks(entry, blockName);
  return blocks.length ? extractTag(blocks[0].xml, 'Dt') : null;
}

function extractReference(entry) {
  const refs = extractAllBlocks(entry, 'Refs')[0]?.xml || entry;
  const structuredReference = extractAllBlocks(entry, 'CdtrRefInf')[0]?.xml || '';
  return extractTag(structuredReference, 'Ref')
    || extractTag(refs, 'AcctSvcrRef')
    || extractTag(refs, 'EndToEndId')
    || extractTag(refs, 'TxId')
    || '';
}

function extractParty(entry) {
  const relatedParties = extractAllBlocks(entry, 'RltdPties')[0]?.xml || '';
  const debtor = extractAllBlocks(relatedParties, 'Dbtr')[0]?.xml || '';
  const creditor = extractAllBlocks(relatedParties, 'Cdtr')[0]?.xml || '';
  const debtorAccount = extractAllBlocks(relatedParties, 'DbtrAcct')[0]?.xml || '';
  const creditorAccount = extractAllBlocks(relatedParties, 'CdtrAcct')[0]?.xml || '';
  const party = debtor || creditor || relatedParties;
  const account = debtorAccount || creditorAccount || relatedParties;

  return {
    payerPayeeName: extractTag(party, 'Nm') || '',
    payerPayeeIban: extractTag(account, 'IBAN') || '',
  };
}

function parseEntries(xml, sourceXml = xml) {
  const entryBlocks = extractAllBlocks(xml, 'Ntry');
  if (!entryBlocks.length) {
    fail('ISO 20022 statement contains no transaction entries', sourceXml, null, '<Ntry>');
  }

  return entryBlocks.map((entryBlock) => {
    const { amount: unsignedAmount, currency } = extractAmount(entryBlock, sourceXml);
    const cdtDbt = extractTag(entryBlock.xml, 'CdtDbtInd');
    if (!['CRDT', 'DBIT'].includes(cdtDbt)) {
      fail('Bank transaction entry has invalid credit/debit indicator', sourceXml, '<CdtDbtInd', 'CRDT or DBIT', cdtDbt);
    }

    const bookingDate = extractDateFromBlock(entryBlock.xml, 'BookgDt') || extractTag(entryBlock.xml, 'Dt');
    const valueDate = extractDateFromBlock(entryBlock.xml, 'ValDt') || bookingDate;
    const { payerPayeeName, payerPayeeIban } = extractParty(entryBlock.xml);
    const bookingText = extractTag(entryBlock.xml, 'AddtlNtryInf') || extractTag(entryBlock.xml, 'Ustrd') || '';
    const amount = cdtDbt === 'DBIT' ? -unsignedAmount : unsignedAmount;

    return {
      transactionDate: parseIsoDate(bookingDate, sourceXml, 'booking date'),
      valueDate: parseIsoDate(valueDate, sourceXml, 'value date'),
      amount: roundCurrency(amount, currency),
      currency,
      reference: extractReference(entryBlock.xml),
      payerPayeeName,
      payerPayeeIban,
      bookingText,
    };
  });
}

function parseBalance(xml, sourceXml = xml) {
  for (const block of extractAllBlocks(xml, 'Bal')) {
    const type = extractAllBlocks(block.xml, 'Tp')[0]?.xml || '';
    const code = extractTag(type, 'Cd');
    if (!['CLBD', 'CLAV'].includes(code)) continue;

    const { amount } = extractAmount(block, sourceXml);
    return extractTag(block.xml, 'CdtDbtInd') === 'DBIT' ? -amount : amount;
  }
  return undefined;
}

function parseStatement(xml, rootTag) {
  const xmlDoc = assertXml(xml);
  if (!hasTag(xmlDoc, rootTag)) {
    fail('Unsupported ISO 20022 message type', xmlDoc, '<Document', rootTag, detectMessageType(xmlDoc));
  }

  const statementBlock = extractAllBlocks(xmlDoc, rootTag === CAMT053_ROOT ? 'Stmt' : 'Ntfctn')[0];
  if (!statementBlock) {
    fail('ISO 20022 document is missing statement/notification block', xmlDoc, rootTag, '<Stmt> or <Ntfctn>');
  }

  const accountBlock = extractAllBlocks(statementBlock.xml, 'Acct')[0]?.xml || statementBlock.xml;
  const statementId = extractTag(statementBlock.xml, 'Id');
  const accountIban = extractTag(accountBlock, 'IBAN');
  if (!statementId) fail('ISO 20022 statement is missing statement id', xmlDoc, rootTag, '<Id>');
  if (!accountIban) fail('ISO 20022 statement is missing account IBAN', xmlDoc, rootTag, '<Acct><Id><IBAN>');

  return {
    statementId,
    accountIban,
    balance: rootTag === CAMT053_ROOT ? parseBalance(statementBlock.xml, xmlDoc) : undefined,
    transactions: parseEntries(statementBlock.xml, xmlDoc),
  };
}

export function parseCamt053(xmlString) {
  return parseStatement(xmlString, CAMT053_ROOT);
}

export function parseCamt054(xmlString) {
  return parseStatement(xmlString, CAMT054_ROOT);
}

function extractStatusReason(block) {
  const reasonBlock = extractAllBlocks(block, 'StsRsnInf')[0]?.xml || '';
  if (!reasonBlock) return '';

  const reason = extractAllBlocks(reasonBlock, 'Rsn')[0]?.xml || reasonBlock;
  return extractTag(reason, 'Cd') || extractTag(reasonBlock, 'AddtlInf') || '';
}

function inferBatchNumberFromMessageId(messageId) {
  if (!messageId) return '';
  return messageId.replace(/^MSG-/, '').replace(/-\d{10,}$/, '');
}

export function parsePain002(xmlString) {
  const xmlDoc = assertXml(xmlString);
  if (!hasTag(xmlDoc, PAIN002_ROOT)) {
    fail('Unsupported ISO 20022 payment status message type', xmlDoc, '<Document', PAIN002_ROOT, detectMessageType(xmlDoc));
  }

  const reportBlock = extractAllBlocks(xmlDoc, PAIN002_ROOT)[0];
  if (!reportBlock) {
    fail('pain.002 document is missing payment status report block', xmlDoc, PAIN002_ROOT, '<CstmrPmtStsRpt>');
  }

  const groupBlock = extractAllBlocks(reportBlock.xml, 'OrgnlGrpInfAndSts')[0]?.xml;
  if (!groupBlock) {
    fail('pain.002 document is missing original group status block', xmlDoc, PAIN002_ROOT, '<OrgnlGrpInfAndSts>');
  }

  const paymentBlock = extractAllBlocks(reportBlock.xml, 'OrgnlPmtInfAndSts')[0]?.xml || '';
  const originalMessageId = extractTag(groupBlock, 'OrgnlMsgId');
  const batchNumber = extractTag(paymentBlock, 'OrgnlPmtInfId') || inferBatchNumberFromMessageId(originalMessageId);
  if (!batchNumber) {
    fail('pain.002 document is missing original payment information id', xmlDoc, '<OrgnlPmtInfAndSts', '<OrgnlPmtInfId>');
  }

  const transactionStatuses = extractAllBlocks(paymentBlock || reportBlock.xml, 'TxInfAndSts').map((block) => ({
    instructionId: extractTag(block.xml, 'OrgnlInstrId'),
    endToEndId: extractTag(block.xml, 'OrgnlEndToEndId'),
    status: extractTag(block.xml, 'TxSts'),
    reason: extractStatusReason(block.xml),
  }));
  const paymentInfoOnly = removeAllBlocks(paymentBlock, 'TxInfAndSts');

  return {
    originalMessageId,
    batchNumber,
    groupStatus: extractTag(groupBlock, 'GrpSts') || '',
    groupReason: extractStatusReason(groupBlock),
    originalTransactionCount: Number(extractTag(groupBlock, 'OrgnlNbOfTxs') || 0),
    originalControlSum: Number(extractTag(groupBlock, 'OrgnlCtrlSum') || 0),
    paymentInfoStatus: extractTag(paymentBlock, 'PmtInfSts') || '',
    paymentInfoReason: extractStatusReason(paymentInfoOnly),
    transactionStatuses,
  };
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizePainAmount(value, currency = 'CHF') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return roundCurrency(amount, currency);
}

function assertPainInput(paymentBatch, bankAccount, creditTransfers) {
  if (!paymentBatch?.batchNumber) {
    fail('Payment batch number is required for pain.001 generation', '', null, 'batchNumber');
  }
  if (!Number.isFinite(Number(paymentBatch.totalAmount)) || Number(paymentBatch.totalAmount) <= 0) {
    fail('Payment batch total amount must be positive', '', null, 'positive totalAmount');
  }
  if (!Number.isInteger(Number(paymentBatch.invoiceCount)) || Number(paymentBatch.invoiceCount) <= 0) {
    fail('Payment batch invoice count must be positive', '', null, 'positive invoiceCount');
  }
  if (!bankAccount?.name || !bankAccount?.iban) {
    fail('Debtor bank account name and IBAN are required for pain.001 generation', '', null, 'bankAccount.name and bankAccount.iban');
  }

  if (!Array.isArray(creditTransfers) || !creditTransfers.length) {
    fail('Creditor transfer details are required for pain.001 generation', '', null, 'non-empty creditTransfers');
  }

  const invoiceCount = Number(paymentBatch.invoiceCount);
  if (creditTransfers.length !== invoiceCount) {
    fail('Creditor transfer count must match payment batch invoice count', '', null, String(invoiceCount), String(creditTransfers.length));
  }

  const transferTotal = creditTransfers.reduce((sum, transfer) => sum + (normalizePainAmount(transfer.amount, transfer.currency || bankAccount.currency || 'CHF') || 0), 0);
  const batchCurrency = paymentBatch.currency || creditTransfers[0].currency || bankAccount.currency || 'CHF';
  if (creditTransfers.some(transfer => (transfer.currency || bankAccount.currency || 'CHF') !== batchCurrency)) fail('Payment batches must contain a single currency', '', null, batchCurrency);
  const normalizedTransferTotal = roundCurrency(transferTotal, batchCurrency);
  const batchTotal = normalizePainAmount(paymentBatch.totalAmount, batchCurrency);
  if (normalizedTransferTotal !== batchTotal) {
    fail('Creditor transfer control sum must match payment batch total amount', '', null, batchTotal.toFixed(currencyDigits(batchCurrency)), normalizedTransferTotal.toFixed(currencyDigits(batchCurrency)));
  }

  creditTransfers.forEach((transfer, index) => {
    const position = index + 1;
    const amount = normalizePainAmount(transfer.amount, transfer.currency || bankAccount.currency || 'CHF');
    if (!transfer.creditorName) {
      fail(`Creditor transfer ${position} is missing creditor name`, '', null, 'creditorName');
    }
    if (!transfer.creditorIban) {
      fail(`Creditor transfer ${position} is missing creditor IBAN`, '', null, 'creditorIban');
    }
    if (!amount || amount <= 0) {
      fail(`Creditor transfer ${position} amount must be positive`, '', null, 'positive amount');
    }
    if (!SUPPORTED_CURRENCIES.has(transfer.currency || 'CHF')) {
      fail(`Creditor transfer ${position} has unsupported currency`, '', null, 'supported ISO 4217 currency', transfer.currency);
    }
  });
}

function renderCreditorAgent(transfer) {
  if (transfer.creditorBic) {
    return `<CdtrAgt><FinInstnId><BIC>${escapeXml(transfer.creditorBic)}</BIC></FinInstnId></CdtrAgt>`;
  }
  return '<CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>';
}

function renderCreditTransfer(transfer) {
  const amount = normalizePainAmount(transfer.amount, transfer.currency || 'CHF');
  const currency = transfer.currency || 'CHF';
  const instructionId = transfer.instructionId || transfer.endToEndId;
  const endToEndId = transfer.endToEndId || instructionId;
  const remittanceText = transfer.remittanceText || endToEndId;

  return `      <CdtTrfTxInf>
        <PmtId>
          <InstrId>${escapeXml(instructionId)}</InstrId>
          <EndToEndId>${escapeXml(endToEndId)}</EndToEndId>
        </PmtId>
        <Amt><InstdAmt Ccy="${escapeXml(currency)}">${amount.toFixed(currencyDigits(currency))}</InstdAmt></Amt>
        ${renderCreditorAgent(transfer)}
        <Cdtr><Nm>${escapeXml(transfer.creditorName)}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${escapeXml(transfer.creditorIban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${escapeXml(remittanceText)}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
}

export function generatePain001(paymentBatch, bankAccount, creditTransfers = []) {
  assertPainInput(paymentBatch, bankAccount, creditTransfers);

  const now = new Date();
  const creationDateTime = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const requestedDate = now.toISOString().slice(0, 10);
  const currency = paymentBatch.currency || creditTransfers[0].currency || bankAccount.currency || 'CHF';
  const totalAmount = Number(paymentBatch.totalAmount);
  const invoiceCount = Number(paymentBatch.invoiceCount);
  const msgId = `MSG-${paymentBatch.batchNumber}-${Date.now()}`;
  const transferXml = creditTransfers.map(renderCreditTransfer).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${invoiceCount}</NbOfTxs>
      <CtrlSum>${totalAmount.toFixed(currencyDigits(currency))}</CtrlSum>
      <InitgPty><Nm>${escapeXml(bankAccount.name)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(paymentBatch.batchNumber)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${invoiceCount}</NbOfTxs>
      <CtrlSum>${totalAmount.toFixed(currencyDigits(currency))}</CtrlSum>
      ${currency === 'EUR' ? '<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>' : ''}
      <ReqdExctnDt>${requestedDate}</ReqdExctnDt>
      <Dbtr><Nm>${escapeXml(bankAccount.name)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${escapeXml(bankAccount.iban)}</IBAN></Id><Ccy>${escapeXml(bankAccount.currency || 'CHF')}</Ccy></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>${escapeXml(bankAccount.bic || '')}</BIC></FinInstnId></DbtrAgt>
${transferXml}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}
