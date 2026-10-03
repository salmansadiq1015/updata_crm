import mongoose from 'mongoose';
import EmailBodyTemplate from '../modules/doctpl/emailBodyTemplate.model.js';
import premiumEmailTemplates from './data/premiumEmailTemplates.js';

/**
 * Seed six premium, production-ready lead-outreach email templates into the
 * existing EmailBodyTemplate collection — in English and German.
 *
 * templateType slugs: lead-introduction, lead-business-proposal,
 * lead-partnership, lead-follow-up, lead-meeting-request,
 * lead-service-introduction.
 *
 * Idempotent: each row is upserted by its unique {templateType, language} key,
 * so re-running the migration refreshes the content in place rather than
 * creating duplicates. The template bodies live in ./data/premiumEmailTemplates
 * and use only the allowlisted {{vars}} that emailTemplate.service.render()
 * resolves — the renderer stays a safe regex substitution, never EJS.
 */

const LANGUAGES = ['en', 'de'];

// Mirror the model's maxlength caps so a raw-collection upsert can never store a
// body that the Mongoose layer would later reject on update.
const CAPS = { subjectTemplate: 500, bodyHtml: 50000, bodyText: 20000 };

function assertWithinCaps(templateType, language, record) {
  for (const [field, max] of Object.entries(CAPS)) {
    const length = (record[field] || '').length;
    if (length > max) {
      throw new Error(
        `007_premium_email_templates: ${templateType} (${language}) ${field} is ${length} chars, exceeds ${max}`,
      );
    }
  }
}

export async function up() {
  const collectionName = EmailBodyTemplate.collection.collectionName;
  const collection = mongoose.connection.db.collection(collectionName);
  const now = new Date();

  let inserted = 0;
  let updated = 0;

  for (const template of premiumEmailTemplates) {
    for (const language of LANGUAGES) {
      const content = template[language];
      const record = {
        subjectTemplate: content.subject,
        bodyHtml: content.bodyHtml,
        bodyText: content.bodyText,
      };
      assertWithinCaps(template.templateType, language, record);

      const result = await collection.updateOne(
        { templateType: template.templateType, language },
        {
          $set: { ...record, isActive: true, updatedAt: now },
          $setOnInsert: { templateType: template.templateType, language, createdAt: now },
        },
        { upsert: true },
      );

      if (result.upsertedCount) inserted += 1;
      else if (result.matchedCount) updated += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `007_premium_email_templates: inserted ${inserted}, refreshed ${updated} email template(s)`,
  );
}

export async function down() {
  const collectionName = EmailBodyTemplate.collection.collectionName;
  const collection = mongoose.connection.db.collection(collectionName);
  const templateTypes = premiumEmailTemplates.map((t) => t.templateType);

  const result = await collection.deleteMany({
    templateType: { $in: templateTypes },
    language: { $in: LANGUAGES },
  });

  // eslint-disable-next-line no-console
  console.log(`007_premium_email_templates: removed ${result.deletedCount} email template(s)`);
}
