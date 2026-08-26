import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import agentGovernance from '../../src/modules/ai/governance/agentGovernance.service.js';
import { RISK_LEVELS } from '../../src/modules/ai/governance/agent.risk.js';

/**
 * The gate in front of every agent action.
 *
 * Two questions live here and they are answered from different places: whether
 * the action may run at all, which the register decides whoever asked, and
 * whether a person has to approve it, which depends on who started it. Getting
 * the two confused is how an office ends up either approving "zeig mir die
 * fälligen Wartungen" or finding that a switch marked "aus" changed nothing.
 */
const AGENTS = [
  {
    key: 'QUALITY',
    name: 'Quality AI',
    priority: 14,
    isEnabled: true,
    allowedActions: ['CREATE_TASK', 'QUALITY_CHECK'],
    forbiddenActions: ['CREATE_INVOICE', 'DELETE_PROJECT'],
    approvalRule: RISK_LEVELS.LOW,
  },
  {
    key: 'PROJEKT',
    name: 'Projekt AI',
    priority: 4,
    isEnabled: true,
    allowedActions: ['CREATE_PROJECT', 'CREATE_TASK'],
    forbiddenActions: [],
    approvalRule: RISK_LEVELS.MEDIUM,
  },
  {
    key: 'MONEY',
    name: 'Money AI',
    priority: 8,
    isEnabled: true,
    allowedActions: ['CREATE_INVOICE'],
    forbiddenActions: [],
    approvalRule: RISK_LEVELS.LOW,
  },
];

/** The register as the cache holds it, without going near a database. */
function register(agents = AGENTS) {
  const byKey = new Map();
  const byAction = new Map();
  for (const agent of agents) {
    byKey.set(agent.key, agent);
    for (const action of agent.allowedActions) {
      const current = byAction.get(action);
      if (!current || agent.priority < current.priority) byAction.set(action, agent);
    }
  }
  jest.spyOn(agentGovernance, '_registry').mockResolvedValue({ at: Date.now(), byKey, byAction });
  return agents;
}

function withAgent(key, changes) {
  return AGENTS.map((agent) => (agent.key === key ? { ...agent, ...changes } : agent));
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(agentGovernance, 'isEmergencyStopped').mockResolvedValue(false);
});

describe('a switch marked off means off', () => {
  test('an agent that is switched off does not answer in the chat either', async () => {
    // To the person who threw the switch there is no difference between an
    // agent that misbehaves by itself and one that misbehaves when asked.
    register(withAgent('QUALITY', { isEnabled: false, disabledReason: 'liefert falsche Listen' }));

    const decision = await agentGovernance.evaluate('QUALITY_CHECK', {});

    expect(decision.allowed).toBe(false);
    expect(decision.agentKey).toBe('QUALITY');
    expect(decision.block.message).toContain('Quality AI ist ausgeschaltet');
    expect(decision.block.message).toContain('liefert falsche Listen');
  });

  test('the block says where the switch is, because the reader can usually undo it', async () => {
    register(withAgent('QUALITY', { isEnabled: false }));
    const decision = await agentGovernance.evaluate('QUALITY_CHECK', {});

    expect(decision.block.message).toContain('KI-Agenten');
  });

  test('it stops the agent acting on its own too', async () => {
    register(withAgent('QUALITY', { isEnabled: false }));
    expect((await agentGovernance.evaluate('QUALITY_CHECK', { agentKey: 'QUALITY' })).allowed).toBe(false);
  });

  test('switching one agent off leaves the others working', async () => {
    register(withAgent('QUALITY', { isEnabled: false }));

    expect((await agentGovernance.evaluate('CREATE_PROJECT', {})).allowed).toBe(true);
    // CREATE_TASK is claimed by both, and the register hands it to the one
    // with the higher priority — which is still on.
    expect((await agentGovernance.evaluate('CREATE_TASK', {})).agentKey).toBe('PROJEKT');
    expect((await agentGovernance.evaluate('CREATE_TASK', {})).allowed).toBe(true);
  });

  test('an action no agent claims belongs to the assistant, and no switch governs it', async () => {
    // Nobody declares SEARCH_CUSTOMER: looking a customer up is the assistant
    // itself, not an agent, and switching agents off must not make the
    // assistant mute.
    register(AGENTS.map((agent) => ({ ...agent, isEnabled: false })));

    const decision = await agentGovernance.evaluate('SEARCH_CUSTOMER', {});
    expect(decision.allowed).toBe(true);
    expect(decision.agentKey).toBeNull();
  });
});

describe('what an agent may never do stays refused', () => {
  test('a forbidden action is refused even to a person who asks for it', async () => {
    register();
    // Quality AI forbids invoicing outright, and CREATE_INVOICE belongs to
    // Money AI — so this is a proactive Quality AI run overstepping.
    const decision = await agentGovernance.evaluate('CREATE_INVOICE', { agentKey: 'QUALITY' });

    expect(decision.allowed).toBe(false);
    expect(decision.block.message).toContain('nicht zugelassen');
  });

  test('the emergency stop outranks every switch and every rule', async () => {
    register();
    jest.spyOn(agentGovernance, 'isEmergencyStopped').mockResolvedValue(true);

    for (const action of ['QUALITY_CHECK', 'SEARCH_CUSTOMER', 'CREATE_INVOICE']) {
      const decision = await agentGovernance.evaluate(action, { confirmed: true });
      expect(decision.allowed).toBe(false);
      expect(decision.block.message).toContain('Notfall-Stopp');
    }
  });
});

describe('who has to approve depends on who started it', () => {
  test('a person reading gets an answer, not a confirmation prompt', async () => {
    // Quality AI demands approval from LOW upward, which is what keeps it from
    // acting unwatched. Applying that to a typed question would make the office
    // approve "kann ich das abschliessen?" before it could be answered.
    register();
    const decision = await agentGovernance.evaluate('QUALITY_CHECK', {});

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
  });

  test('the same agent acting on its own is held to its own rule', async () => {
    register();
    const decision = await agentGovernance.evaluate('CREATE_TASK', { agentKey: 'QUALITY' });

    expect(decision.riskLevel).toBe(RISK_LEVELS.LOW);
    expect(decision.requiresApproval).toBe(true);
  });

  test('anything binding still asks first, however it was started', async () => {
    register();
    for (const context of [{}, { agentKey: 'MONEY' }]) {
      const decision = await agentGovernance.evaluate('CREATE_INVOICE', context);
      expect(decision.requiresApproval).toBe(true);
    }
  });

  test('an approval already given is not asked for twice', async () => {
    register();
    expect((await agentGovernance.evaluate('CREATE_INVOICE', { confirmed: true })).requiresApproval).toBe(false);
  });

  test('an action nobody classified is treated as the most dangerous kind', async () => {
    // A new action that reaches production before its risk level does must not
    // slip through as harmless.
    register();
    const decision = await agentGovernance.evaluate('DROP_EVERYTHING', {});

    expect(decision.riskLevel).toBe(RISK_LEVELS.CRITICAL);
    expect(decision.requiresApproval).toBe(true);
  });
});

describe('the register is what names the agent', () => {
  test('every decision carries the agent the action belongs to', async () => {
    register();
    expect((await agentGovernance.evaluate('QUALITY_CHECK', {})).agentKey).toBe('QUALITY');
    expect((await agentGovernance.evaluate('CREATE_INVOICE', {})).agentKey).toBe('MONEY');
  });

  test('an agent named by the caller outranks the register', async () => {
    // A proactive run says who it is; the register is only consulted when
    // nobody said.
    register();
    expect((await agentGovernance.evaluate('CREATE_TASK', { agentKey: 'QUALITY' })).agentKey).toBe('QUALITY');
  });
});
