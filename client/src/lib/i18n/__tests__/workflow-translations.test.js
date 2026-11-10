import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { workflowAutomationTranslations } from '../workflow-automation-translations';
import { workflowBuilderTranslations } from '../workflow-builder-translations';
import { aiMissionTranslations } from '../ai-mission-translations';
import { workflowCopilotTranslations } from '../workflow-copilot-translations';
import { workflowPagesTranslations } from '../workflow-pages-translations';
import { NODE_VISUALS } from '../../../modules/workflowAutomation/lib/node-registry';

/** Workflow Automation shared vocabulary + builder: complete locales, intact placeholders, every used key defined. */
const LOCALES = ['de', 'fr', 'ar'];
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
const all = {
  en: { ...workflowAutomationTranslations.en, ...workflowBuilderTranslations.en, ...workflowCopilotTranslations.en, ...workflowPagesTranslations.en },
};
const moduleDir = path.resolve(__dirname, '../../../modules/workflowAutomation');
function sources(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : sources(p);
    return /\.(ts|tsx)$/.test(f) ? [readFileSync(p, 'utf8')] : [];
  });
}

describe.each([
  ['shared vocabulary', workflowAutomationTranslations],
  ['builder', workflowBuilderTranslations],
  ['AI mission mode', aiMissionTranslations],
  ['copilot', workflowCopilotTranslations],
])('workflow %s translations', (_, dict) => {
  it('has a non-empty value for every key in every locale with the same placeholders', () => {
    const en = dict.en;
    expect(Object.keys(en).length).toBeGreaterThan(15);
    for (const locale of LOCALES) {
      expect(Object.keys(dict[locale]).sort()).toEqual(Object.keys(en).sort());
      for (const [key, value] of Object.entries(en)) {
        expect(dict[locale][key], `${locale} ${key}`).toBeTruthy();
        expect(placeholders(dict[locale][key]), `${locale} ${key}`).toEqual(placeholders(value));
      }
    }
  });
});

describe('workflow keys used in code', () => {
  it('defines every static workflow.* / workflowBuilder.* key used by the module', () => {
    const used = new Set();
    for (const src of sources(moduleDir)) {
      for (const m of src.matchAll(/t\(\s*'((?:workflow|workflowBuilder|workflowCopilot)\.[A-Za-z0-9_.]+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(200);
    expect([...used].filter((k) => !(k in all.en))).toEqual([]);
  });

  it('labels and describes every node type, port, status and dynamic option', () => {
    const missing = [];
    const need = (k) => { if (!(k in all.en)) missing.push(k); };
    for (const type of Object.keys(NODE_VISUALS)) { need(`workflow.node.${type}.label`); need(`workflow.node.${type}.desc`); }
    ['out', 'answered', 'unanswered', 'failed', 'blocked', 'qualified', 'not_qualified', 'callback', 'unknown', 'sent', 'yes', 'no', 'matched', 'timeout'].forEach((p) => need(`workflow.port.${p}`));
    ['trigger', 'ai', 'communication', 'crm', 'logic', 'end'].forEach((c) => need(`workflow.category.${c}`));
    ['draft', 'published', 'paused', 'archived'].forEach((s) => need(`workflow.status.${s}`));
    ['pending', 'queued', 'running', 'waiting', 'paused', 'completed', 'failed', 'cancelled', 'skipped'].forEach((s) => need(`workflow.runStatus.${s}`));
    ['qualified', 'not_interested', 'converted', 'unreachable', 'callback_scheduled', 'follow_up_required', 'opted_out', 'completed', 'failed', 'stopped'].forEach((o) => need(`workflow.outcome.${o}`));
    ['message.replied', 'message.delivered', 'message.failed', 'link.clicked', 'call.completed', 'inbound_call.completed', 'lead.updated', 'webhook.received'].forEach((e) => need(`workflow.waitEvent.${e}`));
    ['equals', 'not_equals', 'contains', 'not_contains', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists', 'is_true', 'is_false', 'before', 'after', 'within_last_hours', 'older_than_hours']
      .forEach((o) => need(`workflowBuilder.operator.${o}`));
    // Every validation code the server can return (engine/graph.js, engine/nodeConfig.js, service reference checks).
    ['graph_empty', 'too_many_nodes', 'too_many_edges', 'node_id_invalid', 'node_id_duplicate', 'node_type_unknown', 'trigger_missing', 'trigger_multiple',
      'trigger_not_connected', 'edge_invalid', 'edge_dangling', 'edge_self_loop', 'edge_port_invalid', 'edge_into_trigger', 'edge_port_duplicate', 'node_unreachable',
      'condition_no_branch', 'condition_branch_missing', 'node_dead_end', 'end_missing', 'unsafe_loop', 'loop_present', 'required', 'invalid_option', 'invalid_reference',
      'too_long', 'out_of_range', 'invalid_time', 'invalid_timezone', 'invalid_date', 'invalid_url', 'tracked_link_required', 'whatsapp_template_required', 'segment_required',
      'condition_too_deep', 'condition_invalid', 'condition_empty', 'condition_too_many', 'condition_field_invalid', 'condition_operator_invalid', 'condition_value_required',
      'agent_missing', 'agent_inbound_only', 'agent_not_ready', 'agent_follow_up_disabled', 'agent_not_active', 'template_missing', 'template_channel_mismatch',
      'template_not_approved', 'user_missing'].forEach((c) => need(`workflowBuilder.validation.${c}`));
    ['lead.status', 'lead.pipelineStage', 'lead.tags', 'lead.source', 'lead.score', 'lead.scoreBand', 'lead.country', 'lead.city', 'lead.hasPhone', 'lead.hasEmail', 'lead.assigned',
      'lead.createdAt', 'lead.lastContactedAt', 'lead.qualification_', 'call.outcome', 'call.disposition', 'call.qualification', 'call.reached', 'call.callbackRequested',
      'call.attempts', 'call.durationSeconds', 'call.answers_', 'analysis.qualification', 'analysis.interest', 'analysis.callbackRequested', 'analysis.objections',
      'analysis.fields_', 'message.status', 'message.delivered', 'message.replied', 'message.channel', 'link.clicked', 'consent.voice', 'consent.sms', 'consent.email',
      'consent.whatsapp', 'run.attempts_', 'run.visits', 'event_'].forEach((f) => need(`workflowBuilder.condition.fields.${f}`));
    [0, 1, 2, 3, 4, 5, 6].forEach((d) => need(`workflowBuilder.day.${d}`));
    // Workflow Builder 2.0
    const ALL_OUTCOMES = ['qualified', 'not_qualified', 'interested', 'not_interested', 'converted', 'unreachable', 'callback_scheduled', 'follow_up_required', 'opted_out', 'completed', 'failed', 'stopped'];
    ALL_OUTCOMES.forEach((o) => { need(`workflowBuilder.outcomeHelp.${o}`); need(`workflow.outcome.${o}`); });
    Object.keys(all.en).filter((k) => k.startsWith('workflowBuilder.validation.')).forEach((k) => need(k.replace('.validation.', '.fix.')));
    ['branch_unconnected', 'https_required', 'default'].forEach((c) => need(`workflowBuilder.fix.${c}`));
    ['branch_unconnected', 'https_required'].forEach((c) => need(`workflowBuilder.validation.${c}`));
    ['timing', 'integration'].forEach((c) => need(`workflow.category.${c}`));
    ['completed', 'failed', 'skipped', 'current', 'waiting'].forEach((r) => need(`workflowBuilder.runtime.${r}`));
    ['error', 'warning', 'info'].forEach((r) => need(`workflowBuilder.severity.${r}`));
    ['phone', 'sms', 'email', 'whatsapp', 'in_person', 'other'].forEach((c) => need(`workflowBuilder.followUpChannel.${c}`));
    ['understanding', 'resources', 'validating', 'building'].forEach((p) => need(`workflowCopilot.phase.${p}`));
    ['add_node', 'update_node', 'connect_nodes', 'disconnect', 'remove_node', 'tidy_layout'].forEach((o) => need(`workflowCopilot.op.${o}`));
    ['sms-follow-up', 'whatsapp-follow-up', 'email-follow-up', 'multi-channel-qualification'].forEach((k) => { need(`workflowPages.template.${k}.title`); need(`workflowPages.template.${k}.desc`); });
    // 2.1: custom fields, email opens, copilot review/apply, resizable panel
    ['lead.customFields_', 'message.opened'].forEach((f) => need(`workflowBuilder.condition.fields.${f}`));
    need('workflow.node.crm.custom_fields.label'); need('workflow.node.crm.custom_fields.desc'); need('workflowBuilder.outputs.crm.custom_fields');
    need('workflow.waitEvent.message.opened'); need('workflowBuilder.messageStatus.opened');
    ['invalid_key', 'too_many'].forEach((c) => { need(`workflowBuilder.validation.${c}`); need(`workflowBuilder.fix.${c}`); });
    ['reviewMode', 'proposed', 'apply', 'discard', 'discarded', 'resolvePending', 'appliedChoice'].forEach((k) => need(`workflowCopilot.${k}`));
    need('workflowBuilder.panel.resize');
    expect(missing).toEqual([]);
  });
});
