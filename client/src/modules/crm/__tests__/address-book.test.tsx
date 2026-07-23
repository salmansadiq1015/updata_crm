import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { translations } from '@/lib/i18n/translations';
import AddressBook from '../components/address-book';

const mocks = vi.hoisted(() => ({
  useAddressBook: vi.fn(),
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (_key: string, fallback?: string, params?: Record<string, string | number>) => {
      if (!fallback) return _key;
      if (!params) return fallback;
      return Object.entries(params).reduce(
        (text, [key, value]) => text.replace(`{${key}}`, String(value)),
        fallback,
      );
    },
  }),
}));

vi.mock('@/modules/crm/hooks/use-address-book', () => ({
  useAddressBook: mocks.useAddressBook,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const ADDRESS_BOOK_TRANSLATION_KEYS = [
  'common.refresh',
  'common.reset',
  'common.retry',
  'common.tryAgain',
  'common.previous',
  'common.next',
  'sidebar.addressBook',
  'mobile.nav.addressBook',
  'crm.customer',
  'crm.addressBook.title',
  'crm.addressBook.description',
  'crm.addressBook.summaryTotal',
  'crm.addressBook.summaryBusiness',
  'crm.addressBook.summaryPrivate',
  'crm.addressBook.summaryGeo',
  'crm.addressBook.searchPlaceholder',
  'crm.addressBook.customerTypeAll',
  'crm.addressBook.customerTypeBusiness',
  'crm.addressBook.customerTypePrivate',
  'crm.addressBook.addressTypeAll',
  'crm.addressBook.addressTypeBilling',
  'crm.addressBook.addressTypeSite',
  'crm.addressBook.addressTypeDelivery',
  'crm.addressBook.geoAll',
  'crm.addressBook.geoWith',
  'crm.addressBook.geoWithout',
  'crm.addressBook.allCantons',
  'crm.addressBook.loadError',
  'crm.addressBook.emptyTitle',
  'crm.addressBook.emptySearch',
  'crm.addressBook.emptyDesc',
  'crm.addressBook.billingAddress',
  'crm.addressBook.siteDeliveryAddress',
  'crm.addressBook.privateAddress',
  'crm.addressBook.companyAddress',
  'crm.addressBook.address',
  'crm.addressBook.call',
  'crm.addressBook.email',
  'crm.addressBook.map',
  'crm.addressBook.contact',
  'crm.addressBook.contactsShort',
  'crm.addressBook.noContact',
  'crm.addressBook.projects',
  'crm.addressBook.jobs',
  'crm.addressBook.pageStatus',
] as const;

function baseHookValue() {
  return {
    entries: [
      {
        id: 'customer:customer-1:billing',
        recordType: 'customer',
        addressType: 'billing',
        addressUsage: ['billing'],
        customer: {
          id: 'customer-1',
          customerNumber: 'K-10001',
          name: 'Address Customer AG',
          type: 'business',
          phone: '+41441234567',
          email: 'office@example.test',
        },
        site: null,
        address: {
          formatted: 'Billingstrasse 10, 8001 Zürich, ZH, CH',
        },
        coordinates: null,
        contacts: [],
        primaryContact: {
          id: 'contact-1',
          firstName: 'Sabrina',
          lastName: 'Schmid',
          functionTitle: 'Facility Manager',
          mobile: '+41791234567',
          email: 'sabrina@example.test',
          isPrimary: true,
        },
        contactCount: 1,
        related: {
          projectCount: 1,
          orderCount: 1,
          assignmentCount: 1,
          jobCount: 2,
          firstProject: { id: 'project-1' },
          firstOrder: { id: 'order-1' },
          firstAssignment: { id: 'assignment-1' },
        },
      },
      {
        id: 'site:site-1',
        recordType: 'site',
        addressType: 'site',
        addressUsage: ['site', 'delivery'],
        customer: {
          id: 'customer-1',
          customerNumber: 'K-10001',
          name: 'Address Customer AG',
          type: 'business',
        },
        site: {
          id: 'site-1',
          siteNumber: 'O-1',
          name: 'Heizraum 1',
          accessInstructions: 'Ring at caretaker.',
        },
        address: {
          formatted: 'Objektweg 7, 8050 Zürich, ZH, CH',
        },
        coordinates: { latitude: 47.3769, longitude: 8.5417 },
        contacts: [],
        primaryContact: {
          id: 'contact-1',
          firstName: 'Sabrina',
          lastName: 'Schmid',
          mobile: '+41791234567',
          email: 'sabrina@example.test',
          isPrimary: true,
        },
        contactCount: 1,
        related: {
          projectCount: 1,
          orderCount: 1,
          assignmentCount: 1,
          jobCount: 2,
          firstProject: { id: 'project-1' },
          firstOrder: { id: 'order-1' },
          firstAssignment: { id: 'assignment-1' },
        },
      },
    ],
    summary: {
      total: 2,
      private: 0,
      business: 2,
      billing: 1,
      site: 1,
      delivery: 1,
      withCoordinates: 1,
    },
    serverPagination: {
      page: 1,
      limit: 50,
      total: 2,
      pageCount: 1,
      hasNext: false,
      hasPrev: false,
    },
    isFetching: false,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    filters: {
      search: '',
      customerType: 'all',
      addressType: 'all',
      canton: '',
      hasCoordinates: 'all',
    },
    setFilter: vi.fn(),
    resetFilters: vi.fn(),
    hasActiveFilters: false,
    pagination: { pageIndex: 0, pageSize: 50 },
    setPagination: vi.fn(),
  };
}

describe('AddressBook', () => {
  it('has complete translations for every supported locale', () => {
    const locales = ['de', 'en', 'fr', 'it'] as const;

    for (const locale of locales) {
      for (const key of ADDRESS_BOOK_TRANSLATION_KEYS) {
        expect(translations[locale]?.[key], `${locale}.${key}`).toEqual(expect.any(String));
      }
    }
  });

  it('renders shared CRM billing and site addresses with contact actions and direct links', () => {
    const hookValue = baseHookValue();
    mocks.useAddressBook.mockReturnValue(hookValue);
    const { container } = render(<AddressBook />);

    expect(screen.getByRole('heading', { name: 'Adressbuch' })).toBeInTheDocument();
    expect(screen.getAllByText('Address Customer AG').length).toBeGreaterThan(0);
    expect(screen.getByText('Heizraum 1')).toBeInTheDocument();
    expect(screen.getByText('Rechnungsadresse')).toBeInTheDocument();
    expect(screen.getByText('Liefer-/Objektadresse')).toBeInTheDocument();
    expect(screen.getAllByText('Sabrina Schmid').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+41791234567').length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/crm/customers/customer-1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/crm/sites/site-1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/projects/project-1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/field-ops/orders/order-1"]')).not.toBeNull();
    expect(container.querySelector('a[href^="https://www.google.com/maps/search"]')).not.toBeNull();
  });

  it('renders a recoverable error state when the address book API fails', () => {
    const hookValue = {
      ...baseHookValue(),
      entries: [],
      isError: true,
      error: { message: 'Server nicht erreichbar' },
    };
    mocks.useAddressBook.mockReturnValue(hookValue);

    render(<AddressBook />);

    expect(screen.getByText('Adressbuch konnte nicht geladen werden')).toBeInTheDocument();
    expect(screen.getByText('Server nicht erreichbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});
