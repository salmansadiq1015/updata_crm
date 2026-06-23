import { describe, expect, test } from '@jest/globals';
import BodyRenderer from '../renderer/renderers/BodyRenderer.js';
import { createFakeDoc, createFakePageManager } from './helpers/fakeDoc.js';

const ciConfig = {};

function render(data, language = 'de') {
  const doc = createFakeDoc();
  const pm = createFakePageManager();
  new BodyRenderer().draw(doc, pm, ciConfig, data, language, {});
  return doc.__renderedText();
}

describe('BodyRenderer milestone (DOC-003 advance invoice)', () => {
  test('renders the milestone label and description when provided', () => {
    const text = render({
      milestoneDescription: 'Anzahlung bei Vertragsunterzeichnung',
      introduction: 'Sehr geehrte Damen und Herren',
    });
    expect(text).toMatch(/Meilenstein|Teilleistung/);
    expect(text).toContain('Anzahlung bei Vertragsunterzeichnung');
  });

  test('localizes the milestone label (en)', () => {
    const text = render({ milestoneDescription: 'Deposit on signature' }, 'en');
    expect(text).toMatch(/Milestone/i);
    expect(text).toContain('Deposit on signature');
  });

  test('omits the milestone block when not provided', () => {
    const text = render({ introduction: 'Hello' });
    expect(text).not.toMatch(/Meilenstein|Milestone/);
    expect(text).toContain('Hello');
  });
});
