import { db, getSyncMeta } from '../db/mobile-db';

const DEFAULT_LIMIT = 50;

export const crmAddressBookService = {
  async search(query = '', limit = DEFAULT_LIMIT) {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      const customers = await db.crmCustomers
        .orderBy('name')
        .limit(limit)
        .toArray();
      return hydrateCustomers(customers);
    }

    const [customers, contacts, sites, installations] = await Promise.all([
      db.crmCustomers.filter((item) => matches(item, normalizedQuery)).limit(limit).toArray(),
      db.crmContacts.filter((item) => matches(item, normalizedQuery)).limit(limit).toArray(),
      db.crmSites.filter((item) => matches(item, normalizedQuery)).limit(limit).toArray(),
      db.crmInstallations.filter((item) => matches(item, normalizedQuery)).limit(limit).toArray(),
    ]);

    const customerIds = new Set(customers.map((item) => item.id));
    contacts.forEach((item) => customerIds.add(item.customer_id));
    sites.forEach((item) => customerIds.add(item.customer_id));
    installations.forEach((item) => {
      if (item.customer_id) customerIds.add(item.customer_id);
    });

    const resultCustomers = customerIds.size > 0
      ? await db.crmCustomers.bulkGet([...customerIds])
      : [];

    return hydrateCustomers(
      resultCustomers.filter(Boolean),
      { contacts, sites, installations },
    );
  },

  async getByCustomerId(customerId) {
    const customer = await db.crmCustomers.get(customerId);
    if (!customer) return null;
    const [contacts, sites, installations] = await Promise.all([
      db.crmContacts.where('customer_id').equals(customerId).toArray(),
      db.crmSites.where('customer_id').equals(customerId).toArray(),
      db.crmInstallations.where('customer_id').equals(customerId).toArray(),
    ]);

    return buildCustomerCard(customer, contacts, sites, installations);
  },

  async getSummary() {
    const [customers, contacts, sites, installations, lastSyncAt] = await Promise.all([
      db.crmCustomers.count(),
      db.crmContacts.count(),
      db.crmSites.count(),
      db.crmInstallations.count(),
      getSyncMeta('last_sync_timestamp'),
    ]);

    return { customers, contacts, sites, installations, lastSyncAt };
  },
};

async function hydrateCustomers(customers, matched = {}) {
  if (customers.length === 0) return [];

  const customerIds = customers.map((customer) => customer.id);
  const [allContacts, allSites, allInstallations] = await Promise.all([
    db.crmContacts.where('customer_id').anyOf(customerIds).toArray(),
    db.crmSites.where('customer_id').anyOf(customerIds).toArray(),
    db.crmInstallations.where('customer_id').anyOf(customerIds).toArray(),
  ]);

  const matchedIds = {
    contacts: new Set((matched.contacts || []).map((item) => item.id)),
    sites: new Set((matched.sites || []).map((item) => item.id)),
    installations: new Set((matched.installations || []).map((item) => item.id)),
  };

  return customers
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de-CH'))
    .map((customer) => buildCustomerCard(
      customer,
      allContacts.filter((contact) => contact.customer_id === customer.id),
      allSites.filter((site) => site.customer_id === customer.id),
      allInstallations.filter((installation) => installation.customer_id === customer.id),
      matchedIds,
    ));
}

function buildCustomerCard(customer, contacts, sites, installations, matchedIds = {}) {
  return {
    ...customer,
    contacts: contacts.sort(primaryContactFirst),
    sites: sites.sort((a, b) => (a.site_number || '').localeCompare(b.site_number || '', 'de-CH')),
    installations: installations.sort((a, b) => (a.installation_number || '').localeCompare(b.installation_number || '', 'de-CH')),
    matches: {
      contacts: countMatches(contacts, matchedIds.contacts),
      sites: countMatches(sites, matchedIds.sites),
      installations: countMatches(installations, matchedIds.installations),
    },
  };
}

function primaryContactFirst(a, b) {
  if (a.is_primary && !b.is_primary) return -1;
  if (!a.is_primary && b.is_primary) return 1;
  return `${a.last_name || ''} ${a.first_name || ''}`.localeCompare(
    `${b.last_name || ''} ${b.first_name || ''}`,
    'de-CH',
  );
}

function countMatches(items, ids) {
  if (!ids || ids.size === 0) return 0;
  return items.filter((item) => ids.has(item.id)).length;
}

function matches(item, query) {
  return item?.search_text?.includes(query);
}
