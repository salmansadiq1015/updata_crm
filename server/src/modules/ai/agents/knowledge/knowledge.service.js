/**
 * Knowledge AI — answers internal questions, and cites where the answer came
 * from.
 *
 * The specification: "Beantwortet interne Fragen zu Prozessen, Vorlagen und
 * Checklisten. Weist auf Unsicherheit hin statt zu raten." Its output types
 * are "Antwort mit Quellenangabe" and "Verweis auf zuständige Person".
 *
 * Two decisions follow from that sentence and are worth stating.
 *
 * It answers from the firm's own material, not from the model. The corpus is
 * the text blocks the office wrote, the checklists per plant type, the
 * document vocabulary the other agents share, and the agent register itself —
 * about thirty entries, none of them customer data. "Prozesse, Vorlagen und
 * Checklisten" is what the specification asks for, and it is deliberately not
 * a customer archive: nothing here touches personal data, so nothing here
 * turns on where that data may live.
 *
 * And it retrieves by keyword rather than by embedding. With thirty
 * structured entries, matching on words finds the same passages and can say
 * WHICH words matched — and an answer whose source cannot be checked is not
 * what the specification asked for. Embeddings would trade a citation for a
 * similarity score.
 */
import mongoose from 'mongoose';
import { DOCUMENT_TYPES, foldForMatching } from '../document/documentTypes.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/** Words that carry no meaning for retrieval and would match everything. */
const STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'und', 'oder', 'aber', 'wie', 'was', 'wer', 'wo', 'wann', 'warum', 'welche', 'welcher',
  'welches', 'ist', 'sind', 'war', 'wird', 'werden', 'haben', 'hat', 'muss', 'muessen',
  'kann', 'koennen', 'soll', 'sollen', 'fuer', 'von', 'mit', 'bei', 'auf', 'aus', 'im',
  'in', 'zu', 'zum', 'zur', 'am', 'an', 'es', 'sich', 'wir', 'ich', 'sie', 'man', 'nicht',
  'gibt', 'bitte', 'mir', 'uns', 'unser', 'unsere', 'the', 'and', 'what', 'how', 'is',
]);

function terms(question) {
  return [...new Set(foldForMatching(question).split(/[^a-z0-9äöü]+/i))]
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

/**
 * German builds words by gluing them together, and the office asks about
 * "Zahlungsfrist" where the text block says "Zahlungsbedingungen". Matching
 * whole words found neither in the other, so a question with an obvious
 * answer came back empty.
 *
 * So a long word also matches on its stem — but the stem has to be long
 * enough to be a shared morpheme rather than a coincidence. At five
 * characters "Wasserschaden" matched "Luft-Wasser-Wärmepumpe", and the agent
 * answered a question about insurance with heat pump subsidies — precisely
 * the guessing the specification forbids. Seven separates them: "zahlung" is
 * in "Zahlungsbedingungen", "wassers" is not in "Luft-Wasser".
 *
 * Where even that fails, the agent finds nothing and says so. Missing an
 * answer the office can rephrase is a smaller failure than inventing one.
 */
const STEM_LENGTH = 7;

function stemOf(word) {
  return word.length > STEM_LENGTH ? word.slice(0, STEM_LENGTH) : null;
}

/** Exact anywhere, stem in the title only. */
function matchIn(entry, word) {
  if (entry.haystack.includes(word)) return true;
  const stem = stemOf(word);
  return Boolean(stem) && entry.title.includes(stem);
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

class KnowledgeService {
  /**
   * Everything the firm has written down about how it works. Read fresh each
   * time: a text block edited this morning should answer this afternoon.
   */
  async corpus() {
    if (!dbReady()) return [];
    const entries = [];

    try {
      const TextBlock = (await import('../../../catalog/textBlock.model.js')).default;
      const blocks = await TextBlock.find({ status: 'ACTIVE' }).select('title bodyHtml').limit(200).lean();
      for (const block of blocks) {
        entries.push({
          kind: 'Textbaustein',
          title: block.title,
          body: stripHtml(block.bodyHtml),
          source: `Textbaustein „${block.title}"`,
        });
      }
    } catch (err) {
      logger.warn('Knowledge AI could not read the text blocks', {
        module: 'ai-knowledge', action: 'corpus', error: err.message,
      });
    }

    try {
      const ProjectTaskTemplate = (await import('../../../pm/projectTaskTemplate.model.js')).default;
      const templates = await ProjectTaskTemplate.find({ isActive: true }).limit(50).lean();
      for (const template of templates) {
        const blocking = (template.tasks || []).filter((task) => task.blocksStart).map((task) => task.title);
        entries.push({
          kind: 'Checkliste',
          title: template.name,
          body: [
            template.description,
            `Aufgaben: ${(template.tasks || []).map((task) => task.title).join(', ')}.`,
            blocking.length ? `Vor dem Baustart zu erledigen: ${blocking.join(', ')}.` : null,
          ].filter(Boolean).join(' '),
          source: `Checkliste „${template.name}"`,
          detail: template,
        });
      }
    } catch (err) {
      logger.warn('Knowledge AI could not read the checklists', {
        module: 'ai-knowledge', action: 'corpus', error: err.message,
      });
    }

    for (const type of DOCUMENT_TYPES) {
      entries.push({
        kind: 'Dokumenttyp',
        title: type.label,
        body: `Wird abgelegt unter ${type.category}. Erkannt an: ${type.terms.join(', ')}.`,
        source: `Dokumenttyp „${type.label}"`,
      });
    }

    try {
      const AgentRegistry = (await import('../../governance/agentRegistry.model.js')).default;
      const agents = await AgentRegistry.find({}).limit(50).lean();
      for (const agent of agents) {
        entries.push({
          kind: 'Agent',
          title: agent.name,
          body: [
            agent.purpose,
            (agent.allowedActions || []).length ? `Darf: ${agent.allowedActions.join(', ')}.` : 'Darf keine Aktion ausführen — er bereitet nur vor.',
            (agent.forbiddenActions || []).length ? `Darf nicht: ${agent.forbiddenActions.join(', ')}.` : null,
            agent.isEnabled ? 'Ist eingeschaltet.' : 'Ist ausgeschaltet.',
          ].filter(Boolean).join(' '),
          source: `Agentenregister — ${agent.name}`,
        });
      }
    } catch (err) {
      logger.warn('Knowledge AI could not read the agent register', {
        module: 'ai-knowledge', action: 'corpus', error: err.message,
      });
    }

    return entries;
  }

  /**
   * The passages that answer this question, and the words that made them
   * match — so the reader can judge the answer instead of trusting it.
   */
  async find(question, { limit = 3 } = {}) {
    const words = terms(question);
    if (!words.length) return { words, hits: [] };

    const entries = await this.corpus();
    const scored = [];
    for (const entry of entries) {
      const folded = {
        title: foldForMatching(entry.title),
        haystack: foldForMatching(`${entry.title} ${entry.body}`),
      };
      const matched = words.filter((word) => matchIn(folded, word));
      if (!matched.length) continue;
      // A word in the title says more about what an entry is about than the
      // same word buried in its body.
      const inTitle = matched.filter((word) => matchIn({ title: folded.title, haystack: folded.title }, word));
      scored.push({ ...entry, matched, score: matched.length + inTitle.length * 2 });
    }

    scored.sort((a, b) => b.score - a.score);
    return { words, hits: scored.slice(0, limit), searched: entries.length };
  }

  /**
   * The answer. Sources always; an admission when there is nothing, never a
   * guess dressed as an answer.
   */
  compose(question, result) {
    if (!result.words.length) {
      return 'Die Frage enthält keine Stichwörter, nach denen ich suchen könnte.';
    }

    if (!result.hits.length) {
      return [
        '**Dazu ist im System nichts hinterlegt.**',
        '',
        `Gesucht nach: ${result.words.join(', ')} — in ${result.searched} Einträgen (Textbausteine, Checklisten, Dokumenttypen, Agentenregister).`,
        '',
        'Ich rate nicht. Bitte die Projektleitung fragen und die Antwort als Textbaustein hinterlegen, dann steht sie beim nächsten Mal hier.',
      ].join('\n');
    }

    const lines = ['**Das ist dazu hinterlegt:**', ''];
    for (const hit of result.hits) {
      lines.push(`**${hit.title}** *(${hit.kind})*`);
      lines.push(hit.body.length > 600 ? `${hit.body.slice(0, 600)}…` : hit.body);
      lines.push(`Quelle: ${hit.source} · gefunden über: ${hit.matched.join(', ')}`);
      lines.push('');
    }

    // Said whenever the material itself admits it is incomplete.
    if (result.hits.some((hit) => /ergänzen|zu prüfen|noch offen|folgt/i.test(hit.body))) {
      lines.push('**Achtung:** Der hinterlegte Text ist selbst als unvollständig gekennzeichnet — bitte vor Gebrauch prüfen.');
      lines.push('');
    }

    lines.push('Antwort aus dem hinterlegten Material, nicht aus dem Sprachmodell. Was hier nicht steht, weiss ich nicht.');
    return lines.join('\n');
  }

}

export default new KnowledgeService();
