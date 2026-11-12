import { EmailMessage } from '../modules/email/email.models.js';
import User from '../modules/auth/user.model.js';
import logger from '../shared/logger/index.js';

/**
 * Email workspace and Employee Management read paths.
 * Purely additive and idempotent: each index is created only when no index with the same
 * key pattern exists yet. No document is modified; no existing index is dropped.
 */
export const name = '060_email_users_indexes';

const INDEXES = [
  // Mailbox: "all" view keyset walk (also scheduled/approval), starred/important views,
  // and the covered per-account inbox unread count.
  [EmailMessage, { ownerId: 1, date: -1, _id: -1 }, {}],
  [EmailMessage, { ownerId: 1, starred: 1, date: -1, _id: -1 }, { partialFilterExpression: { starred: true } }],
  [EmailMessage, { ownerId: 1, important: 1, date: -1, _id: -1 }, { partialFilterExpression: { important: true } }],
  [EmailMessage, { ownerId: 1, folder: 1, unread: 1, accountId: 1 }, {}],
  // Users: default list order and the covered /users/stats $group.
  [User, { isDeleted: 1, createdAt: -1, _id: -1 }, {}],
  [User, { isDeleted: 1, status: 1, createdAt: 1 }, {}],
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function existing(model) {
  try { return await model.collection.indexes(); } catch { return []; } // collection may not exist yet
}

export async function up() {
  for (const [model, key, options] of INDEXES) {
    if ((await existing(model)).some((i) => sameKey(i.key, key))) continue;
    await model.collection.createIndex(key, { background: true, ...options });
    logger.info('Email/users read index created', { module: 'migration', collection: model.collection.name, key });
  }
}

export async function down() {
  for (const [model, key] of INDEXES) {
    const index = (await existing(model)).find((i) => sameKey(i.key, key));
    if (index) await model.collection.dropIndex(index.name);
  }
}

export default { name, up, down };
