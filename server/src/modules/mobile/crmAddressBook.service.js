const DEFAULT_LIMIT = 5000;

const CUSTOMER_SELECT = 'customerNumber name type street postalCode city canton country phone mobile email status isDeleted updatedAt';
const CONTACT_SELECT = 'customerId firstName lastName functionTitle phone mobile email isPrimary isDeleted updatedAt';
const SITE_SELECT = 'customerId siteNumber name street postalCode city canton country floorUnit accessInstructions siteType latitude longitude status isDeleted updatedAt';
const INSTALLATION_SELECT = 'installationNumber siteId type manufacturer model serialNumber commissioningDate warrantyEndDate powerOutputKw fuelType yearOfManufacture technicalNotes status isDeleted updatedAt';
const NOTE_SELECT = 'entityType entityId text category isPinned isWarning authorId editableUntil isDeleted deletedAt createdAt updatedAt';

function parseSince(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function objectId(value) {
  if (!value) return null;
  return String(value._id || value);
}

function isoDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function isActive(doc) {
  return !doc.isDeleted && (!doc.status || doc.status === 'active');
}

function maxAddressBookCustomers() {
  const configured = Number(process.env.MOBILE_CRM_ADDRESS_BOOK_LIMIT);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LIMIT;
}

function maxAddressBookNotes() {
  const configured = Number(process.env.MOBILE_CRM_NOTES_LIMIT);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LIMIT * 4;
}

class CrmAddressBookService {
  async listChanges(lastSyncTimestamp) {
    const since = parseSince(lastSyncTimestamp);
    const limit = maxAddressBookCustomers();
    const notesLimit = maxAddressBookNotes();

    const { default: Customer } = await import('../crm/customer.model.js');
    const { default: Contact } = await import('../crm/contact.model.js');
    const { default: Site } = await import('../crm/site.model.js');
    const { default: Installation } = await import('../crm/installation.model.js');
    const { default: EntityNote } = await import('../crm/entityNote.model.js');

    const deleted = {
      customers: [],
      contacts: [],
      sites: [],
      installations: [],
      notes: [],
    };

    let customerIds = new Set();

    if (since) {
      const [changedCustomers, changedContacts, changedSites, changedInstallations, changedNotes] = await Promise.all([
        Customer.find({ updatedAt: { $gt: since } })
          .setOptions({ includeDeleted: true })
          .select('_id status isDeleted')
          .limit(limit)
          .lean(),
        Contact.find({ updatedAt: { $gt: since } })
          .setOptions({ includeDeleted: true })
          .select('_id customerId isDeleted')
          .limit(limit * 2)
          .lean(),
        Site.find({ updatedAt: { $gt: since } })
          .setOptions({ includeDeleted: true })
          .select('_id customerId status isDeleted')
          .limit(limit * 2)
          .lean(),
        Installation.find({ updatedAt: { $gt: since } })
          .setOptions({ includeDeleted: true })
          .select('_id siteId status isDeleted')
          .limit(limit * 3)
          .lean(),
        EntityNote.find({ updatedAt: { $gt: since } })
          .setOptions({ includeDeleted: true })
          .select('_id entityType entityId isDeleted')
          .limit(notesLimit)
          .lean(),
      ]);

      for (const customer of changedCustomers) {
        const id = objectId(customer);
        if (isActive(customer)) customerIds.add(id);
        else deleted.customers.push(id);
      }

      for (const contact of changedContacts) {
        if (contact.isDeleted) deleted.contacts.push(objectId(contact));
        const customerId = objectId(contact.customerId);
        if (customerId) customerIds.add(customerId);
      }

      for (const site of changedSites) {
        if (!isActive(site)) deleted.sites.push(objectId(site));
        const customerId = objectId(site.customerId);
        if (customerId) customerIds.add(customerId);
      }

      if (changedInstallations.length > 0) {
        const installationSiteIds = [...new Set(changedInstallations.map((item) => objectId(item.siteId)).filter(Boolean))];
        const parentSites = installationSiteIds.length > 0
          ? await Site.find({ _id: { $in: installationSiteIds } })
            .setOptions({ includeDeleted: true })
            .select('_id customerId')
            .lean()
          : [];
        const siteToCustomer = new Map(parentSites.map((site) => [objectId(site), objectId(site.customerId)]));

        for (const installation of changedInstallations) {
          if (!isActive(installation)) deleted.installations.push(objectId(installation));
          const customerId = siteToCustomer.get(objectId(installation.siteId));
          if (customerId) customerIds.add(customerId);
        }
      }

      await this._includeNoteParents({
        notes: changedNotes,
        Customer,
        Site,
        Installation,
        customerIds,
        deleted,
      });
    } else {
      const customers = await Customer.find({ status: 'active' })
        .sort({ name: 1, _id: 1 })
        .limit(limit)
        .select('_id')
        .lean();
      customerIds = new Set(customers.map((customer) => objectId(customer)));
    }

    const activeCustomers = customerIds.size > 0
      ? await Customer.find({ _id: { $in: [...customerIds] }, status: 'active' })
        .select(CUSTOMER_SELECT)
        .sort({ name: 1, _id: 1 })
        .lean()
      : [];

    const activeCustomerIds = activeCustomers.map((customer) => objectId(customer));

    if (activeCustomerIds.length === 0) {
      return {
        customers: [],
        contacts: [],
        sites: [],
        installations: [],
        notes: [],
        deleted,
      };
    }

    const [contacts, sites] = await Promise.all([
      Contact.find({ customerId: { $in: activeCustomerIds } })
        .select(CONTACT_SELECT)
        .sort({ lastName: 1, firstName: 1, _id: 1 })
        .lean(),
      Site.find({ customerId: { $in: activeCustomerIds }, status: 'active' })
        .select(SITE_SELECT)
        .sort({ siteNumber: 1, _id: 1 })
        .lean(),
    ]);

    const siteIds = sites.map((site) => objectId(site));
    const installations = siteIds.length > 0
      ? await Installation.find({ siteId: { $in: siteIds }, status: 'active' })
        .select(INSTALLATION_SELECT)
        .sort({ installationNumber: 1, _id: 1 })
        .lean()
      : [];
    const installationIds = installations.map((installation) => objectId(installation));
    const noteFilters = [
      { entityType: 'customer', entityId: { $in: activeCustomerIds } },
      { entityType: 'site', entityId: { $in: siteIds } },
      { entityType: 'installation', entityId: { $in: installationIds } },
    ].filter((filter) => filter.entityId.$in.length > 0);

    const notes = noteFilters.length > 0
      ? await EntityNote.find({ $or: noteFilters })
        .select(NOTE_SELECT)
        .sort({ isWarning: -1, isPinned: -1, createdAt: -1, _id: 1 })
        .limit(notesLimit)
        .lean()
      : [];

    const siteCustomerMap = new Map(sites.map((site) => [objectId(site), objectId(site.customerId)]));

    return {
      customers: activeCustomers.map(this._serializeCustomer),
      contacts: contacts.map(this._serializeContact),
      sites: sites.map(this._serializeSite),
      installations: installations.map((installation) => this._serializeInstallation(installation, siteCustomerMap)),
      notes: notes.map(this._serializeNote),
      deleted,
    };
  }

  async _includeNoteParents({ notes, Customer, Site, Installation, customerIds, deleted }) {
    if (!Array.isArray(notes) || notes.length === 0) return;

    const siteIds = new Set();
    const installationIds = new Set();

    for (const note of notes) {
      const noteId = objectId(note);
      if (note.isDeleted) deleted.notes.push(noteId);
      if (note.isDeleted) continue;

      const entityId = objectId(note.entityId);
      if (!entityId) continue;

      if (note.entityType === 'customer') customerIds.add(entityId);
      if (note.entityType === 'site') siteIds.add(entityId);
      if (note.entityType === 'installation') installationIds.add(entityId);
    }

    if (installationIds.size > 0) {
      const installations = await Installation.find({ _id: { $in: [...installationIds] }, status: 'active' })
        .setOptions({ includeDeleted: true })
        .select('_id siteId status isDeleted')
        .lean();
      for (const installation of installations) {
        if (isActive(installation)) siteIds.add(objectId(installation.siteId));
      }
    }

    if (siteIds.size > 0) {
      const sites = await Site.find({ _id: { $in: [...siteIds] }, status: 'active' })
        .setOptions({ includeDeleted: true })
        .select('_id customerId status isDeleted')
        .lean();
      for (const site of sites) {
        if (isActive(site)) customerIds.add(objectId(site.customerId));
      }
    }

    if (customerIds.size > 0) {
      const customers = await Customer.find({ _id: { $in: [...customerIds] }, status: 'active' })
        .select('_id')
        .lean();
      customerIds.clear();
      for (const customer of customers) customerIds.add(objectId(customer));
    }
  }

  _serializeCustomer(customer) {
    return {
      id: objectId(customer),
      customer_number: customer.customerNumber,
      name: customer.name,
      type: customer.type,
      street: customer.street,
      postal_code: customer.postalCode,
      city: customer.city,
      canton: customer.canton,
      country: customer.country,
      phone: customer.phone,
      mobile: customer.mobile,
      email: customer.email,
      updated_at: isoDate(customer.updatedAt),
    };
  }

  _serializeContact(contact) {
    return {
      id: objectId(contact),
      customer_id: objectId(contact.customerId),
      first_name: contact.firstName,
      last_name: contact.lastName,
      function_title: contact.functionTitle,
      phone: contact.phone,
      mobile: contact.mobile,
      email: contact.email,
      is_primary: Boolean(contact.isPrimary),
      updated_at: isoDate(contact.updatedAt),
    };
  }

  _serializeSite(site) {
    return {
      id: objectId(site),
      customer_id: objectId(site.customerId),
      site_number: site.siteNumber,
      name: site.name,
      street: site.street,
      postal_code: site.postalCode,
      city: site.city,
      canton: site.canton,
      country: site.country,
      floor_unit: site.floorUnit,
      access_instructions: site.accessInstructions,
      site_type: site.siteType,
      latitude: site.latitude,
      longitude: site.longitude,
      updated_at: isoDate(site.updatedAt),
    };
  }

  _serializeInstallation(installation, siteCustomerMap) {
    return {
      id: objectId(installation),
      site_id: objectId(installation.siteId),
      customer_id: siteCustomerMap.get(objectId(installation.siteId)) || null,
      installation_number: installation.installationNumber,
      system_type: installation.type,
      manufacturer: installation.manufacturer,
      model: installation.model,
      serial_number: installation.serialNumber,
      commissioning_date: isoDate(installation.commissioningDate),
      warranty_until: isoDate(installation.warrantyEndDate),
      power_output_kw: installation.powerOutputKw,
      fuel_type: installation.fuelType,
      year_installed: installation.yearOfManufacture,
      technical_notes: installation.technicalNotes,
      status: installation.status,
      updated_at: isoDate(installation.updatedAt),
    };
  }

  _serializeNote(note) {
    return {
      id: objectId(note),
      entity_type: note.entityType,
      entity_id: objectId(note.entityId),
      text: note.text,
      category: note.category,
      is_pinned: Boolean(note.isPinned),
      is_warning: Boolean(note.isWarning),
      author_id: objectId(note.authorId),
      editable_until: isoDate(note.editableUntil),
      created_at: isoDate(note.createdAt),
      updated_at: isoDate(note.updatedAt),
    };
  }
}

const crmAddressBookService = new CrmAddressBookService();
export default crmAddressBookService;
