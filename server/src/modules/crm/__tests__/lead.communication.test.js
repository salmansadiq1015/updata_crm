import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  jest, describe, it, beforeAll, afterAll, beforeEach, expect,
} from '@jest/globals';

// Lead communication (WhatsApp logging, last-contacted tracking, lead-scoped
// contact log) against the real data layer (Lead + ContactLogEntry models, the
// lead / contactLog services and repositories, the real phone normalizer), so
// what is asserted is what Mongoose actually persists — not a mock's idea of it.
// Only peripheral infrastructure is mocked: audit, logger, and (for the email
// service) the email record repository, the BullMQ queue and the event bus.
const mockLogEvent = jest.fn();
jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: mockLogEvent } }));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

const mockAddJob = jest.fn();
jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({ default: { addJob: mockAddJob } }));

const mockPublish = jest.fn();
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({ default: { publish: mockPublish } }));

const mockEmailRecordCreate = jest.fn(async (doc) => ({ ...doc, _id: new mongoose.Types.ObjectId() }));
jest.unstable_mockModule('../../doctpl/emailRecord.repository.js', () => ({ default: { create: mockEmailRecordCreate } }));

let mongod;
let Lead;
let ContactLogEntry;
let leadService;
let contactLogService;
let emailService;

const actor = new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  Lead = (await import('../lead.model.js')).default;
  ContactLogEntry = (await import('../contactLog.model.js')).default;
  // Register the schemas the lead / contact-log repositories populate. Mongoose
  // requires every referenced model to be registered before a populate runs,
  // even for fields that are null on these entries. Imported sequentially —
  // concurrent dynamic imports trip a Jest ESM module-linking race.
  await import('../../auth/user.model.js'); // createdBy / assignedTo / employeeId
  await import('../contact.model.js');
  await import('../site.model.js');
  await import('../../pm/project.model.js');
  await import('../../qop/order.model.js');
  await import('../../deploy/assignment.model.js');
  await import('../../tasks/task.model.js');
  leadService = (await import('../lead.service.js')).default;
  contactLogService = (await import('../contactLog.service.js')).default;
  emailService = (await import('../../doctpl/email.service.js')).default;

  await Lead.init();
  await ContactLogEntry.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([Lead.deleteMany({}), ContactLogEntry.deleteMany({})]);
  jest.clearAllMocks();
});

let leadSeq = 0;
async function makeLead(overrides = {}) {
  leadSeq += 1;
  return Lead.create({
    leadNumber: `L-8${String(leadSeq).padStart(4, '0')}`,
    name: `Lead ${leadSeq}`,
    createdBy: actor,
    ...overrides,
  });
}

describe('leadService.logWhatsApp', () => {
  it('logs a whatsapp contact on the lead, stamps lastContacted, and returns the wa number', async () => {
    const lead = await makeLead({ phone: '044 123 45 67' });

    const result = await leadService.logWhatsApp(lead._id, { message: 'Hallo' }, actor, {});

    // The server never sends anything — it returns the E.164 number (no '+')
    // for the client to build https://wa.me/<waNumber>?text=…
    expect(result).toEqual({ waNumber: '41441234567', logged: true });

    const entries = await ContactLogEntry.find({ leadId: lead._id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      channel: 'whatsapp',
      subject: 'WhatsApp opened',
      note: 'Hallo',
    });
    expect(String(entries[0].leadId)).toBe(String(lead._id));
    expect(entries[0].customerId).toBeNull();
    expect(String(entries[0].employeeId)).toBe(String(actor));

    const reloaded = await Lead.findById(lead._id).lean();
    expect(reloaded.lastContactChannel).toBe('whatsapp');
    expect(reloaded.lastContactedAt).toBeInstanceOf(Date);

    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'lead.whatsapp_opened', module: 'lead',
    }));
  });

  it('falls back to the mobile number and a default note when no message is given', async () => {
    const lead = await makeLead({ phone: null, mobile: '+41 79 123 45 67' });

    const result = await leadService.logWhatsApp(lead._id, {}, actor, {});

    expect(result.waNumber).toBe('41791234567');
    const entry = await ContactLogEntry.findOne({ leadId: lead._id }).lean();
    expect(entry.note).toBe('WhatsApp opened');
  });

  it('rejects with 400 when the lead has no usable phone number and logs nothing', async () => {
    const lead = await makeLead({ phone: null, mobile: null });

    await expect(leadService.logWhatsApp(lead._id, {}, actor, {}))
      .rejects.toMatchObject({ statusCode: 400 });

    expect(await ContactLogEntry.countDocuments({ leadId: lead._id })).toBe(0);
    const reloaded = await Lead.findById(lead._id).lean();
    expect(reloaded.lastContactedAt).toBeNull();
    expect(reloaded.lastContactChannel).toBeNull();
  });

  it('throws NotFoundError when the lead does not exist', async () => {
    await expect(leadService.logWhatsApp(new mongoose.Types.ObjectId(), {}, actor, {}))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('leadService.listCommunications', () => {
  it('returns the lead contact-log entries (newest first)', async () => {
    const lead = await makeLead({ phone: '044 123 45 67' });
    await leadService.logWhatsApp(lead._id, { message: 'first' }, actor, {});
    await leadService.logWhatsApp(lead._id, { message: 'second' }, actor, {});

    const entries = await leadService.listCommunications(lead._id);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => String(e.leadId) === String(lead._id))).toBe(true);
  });

  it('throws NotFoundError when the lead does not exist', async () => {
    await expect(leadService.listCommunications(new mongoose.Types.ObjectId()))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('contactLogService.create (lead scope)', () => {
  it('accepts a leadId and persists the entry against the lead', async () => {
    const lead = await makeLead({ phone: '0441234567' });

    const entry = await contactLogService.create(
      null,
      { leadId: lead._id, channel: 'phone', note: 'Prospect called back' },
      actor,
      {},
    );

    expect(String(entry.leadId)).toBe(String(lead._id));
    expect(entry.customerId).toBeNull();
  });

  it('validates that the referenced lead exists', async () => {
    await expect(contactLogService.create(
      null,
      { leadId: new mongoose.Types.ObjectId(), channel: 'phone', note: 'x' },
      actor,
      {},
    )).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects when neither customerId nor leadId is given', async () => {
    await expect(contactLogService.create(
      null,
      { channel: 'phone', note: 'x' },
      actor,
      {},
    )).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('ContactLogEntry model owner validation', () => {
  const base = () => ({
    channel: 'phone',
    note: 'x',
    employeeId: actor,
    createdBy: actor,
    editableUntil: new Date(Date.now() + 1000),
  });

  it('accepts an entry owned by a lead', async () => {
    const entry = await ContactLogEntry.create({ ...base(), leadId: new mongoose.Types.ObjectId() });
    expect(entry.leadId).toBeDefined();
    expect(entry.customerId).toBeNull();
  });

  it('rejects an entry with neither a customer nor a lead', async () => {
    await expect(ContactLogEntry.create(base())).rejects.toThrow(/customerId or a leadId/);
  });
});

describe('emailService.send — lead last-contacted tracking', () => {
  it("stamps the lead's lastContactedAt/channel when sourceModule === 'lead'", async () => {
    const lead = await makeLead({ email: 'info@foo.ch' });

    await emailService.send({
      to: ['info@foo.ch'],
      subject: 'Angebot',
      bodyHtml: '<p>Guten Tag</p>',
      sourceModule: 'lead',
      sourceRecordId: lead._id,
      senderAddress: 'noreply@test.ch',
      senderName: 'Test',
      createdBy: actor,
    });

    const reloaded = await Lead.findById(lead._id).lean();
    expect(reloaded.lastContactChannel).toBe('email');
    expect(reloaded.lastContactedAt).toBeInstanceOf(Date);
    // The email send path itself is untouched — the record is still queued.
    expect(mockAddJob).toHaveBeenCalledWith('email-dispatch', expect.any(String), expect.any(Object));
  });

  it('does not stamp the lead when the email is for another module', async () => {
    const lead = await makeLead({ email: 'info@foo.ch' });

    await emailService.send({
      to: ['info@foo.ch'],
      subject: 'Rechnung',
      bodyHtml: '<p>Rechnung</p>',
      sourceModule: 'customer',
      sourceRecordId: lead._id,
      senderAddress: 'noreply@test.ch',
      senderName: 'Test',
      createdBy: actor,
    });

    const reloaded = await Lead.findById(lead._id).lean();
    expect(reloaded.lastContactedAt).toBeNull();
    expect(reloaded.lastContactChannel).toBeNull();
  });
});
