import {
  Building2,
  ClipboardList,
  Home,
  MapPinned,
  Navigation,
  UserRound,
} from 'lucide-react';

export const CUSTOMER_TYPE_OPTIONS = Object.freeze([
  { value: 'all', labelKey: 'crm.addressBook.customerTypeAll', fallback: 'Alle Kunden' },
  { value: 'business', labelKey: 'crm.addressBook.customerTypeBusiness', fallback: 'Firmen' },
  { value: 'private', labelKey: 'crm.addressBook.customerTypePrivate', fallback: 'Privat' },
]);

export const ADDRESS_TYPE_OPTIONS = Object.freeze([
  { value: 'all', labelKey: 'crm.addressBook.addressTypeAll', fallback: 'Alle Adressen' },
  { value: 'billing', labelKey: 'crm.addressBook.addressTypeBilling', fallback: 'Rechnung' },
  { value: 'site', labelKey: 'crm.addressBook.addressTypeSite', fallback: 'Objekt' },
  { value: 'delivery', labelKey: 'crm.addressBook.addressTypeDelivery', fallback: 'Lieferung' },
]);

export const GEO_FILTER_OPTIONS = Object.freeze([
  { value: 'all', labelKey: 'crm.addressBook.geoAll', fallback: 'Alle Orte' },
  { value: 'with', labelKey: 'crm.addressBook.geoWith', fallback: 'Mit GPS' },
  { value: 'without', labelKey: 'crm.addressBook.geoWithout', fallback: 'Ohne GPS' },
]);

export const CANTON_OPTIONS = Object.freeze([
  'AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR', 'JU', 'LU',
  'NE', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'TI', 'UR', 'VD', 'VS',
  'ZG', 'ZH',
]);

export function getAddressTypeMeta(entry, t) {
  if (entry.addressType === 'billing') {
    return {
      icon: Home,
      label: t('crm.addressBook.billingAddress', 'Rechnungsadresse'),
      className: 'bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300',
    };
  }

  return {
    icon: MapPinned,
    label: t('crm.addressBook.siteDeliveryAddress', 'Liefer-/Objektadresse'),
    className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
  };
}

export function getCustomerTypeMeta(customer, t) {
  const isPrivate = customer?.type === 'private';
  return {
    icon: isPrivate ? UserRound : Building2,
    label: isPrivate
      ? t('crm.addressBook.privateAddress', 'Privatadresse')
      : t('crm.addressBook.companyAddress', 'Firmenadresse'),
    className: isPrivate
      ? 'bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300'
      : 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
  };
}

export function formatContactName(contact) {
  return [contact?.firstName, contact?.lastName].filter(Boolean).join(' ');
}

export function getPrimaryPhone(entry) {
  return entry.primaryContact?.mobile ||
    entry.primaryContact?.phone ||
    entry.customer?.mobile ||
    entry.customer?.phone ||
    '';
}

export function getPrimaryEmail(entry) {
  return entry.primaryContact?.email || entry.customer?.email || '';
}

export function buildMapUrl(entry) {
  if (entry.coordinates?.latitude != null && entry.coordinates?.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${entry.coordinates.latitude},${entry.coordinates.longitude}`;
  }

  const address = entry.address?.formatted;
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

export function buildEntryRoutes(entry) {
  const customerId = entry.customer?.id;
  const siteId = entry.site?.id;
  const firstProjectId = entry.related?.firstProject?.id;
  const firstOrderId = entry.related?.firstOrder?.id;
  const firstAssignmentId = entry.related?.firstAssignment?.id;

  return {
    customer: customerId ? `/crm/customers/${customerId}` : '',
    site: siteId ? `/crm/sites/${siteId}` : '',
    projects: firstProjectId
      ? `/projects/${firstProjectId}`
      : customerId ? `/projects?customerId=${customerId}` : '/projects',
    jobs: firstOrderId
      ? `/field-ops/orders/${firstOrderId}`
      : customerId ? `/field-ops/orders?customerId=${customerId}` : '/field-ops/orders',
    schedule: firstAssignmentId ? `/scheduling/calendar?assignmentId=${firstAssignmentId}` : '/scheduling/calendar',
  };
}

export function getRelationChips(entry, t) {
  const routes = buildEntryRoutes(entry);
  return [
    {
      key: 'customer',
      label: t('crm.customer', 'Kunde'),
      icon: Building2,
      href: routes.customer,
      count: null,
      enabled: Boolean(routes.customer),
    },
    {
      key: 'projects',
      label: t('crm.addressBook.projects', 'Projekte'),
      icon: ClipboardList,
      href: routes.projects,
      count: entry.related?.projectCount || 0,
      enabled: (entry.related?.projectCount || 0) > 0,
    },
    {
      key: 'jobs',
      label: t('crm.addressBook.jobs', 'Jobs'),
      icon: Navigation,
      href: routes.jobs,
      count: entry.related?.jobCount || 0,
      enabled: (entry.related?.jobCount || 0) > 0,
    },
  ];
}
