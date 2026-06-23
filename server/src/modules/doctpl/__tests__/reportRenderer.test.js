import { describe, expect, test } from '@jest/globals';
import ReportRenderer from '../renderer/renderers/ReportRenderer.js';
import { createFakeDoc, createFakePageManager } from './helpers/fakeDoc.js';

function render(data, language = 'de') {
  const doc = createFakeDoc();
  const pm = createFakePageManager();
  new ReportRenderer().draw(doc, pm, {}, data, language, {});
  return doc.__renderedText();
}

describe('ReportRenderer service report (DOC-004)', () => {
  const data = {
    templateType: 'service_report',
    equipment: { name: 'Viessmann Vitodens 200', model: 'B2HF', serialNumber: 'SN-12345', location: 'Keller' },
    findings: 'Kalkablagerungen im Waermetauscher festgestellt.',
    workPerformed: 'Waermetauscher gereinigt und entkalkt.',
    materialsUsed: [{ description: 'Entkalker', quantity: 2, unit: 'L' }],
    recommendations: 'Jaehrliche Wartung empfohlen.',
    timeSpent: '2.5 h',
    technician: { name: 'Hans Muster' },
  };

  test('renders equipment details including serial number', () => {
    const text = render(data);
    expect(text).toContain('Viessmann Vitodens 200');
    expect(text).toContain('SN-12345');
  });

  test('renders findings, work performed and recommendations', () => {
    const text = render(data);
    expect(text).toContain('Kalkablagerungen im Waermetauscher festgestellt.');
    expect(text).toContain('Waermetauscher gereinigt und entkalkt.');
    expect(text).toContain('Jaehrliche Wartung empfohlen.');
  });

  test('renders materials used and technician name with a signature label', () => {
    const text = render(data);
    expect(text).toContain('Entkalker');
    expect(text).toContain('Hans Muster');
    expect(text).toContain('Unterschrift');
  });
});

describe('ReportRenderer inspection certificate (DOC-004)', () => {
  const data = {
    templateType: 'inspection_certificate',
    checklist: [
      { label: 'Dichtheitspruefung', status: 'pass' },
      { label: 'Abgaswerte', status: 'fail' },
    ],
    overallResult: 'fail',
    inspector: { name: 'Anna Beispiel' },
    nextInspectionDate: '2027-06-23',
  };

  test('renders checklist items with localized pass/fail status', () => {
    const text = render(data);
    expect(text).toContain('Dichtheitspruefung');
    expect(text).toContain('Abgaswerte');
    expect(text).toContain('Bestanden'); // pass (de)
    expect(text).toContain('Nicht bestanden'); // fail (de)
  });

  test('renders overall result, inspector and next inspection date', () => {
    const text = render(data);
    expect(text).toContain('Anna Beispiel');
    expect(text).toContain('2027-06-23');
  });

  test('localizes pass status to English', () => {
    const text = render({ checklist: [{ label: 'Leak test', status: 'pass' }] }, 'en');
    expect(text).toContain('Pass');
  });
});
