import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

/**
 * What holds a project shut, and what does not.
 *
 * The office's own rule is that a project with open work is not finished. The
 * agents then started putting their findings on projects as tasks — missing
 * authority data, an unfiled scan, material not yet ordered — and every one of
 * those would have had to be closed by hand before anyone could report the job
 * done. An agent that can stop a project is no longer proposing.
 */
let Project, Task, statusService, queueManager;
const userId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/site.model.js');
  await import('../../src/modules/qop/department.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/pm/projectStatusHistory.model.js');
  await import('../../src/modules/pm/scheduleEntry.model.js');
  await import('../../src/modules/pm/preparatoryAction.model.js');
  await import('../../src/modules/tasks/task.model.js');
  Project = mongoose.model('Project');
  Task = mongoose.model('Task');
  ({ default: queueManager } = await import('../../src/shared/queue/QueueManager.js'));
  ({ default: statusService } = await import('../../src/modules/pm/status.service.js'));
});

beforeEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
  // A completed transition sends a status e-mail; no worker runs in a test.
  jest.spyOn(queueManager, 'addJob').mockResolvedValue({ id: 'job-1' });
});

afterAll(async () => {
  await disconnectTestDb();
});

async function projectWithTask(source) {
  const project = await Project.create({
    projectNumber: `PRJ-TEST-${Math.floor(Math.random() * 100000)}`,
    name: 'Erdsonde Weber',
    status: 'IN_PROGRESS',
    projectType: 'NEW_INSTALLATION',
    customerId: new mongoose.Types.ObjectId(),
    projectManagerId: userId,
    createdBy: userId,
  });
  await Task.create({
    title: source.type === 'AI_AGENT' ? 'Behördenangaben vervollständigen: Erdsonde Weber' : 'Bohrfirma aufbieten',
    listId: new mongoose.Types.ObjectId(),
    projectId: project._id,
    status: 'OPEN',
    source,
    createdBy: userId,
    assigneeId: userId,
  });
  return project;
}

describe('reporting a project finished', () => {
  test('a colleague’s open task still stops it', async () => {
    const project = await projectWithTask({ type: 'PROJECT' });

    await expect(statusService.transitionStatus(project._id, 'COMPLETED', {}, userId))
      .rejects.toThrow(/1 task\(s\) are still open/);
  });

  test('what an agent proposed does not', async () => {
    const project = await projectWithTask({ type: 'AI_AGENT', label: 'Behörden AI' });

    const transition = await statusService.transitionStatus(project._id, 'COMPLETED', {}, userId);

    expect(transition).toMatchObject({ fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED' });
    expect((await Project.findById(project._id)).status).toBe('COMPLETED');
  });

  test('the agent’s task survives the transition — it is still work', async () => {
    // Not blocking is not the same as not mattering: Quality AI runs after this
    // and adds its own list, and both stay on the project.
    const project = await projectWithTask({ type: 'AI_AGENT', label: 'Behörden AI' });
    await statusService.transitionStatus(project._id, 'COMPLETED', {}, userId);

    const open = await Task.countDocuments({ projectId: project._id, status: 'OPEN' });
    expect(open).toBe(1);
  });

  test('a colleague’s task among the agents’ still stops it', async () => {
    const project = await projectWithTask({ type: 'AI_AGENT', label: 'Material AI' });
    await Task.create({
      title: 'Kunde über Abschluss informieren',
      listId: new mongoose.Types.ObjectId(),
      projectId: project._id,
      status: 'IN_PROGRESS',
      source: { type: 'MANUAL' },
      createdBy: userId,
      assigneeId: userId,
    });

    await expect(statusService.transitionStatus(project._id, 'COMPLETED', {}, userId))
      .rejects.toThrow(/1 task\(s\) are still open/);
  });
});
