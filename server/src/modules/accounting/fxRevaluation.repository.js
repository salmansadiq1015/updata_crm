import FxRevaluationRun from './fxRevaluationRun.model.js';
import ApInvoice from './apInvoice.model.js';
import Invoice from '../qop/invoice.model.js';

const OPEN_AR_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'];
const OPEN_AP_STATUSES = ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'];

class FxRevaluationRepository {
  async findOpenReceivables({ baseCurrency = 'CHF', limit = 500 } = {}) {
    return Invoice.find({
      isDeleted: false,
      status: { $in: OPEN_AR_STATUSES },
      amountDue: { $gt: 0 },
      currency: { $ne: baseCurrency },
    })
      .sort({ dueDate: 1, _id: 1 })
      .limit(limit)
      .select('invoiceNumber customerName currency amountDue invoiceDate dueDate')
      .lean();
  }

  async findOpenPayables({ baseCurrency = 'CHF', limit = 500 } = {}) {
    return ApInvoice.find({
      isDeleted: false,
      status: { $in: OPEN_AP_STATUSES },
      outstandingAmount: { $gt: 0 },
      currency: { $ne: baseCurrency },
    })
      .sort({ dueDate: 1, _id: 1 })
      .limit(limit)
      .select('apInvoiceNumber supplierInvoiceNumber supplierName currency outstandingAmount invoiceDate dueDate')
      .lean()
      .setOptions({ includeDeleted: true });
  }

  async createRun(data, options = {}) {
    const run = new FxRevaluationRun(data);
    return run.save({ session: options.session });
  }

  async updateRun(id, data, options = {}) {
    return FxRevaluationRun.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
      session: options.session || null,
    }).lean();
  }

  async listRuns(filters = {}) {
    const query = {};
    if (filters.baseCurrency) query.baseCurrency = filters.baseCurrency;
    if (filters.status) query.status = filters.status;
    return FxRevaluationRun.find(query)
      .sort({ revaluationDate: -1, runNumber: -1 })
      .limit(filters.limit || 50)
      .lean();
  }
}

const fxRevaluationRepository = new FxRevaluationRepository();
export default fxRevaluationRepository;
