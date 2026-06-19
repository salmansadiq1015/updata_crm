import mongoose from 'mongoose';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let Assignment;
let ChatMessage;
let Permission;
let Project;
let Role;
let Task;
let User;
let chatAccessService;
let chatMessageService;
let chatRoomService;
let mobileChatService;
let eventBus;
let EVENT_TYPES;

beforeAll(async () => {
  await connectTestDb();
  ({ default: Permission } = await import('../../src/modules/auth/permission.model.js'));
  ({ default: Role } = await import('../../src/modules/auth/role.model.js'));
  ({ default: User } = await import('../../src/modules/auth/user.model.js'));
  ({ default: Project } = await import('../../src/modules/pm/project.model.js'));
  ({ default: Task } = await import('../../src/modules/tasks/task.model.js'));
  ({ default: Assignment } = await import('../../src/modules/deploy/assignment.model.js'));
  await import('../../src/modules/files/file.model.js');
  ({ default: ChatMessage } = await import('../../src/modules/mobile/chatMessage.model.js'));
  ({ default: chatAccessService } = await import('../../src/modules/chat/chatAccess.service.js'));
  ({ default: chatMessageService } = await import('../../src/modules/chat/chatMessage.service.js'));
  ({ default: chatRoomService } = await import('../../src/modules/chat/chatRoom.service.js'));
  ({ default: mobileChatService } = await import('../../src/modules/mobile/chat.service.js'));
  ({ default: eventBus } = await import('../../src/shared/events/EventBus.js'));
  ({ default: EVENT_TYPES } = await import('../../src/shared/events/eventTypes.js'));
});

afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

function objectId() {
  return new mongoose.Types.ObjectId();
}

async function createUser(role, suffix) {
  return User.create({
    email: `${suffix}@example.com`,
    passwordHash: 'hash',
    firstName: suffix,
    lastName: 'User',
    role: role._id,
    status: 'active',
  });
}

async function createFixture() {
  const permission = await Permission.create({ module: 'chat', action: 'write', description: 'Chat write' });
  const role = await Role.create({ name: `Techniker-${Date.now()}`, permissions: [permission._id] });

  const manager = await createUser(role, 'manager');
  const technician = await createUser(role, 'technician');
  const outsider = await createUser(role, 'outsider');
  const customerId = objectId();

  const project = await Project.create({
    projectNumber: `PR-${Date.now()}`,
    name: 'Heating Retrofit',
    projectType: 'MAINTENANCE',
    customerId,
    projectManagerId: manager._id,
    createdBy: manager._id,
  });

  await Assignment.create({
    assignmentNumber: `A-${Date.now()}`,
    employeeId: technician._id,
    projectId: project._id,
    assignmentType: 'PROJECT_WORK',
    startDatetime: new Date('2026-06-19T08:00:00.000Z'),
    endDatetime: new Date('2026-06-19T10:00:00.000Z'),
    createdBy: manager._id,
  });

  await Task.create({
    title: 'Inspect boiler pressure',
    listId: objectId(),
    projectId: project._id,
    assigneeId: technician._id,
    createdBy: manager._id,
  });

  return { manager, technician, outsider, project };
}

describe('communication chat access', () => {
  test('resolves project participants and denies unrelated users', async () => {
    const { manager, technician, outsider, project } = await createFixture();

    const participants = await chatAccessService.resolveProjectParticipantIds(project._id);

    expect(participants).toEqual(expect.arrayContaining([
      String(manager._id),
      String(technician._id),
    ]));

    await expect(
      chatAccessService.assertContextAccess({ projectId: project._id }, outsider),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('hydrates project rooms, searches only authorized messages, and publishes chat recipients', async () => {
    const { manager, technician, outsider, project } = await createFixture();
    const publishSpy = jest.spyOn(eventBus, 'publish');

    const room = await chatRoomService.getOrCreateProjectRoom(project._id, manager);
    const memberIds = room.members.map((member) => String(member.userId?._id ?? member.userId));

    expect(memberIds).toEqual(expect.arrayContaining([
      String(manager._id),
      String(technician._id),
    ]));

    const message = await chatMessageService.sendMessage(room._id, {
      content: 'Pump pressure needs review',
      messageType: 'TEXT',
      mentions: [technician._id],
    }, manager);

    const results = await chatMessageService.searchMessages(manager, {
      q: 'pressure',
      projectId: project._id,
    });

    expect(results.map((result) => String(result._id))).toContain(String(message._id));
    await expect(
      chatMessageService.searchMessages(outsider, { q: 'pressure', projectId: project._id }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(publishSpy).toHaveBeenCalledWith(
      EVENT_TYPES.MOBILE_CHAT_MESSAGE_SENT,
      expect.objectContaining({
        content: 'Pump pressure needs review',
        projectId: expect.anything(),
        projectTeamIds: expect.arrayContaining([
          String(manager._id),
          String(technician._id),
        ]),
      }),
      expect.objectContaining({ source: 'chat' }),
    );
  });

  test('mobile chat sends recipient payloads and tracks read receipts', async () => {
    const { manager, technician, project } = await createFixture();
    const publishSpy = jest.spyOn(eventBus, 'publish');

    const message = await mobileChatService.sendMessage(project._id, {
      content: 'Mobile attachment-ready message',
      messageType: 'TEXT',
    }, manager);

    await mobileChatService.markAsRead(message._id, technician, { ipAddress: '127.0.0.1' });
    const stored = await ChatMessage.findById(message._id).lean();

    expect(stored.readBy.map((entry) => String(entry.userId))).toContain(String(technician._id));
    expect(publishSpy).toHaveBeenCalledWith(
      EVENT_TYPES.MOBILE_CHAT_MESSAGE_SENT,
      expect.objectContaining({
        content: 'Mobile attachment-ready message',
        projectTeamIds: expect.arrayContaining([
          String(manager._id),
          String(technician._id),
        ]),
      }),
      expect.objectContaining({ source: 'mobile:chat' }),
    );
  });
});
