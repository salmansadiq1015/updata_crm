import logger from '../../shared/logger/index.js';
import swissPlzService from '../../shared/ai/swissPlz.service.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

function buildVoiceMetadata(session) {
  return {
    sessionId: session._id,
    audioFileUrl: session.audioFileUrl || null,
    transcript: session.correctedTranscript || session.rawTranscript || null,
    capturedAt: new Date(),
  };
}

function entityMapFromSession(session) {
  const entityData = {};
  for (const entity of session.entities || []) {
    const value = entity.correctedValue || entity.normalizedValue || entity.value;
    entityData[entity.type || entity.entityType] = entityData[entity.type || entity.entityType] || [];
    entityData[entity.type || entity.entityType].push({
      value,
      resolvedId: entity.resolvedId,
      confidence: entity.confidence,
      candidates: entity.candidates || [],
    });
  }
  return entityData;
}

function firstEntity(entityData, type) {
  const items = entityData[type];
  return items?.[0] || null;
}

function urgencyToPriority(urgency) {
  const map = { low: 'NORMAL', medium: 'NORMAL', high: 'HIGH', critical: 'URGENT', urgent: 'URGENT', emergency: 'URGENT' };
  return map[String(urgency?.value || urgency || '').toLowerCase()] || 'NORMAL';
}

function normalizeStatusValue(value, recordType = 'order') {
  const raw = String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .trim();

  const orderMap = {
    completed: 'COMPLETED',
    complete: 'COMPLETED',
    done: 'COMPLETED',
    erledigt: 'COMPLETED',
    abgeschlossen: 'COMPLETED',
    in_progress: 'IN_PROGRESS',
    'in progress': 'IN_PROGRESS',
    started: 'IN_PROGRESS',
    running: 'IN_PROGRESS',
    begonnen: 'IN_PROGRESS',
    gestartet: 'IN_PROGRESS',
    cancelled: 'CANCELLED',
    canceled: 'CANCELLED',
    cancel: 'CANCELLED',
    storniert: 'CANCELLED',
    abgebrochen: 'CANCELLED',
    confirmed: 'CONFIRMED',
    bestaetigt: 'CONFIRMED',
    bestätigt: 'CONFIRMED',
  };

  const reportMap = {
    draft: 'DRAFT',
    entwurf: 'DRAFT',
    submitted: 'SUBMITTED',
    submit: 'SUBMITTED',
    completed: 'SUBMITTED',
    done: 'SUBMITTED',
    erledigt: 'SUBMITTED',
    eingereicht: 'SUBMITTED',
    approved: 'APPROVED',
    genehmigt: 'APPROVED',
    rejected: 'REJECTED',
    abgelehnt: 'REJECTED',
  };

  const map = String(recordType || '').toLowerCase().includes('report') ? reportMap : orderMap;
  return map[raw] || map[raw.replace(/\s+/g, '_')] || null;
}

function extractStatusFromTranscript(text) {
  const lower = String(text || '').toLowerCase();
  const phrases = [
    ['erledigt', 'completed'],
    ['abgeschlossen', 'completed'],
    ['done', 'completed'],
    ['complete', 'completed'],
    ['in bearbeitung', 'in_progress'],
    ['gestartet', 'in_progress'],
    ['begonnen', 'in_progress'],
    ['cancelled', 'cancelled'],
    ['canceled', 'cancelled'],
    ['storniert', 'cancelled'],
    ['abgebrochen', 'cancelled'],
    ['eingereicht', 'submitted'],
    ['submitted', 'submitted'],
    ['genehmigt', 'approved'],
    ['approved', 'approved'],
    ['abgelehnt', 'rejected'],
    ['rejected', 'rejected'],
  ];
  return phrases.find(([phrase]) => lower.includes(phrase))?.[1] || null;
}

class AiActionDispatcherService {
  /**
   * Dispatch a confirmed voice session to the appropriate domain module.
   *
   * @param {object} session - Voice session with entities populated
   * @param {string} userId
   * @param {object} meta
   * @returns {Promise<{ action: string, recordType?: string, recordId?: string, message: string }>}
   */
  async dispatch(session, userId, meta = {}) {
    const intent = session.intentName;
    const entityData = entityMapFromSession(session);
    const voiceMeta = buildVoiceMetadata(session);

    switch (intent) {
      case 'create_order':
        return this._createOrder(session, entityData, voiceMeta, userId, meta);
      case 'create_report':
        return this._createOrAppendReport(session, entityData, voiceMeta, userId, meta);
      case 'capture_address':
        return this._captureAddress(session, entityData, voiceMeta, userId, meta);
      case 'update_status':
        return this._updateStatus(session, entityData, voiceMeta, userId, meta);
      default:
        return { action: intent || 'general', message: 'No domain action for this intent' };
    }
  }

  async _createOrder(session, entityData, voiceMeta, userId, meta) {
    const { default: orderService } = await import('../qop/order.service.js');
    const { default: orderRepository } = await import('../qop/order.repository.js');

    let customerId = firstEntity(entityData, 'CUSTOMER_NAME')?.resolvedId;
    let customerName = firstEntity(entityData, 'CUSTOMER_NAME')?.value;

    if (!customerId && customerName) {
      const { default: customerService } = await import('../crm/customer.service.js');
      const results = await customerService.search(customerName, 3);
      if (results?.length === 1) {
        customerId = results[0]._id;
        customerName = results[0].name;
      } else if (results?.length > 1) {
        throw new AppError('Multiple customers match — please correct the customer field', 409, ERROR_CODES.AI_ENTITY_AMBIGUOUS);
      }
    }

    if (!customerId) {
      throw new AppError('Customer is required to create an order', 400, ERROR_CODES.AI_ENTITY_MISSING);
    }

    const description = firstEntity(entityData, 'DESCRIPTION')?.value;
    const address = firstEntity(entityData, 'ADDRESS')?.value;
    const urgency = firstEntity(entityData, 'URGENCY')?.value;
    const dateEntity = firstEntity(entityData, 'DATE')?.normalizedValue || firstEntity(entityData, 'DATE')?.value;

    const title = description?.slice(0, 200) || `Voice order — ${customerName}`;
    const notesParts = [description, address ? `Address: ${address}` : null, dateEntity ? `Requested: ${dateEntity}` : null]
      .filter(Boolean);

    const requestedDate = dateEntity ? new Date(dateEntity) : null;
    const order = await orderService.create({
      customerId,
      customerName,
      projectId: session.contextRecordType === 'project' ? session.contextRecordId : null,
      title,
      notes: [notesParts.join('\n'), urgency ? `Urgency: ${urgency}` : null].filter(Boolean).join('\n'),
      lineItems: [],
      language: (session.language || 'de-CH').split('-')[0],
      requestedDate: requestedDate && !Number.isNaN(requestedDate.getTime()) ? requestedDate : null,
      specialInstructions: urgencyToPriority(urgency) !== 'NORMAL' ? `Priority: ${urgencyToPriority(urgency)}` : '',
    }, userId, { ...meta, source: 'ai-voice' });

    await orderRepository.updateById(order._id, {
      $push: { voiceAttachments: voiceMeta },
    });

    return {
      action: 'create_order',
      recordType: 'order',
      recordId: order._id,
      message: `Order ${order.orderNumber} created for ${order.customerName}.`,
      record: { id: order._id, orderNumber: order.orderNumber, customerName: order.customerName },
    };
  }

  async _createOrAppendReport(session, entityData, voiceMeta, userId, meta) {
    const { default: reportService } = await import('../mobile/report.service.js');
    const { default: workReportRepository } = await import('../mobile/workReport.repository.js');

    const orderId = session.contextRecordId
      || firstEntity(entityData, 'ORDER_ID')?.resolvedId;

    if (!orderId) {
      throw new AppError('Work order context is required for report dictation', 400, ERROR_CODES.AI_ENTITY_MISSING);
    }

    const transcript = voiceMeta.transcript || '';
    const existingReports = await reportService.listByOrder(orderId);
    const draft = existingReports?.find((r) => r.status === 'DRAFT');

    if (draft) {
      const appendText = draft.workPerformed
        ? `${draft.workPerformed}\n\n${transcript}`
        : transcript;
      const updated = await reportService.update(draft._id, {
        workPerformed: appendText.slice(0, 5000),
        technicianNotes: transcript.slice(0, 5000),
      }, userId, meta);

      await workReportRepository.updateById(draft._id, {
        $push: { voiceAttachments: voiceMeta },
      });

      return {
        action: 'append_report',
        recordType: 'workReport',
        recordId: updated._id,
        message: `Report ${updated.reportNumber} updated with dictated content.`,
      };
    }

    const report = await reportService.create(orderId, {
      reportDate: new Date(),
      projectId: session.contextRecordType === 'project' ? session.contextRecordId : null,
      workPerformed: transcript.slice(0, 5000) || 'Voice-dictated report',
      technicianNotes: transcript.slice(0, 5000),
      materialItems: [],
      status: 'DRAFT',
    }, userId, { ...meta, source: 'ai-voice' });

    await workReportRepository.updateById(report._id, {
      $push: { voiceAttachments: voiceMeta },
    });

    return {
      action: 'create_report',
      recordType: 'workReport',
      recordId: report._id,
      message: `Draft report ${report.reportNumber} created from dictation.`,
    };
  }

  async _captureAddress(session, entityData, voiceMeta, userId, meta) {
    const { default: customerService } = await import('../crm/customer.service.js');

    const addressText = firstEntity(entityData, 'ADDRESS')?.value
      || voiceMeta.transcript;
    const parsed = swissPlzService.parseAddress(addressText);

    if (!parsed.isValid) {
      throw new AppError(
        `Address validation failed: ${parsed.validationErrors.join(', ')}`,
        400,
        ERROR_CODES.AI_ADDRESS_INVALID,
      );
    }

    const customerId = session.contextRecordId
      || firstEntity(entityData, 'CUSTOMER_NAME')?.resolvedId;

    if (!customerId) {
      throw new AppError('Customer context is required to store address', 400, ERROR_CODES.AI_ENTITY_MISSING);
    }

    const updateData = {
      street: parsed.houseNumber ? `${parsed.street} ${parsed.houseNumber}` : parsed.street,
      postalCode: parsed.postalCode,
      city: parsed.city,
      canton: parsed.canton,
      country: 'CH',
    };
    if (parsed.line2) {
      updateData.notes = parsed.line2;
    }

    const customer = await customerService.update(customerId, updateData, userId, meta);

    logger.info('Voice address captured', {
      module: 'ai',
      action: 'dispatch.capture_address',
      customerId,
      postalCode: parsed.postalCode,
      sessionId: session._id,
    });

    return {
      action: 'capture_address',
      recordType: 'customer',
      recordId: customer._id,
      message: `Address updated for ${customer.name}: ${updateData.street}, ${parsed.postalCode} ${parsed.city}.`,
      parsed,
      voiceMetadata: voiceMeta,
    };
  }

  async _updateStatus(session, entityData, voiceMeta, userId, meta) {
    const contextRecordType = String(session.contextRecordType || '').toLowerCase();
    const contextRecordId = session.contextRecordId;
    if (!contextRecordId) {
      throw new AppError('Current record context is required to update status', 400, ERROR_CODES.AI_ENTITY_MISSING);
    }

    const statusEntity = firstEntity(entityData, 'STATUS')?.value;
    const commandTarget = String(session.commandActionTarget || '').startsWith('status:')
      ? String(session.commandActionTarget).slice('status:'.length)
      : null;
    const rawStatus = statusEntity || commandTarget || extractStatusFromTranscript(voiceMeta.transcript);
    const targetStatus = normalizeStatusValue(rawStatus, contextRecordType);

    if (!targetStatus) {
      throw new AppError('Could not determine the requested status', 400, ERROR_CODES.AI_ENTITY_MISSING);
    }

    if (['order', 'qop_order', 'qop-order'].includes(contextRecordType)) {
      const { default: orderService } = await import('../qop/order.service.js');
      const transition = await orderService.transitionStatus(
        contextRecordId,
        targetStatus,
        { reason: 'Voice assistant status update' },
        userId,
        { ...meta, source: 'ai-voice', voiceSessionId: session._id },
      );
      return {
        action: 'update_status',
        recordType: 'order',
        recordId: contextRecordId,
        message: `Order status updated to ${transition.toStatus}.`,
        transition,
      };
    }

    if (['report', 'workreport', 'work_report', 'work-report'].includes(contextRecordType)) {
      const { default: reportService } = await import('../mobile/report.service.js');
      const updated = await reportService.update(
        contextRecordId,
        { status: targetStatus },
        userId,
        { ...meta, source: 'ai-voice', voiceSessionId: session._id },
      );
      return {
        action: 'update_status',
        recordType: 'workReport',
        recordId: updated._id,
        message: `Report status updated to ${updated.status}.`,
      };
    }

    throw new AppError(`Status update is not supported for ${contextRecordType || 'this context'}`, 400, ERROR_CODES.AI_ENTITY_MISSING);
  }
}

const aiActionDispatcherService = new AiActionDispatcherService();
export default aiActionDispatcherService;
