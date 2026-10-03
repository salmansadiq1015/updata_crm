import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { BusinessList } from '../ui/business-list';
import { discoveryResultSchema } from '../schemas/discovery-schemas';
import { makeResultDTO } from './mocks/data';
import type { DiscoveryResult } from '../types/discovery-types';

// virtual-core measures via offsetWidth/offsetHeight (0 in jsdom).
const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
beforeAll(() => {
  globalThis.ResizeObserver =
    globalThis.ResizeObserver ||
    (class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver);
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 440 });
});
afterAll(() => {
  if (offsetHeightDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeightDescriptor);
  if (offsetWidthDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidthDescriptor);
});

beforeEach(() => {
  try {
    window.localStorage.setItem('updata-locale', 'en');
  } catch {
    /* ignore */
  }
});

function makeResults(): DiscoveryResult[] {
  return [
    discoveryResultSchema.parse(makeResultDTO({ id: 'r1', business: { ...makeResultDTO().business, name: 'Alpha Cafe' }, crmStatus: 'NEW' })),
    discoveryResultSchema.parse(makeResultDTO({ id: 'r2', business: { ...makeResultDTO().business, name: 'Beta Bakery' }, crmStatus: 'EXISTING' })),
  ];
}

function renderList(overrides: Partial<React.ComponentProps<typeof BusinessList>> = {}) {
  const props: React.ComponentProps<typeof BusinessList> = {
    results: makeResults(),
    selectedResultId: null,
    hoveredResultId: null,
    rowSelection: {},
    onToggleRow: vi.fn(),
    onOpen: vi.fn(),
    onHover: vi.fn(),
    onAddLead: vi.fn(),
    ...overrides,
  };
  const utils = render(
    createElement(LanguageProvider, null, createElement(BusinessList, props)),
  );
  return { props, ...utils };
}

describe('BusinessList', () => {
  it('renders each result with a non-colour-only CRM status badge', async () => {
    renderList();
    expect(await screen.findByText('Alpha Cafe')).toBeInTheDocument();
    expect(screen.getByText('Beta Bakery')).toBeInTheDocument();
    // Status is conveyed by a text label (not colour alone).
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Already in CRM')).toBeInTheDocument();
  });

  it('opens a result when its card is clicked (map ↔ list selection)', async () => {
    const onOpen = vi.fn();
    renderList({ onOpen });
    fireEvent.click(await screen.findByText('Alpha Cafe'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe('r1');
  });

  it('reports hover for map syncing', async () => {
    const onHover = vi.fn();
    renderList({ onHover });
    const card = (await screen.findByText('Alpha Cafe')).closest('[role="row"]')!;
    fireEvent.mouseEnter(card);
    expect(onHover).toHaveBeenLastCalledWith('r1');
    fireEvent.mouseLeave(card);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it('toggles row selection via the checkbox', async () => {
    const onToggleRow = vi.fn();
    renderList({ onToggleRow });
    await screen.findByText('Alpha Cafe');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha Cafe' }));
    expect(onToggleRow).toHaveBeenCalledWith('r1');
  });

  it('adds a single lead from the card action', async () => {
    const onAddLead = vi.fn();
    renderList({ onAddLead });
    await screen.findByText('Alpha Cafe');
    const addButtons = screen.getAllByRole('button', { name: 'Add lead' });
    fireEvent.click(addButtons[0]);
    expect(onAddLead).toHaveBeenCalledTimes(1);
    expect(onAddLead.mock.calls[0][0].id).toBe('r1');
  });

  it('shows the empty state when there are no results', () => {
    renderList({ results: [], emptyVariant: 'noBusinesses' });
    expect(screen.getByText(/no businesses/i)).toBeInTheDocument();
  });
});
