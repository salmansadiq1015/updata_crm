import supportTicketRepository from './supportTicket.repository.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { SUPPORT_ORIGIN_PLATFORMS } from './supportTicket.model.js';
import logger from '../../shared/logger/index.js';

/**
 * Derive a generic route from a full URL by collapsing MongoDB-style IDs
 * and UUIDs into `:id` placeholders. This lets tickets be grouped by screen.
 */
function deriveRoute(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname
      .replace(/\/[a-f0-9]{24}(?=\/|$)/gi, '/:id')
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
      .replace(/\/\d{4,}(?=\/|$)/g, '/:id');
  } catch {
    return null;
  }
}

/**
 * Normalize and clamp client-supplied origin fields.
 * All origin data is untrusted — enum-check platform, trim strings.
 */
function normalizeOrigin({ originPlatform, originUrl, originViewport } = {}) {
  const platform = SUPPORT_ORIGIN_PLATFORMS.includes(originPlatform) ? originPlatform : 'unknown';
  const url = typeof originUrl === 'string' ? originUrl.slice(0, 2000) : null;
  const viewport = typeof originViewport === 'string' ? originViewport.slice(0, 20) : null;
  const route = deriveRoute(url);
  return { platform, url, viewport, route };
}

class SupportTicketService {
  async list(filters = {}) {
    return supportTicketRepository.list(filters);
  }

  async myTickets(userId, filters = {}) {
    return supportTicketRepository.myTickets(userId, filters);
  }

  async getById(id) {
    const ticket = await supportTicketRepository.findById(id);
    if (!ticket) throw new NotFoundError('Support ticket not found');
    return ticket;
  }

  async create(body, userId) {
    const { type, subject, description, priority, originPlatform, originUrl, originViewport } = body;
    const origin = normalizeOrigin({ originPlatform, originUrl, originViewport });
    const ticketNumber = await supportTicketRepository.nextTicketNumber();

    const ticket = await supportTicketRepository.create({
      ticketNumber,
      type,
      subject,
      description,
      priority,
      origin,
      submittedBy: userId,
    });

    logger.info(`Support ticket ${ticketNumber} created by ${userId}`);
    return ticket;
  }

  async update(id, patch, userId) {
    const existing = await supportTicketRepository.findById(id);
    if (!existing) throw new NotFoundError('Support ticket not found');

    const updateData = { ...patch, updatedBy: userId };

    if (patch.status === 'resolved' && existing.status !== 'resolved') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = userId;
    }

    const ticket = await supportTicketRepository.update(id, updateData);
    logger.info(`Support ticket ${existing.ticketNumber} updated by ${userId}`);
    return ticket;
  }

  async remove(id, userId) {
    const existing = await supportTicketRepository.findById(id);
    if (!existing) throw new NotFoundError('Support ticket not found');
    const ticket = await supportTicketRepository.softDelete(id, userId);
    logger.info(`Support ticket ${existing.ticketNumber} soft-deleted by ${userId}`);
    return ticket;
  }

  async stats() {
    return supportTicketRepository.stats();
  }
}

const supportTicketService = new SupportTicketService();
export default supportTicketService;
