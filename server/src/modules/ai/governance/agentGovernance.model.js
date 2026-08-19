import mongoose from 'mongoose';

/**
 * Single document holding the fleet-wide AI switches.
 *
 * The emergency stop ("Notfall-Stopp") is a Risk AI requirement: one switch
 * that halts every agent at once, independently of the per-agent kill
 * switches, without touching configuration or redeploying.
 */
const agentGovernanceSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'GLOBAL', unique: true, immutable: true },
    emergencyStop: { type: Boolean, default: false },
    emergencyStopReason: { type: String, default: null, maxlength: 500 },
    emergencyStopAt: { type: Date, default: null },
    emergencyStopBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const AgentGovernance = mongoose.model('AgentGovernance', agentGovernanceSchema);
export default AgentGovernance;
