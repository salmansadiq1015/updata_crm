import mongoose from 'mongoose';
import FileMetadata from '../files/file.model.js';
import storageService from '../../shared/storage/StorageService.js';
import ChatMessage from '../mobile/chatMessage.model.js';
import chatRoomRepository from './chatRoom.repository.js';
import ChatRoom from './chatRoom.model.js';
import chatRoomService from './chatRoom.service.js';
import chatAccessService from './chatAccess.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { NotFoundError, AuthorizationError, ValidationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';
import config from '../../config/index.js';

const READ_HORIZON_MARGIN_MS = 5 * 60 * 1000;

function userIdOf(user) {
  return String(user?._id ?? user);
}

function idOf(value) {
  if (!value) return null;
  return String(value._id ?? value);
}

function userNameOf(user) {
  return `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Unknown';
}

function memberIdsFromRoom(room) {
  return [...new Set((room.members || [])
    .map((member) => String(member.userId?._id ?? member.userId))
    .filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function refreshAttachments(messages) {
  const ids = messages.map(message => idOf(message.attachmentFileId)).filter(Boolean);
  if (!ids.length) return messages;
  const files = await FileMetadata.find({ _id: { $in: ids }, isDeleted: { $ne: true } }).select('key originalName').lean();
  const urls = new Map(await Promise.all(files.map(async file => {
    try { return [String(file._id), { url: await storageService.getPresignedUrl(file.key), name: file.originalName }]; }
    catch { return [String(file._id), null]; }
  })));
  return messages.map(message => {
    const file = urls.get(idOf(message.attachmentFileId));
    return file ? { ...message, attachmentUrl: file.url, attachmentFileName: file.name } : message;
  });
}

const chatMessageService = {
  async listMessages(roomId, user, { limit = 50, before, beforeId } = {}) {
    await chatRoomService.assertMembership(roomId, user);
    const query = { roomId, isDeleted: false };
    // Keyset (sentAt desc, _id desc); the redundant `sentAt <= before` bound keeps the
    // chat_cursor index scan seeking straight to the page start.
    if (before && beforeId) {
      query.sentAt = { $lte: new Date(before) };
      query.$or = [{ sentAt: { $lt: new Date(before) } }, { sentAt: new Date(before), _id: { $lt: new mongoose.Types.ObjectId(beforeId) } }];
    }
    else if (before) query.sentAt = { $lt: new Date(before) };
    const messages = await ChatMessage.find(query)
      .sort({ sentAt: -1, _id: -1 })
      .limit(Math.min(Math.max(Number(limit) || 50, 1), 100))
      .lean();
    return refreshAttachments(messages.reverse());
  },

  async sendMessage(roomId, data, sender) {
    const senderId = userIdOf(sender);
    const room = await chatRoomService.assertMembership(roomId, sender);
    // Check blocked
    const isBlocked = room.blockedBy?.some((id) => String(id) === senderId);
    if (isBlocked) throw new AuthorizationError('You are blocked in this room');

    if ((data.messageType || 'TEXT') === 'TEXT' && !String(data.content || '').trim()) throw new ValidationError('Message cannot be empty');
    if ((data.messageType || 'TEXT') !== 'TEXT' && !data.attachmentFileId && !data.attachmentUrl) throw new ValidationError('Attachment is required');
    const allowedMembers = new Set(memberIdsFromRoom(room));
    if ((data.mentions || []).some(id => !allowedMembers.has(String(id)))) throw new ValidationError('Mentions must refer to conversation members');
    if (data.clientMessageId) {
      const existing = await ChatMessage.findOne({ roomId, senderId, clientMessageId: data.clientMessageId }).lean();
      if (existing) return existing;
    }
    let attachmentUrl = data.attachmentUrl || null;
    if (data.attachmentFileId) {
      const file = await FileMetadata.findOne({ _id: data.attachmentFileId, uploadedBy: senderId, isDeleted: { $ne: true } }).lean();
      if (!file) throw new AuthorizationError('You can only share your own uploaded files');
      attachmentUrl = await storageService.getPresignedUrl(file.key);
    } else if ((data.messageType || 'TEXT') !== 'TEXT') {
      throw new ValidationError('Upload an attachment before sending');
    }
    let replyToSnippet = null;
    let replyToSenderName = null;
    if (data.replyToId) {
      const replyMsg = await ChatMessage.findById(data.replyToId).lean();
      if (!replyMsg || replyMsg.isDeleted || String(replyMsg.roomId) !== String(roomId)) {
        throw new ValidationError('Reply target must be in the same chat room', [
          { field: 'replyToId', message: 'Invalid reply target' },
        ]);
      }
      replyToSnippet = replyMsg.content?.slice(0, 200) || null;
      replyToSenderName = replyMsg.senderName || null;
    }

    let message;
    try { message = await ChatMessage.create({
      clientMessageId: data.clientMessageId || undefined,
      roomId,
      projectId: idOf(room.projectId) || null,
      orderId: idOf(room.orderId) || null,
      senderId,
      senderName: userNameOf(sender),
      messageType: data.messageType || 'TEXT',
      content: data.content || '',
      attachmentUrl,
      attachmentFileId: data.attachmentFileId || null,
      transcriptStatus: (data.messageType === 'AUDIO' && data.attachmentFileId) ? 'pending' : 'none',
      mentions: data.mentions || [],
      replyToId: data.replyToId || null,
      replyToSnippet,
      replyToSenderName,
      isViewOnce: data.isViewOnce || false,
      sentAt: new Date(),
    }); } catch (error) {
      if (error.code !== 11000 || !data.clientMessageId) throw error;
      return ChatMessage.findOne({ roomId, senderId, clientMessageId: data.clientMessageId }).lean();
    }

    await chatRoomRepository.updateLastMessage(roomId, {
      messageId: message._id,
      text: message.content?.slice(0, 200) || message.messageType,
      sentAt: message.sentAt,
    });

    // Emit to room
    global.io?.to(`room:${roomId}`).emit('chat:new_message', { roomId, message });
    // Notify each member's personal room for sidebar refresh
    const roomMemberIds = memberIdsFromRoom(room);
    if (roomMemberIds.length > 0) {
      roomMemberIds.forEach((memberId) => {
        global.io?.to(`user:${memberId}`).emit('chat:room_updated', {
          roomId,
          lastMessageText: message.content?.slice(0, 40) || message.messageType,
          lastMessageAt: message.sentAt,
        });
      });
    }

    const projectTeamIds = room.projectId || room.orderId
      ? await chatAccessService.assertLinkedRoomAccess(room, sender)
      : roomMemberIds;

    eventBus.publish(EVENT_TYPES.MOBILE_CHAT_MESSAGE_SENT, {
      messageId: message._id,
      projectId: idOf(room.projectId) || null,
      orderId: idOf(room.orderId) || null,
      roomId,
      senderId,
      senderName: message.senderName,
      messageType: message.messageType,
      content: message.content || '',
      projectTeamIds,
    }, { source: 'chat' });

    // Files/images shared in a project chat are also filed under the project so
    // they are stored and visible there. Non-fatal: never block sending.
    await chatMessageService._linkAttachmentToProject(room, message, senderId);

    // Voice messages: transcribe in the background (never blocks sending).
    if (message.messageType === 'AUDIO' && message.attachmentFileId) {
      chatMessageService._transcribeAudioMessage(message).catch(() => {});
    }

    return message;
  },

  /**
   * Transcribe a voice message via the STT gateway (Whisper) and store the text
   * on the message. Emits a socket update so the client shows the transcript.
   * Best-effort: failures mark the status 'failed', never throw.
   * @private
   */
  async _transcribeAudioMessage(message) {
    try {
      const { default: fileService } = await import('../files/file.service.js');
      const { default: sttGateway } = await import('../ai/sttGateway.service.js');
      const meta = await fileService.getById(message.attachmentFileId);
      if (!meta?.key) throw new Error('No audio file');
      const buffer = await fileService.downloadBuffer(meta.key);
      if (!buffer) throw new Error('No audio buffer');
      const result = await sttGateway.transcribe(buffer, { mimeType: meta.mimeType || 'audio/webm' });
      const text = (result?.text || '').trim();
      await ChatMessage.updateOne(
        { _id: message._id },
        { $set: { transcript: text || null, transcriptStatus: text ? 'done' : 'failed' } },
      );
      const updated = await ChatMessage.findById(message._id).lean();
      global.io?.to(`room:${message.roomId}`).emit('chat:message_updated', { roomId: String(message.roomId), message: updated });
    } catch {
      await ChatMessage.updateOne({ _id: message._id }, { $set: { transcriptStatus: 'failed' } }).catch(() => {});
    }
  },

  /**
   * Translate a message (its transcript or text) into a target language on
   * demand, caching the result per language on the message.
   */
  async translateMessage(roomId, messageId, targetLang, user) {
    await chatRoomService.assertMembership(roomId, user);
    const message = await ChatMessage.findOne({ _id: messageId, roomId });
    if (!message) throw new NotFoundError('ChatMessage', messageId);
    const lang = String(targetLang || 'de').slice(0, 5).toLowerCase();
    const cached = message.translations?.get?.(lang);
    if (cached) return { lang, text: cached, cached: true };

    const sourceText = (message.transcript || message.content || '').trim();
    if (!sourceText) return { lang, text: '', cached: false };

    const { createOpenAiClient } = await import('../../shared/ai/llmFactory.js');
    const openai = await createOpenAiClient();
    const langName = { de: 'German', en: 'English', fr: 'French', it: 'Italian' }[lang] || lang;
    const resp = await openai.chat.completions.create({
      model: config.ai.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Translate the user message into ${langName}. Return only the translation, no quotes, no explanation.` },
        { role: 'user', content: sourceText },
      ],
      temperature: 0,
    });
    const text = (resp.choices?.[0]?.message?.content || '').trim();
    if (text) {
      await ChatMessage.updateOne({ _id: messageId }, { $set: { [`translations.${lang}`]: text } });
    }
    return { lang, text, cached: false };
  },

  /**
   * Register a chat attachment as a project document so it appears in the
   * project's Documents tab. Only for rooms linked to a project; skips when the
   * same file is already linked. Failures are swallowed (the message is sent).
   * @private
   */
  async _linkAttachmentToProject(room, message, uploadedBy) {
    try {
      const projectId = idOf(room.projectId);
      if (!projectId || !message.attachmentFileId) return;

      const FileMetadata = (await import('../files/file.model.js')).default;
      const file = await FileMetadata.findById(message.attachmentFileId)
        .select('originalName mimeType').lean();
      if (!file) return;

      // Skip if this exact file is already filed under the project.
      const ProjectDocument = (await import('../pm/projectDocument.model.js')).default;
      const existing = await ProjectDocument.findOne({ projectId, fileId: message.attachmentFileId })
        .select('_id').lean();
      if (existing) return;

      const isImage = String(file.mimeType || '').startsWith('image/');
      const documentService = (await import('../pm/document.service.js')).default;
      await documentService.createFromStoredFile(projectId, {
        fileId: message.attachmentFileId,
        fileName: file.originalName || 'Chat-Anhang',
        category: isImage ? 'PHOTOS' : 'OTHER',
        uploadedBy,
      });
    } catch (err) {
      logger.warn('Failed to file chat attachment under project', {
        module: 'chat', roomId: String(room?._id), error: err.message,
      });
    }
  },

  async searchMessages(user, {
    q,
    roomId,
    projectId,
    orderId,
    messageType,
    limit = 50,
    before,
  } = {}) {
    const queryText = String(q || '').trim();
    if (!queryText) return [];

    const query = {
      isDeleted: false,
      content: { $regex: escapeRegExp(queryText), $options: 'i' },
    };

    if (before) query.sentAt = { $lt: new Date(before) };
    if (messageType) query.messageType = messageType;

    if (roomId) {
      await chatRoomService.assertMembership(roomId, user);
      query.roomId = roomId;
    } else if (projectId || orderId) {
      await chatAccessService.assertContextAccess({ projectId, orderId }, user);
      if (projectId) query.projectId = projectId;
      if (orderId) query.orderId = orderId;
      if (!await chatAccessService.canReadLeads(user)) {
        const { default: ChatRoom } = await import('./chatRoom.model.js');
        const linkedRooms = await ChatRoom.find({ $or: [{ roomType: 'LEAD' }, { 'leadIds.0': { $exists: true } }] }).select('_id roomType leadIds').lean();
        query.roomId = { $nin: linkedRooms.filter(room => room.roomType === 'LEAD' || room.leadIds?.length).map(room => room._id) };
      }
    } else {
      // Only the ids are needed: skip listRoomsForUser's populates and unread aggregation.
      const roomIds = await chatRoomService.listAccessibleRoomIds(user);
      if (roomIds.length === 0) return [];
      query.roomId = { $in: roomIds };
    }

    return ChatMessage.find(query)
      .sort({ sentAt: -1 })
      .limit(Math.min(Number(limit) || 50, 50))
      .populate('senderId', 'firstName lastName email avatarFileId')
      .populate('attachmentFileId', 'originalName mimeType sizeBytes url')
      .lean();
  },

  /**
   * POST toggles the caller's reaction (existing client contract); DELETE passes
   * mode 'remove' so it can never add a reaction the user did not have.
   */
  async addReaction(messageId, roomId, emoji, user, userName, { mode = 'toggle' } = {}) {
    await chatRoomService.assertMembership(roomId, user);
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new NotFoundError('Message');
    if (String(message.roomId) !== String(roomId) || message.isDeleted) throw new NotFoundError('Message');

    const userId = userIdOf(user);
    const existingIdx = message.reactions.findIndex(
      (r) => r.emoji === emoji && String(r.userId) === String(userId)
    );
    if (existingIdx >= 0) {
      message.reactions.splice(existingIdx, 1);
    } else if (mode === 'remove') {
      return message.reactions; // nothing to remove: no write, no broadcast
    } else {
      message.reactions.push({ emoji, userId, userName });
    }
    await message.save();

    global.io?.to(`room:${roomId}`).emit('chat:reaction_updated', {
      roomId, messageId, reactions: message.reactions,
    });
    return message.reactions;
  },

  async markRoomRead(roomId, user) {
    const room = await chatRoomService.assertMembership(roomId, user);
    const userId = userIdOf(user);
    const now = new Date();
    const member = (room.members || []).find((m) => String(m.userId?._id ?? m.userId) === userId);
    const filter = {
      roomId,
      senderId: { $ne: userId },
      isDeleted: false,
      'readBy.userId': { $ne: userId },
    };
    // Everything countable before the stored horizon is already read (see chatRoom.model.js).
    if (member?.lastReadAt) filter.sentAt = { $gte: new Date(member.lastReadAt) };
    await ChatMessage.updateMany(filter, { $addToSet: { readBy: { userId, readAt: now } } });
    // Advance the horizon only after the update, and keep a margin for messages whose
    // sentAt was stamped (possibly on another instance) before they were inserted.
    const horizon = new Date(now.getTime() - READ_HORIZON_MARGIN_MS);
    await ChatRoom.updateOne(
      { _id: roomId },
      { $set: { 'members.$[me].lastReadAt': horizon } },
      {
        arrayFilters: [{ 'me.userId': new mongoose.Types.ObjectId(userId), 'me.lastReadAt': { $not: { $gte: horizon } } }],
        timestamps: false,
      },
    );
    global.io?.to(`room:${roomId}`).emit('chat:read', { roomId, userId, readAt: now });
  },

  async deleteMessage(messageId, requester) {
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new NotFoundError('Message');
    await chatRoomService.assertMembership(message.roomId, requester);
    const requesterId = userIdOf(requester);
    if (String(message.senderId) !== String(requesterId)) {
      throw new AuthorizationError('You can only delete your own messages');
    }
    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();
    global.io?.to(`room:${message.roomId}`).emit('chat:message_deleted', {
      roomId: message.roomId, messageId,
    });
    return message;
  },

  async editMessage(messageId, content, requester) {
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new NotFoundError('Message');
    await chatRoomService.assertMembership(message.roomId, requester);
    const requesterId = userIdOf(requester);
    if (String(message.senderId) !== String(requesterId)) {
      throw new AuthorizationError('You can only edit your own messages');
    }
    if (message.isDeleted) throw new NotFoundError('Message');
    if (!String(content || '').trim()) throw new ValidationError('Message cannot be empty');
    if (message.messageType !== 'TEXT') throw new ValidationError('Only TEXT messages can be edited');
    message.content = content;
    message.editedAt = new Date();
    await message.save();
    global.io?.to(`room:${message.roomId}`).emit('chat:message_edited', {
      roomId: message.roomId, messageId, content, editedAt: message.editedAt,
    });
    return message;
  },
};

export default chatMessageService;
