/**
 * Document AI — recognises, classifies, names and links incoming paperwork.
 *
 * First in the register, and the specification says why: "Grundlage für
 * Behörden, Finanz, Quality und Money AI". Those agents look for a
 * Bohrbewilligung or an IBN-Protokoll among the project's documents; if the
 * scan was filed as "scan.png" under OTHER, they cannot find it and report it
 * missing. Five of the six project documents in this system sit in OTHER.
 *
 * What it can read, and what it cannot. Nothing extracts text from a PDF here,
 * so the classification rests on the file name, the file type and where the
 * document was filed — never on its contents. Every proposal says so. A name
 * that carries no signal ("scan.png", "test pdf.pdf") produces a documented
 * "cannot tell", not a guess: filing a supplier invoice as a drilling permit
 * would be worse than leaving it unclassified.
 *
 * It proposes. Filing stays a human act — the register puts it at MEDIUM.
 */
import mongoose from 'mongoose';
import { BLOCK_REASONS, blocked } from '../../governance/agent.risk.js';
import { buildDocumentFilename } from '../../../../shared/utils/documentFilename.js';
import { DOCUMENT_TYPES, looksLikeImage, matchDocumentType } from './documentTypes.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/**
 * Record numbers the office writes into file names.
 *
 * No \b anchors: an underscore is a word character, so "\bPRJ" never matched
 * inside "Bohrbewilligung_PRJ-2026-00001.pdf" — which is exactly how the
 * office names a file. The patterns are distinctive enough on their own.
 */
const PROJECT_NUMBER = /PRJ-\d{4}-\d{3,6}/i;
const ORDER_NUMBER = /AUF-\d{4}-\d{3,6}/i;
const QUOTATION_NUMBER = /OFF-\d{4}-\d{3,6}/i;
const INVOICE_NUMBER = /RE-\d{4}-\d{3,6}/i;

function extension(fileName) {
  const match = String(fileName || '').match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : 'pdf';
}

class DocumentService {
  /**
   * What this document appears to be, what it should be called, and where it
   * belongs. Returns the reasoning too — a proposal nobody can check is not
   * worth approving.
   */
  async classify({ fileName, mimeType = '', description = '', projectId = null } = {}) {
    const blockers = [];
    const warnings = [];
    const evidence = [];

    const haystack = [fileName, description].filter(Boolean).join(' ');
    let type = matchDocumentType(haystack);
    if (type) {
      // Both halves matter: what it was read as, and the word that led there —
      // "Bohrgesuch" landing on "Bohrbewilligung" is right but worth showing.
      evidence.push(`Als ${type.label} erkannt (Dateiname enthält „${type.matchedTerm}").`);
    }

    // An image is a photo whatever it was named — that is the one thing the
    // file itself tells us without reading it.
    if (!type && looksLikeImage({ fileName, mimeType })) {
      type = DOCUMENT_TYPES.find((candidate) => candidate.key === 'FOTOS') || null;
      evidence.push(`Bilddatei (${mimeType || fileName.split('.').pop()}) — als Foto eingeordnet.`);
    }

    if (!type) {
      blockers.push({
        reason: BLOCK_REASONS.CONTRADICTORY_DATA,
        detail: `Aus dem Dateinamen „${fileName}" lässt sich der Dokumenttyp nicht bestimmen.`,
      });
    }

    const link = await this._link(haystack, projectId);
    if (link.blocker) blockers.push(link.blocker);
    if (link.warning) warnings.push(link.warning);
    if (link.evidence) evidence.push(link.evidence);

    const suggestedName = type
      ? buildDocumentFilename({
        templateType: type.label,
        objectAddress: link.objectAddress || '',
        version: 1,
        date: new Date(),
        ext: extension(fileName),
      })
      : null;

    // Said on every proposal, deliberately: this is a reading of the name, not
    // of the document.
    warnings.push('Beurteilt anhand von Dateiname und Dateityp — der Inhalt wird nicht gelesen.');

    logger.info('Document AI classified a document', {
      module: 'ai-document',
      action: 'classify',
      fileName,
      type: type?.key || null,
      linked: Boolean(link.project),
    });

    return {
      ok: blockers.length === 0,
      fileName,
      mimeType,
      type: type || null,
      category: type?.category || 'OTHER',
      suggestedName,
      project: link.project || null,
      references: link.references,
      evidence,
      blockers,
      warnings,
    };
  }

  /**
   * Which record the document belongs to. A project number in the name is a
   * fact; the project it was uploaded into is a fallback; anything else is an
   * open question rather than a guess.
   */
  async _link(haystack, projectId) {
    const references = {
      projectNumber: haystack.match(PROJECT_NUMBER)?.[0]?.toUpperCase() || null,
      orderNumber: haystack.match(ORDER_NUMBER)?.[0]?.toUpperCase() || null,
      quotationNumber: haystack.match(QUOTATION_NUMBER)?.[0]?.toUpperCase() || null,
      invoiceNumber: haystack.match(INVOICE_NUMBER)?.[0]?.toUpperCase() || null,
    };

    if (!dbReady()) {
      return { references, warning: 'Die Zuordnung konnte nicht geprüft werden.' };
    }

    let project = null;
    let evidence = null;
    try {
      const Project = (await import('../../../pm/project.model.js')).default;
      if (references.projectNumber) {
        project = await Project.findOne({ projectNumber: references.projectNumber })
          .select('projectNumber name customerId customerName siteId').lean();
        evidence = project
          ? `Projektnummer ${references.projectNumber} im Dateinamen erkannt.`
          : null;
        if (!project) {
          return {
            references,
            blocker: {
              reason: BLOCK_REASONS.UNCLEAR_PROJECT,
              detail: `Projektnummer ${references.projectNumber} im Dateinamen gefunden, aber kein solches Projekt vorhanden.`,
            },
          };
        }
      } else if (projectId) {
        project = await Project.findById(projectId)
          .select('projectNumber name customerId customerName siteId').lean();
        evidence = project ? `Im Projekt ${project.projectNumber} abgelegt.` : null;
      }
    } catch (err) {
      logger.warn('Document AI could not resolve the link', {
        module: 'ai-document', action: 'link', error: err.message,
      });
      return { references, warning: 'Die Zuordnung konnte nicht geprüft werden.' };
    }

    if (!project) {
      return {
        references,
        blocker: {
          reason: BLOCK_REASONS.UNCLEAR_PROJECT,
          detail: 'Weder im Dateinamen noch aus der Ablage lässt sich ein Projekt bestimmen.',
        },
      };
    }

    const objectAddress = await this._objectAddress(project.siteId);
    return { references, project, objectAddress, evidence };
  }

  async _objectAddress(siteId) {
    if (!siteId) return '';
    try {
      const Site = (await import('../../../crm/site.model.js')).default;
      const site = await Site.findById(siteId).select('street city').lean();
      return site ? [site.street, site.city].filter(Boolean).join(', ') : '';
    } catch { return ''; }
  }

  /**
   * Every document on a project that is not yet properly filed, with what
   * Document AI would call it. The state it addresses: five of the six
   * project documents here sit under OTHER, which is why the other agents
   * report their paperwork missing.
   */
  async classifyProject(projectRef) {
    const projectId = projectRef?._id || projectRef?.id;
    if (!projectId || !dbReady()) return { verified: false, documents: [] };

    let documents = [];
    try {
      const ProjectDocument = (await import('../../../pm/projectDocument.model.js')).default;
      documents = await ProjectDocument.find({ projectId, archived: { $ne: true } })
        .select('fileName description category templateType mimeType').limit(100).lean();
    } catch (err) {
      logger.warn('Document AI could not read the project documents', {
        module: 'ai-document', action: 'classifyProject', error: err.message,
      });
      return { verified: false, documents: [] };
    }

    const proposals = [];
    for (const document of documents) {
      const result = await this.classify({
        fileName: document.fileName,
        mimeType: document.mimeType || '',
        description: document.description || document.templateType || '',
        projectId,
      });
      proposals.push({
        id: String(document._id),
        fileName: document.fileName,
        currentCategory: document.category || 'OTHER',
        proposedType: result.type?.key || null,
        proposedLabel: result.type?.label || null,
        proposedCategory: result.category,
        suggestedName: result.suggestedName,
        // Already filed where it belongs: worth saying, not worth changing.
        settled: Boolean(result.type) && result.category === document.category,
        evidence: result.evidence,
      });
    }

    return { verified: true, project: projectRef, documents: proposals };
  }

  /** The project-wide proposal, as the office reads it. */
  composeProject(result) {
    if (!result.verified) return 'Die Dokumente konnten nicht gelesen werden.';
    if (!result.documents.length) return 'Für dieses Projekt sind keine Dokumente abgelegt.';

    const open = result.documents.filter((entry) => !entry.settled);
    const lines = [open.length
      ? `**${open.length} von ${result.documents.length} Dokument(en) sind nicht sauber abgelegt.**`
      : `**Alle ${result.documents.length} Dokumente sind sauber abgelegt.**`, ''];

    for (const entry of result.documents) {
      if (entry.settled) {
        lines.push(`- ✓ **${entry.fileName}** — ${entry.proposedLabel}, ${entry.currentCategory}.`);
        continue;
      }
      if (!entry.proposedType) {
        lines.push(`- ⛔ **${entry.fileName}** — Typ nicht erkennbar, liegt unter ${entry.currentCategory}.`);
        continue;
      }
      lines.push(`- ○ **${entry.fileName}** — Vorschlag: **${entry.proposedLabel}** unter *${entry.proposedCategory}* (heute ${entry.currentCategory}).`);
      if (entry.suggestedName) lines.push(`  Name: \`${entry.suggestedName}\``);
    }

    lines.push('');
    lines.push('Beurteilt anhand von Dateiname und Dateityp — der Inhalt wird nicht gelesen.');
    lines.push('Umbenannt oder verschoben wird nichts automatisch.');
    return lines.join('\n');
  }

  /** The proposal, as the office reads it. */
  compose(result) {
    const lines = [`**Klassierungsvorschlag — ${result.fileName}**`, ''];

    if (result.type) {
      lines.push(`Dokumenttyp: **${result.type.label}**, Ablage unter *${result.category}*.`);
    } else {
      lines.push('Der Dokumenttyp konnte nicht bestimmt werden.');
    }
    if (result.project) {
      lines.push(`Zuordnung: Projekt **${result.project.projectNumber}** — ${result.project.name}${result.project.customerName ? ` (${result.project.customerName})` : ''}.`);
    }
    if (result.suggestedName) {
      lines.push('');
      lines.push(`Vorgeschlagener Name: \`${result.suggestedName}\``);
    }

    if (result.evidence.length) {
      lines.push('');
      lines.push('**Woran erkannt**');
      for (const item of result.evidence) lines.push(`- ${item}`);
    }
    if (result.blockers.length) {
      lines.push('');
      lines.push('**Das ist offen**');
      for (const blocker of result.blockers) lines.push(`- ${blocker.detail}`);
    }
    if (result.warnings.length) {
      lines.push('');
      lines.push('**Zu beachten**');
      for (const warning of result.warnings) lines.push(`- ${warning}`);
    }

    lines.push('');
    lines.push(result.ok
      ? 'Abgelegt wird nichts automatisch — die Klassierung wird erst nach Freigabe übernommen.'
      : 'Ohne Klärung wird nichts abgelegt.');
    return lines.join('\n');
  }

  /** The blocked outcome, in the shape every agent uses. */
  toBlocked(action, result) {
    const first = result.blockers[0];
    return {
      ...blocked(action, first.reason, { message: this.compose(result) }),
      blockers: result.blockers.map((blocker) => blocker.detail),
      warnings: result.warnings,
    };
  }
}

export default new DocumentService();
