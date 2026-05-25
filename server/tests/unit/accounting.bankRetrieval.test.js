import { jest, describe, expect, test, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const camt053Xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Id>STATEMENT-DROP-1</Id>
      <Acct><Id><IBAN>CH9300762011623852957</IBAN></Id></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="CHF">1000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
      </Bal>
      <Ntry>
        <Amt Ccy="CHF">250.10</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-05-12</Dt></BookgDt>
        <ValDt><Dt>2026-05-13</Dt></ValDt>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>RE-2026-00001</EndToEndId></Refs>
          <RltdPties><Dbtr><Nm>Customer AG</Nm></Dbtr></RltdPties>
          <RmtInf><Ustrd>Invoice payment</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

const tempRoots = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createDropFolders() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mb-bank-retrieval-'));
  tempRoots.push(root);
  const statementDirectory = path.join(root, 'inbox');
  const processedDirectory = path.join(root, 'processed');
  const failedDirectory = path.join(root, 'failed');
  await fs.mkdir(statementDirectory, { recursive: true });
  await fs.mkdir(processedDirectory, { recursive: true });
  await fs.mkdir(failedDirectory, { recursive: true });
  return { root, statementDirectory, processedDirectory, failedDirectory };
}

async function loadBankingService({ account, existsStatement = false } = {}) {
  jest.resetModules();

  const bankAccountRepository = {
    findById: jest.fn(async () => account),
    updateBalance: jest.fn(async () => account),
  };
  const bankTransactionRepository = {
    existsStatement: jest.fn(async () => existsStatement),
    bulkCreate: jest.fn(async (records) => records.map((record, index) => ({ _id: `txn-${index}`, ...record }))),
  };
  const paymentBatchRepository = {
    findByBatchNumber: jest.fn(),
    updateStatus: jest.fn(),
  };
  const auditService = { logEvent: jest.fn() };

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
    default: { del: jest.fn(), getOrSet: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: { publish: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/config/index.js', () => ({
    default: { redis: { keyPrefix: 'test:' } },
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const bankingService = (await import('../../src/modules/accounting/banking.service.js')).default;
  return { bankingService, bankAccountRepository, bankTransactionRepository, auditService };
}

describe('bank statement automated retrieval', () => {
  test('retrieves camt files from a configured bank gateway drop folder', async () => {
    const folders = await createDropFolders();
    await fs.writeFile(path.join(folders.statementDirectory, 'statement.053.xml'), camt053Xml);
    await fs.writeFile(path.join(folders.statementDirectory, 'ignored.txt'), 'not xml');

    const { bankingService, bankTransactionRepository } = await loadBankingService({
      account: {
        _id: 'bank-1',
        iban: 'CH9300762011623852957',
        currency: 'CHF',
        connectionType: 'SFTP',
        status: 'ACTIVE',
        connectionConfig: folders,
      },
    });

    const result = await bankingService.retrieveStatements('bank-1', 'user-1');

    expect(result).toMatchObject({
      status: 'completed',
      filesFound: 1,
      filesProcessed: 1,
      importedTransactions: 1,
      failedFiles: [],
    });
    expect(bankTransactionRepository.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        bankAccountId: 'bank-1',
        statementId: 'STATEMENT-DROP-1',
        reference: 'RE-2026-00001',
        amount: 250.1,
      }),
    ]);
    const processed = await fs.readdir(folders.processedDirectory);
    expect(processed).toHaveLength(1);
    await expect(fs.access(path.join(folders.statementDirectory, 'statement.053.xml'))).rejects.toThrow();
  });

  test('rejects automated retrieval for manual bank accounts', async () => {
    const { bankingService, bankTransactionRepository } = await loadBankingService({
      account: {
        _id: 'bank-1',
        iban: 'CH9300762011623852957',
        currency: 'CHF',
        connectionType: 'MANUAL',
        status: 'ACTIVE',
        connectionConfig: {},
      },
    });

    await expect(bankingService.retrieveStatements('bank-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(bankTransactionRepository.bulkCreate).not.toHaveBeenCalled();
  });

  test('moves duplicate statements to processed without importing transactions again', async () => {
    const folders = await createDropFolders();
    await fs.writeFile(path.join(folders.statementDirectory, 'statement.053.xml'), camt053Xml);

    const { bankingService, bankTransactionRepository } = await loadBankingService({
      existsStatement: true,
      account: {
        _id: 'bank-1',
        iban: 'CH9300762011623852957',
        currency: 'CHF',
        connectionType: 'EBICS',
        status: 'ACTIVE',
        connectionConfig: folders,
      },
    });

    const result = await bankingService.retrieveStatements('bank-1', 'user-1');

    expect(result).toMatchObject({
      filesProcessed: 1,
      importedTransactions: 0,
      skippedFiles: [expect.objectContaining({ reason: 'duplicate_statement', statementId: 'STATEMENT-DROP-1' })],
    });
    expect(bankTransactionRepository.bulkCreate).not.toHaveBeenCalled();
    expect(await fs.readdir(folders.processedDirectory)).toHaveLength(1);
  });
});
