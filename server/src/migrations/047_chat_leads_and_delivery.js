import ChatRoom from '../modules/chat/chatRoom.model.js';
import ChatMessage from '../modules/mobile/chatMessage.model.js';
export const name = '047_chat_leads_and_delivery';
export async function up() {
  await ChatRoom.collection.createIndex({ leadChatKey: 1 }, { unique: true, partialFilterExpression: { leadChatKey: { $type: 'string' } }, name: 'uniq_lead_chat_context' });
  await ChatRoom.collection.createIndex({ leadIds: 1 }, { name: 'leadIds_1' });
  await ChatMessage.collection.createIndex({ roomId: 1, senderId: 1, clientMessageId: 1 }, { unique: true, partialFilterExpression: { clientMessageId: { $type: 'string' } }, name: 'uniq_room_sender_message' });
  await ChatMessage.collection.createIndex({ roomId: 1, sentAt: -1, _id: -1 }, { name: 'chat_cursor' });
}
export async function down() {
  await ChatRoom.collection.dropIndex('uniq_lead_chat_context').catch(() => {});
  await ChatRoom.collection.dropIndex('leadIds_1').catch(() => {});
  await ChatMessage.collection.dropIndex('uniq_room_sender_message').catch(() => {});
  await ChatMessage.collection.dropIndex('chat_cursor').catch(() => {});
}
export default { name, up, down };
