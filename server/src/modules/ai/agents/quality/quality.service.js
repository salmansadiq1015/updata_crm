/**
 * Quality AI — closing check.
 *
 * The specification gives it one job: "Prüft die Abschluss-Checkliste je
 * Projekttyp und sperrt den Projektabschluss bei fehlenden Unterlagen." It
 * reads the same task templates Projekt AI opened the project with, adds the
 * paperwork each plant type must leave behind, and says what is still missing.
 *
 * It never closes a project and never invoices one. It blocks, lists, and
 * hands the decision back to a person.
 *
 * Like Money AI it judges records it actually read: "could not check" is
 * reported as such, never as an all-clear and never as an invented blocker.
 */
import mongoose from 'mongoose';
import { BLOCK_REASONS, blocked } from '../../governance/agent.risk.js';
import { documentTypeLabel, matchDocumentType } from '../document/documentTypes.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/**
 * Paperwork a finished job must leave behind, per plant type.
 *
 * Only what is specific to closing lives here: which document types are
 * expected, which of them hold the closing, and the name the checklist gives
 * them. What each type *is* — and how it is recognised in a file — comes from
 * the shared vocabulary, so a document Document AI files as an IBN-Protokoll
 * is the same one this checklist then finds.
 */
const need = (key, blocking, label = null) => ({ key, blocking, label: label || documentTypeLabel(key) });

const CLOSING_DOCUMENTS = Object.freeze({
  ERDSONDEN_WP: [
    need('BOHRBEWILLIGUNG', true),
    need('IBN_PROTOKOLL', true),
    need('WPSM', true),
    need('FOERDERABSCHLUSS', true),
    need('FOTOS', true, 'Fotos der fertigen Anlage'),
    need('SCHEMA', false),
    need('GARANTIE', false),
  ],
  LUFT_WASSER_WP: [
    need('BAUMELDUNG', true),
    need('SCHALLSCHUTZ', true),
    need('IBN_PROTOKOLL', true),
    need('FOERDERABSCHLUSS', true),
    need('FOTOS', true, 'Fotos der fertigen Anlage'),
    need('GARANTIE', false),
  ],
  BOILER_SPEICHER: [
    need('FOTOS', true, 'Fotos der fertigen Anlage'),
    need('GARANTIE', true, 'Garantieunterlagen'),
    need('ENTSORGUNG', false, 'Entsorgungsnachweis Altgerät'),
  ],
  STANDARD: [
    need('FOTOS', true, 'Fotos der ausgeführten Arbeiten'),
    need('ABNAHME', false, 'Abschlussdokumentation'),
  ],
});

/** Falls back on the project type when no trade template was recognised. */
const CLOSING_DOCUMENTS_BY_PROJECT_TYPE = Object.freeze({
  NEW_INSTALLATION: CLOSING_DOCUMENTS.STANDARD,
  RENOVATION: CLOSING_DOCUMENTS.BOILER_SPEICHER,
  MAINTENANCE: [need('RAPPORT', true, 'Servicerapport'), need('FOTOS', false)],
  SERVICE_CONTRACT: [need('RAPPORT', true, 'Servicerapport')],
  OTHER: CLOSING_DOCUMENTS.STANDARD,
});

/**
 * What each filed document is, decided once per document rather than once per
 * requirement — the same reading Document AI does when it classifies.
 *
 * A document already filed under PHOTOS is a photo whatever its name says;
 * that is a classification the office made, and it is trusted.
 */
function classifyFiled(document) {
  if (document.category === 'PHOTOS') return 'FOTOS';
  const text = [document.fileName, document.description, document.templateType].filter(Boolean).join(' ');
  return matchDocumentType(text)?.key || null;
}

class QualityService {
  /** The closing paperwork expected for this project. */
  requirementsFor(project, template) {
    if (template?.key && CLOSING_DOCUMENTS[template.key]) return CLOSING_DOCUMENTS[template.key];
    return CLOSING_DOCUMENTS_BY_PROJECT_TYPE[project?.projectType] || CLOSING_DOCUMENTS.STANDARD;
  }

  /** Checklist tasks still open on the project. */
  async _openTasks(projectId) {
    if (!dbReady()) return null;
    try {
      const Task = (await import('../../../tasks/task.model.js')).default;
      return Task.find({
        projectId,
        status: { $in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] },
      }).select('title status dueDate priority').limit(50).lean();
    } catch (err) {
      logger.warn('Quality AI could not read the tasks', {
        module: 'ai-quality', action: 'openTasks', error: err.message,
      });
      return null;
    }
  }

  /** Work reports on the project that nobody has approved yet. */
  async _openReports(projectId) {
    if (!dbReady()) return null;
    try {
      const WorkReport = (await import('../../../mobile/workReport.model.js')).default;
      return WorkReport.find({
        projectId,
        status: { $nin: ['APPROVED', 'INVOICED'] },
      }).select('reportNumber status reportDate').limit(30).lean();
    } catch (err) {
      logger.warn('Quality AI could not read the reports', {
        module: 'ai-quality', action: 'openReports', error: err.message,
      });
      return null;
    }
  }

  /** Documents filed on the project. */
  async _documents(projectId) {
    if (!dbReady()) return null;
    try {
      const ProjectDocument = (await import('../../../pm/projectDocument.model.js')).default;
      return ProjectDocument.find({ projectId, archived: { $ne: true } })
        .select('fileName description category templateType status')
        .limit(200)
        .lean();
    } catch (err) {
      logger.warn('Quality AI could not read the project documents', {
        module: 'ai-quality', action: 'documents', error: err.message,
      });
      return null;
    }
  }

  /**
   * The closing check. Returns blockers and warnings separately: a blocker
   * stops the closing, a warning is worth naming without stopping anything.
   */
  async checkBeforeClose(projectRef) {
    const blockers = [];
    const warnings = [];

    // Context resolution hands over a short projection. The closing check is
    // judged on the full record or not at all.
    let project = projectRef;
    let verified = false;
    const projectId = projectRef?._id || projectRef?.id;
    if (projectId && dbReady()) {
      try {
        const Project = (await import('../../../pm/project.model.js')).default;
        const full = await Project.findById(projectId)
          .select('projectNumber name description status projectType customerId customerName')
          .lean();
        if (full) { project = { ...projectRef, ...full }; verified = true; }
      } catch (err) {
        logger.warn('Quality AI could not reload the project', {
          module: 'ai-quality', action: 'checkBeforeClose', error: err.message,
        });
      }
    }

    if (!verified) {
      return {
        ok: false,
        verified: false,
        project,
        template: null,
        blockers: [],
        warnings: ['Das Projekt konnte nicht gelesen werden — die Abschlussprüfung ist nicht aussagekräftig.'],
        openTasks: [],
        openReports: [],
        missing: [],
        present: [],
      };
    }

    // Which checklist the project was opened with. Projekt AI writes the
    // template name into the description, so the same choice is reproduced.
    const projektService = (await import('../projekt/projekt.service.js')).default;
    const template = await projektService.selectTemplate({
      title: project.name || '',
      description: project.description || '',
    });
    const requirements = this.requirementsFor(project, template);

    // 1. Status — the check runs on any project, but says when it is out of turn.
    if (['COMPLETED', 'INVOICED', 'ARCHIVED'].includes(project.status)) {
      warnings.push(`Das Projekt steht bereits auf ${project.status}.`);
    } else if (['DRAFT', 'PLANNING'].includes(project.status)) {
      warnings.push(`Das Projekt steht auf ${project.status} — die Ausführung hat noch nicht begonnen.`);
    }

    // 2. Checklist worked through.
    const openTasks = await this._openTasks(project._id);
    if (openTasks === null) {
      warnings.push('Die Aufgaben konnten nicht geprüft werden.');
    } else if (openTasks.length) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
        detail: `${openTasks.length} Aufgabe(n) noch offen: ${openTasks.slice(0, 3).map((task) => task.title).join(', ')}${openTasks.length > 3 ? ' …' : ''}.`,
      });
    }

    // 3. Reports approved — the same rule Money AI applies before invoicing.
    const openReports = await this._openReports(project._id);
    if (openReports === null) {
      warnings.push('Die Rapporte konnten nicht geprüft werden.');
    } else if (openReports.length) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_APPROVAL,
        detail: `${openReports.length} Rapport(e) nicht freigegeben: ${openReports.slice(0, 3).map((report) => report.reportNumber).join(', ')}.`,
      });
    }

    // 4. The paperwork itself.
    const documents = await this._documents(project._id);
    const present = [];
    const missing = [];
    if (documents === null) {
      warnings.push('Die Projektdokumente konnten nicht geprüft werden.');
    } else {
      const indexed = documents.map((document) => ({ document, key: classifyFiled(document) }));
      for (const requirement of requirements) {
        const hit = indexed.find(({ key }) => key === requirement.key);
        if (hit) {
          present.push({ key: requirement.key, label: requirement.label, fileName: hit.document.fileName });
          // Filed but still a draft — worth naming, the document exists.
          if (hit.document.status === 'DRAFT') {
            warnings.push(`${requirement.label} liegt nur als Entwurf vor (${hit.document.fileName}).`);
          }
        } else {
          missing.push(requirement);
          if (!requirement.blocking) warnings.push(`${requirement.label} fehlt.`);
        }
      }

      const blockingMissing = missing.filter((requirement) => requirement.blocking);
      if (blockingMissing.length) {
        blockers.push({
          reason: BLOCK_REASONS.MISSING_DOCUMENT,
          detail: `${blockingMissing.length} Pflichtdokument(e) fehlen: ${blockingMissing.map((requirement) => requirement.label).join(', ')}.`,
        });
      }
    }

    logger.info('Quality AI ran a closing check', {
      module: 'ai-quality',
      action: 'checkBeforeClose',
      projectId: String(project._id),
      template: template?.key || null,
      blockers: blockers.length,
    });

    return {
      ok: blockers.length === 0,
      verified: true,
      project,
      template,
      blockers,
      warnings,
      openTasks: openTasks || [],
      openReports: openReports || [],
      missing,
      present,
    };
  }

  /** The reader's answer: what holds the closing, and what is already in place. */
  compose(result) {
    const name = result.project?.name || result.project?.projectNumber || 'Das Projekt';
    const lines = [];

    if (!result.verified) {
      return `Die Abschlussprüfung für ${name} konnte nicht durchgeführt werden — das Projekt ist nicht lesbar.`;
    }

    lines.push(result.ok
      ? `Abschlussprüfung ${name}: bereit zum Abschluss.`
      : `Abschlussprüfung ${name}: noch nicht abschliessbar.`);
    if (result.template) {
      lines.push(`Geprüfte Checkliste: „${result.template.name}".`);
    }

    if (result.blockers.length) {
      lines.push('');
      lines.push('Das hält den Abschluss auf:');
      for (const blocker of result.blockers) lines.push(`- ${blocker.detail}`);
    }

    if (result.present.length) {
      lines.push('');
      lines.push(`Vorhanden: ${result.present.map((item) => item.label).join(', ')}.`);
    }

    if (result.warnings.length) {
      lines.push('');
      lines.push('Zusätzlich zu prüfen:');
      for (const warning of result.warnings) lines.push(`- ${warning}`);
    }

    lines.push('');
    lines.push(result.ok
      ? 'Der Abschluss muss weiterhin von Hand bestätigt werden.'
      : 'Das Projekt bleibt offen, bis die fehlenden Punkte erledigt sind.');

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

export default new QualityService();
