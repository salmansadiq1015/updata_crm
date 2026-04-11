/**
 * Search & reports controller for QOP module.
 *
 * Provides cross-document search across quotations, orders, and invoices,
 * plus reporting endpoints for aging and pipeline analysis.
 */
class SearchController {
  async searchDocuments(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const {
        q, type = 'all', status, customerId, projectId, departmentId,
        dateFrom, dateTo, amountMin, amountMax, assignedUserId,
        limit = 25, cursor,
      } = query;

      // Lazy imports to avoid circular dependencies
      const { default: quotationRepo } = await import('./quotation.repository.js');
      const { default: orderRepo } = await import('./order.repository.js');
      const { default: invoiceRepo } = await import('./invoice.repository.js');

      const searchTypes = type === 'all'
        ? ['quotation', 'order', 'invoice']
        : [type];

      const buildSearchFilter = (docType) => {
        const filter = { isDeleted: { $ne: true } };
        if (q) {
          const numberField = docType === 'quotation' ? 'quotationNumber'
            : docType === 'order' ? 'orderNumber' : 'invoiceNumber';
          filter.$or = [
            { [numberField]: { $regex: q, $options: 'i' } },
            { title: { $regex: q, $options: 'i' } },
            { customerName: { $regex: q, $options: 'i' } },
          ];
        }
        if (status) filter.status = status;
        if (customerId) filter.customerId = customerId;
        if (projectId) filter.projectId = projectId;
        if (departmentId) filter.departmentId = departmentId;
        if (assignedUserId) filter.assignedUserId = assignedUserId;
        if (dateFrom || dateTo) {
          filter.createdAt = {};
          if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
          if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }
        if (amountMin !== undefined || amountMax !== undefined) {
          filter.grandTotalRounded = {};
          if (amountMin !== undefined) filter.grandTotalRounded.$gte = amountMin;
          if (amountMax !== undefined) filter.grandTotalRounded.$lte = amountMax;
        }
        return filter;
      };

      const promises = [];

      if (searchTypes.includes('quotation')) {
        const { default: Quotation } = await import('./quotation.model.js');
        const filter = buildSearchFilter('quotation');
        promises.push(
          Quotation.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('-__v')
            .lean()
            .then((docs) => docs.map((d) => ({ ...d, _docType: 'quotation' }))),
        );
      }

      if (searchTypes.includes('order')) {
        const { default: Order } = await import('./order.model.js');
        const filter = buildSearchFilter('order');
        promises.push(
          Order.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('-__v')
            .lean()
            .then((docs) => docs.map((d) => ({ ...d, _docType: 'order' }))),
        );
      }

      if (searchTypes.includes('invoice')) {
        const { default: Invoice } = await import('./invoice.model.js');
        const filter = buildSearchFilter('invoice');
        promises.push(
          Invoice.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('-__v')
            .lean()
            .then((docs) => docs.map((d) => ({ ...d, _docType: 'invoice' }))),
        );
      }

      const resultArrays = await Promise.all(promises);
      const merged = resultArrays
        .flat()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

      return res.success({ data: merged });
    } catch (err) { next(err); }
  }

  async getCustomerDocuments(req, res, next) {
    try {
      const { customerId } = req.params;

      const { default: Quotation } = await import('./quotation.model.js');
      const { default: Order } = await import('./order.model.js');
      const { default: Invoice } = await import('./invoice.model.js');

      const [quotations, orders, invoices] = await Promise.all([
        Quotation.find({ customerId, isDeleted: { $ne: true } })
          .sort({ createdAt: -1 }).select('-__v').lean(),
        Order.find({ customerId, isDeleted: { $ne: true } })
          .sort({ createdAt: -1 }).select('-__v').lean(),
        Invoice.find({ customerId, isDeleted: { $ne: true } })
          .sort({ createdAt: -1 }).select('-__v').lean(),
      ]);

      return res.success({ data: { quotations, orders, invoices } });
    } catch (err) { next(err); }
  }

  async getProjectDocuments(req, res, next) {
    try {
      const { projectId } = req.params;

      const { default: Quotation } = await import('./quotation.model.js');
      const { default: Order } = await import('./order.model.js');
      const { default: Invoice } = await import('./invoice.model.js');

      const [quotations, orders, invoices] = await Promise.all([
        Quotation.find({ projectId, isDeleted: { $ne: true } })
          .sort({ createdAt: -1 }).select('-__v').lean(),
        Order.find({ projectId, isDeleted: { $ne: true } })
          .sort({ createdAt: -1 }).select('-__v').lean(),
        Invoice.find({ projectId, isDeleted: { $ne: true } })
          .sort({ createdAt: -1 }).select('-__v').lean(),
      ]);

      return res.success({ data: { quotations, orders, invoices } });
    } catch (err) { next(err); }
  }

  async getInvoiceAging(req, res, next) {
    try {
      const { default: invoiceRepo } = await import('./invoice.repository.js');
      const buckets = await invoiceRepo.findAgingReport();

      const result = {
        currentBucket: 0,
        thirtyDays: 0,
        sixtyDays: 0,
        ninetyPlus: 0,
        total: 0,
      };

      for (const b of buckets) {
        if (b.bucket === 'current') result.currentBucket = b.totalAmount;
        else if (b.bucket === '1-30') result.thirtyDays = b.totalAmount;
        else if (b.bucket === '31-60' || b.bucket === '61-90') result.sixtyDays += b.totalAmount;
        else if (b.bucket === '90+') result.ninetyPlus = b.totalAmount;
        result.total += b.totalAmount;
      }

      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async getQuotationPipeline(req, res, next) {
    try {
      const { default: quotationRepo } = await import('./quotation.repository.js');
      const statusCounts = await quotationRepo.countByStatus();

      const byStatus = {};
      let total = 0;

      for (const entry of statusCounts) {
        byStatus[entry.status] = entry.count;
        total += entry.count;
      }

      // Get total value by status via aggregation
      const { default: Quotation } = await import('./quotation.model.js');
      const valuePipeline = await Quotation.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: '$status',
            totalValue: { $sum: '$grandTotalRounded' },
          },
        },
        { $project: { _id: 0, status: '$_id', totalValue: 1 } },
      ]);

      const totalValue = {};
      for (const entry of valuePipeline) {
        totalValue[entry.status] = entry.totalValue;
      }

      return res.success({ data: { total, byStatus, totalValue } });
    } catch (err) { next(err); }
  }
}

const searchController = new SearchController();
export default searchController;
