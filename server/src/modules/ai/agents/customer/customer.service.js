/**
 * Customer AI — drafts what the office says to a customer, and never says it.
 *
 * The specification: "Erstellt Entwürfe für Kundenkommunikation per E-Mail,
 * WhatsApp oder SMS. Versendet nie ohne Freigabe."
 *
 * The drafts are built from records and fixed wording rather than written by
 * the model. A customer-facing text is where a language model is most
 * tempting and most dangerous: it will cheerfully promise a date, a price or
 * a remedy that nobody agreed to, and the customer will hold the firm to it.
 * So every fact in a draft comes from a record, and an occasion whose facts
 * are missing is refused rather than filled in.
 *
 * Swiss business German throughout: Sie-Form, "ss" and never "ß".
 */
import mongoose from 'mongoose';
import { BLOCK_REASONS, blocked } from '../../governance/agent.risk.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

export const CHANNELS = Object.freeze({
  EMAIL: { key: 'EMAIL', label: 'E-Mail', limit: null },
  WHATSAPP: { key: 'WHATSAPP', label: 'WhatsApp', limit: 700 },
  SMS: { key: 'SMS', label: 'SMS', limit: 160 },
});

/**
 * The occasions the office writes about, and what each one needs before a
 * word can be written. `needs` is checked against real data — an appointment
 * confirmation without a date is not a draft, it is a fiction.
 */
export const OCCASIONS = Object.freeze({
  TERMIN: { key: 'TERMIN', label: 'Terminbestätigung', needs: ['dateTime'] },
  BAUSTART: { key: 'BAUSTART', label: 'Information zum Baustart', needs: ['dateTime'] },
  VERZOEGERUNG: { key: 'VERZOEGERUNG', label: 'Information über eine Verzögerung', needs: ['reason'] },
  ABSCHLUSS: { key: 'ABSCHLUSS', label: 'Abschlussinformation', needs: [] },
  WARTUNG: { key: 'WARTUNG', label: 'Hinweis auf eine fällige Wartung', needs: [] },
  ALLGEMEIN: { key: 'ALLGEMEIN', label: 'Allgemeine Mitteilung', needs: ['reason'] },
});

/** Which occasion the office meant, from how they said it. */
const OCCASION_WORDS = [
  [/verzoeger|verzöger|verspaet|verspät|verschieb/i, 'VERZOEGERUNG'],
  [/baustart|beginn|startterm/i, 'BAUSTART'],
  [/abschluss|abgeschlossen|fertig|beendet/i, 'ABSCHLUSS'],
  [/wartung|service faellig|service fällig/i, 'WARTUNG'],
  [/termin|bestaetig|bestätig/i, 'TERMIN'],
];

const CHANNEL_WORDS = [
  [/whatsapp/i, 'WHATSAPP'],
  [/\bsms\b|textnachricht/i, 'SMS'],
  [/mail|e-mail|brief|schreiben/i, 'EMAIL'],
];

function swissDateTime(value, withTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('de-CH', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/**
 * How this customer is addressed.
 *
 * Where no salutation is recorded, "Guten Tag" plus the name — correct Swiss
 * usage and neutral. Inferring one from a first name would misgender real
 * people, and a letter that does that is worse than a plain one.
 */
function greeting(customer) {
  const name = customer?.ownerName || customer?.name || '';
  switch (customer?.salutation) {
    case 'herr': return `Sehr geehrter Herr ${name}`;
    case 'frau': return `Sehr geehrte Frau ${name}`;
    case 'familie': return `Sehr geehrte Familie ${name}`;
    case 'firma': return 'Sehr geehrte Damen und Herren';
    case 'herr_frau':
    case 'frau_herr': return `Sehr geehrte Frau und Herr ${name}`;
    default: return name ? `Guten Tag ${name}` : 'Guten Tag';
  }
}

class CustomerService {
  /** Reads the occasion and the channel out of what the office typed. */
  read(input = '') {
    const occasion = OCCASION_WORDS.find(([pattern]) => pattern.test(input))?.[1] || 'ALLGEMEIN';
    const channel = CHANNEL_WORDS.find(([pattern]) => pattern.test(input))?.[1] || 'EMAIL';
    return { occasion: OCCASIONS[occasion], channel: CHANNELS[channel] };
  }

  /**
   * A draft for one customer and one occasion. Returns the blockers instead
   * when a fact the occasion needs is not in the records.
   */
  async draft({ customer, occasion, channel, project = null, dateTime = null, reason = null, technician = null } = {}) {
    const blockers = [];
    const warnings = [];

    if (!customer?._id) {
      blockers.push({ reason: BLOCK_REASONS.UNCLEAR_CUSTOMER, detail: 'Kein Kunde bestimmt — ohne Empfänger kein Entwurf.' });
      return { ok: false, blockers, warnings };
    }

    const facts = { dateTime, reason, technician };
    for (const need of occasion.needs) {
      if (!facts[need]) {
        blockers.push({
          reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
          detail: need === 'dateTime'
            ? `Für „${occasion.label}" fehlt der Termin — ein Datum wird nicht erfunden.`
            : `Für „${occasion.label}" fehlt der Anlass — bitte in einem Satz mitgeben.`,
        });
      }
    }

    const site = project?.siteId ? await this._site(project.siteId) : null;
    if (!customer.email && channel.key === 'EMAIL') {
      warnings.push('Beim Kunden ist keine E-Mail-Adresse hinterlegt.');
    }
    if (!customer.mobile && !customer.phone && channel.key !== 'EMAIL') {
      warnings.push('Beim Kunden ist keine Mobilnummer hinterlegt.');
    }

    if (blockers.length) return { ok: false, customer, occasion, channel, blockers, warnings };

    const body = this._body({ customer, occasion, channel, project, site, dateTime, reason, technician });
    const subject = channel.key === 'EMAIL' ? this._subject(occasion, project) : null;

    if (channel.limit && body.length > channel.limit) {
      warnings.push(`Der Entwurf ist ${body.length} Zeichen lang — ${channel.label} fasst ${channel.limit}.`);
    }

    logger.info('Customer AI drafted a message', {
      module: 'ai-customer',
      action: 'draft',
      customerId: String(customer._id),
      occasion: occasion.key,
      channel: channel.key,
    });

    return { ok: true, customer, occasion, channel, project, subject, body, blockers, warnings };
  }

  _subject(occasion, project) {
    const reference = project?.name ? ` — ${project.name}` : '';
    switch (occasion.key) {
      case 'TERMIN': return `Terminbestätigung${reference}`;
      case 'BAUSTART': return `Baustart${reference}`;
      case 'VERZOEGERUNG': return `Terminverschiebung${reference}`;
      case 'ABSCHLUSS': return `Arbeiten abgeschlossen${reference}`;
      case 'WARTUNG': return 'Ihre Wartung steht an';
      default: return `Mitteilung${reference}`;
    }
  }

  /**
   * The wording itself. Short and factual on every channel; the difference
   * between them is how much room there is, not how much is promised.
   */
  _body({ customer, occasion, channel, project, site, dateTime, reason, technician }) {
    const short = channel.key === 'SMS';
    // The reason is the office's own words, quoted verbatim. Without a closing
    // stop it ran straight into the next sentence of the letter.
    const given = reason ? `${String(reason).trim().replace(/[.!?]+$/, '')}.` : null;
    const when = dateTime ? swissDateTime(dateTime, true) : null;
    const where = site ? [site.street, [site.postalCode, site.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null;

    const sentences = [];
    switch (occasion.key) {
      case 'TERMIN':
        sentences.push(`wir bestätigen Ihnen den Termin vom ${when}.`);
        if (where && !short) sentences.push(`Objekt: ${where}.`);
        if (technician && !short) sentences.push(`${technician} wird die Arbeiten ausführen.`);
        if (!short) sentences.push('Bitte sorgen Sie dafür, dass der Zugang zur Anlage frei ist.');
        break;
      case 'BAUSTART':
        sentences.push(`die Arbeiten${project?.name ? ` für „${project.name}"` : ''} beginnen am ${when}.`);
        if (where && !short) sentences.push(`Objekt: ${where}.`);
        if (!short) sentences.push('Wir melden uns, sobald sich am Ablauf etwas ändert.');
        break;
      case 'VERZOEGERUNG':
        sentences.push(`leider verzögern sich die Arbeiten${project?.name ? ` für „${project.name}"` : ''}: ${given}`);
        if (when) sentences.push(`Neuer Termin: ${when}.`);
        else if (!short) sentences.push('Sobald ein neuer Termin feststeht, melden wir uns umgehend.');
        break;
      case 'ABSCHLUSS':
        sentences.push(`die Arbeiten${project?.name ? ` für „${project.name}"` : ''} sind abgeschlossen.`);
        if (!short) sentences.push('Die Unterlagen zur Anlage erhalten Sie mit der Schlussdokumentation.');
        break;
      case 'WARTUNG':
        sentences.push('die Wartung Ihrer Anlage steht an.');
        if (!short) sentences.push('Gerne vereinbaren wir einen Termin, der Ihnen passt.');
        break;
      default:
        sentences.push(given);
        break;
    }

    if (short) {
      // No greeting and no signature: on 160 characters they crowd out the
      // fact. The sentences are written to follow a salutation comma, so the
      // first one is capitalised when it has to stand on its own.
      const text = sentences.join(' ').replace(/\s+/g, ' ').trim();
      return `MB Boiler: ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
    }

    return [
      `${greeting(customer)},`,
      '',
      sentences.join(' '),
      '',
      'Freundliche Grüsse',
      'MB Boiler & Heizungen AG',
    ].join('\n');
  }

  async _site(siteId) {
    if (!dbReady()) return null;
    try {
      const Site = (await import('../../../crm/site.model.js')).default;
      return Site.findById(siteId).select('street postalCode city').lean();
    } catch { return null; }
  }

  /** The draft, as the office reads it before sending it. */
  compose(result) {
    if (!result.ok) {
      const lines = ['**Kein Entwurf erstellt**', ''];
      for (const blocker of result.blockers) lines.push(`- ${blocker.detail}`);
      return lines.join('\n');
    }

    const lines = [`**${result.occasion.label} · ${result.channel.label}-Entwurf**`, ''];
    lines.push(`An: ${result.customer.name}${result.customer.email ? ` <${result.customer.email}>` : ''}`);
    if (result.subject) lines.push(`Betreff: ${result.subject}`);
    lines.push('');
    lines.push(result.body);

    if (result.warnings.length) {
      lines.push('');
      lines.push('**Zu beachten**');
      for (const warning of result.warnings) lines.push(`- ${warning}`);
    }

    lines.push('');
    lines.push('Versendet wird nichts automatisch — der Entwurf geht erst nach Ihrer Freigabe raus.');
    return lines.join('\n');
  }

  /** The blocked outcome, in the shape every agent uses. */
  toBlocked(action, result) {
    const first = result.blockers[0];
    return {
      ...blocked(action, first.reason, { message: this.compose(result) }),
      blockers: result.blockers.map((blocker) => blocker.detail),
    };
  }
}

export default new CustomerService();
