import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CallingAgent } from '@/modules/aiCalling/types/ai-calling-types';
import { LeadAiCalling } from '../ui/lead-ai-calling';

const mocks = vi.hoisted(() => ({ listAll: vi.fn(), assign: vi.fn(), read: true, write: true }));
vi.mock('@/modules/aiCalling/services/calling-agent-api', () => ({ callingAgentApi: mocks }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({
  isAdmin: false, hasPermission: (key: string) => key === 'ai-calling:read' ? mocks.read : key === 'ai-calling:write' && mocks.write,
}) }));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn() }));

const makeAgent = (input: Partial<CallingAgent> = {}) => ({
  _id: 'agent-1', name: 'Sarah Sales', title: 'Qualification agent', availability: 'active', version: 7,
  assignedLeadIds: ['another-lead'], ...input,
} as CallingAgent);

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><LeadAiCalling leadId="lead-1" /></QueryClientProvider>);
}

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  HTMLElement.prototype.scrollIntoView ??= vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read = true; mocks.write = true;
  mocks.listAll.mockResolvedValue([makeAgent()]);
});

describe('lead AI agent assignment', () => {
  it('adds this lead without replacing existing assignments and shows the saved agent link', async () => {
    const user = userEvent.setup();
    mocks.assign.mockImplementation(async () => {
      const saved = makeAgent({ assignedLeadIds: ['another-lead', 'lead-1'], version: 8 });
      mocks.listAll.mockResolvedValue([saved]);
      return saved;
    });
    open();
    await user.click(await screen.findByRole('combobox', { name: 'Calling agent' }));
    await user.click(await screen.findByRole('option', { name: /Sarah Sales/ }));
    await user.click(screen.getByRole('button', { name: 'Assign agent' }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith('agent-1', ['lead-1'], 7, 'add'));
    expect(await screen.findByRole('link', { name: 'Open agent' })).toHaveAttribute('href', '/ai-calling?agent=agent-1');
    expect(screen.getByText('Sarah Sales')).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows every assigned agent, including archived agents, without offering a new assignment', async () => {
    mocks.listAll.mockResolvedValue([
      makeAgent({ assignedLeadIds: ['lead-1'] }),
      makeAgent({ _id: 'agent-2', name: 'Support agent', availability: 'archived', assignedLeadIds: ['lead-1'] }),
    ]);
    open();
    expect(await screen.findByText('Support agent')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Open agent' })).toHaveLength(2);
    expect(screen.getByText('archived')).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('lists draft and paused agents while disabling archived agents and full agents', async () => {
    mocks.listAll.mockResolvedValue([
      makeAgent({ availability: 'draft' }),
      makeAgent({ _id: 'paused', name: 'Paused agent', availability: 'paused' }),
      makeAgent({ _id: 'old', name: 'Archived agent', availability: 'archived' }),
      makeAgent({ _id: 'full', name: 'Full agent', assignedLeadIds: Array.from({ length: 500 }, (_, i) => `other-${i}`) }),
    ]);
    open();
    await userEvent.setup().click(await screen.findByRole('combobox', { name: 'Calling agent' }));
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('option', { name: /Sarah Sales/ })).not.toHaveAttribute('data-disabled');
    expect(screen.getByRole('option', { name: /Paused agent/ })).not.toHaveAttribute('data-disabled');
    expect(screen.getByRole('option', { name: /Archived agent/ })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('option', { name: /Full agent/ })).toHaveAttribute('data-disabled');
  });

  it('refreshes agents after a conflicting assignment and keeps the failure visible for retry', async () => {
    mocks.assign.mockRejectedValue(new Error('Agent changed. Reload before assigning leads'));
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('combobox', { name: 'Calling agent' }));
    await user.click(screen.getByRole('option', { name: /Sarah Sales/ }));
    await user.click(screen.getByRole('button', { name: 'Assign agent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Assignment could not be saved');
    await waitFor(() => expect(mocks.listAll).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('link', { name: 'Open agent' })).not.toBeInTheDocument();
  });

  it('does not request agents without read access', async () => {
    mocks.read = false;
    open();
    expect(screen.getByText('You do not have access to calling agents.')).toBeVisible();
    expect(mocks.listAll).not.toHaveBeenCalled();
  });

  it('shows assignments to readers but prevents changes without write access', async () => {
    mocks.write = false;
    open();
    expect(await screen.findByRole('combobox', { name: 'Calling agent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Assign agent' })).toBeDisabled();
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('offers agent management when no agents exist and retries loading failures', async () => {
    mocks.listAll.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue([]);
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Calling agents could not be loaded');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'Manage calling agents' })).toHaveAttribute('href', '/ai-calling');
  });
});
