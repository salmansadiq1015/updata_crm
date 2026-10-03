'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emailService } from '@/modules/doctpl/services/EmailService';
import { leadKeys } from '../hooks/use-leads';
import { leadApi } from '../services/lead-api';
import type { Lead } from '../types/lead-types';
import { toMailtoHref, toWhatsAppHref } from './lead-ui-utils';

export type BulkLeadResult = {
  succeeded: string[];
  failed: Array<{ id: string; error: unknown }>;
};

/** How many requests may be in flight at once (a page can hold up to 100 leads). */
const BULK_CONCURRENCY = 5;

/**
 * Runs `task` for every id with bounded concurrency and never rejects: the
 * caller gets exactly which ids went through and which did not, so a half
 * failed bulk action can be reported truthfully instead of as all-or-nothing.
 */
async function runBulk(ids: string[], task: (id: string) => Promise<unknown>): Promise<BulkLeadResult> {
  const result: BulkLeadResult = { succeeded: [], failed: [] };
  const queue = [...ids];

  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        await task(id);
        result.succeeded.push(id);
      } catch (error) {
        result.failed.push({ id, error });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, ids.length) }, worker));
  return result;
}

// ── Eligibility buckets ───────────────────────────────────────────────────────
//
// Pure helpers so the bulk dialogs can show honest "who will actually be
// contacted" counts *before* anyone presses send. They reuse the same link
// builders the single-lead actions trust (`toMailtoHref` / `toWhatsAppHref`),
// so eligibility here matches eligibility there.

export type LeadEmailBuckets = {
  /** Has a syntactically valid e-mail address — these get sent. */
  valid: Lead[];
  /** No e-mail address at all. */
  missingEmail: Lead[];
  /** Has something in the e-mail field, but it is not a valid address. */
  invalid: Lead[];
};

export function bucketLeadsByEmail(leads: Lead[]): LeadEmailBuckets {
  const valid: Lead[] = [];
  const missingEmail: Lead[] = [];
  const invalid: Lead[] = [];
  for (const lead of leads) {
    const email = lead.email?.trim() ?? '';
    if (!email) missingEmail.push(lead);
    else if (toMailtoHref(email)) valid.push(lead);
    else invalid.push(lead);
  }
  return { valid, missingEmail, invalid };
}

/** The best phone for a WhatsApp deep link (prefer the normalized E.164-ish value). */
export function whatsAppPhoneFor(lead: Lead): string | null {
  return lead.normalizedPhone ?? lead.phone ?? lead.mobile ?? null;
}

export type LeadWhatsAppBuckets = {
  /** Produces a usable `wa.me` link — these can be opened. */
  eligible: Lead[];
  /** No number we can turn into a WhatsApp deep link. */
  missingPhone: Lead[];
};

export function bucketLeadsByWhatsApp(leads: Lead[]): LeadWhatsAppBuckets {
  const eligible: Lead[] = [];
  const missingPhone: Lead[] = [];
  for (const lead of leads) {
    if (toWhatsAppHref(whatsAppPhoneFor(lead))) eligible.push(lead);
    else missingPhone.push(lead);
  }
  return { eligible, missingPhone };
}

// ── Bulk email ────────────────────────────────────────────────────────────────

/** Builds the final `{subject, bodyHtml}` for one lead (template render or typed + resolved). */
export type ResolveLeadEmail = (lead: Lead) => Promise<{ subject: string; bodyHtml: string }>;

export type BulkEmailInput = {
  /** Only the eligible leads — the caller filters with `bucketLeadsByEmail` first. */
  leads: Lead[];
  resolveEmail: ResolveLeadEmail;
};

/**
 * Bulk delete / assign / email for the selection bar.
 *
 * These deliberately go through `leadApi` / `emailService` instead of calling the
 * single-row hooks once per lead: those hooks toast on every call, so a bulk
 * action over 20 rows would raise 20 toasts. Here the caller shows one summary,
 * and the lists are refreshed once at the end.
 */
export function useLeadBulkActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: leadKeys.root });

  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => runBulk(ids, (id) => leadApi.deleteLead(id)),
    onSettled: refresh,
  });

  const bulkAssign = useMutation({
    mutationFn: ({ ids, assignedTo }: { ids: string[]; assignedTo: string | null }) =>
      runBulk(ids, (id) => leadApi.updateLead(id, { assignedTo })),
    onSettled: refresh,
  });

  /**
   * Fan a (personalised) e-mail out to every eligible lead. Each send goes
   * through `emailService.send`, which records a tracked EmailRecord and queues
   * the real delivery — so this reuses the one send path, it does not add a new
   * one. The result reports exactly which leads were queued and which failed.
   */
  const bulkEmail = useMutation({
    mutationFn: ({ leads, resolveEmail }: BulkEmailInput) =>
      runBulk(
        leads.map((lead) => lead.id),
        async (id) => {
          const lead = leads.find((item) => item.id === id);
          const to = lead?.email?.trim();
          if (!lead || !to) throw new Error('missing-email');
          const { subject, bodyHtml } = await resolveEmail(lead);
          // `to` is an array of addresses per the server contract
          // (sendEmailSchema: `to: array().items(string.email()).min(1)`).
          await emailService.send({
            to: [to],
            subject,
            bodyHtml,
            sourceModule: 'lead',
            sourceRecordId: lead.id,
          });
        },
      ),
    onSettled: refresh,
  });

  return { bulkDelete, bulkAssign, bulkEmail };
}
