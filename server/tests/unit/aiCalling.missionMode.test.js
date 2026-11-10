import { describe, expect, it } from '@jest/globals';
import { buildSystemPrompt } from '../../src/modules/aiCalling/engine/leadContext.js';
import { agentConfig } from '../../src/modules/aiCalling/aiCalling.validation.js';

/** Goal-driven ("mission") conversation mode for AI calling agents. */
const questions = [
  { fieldKey: 'interest', label: 'Interest', text: 'Are you interested in a heat pump?', required: true },
  { fieldKey: 'timeline', label: 'Timeline', text: 'When would you like to start?', required: true },
  { fieldKey: 'budget', label: 'Budget', text: 'Do you have a budget in mind?', required: false },
];

describe('AI calling — mission (goal-driven) mode', () => {
  it('questions mode (default) keeps the strict questionnaire prompt', () => {
    const p = buildSystemPrompt({ agentConfig: { agentName: 'Sarah' }, objective: 'Qualify', questions });
    expect(p).toMatch(/never ask anything else outside the configured questionnaire/);
    expect(p).toMatch(/Configured questionnaire/);
    expect(p).not.toMatch(/MISSION/);
  });

  it('mission mode states objective, persona, behaviour, required vs optional info and completion', () => {
    const p = buildSystemPrompt({
      agentConfig: { agentName: 'Sarah', conversationMode: 'mission', mission: { persona: 'Warm HVAC advisor', completionCriteria: 'We know their interest and timeline', behavior: { clarifyAmbiguous: false } } },
      objective: 'Find out heat pump interest', questions,
    });
    expect(p).not.toMatch(/never ask anything else outside the configured questionnaire/);
    expect(p).toMatch(/MISSION \(goal-driven conversation\)/);
    expect(p).toMatch(/Objective: Find out heat pump interest/);
    expect(p).toMatch(/Persona: Warm HVAC advisor/);
    expect(p).not.toMatch(/ask one short clarifying question/); // behaviour switch respected
    expect(p).toMatch(/Ask one question at a time and wait/); // always on for voice
    expect(p).toMatch(/Never ask for information the person already gave/);
    expect(p).toMatch(/Never invent, assume or guess an answer/);
    expect(p).toMatch(/Required information[^\n]*\n {2}- \[interest\][^\n]*\n {2}- \[timeline\]/);
    expect(p).toMatch(/Optional information[^\n]*\n {2}- \[budget\]/);
    expect(p).toMatch(/Completion: We know their interest and timeline\. Then thank/);
  });

  it('validation defaults keep existing agents in questions mode', () => {
    const { value, error } = agentConfig.validate({});
    expect(error).toBeUndefined();
    expect(value.conversationMode).toBe('questions');
    expect(value.mission.behavior).toEqual({ naturalConversation: true, skipAnswered: true, clarifyAmbiguous: true, respectRefusals: true });
    expect(agentConfig.validate({ conversationMode: 'freestyle' }).error).toBeTruthy();
  });
});
