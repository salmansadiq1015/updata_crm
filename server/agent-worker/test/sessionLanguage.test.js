import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLanguageUpdater } from '../src/sessionLanguage.js';

test('a delayed automatic result cannot overwrite a newer explicit switch', async () => {
  const languages = [];
  const apply = createLanguageUpdater({ revision: 5, update: async language => { languages.push(language); } });
  await Promise.all([apply({ revision: 9, language: 'fr' }), apply({ revision: 8, language: 'ar' }), apply({ revision: 10, language: 'en' })]);
  assert.deepEqual(languages, ['fr', 'en']);
});
test('instruction updates serialize, and a failed provider update can be retried without reverting language revision', async () => {
  let fail = true; const languages = [];
  const apply = createLanguageUpdater({ update: async language => {
    if (fail) { fail = false; throw new Error('connection recovering'); }
    languages.push(language);
  } });
  await assert.rejects(apply({ revision: 3, language: 'fr' }));
  await apply({ revision: 2, language: 'ar' });
  await apply({ revision: 3, language: 'fr' });
  assert.deepEqual(languages, ['fr']);
});
