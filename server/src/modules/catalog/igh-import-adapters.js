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

/** True when the XML is an IGH DataExpert catalog (classic or BIM variant). */
export function isDataExpertXml(xmlString) {
  const head = String(xmlString).slice(0, 500);
  return /<DataExpert(-BIM)?[\s>]/.test(head);
}

/**
 * Parse an IGH DataExpert® catalog file (schema DE_Katalog.xsd, Typ 101) or its
 * DataExpert®BIM sibling (DE-BIM-Schema.xsd, Typ 108) — e.g. the yearly
 * Nussbaum "Gesamtkatalog" export. Both variants carry the same data with
 * different element names; the variant is detected from the root element.
 *
 * Extracted per article: number, manufacturer number, short text (name), long
 * text (description), unit (UNECE code, normalized), list price (Preis Typ 1),
 * EAN and the register hierarchy (top two levels → productGroup).
 */
export function parseDataExpertXml(xmlString) {
  const xml = String(xmlString);
  const isBim = /<DataExpert-BIM[\s>]/.test(xml.slice(0, 500));

  // Supplier (Anbieter) from the Head — becomes supplier/manufacturer name.
  const supplierName = (xml.match(/<Anbieter>[\s\S]*?<Firma[^>]*>([^<]+)<\/Firma>/) || [])[1]?.trim() || '';

  // Register hierarchy: level tags have distinct names, so a single ordered
  // scan can track the current level-1/level-2 labels and map each article
  // number (E5Nr / Element5_Nr content) to its "L1 › L2" product group.
  const productGroupByNr = new Map();
  const registerRe = isBim
    ? /<E([12])\s+Txt="([^"]*)"|<E5Nr[^>]*>([^<]+)<\/E5Nr>/g
    : /<(?:Register_)?Element_([12])\s+Txt="([^"]*)"|<Element5_Nr[^>]*>([^<]+)<\/Element5_Nr>/g;
  const levels = { 1: '', 2: '' };
  let m;
  while ((m = registerRe.exec(xml)) !== null) {
    if (m[3]) {
      const group = [levels[1], levels[2]].filter(Boolean).join(' › ');
      if (group) productGroupByNr.set(m[3].trim(), group);
    } else {
      levels[Number(m[1])] = decodeXmlEntities(m[2]);
      if (m[1] === '1') levels[2] = '';
    }
  }

  // Articles. Classic: <Artikel Art_Nr_Anbieter="...">…</Artikel>
  //           BIM:     <Artikel ArtNr="...">…</Artikel>
  const articleRe = isBim
    ? /<Artikel\s+ArtNr="([^"]+)"\s*>([\s\S]*?)<\/Artikel>/g
    : /<Artikel\s+Art_Nr_Anbieter="([^"]+)"\s*>([\s\S]*?)<\/Artikel>/g;

  const byNumber = new Map();
  while ((m = articleRe.exec(xml)) !== null) {
    const nr = m[1].trim();
    const block = m[2];
    let name; let description; let unit; let price; let ean; let mfrNr; let statusCode;
    if (isBim) {
      name = readTag(block, 'TKurz');
      description = readTag(block, 'TLang');
      unit = (block.match(/<Menge\s+ISO="([^"]+)"/) || [])[1] || 'STK';
      const pr = block.match(/<Pr\s+Typ="1"\s+Preis="([^"]*)"(?:\s+EAN="([^"]*)")?/);
      price = pr?.[1] || '0';
      ean = pr?.[2] || '';
      mfrNr = readTag(block, 'ArtHer');
      statusCode = readTag(block, 'ArtStat');
    } else {
      name = readTag(block, 'Art_Txt_Kurz');
      description = readTag(block, 'Art_Txt_Lang');
      unit = readTag(block, 'BM_Einheit_Code') || 'STK';
      price = (block.match(/<Preis_Pos\s+Typ="1"[^>]*>([^<]*)<\/Preis_Pos>/) || [])[1] || '0';
      ean = readTag(block, 'EAN');
      mfrNr = readTag(block, 'Art_Nr_Hersteller');
      statusCode = readTag(block, 'Code_Artikel');
    }

    byNumber.set(nr, {
      ...normalizeIghArticle({
        ighArticleNumber: nr,
        name,
        description,
        unitOfMeasure: unit,
        basePrice: price,
        // DataExpert: 1 = active; anything explicitly 0 = inactive.
        status: statusCode === '0' ? 'inactive' : 'active',
      }),
      ean: ean || null,
      manufacturerPartNumber: mfrNr || null,
      supplierName: supplierName || null,
      manufacturerName: supplierName || null,
      productGroup: productGroupByNr.get(nr) || null,
    });
  }

  return [...byNumber.values()];
}

function readTag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
  return match ? decodeXmlEntities(match[1]).trim() : '';
}

function decodeXmlEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
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
            // Optional catalog metadata (DataExpert uploads carry these).
            ...(article.supplierName ? { supplierName: article.supplierName } : {}),
            ...(article.manufacturerName ? { manufacturerName: article.manufacturerName } : {}),
            ...(article.manufacturerPartNumber ? { manufacturerPartNumber: article.manufacturerPartNumber } : {}),
            ...(article.productGroup ? { productGroup: article.productGroup } : {}),
            ...(article.ean ? { ean: article.ean } : {}),
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
