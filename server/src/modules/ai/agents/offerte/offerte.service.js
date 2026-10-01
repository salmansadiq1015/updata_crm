/**
 * Offerte AI — turns a site visit into a draft quotation.
 *
 * Follows the 09.05.2026 specification: the agent works from dictations,
 * notes, PLAUD transcripts and system data, and produces a draft structured
 * in nine fixed blocks. It deliberately does NOT invent prices — positions it
 * cannot price from the catalogue are listed as open points for the office to
 * fill in, because "Preise festlegen" is on the agent's forbidden list.
 */
import mongoose from 'mongoose';
import { createChatModel } from '../../../../shared/ai/llmFactory.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/** The nine blocks the client prescribes, in order. */
export const OFFERTE_BLOCKS = Object.freeze([
  'ausgangslage',
  'kundenziel',
  'technischeLoesung',
  'leistungsumfang',
  'optionen',
  'ausschluesse',
  'offenePunkte',
  'preispruefung',
  'versandbereitschaft',
]);

export const BLOCK_LABELS = Object.freeze({
  ausgangslage: 'Ausgangslage',
  kundenziel: 'Kundenziel',
  technischeLoesung: 'Technische Lösung',
  leistungsumfang: 'Leistungsumfang',
  optionen: 'Optionen',
  ausschluesse: 'Ausschlüsse',
  offenePunkte: 'Offene Punkte',
  preispruefung: 'Preisprüfung',
  versandbereitschaft: 'Versandbereitschaft',
});

const SYSTEM_PROMPT = (catalogue) => `Du bist Offerte AI der Updata (Gebäudetechnik, Schweiz).

Aus einer Besichtigungsnotiz, einem Diktat oder einem PLAUD-Transkript erstellst du einen **Offertenentwurf**. Du schreibst keine fertige Offerte und legst keine Preise fest — du bereitest vor, das Büro prüft und ergänzt.

Antworte ausschliesslich mit JSON, ohne Markdown-Zäune:
{
 "title": "kurzer Offertentitel",
 "blocks": {
   "ausgangslage": "", "kundenziel": "", "technischeLoesung": "",
   "leistungsumfang": "", "optionen": "", "ausschluesse": "",
   "offenePunkte": "", "preispruefung": "", "versandbereitschaft": ""
 },
 "positions": [{"description":"","quantity":1,"unit":"Stk","catalogueMatch":null,"isOption":false}],
 "openPoints": ["..."],
 "missingPrices": ["..."],
 "recognizedWork": ["..."]
}

Regeln:
- Alle neun Blöcke ausfüllen, in ganzen Sätzen, auf Deutsch (Sie-Form). Ist ein Block aus der Vorlage nicht ableitbar, schreibe präzise, was fehlt — erfinde nichts.
- "positions": die auszuführenden Arbeiten. Nutze wenn möglich exakt eine Bezeichnung aus dem Katalog und trage sie in "catalogueMatch" ein; sonst "catalogueMatch": null.
- Arbeiten, die der Kunde optional wählen kann, gehören mit "isOption": true in die Positionen UND in den Block "optionen".
- "openPoints": technisch ungeklärte Punkte (Leitungsführung, Platzverhältnisse, Schallschutz, Elektroanschluss, bauseitige Leistungen…).
- "missingPrices": Positionen, für die kein Preis bestimmbar ist.
- "recognizedWork": erkannte Fachinhalte (z. B. Luft-Wasser-Wärmepumpe, Erdsonden-Wärmepumpe, Heizungsersatz, Boiler/Hygienespeicher, Leitungsführung, Demontage, Entsorgung, Elektroarbeiten, Baumeisterarbeiten, Fundament, Wanddurchbrüche, Kernbohrungen, Schallschutz, Fördergelder, bauseitige Leistungen).
- "preispruefung": halte fest, welche Preise noch zu prüfen sind. "versandbereitschaft": ob der Entwurf aus deiner Sicht versandbereit ist und was vorher fehlt.

Katalog der Standardarbeiten:
${catalogue}`;

class OfferteService {
  /** Catalogue names help the model map dictated work onto real positions. */
  async _catalogue() {
    if (!dbReady()) return '(Katalog nicht verfügbar)';
    try {
      const WorkType = (await import('../../../deploy/workType.model.js')).default;
      const types = await WorkType.find({}).select('name standardDurationMin').limit(200).lean();
      if (!types.length) return '(kein Katalog hinterlegt)';
      return types
        .map((t) => `- ${t.name}${t.standardDurationMin ? ` (${(t.standardDurationMin / 60).toFixed(2)} h)` : ''}`)
        .join('\n');
    } catch (err) {
      logger.warn('Offerte AI could not load the work-type catalogue', {
        module: 'ai-offerte', action: 'catalogue', error: err.message,
      });
      return '(Katalog nicht verfügbar)';
    }
  }

  /**
   * Drafts the nine blocks and the proposed positions from free text.
   * Returns null when the LLM is unavailable, so the caller can fall back.
   */
  async draft(input, { customerName, siteLabel } = {}) {
    const catalogue = await this._catalogue();
    const contextLine = [
      customerName ? `Kunde: ${customerName}` : null,
      siteLabel ? `Objekt: ${siteLabel}` : null,
    ].filter(Boolean).join(' · ');

    try {
      const llm = await createChatModel({ temperature: 0.2 });
      const response = await llm.invoke([
        { role: 'system', content: SYSTEM_PROMPT(catalogue) },
        { role: 'user', content: contextLine ? `${contextLine}\n\n${input}` : input },
      ]);
      const parsed = JSON.parse(String(response.content).replace(/```json|```/g, '').trim());
      return this._normalize(parsed);
    } catch (err) {
      logger.warn('Offerte AI drafting failed', {
        module: 'ai-offerte', action: 'draft', error: err.message,
      });
      return null;
    }
  }

  _normalize(raw = {}) {
    const text = (v) => (typeof v === 'string' ? v.trim() : '');
    const list = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean).slice(0, 30) : []);

    const blocks = {};
    for (const key of OFFERTE_BLOCKS) blocks[key] = text(raw.blocks?.[key]);

    const positions = (Array.isArray(raw.positions) ? raw.positions : [])
      .slice(0, 60)
      .map((p) => ({
        description: text(p.description),
        quantity: Number.isFinite(Number(p.quantity)) && Number(p.quantity) > 0 ? Number(p.quantity) : 1,
        unit: text(p.unit) || 'Stk',
        catalogueMatch: text(p.catalogueMatch) || null,
        isOption: p.isOption === true,
      }))
      .filter((p) => p.description);

    return {
      title: text(raw.title).slice(0, 200),
      blocks,
      positions,
      openPoints: list(raw.openPoints),
      missingPrices: list(raw.missingPrices),
      recognizedWork: list(raw.recognizedWork),
    };
  }

  /**
   * Composes the introduction shown on the PDF from the blocks that describe
   * the situation and the intended solution. The remaining blocks stay
   * structured on the record for the office to work through.
   */
  composeIntroduction(blocks = {}) {
    return [blocks.ausgangslage, blocks.kundenziel, blocks.technischeLoesung]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 5000);
  }

  /**
   * Everything the office still has to decide, gathered in one readable note
   * so nothing silently ships. Kept out of the customer-facing introduction.
   */
  composeInternalNotes(draft) {
    const sections = [];
    const add = (label, value) => {
      const body = Array.isArray(value) ? value.filter(Boolean).map((v) => `- ${v}`).join('\n') : String(value || '').trim();
      if (body) sections.push(`${label}:\n${body}`);
    };
    add(BLOCK_LABELS.leistungsumfang, draft.blocks.leistungsumfang);
    add(BLOCK_LABELS.optionen, draft.blocks.optionen);
    add(BLOCK_LABELS.ausschluesse, draft.blocks.ausschluesse);
    add(BLOCK_LABELS.offenePunkte, draft.openPoints.length ? draft.openPoints : draft.blocks.offenePunkte);
    add(BLOCK_LABELS.preispruefung, draft.missingPrices.length ? draft.missingPrices : draft.blocks.preispruefung);
    add(BLOCK_LABELS.versandbereitschaft, draft.blocks.versandbereitschaft);
    if (draft.recognizedWork.length) add('Erkannte Fachinhalte', draft.recognizedWork);
    return sections.join('\n\n').slice(0, 5000);
  }

  /**
   * Maps drafted positions onto quotation line items. Catalogue matches carry
   * their standard duration as the quantity hint; prices stay at zero on
   * purpose — setting them is expressly forbidden for this agent.
   */
  async toLineItems(positions = []) {
    let catalogue = [];
    try {
      const WorkType = (await import('../../../deploy/workType.model.js')).default;
      catalogue = await WorkType.find({}).select('name standardDurationMin').lean();
    } catch {
      catalogue = [];
    }
    const byName = new Map(catalogue.map((c) => [c.name.toLowerCase(), c]));

    return positions.map((position, index) => {
      const match = position.catalogueMatch ? byName.get(position.catalogueMatch.toLowerCase()) : null;
      const description = position.isOption
        ? `${position.description} (Option)`
        : position.description;
      return {
        position: index + 1,
        type: 'service',
        description: match ? `${match.name}${position.description !== match.name ? ` — ${position.description}` : ''}` : description,
        unit: match ? 'h' : position.unit,
        quantity: match && match.standardDurationMin
          ? Math.round((match.standardDurationMin / 60) * position.quantity * 4) / 4
          : position.quantity,
        unitPrice: 0,
        discountPercent: 0,
        vatRate: 8.1,
      };
    });
  }
}

export default new OfferteService();
