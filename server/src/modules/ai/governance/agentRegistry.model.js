import mongoose from 'mongoose';
import { RISK_LEVELS, BLOCK_REASONS } from './agent.risk.js';

/**
 * Declarative registry of the AI agents, one document per agent.
 *
 * The 09.05.2026 specification requires each agent to be described by a fixed
 * set of fields — purpose, allowed data sources, allowed and forbidden
 * actions, triggers, required data, blocking states, approval rules, output
 * types, handoffs and audit — rather than being hard-coded. It also requires
 * that every agent can be switched off individually, "insbesondere falls
 * dieser viele Fehler macht".
 */
const agentRegistrySchema = new mongoose.Schema(
  {
    // Agent-Name
    key: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Zweck
    purpose: { type: String, default: '', maxlength: 1000 },
    // Reihenfolge entspricht der Wichtigkeit — the client's own ranking.
    priority: { type: Number, default: 100 },

    // Kill-switch (C1). A disabled agent refuses to run and says so.
    isEnabled: { type: Boolean, default: false },
    disabledReason: { type: String, default: null, maxlength: 500 },
    disabledAt: { type: Date, default: null },
    disabledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Erlaubte Datenquellen
    dataSources: [{ type: String, trim: true, maxlength: 80 }],
    // Erlaubte Aktionen
    allowedActions: [{ type: String, trim: true, uppercase: true, maxlength: 60 }],
    // Verbotene Aktionen — checked before allowedActions, so a forbidden
    // action stays forbidden even if it is listed as allowed by mistake.
    forbiddenActions: [{ type: String, trim: true, uppercase: true, maxlength: 60 }],
    // Trigger
    triggers: [{ type: String, trim: true, maxlength: 120 }],
    // Pflichtdaten
    requiredData: [{ type: String, trim: true, maxlength: 120 }],
    // Sperrstatus — which of the twelve standard reasons this agent may raise.
    blockReasons: [{ type: String, enum: Object.values(BLOCK_REASONS) }],
    // Freigaberegeln
    approvalRule: {
      type: String,
      enum: Object.values(RISK_LEVELS),
      default: RISK_LEVELS.MEDIUM,
    },
    // Output-Typen
    outputTypes: [{ type: String, trim: true, maxlength: 60 }],
    // Übergabe an andere Agents
    handoffTo: [{ type: String, trim: true, uppercase: true, maxlength: 60 }],

    // Audit-Log is the existing AgentRun / ToolExecution trail; this flag lets
    // an agent be marked as requiring extra-verbose logging.
    verboseAudit: { type: Boolean, default: false },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

agentRegistrySchema.index({ priority: 1 });
agentRegistrySchema.index({ isEnabled: 1 });
agentRegistrySchema.index({ isDeleted: 1 });

agentRegistrySchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const AgentRegistry = mongoose.model('AgentRegistry', agentRegistrySchema);
export default AgentRegistry;
