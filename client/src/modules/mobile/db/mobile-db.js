import Dexie from 'dexie';
import { generateId } from '@/lib/utils/ids';

export const db = new Dexie('mb-mobile');

db.version(1).stores({
  orders: '&id, order_number, status, priority, scheduled_start, last_synced_at',
  workReports: '&id, order_id, status, sync_status, updated_at',
  materialItems: '&id, work_report_id, sync_status',
  photos: '&id, order_id, work_report_id, category, sync_status',
  timeEntries: '&id, order_id, date, activity_type, release_status, sync_status',
  chatMessages: '&id, project_id, sent_at, sync_status',
  catalogItems: '&id, catalog_source, description',
  notifications: '&id, notification_type, is_read, received_at',
  syncQueue: '&id, entity_type, entity_id, [status+priority], created_at',
  syncMeta: '&key',
});

db.version(2).stores({
  orders: '&id, order_number, status, priority, scheduled_start, last_synced_at',
  workReports: '&id, order_id, status, sync_status, updated_at',
  materialItems: '&id, work_report_id, sync_status',
  photos: '&id, order_id, work_report_id, category, sync_status',
  documents: '&id, order_id, document_type, sync_status, created_at',
  accountingDocuments: '&id, document_type, sync_status, created_at, project_reference',
  timeEntries: '&id, order_id, date, activity_type, release_status, sync_status',
  chatMessages: '&id, project_id, sent_at, sync_status',
  catalogItems: '&id, catalog_source, description',
  notifications: '&id, notification_type, is_read, received_at',
  syncQueue: '&id, entity_type, entity_id, [status+priority], created_at',
  syncMeta: '&key',
});

db.version(3).stores({
  orders: '&id, order_number, status, priority, scheduled_start, last_synced_at',
  workReports: '&id, order_id, status, sync_status, updated_at',
  materialItems: '&id, work_report_id, sync_status',
  photos: '&id, order_id, work_report_id, category, sync_status',
  documents: '&id, order_id, document_type, sync_status, created_at',
  accountingDocuments: '&id, document_type, sync_status, created_at, project_reference',
  timeEntries: '&id, order_id, date, activity_type, release_status, sync_status',
  chatMessages: '&id, project_id, sent_at, sync_status',
  catalogItems: '&id, catalog_source, description',
  notifications: '&id, notification_type, is_read, received_at',
  crmCustomers: '&id, customer_number, name, city, postal_code, updated_at, last_synced_at',
  crmContacts: '&id, customer_id, last_name, email, updated_at, last_synced_at',
  crmSites: '&id, customer_id, site_number, city, updated_at, last_synced_at',
  crmInstallations: '&id, site_id, customer_id, installation_number, status, updated_at, last_synced_at',
  syncQueue: '&id, entity_type, entity_id, [status+priority], created_at',
  syncMeta: '&key',
});

db.version(4).stores({
  orders: '&id, order_number, status, priority, scheduled_start, last_synced_at',
  workReports: '&id, order_id, status, sync_status, updated_at',
  materialItems: '&id, work_report_id, sync_status',
  photos: '&id, order_id, work_report_id, category, sync_status',
  documents: '&id, order_id, document_type, sync_status, created_at',
  accountingDocuments: '&id, document_type, sync_status, created_at, project_reference',
  timeEntries: '&id, order_id, date, activity_type, release_status, sync_status',
  chatMessages: '&id, project_id, sent_at, sync_status',
  catalogItems: '&id, catalog_source, description',
  notifications: '&id, notification_type, is_read, received_at',
  crmCustomers: '&id, customer_number, name, city, postal_code, updated_at, last_synced_at',
  crmContacts: '&id, customer_id, last_name, email, updated_at, last_synced_at',
  crmSites: '&id, customer_id, site_number, city, updated_at, last_synced_at',
  crmInstallations: '&id, site_id, customer_id, installation_number, status, updated_at, last_synced_at',
  crmNotes: '&id, entity_type, entity_id, [entity_type+entity_id], category, is_warning, is_pinned, sync_status, updated_at, last_synced_at',
  syncQueue: '&id, entity_type, entity_id, [status+priority], created_at',
  syncMeta: '&key',
});

db.version(5).stores({
  orders: '&id, order_number, status, priority, scheduled_start, last_synced_at',
  workReports: '&id, order_id, status, sync_status, updated_at',
  materialItems: '&id, work_report_id, sync_status',
  photos: '&id, order_id, work_report_id, category, sync_status',
  documents: '&id, order_id, document_type, sync_status, created_at',
  accountingDocuments: '&id, document_type, sync_status, created_at, project_reference',
  timeEntries: '&id, order_id, date, activity_type, release_status, sync_status',
  chatMessages: '&id, project_id, sent_at, sync_status',
  catalogItems: '&id, catalog_source, description',
  notifications: '&id, notification_type, is_read, received_at',
  crmCustomers: '&id, customer_number, name, city, postal_code, updated_at, last_synced_at',
  crmContacts: '&id, customer_id, last_name, email, updated_at, last_synced_at',
  crmSites: '&id, customer_id, site_number, city, updated_at, last_synced_at',
  crmInstallations: '&id, site_id, customer_id, installation_number, status, updated_at, last_synced_at',
  crmNotes: '&id, entity_type, entity_id, [entity_type+entity_id], category, is_warning, is_pinned, sync_status, updated_at, last_synced_at',
  crmImageQueue: '&id, entity_type, entity_id, [entity_type+entity_id], category, status, created_at',
  syncQueue: '&id, entity_type, entity_id, [status+priority], created_at',
  syncMeta: '&key',
});

export async function getSyncMeta(key) {
  const record = await db.syncMeta.get(key);
  return record?.value ?? null;
}

export async function setSyncMeta(key, value) {
  await db.syncMeta.put({ key, value });
}

export async function enqueueSync(entityType, entityId, operation, payload, priority) {
  const id = generateId();
  await db.syncQueue.add({
    id,
    entity_type: entityType,
    entity_id: entityId,
    operation,
    payload,
    status: 'QUEUED',
    priority,
    retry_count: 0,
    error_message: null,
    created_at: new Date().toISOString(),
    last_attempted_at: null,
  });
  return id;
}

export async function getPendingSyncItems() {
  return db.syncQueue
    .where('status')
    .anyOf('QUEUED', 'FAILED')
    .sortBy('priority');
}

export async function markSyncItemCompleted(id) {
  await db.syncQueue.update(id, {
    status: 'COMPLETED',
    last_attempted_at: new Date().toISOString(),
  });
}

export async function markSyncItemFailed(id, errorMessage, retryCount) {
  await db.syncQueue.update(id, {
    status: 'FAILED',
    error_message: errorMessage,
    retry_count: retryCount,
    last_attempted_at: new Date().toISOString(),
  });
}

export async function clearCompletedSyncItems(olderThanDays = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const cutoffISO = cutoff.toISOString();

  await db.syncQueue
    .where('status')
    .equals('COMPLETED')
    .filter((item) => item.created_at < cutoffISO)
    .delete();
}

export async function getPendingSyncCount() {
  return db.syncQueue
    .where('status')
    .anyOf('QUEUED', 'IN_PROGRESS', 'FAILED')
    .count();
}

export async function getFailedSyncCount() {
  return db.syncQueue.where('status').equals('FAILED').count();
}

export async function upsertCrmAddressBook(addressBook, syncTimestamp) {
  if (!addressBook) return;

  const syncedAt = typeof syncTimestamp === 'string'
    ? syncTimestamp
    : new Date(syncTimestamp || Date.now()).toISOString();

  await db.transaction(
    'rw',
    db.crmCustomers,
    db.crmContacts,
    db.crmSites,
    db.crmInstallations,
    db.crmNotes,
    async () => {
      await deleteByIds(db.crmNotes, addressBook.deleted?.notes);
      await deleteByIds(db.crmContacts, addressBook.deleted?.contacts);
      await deleteByIds(db.crmInstallations, addressBook.deleted?.installations);
      if (Array.isArray(addressBook.deleted?.installations) && addressBook.deleted.installations.length > 0) {
        await db.crmNotes
          .where('[entity_type+entity_id]')
          .anyOf(addressBook.deleted.installations.map((id) => ['installation', id]))
          .delete();
      }

      if (Array.isArray(addressBook.deleted?.sites) && addressBook.deleted.sites.length > 0) {
        await deleteByIds(db.crmSites, addressBook.deleted.sites);
        await db.crmInstallations
          .where('site_id')
          .anyOf(addressBook.deleted.sites)
          .delete();
        await db.crmNotes
          .where('[entity_type+entity_id]')
          .anyOf(addressBook.deleted.sites.map((id) => ['site', id]))
          .delete();
      }

      if (Array.isArray(addressBook.deleted?.customers) && addressBook.deleted.customers.length > 0) {
        await deleteByIds(db.crmCustomers, addressBook.deleted.customers);
        await db.crmContacts
          .where('customer_id')
          .anyOf(addressBook.deleted.customers)
          .delete();
        await db.crmSites
          .where('customer_id')
          .anyOf(addressBook.deleted.customers)
          .delete();
        await db.crmInstallations
          .where('customer_id')
          .anyOf(addressBook.deleted.customers)
          .delete();
        await db.crmNotes
          .where('[entity_type+entity_id]')
          .anyOf(addressBook.deleted.customers.map((id) => ['customer', id]))
          .delete();
      }

      if (Array.isArray(addressBook.customers) && addressBook.customers.length > 0) {
        await db.crmCustomers.bulkPut(
          addressBook.customers.map((customer) => ({
            ...customer,
            last_synced_at: syncedAt,
            search_text: buildSearchText(customer, ['customer_number', 'name', 'street', 'postal_code', 'city', 'phone', 'mobile', 'email']),
          }))
        );
      }

      if (Array.isArray(addressBook.contacts) && addressBook.contacts.length > 0) {
        await db.crmContacts.bulkPut(
          addressBook.contacts.map((contact) => ({
            ...contact,
            last_synced_at: syncedAt,
            search_text: buildSearchText(contact, ['first_name', 'last_name', 'function_title', 'phone', 'mobile', 'email']),
          }))
        );
      }

      if (Array.isArray(addressBook.sites) && addressBook.sites.length > 0) {
        await db.crmSites.bulkPut(
          addressBook.sites.map((site) => ({
            ...site,
            last_synced_at: syncedAt,
            search_text: buildSearchText(site, ['site_number', 'name', 'street', 'postal_code', 'city', 'access_instructions']),
          }))
        );
      }

      if (Array.isArray(addressBook.installations) && addressBook.installations.length > 0) {
        await db.crmInstallations.bulkPut(
          addressBook.installations.map((installation) => ({
            ...installation,
            last_synced_at: syncedAt,
            name: installation.name || installation.model || installation.installation_number,
            capacity: installation.power_output_kw ? `${installation.power_output_kw} kW` : null,
            notes: installation.technical_notes,
            search_text: buildSearchText(installation, ['installation_number', 'system_type', 'manufacturer', 'model', 'serial_number', 'fuel_type']),
          }))
        );
      }

      if (Array.isArray(addressBook.notes) && addressBook.notes.length > 0) {
        await db.crmNotes.bulkPut(
          addressBook.notes.map((note) => ({
            ...note,
            sync_status: 'SYNCED',
            last_synced_at: syncedAt,
            search_text: buildSearchText(note, ['text', 'category']),
          }))
        );
      }
    }
  );
}

async function deleteByIds(table, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  await table.bulkDelete(ids);
}

function buildSearchText(record, keys) {
  return keys
    .map((key) => record?.[key])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
