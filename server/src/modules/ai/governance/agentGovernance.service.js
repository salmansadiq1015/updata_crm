/**
 * Gatekeeper in front of every agent action.
 *
 * Answers one question — may this action run right now, and on whose
 * authority — by combining the emergency stop, the per-agent kill switch, the
 * agent's declared forbidden actions and the risk level of the action itself.
 *
 * It only ever blocks, warns or demands approval; it never approves anything
 * on its own, which is the rule the specification sets for Risk AI.
 */
import mongoose from 'mongoose';
import AgentRegistry from './agentRegistry.model.js';
import AgentGovernance from './agentGovernance.model.js';
import {
  RISK_LEVELS,
  RISK_LEVEL_ORDER,
  BLOCK_REASONS,
  riskLevelFor,
  blocked,
} from './agent.risk.js';
import auditService from '../../auth/audit.service.js';
import logger from '../../../shared/logger/index.js';

const REGISTRY_TTL_MS = 30_000;

/**
 * Mongoose buffers queries for 10s when the connection is down, which would
 * stall every agent action behind the governance lookup. Checking the
 * connection first turns that into an instant fall-back to the cache.
 */
function isDbReachable() {
  return mongoose.connection?.readyState === 1;
}

class AgentGovernanceService {
  constructor() {
    this._cache = { at: 0, byKey: new Map(), byAction: new Map() };
    this._stopCache = { at: 0, value: null };
  }

  /**
   * Registry snapshot, refreshed at most twice a minute.
   *
   * A database hiccup must not hang or crash every agent action, so a failed
   * read falls back to the last snapshot. The risk-based approval rule is pure
   * in-memory logic and keeps applying either way.
   */
  async _registry() {
    if (Date.now() - this._cache.at < REGISTRY_TTL_MS && this._cache.byKey.size) {
      return this._cache;
    }
    if (!isDbReachable()) return this._cache;
    let agents;
    try {
      agents = await AgentRegistry.find({}).lean();
    } catch (err) {
      logger.warn('Agent registry unavailable, using last known snapshot', {
        module: 'ai-governance',
        action: 'registry',
        error: err.message,
      });
      return this._cache;
    }
    const byKey = new Map();
    const byAction = new Map();
    for (const agent of agents) {
      byKey.set(agent.key, agent);
      for (const action of agent.allowedActions || []) {
        // First agent in priority order owns the action.
        const current = byAction.get(action);
        if (!current || (agent.priority ?? 100) < (current.priority ?? 100)) {
          byAction.set(action, agent);
        }
      }
    }
    this._cache = { at: Date.now(), byKey, byAction };
    return this._cache;
  }

  invalidate() {
    this._cache = { at: 0, byKey: new Map(), byAction: new Map() };
    this._stopCache = { at: 0, value: null };
  }

  async getGovernance() {
    let doc = await AgentGovernance.findOne({ singleton: 'GLOBAL' });
    if (!doc) {
      doc = await AgentGovernance.findOneAndUpdate(
        { singleton: 'GLOBAL' },
        { $setOnInsert: { emergencyStop: false } },
        { upsert: true, new: true },
      );
    }
    return doc;
  }

  async isEmergencyStopped() {
    if (Date.now() - this._stopCache.at < REGISTRY_TTL_MS && this._stopCache.value !== null) {
      return this._stopCache.value;
    }
    if (!isDbReachable()) return this._stopCache.value === null ? false : this._stopCache.value;
    try {
      const doc = await this.getGovernance();
      this._stopCache = { at: Date.now(), value: Boolean(doc?.emergencyStop) };
    } catch (err) {
      logger.warn('Emergency-stop state unavailable, keeping last known value', {
        module: 'ai-governance',
        action: 'isEmergencyStopped',
        lastKnown: this._stopCache.value,
        error: err.message,
      });
      return this._stopCache.value === null ? false : this._stopCache.value;
    }
    return this._stopCache.value;
  }

  /** Which agent owns this action, if any is declared for it. */
  async agentForAction(action) {
    const { byAction } = await this._registry();
    return byAction.get(action) || null;
  }

  /**
   * The decision for one action.
   *
   * Two questions, answered from two different places.
   *
   * *May this run at all* is the agent's own question, and the register
   * answers it whoever asked. A switch marked "aus" in the office means the
   * agent is silent — on its own triggers and in the chat alike, because to
   * the person who threw the switch there is no difference between an agent
   * that misbehaves by itself and one that misbehaves when asked. Which agent
   * an action belongs to comes from `allowedActions` when the caller did not
   * say; an action no agent claims belongs to the assistant itself and no
   * switch governs it.
   *
   * *Does a person have to approve it* depends on who started it. `agentKey`
   * is set when an agent acts on its own initiative (event trigger, job), and
   * such an agent is held to its own rule, which is often stricter than the
   * house threshold — that rule exists to limit what it may do unwatched.
   * A person typing in the chat is already watching, so the house threshold
   * applies: reading answers, and anything binding still asks first.
   *
   * @returns {Promise<{allowed: boolean, requiresApproval: boolean, riskLevel: string,
   *                    agentKey: string|null, block?: object}>}
   */
  async evaluate(action, { confirmed = false, agentKey = null } = {}) {
    const riskLevel = riskLevelFor(action);
    const proactive = Boolean(agentKey);

    let agent;
    if (proactive) {
      const { byKey } = await this._registry();
      agent = byKey.get(String(agentKey).toUpperCase()) || null;
    } else {
      agent = await this.agentForAction(action);
    }

    if (await this.isEmergencyStopped()) {
      return {
        allowed: false,
        requiresApproval: false,
        riskLevel,
        agentKey: agent?.key || agentKey || null,
        block: blocked(action, BLOCK_REASONS.MISSING_APPROVAL, {
          message: 'Der Notfall-Stopp ist aktiv. Es werden zurzeit keine KI-Aktionen ausgeführt.',
        }),
      };
    }

    if (agent && (agent.forbiddenActions || []).includes(action)) {
      return {
        allowed: false,
        requiresApproval: false,
        riskLevel,
        agentKey: agent.key,
        block: blocked(action, BLOCK_REASONS.MISSING_APPROVAL, {
          message: `Diese Aktion ist für ${agent.name} ausdrücklich nicht zugelassen.`,
        }),
      };
    }

    if (agent && !agent.isEnabled) {
      return {
        allowed: false,
        requiresApproval: false,
        riskLevel,
        agentKey: agent.key,
        block: blocked(action, BLOCK_REASONS.MISSING_APPROVAL, {
          // Names the screen, because the person reading this is usually the
          // one who can undo it.
          message: `${agent.name} ist ausgeschaltet${agent.disabledReason ? ` (${agent.disabledReason})` : ''} — einschalten unter Verwaltung › KI-Assistent › KI-Agenten.`,
        }),
      };
    }

    const threshold = (proactive && agent?.approvalRule) || RISK_LEVELS.MEDIUM;
    const needsApproval =
      RISK_LEVEL_ORDER.indexOf(riskLevel) >= RISK_LEVEL_ORDER.indexOf(threshold);

    return {
      allowed: true,
      requiresApproval: needsApproval && !confirmed,
      riskLevel,
      agentKey: agent?.key || null,
    };
  }

  /** Records a blocked or approval-pending decision in the audit trail. */
  async record(decision, { action, userId, agentRunId, input }) {
    try {
      await auditService.logEvent({
        eventType: decision.allowed ? 'ai.agent.approval.required' : 'ai.agent.blocked',
        userId,
        ipAddress: 'internal',
        result: decision.allowed ? 'success' : 'blocked',
        details: {
          action,
          agentRunId,
          agentKey: decision.agentKey,
          riskLevel: decision.riskLevel,
          blockReason: decision.block?.blockReason || null,
          input: String(input || '').slice(0, 200),
        },
        module: 'ai',
      });
    } catch (err) {
      logger.warn('Failed to record agent governance decision', {
        module: 'ai-governance',
        action: 'record',
        error: err.message,
      });
    }
  }

  // ─── Admin operations ──────────────────────────────────────

  async listAgents() {
    return AgentRegistry.find({}).sort({ priority: 1 }).lean();
  }

  async setEnabled(key, isEnabled, userId, reason = null) {
    const update = isEnabled
      ? { isEnabled: true, disabledReason: null, disabledAt: null, disabledBy: null }
      : { isEnabled: false, disabledReason: reason, disabledAt: new Date(), disabledBy: userId };
    const agent = await AgentRegistry.findOneAndUpdate(
      { key: String(key).toUpperCase() },
      { $set: update },
      { new: true },
    );
    this.invalidate();
    if (agent) {
      await auditService.logEvent({
        eventType: isEnabled ? 'ai.agent.enabled' : 'ai.agent.disabled',
        userId,
        ipAddress: 'internal',
        result: 'success',
        details: { agentKey: agent.key, reason },
        module: 'ai',
      });
    }
    return agent;
  }

  async setEmergencyStop(active, userId, reason = null) {
    const doc = await AgentGovernance.findOneAndUpdate(
      { singleton: 'GLOBAL' },
      {
        $set: {
          emergencyStop: Boolean(active),
          emergencyStopReason: active ? reason : null,
          emergencyStopAt: active ? new Date() : null,
          emergencyStopBy: active ? userId : null,
        },
      },
      { upsert: true, new: true },
    );
    this.invalidate();
    await auditService.logEvent({
      eventType: active ? 'ai.emergency_stop.activated' : 'ai.emergency_stop.released',
      userId,
      ipAddress: 'internal',
      result: 'success',
      details: { reason },
      module: 'ai',
    });
    logger.warn(active ? 'AI emergency stop ACTIVATED' : 'AI emergency stop released', {
      module: 'ai-governance',
      action: 'setEmergencyStop',
      userId: String(userId),
      reason,
    });
    return doc;
  }
}

export default new AgentGovernanceService();
