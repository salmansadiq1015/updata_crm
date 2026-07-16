const DOC_TYPE_ORDER = { quotation: 0, order: 1, invoice: 2 };
const DATE_SORT_FIELDS = new Set(['createdAt', 'validUntil', 'dueDate']);

function encodeSearchCursor(doc, sortBy, sortOrder) {
  const value = sortBy === 'documentNumber' ? doc.documentNumber : doc[sortBy];
  return Buffer.from(JSON.stringify({
    _id: doc._id?.toString(),
    documentType: doc._docType,
    documentNumber: doc.documentNumber,
    sortBy,
    sortOrder,
    value: value instanceof Date ? value.toISOString() : value,
  })).toString('base64url');
}

function decodeSearchCursor(cursor, sortBy, sortOrder) {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
    if (decoded.sortBy !== sortBy || decoded.sortOrder !== sortOrder) return null;
    if (!decoded._id || !decoded.documentType) return null;
    return decoded;
  } catch {
    return null;
  }
}

function normalizeSortValue(value, sortBy) {
  if (value === undefined || value === null || value === '') return null;
  if (DATE_SORT_FIELDS.has(sortBy)) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (sortBy === 'grandTotalRounded') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return String(value);
}

function compareValues(a, b, sortBy, sortDirection) {
  const av = normalizeSortValue(a, sortBy);
  const bv = normalizeSortValue(b, sortBy);
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  if (av < bv) return -1 * sortDirection;
  if (av > bv) return 1 * sortDirection;
  return 0;
}

function cursorValueForQuery(value, sortBy) {
  if (value === undefined || value === null || value === '') return null;
  if (DATE_SORT_FIELDS.has(sortBy)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return value;
}

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
        q, type = 'all', status, customerId, projectId, siteId, departmentId,
        dateFrom, dateTo, amountMin, amountMax, assignedUserId,
        limit = 25, cursor, sortBy = 'createdAt', sortOrder = 'desc',
      } = query;

      const searchTypes = type === 'all'
        ? ['quotation', 'order', 'invoice']
        : [type];

      // Object (site) scope: quotations/orders/invoices reach an object through its
      // projects. Resolve the site's projects and filter by projectId $in [...].
      let siteProjectIds = null;
      if (siteId) {
        const { default: Project } = await import('../pm/project.model.js');
        const projects = await Project.find({ siteId }).select('_id').lean();
        siteProjectIds = projects.map((project) => project._id);
      }

      const sortDirection = sortOrder === 'asc' ? 1 : -1;
      const decodedCursor = decodeSearchCursor(cursor, sortBy, sortOrder);
      const cursorDoc = decodedCursor
        ? {
          _id: decodedCursor._id,
          _docType: decodedCursor.documentType,
          documentType: decodedCursor.documentType,
          documentNumber: decodedCursor.documentNumber,
          [sortBy]: decodedCursor.value,
        }
        : null;

      const numberFieldFor = (docType) => (docType === 'quotation'
        ? 'quotationNumber'
        : docType === 'order' ? 'orderNumber' : 'invoiceNumber');
      const sortFieldFor = (docType) => (sortBy === 'documentNumber' ? numberFieldFor(docType) : sortBy);

      const buildCursorCondition = (docType) => {
        if (!decodedCursor) return null;
        const sortField = sortFieldFor(docType);
        const cursorValue = cursorValueForQuery(decodedCursor.value, sortBy);
        const cursorTypeOrder = DOC_TYPE_ORDER[decodedCursor.documentType] ?? 0;
        const currentTypeOrder = DOC_TYPE_ORDER[docType] ?? 0;
        const branches = [];

        if (cursorValue === null) {
          if (currentTypeOrder > cursorTypeOrder) {
            branches.push({ $or: [{ [sortField]: { $exists: false } }, { [sortField]: null }] });
          } else if (currentTypeOrder === cursorTypeOrder) {
            branches.push({
              $and: [
                { $or: [{ [sortField]: { $exists: false } }, { [sortField]: null }] },
                { _id: { $gt: decodedCursor._id } },
              ],
            });
          }
          return branches.length ? { $or: branches } : { _id: { $exists: false } };
        }

        branches.push({ [sortField]: { [sortOrder === 'desc' ? '$lt' : '$gt']: cursorValue } });
        branches.push({ [sortField]: { $exists: false } });
        branches.push({ [sortField]: null });

        if (currentTypeOrder > cursorTypeOrder) {
          branches.push({ [sortField]: cursorValue });
        } else if (currentTypeOrder === cursorTypeOrder) {
          branches.push({ [sortField]: cursorValue, _id: { $gt: decodedCursor._id } });
        }

        return { $or: branches };
      };

      const buildSearchFilter = (docType) => {
        const filter = { isDeleted: { $ne: true } };
        if (q) {
          const numberField = numberFieldFor(docType);
          filter.$or = [
            { [numberField]: { $regex: q, $options: 'i' } },
            { title: { $regex: q, $options: 'i' } },
            { customerName: { $regex: q, $options: 'i' } },
          ];
        }
        if (status) filter.status = status;
        if (customerId) filter.customerId = customerId;
        if (projectId) filter.projectId = projectId;
        else if (siteProjectIds) filter.projectId = { $in: siteProjectIds };
        if (departmentId) {
          filter.departmentId = Array.isArray(departmentId) ? { $in: departmentId } : departmentId;
        }
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
        const cursorCondition = buildCursorCondition(docType);
        return cursorCondition ? { $and: [filter, cursorCondition] } : filter;
      };

      const collectionSort = (docType) => {
        const field = sortFieldFor(docType);
        return { [field]: sortDirection, _id: 1 };
      };

      const normalize = (doc, docType) => {
        const documentNumber = docType === 'quotation'
          ? doc.quotationNumber
          : docType === 'order'
            ? doc.orderNumber
            : doc.invoiceNumber;
        return {
          ...doc,
          _docType: docType,
          documentType: docType,
          documentNumber,
        };
      };
      const sortValue = (doc) => {
        if (sortBy === 'documentNumber') return doc.documentNumber || '';
        return doc[sortBy] ?? '';
      };
      const sortMerged = (a, b) => {
        const primary = compareValues(sortValue(a), sortValue(b), sortBy, sortDirection);
        if (primary !== 0) return primary;
        const typeDiff = (DOC_TYPE_ORDER[a._docType] ?? 0) - (DOC_TYPE_ORDER[b._docType] ?? 0);
        if (typeDiff !== 0) return typeDiff;
        return String(a._id || '').localeCompare(String(b._id || ''));
      };

      const promises = [];
      const perTypeLimit = limit + 1;

      if (searchTypes.includes('quotation')) {
        const { default: Quotation } = await import('./quotation.model.js');
        const filter = buildSearchFilter('quotation');
        promises.push(
          Quotation.find(filter)
            .sort(collectionSort('quotation'))
            .limit(perTypeLimit)
            .select('-__v')
            .lean()
            .then((docs) => docs.map((d) => normalize(d, 'quotation'))),
        );
      }

      if (searchTypes.includes('order')) {
        const { default: Order } = await import('./order.model.js');
        const filter = buildSearchFilter('order');
        promises.push(
          Order.find(filter)
            .sort(collectionSort('order'))
            .limit(perTypeLimit)
            .select('-__v')
            .lean()
            .then((docs) => docs.map((d) => normalize(d, 'order'))),
        );
      }

      if (searchTypes.includes('invoice')) {
        const { default: Invoice } = await import('./invoice.model.js');
        const filter = buildSearchFilter('invoice');
        promises.push(
          Invoice.find(filter)
            .sort(collectionSort('invoice'))
            .limit(perTypeLimit)
            .select('-__v')
            .lean()
            .then((docs) => docs.map((d) => normalize(d, 'invoice'))),
        );
      }

      const resultArrays = await Promise.all(promises);
      const sorted = resultArrays
        .flat()
        .filter((doc) => !cursorDoc || sortMerged(doc, cursorDoc) > 0)
        .sort(sortMerged)
        .slice(0, limit + 1);
      const data = sorted.slice(0, limit);
      const hasNext = sorted.length > limit;

      return res.success({
        data,
        pagination: {
          hasNext,
          nextCursor: hasNext && data.length > 0 ? encodeSearchCursor(data[data.length - 1], sortBy, sortOrder) : null,
          limit,
        },
      });
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

      const documents = [
        ...quotations.map((doc) => ({
          ...doc,
          documentType: 'quotation',
          documentNumber: doc.quotationNumber,
        })),
        ...orders.map((doc) => ({
          ...doc,
          documentType: 'order',
          documentNumber: doc.orderNumber,
        })),
        ...invoices.map((doc) => ({
          ...doc,
          documentType: 'invoice',
          documentNumber: doc.invoiceNumber,
        })),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return res.success({ data: { documents, quotations, orders, invoices } });
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

      const documents = [
        ...quotations.map((doc) => ({
          ...doc,
          documentType: 'quotation',
          documentNumber: doc.quotationNumber,
        })),
        ...orders.map((doc) => ({
          ...doc,
          documentType: 'order',
          documentNumber: doc.orderNumber,
        })),
        ...invoices.map((doc) => ({
          ...doc,
          documentType: 'invoice',
          documentNumber: doc.invoiceNumber,
        })),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return res.success({ data: { documents, quotations, orders, invoices } });
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
        buckets: [],
        overdue: { count: 0, totalValue: 0 },
      };

      for (const b of buckets) {
        if (b.bucket === 'current') result.currentBucket = b.totalAmount;
        else if (b.bucket === '1-30') result.thirtyDays = b.totalAmount;
        else if (b.bucket === '31-60' || b.bucket === '61-90') result.sixtyDays += b.totalAmount;
        else if (b.bucket === '90+') result.ninetyPlus = b.totalAmount;
        result.total += b.totalAmount;
        result.buckets.push({
          label: b.bucket,
          bucket: b.bucket,
          count: b.count,
          totalValue: b.totalAmount,
        });
        if (b.bucket !== 'current') {
          result.overdue.count += b.count;
          result.overdue.totalValue += b.totalAmount;
        }
      }

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { default: Invoice } = await import('./invoice.model.js');
      const paidThisMonth = await Invoice.aggregate([
        {
          $match: {
            isDeleted: false,
            status: 'PAID',
            paidAt: { $gte: monthStart },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalValue: { $sum: '$amountPaid' },
          },
        },
      ]);
      result.buckets.push({
        label: 'paid_this_month',
        bucket: 'paid_this_month',
        count: paidThisMonth[0]?.count || 0,
        totalValue: paidThisMonth[0]?.totalValue || 0,
      });

      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async getQuotationPipeline(req, res, next) {
    try {
      const { default: quotationRepo } = await import('./quotation.repository.js');
      const statusCounts = await quotationRepo.countByStatus();

      const statusCountsByKey = {};
      let total = 0;

      for (const entry of statusCounts) {
        statusCountsByKey[entry.status] = entry.count;
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

      const byStatus = Object.keys(statusCountsByKey).map((status) => ({
        status,
        count: statusCountsByKey[status] || 0,
        totalValue: totalValue[status] || 0,
      }));

      const { default: Order } = await import('./order.model.js');
      const orderStatusRows = await Order.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { _id: 0, status: '$_id', count: 1 } },
      ]);
      const orderStatusCounts = {};
      for (const entry of orderStatusRows) {
        orderStatusCounts[entry.status] = entry.count;
      }

      return res.success({
        data: {
          total,
          byStatus,
          statusCounts: statusCountsByKey,
          totalValue,
          orderStatusCounts,
        },
      });
    } catch (err) { next(err); }
  }

  async listPresets(req, res, next) {
    try {
      const { default: searchPresetService } = await import('./searchPreset.service.js');
      const presets = await searchPresetService.list(req.user._id);
      return res.success({ data: presets });
    } catch (err) { next(err); }
  }

  async createPreset(req, res, next) {
    try {
      const { default: searchPresetService } = await import('./searchPreset.service.js');
      const preset = await searchPresetService.create(req.user._id, req.body);
      return res.success({ data: preset, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async deletePreset(req, res, next) {
    try {
      const { default: searchPresetService } = await import('./searchPreset.service.js');
      await searchPresetService.delete(req.user._id, req.params.presetId);
      return res.success({ message: 'Preset deleted' });
    } catch (err) { next(err); }
  }

  async exportDocuments(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { q, type = 'all', status, customerId, departmentId, dateFrom, dateTo, amountMin, amountMax } = query;

      const { default: Quotation } = await import('./quotation.model.js');
      const { default: Order }     = await import('./order.model.js');
      const { default: Invoice }   = await import('./invoice.model.js');

      const buildFilter = (docType) => {
        const filter = { isDeleted: { $ne: true } };
        const numField = docType === 'quotation' ? 'quotationNumber' : docType === 'order' ? 'orderNumber' : 'invoiceNumber';
        if (q) filter.$or = [
          { [numField]: { $regex: q, $options: 'i' } },
          { customerName: { $regex: q, $options: 'i' } },
        ];
        if (status) filter.status = status;
        if (customerId) filter.customerId = customerId;
        if (departmentId) filter.departmentId = Array.isArray(departmentId) ? { $in: departmentId } : departmentId;
        if (dateFrom || dateTo) {
          filter.createdAt = {};
          if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
          if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
        }
        // Empty query strings ('') must be treated as "no bound": Number('') is 0,
        // which would otherwise filter grandTotalRounded down to exactly 0 (no rows).
        const min = amountMin === '' || amountMin === undefined || amountMin === null ? undefined : Number(amountMin);
        const max = amountMax === '' || amountMax === undefined || amountMax === null ? undefined : Number(amountMax);
        if (Number.isFinite(min) || Number.isFinite(max)) {
          filter.grandTotalRounded = {};
          if (Number.isFinite(min)) filter.grandTotalRounded.$gte = min;
          if (Number.isFinite(max)) filter.grandTotalRounded.$lte = max;
        }
        return filter;
      };

      const types = type === 'all' ? ['quotation', 'order', 'invoice'] : [type];
      const rows = [];

      if (types.includes('quotation')) {
        const docs = await Quotation.find(buildFilter('quotation'))
          .select('quotationNumber customerName status grandTotalRounded currency createdAt').limit(10000).lean();
        docs.forEach((d) => rows.push({
          type: 'Quotation', number: d.quotationNumber, customer: d.customerName,
          status: d.status, total: d.grandTotalRounded ?? 0, currency: d.currency,
          date: d.createdAt?.toISOString().slice(0, 10) ?? '',
        }));
      }
      if (types.includes('order')) {
        const docs = await Order.find(buildFilter('order'))
          .select('orderNumber customerName status grandTotalRounded currency createdAt').limit(10000).lean();
        docs.forEach((d) => rows.push({
          type: 'Order', number: d.orderNumber, customer: d.customerName,
          status: d.status, total: d.grandTotalRounded ?? 0, currency: d.currency,
          date: d.createdAt?.toISOString().slice(0, 10) ?? '',
        }));
      }
      if (types.includes('invoice')) {
        const docs = await Invoice.find(buildFilter('invoice'))
          .select('invoiceNumber customerName status grandTotalRounded currency createdAt').limit(10000).lean();
        docs.forEach((d) => rows.push({
          type: 'Invoice', number: d.invoiceNumber, customer: d.customerName,
          status: d.status, total: d.grandTotalRounded ?? 0, currency: d.currency,
          date: d.createdAt?.toISOString().slice(0, 10) ?? '',
        }));
      }

      const header = 'Type,Number,Customer,Status,Total,Currency,Date\n';
      const body = rows.map((r) =>
        `${r.type},${r.number},"${(r.customer || '').replace(/"/g, '""')}",${r.status},${r.total},${r.currency},${r.date}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="qop-export.csv"');
      return res.send(header + body);
    } catch (err) { next(err); }
  }
}

const searchController = new SearchController();
export default searchController;
