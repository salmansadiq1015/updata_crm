'use client';

import { useRecoveryCounts } from '../hooks/use-sms-ops';

/** Open recovery items, as a small counter on the sidebar icon. Hidden at 0 or on error. */
export function SmsRecoveryNavBadge() {
  const { data } = useRecoveryCounts();
  const open = data?.open ?? 0;
  if (!open) return null;
  return (
    <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white" aria-label={`${open}`}>
      {open > 99 ? '99+' : open}
    </span>
  );
}
