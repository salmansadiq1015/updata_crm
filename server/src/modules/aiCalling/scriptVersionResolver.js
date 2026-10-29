import { AgentScriptVersion, ScriptActivation, ScriptExperiment } from './scriptExperiment.model.js';
import { agentConfigSchema } from './callCampaign.model.js';
import { assignArm, contentHash } from './engine/experimentStats.js';
import logger from '../../shared/logger/index.js';

/**
 * Which agent script a call runs, decided once at dispatch and stamped on the CallRecord.
 *
 *  - The agent has a running experiment that covers this campaign → the lead's arm
 *    (deterministic per lead + experiment) and that arm's version. The call then runs
 *    the version's agentConfig (applyScriptVersion), so the arm is what was spoken.
 *  - Otherwise → the agent's active version, stamped only when it is provably what the
 *    campaign runs (identical agentConfig); else nothing is stamped (attribution unknown).
 *
 * Experiments vary the agentConfig (prompt, objective, style, disclosure, voice,
 * language); arms must share the questionnaire and status rules, so answers and
 * outcomes stay comparable (enforced when an experiment starts).
 */

const AGENT_CONFIG_KEYS = Object.keys(agentConfigSchema.paths).filter(k => !k.includes('.') && k !== '_id');
export const pickAgentConfig = (config = {}) => Object.fromEntries(AGENT_CONFIG_KEYS.filter(k => config?.[k] !== undefined).map(k => [k, config[k]]));
export const agentConfigHash = config => contentHash(pickAgentConfig(config));

const NONE = Object.freeze({ stamp: {}, agentConfig: null });
const cache = new Map(); // versions are immutable: safe to keep
async function loadVersion(id) {
  const key = String(id);
  if (cache.has(key)) return cache.get(key);
  const version = await AgentScriptVersion.findById(id).select('snapshot.agentConfig agentConfigHash').lean();
  if (version) { cache.set(key, version); if (cache.size > 500) cache.delete(cache.keys().next().value); }
  return version;
}

export async function activeVersionId(agentId) {
  const latest = await ScriptActivation.findOne({ agentId }).sort({ createdAt: -1, _id: -1 }).select('versionId').lean();
  return latest?.versionId || null;
}

export async function resolveScriptVersion(campaign, leadId) {
  try {
    if (!campaign?.agentId || campaign.isTest) return NONE;
    const experiment = await ScriptExperiment.findOne({ agentId: campaign.agentId, status: 'running' }).select('_id arms campaignIds').lean();
    const eligible = experiment && (!experiment.campaignIds?.length || experiment.campaignIds.some(id => String(id) === String(campaign._id)));
    if (eligible) {
      const arm = assignArm(experiment.arms, String(leadId), String(experiment._id));
      const version = arm && await loadVersion(arm.versionId);
      if (version) return { stamp: { scriptVersionId: arm.versionId, experimentId: experiment._id, arm: arm.key }, agentConfig: version.snapshot?.agentConfig || null };
    }
    const activeId = await activeVersionId(campaign.agentId);
    if (!activeId) return NONE;
    const active = await loadVersion(activeId);
    if (active && active.agentConfigHash === agentConfigHash(campaign.agentConfig)) return { stamp: { scriptVersionId: activeId }, agentConfig: null };
    return NONE;
  } catch (error) {
    // Attribution must never block a dial: the call runs the campaign's own script.
    logger.warn('script version resolution failed; using the campaign script', { module: 'ai-calling', error: error?.message });
    return NONE;
  }
}

/** The campaign as an experiment call sees it: the arm's agentConfig over the campaign's. */
export async function applyScriptVersion(campaign, call) {
  if (!campaign || !call?.experimentId || !call?.scriptVersionId) return campaign;
  const version = await loadVersion(call.scriptVersionId);
  if (!version?.snapshot?.agentConfig) return campaign;
  return { ...campaign, agentConfig: { ...(campaign.agentConfig || {}), ...pickAgentConfig(version.snapshot.agentConfig) } };
}

export const __test__ = { clearCache: () => cache.clear() };
