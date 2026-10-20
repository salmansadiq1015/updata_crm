import leadCommunicationService from './leadCommunication.service.js';
import leadQualificationService from './leadQualification.service.js';

/**
 * Device-originated lead communications + lead qualification. Identity is
 * always req.user._id; the destination number is always resolved from the lead.
 */
const metaOf = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });

class LeadCommunicationController {
  async eligibility(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await leadCommunicationService.eligibility(req.params.leadId, query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const { communication, dialNumber, created } = await leadCommunicationService.create(
        req.params.leadId, req.body, req.user._id, metaOf(req),
      );
      return res.success({
        data: { ...communication, dialNumber },
        message: created ? 'Communication started' : 'Communication already exists',
        statusCode: created ? 201 : 200,
      });
    } catch (err) { next(err); }
  }

  async appendEvents(req, res, next) {
    try {
      const data = await leadCommunicationService.appendEvents(
        req.params.leadId, req.params.operationId, req.body.events, req.user._id,
      );
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async complete(req, res, next) {
    try {
      const data = await leadCommunicationService.complete(
        req.params.leadId, req.params.operationId, req.body, req.user._id, metaOf(req),
      );
      return res.success({ data, message: 'Communication completed' });
    } catch (err) { next(err); }
  }

  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await leadCommunicationService.list(req.params.leadId, query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async getQualification(req, res, next) {
    try {
      const data = await leadQualificationService.getQualification(req.params.leadId);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async transcribeVoiceNote(req, res, next) {
    try {
      const data = await leadQualificationService.transcribe(req.params.leadId, req.file, {
        language: typeof req.body?.language === 'string' ? req.body.language : null,
      });
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async proposeQualification(req, res, next) {
    try {
      const data = await leadQualificationService.propose(req.params.leadId, req.body);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const leadCommunicationController = new LeadCommunicationController();
export default leadCommunicationController;
