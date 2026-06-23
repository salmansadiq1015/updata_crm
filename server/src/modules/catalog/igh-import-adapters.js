import { parse } from 'csv-parse/sync';
import Article from './article.model.js';
import { buildArticleSearchTokens, normalizeUnitCode } from './catalogNormalization.js';

const BATCH_SIZE = 500;

export function parseIghCsv(csvString) {
  const rows = parse(csvString, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  return rows
    .filter((row) => row.IGH_NR && row.IGH_NR.trim())
    .map((row) => normalizeIghArticle({
      ighArticleNumber: row.IGH_NR.trim(),
      name: row.BEZEICHNUNG?.trim() ?? '',
      description: row.BESCHREIBUNG?.trim() ?? '',
      unitOfMeasure: row.EINHEIT?.trim(),
      basePrice: row.PREIS_CHF,
      status: row.STATUS ?? row.STATUS_CODE ?? row.AKTIV ?? row.ACTIVE ?? row.DISCONTINUED,
    }));
}

export function parseIghJson(jsonArray) {
  return jsonArray
    .filter((item) => item.ighNr || item.igh_nr || item.IGH_NR)
    .map((item) => normalizeIghArticle({
      ighArticleNumber: String(item.ighNr ?? item.igh_nr ?? item.IGH_NR),
      name: item.name ?? item.bezeichnung ?? '',
      description: item.description ?? item.beschreibung ?? '',
      unitOfMeasure: item.unit ?? item.einheit ?? 'STK',
      basePrice: item.price ?? item.preis ?? '0',
      status: item.status ?? item.active ?? item.isActive ?? item.discontinued,
    }));
}

export function parseIghXml(xmlString) {
  const articleBlocks = String(xmlString).match(/<article\b[\s\S]*?<\/article>|<ARTIKEL\b[\s\S]*?<\/ARTIKEL>/gi) || [];
  return articleBlocks
    .map((block) => normalizeIghArticle({
      ighArticleNumber: readXmlValue(block, ['IGH_NR', 'ighArticleNumber', 'ArticleNumber', 'ARTNR']),
      name: readXmlValue(block, ['BEZEICHNUNG', 'name', 'Name', 'TITLE']),
      description: readXmlValue(block, ['BESCHREIBUNG', 'description', 'Description', 'TEXT']),
      unitOfMeasure: readXmlValue(block, ['EINHEIT', 'unit', 'Unit']) || 'STK',
      basePrice: readXmlValue(block, ['PREIS_CHF', 'price', 'Price']) || '0',
      status: readXmlValue(block, ['STATUS', 'status', 'ACTIVE', 'active', 'DISCONTINUED', 'discontinued']),
    }))
    .filter((article) => article.ighArticleNumber);
}

export async function batchUpsertArticles(articles, importedBy, defaultCategoryId = null, options = {}) {
  const totals = { upsertedCount: 0, modifiedCount: 0, deactivatedCount: 0, errors: [] };
  const importedAt = new Date();

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const ops = batch.map((article) => ({
      updateOne: {
        filter: { ighArticleNumber: article.ighArticleNumber },
        update: {
          $set: {
            name: article.name,
            description: article.description,
            unitOfMeasure: article.unitOfMeasure,
            basePrice: article.basePrice,
            purchasePrice: article.purchasePrice ?? article.basePrice,
            salesPrice: article.salesPrice ?? article.basePrice,
            currency: article.currency ?? 'CHF',
            type: article.type,
            source: article.source,
            status: article.status ?? 'ACTIVE',
            availabilityStatus: article.availabilityStatus ?? 'UNKNOWN',
            lastSyncedAt: importedAt,
            searchTokens: buildArticleSearchTokens({
              ...article,
              articleNumber: `IGH-${article.ighArticleNumber}`,
            }),
            updatedBy: importedBy,
          },
          $setOnInsert: {
            ighArticleNumber: article.ighArticleNumber,
            articleNumber: `IGH-${article.ighArticleNumber}`,
            createdBy: importedBy,
            ...(defaultCategoryId ? { categoryId: defaultCategoryId } : {}),
          },
          $inc: { version: 1 },
        },
        upsert: true,
      },
    }));

    try {
      const result = await Article.bulkWrite(ops, { ordered: false });
      totals.upsertedCount += result.upsertedCount ?? 0;
      totals.modifiedCount += result.modifiedCount ?? 0;
    } catch (err) {
      totals.errors.push({ batchStart: i, message: err.message });
    }
  }

  if (options.deactivateMissing === true) {
    const activeIghNumbers = articles.map((article) => article.ighArticleNumber).filter(Boolean);
    const result = await Article.updateMany(
      {
        source: 'IGH',
        isDeleted: false,
        status: 'ACTIVE',
        ighArticleNumber: { $nin: activeIghNumbers },
      },
      {
        $set: {
          status: 'INACTIVE',
          availabilityStatus: 'DISCONTINUED',
          updatedBy: importedBy,
          lastSyncedAt: importedAt,
        },
        $inc: { version: 1 },
      },
    );
    totals.deactivatedCount = result.modifiedCount || 0;
  }

  return totals;
}

function normalizeIghArticle(article) {
  const status = normalizeIghStatus(article.status);
  return {
    ighArticleNumber: String(article.ighArticleNumber || '').trim(),
    name: String(article.name || '').trim(),
    description: String(article.description || '').trim(),
    unitOfMeasure: normalizeUnitCode(article.unitOfMeasure || 'STK'),
    basePrice: parseFloat(String(article.basePrice ?? '0').replace(',', '.')) || 0,
    purchasePrice: parseFloat(String(article.basePrice ?? '0').replace(',', '.')) || 0,
    salesPrice: parseFloat(String(article.basePrice ?? '0').replace(',', '.')) || 0,
    currency: 'CHF',
    type: 'MATERIAL',
    source: 'IGH',
    status: status.status,
    availabilityStatus: status.availabilityStatus,
  };
}

function normalizeIghStatus(value) {
  if (typeof value === 'boolean') {
    return value
      ? { status: 'ACTIVE', availabilityStatus: 'UNKNOWN' }
      : { status: 'INACTIVE', availabilityStatus: 'DISCONTINUED' };
  }
  const text = String(value ?? '').trim().toLowerCase();
  if (['false', '0', 'inactive', 'inaktiv', 'discontinued', 'obsolete', 'deleted', 'gesperrt'].includes(text)) {
    return { status: 'INACTIVE', availabilityStatus: 'DISCONTINUED' };
  }
  return { status: 'ACTIVE', availabilityStatus: 'UNKNOWN' };
}

function readXmlValue(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match?.[1]) {
      return match[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim();
    }
  }
  return '';
}
