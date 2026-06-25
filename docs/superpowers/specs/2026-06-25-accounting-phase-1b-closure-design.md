# Accounting Phase 1B Closure Design

## Problem Breakdown

Phase 1 added the backend foundation for dashboard snapshots, fiscal periods, extended reports, posting guards, and AP payload extraction. Two local gaps remain before broader accounting expansion starts:

- The backend general-ledger report API and client hook exist, but the reports page does not expose the general-ledger tab or cursor controls.
- The journal page still lacks user-facing cursor pagination and export action wiring, even though the backend journal list/export API exists.
- The enterprise audit identified money precision as a critical blocker. Full minor-unit/decimal migration is too risky to bundle into UI closure, but the migration strategy needs to be written before FX, tax, and consolidation work starts.

This slice closes the Phase 1 usability and planning gap. It does not add FX, tax, scheduled reports, global search, supplier master, or bank-certification work.

## Architecture Decision

Keep the new Phase 1 backend APIs as the source of truth. Phase 1B is mostly client integration plus a written migration plan:

- Reports page consumes existing `useGeneralLedger` and `reportsService.generalLedger` through React Query.
- Journal page continues to use `useJournalEntries` and `journalService.export`; UI only manages cursor stack, filters, and download intent.
- Permission enforcement remains server-side through existing route permissions. The client may show export actions, but the server remains authoritative.
- Money precision work is captured as a migration design document section, not implemented in this slice, because changing persisted amount semantics touches every accounting model, report, import, export, and reconciliation workflow.

## Functional Scope

### General Ledger Report UI

Add a `General Ledger` tab to `/accounting/reports`:

- Date range filters use `startDate` and `endDate`.
- Optional filters use currently supported API fields: `accountId`, `referenceType`, cursor, and currency.
- Results render entry date, entry number, description, debit account, credit account, amount, currency, and reference type.
- Cursor pagination mirrors the pattern used in accounting list pages.
- Empty and loading states match the current reports page style.

### Journal Pagination And Export UX

Improve `/accounting/journal`:

- Add previous/next cursor controls based on the existing `pagination` response.
- Keep filter resets deterministic when date/account/reference filters change.
- Add export button that calls `journalService.export` with date range parameters and downloads CSV.
- If the server rejects export permissions, surface the existing API error through the app's error handling rather than bypassing permission checks client-side.

### Money Precision Migration Plan

Extend the accounting documentation with a concrete migration strategy:

- Current state: amounts use JavaScript `Number` across accounting documents, journal, AR, AP, bank, cash, reports, and QOP invoice integration.
- Target state: introduce `amountMinor` and `currency` pairs for persisted monetary values, using integer minor units for CHF/EUR and a shared money utility for rounding and display.
- Migration order: add dual-write fields, backfill from current values, update read paths, update write paths, verify report parity, then remove legacy reads later.
- Non-goal: implement this migration in Phase 1B.

## Data Flow

General ledger:

1. User selects the `General Ledger` tab and filters.
2. Page calls `useGeneralLedger(params)`.
3. Hook calls `GET /api/v1/accounting/reports/general-ledger`.
4. Backend returns paginated journal rows and report metadata.
5. Page renders rows and cursor controls.

Journal export:

1. User chooses start and end dates.
2. Page calls `journalService.export({ startDate, endDate })`.
3. Backend checks `accounting:journal:export`.
4. Client downloads returned CSV when allowed.

## Error Handling

- General ledger failures render a local error state in the report panel.
- Empty ledgers show an empty state, not a broken table.
- Journal export uses the shared API error path; no silent failures.
- Date filters must not submit invalid ranges.

## Performance

- General ledger remains cursor-paginated and does not render unbounded rows.
- Journal page retains existing server pagination and only stores cursor history client-side.
- No virtualization is required in this slice because all displayed lists remain page-limited. Virtualized finance tables remain a later dense-drilldown task.

## Validation Plan

Server:

- Existing focused accounting report and journal tests continue to pass.
- No backend behavior change is expected unless a small compatibility fix is found during implementation.

Client:

- Extend accounting service tests if any endpoint contract changes.
- Add or update focused component/hook tests only where practical with existing test harness.
- Run focused accounting client tests.
- Run client production build because this slice touches route pages.

Manual checks:

- Reports page includes the general-ledger tab.
- General-ledger pagination works with cursor state.
- Journal page pagination controls work.
- Journal export sends date range and handles response download.

## Non-Goals

- FX rate table, revaluation, realized/unrealized gains.
- Tax codes, tax summary, VAT filing, withholding.
- Scheduled report delivery, PDF/Excel report exports.
- Global financial search.
- Supplier master workflow.
- Native EBICS/open-banking certification.
- Implementing the money precision migration itself.
