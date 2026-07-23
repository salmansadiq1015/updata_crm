import mongoose from 'mongoose';

/**
 * Customers are deactivated, not archived (client feedback).
 *
 * The status enum was ['active', 'archived']; it is now ['active', 'inactive'],
 * matching sites and giving the state a reversible meaning. Existing rows keep
 * the old value, which no longer validates, so rename it in place.
 *
 * The same feedback rules out hiding customers: bulk "delete" used to set
 * isDeleted, which the soft-delete pre-find hook filters out with no way back
 * through the UI. Those rows are restored here and merely deactivated.
 */
export async function up() {
  const db = mongoose.connection.db;

  const renamed = await db.collection('customers').updateMany(
    { status: 'archived' },
    { $set: { status: 'inactive' } },
  );

  const restored = await db.collection('customers').updateMany(
    { isDeleted: true },
    { $set: { isDeleted: false, deletedAt: null, status: 'inactive' } },
  );

  // eslint-disable-next-line no-console
  console.log(
    `004_customers_archived_to_inactive: renamed ${renamed.modifiedCount} archived -> inactive, `
    + `restored ${restored.modifiedCount} soft-deleted customer(s) as inactive`,
  );
}

export async function down() {
  const db = mongoose.connection.db;
  const result = await db.collection('customers').updateMany(
    { status: 'inactive' },
    { $set: { status: 'archived' } },
  );
  // Soft-deleted rows are intentionally not re-hidden: which ones were deleted
  // versus merely archived is no longer distinguishable after up().
  // eslint-disable-next-line no-console
  console.log(`004_customers_archived_to_inactive: reverted ${result.modifiedCount} customer(s) to archived`);
}
