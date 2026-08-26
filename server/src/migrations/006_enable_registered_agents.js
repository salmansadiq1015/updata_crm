import mongoose from 'mongoose';

const COLLECTION = 'agentregistries';

/**
 * Switch the agents on.
 *
 * They were declared switched off, on purpose: the register was written before
 * the agents were, and an agent listed as active that cannot do what it claims
 * is worse than one listed as inactive. All sixteen can now do what they
 * declare, so the seed creates them switched on — but the seed only ever sets
 * `isEnabled` when it creates a declaration, and every installation already
 * has all sixteen. Without this they would stay off for good.
 *
 * An agent somebody switched off by hand keeps its state. That is what
 * `disabledBy` is for: it is set when a person throws the switch and null on
 * the ones that were merely seeded off, so the two cases are distinguishable
 * and only the second is touched.
 */
export async function up() {
  const collection = mongoose.connection.db.collection(COLLECTION);

  const result = await collection.updateMany(
    { isEnabled: false, disabledBy: null },
    { $set: { isEnabled: true, disabledReason: null, disabledAt: null } },
  );

  // eslint-disable-next-line no-console
  console.log(`006_enable_registered_agents: switched on ${result.modifiedCount} agent(s)`);
}

/**
 * Back to silence. This switches off every agent, including any a person had
 * switched on — there is no record of who did, and leaving one running would
 * defeat the point of rolling back.
 */
export async function down() {
  const collection = mongoose.connection.db.collection(COLLECTION);
  await collection.updateMany(
    { isEnabled: true },
    { $set: { isEnabled: false, disabledReason: 'Rollback 006', disabledAt: new Date() } },
  );
}
