import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/shared/hooks/use-drawer', () => ({ useDrawer: () => ({ selectedId: null, open: vi.fn(), close: vi.fn() }) }));
vi.mock('../hooks/use-inbound-calls', () => ({
  useInboundSettings: () => ({ data: { enabled: true } }),
  useInboundLive: () => ({ data: [] }),
  useInboundRealtime: () => {},
  useInboundStats: () => ({ data: undefined, isLoading: true }),
  useInboundList: () => ({ data: undefined, isLoading: true }),
  useInboundDevices: () => ({ data: undefined, isLoading: true }),
}));
vi.mock('../ui/overview-tab', () => ({ OverviewTab: () => <div>Overview content</div> }));
vi.mock('../ui/use-inbound-language', () => ({ useInboundLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));

import { IncomingCallsWorkspace, INBOUND_TABS } from '../ui/incoming-calls-workspace';

afterEach(cleanup);

describe('Incoming Calls workspace navigation', () => {
  it('renders every section with a valid icon, including Costs', () => {
    render(<IncomingCallsWorkspace />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(INBOUND_TABS.length);
    for (const tab of tabs) expect(tab.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Costs' })).toBeTruthy();
    expect(screen.getByText('Overview content')).toBeTruthy();
  });
});
