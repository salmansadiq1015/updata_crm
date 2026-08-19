import agentGovernanceService from './agentGovernance.service.js';
import {
  RISK_LEVELS,
  RISK_LEVEL_LABELS,
  BLOCK_REASONS,
  BLOCK_REASON_LABELS,
} from './agent.risk.js';

class AgentGovernanceController {
  async list(req, res, next) {
    try {
      const [agents, governance] = await Promise.all([
        agentGovernanceService.listAgents(),
        agentGovernanceService.getGovernance(),
      ]);
      res.success({
        data: {
          agents,
          emergencyStop: {
            active: Boolean(governance?.emergencyStop),
            reason: governance?.emergencyStopReason || null,
            at: governance?.emergencyStopAt || null,
          },
          riskLevels: Object.values(RISK_LEVELS).map((level) => ({
            level,
            label: RISK_LEVEL_LABELS[level],
          })),
          blockReasons: Object.values(BLOCK_REASONS).map((reason) => ({
            reason,
            label: BLOCK_REASON_LABELS[reason],
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async setEnabled(req, res, next) {
    try {
      const agent = await agentGovernanceService.setEnabled(
        req.params.key,
        req.body.isEnabled,
        req.user._id,
        req.body.reason || null,
      );
      if (!agent) {
        return res.status(404).json({ success: false, error: { message: 'Agent not found' } });
      }
      res.success({
        data: agent,
        message: req.body.isEnabled ? 'Agent aktiviert' : 'Agent deaktiviert',
      });
    } catch (err) {
      next(err);
    }
  }

  async emergencyStop(req, res, next) {
    try {
      const governance = await agentGovernanceService.setEmergencyStop(
        req.body.active,
        req.user._id,
        req.body.reason || null,
      );
      res.success({
        data: {
          active: governance.emergencyStop,
          reason: governance.emergencyStopReason,
          at: governance.emergencyStopAt,
        },
        message: req.body.active ? 'Notfall-Stopp aktiviert' : 'Notfall-Stopp aufgehoben',
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new AgentGovernanceController();
