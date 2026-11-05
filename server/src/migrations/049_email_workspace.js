import { EmailAccount, EmailMessage, EmailAttachment, EmailOAuth } from '../modules/email/email.models.js';
import Permission from '../modules/auth/permission.model.js';
export const name = '049_email_workspace';
export async function up() {
  for (const model of [EmailAccount, EmailMessage, EmailAttachment, EmailOAuth]) await model.createIndexes();
  for (const [action, description] of Object.entries({ read: 'Read own email accounts and conversations', write: 'Compose drafts and organize own mailbox', send: 'Send and approve email from own accounts', manage: 'Connect accounts and manage agent grants', ai: 'Use AI assistance on own email conversations' })) {
    await Permission.updateOne({ module: 'email', action }, { $setOnInsert: { module: 'email', action, description } }, { upsert: true });
  }
}
export async function down() { /* Keep mailbox history, credentials and permissions on rollback. */ }
export default { name, up, down };
