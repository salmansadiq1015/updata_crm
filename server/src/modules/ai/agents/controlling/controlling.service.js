/**
 * Controlling AI — figures per job, and an honest account of what is missing.
 *
 * The specification asks for "Kennzahlen, Umsatz- und Liquiditätsprognosen
 * sowie Wochen- und Monatsberichte" and then adds the sentence that shapes
 * this whole agent: "Markiert unvollständige Datengrundlagen."
 *
 * That sentence is the job. A margin computed on a guessed hourly cost is not
 * a weaker figure than a real one, it is a worse thing than no figure at all —
 * the office would price the next job with it. This system records a billing
 * rate and no cost rate, so a margin is not computable, and the agent says so
 * instead of producing one. What can be computed is computed; what cannot is
 * named, with the reason.
 *
 * It reads. Its allowedActions list is empty.
 */
import mongoose from 'mongoose';
import { BLOCK_REASONS, blocked } from '../../governance/agent.risk.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/** Invoice states that mean the money has not arrived. */
const UNPAID = ['SENT', 'OVERDUE', 'PARTIALLY_PAID', 'DRAFT'];

function money(amount, currency = 'CHF') {
  if (amount === null || amount === undefined) return '—';
  return `${currency} ${Number(amount).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hours(minutes) {
  if (!minutes) return 0;
  return Math.round((minutes / 60) * 10) / 10;
}

class ControllingService {
  /** The billing rate the office configured, or null when none is set. */
  async _billingRate() {
    try {
      const WorkTimeSettings = (await import('../../../mobile/workTimeSettings.model.js')).default;
      const settings = await WorkTimeSettings.findOne({}).select('billingHourlyRate').lean();
      const rate = Number(settings?.billingHourlyRate) || 0;
      return rate > 0 ? rate : null;
    } catch (err) {
      logger.warn('Controlling AI could not read the billing rate', {
        module: 'ai-controlling', action: 'billingRate', error: err.message,
      });
      return null;
    }
  }

  /**
   * What a job has brought in, what has been worked on it, and what is still
   * outstanding — with every gap in the underlying data named.
   */
  async figuresFor(projectRef) {
    const gaps = [];
    const projectId = projectRef?._id || projectRef?.id;
    if (!projectId || !dbReady()) {
      return { verified: false, project: projectRef, gaps };
    }

    let project;
    try {
      const Project = (await import('../../../pm/project.model.js')).default;
      project = await Project.findById(projectId)
        .select('projectNumber name status estimatedBudget currency customerName plannedStartDate').lean();
    } catch (err) {
      logger.warn('Controlling AI could not read the project', {
        module: 'ai-controlling', action: 'figuresFor', error: err.message,
      });
      return { verified: false, project: projectRef, gaps };
    }
    if (!project) return { verified: false, project: projectRef, gaps };

    const [orders, invoices, rate] = await Promise.all([
      this._orders(project._id),
      this._invoices(project._id),
      this._billingRate(),
    ]);

    const ordered = orders.reduce((sum, order) => sum + (order.grandTotalRounded ?? order.grandTotal ?? 0), 0);
    const invoiced = invoices.reduce((sum, invoice) => sum + (invoice.grandTotalRounded ?? invoice.grandTotal ?? 0), 0);
    const outstanding = invoices
      .filter((invoice) => UNPAID.includes(invoice.status))
      .reduce((sum, invoice) => sum + (invoice.grandTotalRounded ?? invoice.grandTotal ?? 0), 0);

    const time = await this._time(orders.map((order) => order._id));

    // ─── The gaps, which are the point of this agent ───────────
    if (!rate) {
      gaps.push('Kein Verrechnungssatz hinterlegt — die erfassten Stunden lassen sich nicht bewerten.');
    }
    gaps.push('Kein Kostensatz pro Stunde im System — eine Marge ist damit nicht berechenbar, nur der Leistungsfortschritt.');
    if (!orders.length) {
      gaps.push('Kein Auftrag am Projekt — Auftragswert und Stunden sind nicht zuzuordnen.');
    }
    if (time.unreleased > 0) {
      gaps.push(`${time.unreleased} Zeiterfassung(en) noch nicht freigegeben — die Stunden können sich noch ändern.`);
    }
    if (!project.estimatedBudget) {
      gaps.push('Kein Budget am Projekt hinterlegt — es gibt nichts, wogegen sich der Stand messen liesse.');
    }
    // Found while building Material AI, and it bites here too.
    gaps.push('Bestellungen tragen keinen Projektbezug — Materialkosten sind diesem Projekt nicht zuweisbar.');

    logger.info('Controlling AI produced project figures', {
      module: 'ai-controlling',
      action: 'figuresFor',
      projectId: String(project._id),
      gaps: gaps.length,
    });

    return {
      verified: true,
      project,
      currency: project.currency || 'CHF',
      budget: project.estimatedBudget || null,
      ordered,
      invoiced,
      outstanding,
      openToInvoice: Math.max(0, ordered - invoiced),
      orders: orders.length,
      invoices: invoices.length,
      hoursWorked: hours(time.minutes),
      hoursValue: rate ? Math.round(hours(time.minutes) * rate * 100) / 100 : null,
      billingRate: rate,
      gaps,
    };
  }

  async _orders(projectId) {
    try {
      const Order = (await import('../../../qop/order.model.js')).default;
      return await Order.find({ projectId, status: { $ne: 'CANCELLED' } })
        .select('orderNumber grandTotal grandTotalRounded status').limit(50).lean();
    } catch { return []; }
  }

  async _invoices(projectId) {
    try {
      const Invoice = (await import('../../../qop/invoice.model.js')).default;
      return await Invoice.find({ projectId, status: { $ne: 'CANCELLED' } })
        .select('invoiceNumber grandTotal grandTotalRounded status dueDate').limit(50).lean();
    } catch { return []; }
  }

  /**
   * Hours booked on this job.
   *
   * Time entries carry an order, not a project, so hours are reached through
   * the project's orders. Work booked without an order is invisible here —
   * which is a data gap, and is reported as one.
   */
  async _time(orderIds) {
    if (!orderIds.length) return { minutes: 0, entries: 0, unreleased: 0 };
    try {
      const TimeEntry = (await import('../../../mobile/timeEntry.model.js')).default;
      const entries = await TimeEntry.find({ orderId: { $in: orderIds } })
        .select('netDurationMin releaseStatus').limit(1000).lean();
      return {
        minutes: entries.reduce((sum, entry) => sum + (entry.netDurationMin || 0), 0),
        entries: entries.length,
        unreleased: entries.filter((entry) => entry.releaseStatus !== 'RELEASED').length,
      };
    } catch (err) {
      logger.warn('Controlling AI could not read the time entries', {
        module: 'ai-controlling', action: 'time', error: err.message,
      });
      return { minutes: 0, entries: 0, unreleased: 0 };
    }
  }

  /** The figures, as the office reads them. */
  compose(result) {
    if (!result.verified) {
      return 'Die Kennzahlen konnten nicht ermittelt werden — das Projekt ist nicht lesbar.';
    }

    const c = result.currency;
    const lines = [`**Kennzahlen ${result.project.name}**`, ''];
    if (result.project.customerName) lines.push(`${result.project.customerName} · Status ${result.project.status}.`);

    lines.push('');
    lines.push('**Stand**');
    lines.push(`- Budget: ${money(result.budget, c)}`);
    lines.push(`- Auftragswert: ${money(result.ordered, c)} aus ${result.orders} Auftrag/Aufträgen`);
    lines.push(`- Verrechnet: ${money(result.invoiced, c)} aus ${result.invoices} Rechnung(en)`);
    lines.push(`- Noch nicht verrechnet: ${money(result.openToInvoice, c)}`);
    lines.push(`- Davon offen beim Kunden: ${money(result.outstanding, c)}`);
    lines.push(`- Erfasste Stunden: ${result.hoursWorked} h${result.hoursValue !== null ? ` (zum Verrechnungssatz ${money(result.billingRate, c)}/h: ${money(result.hoursValue, c)})` : ''}`);

    if (result.budget) {
      const share = Math.round((result.invoiced / result.budget) * 100);
      lines.push(`- Verrechnet gegenüber Budget: ${share} %`);
    }

    lines.push('');
    lines.push('**Womit diese Zahlen zu lesen sind**');
    for (const gap of result.gaps) lines.push(`- ${gap}`);

    lines.push('');
    lines.push('Zahlen aus dem laufenden Bestand — keine Buchhaltungsauswertung und kein Abschluss.');
    return lines.join('\n');
  }

  /** The blocked outcome, in the shape every agent uses. */
  toBlocked(action, result) {
    return blocked(action, BLOCK_REASONS.MISSING_REQUIRED_DATA, { message: this.compose(result) });
  }
}

export default new ControllingService();
