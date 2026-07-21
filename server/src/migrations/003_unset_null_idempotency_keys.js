import mongoose from 'mongoose';

/**
 * Fix keyless notifications colliding under the unique+sparse idempotencyKey index.
 *
 * The notification schema used to default idempotencyKey to null, so every
 * notification without a key stored an explicit null. A sparse index skips only
 * ABSENT fields, not null ones, so the unique constraint collided on null and
 * silently rejected all but the first keyless notification (task_assigned,
 * task_completed, ...). The field no longer defaults to null; this migration
 * unsets the leftover nulls so those documents drop out of the index.
 */
export async function up() {
  const db = mongoose.connection.db;
  const result = await db.collection('notifications').updateMany(
    { idempotencyKey: null },
    { $unset: { idempotencyKey: '' } },
  );
  // eslint-disable-next-line no-console
  console.log(`003_unset_null_idempotency_keys: unset idempotencyKey on ${result.modifiedCount} notification(s)`);
}

export async function down() {
  // Irreversible cleanup — restoring nulls would reintroduce the collision.
}
