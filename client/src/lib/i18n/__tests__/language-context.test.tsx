import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '../language-context';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider initialLocale="en">{children}</LanguageProvider>
);

describe('LanguageProvider translation arguments', () => {
  it('supports variables as the second argument', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });

    expect(result.current.t('platform.latency', { value: 42 })).toBe('42 ms latency');
  });

  it('preserves fallback plus third-argument interpolation', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });

    expect(result.current.t('missing.test.key', 'Hello {name}', { name: 'Ada' }))
      .toBe('Hello Ada');
  });

  it('preserves authored French while translating an English fallback only once', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    act(() => result.current.setLocale('fr'));
    expect(result.current.t('experience.faq.q1')).toBe('Comment obtenir un accès ?');
    expect(result.current.t('missing.comment.label', 'Comment')).toBe('Commentaire');
  });
});
