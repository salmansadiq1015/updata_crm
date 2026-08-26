/**
 * Material AI — what the job needs, what is on order, what will not arrive.
 *
 * The specification: "Ermittelt den Materialbedarf je Projekt, überwacht
 * Bestellungen und warnt vor fehlendem Material vor Baustart."
 *
 * The requirement comes from the order behind the project, narrowed to the
 * lines the catalogue marks MATERIAL — labour and text blocks are not things
 * anybody orders. Purchase orders are then matched against those articles.
 *
 * One limitation is stated in every answer rather than hidden: a purchase
 * order in this system has no project link. The match is therefore made on
 * the article number, falling back to the name, and the agent says so — an
 * unmatched part may simply have been ordered under a different designation.
 *
 * It reports and warns. Ordering stays a human act.
 */
import mongoose from 'mongoose';
import { BLOCK_REASONS } from '../../governance/agent.risk.js';
import logger from '../../../../shared/logger/index.js';

/** Mongoose buffers for 10s when the connection is down; never wait on it. */
function dbReady() {
  return mongoose.connection?.readyState === 1;
}

/** How a purchase order's state reads to the office. */
const PO_STATUS = Object.freeze({
  draft: 'Bestellung als Entwurf',
  sent: 'bestellt',
  partial: 'teilweise geliefert',
  received: 'geliefert',
  cancelled: 'Bestellung storniert',
});

function swissDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

/** Units that mean work rather than parts, for articles outside the catalogue. */
const LABOUR_UNITS = new Set(['h', 'std', 'stunde', 'stunden', 'pau', 'pausch', 'pauschal', 'pauschale', 'tag', 'tage']);

class MaterialService {
  /**
   * The parts a job needs, read off the order behind the project.
   *
   * Only material. The catalogue marks each article MATERIAL or SERVICE, so
   * that is what decides — nobody orders "Montage Heizkessel, 10 H" from a
   * supplier, and reporting it as unordered would block a site start for a
   * line of labour. Where an article is not in the catalogue, the unit
   * decides instead: hours and flat rates are work, not parts.
   */
  async articlesFrom(orders) {
    const lines = [];
    for (const order of orders) {
      for (const line of order.lineItems || []) {
        const snapshot = line.catalogSnapshot || null;
        const articleNumber = line.articleNumber || snapshot?.articleNumber || null;
        if (!articleNumber && !snapshot) continue;
        lines.push({ order, line, snapshot, articleNumber });
      }
    }
    if (!lines.length) return [];

    const types = await this._articleTypes(lines.map((entry) => entry.articleNumber).filter(Boolean));

    const articles = [];
    for (const { order, line, snapshot, articleNumber } of lines) {
      const known = articleNumber ? types.get(normalize(articleNumber)) : null;
      const unit = line.unit || snapshot?.unitOfMeasure || 'STK';
      const isMaterial = known ? known === 'MATERIAL' : !LABOUR_UNITS.has(normalize(unit));
      if (!isMaterial) continue;
      articles.push({
        orderNumber: order.orderNumber,
        articleNumber,
        name: line.description || snapshot?.articleName || 'Unbenannte Position',
        quantity: Number(line.quantity) || 0,
        unit,
        supplier: snapshot?.supplierName || null,
        manufacturer: snapshot?.manufacturerName || null,
        availability: snapshot?.availabilityStatus || null,
      });
    }
    return articles;
  }

  /** MATERIAL or SERVICE per article number, straight from the catalogue. */
  async _articleTypes(articleNumbers) {
    const types = new Map();
    if (!articleNumbers.length) return types;
    try {
      const Article = (await import('../../../catalog/article.model.js')).default;
      const rows = await Article.find({ articleNumber: { $in: articleNumbers } })
        .select('articleNumber type').limit(500).lean();
      for (const row of rows) types.set(normalize(row.articleNumber), row.type);
    } catch (err) {
      logger.warn('Material AI could not read the article types', {
        module: 'ai-material', action: 'articleTypes', error: err.message,
      });
    }
    return types;
  }

  async _orders(projectId) {
    try {
      const Order = (await import('../../../qop/order.model.js')).default;
      return Order.find({ projectId, status: { $ne: 'CANCELLED' } })
        .select('orderNumber status lineItems')
        .limit(20)
        .lean();
    } catch (err) {
      logger.warn('Material AI could not read the orders', {
        module: 'ai-material', action: 'orders', error: err.message,
      });
      return null;
    }
  }

  /**
   * Purchase orders that plausibly cover these articles. Matched on the part
   * number first, on the name second — there is no project link to follow.
   */
  async _purchaseOrders(articles) {
    if (!articles.length) return [];
    try {
      const PurchaseOrder = (await import('../../../crm/purchaseOrder.model.js')).default;
      const numbers = articles.map((article) => article.articleNumber).filter(Boolean);
      const names = articles.map((article) => article.name).filter(Boolean);
      return PurchaseOrder.find({
        status: { $ne: 'cancelled' },
        $or: [
          { 'items.partNumber': { $in: numbers } },
          { 'items.supplierPartNumber': { $in: numbers } },
          { 'items.name': { $in: names } },
        ],
      })
        .select('orderNumber supplierName status expectedDelivery items')
        .limit(50)
        .lean();
    } catch (err) {
      logger.warn('Material AI could not read the purchase orders', {
        module: 'ai-material', action: 'purchaseOrders', error: err.message,
      });
      return null;
    }
  }

  /** Pairs one needed article with the purchase order line covering it. */
  _cover(article, purchaseOrders) {
    for (const purchaseOrder of purchaseOrders) {
      for (const item of purchaseOrder.items || []) {
        const byNumber = article.articleNumber
          && (normalize(item.partNumber) === normalize(article.articleNumber)
            || normalize(item.supplierPartNumber) === normalize(article.articleNumber));
        const byName = normalize(item.name) === normalize(article.name);
        if (!byNumber && !byName) continue;
        return {
          purchaseOrderNumber: purchaseOrder.orderNumber,
          supplier: purchaseOrder.supplierName || null,
          status: purchaseOrder.status,
          expectedDelivery: purchaseOrder.expectedDelivery || null,
          ordered: Number(item.quantity) || 0,
          received: Number(item.receivedQuantity) || 0,
          matchedBy: byNumber ? 'Artikelnummer' : 'Bezeichnung',
        };
      }
    }
    return null;
  }

  /**
   * The material picture for a project: what is needed, what is covered, and
   * what will not be there in time.
   */
  async check(projectRef) {
    const blockers = [];
    const warnings = [];
    const projectId = projectRef?._id || projectRef?.id;

    if (!projectId || !dbReady()) {
      return { verified: false, project: projectRef, articles: [], blockers, warnings };
    }

    let project;
    try {
      const Project = (await import('../../../pm/project.model.js')).default;
      project = await Project.findById(projectId)
        .select('projectNumber name status plannedStartDate customerId customerName')
        .lean();
    } catch (err) {
      logger.warn('Material AI could not read the project', {
        module: 'ai-material', action: 'check', error: err.message,
      });
      return { verified: false, project: projectRef, articles: [], blockers, warnings };
    }
    if (!project) return { verified: false, project: projectRef, articles: [], blockers, warnings };

    const orders = await this._orders(project._id);
    if (orders === null) {
      warnings.push('Die Aufträge konnten nicht gelesen werden.');
      return { verified: true, project, articles: [], blockers, warnings, ok: false };
    }
    if (!orders.length) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
        detail: 'Zum Projekt gibt es keinen Auftrag — ohne Auftrag keine Materialliste.',
      });
      return { verified: true, project, articles: [], orders: [], blockers, warnings, ok: false };
    }

    const articles = await this.articlesFrom(orders);
    if (!articles.length) {
      warnings.push('Im Auftrag steht kein Katalogmaterial — es sind nur Arbeitsleistungen erfasst, oder das Material wurde als Freitext geschrieben.');
      return { verified: true, project, articles: [], orders, blockers, warnings, ok: true };
    }

    const purchaseOrders = await this._purchaseOrders(articles);
    if (purchaseOrders === null) {
      warnings.push('Die Bestellungen konnten nicht geprüft werden.');
      return { verified: true, project, articles, orders, blockers, warnings, ok: false };
    }

    const start = project.plannedStartDate ? new Date(project.plannedStartDate) : null;
    const enriched = articles.map((article) => ({ ...article, cover: this._cover(article, purchaseOrders) }));

    const unordered = enriched.filter((article) => !article.cover);
    if (unordered.length) {
      blockers.push({
        reason: BLOCK_REASONS.MISSING_REQUIRED_DATA,
        detail: `${unordered.length} Position(en) ohne erkennbare Bestellung: ${unordered.slice(0, 3).map((a) => a.name).join(', ')}${unordered.length > 3 ? ' …' : ''}.`,
      });
    }

    for (const article of enriched) {
      const cover = article.cover;
      if (!cover) continue;
      if (cover.status === 'partial') {
        warnings.push(`${article.name}: erst ${cover.received} von ${cover.ordered} ${article.unit} geliefert (${cover.purchaseOrderNumber}).`);
      }
      if (['sent', 'partial'].includes(cover.status)) {
        if (!cover.expectedDelivery) {
          warnings.push(`${article.name}: kein Liefertermin auf ${cover.purchaseOrderNumber} hinterlegt.`);
        } else if (start && new Date(cover.expectedDelivery) > start) {
          blockers.push({
            reason: BLOCK_REASONS.CONTRADICTORY_DATA,
            detail: `${article.name} wird erst am ${swissDate(cover.expectedDelivery)} geliefert — der Baustart ist auf den ${swissDate(start)} geplant.`,
          });
        }
      }
      if (cover.status === 'draft') {
        warnings.push(`${article.name}: Bestellung ${cover.purchaseOrderNumber} ist noch ein Entwurf und wurde nicht ausgelöst.`);
      }
      if (cover.matchedBy === 'Bezeichnung') {
        warnings.push(`${article.name} wurde nur über die Bezeichnung einer Bestellung zugeordnet — bitte gegenprüfen.`);
      }
    }

    // Said in the answer, not buried here: the link is inferred, not stored.
    warnings.push('Bestellungen tragen in diesem System keinen Projektbezug — die Zuordnung erfolgt über Artikelnummer bzw. Bezeichnung.');

    if (!start) {
      warnings.push('Für das Projekt ist kein Baustart geplant — Liefertermine konnten nicht dagegen geprüft werden.');
    }

    logger.info('Material AI checked a project', {
      module: 'ai-material',
      action: 'check',
      projectId: String(project._id),
      articles: enriched.length,
      unordered: unordered.length,
      blockers: blockers.length,
    });

    return {
      verified: true,
      ok: blockers.length === 0,
      project,
      orders,
      articles: enriched,
      blockers,
      warnings,
    };
  }

  /** The material status, as the office reads it. */
  compose(result) {
    const name = result.project?.name || result.project?.projectNumber || 'Das Projekt';
    if (!result.verified) {
      return `Der Materialstatus für ${name} konnte nicht ermittelt werden — das Projekt ist nicht lesbar.`;
    }

    const lines = [`**Materialstatus ${name}**`, ''];
    if (result.project?.plannedStartDate) {
      lines.push(`Baustart geplant auf den ${swissDate(result.project.plannedStartDate)}.`);
      lines.push('');
    }

    if (!result.articles.length) {
      lines.push(result.blockers.length ? 'Es konnte keine Materialliste ermittelt werden.' : 'Für dieses Projekt ist kein Katalogmaterial erfasst.');
    } else {
      lines.push('**Material**');
      for (const article of result.articles) {
        const cover = article.cover;
        const state = cover
          ? `${PO_STATUS[cover.status] || cover.status}${cover.purchaseOrderNumber ? ` (${cover.purchaseOrderNumber}${cover.supplier ? `, ${cover.supplier}` : ''})` : ''}`
          : 'nicht bestellt';
        const mark = !cover ? '⛔' : cover.status === 'received' ? '✓' : '○';
        lines.push(`- ${mark} **${article.name}**${article.articleNumber ? ` (${article.articleNumber})` : ''} — ${article.quantity} ${article.unit}, ${state}.`);
        if (cover?.expectedDelivery) lines.push(`  Liefertermin: ${swissDate(cover.expectedDelivery)}.`);
      }
    }

    if (result.blockers.length) {
      lines.push('');
      lines.push('**Das hält den Baustart auf**');
      for (const blocker of result.blockers) lines.push(`- ${blocker.detail}`);
    }
    if (result.warnings.length) {
      lines.push('');
      lines.push('**Zu beachten**');
      for (const warning of result.warnings) lines.push(`- ${warning}`);
    }

    lines.push('');
    lines.push('Bestellt wird nichts automatisch — ein Bestellvorschlag geht erst nach Freigabe raus.');
    return lines.join('\n');
  }

}

export default new MaterialService();
