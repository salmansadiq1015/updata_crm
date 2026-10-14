import { describe, expect, it } from 'vitest';
import { providerOperationalState } from '../components/provider-settings';

describe('provider settings presentation', () => {
  it('distinguishes missing configuration from an outage', () => {
    expect(providerOperationalState(undefined, false)).toEqual({ label: 'Not configured', tone: 'warning' });
    expect(providerOperationalState({ configured: true, reachable: false, eligible: false }, true)).toEqual({ label: 'Offline', tone: 'danger' });
  });

  it('does not describe an eligible but disabled provider as active', () => {
    const provider = { configured: true, reachable: true, eligible: true };
    expect(providerOperationalState(provider, false)).toEqual({ label: 'Ready', tone: 'neutral' });
    expect(providerOperationalState(provider, true)).toEqual({ label: 'Active', tone: 'success' });
  });

  it('surfaces a reachable provider that is not eligible', () => {
    expect(providerOperationalState({ configured: true, reachable: true, eligible: false }, true)).toEqual({ label: 'Unavailable', tone: 'warning' });
  });
});
