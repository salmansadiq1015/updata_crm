/**
 * Rapport AI — turns a dictated site visit into a structured work report.
 *
 * The specification asks for eleven blocks, an explicit split between
 * billable and non-billable time, recognition of the material used, and the
 * follow-up work that should become a quotation. It also demands that an
 * incomplete report cannot be released — the agent says what is missing
 * rather than filling the gaps itself.
 */
import { createChatModel } from '../../../../shared/ai/llmFactory.js';
import logger from '../../../../shared/logger/index.js';

/** The eleven blocks, in the order the office reads them. */
export const RAPPORT_BLOCKS = Object.freeze([
  'anfahrt',
  'ausgangslage',
  'ausgefuehrteArbeiten',
  'material',
  'arbeitszeit',
  'befunde',
  'maengel',
  'offenePunkte',
  'folgearbeiten',
  'kundenbemerkungen',
  'verrechenbarkeit',
]);

const SYSTEM_PROMPT = (catalogue, todayIso) => `Du bist Rapport AI der MB Boiler & Heizungen AG (Gebäudetechnik, Schweiz).

Aus einem gesprochenen oder getippten Arbeitsrapport machst du einen strukturierten Entwurf. Du erfindest nichts: Was nicht gesagt wurde, bleibt leer und kommt unter "fehlendeAngaben".

Antworte ausschliesslich mit JSON, ohne Markdown-Zäune:
{
 "title": "kurzer Titel der Arbeit",
 "blocks": {
   "anfahrt": "", "ausgangslage": "", "ausgefuehrteArbeiten": "", "material": "",
   "arbeitszeit": "", "befunde": "", "maengel": "", "offenePunkte": "",
   "folgearbeiten": "", "kundenbemerkungen": "", "verrechenbarkeit": ""
 },
 "workPerformed": "Fliesstext der ausgeführten Arbeiten für den Rapport",
 "findings": "festgestellte Befunde und Mängel, sonst leer",
 "nextSteps": "empfohlene nächste Schritte, sonst leer",
 "materials": [{"description":"","quantity":1,"unit":"Stk","catalogueMatch":null}],
 "workedHours": null,
 "travelHours": null,
 "billable": true,
 "followUpQuotation": {"needed":false,"reason":""},
 "defectFound": false,
 "fehlendeAngaben": ["..."]
}

Regeln:
- Deutsch, Sie-Form, ganze Sätze.
- "arbeitszeit": Stunden nur übernehmen, wenn sie genannt wurden. "workedHours"/"travelHours" als Zahl in Stunden (z. B. 2.5), sonst null.
- "verrechenbarkeit": festhalten, was verrechenbar ist und was auf Garantie oder Kulanz geht. "billable" entsprechend setzen.
- "folgearbeiten": erkannte Folgearbeiten. Wenn daraus eine Offerte entstehen sollte ("sollte offeriert werden", "muss ersetzt werden"), "followUpQuotation.needed" auf true setzen und den Grund nennen.
- "maengel"/"defectFound": Mängel an der Anlage ausdrücklich festhalten.
- "fehlendeAngaben": alles, was für eine Freigabe des Rapports fehlt (Arbeitszeit, Anlage, Material, Unterschrift…).
- Material wenn möglich auf den Katalog abbilden ("catalogueMatch"), sonst null.

Heute ist ${todayIso}.

Materialkatalog (Auszug):
${catalogue}`;

class RapportService {
  async _catalogue() {
    try {
      const CatalogItem = (await import('../../../catalog/catalogItem.model.js')).default;
      const items = await CatalogItem.find({}).select('name articleNumber unit').limit(120).lean();
      if (!items.length) return '(kein Katalog hinterlegt)';
      return items.map((i) => `- ${i.name}${i.unit ? ` (${i.unit})` : ''}`).join('\n');
    } catch {
      return '(Katalog nicht verfügbar)';
    }
  }

  /** Structures free text into the eleven blocks. Null when unavailable. */
  async draft(input) {
    const catalogue = await this._catalogue();
    const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
    try {
      const llm = await createChatModel({ temperature: 0.2 });
      const response = await llm.invoke([
        { role: 'system', content: SYSTEM_PROMPT(catalogue, todayIso) },
        { role: 'user', content: input },
      ]);
      return this._normalize(JSON.parse(String(response.content).replace(/```json|```/g, '').trim()));
    } catch (err) {
      logger.warn('Rapport AI drafting failed', { module: 'ai-rapport', action: 'draft', error: err.message });
      return null;
    }
  }

  _normalize(raw = {}) {
    const text = (v, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

    const blocks = {};
    for (const key of RAPPORT_BLOCKS) blocks[key] = text(raw.blocks?.[key]);

    return {
      title: text(raw.title, 200),
      blocks,
      workPerformed: text(raw.workPerformed, 5000),
      findings: text(raw.findings, 5000),
      nextSteps: text(raw.nextSteps, 5000),
      materials: (Array.isArray(raw.materials) ? raw.materials : []).slice(0, 40).map((m) => ({
        description: text(m.description, 300),
        quantity: num(m.quantity) || 1,
        unit: text(m.unit, 20) || 'Stk',
        catalogueMatch: text(m.catalogueMatch, 200) || null,
      })).filter((m) => m.description),
      workedHours: num(raw.workedHours),
      travelHours: num(raw.travelHours),
      billable: raw.billable !== false,
      followUpQuotation: {
        needed: raw.followUpQuotation?.needed === true,
        reason: text(raw.followUpQuotation?.reason, 500),
      },
      defectFound: raw.defectFound === true,
      missing: (Array.isArray(raw.fehlendeAngaben) ? raw.fehlendeAngaben : [])
        .map((x) => text(x, 300)).filter(Boolean).slice(0, 20),
    };
  }

  /**
   * A report may only be released when the essentials are there. The agent
   * reports the gaps; it never fills them in.
   */
  completeness(draft, { hasAssignment = false } = {}) {
    const missing = [...(draft.missing || [])];
    if (!draft.workPerformed) missing.push('Ausgeführte Arbeiten');
    if (!draft.workedHours) missing.push('Arbeitszeit');
    if (!hasAssignment) missing.push('Auftrag');
    return {
      complete: missing.length === 0,
      missing: [...new Set(missing)],
    };
  }

  /** The internal note the office reads alongside the report. */
  composeNotes(draft) {
    const sections = [];
    const add = (label, value) => {
      const body = Array.isArray(value) ? value.map((v) => `- ${v}`).join('\n') : String(value || '').trim();
      if (body) sections.push(`${label}:\n${body}`);
    };
    add('Anfahrt', draft.blocks.anfahrt);
    add('Material', draft.blocks.material);
    add('Mängel', draft.blocks.maengel);
    add('Offene Punkte', draft.blocks.offenePunkte);
    add('Folgearbeiten', draft.blocks.folgearbeiten);
    add('Kundenbemerkungen', draft.blocks.kundenbemerkungen);
    add('Verrechenbarkeit', draft.blocks.verrechenbarkeit);
    if (draft.followUpQuotation.needed) {
      add('Offerte empfohlen', draft.followUpQuotation.reason || 'Folgearbeit erkannt');
    }
    return sections.join('\n\n').slice(0, 5000);
  }
}

export default new RapportService();
