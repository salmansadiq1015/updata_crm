/** Review-only by default. --apply repairs estimates, never provider invoice amounts. */
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import CallRecord from '../src/modules/aiCalling/callRecord.model.js';
import CallCampaign from '../src/modules/aiCalling/callCampaign.model.js';
import { pricedCost } from '../src/modules/aiCalling/callAnalytics.service.js';
import { COST_PRICING_VERSION } from '../src/modules/aiCalling/engine/callCost.js';

export function repairedEstimate(call, env = process.env) {
  const original = call.cost;
  const b = original?.breakdown;
  if (!b?.usage || b.source === 'provider_reported' || ((b.pricingVersion || 0) >= COST_PRICING_VERSION && !b.unpriced)
    || (Number(original.amount) > 0 && !b.estimate)) return null;
  const { amount, currency, ...breakdown } = pricedCost(call, env);
  const repaired = { amount, currency, breakdown: { ...b, ...breakdown } };
  return JSON.stringify(repaired) === JSON.stringify(original) ? null : repaired;
}

async function main() {
  await import('../src/config/loadEnv.js');
  const apply = process.argv.includes('--apply');
  const campaignId = process.argv.find(x => x.startsWith('--campaign='))?.slice('--campaign='.length);
  if (campaignId && !mongoose.isValidObjectId(campaignId)) throw new Error('Invalid campaign id');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const filter = {
      'cost.breakdown.usage': { $exists: true }, 'cost.breakdown.source': { $ne: 'provider_reported' },
      ...(campaignId ? { campaignId: new mongoose.Types.ObjectId(campaignId) } : {}),
    };
    const campaigns = new Set();
    let reviewed = 0; let changed = 0;
    for await (const call of CallRecord.find(filter).lean().cursor()) {
      const cost = repairedEstimate(call);
      if (!cost) continue;
      reviewed += 1;
      console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', callId: String(call._id), before: call.cost.amount, after: cost.amount, unpriced: cost.breakdown.unpriced }));
      if (apply) {
        // Compare-and-set: never replace an invoice or a correction written concurrently.
        const result = await CallRecord.updateOne({ _id: call._id, cost: call.cost }, { $set: { cost } });
        if (result.modifiedCount) { changed += 1; campaigns.add(String(call.campaignId)); }
      }
    }
    for (const id of campaigns) {
      const [total] = await CallRecord.aggregate([
        { $match: { campaignId: new mongoose.Types.ObjectId(id), isTest: { $ne: true }, provider: { $nin: ['livekit_web', 'web_link_preview'] }, 'cost.currency': 'USD' } },
        { $group: { _id: null, cost: { $sum: '$cost.amount' } } },
      ]);
      await CallCampaign.updateOne({ _id: id }, { $set: { 'summary.actualCost': Number((total?.cost || 0).toFixed(4)) } });
    }
    console.log(JSON.stringify({ reviewed, changed, campaignSummariesUpdated: campaigns.size, applied: apply }));
  } finally { await mongoose.disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
