import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

class OpenItemsService {
  /**
   * Get combined AR + AP open items with cursor pagination.
   * Filters by entityType: AR, AP, or ALL.
   */
  async getOpenItems(params = {}) {
    const {
      cursor, limit = 25, sortBy = 'dueDate', sortOrder = 'asc',
      entityType = 'ALL', customerId, supplierId,
    } = params;

    let arItems = [];
    let apItems = [];

    // Fetch AR open items
    if (entityType === 'ALL' || entityType === 'AR') {
      try {
        const Invoice = (await import('../qop/invoice.model.js')).default;

        const arFilter = { status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } };
        if (customerId) arFilter.customerId = customerId;

        const invoices = await Invoice.find(arFilter)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .lean();

        arItems = invoices.map((inv) => ({
          _id: inv._id,
          type: 'AR',
          entityId: inv.customerId,
          reference: inv.invoiceNumber,
          amount: inv.totalGross || inv.totalAmount || 0,
          outstandingAmount: inv.amountDue || 0,
          dueDate: inv.dueDate,
          status: inv.status,
          createdAt: inv.createdAt,
        }));
      } catch {
        logger.warn('QOP Invoice model not available for open items', {
          module: 'accounting',
          action: 'openItems.list',
        });
      }
    }

    // Fetch AP open items
    if (entityType === 'ALL' || entityType === 'AP') {
      try {
        const apInvoiceRepository = (await import('./apInvoice.repository.js')).default;
        const apResult = await apInvoiceRepository.findOpenPayables({ limit: 100000, sortBy, sortOrder });
        const apDocs = apResult.data || [];

        apItems = apDocs
          .filter((inv) => (!supplierId || String(inv.supplierId) === String(supplierId)))
          .map((inv) => ({
            _id: inv._id,
            type: 'AP',
            entityId: inv.supplierId,
            reference: inv.apInvoiceNumber || inv.supplierInvoiceNumber,
            amount: inv.totalAmount || 0,
            outstandingAmount: inv.outstandingAmount || 0,
            dueDate: inv.dueDate,
            status: inv.status,
            createdAt: inv.createdAt,
          }));
      } catch {
        logger.warn('AP invoice repository not available for open items', {
          module: 'accounting',
          action: 'openItems.list',
        });
      }
    }

    // Merge and sort
    let combined = [...arItems, ...apItems];
    combined.sort((a, b) => {
      const aVal = a[sortBy] || a.dueDate;
      const bVal = b[sortBy] || b.dueDate;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Cursor pagination on combined set
    if (cursor) {
      const cursorIdx = combined.findIndex((item) => String(item._id) === String(cursor));
      if (cursorIdx >= 0) {
        combined = combined.slice(cursorIdx + 1);
      }
    }

    const hasMore = combined.length > limit;
    const data = hasMore ? combined.slice(0, limit) : combined;
    const nextCursor = hasMore && data.length ? data[data.length - 1]._id : null;

    return { data, pagination: { hasMore, nextCursor } };
  }

  /**
   * Get aging buckets for AR and/or AP.
   */
  async getAging(params = {}) {
    const { entityType = 'ALL' } = params;
    const now = new Date();
    const result = { ar: null, ap: null };

    if (entityType === 'ALL' || entityType === 'AR') {
      try {
        const Invoice = (await import('../qop/invoice.model.js')).default;
        const invoices = await Invoice.find({
          status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        }).lean();

        const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };

        for (const inv of invoices) {
          const dueDate = new Date(inv.dueDate);
          const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
          const amount = inv.amountDue || 0;

          if (daysOverdue <= 0) buckets.current += amount;
          else if (daysOverdue <= 30) buckets['1_30'] += amount;
          else if (daysOverdue <= 60) buckets['31_60'] += amount;
          else if (daysOverdue <= 90) buckets['61_90'] += amount;
          else buckets['90_plus'] += amount;
        }

        result.ar = {
          buckets,
          totalOutstanding: Object.values(buckets).reduce((s, v) => s + v, 0),
          invoiceCount: invoices.length,
        };
      } catch {
        logger.warn('QOP Invoice model not available for AR aging', {
          module: 'accounting',
          action: 'openItems.aging',
        });
      }
    }

    if (entityType === 'ALL' || entityType === 'AP') {
      try {
        const ApInvoice = (await import('./apInvoice.model.js')).default;
        const apInvoices = await ApInvoice.find({
          isDeleted: false,
          status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
        }).lean();

        const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };

        for (const inv of apInvoices) {
          const dueDate = new Date(inv.dueDate);
          const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
          const amount = inv.outstandingAmount || 0;

          if (daysOverdue <= 0) buckets.current += amount;
          else if (daysOverdue <= 30) buckets['1_30'] += amount;
          else if (daysOverdue <= 60) buckets['31_60'] += amount;
          else if (daysOverdue <= 90) buckets['61_90'] += amount;
          else buckets['90_plus'] += amount;
        }

        result.ap = {
          buckets,
          totalOutstanding: Object.values(buckets).reduce((s, v) => s + v, 0),
          invoiceCount: apInvoices.length,
        };
      } catch {
        logger.warn('AP Invoice model not available for AP aging', {
          module: 'accounting',
          action: 'openItems.aging',
        });
      }
    }

    return result;
  }

  /**
   * Generate a statement for a customer (AR) or supplier (AP) over a date range.
   * Returns structured data suitable for PDF generation via doctpl module.
   */
  async generateStatement(entityId, entityType, dateRange = {}) {
    const { dateFrom, dateTo } = dateRange;
    const items = [];

    if (entityType === 'customer') {
      // AR statement — invoices + payments for this customer
      try {
        const Invoice = (await import('../qop/invoice.model.js')).default;
        const filter = { customerId: entityId };
        if (dateFrom || dateTo) {
          filter.createdAt = {};
          if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
          if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        const invoices = await Invoice.find(filter)
          .sort({ createdAt: 1 })
          .lean();

        for (const inv of invoices) {
          items.push({
            date: inv.invoiceDate || inv.createdAt,
            type: 'INVOICE',
            reference: inv.invoiceNumber,
            description: inv.description || `Invoice ${inv.invoiceNumber}`,
            debit: inv.totalGross || inv.totalAmount || 0,
            credit: 0,
            balance: inv.amountDue || 0,
            status: inv.status,
          });
        }

        // Add payments
        try {
          const { arPaymentRepository } = await import('./arPayment.repository.js');
          const paymentResult = await arPaymentRepository.findWithCursor({
            limit: 100000,
            sortBy: 'paymentDate',
            sortOrder: 'asc',
            filters: { customerId: entityId },
          });

          for (const pmt of (paymentResult.data || [])) {
            const pmtDate = pmt.paymentDate || pmt.createdAt;
            if (dateFrom && new Date(pmtDate) < new Date(dateFrom)) continue;
            if (dateTo && new Date(pmtDate) > new Date(dateTo)) continue;

            items.push({
              date: pmtDate,
              type: 'PAYMENT',
              reference: pmt.paymentReference || String(pmt._id),
              description: `Payment received`,
              debit: 0,
              credit: pmt.amount || 0,
              balance: 0,
              status: 'APPLIED',
            });
          }
        } catch {
          // Payments may not be available
        }
      } catch {
        logger.warn('QOP Invoice model not available for statement generation', {
          module: 'accounting',
          action: 'openItems.statement',
        });
      }
    } else if (entityType === 'supplier') {
      // AP statement
      try {
        const ApInvoice = (await import('./apInvoice.model.js')).default;
        const filter = { supplierId: entityId, isDeleted: false };
        if (dateFrom || dateTo) {
          filter.createdAt = {};
          if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
          if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        const invoices = await ApInvoice.find(filter)
          .sort({ createdAt: 1 })
          .lean();

        for (const inv of invoices) {
          items.push({
            date: inv.invoiceDate || inv.createdAt,
            type: 'AP_INVOICE',
            reference: inv.apInvoiceNumber || inv.supplierInvoiceNumber,
            description: inv.description || `AP Invoice ${inv.apInvoiceNumber}`,
            debit: 0,
            credit: inv.totalAmount || 0,
            balance: inv.outstandingAmount || 0,
            status: inv.status,
          });
        }
      } catch {
        logger.warn('AP Invoice model not available for statement generation', {
          module: 'accounting',
          action: 'openItems.statement',
        });
      }
    }

    // Sort by date
    items.sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      entityId,
      entityType,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      items,
      totalDebit: items.reduce((sum, i) => sum + i.debit, 0),
      totalCredit: items.reduce((sum, i) => sum + i.credit, 0),
      generatedAt: new Date(),
    };
  }

  /**
   * Get net position for an entity that is both customer AND supplier.
   * Returns AR total - AP total = net position.
   */
  async getNetPosition(entityId) {
    let arTotal = 0;
    let apTotal = 0;

    // AR total
    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      const arInvoices = await Invoice.find({
        customerId: entityId,
        status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      }).lean();

      arTotal = arInvoices.reduce((sum, inv) => sum + (inv.amountDue || 0), 0);
    } catch {
      logger.warn('QOP Invoice model not available for net position', {
        module: 'accounting',
        action: 'openItems.netPosition',
      });
    }

    // AP total
    try {
      const ApInvoice = (await import('./apInvoice.model.js')).default;
      const apInvoices = await ApInvoice.find({
        supplierId: entityId,
        isDeleted: false,
        status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
      }).lean();

      apTotal = apInvoices.reduce((sum, inv) => sum + (inv.outstandingAmount || 0), 0);
    } catch {
      logger.warn('AP Invoice model not available for net position', {
        module: 'accounting',
        action: 'openItems.netPosition',
      });
    }

    return {
      entityId,
      arTotal: Math.round(arTotal * 100) / 100,
      apTotal: Math.round(apTotal * 100) / 100,
      netPosition: Math.round((arTotal - apTotal) * 100) / 100,
    };
  }
}

const openItemsService = new OpenItemsService();
export default openItemsService;
