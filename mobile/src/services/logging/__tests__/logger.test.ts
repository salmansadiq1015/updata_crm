import { redact } from '../logger';

describe('redact', () => {
  it('removes credentials and contact data at any depth', () => {
    expect(
      redact({
        url: '/crm/leads',
        headers: { Authorization: 'Bearer abc' },
        body: { email: 'a@b.c', password: 'pw', nested: { refreshToken: 'r', phone: '+41', name: 'Acme' } },
      }),
    ).toEqual({
      url: '/crm/leads',
      headers: { Authorization: '[redacted]' },
      body: {
        email: '[redacted]',
        password: '[redacted]',
        nested: { refreshToken: '[redacted]', phone: '[redacted]', name: 'Acme' },
      },
    });
  });

  it('reduces errors to name and message (no stacks)', () => {
    expect(redact(new TypeError('boom'))).toEqual({ name: 'TypeError', message: 'boom' });
  });
});
