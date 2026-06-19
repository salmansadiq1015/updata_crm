import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

function extractData(response) {
  const payload = response.data;
  return payload?.data ?? payload?.items ?? payload;
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export const chatService = {
  listRooms: ()                                => apiClient.get(ENDPOINTS.CHAT.ROOMS).then(r => r.data || []),
  getOrCreateDmRoom: (targetUserId)            => apiClient.post(ENDPOINTS.CHAT.DM_ROOM, { targetUserId }).then(r => r.data),
  getRoom: (roomId)                            => apiClient.get(ENDPOINTS.CHAT.ROOM_BY_ID(roomId)).then(r => r.data),
  listMessages: (roomId, params)               => apiClient.get(ENDPOINTS.CHAT.ROOM_MESSAGES(roomId), { params }).then(r => r.data || []),
  searchMessages: (params)                     => apiClient.get(ENDPOINTS.CHAT.SEARCH, { params }).then(r => r.data || []),
  sendMessage: (roomId, data)                  => apiClient.post(ENDPOINTS.CHAT.ROOM_MESSAGES(roomId), data).then(r => r.data),
  markRead: (roomId)                           => apiClient.put(ENDPOINTS.CHAT.ROOM_READ(roomId)).then(r => r.data),
  addReaction: (roomId, msgId, emoji)          => apiClient.post(ENDPOINTS.CHAT.MESSAGE_REACTIONS(roomId, msgId), { emoji }).then(r => r.data),
  removeReaction: (roomId, msgId, emoji)       => apiClient.delete(ENDPOINTS.CHAT.MESSAGE_REACTIONS(roomId, msgId), { data: { emoji } }).then(r => r.data),
  deleteMessage: (roomId, msgId)               => apiClient.delete(ENDPOINTS.CHAT.MESSAGE(roomId, msgId)).then(r => r.data),
  editMessage: (roomId, msgId, content)        => apiClient.patch(ENDPOINTS.CHAT.MESSAGE(roomId, msgId), { content }).then(r => r.data),
  blockUser: (roomId)                          => apiClient.post(ENDPOINTS.CHAT.ROOM_BLOCK(roomId)).then(r => r.data),
  unblockUser: (roomId)                        => apiClient.delete(ENDPOINTS.CHAT.ROOM_BLOCK(roomId)).then(r => r.data),
  listUsers: ()                                => apiClient.get(ENDPOINTS.USERS.LIST, { params: { status: 'active', limit: 100 } }).then(r => normalizeList(extractData(r))),
  listProjects: ()                             => apiClient.get(ENDPOINTS.PM.PROJECTS, { params: { limit: 100 } }).then(r => normalizeList(extractData(r))),
  uploadFile: (formData, onProgress)           => apiClient.post(ENDPOINTS.FILES.UPLOAD, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => { if (e.total) onProgress?.(Math.round((e.loaded * 100) / e.total)); },
  }).then(r => r.data),
  createGroupRoom: (nameOrPayload, memberIds, projectId) => {
    const payload = typeof nameOrPayload === 'object'
      ? nameOrPayload
      : { name: nameOrPayload, memberIds, ...(projectId && { projectId }) };
    return apiClient.post(ENDPOINTS.CHAT.GROUP_ROOM, payload).then(r => r.data);
  },
  joinByCode: (joinCode)                       => apiClient.post(ENDPOINTS.CHAT.JOIN_ROOM, { joinCode }).then(r => r.data),
  leaveRoom: (roomId)                          => apiClient.post(ENDPOINTS.CHAT.LEAVE_ROOM(roomId)).then(r => r.data),
  deleteRoom: (roomId)                         => apiClient.delete(ENDPOINTS.CHAT.ROOM_BY_ID(roomId)).then(r => r.data),
  refreshJoinCode: (roomId)                    => apiClient.post(ENDPOINTS.CHAT.REFRESH_CODE(roomId)).then(r => r.data),
};
