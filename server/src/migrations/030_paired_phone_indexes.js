import PairedDevice from '../modules/pairedPhone/pairedDevice.model.js';
import PairingCode from '../modules/pairedPhone/pairingCode.model.js';
import CallRecord from '../modules/aiCalling/callRecord.model.js';
import AiCallingSettings from '../modules/aiCalling/aiCallingSettings.model.js';

/** Paired-phone (ESP32 gateway) collections + CallRecord device indexes. Additive, idempotent. */
export const name = '030_paired_phone_indexes';

export async function up() {
  await Promise.all([PairedDevice.createIndexes(), PairingCode.createIndexes(), AiCallingSettings.createIndexes()]);
  await CallRecord.collection.createIndex({ pairedDeviceId: 1, initiatedAt: 1 }, { partialFilterExpression: { pairedDeviceId: { $type: 'objectId' } }, name: 'paired_device_usage' });
  await CallRecord.collection.createIndex({ pairedDeviceId: 1, 'gateway.state': 1 }, { partialFilterExpression: { pairedDeviceId: { $type: 'objectId' } }, name: 'paired_device_queue' });
}

export async function down() {
  await CallRecord.collection.dropIndex('paired_device_usage').catch(() => {});
  await CallRecord.collection.dropIndex('paired_device_queue').catch(() => {});
  // Device collections hold pairing and audit evidence; rollback keeps them.
}

export default { name, up, down };
