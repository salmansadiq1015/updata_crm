'use client';

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { emailService } from '@/modules/doctpl/services/EmailService';
import { leadKeys } from '../hooks/use-leads';
import { leadApi } from '../services/lead-api';
import type { Lead, LeadPage } from '../types/lead-types';
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

/**
 * Remove deleted leads from the cached list pages in place and decrement the
 * total, so the UI updates instantly after a bulk delete WITHOUT a list refetch
 * (the whole point: one request, no N refetches). Safe no-op when the ids are
 * not in cache.
 */
function removeLeadsFromListCache(queryClient: QueryClient, ids: string[]): void {
  if (!ids.length) return;
  const deleted = new Set(ids);
  queryClient.setQueriesData<InfiniteData<LeadPage>>({ queryKey: leadKeys.lists() }, (old) => {
    if (!old) return old;
    let removed = 0;
    const pages = old.pages.map((page) => {
      const kept = page.data.filter((lead) => {
        if (!deleted.has(lead.id)) return true;
        removed += 1;
        return false;
      });
      return kept.length === page.data.length ? page : { ...page, data: kept };
    });
    if (removed === 0) return old;
    // total is the same across pages; decrement each that carries it.
    const withTotals = pages.map((page) => (
      typeof page.pagination.total === 'number'
        ? { ...page, pagination: { ...page.pagination, total: Math.max(0, page.pagination.total - removed) } }
        : page
    ));
    return { ...old, pages: withTotals };
  });
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

  // ONE request for the whole selection (not one DELETE per id). Never rejects —
  // it maps the single-request result onto the shared {succeeded, failed} shape
  // so the caller reports an honest summary (ids the server could not delete stay
  // selected for review). On success the list cache is updated in place; only the
  // map view is invalidated (and that refetches only if it is currently mounted).
  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]): Promise<BulkLeadResult> => {
      try {
        const res = await leadApi.bulkDeleteLeads(ids);
        const deleted = new Set(res.deletedIds);
        return {
          succeeded: ids.filter((id) => deleted.has(id)),
          failed: ids
            .filter((id) => !deleted.has(id))
            .map((id) => ({ id, error: new Error('not-deleted') })),
        };
      } catch (error) {
        return { succeeded: [], failed: ids.map((id) => ({ id, error })) };
      }
    },
    onSuccess: (result) => {
      removeLeadsFromListCache(queryClient, result.succeeded);
      if (result.succeeded.length) {
        void queryClient.invalidateQueries({ queryKey: leadKeys.maps() });
      }
    },
  });

  // ONE request for the whole selection (not one PATCH per id). Never rejects —
  // maps the single-request result onto the shared {succeeded, failed} shape.
  // The list is refreshed once so the (populated) assignee comes back.
  const bulkAssign = useMutation({
    mutationFn: async ({ ids, assignedTo }: { ids: string[]; assignedTo: string | null }): Promise<BulkLeadResult> => {
      try {
        const res = await leadApi.bulkAssignLeads(ids, assignedTo);
        const updated = new Set(res.updatedIds);
        return {
          succeeded: ids.filter((id) => updated.has(id)),
          failed: ids
            .filter((id) => !updated.has(id))
            .map((id) => ({ id, error: new Error('not-updated') })),
        };
      } catch (error) {
        return { succeeded: [], failed: ids.map((id) => ({ id, error })) };
      }
    },
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
