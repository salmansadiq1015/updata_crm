/**
 * What happens to a document the system took in by itself.
 *
 * Two sources feed this — a mailbox and a scan folder — and neither knows
 * anything about projects or document types. This is the part that does: it
 * asks Document AI what the paper is, works out which job it belongs to, and
 * files it. From there the ordinary machinery takes over, because filing a
 * document publishes the same event a person's upload publishes, and Document
 * AI's handoff wakes up on it exactly as it would have.
 *
 * Three rules, and each one exists because of what the alternative costs.
 *
 * It never guesses a project. A Bohrbewilligung filed against the wrong job is
 * worse than one nobody filed: Behörden AI will report the permit present on a
 * project that has none, and the site starts without it. A document whose
 * project cannot be established is recorded and left for a person.
 *
 * It never files the same paper twice. A mailbox is polled every few minutes
 * and a folder is swept over and over; without a mark, the same supplier
 * invoice is filed at every pass, and Money AI counts it every time.
 *
 * And a failure is written down as carefully as a success. Ingestion runs when
 * nobody is watching, so the only trace of a paper that did not make it is the
 * one kept here.
 */
import mongoose from 'mongoose';
import IngestedDocument from './ingestedDocument.model.js';
import logger from '../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/**
 * A record number written anywhere a human might write it — in the file name,
 * in a subject line, in the sender's covering sentence.
 *
 * No \b anchors: an underscore is a word character, so "\bPRJ" never matches
 * inside "Bohrbewilligung_PRJ-2026-00042.pdf", which is exactly how an office
 * names a file.
 */
const PROJECT_NUMBER = /PRJ-\d{4}-\d{3,6}/i;
const ORDER_NUMBER = /AUF-\d{4}-\d{3,6}/i;

/**
 * What a name and a subject say about which record this belongs to.
 *
 * Kept separate from the lookup so it can be reasoned about on its own: this
 * is the whole of the evidence, and everything softer — a customer name, a
 * date, the sender's domain — is deliberately not evidence. Two jobs for the
 * same customer is the normal case, not the exception.
 */
export function findRecordNumbers({ fileName = '', origin = '' } = {}) {
  const haystack = `${fileName} ${origin}`;
  return {
    projectNumber: haystack.match(PROJECT_NUMBER)?.[0]?.toUpperCase() || null,
    orderNumber: haystack.match(ORDER_NUMBER)?.[0]?.toUpperCase() || null,
  };
}

class IngestionService {
  /**
   * Has this exact paper been through here before?
   *
   * The reference is what the source can promise is stable: a message id and
   * an attachment name, or a path and a size. Not the file name alone — two
   * suppliers both call it "Rechnung.pdf".
   */
  async alreadySeen(source, sourceRef) {
    if (!dbReady()) return false;
    const found = await IngestedDocument.findOne({ source, sourceRef }).select('_id').lean();
    return Boolean(found);
  }

  /**
   * Which job this document belongs to.
   *
   * A record number in the name or the subject is a fact and is used. Anything
   * softer — a customer name, a date, a guess from the sender — is not: the
   * cost of being wrong is a document filed where nobody will look for it, and
   * an agent reporting a paper present that is not.
   */
  async resolveProject({ fileName = '', origin = '' } = {}) {
    const { projectNumber, orderNumber } = findRecordNumbers({ fileName, origin });
    if (!projectNumber && !orderNumber) {
      return { project: null, reason: 'Weder Projekt- noch Auftragsnummer im Dateinamen oder Betreff.' };
    }
    if (!dbReady()) return { project: null, reason: 'Die Datenbank war nicht erreichbar.' };

    if (projectNumber) {
      const Project = (await import('../../pm/project.model.js')).default;
      const project = await Project.findOne({ projectNumber })
        .select('projectNumber name customerId').lean();
      return project
        ? { project, evidence: `Projektnummer ${projectNumber} erkannt.` }
        : { project: null, reason: `Projektnummer ${projectNumber} erkannt, aber kein solches Projekt vorhanden.` };
    }

    // An order number reaches the project through the order it belongs to.
    if (orderNumber) {
      const Order = (await import('../../qop/order.model.js')).default;
      const order = await Order.findOne({ orderNumber }).select('projectId orderNumber').lean();
      if (order?.projectId) {
        const Project = (await import('../../pm/project.model.js')).default;
        const project = await Project.findById(order.projectId)
          .select('projectNumber name customerId').lean();
        if (project) return { project, evidence: `Über Auftrag ${orderNumber} zugeordnet.` };
      }
      return { project: null, reason: `Auftragsnummer ${orderNumber} erkannt, aber kein Projekt daran.` };
    }

    return { project: null, reason: 'Kein Projekt bestimmbar.' };
  }

  /**
   * Takes one document in: reads it, files it where it belongs, and records
   * what happened either way.
   *
   * @returns {Promise<{outcome: string, message: string, projectId?: string}>}
   */
  async ingest({ source, sourceRef, fileName, mimeType = null, buffer, origin = null, userId = null }) {
    if (await this.alreadySeen(source, sourceRef)) {
      return { outcome: 'duplicate', message: `„${fileName}" wurde bereits eingelesen.` };
    }

    const record = {
      source, sourceRef, fileName, mimeType,
      sizeBytes: buffer?.length ?? null,
      origin: origin ? String(origin).slice(0, 500) : null,
      evidence: [],
    };

    try {
      const documentService = (await import('../../ai/agents/document/document.service.js')).default;
      const reading = await documentService.classify({ fileName, mimeType: mimeType || '' });
      record.documentType = reading.type?.key || null;
      record.category = reading.category || 'OTHER';
      record.evidence = (reading.evidence || []).slice(0, 5);

      const { project, evidence, reason } = await this.resolveProject({ fileName, origin });
      if (evidence) record.evidence.push(evidence);

      if (!project) {
        record.outcome = 'no_project';
        record.message = reason;
        await this._log(record);
        return { outcome: 'no_project', message: reason };
      }

      record.projectId = project._id;

      const pmDocumentService = (await import('../../pm/document.service.js')).default;
      const stored = await pmDocumentService.upload(project._id, {
        buffer,
        originalName: fileName,
        mimeType: mimeType || 'application/octet-stream',
        sizeBytes: buffer.length,
        // What Document AI read it as. Filing it under OTHER would hide it
        // from the three agents that go looking for it by category.
        category: reading.category || 'OTHER',
        description: reading.type
          ? `Automatisch eingelesen (${source === 'mailbox' ? 'E-Mail' : 'Scan'}) — erkannt als ${reading.type.label}.`
          : `Automatisch eingelesen (${source === 'mailbox' ? 'E-Mail' : 'Scan'}) — Typ nicht erkannt.`,
      }, userId, { source: 'document-ingestion' });

      record.projectDocumentId = stored._id;
      record.outcome = reading.type ? 'filed' : 'unclassified';
      record.message = reading.type
        ? `Als ${reading.type.label} zu ${project.projectNumber} abgelegt.`
        : `Zu ${project.projectNumber} abgelegt, Typ nicht erkannt — bitte von Hand einordnen.`;

      await this._log(record);
      logger.info('Document ingested', {
        module: 'document-ingestion',
        action: 'ingest',
        source,
        fileName,
        projectNumber: project.projectNumber,
        type: reading.type?.key || null,
      });

      return { outcome: record.outcome, message: record.message, projectId: String(project._id) };
    } catch (err) {
      record.outcome = 'failed';
      record.error = String(err.message).slice(0, 1000);
      record.message = `Konnte nicht eingelesen werden: ${err.message}`;
      await this._log(record);
      logger.warn('Document ingestion failed', {
        module: 'document-ingestion', action: 'ingest', source, fileName, error: err.message,
      });
      return { outcome: 'failed', message: record.message };
    }
  }

  /** The trail. Never lets a logging failure lose the document itself. */
  async _log(record) {
    try {
      await IngestedDocument.create(record);
    } catch (err) {
      logger.warn('Could not record an ingestion', {
        module: 'document-ingestion', action: 'log', error: err.message,
      });
    }
  }

  /** What came in lately, for the screen that watches this. */
  async recent({ limit = 50, outcome = null } = {}) {
    if (!dbReady()) return [];
    return IngestedDocument.find(outcome ? { outcome } : {})
      .sort({ createdAt: -1 }).limit(Math.min(limit, 200))
      .populate('projectId', 'projectNumber name')
      .lean();
  }

  /** How the last day went, in four numbers. */
  async summary() {
    if (!dbReady()) return { filed: 0, unclassified: 0, no_project: 0, failed: 0 };
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await IngestedDocument.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$outcome', n: { $sum: 1 } } },
    ]);
    const out = { filed: 0, unclassified: 0, no_project: 0, duplicate: 0, failed: 0 };
    for (const row of rows) out[row._id] = row.n;
    return out;
  }
}

export default new IngestionService();
