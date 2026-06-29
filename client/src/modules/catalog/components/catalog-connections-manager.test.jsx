import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';

const mutationMocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  sync: vi.fn(),
}));

const connections = [
  { _id: 'a', name: 'Acme CSV', providerKey: 'ACME', type: 'SUPPLIER', syncSchedule: '@daily', lastSyncStatus: 'HEALTHY', supplierName: 'Acme' },
  { _id: 'b', name: 'IGH Feed', providerKey: 'IGH', type: 'IGH', syncSchedule: '@weekly', lastSyncStatus: 'FAILED' },
];

vi.mock('../hooks/use-catalog-queries', () => ({
  useCatalogConnections: () => ({ data: { data: connections }, isLoading: false, isError: false }),
  useCatalogConnectionLogs: () => ({ data: [] }),
  useCatalogCategoryOptions: () => ({ data: [{ _id: 'cat-1', name: 'Heating' }] }),
}));
vi.mock('../hooks/use-catalog-mutations', () => ({
  useCatalogConnectionMutations: () => ({
    createConnection: { mutateAsync: mutationMocks.create, isPending: false, error: null },
    updateConnection: { mutateAsync: mutationMocks.update, isPending: false, error: null },
    removeConnection: { mutate: mutationMocks.remove },
    syncConnection: { mutate: mutationMocks.sync, isPending: false },
  }),
}));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (key, fallback, vars) => {
      const dict = {
        'catalog.connections.add': 'Catalog',
        'catalog.connections.createTitle': 'Connect catalog',
        'catalog.connections.editTitle': 'Edit catalog',
        'catalog.connections.dialogDescription': 'Configure connected supplier and manufacturer catalogs.',
        'catalog.connections.fieldName': 'Name',
        'catalog.connections.providerKey': 'Provider Key',
        'catalog.connections.type': 'Type',
        'catalog.connections.format': 'Format',
        'catalog.connections.endpointUrl': 'Endpoint URL',
        'catalog.connections.schedule': 'Schedule',
        'catalog.connections.supplier': 'Supplier',
        'catalog.connections.manufacturer': 'Manufacturer',
        'catalog.connections.defaultCategory': 'Default category',
        'catalog.connections.categoryPlaceholder': 'Category',
        'catalog.connections.defaultMarkupPercent': 'Markup %',
        'catalog.connections.defaultMarginPercent': 'Margin %',
        'catalog.connections.apiKey': 'API Key',
        'catalog.connections.token': 'Token',
        'catalog.connections.username': 'Username',
        'catalog.connections.password': 'Password',
        'catalog.connections.enabled': 'Enabled',
        'catalog.connections.preferred': 'Preferred',
        'catalog.connections.rank': 'Rank',
        'catalog.connections.stepSource': 'Connection source',
        'catalog.connections.stepSourceDescription': 'Capture identity, provider, and feed format.',
        'catalog.connections.stepMapping': 'Mapping & pricing',
        'catalog.connections.stepMappingDescription': 'Define synchronization, category, and default margins.',
        'catalog.connections.stepSecurity': 'Security & review',
        'catalog.connections.stepSecurityDescription': 'Check credentials, activation, and priority.',
        'catalog.connections.stepStatus': 'Step {current} of {total}',
        'catalog.connections.stepperLabel': 'Catalog connection steps',
        'catalog.connections.providerKeyHint': 'Unique short key used for imports and article numbers.',
        'catalog.connections.providerKeyLocked': 'Provider key is locked after creation.',
        'catalog.connections.endpointHint': 'Optional HTTPS/HTTP feed endpoint.',
        'catalog.connections.noDefaultCategory': 'No default category',
        'catalog.connections.categoryHint': 'Used when imported rows do not provide a category.',
        'catalog.connections.markupHint': 'Optional markup from -100 to 1000%.',
        'catalog.connections.marginHint': 'Optional margin from -100 to 99.99%.',
        'catalog.connections.enabledHint': 'Allow scheduled syncs and manual runs.',
        'catalog.connections.preferredHint': 'Prefer this source when multiple feeds match.',
        'catalog.connections.rankHint': 'Lower values get higher priority.',
        'catalog.connections.reviewTitle': 'Review connection',
        'catalog.connections.reviewDescription': 'Confirm the key settings before saving.',
        'catalog.connections.credentialsSet': 'Credentials set',
        'catalog.connections.credentialsEmpty': 'No credentials',
        'catalog.connections.reviewHint': 'Review and save when everything is correct.',
        'catalog.connections.nextHint': 'Complete required fields, then continue.',
        'catalog.connections.saveFailed': 'Connection could not be saved',
        'catalog.connections.saveFailedDescription': 'Check the input values or try again.',
        'catalog.connections.errorNameRequired': 'Name is required.',
        'catalog.connections.errorProviderKeyRequired': 'Provider key is required.',
        'catalog.connections.errorEndpointUrlInvalid': 'Endpoint URL must start with http:// or https://.',
        'catalog.connections.errorMarkupRange': 'Markup must be between -100 and 1000.',
        'catalog.connections.errorMarginRange': 'Margin must be between -100 and 99.99.',
        'catalog.connections.errorRankRange': 'Rank must be an integer between 0 and 100000.',
        'common.cancel': 'Cancel',
        'common.back': 'Back',
        'common.next': 'Next',
        'common.save': 'Save',
        'common.saving': 'Saving...',
        'common.close': 'Close',
        'common.results': 'results',
      };
      const value = dict[key] || fallback || key;
      return vars ? value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name])) : value;
    },
  }),
}));

import { CatalogConnectionsManager } from './catalog-connections-manager';

describe('CatalogConnectionsManager', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
  });

  beforeEach(() => {
    mutationMocks.create.mockReset();
    mutationMocks.update.mockReset();
    mutationMocks.remove.mockReset();
    mutationMocks.sync.mockReset();
    mutationMocks.create.mockResolvedValue({});
    mutationMocks.update.mockResolvedValue({});
  });

  it('renders connection rows', () => {
    render(<CatalogConnectionsManager />);
    expect(screen.getByText('Acme CSV')).toBeInTheDocument();
    expect(screen.getByText('IGH Feed')).toBeInTheDocument();
  });

  it('renders a search box and type + status filters', () => {
    render(<CatalogConnectionsManager />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });

  it('opens a stepper form and blocks incomplete source details', async () => {
    const user = userEvent.setup();
    render(<CatalogConnectionsManager />);

    await user.click(screen.getByRole('button', { name: 'Catalog' }));
    expect(screen.getByText('Connect catalog')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connection source' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByText('Provider key is required.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connection source' })).toBeInTheDocument();
  });

  it('advances through the wizard and creates a connection from the review step', async () => {
    render(<CatalogConnectionsManager />);

    fireEvent.click(screen.getByRole('button', { name: 'Catalog' }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'New Supplier Feed' } });
    fireEvent.change(screen.getByLabelText(/^Provider Key/), { target: { value: 'SUP' } });
    fireEvent.change(screen.getByLabelText(/^Endpoint URL/), { target: { value: 'https://supplier.example/catalog.csv' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('heading', { name: 'Mapping & pricing' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('heading', { name: 'Security & review' })).toBeInTheDocument();
    expect(screen.getByText('Review connection')).toBeInTheDocument();
    expect(screen.getByText('New Supplier Feed')).toBeInTheDocument();
    expect(screen.getByText('SUP')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mutationMocks.create).toHaveBeenCalledTimes(1));
    expect(mutationMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Supplier Feed',
      providerKey: 'SUP',
      type: 'SUPPLIER',
      format: 'CSV',
      endpointUrl: 'https://supplier.example/catalog.csv',
      defaultCategoryId: null,
      preferredRank: 100,
      credentials: {},
    }));
  });
});
