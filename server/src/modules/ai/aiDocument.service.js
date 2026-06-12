import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const INTENT_TEMPLATE_MAP = {
  create_report: 'service_report',
  service_report: 'service_report',
  create_quotation: 'quotation',
  cover_letter: 'cover_letter',
  inspection: 'inspection_certificate',
};

class AiDocumentService {
  async _buildVoiceDocumentContext({ sessionId, templateType, userId, meta = {} }) {
    const { default: voiceSessionRepository } = await import('./voiceSession.repository.js');
    const session = await voiceSessionRepository.findByIdWithEntities(sessionId);
    if (!session) throw new NotFoundError('VoiceSession', sessionId);
    if (session.userId.toString() !== userId.toString()) {
      throw new AppError('Voice session not found', 404, ERROR_CODES.AI_SESSION_NOT_FOUND);
    }

    const resolvedType = templateType
      || INTENT_TEMPLATE_MAP[session.intentName]
      || (session.sessionType === 'REPORT_DICTATION' ? 'service_report' : null);

    if (!resolvedType) {
      throw new AppError('Could not determine document template type', 400, ERROR_CODES.AI_NLP_FAILED);
    }

    const transcript = session.correctedTranscript || session.rawTranscript || '';
    const language = (session.language || 'de-CH').split('-')[0];

    let sourceModule = 'ai';
    let sourceRecordId = session.contextRecordId || session._id;
    const data = {
      voiceTranscript: transcript,
      workPerformed: transcript,
      findings: transcript,
      technicianNotes: transcript,
      generatedAt: new Date().toISOString(),
      metadata: { voiceSessionId: session._id, sessionType: session.sessionType },
    };

    if (session.contextRecordType === 'order' && session.contextRecordId) {
      sourceModule = 'qop';
      sourceRecordId = session.contextRecordId;
      const { default: orderRepository } = await import('../qop/order.repository.js');
      const order = await orderRepository.findById(session.contextRecordId);
      if (order) {
        data.orderNumber = order.orderNumber;
        data.customerName = order.customerName;
        data.title = order.title;
      }
    }

    if (session.contextRecordType === 'customer' && session.contextRecordId) {
      sourceModule = 'crm';
      const { default: customerService } = await import('../crm/customer.service.js');
      const customer = await customerService.getById(session.contextRecordId);
      data.customerName = customer.name;
      data.customerAddress = [customer.street, customer.postalCode, customer.city].filter(Boolean).join(', ');
    }

    return {
      session,
      templateType: resolvedType,
      transcript,
      language,
      sourceModule,
      sourceRecordId,
      data,
      meta,
    };
  }

  /**
   * Generate a PDF document from a confirmed voice session (AI-005).
   *
   * @param {object} params
   * @param {string} params.sessionId
   * @param {string} [params.templateType]
   * @param {string} params.userId
   * @param {object} [params.meta]
   */
  async generateFromVoiceSession({ sessionId, templateType, userId, meta = {} }) {
    const {
      templateType: resolvedType,
      language,
      sourceModule,
      sourceRecordId,
      data,
    } = await this._buildVoiceDocumentContext({ sessionId, templateType, userId, meta });

    const { default: documentGenerationService } = await import('../doctpl/documentGeneration.service.js');
    const doc = await documentGenerationService.generate({
      templateType: resolvedType,
      sourceModule,
      sourceRecordId,
      data,
      language,
      generatedBy: userId,
      meta,
    });

    logger.info('AI voice document generated', {
      module: 'ai',
      action: 'document.generate',
      sessionId,
      documentId: doc._id,
      templateType: resolvedType,
    });

    return doc;
  }

  /**
   * Build a preview PDF for a voice session without creating a final document record.
   *
   * @param {object} params
   * @param {string} params.sessionId
   * @param {string} [params.templateType]
   * @param {string} params.userId
   * @param {object} [params.meta]
   */
  async previewFromVoiceSession({ sessionId, templateType, userId, meta = {} }) {
    const {
      templateType: resolvedType,
      language,
      data,
    } = await this._buildVoiceDocumentContext({ sessionId, templateType, userId, meta });

    const { default: DocumentTemplate } = await import('../doctpl/documentTemplate.model.js');
    const template = await DocumentTemplate.findOne({ templateType: resolvedType, isActive: true, isDeleted: false }).lean();
    if (!template) throw new NotFoundError('DocumentTemplate', `type:${resolvedType}`);

    const { default: templateService } = await import('../doctpl/template.service.js');
    const preview = await templateService.preview(template._id, data, language);

    return {
      ...preview,
      templateType: resolvedType,
      fileName: `preview_${resolvedType}_${language}.pdf`,
    };
  }
}

const aiDocumentService = new AiDocumentService();
export default aiDocumentService;
