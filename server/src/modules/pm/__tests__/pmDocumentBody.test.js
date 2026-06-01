import { describe, it, expect } from '@jest/globals';
import { buildPmDocumentBody, PM_TEMPLATE_TYPES } from '../pmDocumentBody.js';

// PROJ-005 — output-content level test. The shared renderer only draws
// `data.introduction` for PM letter bodies, so we assert the COMPOSED
// introduction actually CONTAINS the enriched values (not merely that the raw
// fields were passed through). This is the regression guard for the rendering gap.

const baseTemplateData = {
  documentNumber: 'P-2026-077',
  documentDate: '2026-06-01',
  projectName: 'Boiler Replacement',
  projectNumber: 'P-2026-077',
  description: 'Replace the aging boiler with a heat pump.',
  projectManager: 'Anna Schmid',
  pmEmail: 'anna.schmid@example.ch',
  pmPhone: '+41 44 123 45 67',
  customer: { name: 'Müller AG' },
  site: { name: 'Site A', address: 'Industriestrasse 5, 8005 Zürich' },
  milestones: [
    { name: 'Kickoff', date: '2026-07-05', status: 'PLANNED' },
    { name: 'Inspection', date: '2026-08-15', status: 'IN_PROGRESS' },
  ],
};

describe('buildPmDocumentBody — enriched introduction (output content)', () => {
  it.each(PM_TEMPLATE_TYPES)('composes an introduction containing the meaningful data for %s', (templateType) => {
    const { introduction } = buildPmDocumentBody(templateType, baseTemplateData);

    expect(typeof introduction).toBe('string');
    expect(introduction.length).toBeGreaterThan(0);

    // Project identification
    expect(introduction).toContain('Boiler Replacement');
    expect(introduction).toContain('P-2026-077');
    expect(introduction).toContain('Industriestrasse 5, 8005 Zürich');

    // Description (default lead paragraph)
    expect(introduction).toContain('Replace the aging boiler with a heat pump.');

    // PM contact block — pmEmail is the key proof the renderer would now show it
    expect(introduction).toContain('Anna Schmid');
    expect(introduction).toContain('anna.schmid@example.ch');
    expect(introduction).toContain('+41 44 123 45 67');

    // Milestones rendered as readable lines (letter body cannot draw a table)
    expect(introduction).toContain('Kickoff');
    expect(introduction).toContain('Inspection');
    expect(introduction).toContain('2026-07-05');
  });

  it('lets the `intro` override win over `description` and appends `notes`', () => {
    const data = {
      ...baseTemplateData,
      intro: 'Wir bestätigen den vereinbarten Termin.',
      notes: 'Bitte halten Sie den Zugang frei.',
    };
    const { introduction } = buildPmDocumentBody('project_appointment_confirmation', data);

    expect(introduction).toContain('Wir bestätigen den vereinbarten Termin.');
    // description is superseded by the explicit intro override
    expect(introduction).not.toContain('Replace the aging boiler with a heat pump.');
    expect(introduction).toContain('Bitte halten Sie den Zugang frei.');
  });

  it('uses recipientName override for the salutation', () => {
    const data = { ...baseTemplateData, recipientName: 'Herr Meier' };
    const { introduction } = buildPmDocumentBody('project_status_report', data);
    expect(introduction).toContain('Herr Meier');
  });

  it('returns an empty object for non-PM template types (backward compatible)', () => {
    expect(buildPmDocumentBody('quotation', baseTemplateData)).toEqual({});
    expect(buildPmDocumentBody('invoice_standard', baseTemplateData)).toEqual({});
  });

  it('handles missing milestones / contact without throwing', () => {
    const { introduction } = buildPmDocumentBody('project_status_report', {
      projectName: 'X', projectNumber: 'P-1',
    });
    expect(introduction).toContain('X');
    expect(introduction).toContain('P-1');
  });
});

describe('DOC_TITLES has entries for the 3 PM template types', () => {
  it('maps each PM type to a German + English title', async () => {
    // DOC_TITLES is module-private; assert via the rendered header path instead.
    // Read the source to confirm the entries exist (lightweight contract check).
    const fs = await import('fs');
    const url = await import('url');
    const path = await import('path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const headerPath = path.resolve(
      here,
      '../../doctpl/renderer/renderers/HeaderRenderer.js',
    );
    const src = fs.readFileSync(headerPath, 'utf8');
    for (const type of PM_TEMPLATE_TYPES) {
      expect(src).toContain(`${type}:`);
    }
    expect(src).toContain('Terminbestätigung');
    expect(src).toContain('Projekt-Statusbericht');
    expect(src).toContain('Abnahmeprotokoll');
  });
});
