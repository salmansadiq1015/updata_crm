import type { ReactNode } from 'react';

/**
 * Phone numbers, e-mail addresses, web addresses, IDs and coordinates are
 * left-to-right data. Dropped into right-to-left text without isolation the
 * bidi algorithm reorders their neutral characters ("+41 44 100" turns into
 * "100 44 41+"), so they always get their own LTR run.
 */
export function LtrText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}
