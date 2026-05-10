import { parse } from 'csv-parse/sync';
import Article from './article.model.js';

const BATCH_SIZE = 500;

export async function parseIghCsv(csvString) {
  const rows = parse(csvString, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return rows
    .filter((row) => row.IGH_NR && row.IGH_NR.trim())
    .map((row) => ({
      ighArticleNumber: row.IGH_NR.trim(),
      name: row.BEZEICHNUNG?.trim() ?? '',
      description: row.BESCHREIBUNG?.trim() ?? '',
      unitOfMeasure: normalizeUnit(row.EINHEIT?.trim()),
      basePrice: parseFloat((row.PREIS_CHF ?? '0').replace(',', '.')) || 0,
      currency: 'CHF',
      type: 'MATERIAL',
      source: 'IGH',
      status: 'ACTIVE',
    }));
}

export function parseIghJson(jsonArray) {
  return jsonArray
    .filter((item) => item.ighNr || item.igh_nr || item.IGH_NR)
    .map((item) => ({
      ighArticleNumber: String(item.ighNr ?? item.igh_nr ?? item.IGH_NR),
      name: item.name ?? item.bezeichnung ?? '',
      description: item.description ?? item.beschreibung ?? '',
      unitOfMeasure: normalizeUnit(item.unit ?? item.einheit ?? 'Stk'),
      basePrice: parseFloat(item.price ?? item.preis ?? '0') || 0,
      currency: 'CHF',
      type: 'MATERIAL',
      source: 'IGH',
      status: 'ACTIVE',
    }));
}

export async function batchUpsertArticles(articles, importedBy) {
  const totals = { upsertedCount: 0, modifiedCount: 0, errors: [] };

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
            currency: article.currency ?? 'CHF',
            type: article.type,
            source: article.source,
            status: article.status ?? 'ACTIVE',
            updatedBy: importedBy,
          },
          $setOnInsert: {
            ighArticleNumber: article.ighArticleNumber,
            articleNumber: `IGH-${article.ighArticleNumber}`,
            createdBy: importedBy,
          },
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

  return totals;
}

function normalizeUnit(raw) {
  if (!raw) return 'Stk';
  const map = {
    'stück': 'Stk', 'stuck': 'Stk', 'stk': 'Stk', 'pcs': 'Stk',
    'meter': 'm', 'metre': 'm',
    'laufmeter': 'lfm',
    'stunde': 'h', 'hour': 'h',
    'liter': 'l',
    'kilogramm': 'kg',
  };
  return map[raw.toLowerCase()] ?? raw;
}
