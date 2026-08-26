/**
 * Service AI — maintenance due and technician briefings.
 *
 * The specification asks it to "Erkennt fällige Wartungen, strukturiert
 * Störungsmeldungen, bereitet Serviceaufträge und Monteur-Briefings vor".
 * Structuring a fault report already exists as a capability
 * (ANALYZE_FIELD_TICKET); what was missing is the two readings the office
 * actually asks for: what is due, and what a technician needs to know before
 * driving out.
 *
 * It reads and prepares. It never books an appointment and never invoices —
 * an order created from what it found still goes through the normal approval.
 */
import mongoose from 'mongoose';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

const DAY = 86_400_000;

/** German labels for the plant types the CRM stores in English. */
const INSTALLATION_TYPES = Object.freeze({
  boiler: 'Heizkessel',
  heat_pump: 'Wärmepumpe',
  solar_thermal: 'Solarthermie',
  radiator_system: 'Heizkörperanlage',
  ventilation: 'Lüftung',
  hot_water: 'Warmwasser',
  other: 'Anlage',
});

const FUEL_TYPES = Object.freeze({
  gas: 'Gas',
  oil: 'Öl',
  electric: 'Elektro',
  pellet: 'Pellet',
  other: 'anderer Energieträger',
});

const MAINTENANCE_TYPES = Object.freeze({
  annual_service: 'Jahresservice',
  filter_change: 'Filterwechsel',
  chimney_sweep: 'Kaminfeger',
  general_inspection: 'Generalinspektion',
  other: 'Wartung',
});

function typeLabel(installation) {
  return INSTALLATION_TYPES[installation?.type] || INSTALLATION_TYPES.other;
}

function maintenanceLabel(interval) {
  return interval?.customTypeLabel || MAINTENANCE_TYPES[interval?.maintenanceType] || MAINTENANCE_TYPES.other;
}

/** How a plant is named out loud: "Heizkessel Viessmann Vitodens 200-W". */
function plantName(installation) {
  return [typeLabel(installation), installation?.manufacturer, installation?.model]
    .filter(Boolean)
    .join(' ');
}

function swissDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Whole days between a due date and today; negative means still to come. */
function daysOverdue(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return Math.floor((Date.now() - due.getTime()) / DAY);
}

/** Age in years, from the commissioning date or the year of manufacture. */
function plantAge(installation) {
  if (installation?.commissioningDate) {
    const from = new Date(installation.commissioningDate);
    if (!Number.isNaN(from.getTime())) {
      return Math.floor((Date.now() - from.getTime()) / (DAY * 365.25));
    }
  }
  if (installation?.yearOfManufacture) {
    return new Date().getFullYear() - Number(installation.yearOfManufacture);
  }
  return null;
}

class ServiceService {
  /**
   * Maintenance that is overdue or falls due inside the horizon, enriched with
   * the plant, the site and the customer, and sorted by how late it is.
   */
  async findDueMaintenance({ horizonDays = 60, limit = 25 } = {}) {
    if (!dbReady()) return [];

    let intervals = [];
    try {
      const MaintenanceInterval = (await import('../../../crm/maintenanceInterval.model.js')).default;
      intervals = await MaintenanceInterval.find({
        $or: [
          { maintenanceStatus: { $in: ['due', 'overdue'] } },
          { nextDueDate: { $lte: new Date(Date.now() + horizonDays * DAY) } },
        ],
      })
        .sort({ nextDueDate: 1 })
        .limit(limit * 2)
        .lean();
    } catch (err) {
      logger.warn('Service AI could not read the maintenance intervals', {
        module: 'ai-service', action: 'findDueMaintenance', error: err.message,
      });
      return [];
    }
    if (!intervals.length) return [];

    // Already scheduled work is not what the office is asking about.
    const open = intervals.filter((interval) => interval.maintenanceStatus !== 'scheduled');
    const enriched = await this._enrich(open);

    return enriched
      .sort((a, b) => (b.daysOverdue ?? -9999) - (a.daysOverdue ?? -9999))
      .slice(0, limit);
  }

  /** Attaches plant, site and customer to each interval in as few reads as possible. */
  async _enrich(intervals) {
    const [Installation, Site, Customer] = await Promise.all([
      import('../../../crm/installation.model.js').then((m) => m.default),
      import('../../../crm/site.model.js').then((m) => m.default),
      import('../../../crm/customer.model.js').then((m) => m.default),
    ]);

    const installationIds = [...new Set(intervals.map((i) => String(i.installationId)).filter(Boolean))];
    const installations = await Installation.find({ _id: { $in: installationIds } })
      .select('installationNumber type manufacturer model serialNumber fuelType status siteId commissioningDate yearOfManufacture warrantyEndDate powerOutputKw')
      .lean();
    const byInstallation = new Map(installations.map((i) => [String(i._id), i]));

    const siteIds = [...new Set(installations.map((i) => String(i.siteId)).filter(Boolean))];
    const sites = await Site.find({ _id: { $in: siteIds } })
      .select('name siteNumber street postalCode city customerId')
      .lean();
    const bySite = new Map(sites.map((s) => [String(s._id), s]));

    const customerIds = [...new Set(sites.map((s) => String(s.customerId)).filter(Boolean))];
    const customers = await Customer.find({ _id: { $in: customerIds } }).select('name').lean();
    const byCustomer = new Map(customers.map((c) => [String(c._id), c]));

    return intervals.map((interval) => {
      const installation = byInstallation.get(String(interval.installationId)) || null;
      const site = installation ? bySite.get(String(installation.siteId)) || null : null;
      const customer = site ? byCustomer.get(String(site.customerId)) || null : null;
      return {
        id: String(interval._id),
        installationId: installation ? String(installation._id) : null,
        installationNumber: installation?.installationNumber || null,
        plant: installation ? plantName(installation) : 'Unbekannte Anlage',
        maintenance: maintenanceLabel(interval),
        status: interval.maintenanceStatus,
        lastServiceDate: interval.lastServiceDate || null,
        nextDueDate: interval.nextDueDate || null,
        daysOverdue: daysOverdue(interval.nextDueDate),
        customer: customer?.name || null,
        customerId: customer ? String(customer._id) : null,
        site: site ? [site.name || site.siteNumber, site.street, [site.postalCode, site.city].filter(Boolean).join(' ')]
          .filter(Boolean).join(', ') : null,
        siteId: site ? String(site._id) : null,
      };
    });
  }

  /** The maintenance list, as the office would read it out. */
  composeDueList(items) {
    if (!items.length) {
      return 'Zurzeit ist keine Wartung fällig oder überfällig.';
    }

    const overdue = items.filter((item) => (item.daysOverdue ?? -1) > 0);
    const lines = [overdue.length
      ? `${overdue.length} überfällige Wartung(en), ${items.length} Positionen insgesamt — nach Verzug sortiert:`
      : `${items.length} Wartung(en) stehen an — nach Fälligkeit sortiert:`];
    lines.push('');

    for (const item of items) {
      const late = item.daysOverdue;
      const when = late === null
        ? 'kein Fälligkeitsdatum'
        : late > 0
          ? `${late} Tage überfällig (fällig am ${swissDate(item.nextDueDate)})`
          : `fällig am ${swissDate(item.nextDueDate)}`;
      lines.push(`- **${item.customer || 'Kunde unbekannt'}** — ${item.plant}${item.installationNumber ? ` (${item.installationNumber})` : ''}`);
      lines.push(`  ${item.maintenance}, ${when}${item.site ? ` · ${item.site}` : ''}`);
    }

    lines.push('');
    lines.push('Für einen Serviceauftrag die gewünschte Position nennen — der Auftrag wird vor dem Anlegen zur Freigabe vorgelegt.');
    return lines.join('\n');
  }

  /**
   * What a technician needs before driving out: what the plant is, how old,
   * what was last done, what is open on it.
   */
  async briefing(installationRef) {
    const installationId = installationRef?._id || installationRef?.id || installationRef;
    if (!installationId || !dbReady()) return null;

    let installation;
    try {
      const Installation = (await import('../../../crm/installation.model.js')).default;
      installation = await Installation.findById(installationId)
        .select('installationNumber type manufacturer model serialNumber fuelType status siteId commissioningDate yearOfManufacture warrantyEndDate powerOutputKw technicalNotes')
        .lean();
    } catch (err) {
      logger.warn('Service AI could not read the installation', {
        module: 'ai-service', action: 'briefing', error: err.message,
      });
      return null;
    }
    if (!installation) return null;

    const [site, intervals, tickets] = await Promise.all([
      this._site(installation.siteId),
      this._intervals(installation._id),
      this._openTickets(installation._id),
    ]);
    const customer = site ? await this._customer(site.customerId) : null;

    logger.info('Service AI prepared a briefing', {
      module: 'ai-service',
      action: 'briefing',
      installationId: String(installation._id),
      openTickets: tickets.length,
    });

    return { installation, site, customer, intervals, tickets, age: plantAge(installation) };
  }

  async _site(siteId) {
    if (!siteId) return null;
    try {
      const Site = (await import('../../../crm/site.model.js')).default;
      return Site.findById(siteId).select('name siteNumber street postalCode city customerId').lean();
    } catch { return null; }
  }

  async _customer(customerId) {
    if (!customerId) return null;
    try {
      const Customer = (await import('../../../crm/customer.model.js')).default;
      return Customer.findById(customerId).select('name phone email').lean();
    } catch { return null; }
  }

  async _intervals(installationId) {
    try {
      const MaintenanceInterval = (await import('../../../crm/maintenanceInterval.model.js')).default;
      return MaintenanceInterval.find({ installationId }).sort({ nextDueDate: 1 }).limit(10).lean();
    } catch { return []; }
  }

  async _openTickets(installationId) {
    try {
      const FieldTicket = (await import('../../../fieldTickets/fieldTicket.model.js')).default;
      return FieldTicket.find({ installationId, status: { $ne: 'COMPLETED' } })
        .select('ticketNumber title status priority createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
    } catch { return []; }
  }

  /** The briefing itself, in the order a technician reads it. */
  composeBriefing(data) {
    const { installation, site, customer, intervals, tickets, age } = data;
    const lines = [`**Monteur-Briefing — ${plantName(installation)}**`];
    if (installation.installationNumber) lines[0] += ` (${installation.installationNumber})`;

    lines.push('');
    lines.push('**Anlage**');
    const facts = [];
    if (installation.serialNumber) facts.push(`Serie-Nr. ${installation.serialNumber}`);
    if (installation.fuelType) facts.push(FUEL_TYPES[installation.fuelType] || installation.fuelType);
    if (installation.powerOutputKw) facts.push(`${installation.powerOutputKw} kW`);
    if (age !== null) facts.push(`${age} Jahre alt`);
    if (facts.length) lines.push(`- ${facts.join(' · ')}`);
    if (installation.commissioningDate) lines.push(`- In Betrieb seit ${swissDate(installation.commissioningDate)}`);
    if (installation.status && installation.status !== 'active') {
      lines.push(`- Status der Anlage: ${installation.status}`);
    }
    const warranty = installation.warrantyEndDate ? new Date(installation.warrantyEndDate) : null;
    if (warranty && !Number.isNaN(warranty.getTime())) {
      lines.push(warranty.getTime() > Date.now()
        ? `- Garantie läuft bis ${swissDate(warranty)} — Arbeiten vor der Verrechnung prüfen.`
        : `- Garantie abgelaufen am ${swissDate(warranty)}.`);
    }
    if (installation.technicalNotes) lines.push(`- Technische Notiz: ${installation.technicalNotes}`);

    lines.push('');
    lines.push('**Objekt und Kunde**');
    lines.push(`- ${customer?.name || 'Kunde nicht hinterlegt'}`);
    if (site) {
      lines.push(`- ${[site.name || site.siteNumber, site.street, [site.postalCode, site.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}`);
    }
    if (customer?.phone) lines.push(`- Telefon ${customer.phone}`);

    lines.push('');
    lines.push('**Wartung**');
    if (!intervals.length) {
      lines.push('- Kein Wartungsintervall hinterlegt.');
    } else {
      for (const interval of intervals) {
        const late = daysOverdue(interval.nextDueDate);
        const when = late === null
          ? 'kein Fälligkeitsdatum'
          : late > 0 ? `${late} Tage überfällig` : `fällig am ${swissDate(interval.nextDueDate)}`;
        const last = interval.lastServiceDate ? `, zuletzt ${swissDate(interval.lastServiceDate)}` : '';
        lines.push(`- ${maintenanceLabel(interval)}: ${when}${last}`);
      }
    }

    lines.push('');
    lines.push('**Offene Meldungen**');
    if (!tickets.length) {
      lines.push('- Keine offene Störungsmeldung auf dieser Anlage.');
    } else {
      for (const ticket of tickets) {
        lines.push(`- ${ticket.ticketNumber || 'Meldung'}: ${ticket.title} (${ticket.priority}, ${ticket.status})`);
      }
    }

    // A judgement, marked as one: the office decides, the agent only points.
    const hints = this._hints(installation, age, tickets);
    if (hints.length) {
      lines.push('');
      lines.push('**Zu prüfen vor Ort**');
      for (const hint of hints) lines.push(`- ${hint}`);
    }

    return lines.join('\n');
  }

  /** Points worth raising on site, each derived from a fact on the record. */
  _hints(installation, age, tickets) {
    const hints = [];
    if (age !== null && age >= 15 && ['gas', 'oil'].includes(installation.fuelType)) {
      hints.push(`${FUEL_TYPES[installation.fuelType]}heizung mit ${age} Jahren — Ersatz und Fördergelder beim Kunden ansprechen (Offerte über das Büro).`);
    }
    if (installation.fuelType === 'oil') {
      hints.push('Öltank und Auffangwanne mitkontrollieren.');
    }
    if (installation.type === 'heat_pump') {
      hints.push('Sole- bzw. Kältekreis und Betriebsdruck prüfen, Verdampfer auf Vereisung.');
    }
    if (installation.type === 'boiler') {
      hints.push('Abgaswerte messen und im Rapport festhalten.');
    }
    if (tickets.length) {
      hints.push('Offene Meldung im gleichen Einsatz miterledigen, sonst zweite Anfahrt.');
    }
    if (!installation.serialNumber) {
      hints.push('Serienummer vor Ort aufnehmen — sie fehlt im Stammdatensatz.');
    }
    return hints;
  }
}

export default new ServiceService();
