'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { isMaskedValue } from '../services/governance-api';
import { useGovernanceSettings, useRevealContact } from '../hooks/use-governance';
import type { RevealField, RevealPurpose } from '../types/governance-types';

interface LeadContact { id: string; phone?: string | null; mobile?: string | null; email?: string | null }

const FIELDS: RevealField[] = ['phone', 'mobile', 'email'];

/**
 * Shown on a lead whose contact values arrived masked (PII_MASKING_ENABLED and
 * the viewer lacks lead:pii:view). Viewers with the permission reveal for
 * viewing; everyone else can reveal one number for an explicit call — both are
 * audited server-side. Nothing renders when nothing is masked.
 */
export function LeadPiiReveal({ lead }: { lead: LeadContact }) {
  const { t } = useLanguage();
  const masked = FIELDS.filter((field) => isMaskedValue(lead[field] ?? null));
  // Only ask the server about this viewer's rights when something is actually masked.
  const settings = useGovernanceSettings(masked.length > 0);
  const reveal = useRevealContact();
  const [values, setValues] = useState<Partial<Record<RevealField, string | null>> | null>(null);
  if (!masked.length) return null;

  const run = async (purpose: RevealPurpose) => {
    const fields = purpose === 'call' ? masked.filter((f) => f !== 'email') : masked;
    if (!fields.length) return;
    const result = await reveal.mutateAsync({ leadId: lead.id, purpose, fields });
    setValues(result.values);
    if (purpose === 'call') {
      const number = result.values.mobile || result.values.phone;
      if (number) window.location.assign(`tel:${number.replace(/[^\d+]/g, '')}`);
    }
  };

  const canView = settings.data?.canViewPii;
  const hasNumber = masked.some((f) => f !== 'email');

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3" data-testid="lead-pii-reveal">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden />
        {t('governance.pii.maskedNotice', 'Contact details are masked. Revealing them is recorded in the access log.')}
      </p>
      {values ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {FIELDS.filter((f) => values[f]).map((field) => (
            <div key={field} className="contents">
              <dt className="text-muted-foreground">{t(`governance.pii.field.${field}`, field)}</dt>
              <dd dir="ltr" className="font-mono text-foreground">{values[field]}</dd>
            </div>
          ))}
          <div className="col-span-2 pt-1">
            <Button type="button" variant="ghost" size="xs" onClick={() => setValues(null)}>
              <EyeOff aria-hidden />{t('governance.pii.hide', 'Hide again')}
            </Button>
          </div>
        </dl>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canView && (
            <Button type="button" variant="outline" size="xs" disabled={reveal.isPending} onClick={() => void run('view')}>
              {reveal.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
              {t('governance.pii.reveal', 'Reveal contact details')}
            </Button>
          )}
          {hasNumber && (
            <Button type="button" variant="outline" size="xs" disabled={reveal.isPending} onClick={() => void run('call')}>
              <Phone aria-hidden />{t('governance.pii.revealToCall', 'Reveal number to call')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default LeadPiiReveal;
