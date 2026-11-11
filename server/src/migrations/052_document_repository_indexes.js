import FileMetadata from '../modules/files/file.model.js';
import ProjectDocument from '../modules/pm/projectDocument.model.js';
import GeneratedDocument from '../modules/doctpl/generatedDocument.model.js';
import DocumentIndex from '../modules/documents/documentIndex.model.js';
import logger from '../shared/logger/index.js';

/**
 * Document repository: indexes for keyset paging of the federated list.
 * Purely additive — createIndexes() builds what the schemas declare and
 * leaves existing indexes alone. The superseded { generatedAt: -1 } index is
 * dropped only once its { generatedAt: -1, _id: -1 } replacement exists.
 */
export const name = '052_document_repository_indexes';

export async function up() {
  for (const model of [FileMetadata, ProjectDocument, GeneratedDocument, DocumentIndex]) await model.createIndexes();
  try {
    const indexes = await GeneratedDocument.collection.indexes();
    const hasNew = indexes.some((i) => JSON.stringify(i.key) === JSON.stringify({ generatedAt: -1, _id: -1 }));
    const old = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ generatedAt: -1 }));
    if (hasNew && old) await GeneratedDocument.collection.dropIndex(old.name);
  } catch (err) {
    logger.warn('Old generatedAt index not dropped', { module: 'migration', error: err.message });
  }
}

export async function down() {}

export default { name, up, down };
