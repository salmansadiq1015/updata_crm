/**
 * Behörden AI — permits, subsidy applications and their deadlines.
 *
 * The specification: "Bereitet Baumeldungen, Baugesuche, Bohrbewilligungen,
 * Fördergesuche und WPSM-Unterlagen vor. Reicht nie selbständig ein." Its
 * allowedActions list is deliberately empty — it drafts, it watches deadlines,
 * it blocks a site start, and a person files.
 *
 * One rule shapes this whole file. What a canton or a municipality actually
 * demands — which form, which threshold, which annexes — is not in this system
 * and varies from one commune to the next. So the agent names the *procedure*
 * that applies to the plant type (which the client specified themselves, in
 * the same checklists Projekt AI opens), names the data that procedure needs,
 * and says plainly that the form itself has to be confirmed with the
 * authority. It never invents a cantonal requirement.
 */
import mongoose from 'mongoose';
import { BLOCK_REASONS } from '../../governance/agent.risk.js';
import { matchDocumentType } from '../document/documentTypes.js';
import swissPlzService from '../../../../shared/ai/swissPlz.service.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/**
 * The procedures per plant type, taken from the checklists the client wrote
 * in the 09.05.2026 specification. `needs` is the data the office has to have
 * in hand before the paperwork can be prepared — not a claim about the form.
 */
const PROCEDURES = Object.freeze({
  ERDSONDEN_WP: [
    {
      key: 'BOHRBEWILLIGUNG',
      label: 'Bohrbewilligung',
      why: 'Erdsonden sind bewilligungspflichtig — ohne Bewilligung kein Baustart.',
      needs: ['Kanton', 'Gemeinde', 'Grundstück / Parzelle', 'Sondenanzahl und Sondentiefe'],
      blocksStart: true,
      authority: 'Kanton',
    },
    {
      key: 'FOERDERGESUCH',
      label: 'Fördergesuch',
      why: 'Der Ersatz einer fossilen Heizung ist in der Regel förderberechtigt.',
      needs: ['Kanton', 'Anlagetyp', 'Leistung in kW', 'bisheriges Heizsystem'],
      blocksStart: false,
      authority: 'Kanton',
      beforeStart: true,
    },
    {
      key: 'WPSM',
      label: 'WPSM-Einverständniserklärung',
      why: 'Für das Wärmepumpen-System-Modul werden Hersteller- und Anlagedaten verlangt.',
      needs: ['Anlagetyp', 'Hersteller und Modell', 'Leistung in kW'],
      blocksStart: false,
      authority: 'WPSM-Stelle',
    },
    {
      key: 'FOERDERABSCHLUSS',
      label: 'Förderabschluss',
      why: 'Wird erst nach der Inbetriebnahme eingereicht, mit der Bankverbindung des Kunden.',
      needs: ['IBN-Datum', 'IBN-Protokoll', 'Bankverbindung des Kunden'],
      blocksStart: false,
      authority: 'Kanton',
      afterCommissioning: true,
    },
  ],
  LUFT_WASSER_WP: [
    {
      key: 'BAUMELDUNG',
      label: 'Baumeldung oder Baugesuch',
      why: 'Ob eine Baumeldung genügt oder ein Baugesuch nötig ist, entscheidet die Gemeinde.',
      needs: ['Gemeinde', 'Aufstellort', 'Grundstück / Parzelle'],
      blocksStart: true,
      authority: 'Gemeinde',
    },
    {
      key: 'SCHALLSCHUTZ',
      label: 'Schallschutznachweis',
      why: 'Aussenaufgestellte Wärmepumpen brauchen eine Beurteilung von Aufstellort und Abstand zur Nachbarschaft.',
      needs: ['Aufstellort', 'Abstand zur Nachbargrenze', 'Leistung in kW'],
      blocksStart: true,
      authority: 'Gemeinde',
    },
    {
      key: 'FOERDERGESUCH',
      label: 'Fördergesuch',
      why: 'Der Ersatz einer fossilen Heizung ist in der Regel förderberechtigt.',
      needs: ['Kanton', 'Anlagetyp', 'Leistung in kW', 'bisheriges Heizsystem'],
      blocksStart: false,
      authority: 'Kanton',
      beforeStart: true,
    },
    {
      key: 'WPSM',
      label: 'WPSM-Einverständniserklärung',
      why: 'Für das Wärmepumpen-System-Modul werden Hersteller- und Anlagedaten verlangt.',
      needs: ['Anlagetyp', 'Hersteller und Modell', 'Leistung in kW'],
      blocksStart: false,
      authority: 'WPSM-Stelle',
    },
    {
      key: 'FOERDERABSCHLUSS',
      label: 'Förderabschluss',
      why: 'Wird erst nach der Inbetriebnahme eingereicht, mit der Bankverbindung des Kunden.',
      needs: ['IBN-Datum', 'IBN-Protokoll', 'Bankverbindung des Kunden'],
      blocksStart: false,
      authority: 'Kanton',
      afterCommissioning: true,
    },
  ],
  // The client's own checklist for a boiler swap has no permit step at all.
  BOILER_SPEICHER: [],
});

/**
 * Which document proves a procedure was filed comes from the shared
 * vocabulary Document AI classifies with, so a document it files as a
 * Bohrbewilligung is the same one this agent then finds.
 *
 * The local list it replaces had drifted: a Fördergesuch matched on the
 * fragment "foerder", which also matches a Förderabschluss — the paper filed
 * at the end of a job was being read as the one filed at the start.
 */

class BehoerdenService {
  /**
   * What the authorities need for this project: which procedures apply, what
   * is already under way, and what data is still missing before anything can
   * be prepared.
   */
  async assess(projectRef) {
    const projectId = projectRef?._id || projectRef?.id;
    if (!projectId || !dbReady()) {
      return { verified: false, project: projectRef, procedures: [], blockers: [], warnings: [] };
    }

    let project;
    try {
      const Project = (await import('../../../pm/project.model.js')).default;
      project = await Project.findById(projectId)
        .select('projectNumber name description status projectType customerId customerName siteId')
        .lean();
    } catch (err) {
      logger.warn('Behörden AI could not read the project', {
        module: 'ai-behoerden', action: 'assess', error: err.message,
      });
      return { verified: false, project: projectRef, procedures: [], blockers: [], warnings: [] };
    }
    if (!project) {
      return { verified: false, project: projectRef, procedures: [], blockers: [], warnings: [] };
    }

    const [site, template, documents] = await Promise.all([
      this._site(project.siteId),
      this._template(project),
      this._documents(project._id),
    ]);
    const place = this._place(site);
    const installations = site ? await this._installations(site._id) : [];
    const procedures = this._procedures(template, project, place, installations, documents);

    const blockers = [];
    const warnings = [];

    // Nothing can be prepared for an unrecognised plant type — and guessing
    // whether a permit is needed is exactly the wrong thing to do here.
    if (!template || !(template.key in PROCEDURES)) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
        detail: 'Anlagetyp nicht erkannt — der Bewilligungsbedarf muss von Hand geklärt werden.',
      });
    }

    if (procedures.length) {
      if (!place.canton) {
        blockers.push({
          reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
          detail: place.postalCode
            ? `Kanton zur PLZ ${place.postalCode} nicht hinterlegt — er ist für Bewilligung und Förderung nötig.`
            : 'Kein Objekt mit Adresse am Projekt — Kanton und Gemeinde fehlen.',
        });
      }
      if (!place.city) {
        blockers.push({
          reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
          detail: 'Gemeinde nicht bestimmt — sie entscheidet über Baumeldung oder Baugesuch.',
        });
      }
      if (!installations.some((installation) => installation.powerOutputKw)) {
        warnings.push('Leistung in kW nicht hinterlegt — sie wird für Fördergesuch und WPSM verlangt.');
      }

      const open = procedures.filter((procedure) => procedure.status === 'offen' && procedure.blocksStart);
      if (open.length) {
        blockers.push({
          reason: BLOCK_REASONS.MISSING_PERMIT,
          detail: `Baustart gesperrt: ${open.map((procedure) => procedure.label).join(', ')} nicht eingereicht.`,
        });
      }
    }

    // Said every time, deliberately: this system does not hold cantonal forms.
    if (procedures.length) {
      warnings.push('Welche Formulare und Fristen die Behörde konkret verlangt, ist im System nicht hinterlegt — vor dem Einreichen bei Kanton bzw. Gemeinde prüfen.');
    }

    logger.info('Behörden AI assessed a project', {
      module: 'ai-behoerden',
      action: 'assess',
      projectId: String(project._id),
      template: template?.key || null,
      procedures: procedures.length,
      blockers: blockers.length,
    });

    return {
      verified: true,
      project,
      site,
      place,
      template,
      procedures,
      blockers,
      warnings,
      ok: blockers.length === 0,
    };
  }

  /** Which procedures apply, and how far each one has got. */
  _procedures(template, project, place, installations, documents) {
    const catalogue = template && template.key in PROCEDURES ? PROCEDURES[template.key] : null;
    if (!catalogue) return [];

    const filedKeys = new Set(documents
      .map((document) => matchDocumentType([document.fileName, document.description, document.templateType].filter(Boolean).join(' '))?.key)
      .filter(Boolean));
    const kw = installations.find((installation) => installation.powerOutputKw)?.powerOutputKw || null;

    return catalogue.map((procedure) => {
      const filed = filedKeys.has(procedure.key);
      const missing = this._missingData(procedure, place, kw, installations);
      return {
        ...procedure,
        status: filed ? 'eingereicht' : 'offen',
        missingData: missing,
      };
    });
  }

  /** Of the data a procedure needs, what the system cannot supply today. */
  _missingData(procedure, place, kw, installations) {
    const missing = [];
    for (const need of procedure.needs) {
      if (need === 'Kanton' && !place.canton) missing.push(need);
      else if (need === 'Gemeinde' && !place.city) missing.push(need);
      else if (need === 'Leistung in kW' && !kw) missing.push(need);
      else if (need === 'Hersteller und Modell' && !installations.some((i) => i.manufacturer || i.model)) missing.push(need);
      else if (need === 'Anlagetyp' && !installations.length) missing.push(need);
      // The rest — parcel, borehole depth, distance to the neighbour, bank
      // details, commissioning date — is never in the ERP, so it is listed as
      // something to gather rather than reported as an error.
    }
    return missing;
  }

  _place(site) {
    const postalCode = site?.postalCode || null;
    return {
      postalCode,
      city: site?.city || null,
      canton: postalCode ? swissPlzService.getCantonForPlz(postalCode) : null,
      street: site?.street || null,
    };
  }

  async _site(siteId) {
    if (!siteId) return null;
    try {
      const Site = (await import('../../../crm/site.model.js')).default;
      return Site.findById(siteId).select('name siteNumber street postalCode city customerId').lean();
    } catch { return null; }
  }

  async _installations(siteId) {
    try {
      const Installation = (await import('../../../crm/installation.model.js')).default;
      return Installation.find({ siteId }).select('type manufacturer model powerOutputKw fuelType').limit(10).lean();
    } catch { return []; }
  }

  async _documents(projectId) {
    try {
      const ProjectDocument = (await import('../../../pm/projectDocument.model.js')).default;
      return ProjectDocument.find({ projectId, archived: { $ne: true } })
        .select('fileName description templateType').limit(200).lean();
    } catch { return []; }
  }

  async _template(project) {
    const projektService = (await import('../projekt/projekt.service.js')).default;
    return projektService.selectTemplate({
      title: project.name || '',
      description: project.description || '',
    });
  }

  /** The answer, in the order the office works through it. */
  compose(result) {
    const name = result.project?.name || result.project?.projectNumber || 'Das Projekt';
    if (!result.verified) {
      return `Der Behördencheck für ${name} konnte nicht durchgeführt werden — das Projekt ist nicht lesbar.`;
    }

    const lines = [`**Behördencheck ${name}**`, ''];
    const place = result.place || {};
    const where = [place.city, place.canton ? `Kanton ${place.canton}` : null].filter(Boolean).join(', ');
    // One paragraph: the chat renders Markdown, where single newlines collapse.
    lines.push([
      where ? `Objekt: ${where}.` : 'Objekt: keine Adresse hinterlegt.',
      result.template ? `Erkannte Anlage: „${result.template.name}".` : null,
    ].filter(Boolean).join(' '));

    lines.push('');
    if (!result.procedures.length) {
      lines.push(result.template && result.template.key in PROCEDURES
        ? 'Für diesen Anlagetyp ist kein Bewilligungsverfahren nötig.'
        : 'Es konnte kein Verfahren bestimmt werden.');
    } else {
      lines.push('**Verfahren**');
      for (const procedure of result.procedures) {
        const mark = procedure.status === 'eingereicht' ? '✓' : procedure.blocksStart ? '⛔' : '○';
        lines.push(`- ${mark} **${procedure.label}** (${procedure.authority}) — ${procedure.status}.`);
        lines.push(`  ${procedure.why}`);
        if (procedure.status === 'offen') {
          lines.push(`  Dafür nötig: ${procedure.needs.join(', ')}.`);
          if (procedure.missingData.length) {
            lines.push(`  Im System fehlt: ${procedure.missingData.join(', ')}.`);
          }
        }
      }
    }

    if (result.blockers.length) {
      lines.push('');
      lines.push('**Das hält auf**');
      for (const blocker of result.blockers) lines.push(`- ${blocker.detail}`);
    }

    if (result.warnings.length) {
      lines.push('');
      lines.push('**Zu beachten**');
      for (const warning of result.warnings) lines.push(`- ${warning}`);
    }

    if (result.procedures.length) {
      lines.push('');
      lines.push('Eingereicht wird nichts automatisch — die Unterlagen gehen erst nach Freigabe raus.');
    }

    return lines.join('\n');
  }

}

export default new BehoerdenService();
