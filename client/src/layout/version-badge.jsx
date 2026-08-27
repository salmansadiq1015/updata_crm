'use client';

import { useEffect, useState } from 'react';

/**
 * Which version of the application you are looking at.
 *
 * Small, grey, and at the very bottom — it is not something to read, it is
 * something to check when a bug report and the code disagree. The question it
 * answers is the one nobody can answer from a screenshot: is this the build
 * with the fix in it?
 *
 * The values are baked in when the bundle is built (see next.config.mjs), so
 * they describe the running application rather than the machine reading it.
 * A build is what makes a version: two deployments of the same commit are two
 * different things on a server, which is why the time shown is the build's.
 *
 * On a developer's machine that is not enough, because there the commit moves
 * and the build does not. So in development — and only there — the badge asks
 * /dev-version what git says now, and shows that instead.
 */
const BUILD = {
  commit: process.env.NEXT_PUBLIC_GIT_COMMIT || 'unknown',
  branch: process.env.NEXT_PUBLIC_GIT_BRANCH || '',
  committedAt: process.env.NEXT_PUBLIC_GIT_COMMITTED_AT || '',
  builtAt: process.env.NEXT_PUBLIC_BUILT_AT || '',
  // A working tree with uncommitted changes is not the commit it names.
  dirty: process.env.NEXT_PUBLIC_GIT_DIRTY === '1',
};

const IS_DEV = process.env.NODE_ENV !== 'production';

function swiss(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('de-CH', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function VersionBadge({ collapsed = false }) {
  const [version, setVersion] = useState(BUILD);

  useEffect(() => {
    if (!IS_DEV) return undefined;
    let current = true;
    // A failure here is not worth a word to the reader: the baked-in values
    // are already on screen and they are only slightly out of date.
    fetch('/dev-version')
      .then((response) => (response.ok ? response.json() : null))
      .then((live) => { if (current && live) setVersion(live); })
      .catch(() => {});
    return () => { current = false; };
  }, []);

  const stamp = swiss(version.builtAt);
  const short = `${version.commit}${version.dirty ? '+' : ''}`;

  // Everything a bug report needs, without taking a second line on screen.
  const detail = [
    `Commit ${version.commit}${version.dirty ? ' (mit nicht committeten Änderungen)' : ''}`,
    version.branch ? `Branch ${version.branch}` : null,
    version.committedAt ? `Committet ${swiss(version.committedAt)}` : null,
    stamp ? `${IS_DEV ? 'Gelesen' : 'Gebaut'} ${stamp}` : null,
  ].filter(Boolean).join('\n');

  return (
    <p
      title={detail}
      className="select-all text-center font-mono text-[9px] leading-4 text-sidebar-foreground/25"
    >
      {collapsed ? short : `${stamp || '—'} · ${short}`}
    </p>
  );
}
