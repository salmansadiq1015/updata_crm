import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import agentGovernance from '../../src/modules/ai/governance/agentGovernance.service.js';
import auditService from '../../src/modules/auth/audit.service.js';
import { TASK_SOURCE_TYPES } from '../../src/modules/tasks/task.model.js';

/**
 * The trail an agent leaves when it acts on its own.
 *
 * An action a person asks for leaves a run, a thread and an answer on screen.
 * An action taken off a business event leaves a task and a line in the server
 * log — and nobody watches an event fire. Without a record, an agent switched
 * off last month looks exactly like one that looked and found nothing to say.
 */
let logged;

beforeEach(() => {
  logged = [];
  jest.restoreAllMocks();
  jest.spyOn(auditService, 'logEvent').mockImplementation(async (entry) => { logged.push(entry); });
});

describe('what an agent did unasked is written down', () => {
  test('the entry names the agent, the event, the record and what came of it', async () => {
    await agentGovernance.recordAutonomous({
      agentKey: 'QUALITY',
      trigger: 'project.completed',
      sourceType: 'project',
      sourceId: '6a8ecb11239e8433b335fc25',
      userId: 'user-1',
      produced: { type: 'task', id: 'task-1', title: 'Abschluss unvollständig: Erdsonde Weber' },
    });

    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      eventType: 'ai.agent.autonomous',
      result: 'success',
      module: 'ai',
      userId: 'user-1',
      details: {
        agentKey: 'QUALITY',
        trigger: 'project.completed',
        sourceType: 'project',
        sourceId: '6a8ecb11239e8433b335fc25',
        produced: { type: 'task', id: 'task-1', title: 'Abschluss unvollständig: Erdsonde Weber' },
        blockReason: null,
      },
    });
  });

  test('a refusal is written down too, and reads as blocked', async () => {
    // The whole point: silence has a reason, and the office can ask which.
    await agentGovernance.recordAutonomous({
      agentKey: 'SERVICE',
      trigger: 'maintenance.overdue',
      sourceType: 'maintenance',
      sourceId: null,
      blocked: 'AGENT_DISABLED',
    });

    expect(logged[0]).toMatchObject({
      eventType: 'ai.agent.autonomous.blocked',
      result: 'blocked',
      details: { agentKey: 'SERVICE', blockReason: 'AGENT_DISABLED', produced: null },
    });
  });

  test('an audit failure never stops the agent', async () => {
    // The trail matters; it does not matter more than the work.
    auditService.logEvent.mockRejectedValueOnce(new Error('audit queue down'));
    await expect(agentGovernance.recordAutonomous({
      agentKey: 'MATERIAL', trigger: 'project.scheduled', sourceType: 'project', sourceId: 'p1',
    })).resolves.toBeUndefined();
  });

  test('a long detail is cut rather than filling the audit log', async () => {
    await agentGovernance.recordAutonomous({
      agentKey: 'DOCUMENT', trigger: 'document.uploaded', sourceType: 'projectDocument', sourceId: 'd1',
      detail: 'x'.repeat(1000),
    });
    expect(logged[0].details.detail.length).toBe(300);
  });
});

describe('an agent proposes, it does not commit', () => {
  test('a task an agent made is marked as such', () => {
    expect(TASK_SOURCE_TYPES).toContain('AI_AGENT');
  });
});
