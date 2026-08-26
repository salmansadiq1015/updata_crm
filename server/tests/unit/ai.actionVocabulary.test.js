import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import {
  ACTION_LABELS,
  BLOCK_REASONS,
  RISK_LEVELS,
  RISK_LEVEL_ORDER,
  riskLevelFor,
  requiresApproval,
} from '../../src/modules/ai/governance/agent.risk.js';
import { PERMISSION_DEFINITIONS } from '../../src/seed/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SRC = path.resolve(__dirname, '../../src');

/**
 * The vocabulary the whole agent layer is written in.
 *
 * Every screen the office reads — the register, the confirmation prompt, the
 * blocked message — renders these three lists. A gap in one of them does not
 * fail: it prints a raw CREATE_INVOICE at somebody, or asks for approval
 * without saying what for. These tests are here so that a new action cannot
 * reach production half-declared.
 */
function read(relative) {
  return readFileSync(path.join(SERVER_SRC, relative), 'utf8');
}

/** Action names as the risk map itself spells them. */
function classifiedActions() {
  const source = read('modules/ai/governance/agent.risk.js');
  const block = source.match(/const ACTION_RISK = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  expect(block).not.toBeNull();
  return [...block[1].matchAll(/^ {2}([A-Z_]+):/gm)].map((match) => match[1]);
}

/** Everything the seed declares an agent may do. */
function declaredActions() {
  const source = read('seed/agentRegistrySeed.js');
  return [...new Set(
    [...source.matchAll(/(?:allowed|forbidden)Actions: \[([^\]]*)\]/g)]
      .flatMap((match) => [...match[1].matchAll(/'([A-Z_]+)'/g)].map((inner) => inner[1])),
  )];
}

describe('every action the system knows can be spoken about', () => {
  test('a classified action has wording the office can read', () => {
    // SEND_NOTIFICATION had none: the register showed the bare code, and the
    // approval prompt dropped "Ich soll …" entirely — so the office was asked
    // to approve something the message never named.
    const missing = classifiedActions().filter((action) => !ACTION_LABELS[action]);
    expect(missing).toEqual([]);
  });

  test('the wording is a phrase, not the code with the underscores taken out', () => {
    for (const [action, label] of Object.entries(ACTION_LABELS)) {
      expect(action).toMatch(/^[A-Z_]+$/);
      expect(typeof label).toBe('string');
      // The same string follows "Ich soll" in the approval prompt and "Darf:"
      // on the register, so it has to be several words of German — a noun
      // starting it is normal, a SHOUTING_CODE inside it is not.
      expect(label.trim().split(/\s+/).length).toBeGreaterThan(1);
      expect(label).not.toMatch(/[A-Z]{2,}_|_[A-Z]{2,}/);
      expect(label).not.toBe(action);
    }
  });

  test('wording without a risk level would be an action nothing governs', () => {
    const classified = new Set(classifiedActions());
    const orphans = Object.keys(ACTION_LABELS).filter((action) => !classified.has(action));
    expect(orphans).toEqual([]);
  });
});

describe('the register declares only what the system understands', () => {
  test('every declared action is classified, so none is silently critical', () => {
    // An unclassified action is treated as CRITICAL, which is safe but reads
    // as a permanent approval prompt nobody can explain.
    const classified = new Set(classifiedActions());
    const undeclared = declaredActions().filter((action) => !classified.has(action));
    expect(undeclared).toEqual([]);
  });

  test('no agent is allowed and forbidden the same action', () => {
    const source = read('seed/agentRegistrySeed.js');
    const conflicts = [];
    for (const block of source.split(/\n  \{\n/).slice(1)) {
      const key = block.match(/key: '([A-Z]+)'/)?.[1];
      const listed = (name) => {
        const match = block.match(new RegExp(`${name}Actions: \\[([^\\]]*)\\]`));
        return match ? [...match[1].matchAll(/'([A-Z_]+)'/g)].map((inner) => inner[1]) : [];
      };
      const allowed = new Set(listed('allowed'));
      for (const action of listed('forbidden')) {
        if (allowed.has(action)) conflicts.push(`${key}: ${action}`);
      }
    }
    expect(conflicts).toEqual([]);
  });

  test('every blocking reason an agent declares is one of the twelve', () => {
    const source = read('seed/agentRegistrySeed.js');
    const known = new Set(Object.values(BLOCK_REASONS));
    const used = [...source.matchAll(/B\.([A-Z_]+)/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const reason of used) expect(known.has(reason)).toBe(true);
  });

  test('every handoff points at an agent that exists', () => {
    const source = read('seed/agentRegistrySeed.js');
    const keys = new Set([...source.matchAll(/key: '([A-Z]+)'/g)].map((match) => match[1]));
    const targets = [...new Set(
      [...source.matchAll(/handoffTo: \[([^\]]*)\]/g)]
        .flatMap((match) => [...match[1].matchAll(/'([A-Z]+)'/g)].map((inner) => inner[1])),
    )];
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(keys.has(target)).toBe(true);
  });
});

describe('the risk levels mean what the doctrine says', () => {
  test('an action nobody classified is critical, not harmless', () => {
    expect(riskLevelFor('SOMETHING_NEW')).toBe(RISK_LEVELS.CRITICAL);
    expect(requiresApproval('SOMETHING_NEW')).toBe(true);
  });

  test('reading is never binding', () => {
    const reads = classifiedActions().filter((action) => /^(SEARCH|.*_CHECK|.*_ASK|.*_FIGURES|SERVICE_DUE|SERVICE_BRIEFING|DISPATCH_SUGGEST|SALES_FOLLOWUPS|SUMMARIZE_CHAT)/.test(action));
    expect(reads.length).toBeGreaterThan(10);
    for (const action of reads) {
      expect(riskLevelFor(action)).toBe(RISK_LEVELS.LOW);
      expect(requiresApproval(action)).toBe(false);
    }
  });

  test('anything that leaves the house, moves money or deletes asks first', () => {
    for (const action of [
      'SEND_CHAT', 'SEND_NOTIFICATION', 'CREATE_QUOTATION', 'CREATE_INVOICE',
      'CREATE_ASSIGNMENT', 'RESCHEDULE_ASSIGNMENT',
      'DELETE_CUSTOMER', 'DELETE_PROJECT', 'DELETE_ORDER', 'DELETE_REPORT', 'DELETE_ASSIGNMENT',
    ]) {
      expect(requiresApproval(action)).toBe(true);
    }
  });

  test('deleting is the most serious thing an agent can propose', () => {
    for (const action of classifiedActions().filter((a) => a.startsWith('DELETE_'))) {
      expect(riskLevelFor(action)).toBe(RISK_LEVELS.CRITICAL);
    }
  });

  test('the levels are ordered, which is what every comparison relies on', () => {
    expect(RISK_LEVEL_ORDER).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    expect(new Set(RISK_LEVEL_ORDER)).toEqual(new Set(Object.values(RISK_LEVELS)));
  });
});

describe('the agent screens are reachable', () => {
  test('the permission guarding the register is one somebody can be granted', () => {
    const source = read('modules/ai/governance/agentGovernance.routes.js');
    const guard = source.match(/requirePermission\('([^']+)'\)/)?.[1];
    expect(guard).toBe('ai:agents:manage');

    const seeded = new Set(PERMISSION_DEFINITIONS.map((d) => `${d.module}:${d.action}`));
    expect(seeded.has(guard)).toBe(true);
  });
});
