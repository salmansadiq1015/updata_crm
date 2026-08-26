/**
 * Dispo AI — who can go, and what has to be true before they do.
 *
 * The specification: "Schlägt Einsätze vor anhand von Qualifikation, Zeit, Ort,
 * Material- und Bewilligungsstatus. Prüft zehn Punkte vor jedem Einsatz."
 *
 * Seven of those ten already exist in the scheduling module, which detects
 * conflicts before an assignment is saved. This agent reuses that detection
 * rather than re-implementing it — a second opinion that disagreed with the
 * planner would be worse than no opinion — and adds the three it cannot see:
 * whether the site start is released, whether the job is still open at all,
 * and whether the plant even calls for the qualification being asked about.
 *
 * The conflict service speaks English to the API; the office reads German, so
 * every conflict is named here rather than passed through.
 *
 * It proposes. Booking a slot stays CREATE_ASSIGNMENT, which needs approval.
 */
import mongoose from 'mongoose';
import { BLOCK_REASONS } from '../../governance/agent.risk.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/** How each conflict reads to the office, and whether it stops the job. */
const CONFLICTS = Object.freeze({
  INACTIVE_EMPLOYEE: { label: 'Monteur nicht aktiv', hard: true },
  ABSENCE: { label: 'Abwesenheit', hard: true },
  DOUBLE_BOOKING: { label: 'Doppelbelegung', hard: false },
  SKILL_MISMATCH: { label: 'Qualifikation fehlt', hard: false },
  CERTIFICATION_MISSING: { label: 'Zertifikat fehlt', hard: false },
  WORKING_HOURS: { label: 'Ausserhalb der Arbeitszeit', hard: false },
  TRAVEL_TIME: { label: 'Zu wenig Fahrzeit', hard: false },
});

/** The absence kinds, as the office names them. */
const ABSENCE_TYPES = Object.freeze({
  VACATION: 'Ferien',
  SICK: 'Krankheit',
  PUBLIC_HOLIDAY: 'Feiertag',
  COMPANY_CLOSURE: 'Betriebsferien',
  OTHER_ABSENCE: 'Abwesenheit',
});

/**
 * Which qualification a plant calls for. The vocabulary is the one already in
 * the employee records, so a match here is a match in the scheduling module.
 */
const SKILL_BY_INSTALLATION_TYPE = Object.freeze({
  boiler: 'boiler',
  heat_pump: 'heat_pump',
  solar_thermal: 'solar_thermal',
  ventilation: 'ventilation',
  hot_water: 'hot_water',
  radiator_system: 'radiator_system',
});

function swissDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function employeeName(employee) {
  return [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'Unbekannt';
}

class DispoService {
  /** What the plant itself demands of whoever turns up. */
  requirementsFor(installation) {
    if (!installation) return { requiredSkills: [], recommendedSkills: [], requiredCertifications: [], recommendedCertifications: [] };
    const skill = SKILL_BY_INSTALLATION_TYPE[installation.type];
    const fuel = ['gas', 'oil', 'electric', 'pellet'].includes(installation.fuelType) ? installation.fuelType : null;
    return {
      requiredSkills: [skill].filter(Boolean),
      recommendedSkills: [fuel].filter(Boolean),
      requiredCertifications: [],
      recommendedCertifications: [],
    };
  }

  /** Translates one conflict from the scheduling module into German. */
  _name(conflict) {
    const known = CONFLICTS[conflict.conflictType];
    const label = known?.label || conflict.conflictType;
    const hard = known ? known.hard : conflict.severity === 'HARD';

    // The module's own text is English and sometimes carries the useful
    // specifics, so the parts worth keeping are re-expressed rather than shown.
    let detail = label;
    const text = String(conflict.description || '');
    if (conflict.conflictType === 'DOUBLE_BOOKING') {
      const overlap = text.match(/'([^']+)'\s*\(([^)]+)\)/);
      detail = overlap ? `${label}: ${overlap[1]} (${overlap[2]})` : label;
    } else if (conflict.conflictType === 'SKILL_MISMATCH' || conflict.conflictType === 'CERTIFICATION_MISSING') {
      const missing = text.split(':')[1]?.trim();
      detail = missing ? `${label}: ${missing}` : label;
    } else if (conflict.conflictType === 'WORKING_HOURS') {
      const hours = text.match(/\(([^)]+)\)/);
      detail = hours ? `${label} (${hours[1]})` : label;
    } else if (conflict.conflictType === 'TRAVEL_TIME') {
      const gap = text.match(/(\d+)\s*min gap/);
      detail = gap ? `${label}: nur ${gap[1]} Minuten zwischen zwei Einsätzen` : label;
    } else if (conflict.conflictType === 'ABSENCE') {
      const kind = text.match(/on (\w+) on ([\d-]+)/);
      if (kind) {
        const [year, month, day] = kind[2].split('-');
        detail = `${ABSENCE_TYPES[kind[1]] || label} am ${day}.${month}.${year}`;
      }
    }

    return { type: conflict.conflictType, detail, hard };
  }

  /**
   * The ten points before an assignment. Returns what stops it and what is
   * merely worth knowing, separately.
   */
  async checkBeforeAssignment({ employee, start, end, project = null, installation = null } = {}) {
    const blockers = [];
    const warnings = [];

    if (!dbReady()) {
      return { ok: false, verified: false, blockers, warnings: ['Die Planung konnte nicht geprüft werden.'], conflicts: [] };
    }
    if (!employee?._id || !start || !end) {
      return {
        ok: false,
        verified: false,
        blockers: [{ reason: BLOCK_REASONS.MISSING_REQUIRED_DATA, detail: 'Monteur, Datum und Dauer werden für die Prüfung gebraucht.' }],
        warnings,
        conflicts: [],
      };
    }

    const requirements = this.requirementsFor(installation);

    // 1 to 7 — the scheduling module's own detection, so the agent and the
    // planner never disagree about the same slot.
    let conflicts = [];
    try {
      const conflictService = (await import('../../../deploy/conflict.service.js')).default;
      conflicts = await conflictService.detectConflicts(employee._id, start, end, null, requirements);
    } catch (err) {
      logger.warn('Dispo AI could not run the conflict detection', {
        module: 'ai-dispo', action: 'checkBeforeAssignment', error: err.message,
      });
      warnings.push('Die Terminkonflikte konnten nicht geprüft werden.');
    }

    const named = conflicts.map((conflict) => this._name(conflict));
    for (const conflict of named) {
      if (conflict.hard) blockers.push({ reason: BLOCK_REASONS.UNCLEAR_RESPONSIBILITY, detail: conflict.detail });
      else warnings.push(conflict.detail);
    }

    // 8 — the site start, which only Behörden AI knows about.
    if (project?._id) {
      try {
        const behoerdenService = (await import('../behoerden/behoerden.service.js')).default;
        const permits = await behoerdenService.assess(project);
        const open = (permits.procedures || []).filter((procedure) => procedure.blocksStart && procedure.status === 'offen');
        if (open.length) {
          blockers.push({
            reason: BLOCK_REASONS.MISSING_PERMIT,
            detail: `Baustart nicht freigegeben: ${open.map((procedure) => procedure.label).join(', ')} fehlt.`,
          });
        }
      } catch (err) {
        logger.warn('Dispo AI could not check the permits', {
          module: 'ai-dispo', action: 'checkBeforeAssignment', error: err.message,
        });
        warnings.push('Der Bewilligungsstand konnte nicht geprüft werden.');
      }
    }

    // 9 — a job nobody should still be driving to.
    if (project?.status && ['COMPLETED', 'INVOICED', 'ARCHIVED'].includes(project.status)) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
        detail: `Das Projekt steht auf ${project.status} — ein Einsatz ist nicht mehr vorgesehen.`,
      });
    }

    // 10 — the qualification the plant calls for, said out loud even when it
    // matches, because that is the point of asking.
    if (!installation) {
      warnings.push('Keine Anlage zugeordnet — Qualifikation und Zertifikat konnten nicht gegen die Anlage geprüft werden.');
    }

    return { ok: blockers.length === 0, verified: true, employee, start, end, project, installation, requirements, conflicts: named, blockers, warnings };
  }

  /**
   * Who could take the slot. Every active employee is checked against the same
   * ten points; those with a hard conflict are named as unavailable rather than
   * silently dropped, because "nobody is free" and "I only looked at two" are
   * very different answers.
   */
  async suggest({ start, end, project = null, installation = null, limit = 5 } = {}) {
    if (!dbReady() || !start || !end) return { candidates: [], excluded: [] };

    let employees = [];
    try {
      const User = (await import('../../../auth/user.model.js')).default;
      employees = await User.find({ status: 'active' })
        .select('firstName lastName schedulingSkills schedulingCertifications')
        .limit(50)
        .lean();
    } catch (err) {
      logger.warn('Dispo AI could not read the employees', {
        module: 'ai-dispo', action: 'suggest', error: err.message,
      });
      return { candidates: [], excluded: [] };
    }

    const assessed = [];
    for (const employee of employees) {
      const result = await this.checkBeforeAssignment({ employee, start, end, project, installation });
      assessed.push({
        employee,
        name: employeeName(employee),
        skills: employee.schedulingSkills || [],
        blockers: result.blockers.map((blocker) => blocker.detail),
        warnings: result.warnings.filter((warning) => !/Keine Anlage zugeordnet/.test(warning)),
        free: result.ok,
      });
    }

    // Whoever actually holds the qualification comes first. Counting warnings
    // alone would rank somebody with no skills at all beside a fitter who is
    // merely short one of them.
    const qualified = (entry) => (entry.warnings.some((warning) => /Qualifikation fehlt|Zertifikat fehlt/.test(warning)) ? 1 : 0);
    const candidates = assessed
      .filter((entry) => entry.free)
      .sort((a, b) => qualified(a) - qualified(b) || a.warnings.length - b.warnings.length)
      .slice(0, limit);
    const excluded = assessed.filter((entry) => !entry.free);

    logger.info('Dispo AI proposed a dispatch', {
      module: 'ai-dispo',
      action: 'suggest',
      checked: assessed.length,
      candidates: candidates.length,
    });

    return { candidates, excluded, start, end, installation, requirements: this.requirementsFor(installation) };
  }

  /** The check, as the office reads it. */
  composeCheck(result) {
    if (!result.verified) {
      const first = result.blockers[0];
      return first ? first.detail : 'Die Prüfung konnte nicht durchgeführt werden.';
    }

    const who = employeeName(result.employee);
    const when = swissDateTime(result.start);
    const lines = [result.ok
      ? `**${who} kann am ${when} eingeplant werden.**`
      : `**${who} kann am ${when} nicht eingeplant werden.**`];

    if (result.installation) {
      const needed = result.requirements.requiredSkills.concat(result.requirements.recommendedSkills).filter(Boolean);
      lines.push('');
      lines.push(`Anlage: ${[result.installation.manufacturer, result.installation.model].filter(Boolean).join(' ') || result.installation.installationNumber}${needed.length ? ` — verlangt: ${needed.join(', ')}` : ''}.`);
    }

    if (result.blockers.length) {
      lines.push('');
      lines.push('**Das steht entgegen**');
      for (const blocker of result.blockers) lines.push(`- ${blocker.detail}`);
    }
    if (result.warnings.length) {
      lines.push('');
      lines.push('**Zu beachten**');
      for (const warning of result.warnings) lines.push(`- ${warning}`);
    }

    lines.push('');
    lines.push('Der Einsatz wird nicht automatisch gebucht — ein Termin geht erst nach Freigabe in den Kalender.');
    return lines.join('\n');
  }

  /** The proposal, as the office reads it. */
  composeSuggestion(result) {
    const when = swissDateTime(result.start);
    const lines = [];

    if (!result.candidates.length) {
      lines.push(`**Für ${when} ist niemand frei.**`);
    } else {
      lines.push(`**Für ${when} kämen infrage:**`);
      lines.push('');
      for (const candidate of result.candidates) {
        lines.push(`- **${candidate.name}**${candidate.skills.length ? ` — ${candidate.skills.join(', ')}` : ''}.`);
        for (const warning of candidate.warnings) lines.push(`  Zu beachten: ${warning}`);
      }
    }

    if (result.excluded.length) {
      lines.push('');
      lines.push('**Nicht verfügbar**');
      for (const entry of result.excluded) {
        lines.push(`- ${entry.name}: ${entry.blockers.join('; ')}`);
      }
    }

    lines.push('');
    lines.push('Der Einsatz wird nicht automatisch gebucht — ein Termin geht erst nach Freigabe in den Kalender.');
    return lines.join('\n');
  }

}

export default new DispoService();
