import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { inboundCallsTranslations } from '@/lib/i18n/inbound-calls-translations';
import { translations } from '@/lib/i18n/translations';
import {
  AI_STATUSES, AUDIO_STATUSES, CALL_STATUSES, CALLER_FIELD_KEYS, CONTROL_KINDS, DECISION_REASONS, DEVICE_READINESS_REASONS, HANDLED_BY,
  INQUIRY_CATEGORIES, LEAD_CREATION_POLICIES, LIST_CALLER_TYPES, OUTCOMES, QUALIFICATION_RESULTS, RECOMMENDATION_ACTIONS, RULE_ACTIONS, RULE_CALLER_TYPES,
  WORK_STATUSES, ROUTING_RESULT_KEYS, CLOSING_QUESTION_TYPES, CLOSING_STANDARD_KEYS,
} from '@/modules/inboundCalls/types/inbound-call-types';

/**
 * Incoming Calls keys must be complete in all four UI locales, every static
 * t('inbound.…') key used by the module must exist, and every server enum value
 * the UI labels must have a translation (no raw SNAKE_CASE on screen).
 */
const LOCALES = ['de', 'en', 'fr', 'ar'];
const en = inboundCallsTranslations.en;

function staticKeysUsed() {
  const files = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(full); continue; }
      if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.resolve(process.cwd(), 'src/modules/inboundCalls'));
  for (const f of ['leads/ui/lead-conversation-history.tsx', 'aiCalling/ui/calling-agent-workspace.tsx', 'aiCalling/ui/calling-agent-editor.tsx', 'aiCalling/ui/calling-agent-platform.tsx', 'aiCalling/ui/agent-call-analytics.tsx']) files.push(path.resolve(process.cwd(), 'src/modules', f));
  const keys = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\btx?\('((?:inbound|leads\.history\.incoming)\.[A-Za-z0-9_.-]+)'/g)) keys.add(m[1]);
  return [...keys];
}

describe('incoming calls translations', () => {
  test('every locale has exactly the English key set, all non-empty', () => {
    const keys = Object.keys(en).sort();
    for (const locale of LOCALES) {
      const dict = inboundCallsTranslations[locale];
      expect(Object.keys(dict).sort(), locale).toEqual(keys);
      expect(Object.entries(dict).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k), `${locale} empty`).toEqual([]);
    }
  });

  test('interpolation placeholders match English in every locale', () => {
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const locale of LOCALES) for (const [key, value] of Object.entries(en)) expect(vars(inboundCallsTranslations[locale][key]), `${locale}:${key}`).toBe(vars(value));
  });

  test('Arabic strings are actually Arabic', () => {
    expect(Object.entries(inboundCallsTranslations.ar).filter(([, v]) => !/[؀-ۿ]/.test(v)).map(([k]) => k)).toEqual([]);
  });

  test('every static key used by the module exists', () => {
    expect(staticKeysUsed().filter((k) => !(k in en))).toEqual([]);
  });

  test('every enum value the UI labels has a translation', () => {
    const families = {
      status: CALL_STATUSES, ai: AI_STATUSES, audio: AUDIO_STATUSES, outcome: OUTCOMES, inquiry: INQUIRY_CATEGORIES, qualification: QUALIFICATION_RESULTS,
      ruleAction: RULE_ACTIONS, ruleCallerType: RULE_CALLER_TYPES, callerType: [...LIST_CALLER_TYPES, 'unknown'], recommendation: RECOMMENDATION_ACTIONS,
      field: CALLER_FIELD_KEYS, readiness: DEVICE_READINESS_REASONS, reason: DECISION_REASONS, handledBy: HANDLED_BY, leadCreation: LEAD_CREATION_POLICIES,
      control: CONTROL_KINDS, verification: ['unverified', 'confirmed', 'corrected', 'rejected'], answerStatus: ['answered', 'partially_answered', 'unanswered', 'deferred'],
      handoff: ['none', 'waiting', 'taken_over', 'callback_offered', 'expired'],
      usage: ['outbound', 'inbound', 'both'], agentAvailability: ['draft', 'active', 'paused', 'archived'],
      'costs.comp': ['voice', 'telephony', 'text', 'platform', 'other'], 'costs.range': ['7', '30', '90', 'all'],
      'costs.tone': ['positive', 'neutral', 'hesitant', 'negative', 'unrecorded'],
      work: WORK_STATUSES, 'routing.result': ROUTING_RESULT_KEYS, 'closing.type': CLOSING_QUESTION_TYPES,
      'closing.status': ['answered', 'declined', 'not_asked'], 'closing.key': CLOSING_STANDARD_KEYS,
      'closing.template': ['contact_details', 'support', 'orders', 'restaurant', 'appointments', 'sales'],
    };
    const missing = Object.entries(families).flatMap(([family, values]) => values.map((v) => `inbound.${family}.${v}`)).filter((k) => !(k in en));
    for (const kind of CONTROL_KINDS) for (const suffix of ['title', 'body']) if (!(`inbound.control.confirm.${kind}.${suffix}` in en)) missing.push(`inbound.control.confirm.${kind}.${suffix}`);
    expect(missing).toEqual([]);
  });

  test('is wired into the app dictionary in every locale', () => {
    for (const locale of LOCALES) {
      expect(translations[locale]['inbound.title']).toBe(inboundCallsTranslations[locale]['inbound.title']);
      expect(translations[locale]['sidebar.incomingCalls']).toBe(inboundCallsTranslations[locale]['sidebar.incomingCalls']);
      expect(translations[locale]['leads.history.type.incoming_call']).toBe(inboundCallsTranslations[locale]['leads.history.type.incoming_call']);
    }
  });
});
