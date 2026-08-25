import { describe, expect, test } from '@jest/globals';
import { titleFrom } from '../../src/modules/ai/workflows/fieldServiceAgent.workflow.js';

const TASK_TERMS = ['create task', 'task', 'aufgabe', 'erstelle'];

describe('AI title from a dictated sentence', () => {
  test('recovers the tail the planner trimmed', () => {
    // Measured over repeated runs, the planner returns the shorter form about
    // two runs in three. The office searches for what it typed.
    expect(titleFrom(
      { title: 'AUF-2026-0052 Nachkontrolle' },
      'Erstelle eine Aufgabe AUF-2026-0052 Nachkontrolle beim Kunden',
      TASK_TERMS,
    )).toBe('AUF-2026-0052 Nachkontrolle beim Kunden');
  });

  test('leaves the planner alone when it moved words into other fields', () => {
    // "für morgen mit hoher Priorität" became dueDate and priority; putting it
    // back into the title would be wrong.
    expect(titleFrom(
      { title: 'Boiler entkalken', dueDate: new Date(), priority: 'HIGH' },
      'Erstelle eine Aufgabe Boiler entkalken für morgen mit hoher Priorität',
      TASK_TERMS,
    )).toBe('Boiler entkalken');
  });

  test('each moved-out field on its own is enough to stand back', () => {
    const input = 'Erstelle eine Aufgabe Boiler entkalken für Thomas';
    for (const moved of [{ assigneeName: 'Thomas' }, { dateTime: new Date() }, { durationHours: 2 }, { status: 'COMPLETED' }]) {
      expect(titleFrom({ title: 'Boiler entkalken', ...moved }, input, TASK_TERMS)).toBe('Boiler entkalken');
    }
  });

  test('keeps a title the planner already got whole', () => {
    expect(titleFrom(
      { title: 'Boiler entkalken' },
      'Erstelle eine Aufgabe Boiler entkalken',
      TASK_TERMS,
    )).toBe('Boiler entkalken');
  });

  test('does not extend a title the planner reworded', () => {
    // Not found in the sentence: extending would splice unrelated words.
    expect(titleFrom(
      { title: 'Etwas ganz anderes' },
      'Erstelle eine Aufgabe Boiler entkalken beim Kunden',
      TASK_TERMS,
    )).toBe('Etwas ganz anderes');
  });

  test('falls back to the stripped sentence without a planner', () => {
    expect(titleFrom({}, 'Erstelle eine Aufgabe Boiler entkalken', TASK_TERMS))
      .toMatch(/Boiler entkalken/);
  });

  test('drops trailing punctuation from the recovered tail', () => {
    expect(titleFrom(
      { title: 'Boiler entkalken' },
      'Erstelle eine Aufgabe Boiler entkalken beim Kunden.',
      TASK_TERMS,
    )).toBe('Boiler entkalken beim Kunden');
  });

  test('matches case-insensitively but keeps the office spelling', () => {
    expect(titleFrom(
      { title: 'boiler entkalken' },
      'Erstelle eine Aufgabe Boiler entkalken beim Kunden',
      TASK_TERMS,
    )).toBe('Boiler entkalken beim Kunden');
  });
});
