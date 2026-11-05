import { getStateFromPath } from '@react-navigation/native';

import { linking } from '../linking';

const resolve = (path: string) => getStateFromPath(path, linking.config)?.routes.at(-1);

describe('deep links', () => {
  it('maps lead links to the lead screen', () => {
    expect(resolve('leads/64b7f0c2a1b2c3d4e5f60718')).toMatchObject({
      name: 'LeadDetail',
      params: { leadId: '64b7f0c2a1b2c3d4e5f60718' },
    });
  });

  it('carries the reset token from a password-reset link', () => {
    expect(resolve('reset-password?token=abc123')).toMatchObject({
      name: 'ResetPassword',
      params: { token: 'abc123' },
    });
  });

  it('maps tab links into the main navigator', () => {
    expect(resolve('notifications')).toMatchObject({
      name: 'Main',
      state: { routes: [{ name: 'Notifications' }] },
    });
  });

  it('maps the Call Agent tab and its settings', () => {
    expect(resolve('call-agent')).toMatchObject({
      name: 'Main',
      state: { routes: [{ name: 'CallAgent' }] },
    });
    expect(resolve('call-agent/settings')).toMatchObject({ name: 'CallAgentSettings' });
  });

  it('maps incoming-call links', () => {
    expect(resolve('incoming-calls')).toMatchObject({ name: 'IncomingCalls' });
    expect(resolve('incoming-calls/6721a0f4c2b1d3e4f5a6b7c8')).toMatchObject({
      name: 'IncomingCallDetail',
      params: { id: '6721a0f4c2b1d3e4f5a6b7c8' },
    });
  });
});
