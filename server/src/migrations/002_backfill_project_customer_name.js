import mongoose from 'mongoose';

/**
 * Backfill the denormalized `customerName` on existing projects (PROJ-007 AC-3).
 * Projects created before this field existed have customerName=null and would
 * sort last; copy each project's customer name in once. New writes keep it in
 * sync via the service, and a CUSTOMER_UPDATED listener resyncs on rename.
 */
export async function up() {
  const db = mongoose.connection.db;
  const projects = db.collection('projects');
  const customers = db.collection('customers');

  const cursor = projects.find(
    { $or: [{ customerName: { $exists: false } }, { customerName: null }] },
    { projection: { _id: 1, customerId: 1 } },
  );

  let updated = 0;
  for await (const project of cursor) {
    if (!project.customerId) continue;
    const customer = await customers.findOne({ _id: project.customerId }, { projection: { name: 1 } });
    if (customer?.name) {
      await projects.updateOne({ _id: project._id }, { $set: { customerName: customer.name } });
      updated += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`002_backfill_project_customer_name: set customerName on ${updated} project(s)`);
}

export async function down() {
  const db = mongoose.connection.db;
  await db.collection('projects').updateMany({}, { $unset: { customerName: '' } });
}
