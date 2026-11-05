import { jest, describe, expect, test } from '@jest/globals';
import {
  parseCamt053,
  parseCamt054,
  parsePain002,
  generatePain001,
} from '../../src/modules/accounting/iso20022.parser.js';
import ERROR_CODES from '../../src/shared/errors/errorCodes.js';

const camt053Xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Id>STATEMENT-1</Id>
      <Acct><Id><IBAN>CH9300762011623852957</IBAN></Id></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="CHF">1234.55</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
      </Bal>
      <Ntry>
        <Amt Ccy="CHF">250.10</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-05-12</Dt></BookgDt>
        <ValDt><Dt>2026-05-13</Dt></ValDt>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>RE-2026-00001</EndToEndId></Refs>
          <RltdPties>
            <Dbtr><Nm>Customer AG</Nm></Dbtr>
            <DbtrAcct><Id><IBAN>CH5604835012345678009</IBAN></Id></DbtrAcct>
          </RltdPties>
          <RmtInf><Ustrd>Invoice payment</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="CHF">15.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-05-12</Dt></BookgDt>
        <ValDt><Dt>2026-05-12</Dt></ValDt>
        <AddtlNtryInf>Bank fee</AddtlNtryInf>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

const camt054Xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.08">
  <BkToCstmrDbtCdtNtfctn>
    <Ntfctn>
      <Id>NOTIFICATION-1</Id>
      <Acct><Id><IBAN>CH9300762011623852957</IBAN></Id></Acct>
      <Ntry>
        <Amt Ccy="EUR">10.50</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-05-12</Dt></BookgDt>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>`;

const pain002Xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.03">
  <CstmrPmtStsRpt>
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>MSG-PB-2026-00001-1778600000000</OrgnlMsgId>
      <OrgnlNbOfTxs>2</OrgnlNbOfTxs>
      <OrgnlCtrlSum>1200.50</OrgnlCtrlSum>
      <GrpSts>ACCP</GrpSts>
    </OrgnlGrpInfAndSts>
    <OrgnlPmtInfAndSts>
      <OrgnlPmtInfId>PB-2026-00001</OrgnlPmtInfId>
      <PmtInfSts>ACCP</PmtInfSts>
      <TxInfAndSts>
        <OrgnlInstrId>APR-2026-00001</OrgnlInstrId>
        <OrgnlEndToEndId>SUP-100</OrgnlEndToEndId>
        <TxSts>ACCP</TxSts>
      </TxInfAndSts>
      <TxInfAndSts>
        <OrgnlInstrId>APR-2026-00002</OrgnlInstrId>
        <OrgnlEndToEndId>SUP-101</OrgnlEndToEndId>
        <TxSts>RJCT</TxSts>
        <StsRsnInf><Rsn><Cd>AC01</Cd></Rsn><AddtlInf>Invalid account</AddtlInf></StsRsnInf>
      </TxInfAndSts>
    </OrgnlPmtInfAndSts>
  </CstmrPmtStsRpt>
</Document>`;

describe('ISO 20022 parser', () => {
  test('parses camt.053 statement id, account, balance, signed amounts, and transaction details', () => {
    const parsed = parseCamt053(camt053Xml);

    expect(parsed.statementId).toBe('STATEMENT-1');
    expect(parsed.accountIban).toBe('CH9300762011623852957');
    expect(parsed.balance).toBe(1234.55);
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]).toMatchObject({
      amount: 250.10,
      currency: 'CHF',
      reference: 'RE-2026-00001',
      payerPayeeName: 'Customer AG',
      payerPayeeIban: 'CH5604835012345678009',
      bookingText: 'Invoice payment',
    });
    expect(parsed.transactions[1]).toMatchObject({
      amount: -15,
      currency: 'CHF',
      bookingText: 'Bank fee',
    });
  });

  test('parses camt.054 notification without requiring balance', () => {
    const parsed = parseCamt054(camt054Xml);

    expect(parsed.statementId).toBe('NOTIFICATION-1');
    expect(parsed.accountIban).toBe('CH9300762011623852957');
    expect(parsed.balance).toBeUndefined();
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0]).toMatchObject({ amount: 10.5, currency: 'EUR' });
  });

  test('rejects unsupported or malformed XML with actionable parse error code', () => {
    expect(() => parseCamt053('<Document><Unsupported /></Document>')).toThrow(
      expect.objectContaining({
        statusCode: 400,
        code: ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
      }),
    );
  });

  test('reports unsupported ISO 20022 message type with location and detected type', () => {
    const pain001Xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn />
</Document>`;

    try {
      parseCamt053(pain001Xml);
      throw new Error('Expected parser to reject unsupported message type');
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 400,
        code: ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
      });
      expect(error.details[0]).toMatchObject({
        line: 2,
        column: 1,
        expected: 'BkToCstmrStmt',
        actual: 'pain.001',
        messageType: 'pain.001',
      });
      expect(error.details[0].snippet).toContain('<Document');
    }
  });

  test('reports invalid transaction currency with source line diagnostics', () => {
    const invalidCurrencyXml = camt053Xml.replace('<Amt Ccy="CHF">250.10</Amt>', '<Amt Ccy="ZZZ">250.10</Amt>');

    try {
      parseCamt053(invalidCurrencyXml);
      throw new Error('Expected parser to reject unsupported transaction currency');
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 400,
        code: ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
      });
      expect(error.details[0]).toMatchObject({
        expected: 'supported ISO 4217 currency',
        actual: 'ZZZ',
        messageType: 'camt.053',
      });
      expect(error.details[0].line).toEqual(expect.any(Number));
      expect(error.details[0].line).toBeGreaterThan(0);
      expect(error.details[0].column).toEqual(expect.any(Number));
      expect(error.details[0].column).toBeGreaterThan(0);
      expect(error.details[0].snippet).toContain('Ccy="ZZZ"');
    }
  });

  test('parses pain.002 payment batch and transaction statuses', () => {
    const parsed = parsePain002(pain002Xml);

    expect(parsed).toMatchObject({
      originalMessageId: 'MSG-PB-2026-00001-1778600000000',
      batchNumber: 'PB-2026-00001',
      groupStatus: 'ACCP',
      paymentInfoStatus: 'ACCP',
      originalTransactionCount: 2,
      originalControlSum: 1200.5,
    });
    expect(parsed.transactionStatuses).toEqual([
      {
        instructionId: 'APR-2026-00001',
        endToEndId: 'SUP-100',
        status: 'ACCP',
        reason: '',
      },
      {
        instructionId: 'APR-2026-00002',
        endToEndId: 'SUP-101',
        status: 'RJCT',
        reason: 'AC01',
      },
    ]);
  });

  test('generates pain.001 header, payment info control totals, and creditor transactions', () => {
    const xml = generatePain001(
      { batchNumber: 'PB-2026-00001', totalAmount: 1200.5, invoiceCount: 2 },
      { name: 'MB Boiler AG', iban: 'CH9300762011623852957', bic: 'POFICHBEXXX', currency: 'CHF' },
      [
        {
          instructionId: 'APR-2026-00001',
          endToEndId: 'SUP-100',
          amount: 700,
          currency: 'CHF',
          creditorName: 'Supplier One AG',
          creditorIban: 'CH5604835012345678009',
          creditorBic: 'RAIFCH22XXX',
          remittanceText: 'APR-2026-00001 / SUP-100',
        },
        {
          instructionId: 'APR-2026-00002',
          endToEndId: 'SUP-101',
          amount: 500.5,
          currency: 'CHF',
          creditorName: 'Supplier Two AG',
          creditorIban: 'CH9300762011623852957',
          remittanceText: 'APR-2026-00002 / SUP-101',
        },
      ],
    );

    expect(xml).toContain('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"');
    expect(xml).toContain('<NbOfTxs>2</NbOfTxs>');
    expect(xml).toContain('<CtrlSum>1200.50</CtrlSum>');
    expect(xml).toContain('<IBAN>CH9300762011623852957</IBAN>');
    expect(xml).toContain('<CdtTrfTxInf>');
    expect(xml).toContain('<InstrId>APR-2026-00001</InstrId>');
    expect(xml).toContain('<EndToEndId>SUP-100</EndToEndId>');
    expect(xml).toContain('<InstdAmt Ccy="CHF">700.00</InstdAmt>');
    expect(xml).toContain('<Cdtr><Nm>Supplier One AG</Nm></Cdtr>');
    expect(xml).toContain('<IBAN>CH5604835012345678009</IBAN>');
    expect(xml).toContain('<Othr><Id>NOTPROVIDED</Id></Othr>');
  });

  test('rejects pain.001 generation when creditor details are incomplete', () => {
    expect(() => generatePain001(
      { batchNumber: 'PB-2026-00001', totalAmount: 1200.5, invoiceCount: 1 },
      { name: 'MB Boiler AG', iban: 'CH9300762011623852957', bic: 'POFICHBEXXX', currency: 'CHF' },
      [{ instructionId: 'APR-1', endToEndId: 'SUP-1', amount: 1200.5, currency: 'CHF', creditorName: 'Supplier AG' }],
    )).toThrow(expect.objectContaining({
      statusCode: 400,
      code: ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
    }));
  });
});

describe('bank statement import validation', () => {
  test('rejects bank statements imported against the wrong account IBAN', async () => {
    jest.resetModules();

    const bankAccountRepository = {
      findById: jest.fn(async () => ({
        _id: 'bank-1',
        iban: 'CH0000000000000000000',
        currency: 'CHF',
      })),
      updateBalance: jest.fn(),
    };
    const bankTransactionRepository = {
      bulkCreate: jest.fn(),
    };
    const paymentBatchRepository = {
      findByBatchNumber: jest.fn(),
      updateStatus: jest.fn(),
    };

    jest.unstable_mockModule('../../src/modules/accounting/bankAccount.repository.js', () => ({
      default: bankAccountRepository,
    }));
    jest.unstable_mockModule('../../src/modules/accounting/bankTransaction.repository.js', () => ({
      default: bankTransactionRepository,
    }));
    jest.unstable_mockModule('../../src/modules/accounting/paymentBatch.repository.js', () => ({
      default: paymentBatchRepository,
    }));
    jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
      default: { del: jest.fn(), invalidatePattern: jest.fn(), getOrSet: jest.fn() },
    }));
    jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
      default: { publish: jest.fn() },
    }));
    jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
      default: { logEvent: jest.fn() },
    }));
    jest.unstable_mockModule('../../src/config/index.js', () => ({
      default: { redis: { keyPrefix: 'test:' } },
    }));
    jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
      default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));

    const bankingService = (await import('../../src/modules/accounting/banking.service.js')).default;

    await expect(bankingService.importStatement('bank-1', Buffer.from(camt053Xml), 'camt053', 'user-1'))
      .rejects.toMatchObject({
        statusCode: 400,
        code: ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
      });

    expect(bankTransactionRepository.bulkCreate).not.toHaveBeenCalled();
  });

  test('imports pain.002 report and updates payment batch status', async () => {
    jest.resetModules();

    const bankAccountRepository = {
      findById: jest.fn(),
      updateBalance: jest.fn(),
    };
    const bankTransactionRepository = {
      bulkCreate: jest.fn(),
    };
    const paymentBatchRepository = {
      findByBatchNumber: jest.fn(async () => ({
        _id: 'batch-1',
        batchNumber: 'PB-2026-00001',
        status: 'EXPORTED',
      })),
      updateStatus: jest.fn(async (_id, status, data) => ({ _id, status, ...data })),
    };

    jest.unstable_mockModule('../../src/modules/accounting/bankAccount.repository.js', () => ({
      default: bankAccountRepository,
    }));
    jest.unstable_mockModule('../../src/modules/accounting/bankTransaction.repository.js', () => ({
      default: bankTransactionRepository,
    }));
    jest.unstable_mockModule('../../src/modules/accounting/paymentBatch.repository.js', () => ({
      default: paymentBatchRepository,
    }));
    jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
      default: { del: jest.fn(), invalidatePattern: jest.fn(), getOrSet: jest.fn() },
    }));
    jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
      default: { publish: jest.fn() },
    }));
    jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
      default: { logEvent: jest.fn() },
    }));
    jest.unstable_mockModule('../../src/config/index.js', () => ({
      default: { redis: { keyPrefix: 'test:' } },
    }));
    jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
      default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));

    const bankingService = (await import('../../src/modules/accounting/banking.service.js')).default;

    const result = await bankingService.importPaymentStatus(Buffer.from(pain002Xml), 'user-1');

    expect(paymentBatchRepository.findByBatchNumber).toHaveBeenCalledWith('PB-2026-00001');
    expect(paymentBatchRepository.updateStatus).toHaveBeenCalledWith(
      'batch-1',
      'CONFIRMED',
      expect.objectContaining({
        pain002Status: 'ACCP',
        pain002Reason: null,
        pain002TransactionStatuses: expect.arrayContaining([
          expect.objectContaining({ instructionId: 'APR-2026-00002', status: 'RJCT', reason: 'AC01' }),
        ]),
      }),
    );
    expect(result.batch.status).toBe('CONFIRMED');
  });
});
