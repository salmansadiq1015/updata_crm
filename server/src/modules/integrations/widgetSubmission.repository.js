import WidgetSubmission from './widgetSubmission.model.js';
import Counter from '../crm/counter.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  processingStatus: 'exact',
  contactEmail: 'exact',
  requestType: 'exact',
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
};

class WidgetSubmissionRepository {
  async create(data) {
    const submission = new WidgetSubmission(data);
    return submission.save();
  }

  async findById(id) {
    return WidgetSubmission.findById(id).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const mappedFilters = {};
    if (filters.processingStatus) mappedFilters.processingStatus = filters.processingStatus;
    if (filters.contactEmail) mappedFilters.contactEmail = filters.contactEmail;
    if (filters.requestType) mappedFilters.requestType = filters.requestType;
    if (filters.dateFrom) mappedFilters.dateFrom = filters.dateFrom;
    if (filters.dateTo) mappedFilters.dateTo = filters.dateTo;

    const filter = {
      ...buildFilter(mappedFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    // Remap dateFrom/dateTo to createdAt field
    if (filter.dateFrom || filter.dateTo) {
      filter.createdAt = filter.createdAt || {};
      if (filter.dateFrom) {
        filter.createdAt.$gte = filter.dateFrom.$gte || filter.dateFrom;
        delete filter.dateFrom;
      }
      if (filter.dateTo) {
        filter.createdAt.$lte = filter.dateTo.$lte || filter.dateTo;
        delete filter.dateTo;
      }
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await WidgetSubmission.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findRecentByEmail(email, requestType, hoursBack = 24) {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const query = {
      contactEmail: String(email).toLowerCase(),
      createdAt: { $gte: since },
      processingStatus: { $ne: 'duplicate' },
    };
    if (requestType) query.requestType = requestType;

    return WidgetSubmission.find(query)
      .sort({ createdAt: -1 })
      .lean();
  }

  async countByIpInLastHour(ipAddress) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return WidgetSubmission.countDocuments({
      ipAddress,
      createdAt: { $gte: oneHourAgo },
    });
  }

  async updateById(id, data) {
    return WidgetSubmission.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async pushAttachment(id, attachment) {
    return WidgetSubmission.findByIdAndUpdate(
      id,
      { $push: { attachments: attachment } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async softDelete(id) {
    return WidgetSubmission.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async generateReferenceNumber() {
    const year = new Date().getFullYear();
    const counterId = `widget_submission:${year}`;
    const counter = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true },
    );
    return `WEB-${year}-${String(counter.seq).padStart(6, '0')}`;
  }
}

const widgetSubmissionRepository = new WidgetSubmissionRepository();
export default widgetSubmissionRepository;
