import mongoose from 'mongoose';

const COLLECTION = 'users';
const INDEX_NAME = 'firstName_text_lastName_text_email_text';

/**
 * Make users findable by name again.
 *
 * The text index on users was created with MongoDB's default
 * `language_override: "language"` — and `language` on a user document is that
 * person's UI preference ("de", "fr"). So every colleague who picked a
 * language was indexed with that language's stemmer, while a query without an
 * explicit `$language` is stemmed as English. The two never met:
 *
 *   db.users.find({ $text: { $search: "Thomas" } })              → 0
 *   db.users.find({ $text: { $search: "Thomas", $language: "de" } }) → 1
 *
 * Anyone searching for a colleague by name got nothing, in the AI assistant
 * and anywhere else that used $text over users.
 *
 * The fix is to point the override at a field no document has, so every
 * document is indexed in the index's own default language. An index cannot be
 * altered in place, so it is dropped and rebuilt.
 */
export async function up() {
  const db = mongoose.connection.db;
  const collection = db.collection(COLLECTION);

  const existing = await collection.indexes();
  const current = existing.find((index) => index.name === INDEX_NAME);

  if (current && current.language_override === '_textLanguage') {
    // eslint-disable-next-line no-console
    console.log('005_users_text_index_language_override: already rebuilt, nothing to do');
    return;
  }
  if (current) {
    await collection.dropIndex(INDEX_NAME);
  }

  await collection.createIndex(
    { firstName: 'text', lastName: 'text', email: 'text' },
    {
      name: INDEX_NAME,
      weights: { email: 3, firstName: 2, lastName: 2 },
      // A field no user document carries, so the per-document override never
      // fires and the whole collection is indexed the same way.
      language_override: '_textLanguage',
    },
  );

  // eslint-disable-next-line no-console
  console.log('005_users_text_index_language_override: rebuilt the users text index');
}

export async function down() {
  const db = mongoose.connection.db;
  const collection = db.collection(COLLECTION);
  const existing = await collection.indexes();
  if (existing.some((index) => index.name === INDEX_NAME)) {
    await collection.dropIndex(INDEX_NAME);
  }
  await collection.createIndex(
    { firstName: 'text', lastName: 'text', email: 'text' },
    { name: INDEX_NAME, weights: { email: 3, firstName: 2, lastName: 2 } },
  );
}
