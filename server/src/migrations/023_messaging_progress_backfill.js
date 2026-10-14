import mongoose from 'mongoose';

const EMPTY_PROGRESS = {
  draft: 0,
  queued: 0,
  submitting: 0,
  undelivered: 0,
  cancelled: 0,
};

export async function up() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = new Set(collections.map((item) => item.name));
  if (!names.has('messagecampaigns')) return;

  await db.collection('messagecampaigns').updateMany({}, {
    $set: Object.fromEntries(Object.entries(EMPTY_PROGRESS).map(([key, value]) => [`summary.${key}`, value])),
  });
  if (!names.has('messagerecipients')) return;

  const rows = await db.collection('messagerecipients').aggregate([
    { $match: { status: { $in: Object.keys(EMPTY_PROGRESS) } } },
    { $group: { _id: { campaignId: '$campaignId', status: '$status' }, count: { $sum: 1 } } },
    { $group: { _id: '$_id.campaignId', statuses: { $push: { k: '$_id.status', v: '$count' } } } },
    { $project: { counts: { $arrayToObject: '$statuses' } } },
  ]).toArray();
  if (!rows.length) return;

  await db.collection('messagecampaigns').bulkWrite(rows.map((row) => ({
    updateOne: {
      filter: { _id: row._id },
      update: {
        $set: Object.fromEntries(Object.keys(EMPTY_PROGRESS).map((status) => [
          `summary.${status}`, Number(row.counts?.[status] || 0),
        ])),
      },
    },
  })), { ordered: false });
}

export async function down() {
  const db = mongoose.connection.db;
  const exists = await db.listCollections({ name: 'messagecampaigns' }).hasNext();
  if (!exists) return;
  await db.collection('messagecampaigns').updateMany({}, {
    $unset: Object.fromEntries(Object.keys(EMPTY_PROGRESS).map((key) => [`summary.${key}`, ''])),
  });
}
