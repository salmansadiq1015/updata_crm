import mongoose from 'mongoose';

/**
 * Backfill provenance for Google leads imported before discovery snapshots were
 * copied onto the lead. The linked session is authoritative for the selected
 * location/area/category/keyword; the linked result may additionally contain
 * the exact search cell used to find the business.
 */
export async function up() {
  const db = mongoose.connection.db;
  const leads = db.collection('leads');
  const sessions = db.collection('discoverysessions');
  const results = db.collection('discoveryresults');
  const sessionCache = new Map();
  const operations = [];
  let updated = 0;

  const cursor = leads.find({
    source: 'google_places',
    'sourceMetadata.discoverySessionId': { $ne: null },
    $or: [
      { 'sourceMetadata.discoveryLocation': { $exists: false } },
      { 'sourceMetadata.discoveryLocation': null },
      { 'sourceMetadata.discoveryArea': { $exists: false } },
      { 'sourceMetadata.discoveryArea': null },
    ],
  }, {
    projection: {
      _id: 1,
      'sourceMetadata.discoverySessionId': 1,
      'sourceMetadata.discoveryResultId': 1,
    },
  });

  const flush = async () => {
    if (!operations.length) return;
    const outcome = await leads.bulkWrite(operations.splice(0), { ordered: false });
    updated += outcome.modifiedCount || 0;
  };

  for await (const lead of cursor) {
    const sessionId = lead.sourceMetadata?.discoverySessionId;
    if (!sessionId) continue;
    const sessionKey = String(sessionId);
    let session = sessionCache.get(sessionKey);
    if (session === undefined) {
      session = await sessions.findOne({ _id: sessionId }, {
        projection: { location: 1, area: 1, businessTypes: 1, keyword: 1 },
      });
      sessionCache.set(sessionKey, session || null);
    }
    if (!session) continue;

    let result = null;
    if (lead.sourceMetadata?.discoveryResultId) {
      result = await results.findOne(
        { _id: lead.sourceMetadata.discoveryResultId },
        { projection: { discoveryContext: 1 } },
      );
    }

    const businessTypes = (session.businessTypes || []).map((businessType) => ({
      id: businessType.id,
      name: businessType.name ?? null,
      providerIncludedType: businessType.providerIncludedType ?? null,
      providerTextQuery: businessType.providerTextQuery ?? null,
    }));
    const set = {
      'sourceMetadata.discoveryLocation': session.location ?? null,
      'sourceMetadata.discoveryArea': session.area ?? null,
      'sourceMetadata.discoveryBusinessTypes': businessTypes,
      'sourceMetadata.keyword': session.keyword ?? null,
      'sourceMetadata.businessType': businessTypes.map((entry) => entry.id).filter(Boolean).join(',').slice(0, 120) || null,
    };
    if (result?.discoveryContext?.searchCoordinates) {
      set['sourceMetadata.discoverySearchCoordinates'] = result.discoveryContext.searchCoordinates;
    }

    operations.push({ updateOne: { filter: { _id: lead._id }, update: { $set: set } } });
    if (operations.length >= 500) await flush();
  }
  await flush();

  console.log(`008_backfill_lead_discovery_provenance: updated ${updated} lead(s)`);
}

export async function down() {
  // Irreversible data repair. Removing these fields could erase provenance
  // written legitimately after the migration ran.
}
