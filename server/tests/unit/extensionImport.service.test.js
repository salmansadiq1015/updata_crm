import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let ExtensionImport, extensionImportService, emitted;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/extension/extensionImport.model.js');
  ExtensionImport = mongoose.model('ExtensionImport');
  extensionImportService = (await import('../../src/modules/extension/extensionImport.service.js')).default;
});

beforeEach(() => {
  emitted = [];
  global.io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
});

afterEach(async () => { await clearTestDb(); delete global.io; });
afterAll(async () => { await disconnectTestDb(); });

const newUser = () => new mongoose.Types.ObjectId();

describe('extensionImportService.recordBatch', () => {
  it('accumulates batches and streams progress to the user room', async () => {
    const u = newUser();
    const a = await extensionImportService.recordBatch(u, {
      importId: 'imp-1', importTotal: 50, batch: { processed: 25, created: 20, existing: 3, failed: 2 },
    });
    expect(a).toMatchObject({ importId: 'imp-1', total: 50, processed: 25, created: 20, existing: 3, failed: 2, status: 'running' });
    expect(emitted.at(-1)).toMatchObject({ room: String(u), event: 'extension:import:progress' });

    const b = await extensionImportService.recordBatch(u, {
      importId: 'imp-1', importTotal: 50, importFinal: true, batch: { processed: 25, created: 24, existing: 1, failed: 0 },
    });
    // Overall had failures → partial, not completed; terminal timestamp set.
    expect(b).toMatchObject({ processed: 50, created: 44, existing: 4, failed: 2, status: 'partial' });
    const doc = await ExtensionImport.findOne({ createdBy: u, importId: 'imp-1' });
    expect(doc.completedAt).toBeTruthy();
  });

  it('completes (not partial) when every row is processed with no failures', async () => {
    const u = newUser();
    await extensionImportService.recordBatch(u, {
      importId: 'imp-2', importTotal: 10, batch: { processed: 10, created: 10, existing: 0, failed: 0 },
    });
    const doc = await ExtensionImport.findOne({ createdBy: u, importId: 'imp-2' });
    expect(doc.status).toBe('completed');
    expect(doc.completedAt).toBeTruthy();
  });

  it('never throws when the socket layer is unavailable', async () => {
    delete global.io;
    await expect(extensionImportService.recordBatch(newUser(), {
      importId: 'imp-3', importTotal: 1, importFinal: true, batch: { processed: 1, created: 1, existing: 0, failed: 0 },
    })).resolves.toMatchObject({ status: 'completed' });
  });

  it('listRecent returns only the requesting user’s imports', async () => {
    const u1 = newUser();
    const u2 = newUser();
    await extensionImportService.recordBatch(u1, { importId: 'a', importTotal: 1, importFinal: true, batch: { processed: 1, created: 1, existing: 0, failed: 0 } });
    await extensionImportService.recordBatch(u2, { importId: 'b', importTotal: 1, importFinal: true, batch: { processed: 1, created: 1, existing: 0, failed: 0 } });
    const list1 = await extensionImportService.listRecent(u1, 10);
    expect(list1).toHaveLength(1);
    expect(list1[0].importId).toBe('a');
  });
});
