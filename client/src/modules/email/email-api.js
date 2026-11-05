import api from '@/lib/api/client';
export const emailApi = {
  get: async (path, params) => (await api.get(`/email${path}`, { params })).data,
  post: async (path, data) => (await api.post(`/email${path}`, data)).data,
  put: async (path, data) => (await api.put(`/email${path}`, data)).data,
  patch: async (path, data) => (await api.patch(`/email${path}`, data)).data,
  disconnect: async id => (await api.delete(`/email/accounts/${id}`)).data,
  upload: async (accountId, file) => { const data = new FormData(); data.append('file', file); return (await api.post(`/email/accounts/${accountId}/attachments`, data, { headers: { 'Content-Type': 'multipart/form-data' } })).data; },
  attachment: async id => (await api.get(`/email/attachments/${id}`, { responseType: 'blob' })).data,
};
export function recipients(value) { return value.split(/[;,]/).map(s => s.trim()).filter(Boolean); }
export function replyRecipients(message, accountAddress, all = false) {
  const from = message.from?.match(/<([^>]+)>/)?.[1] || message.from || '';
  return [...new Set([from, ...(all ? [...(message.to || []), ...(message.cc || [])] : [])].filter(v => v && v.toLowerCase() !== accountAddress?.toLowerCase()))].join(', ');
}
export function replySubject(subject = '', forward = false) { return new RegExp(forward ? '^fwd?:' : '^re:', 'i').test(subject) ? subject : `${forward ? 'Fwd' : 'Re'}: ${subject}`; }
