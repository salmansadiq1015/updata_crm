# Accounting Phase 1 Production Foundation Design

## Problem Breakdown

The Accounting module has a working SME-grade operational core, but the enterprise audit identified gaps that block a production-grade financial management claim:

- Dashboard KPIs are assembled from several client queries instead of one backend snapshot.
- Financial reports only expose profit and loss.
- There is no fiscal-period model or locked-period posting guard.
- Some AP invoice payload and money calculations still live in UI components.
- Full enterprise completion also depends on later external gates: bank certification, OCR benchmarks, SMTP acceptance, mobile scanner validation, object-storage SLA, multi-company, FX, assets, budgeting, and consolidation.

Phase 1 builds the local production foundation only. It does not claim external certification.

## Architecture Decision

Keep the existing feature-based accounting module. Add focused backend services and thin client integrations:

- `dashboard.service/controller/routes`: one authoritative management snapshot from AR, AP, bank, cash, and report aggregates.
- Extended `reports.service/controller/routes`: balance sheet, trial balance, cash-flow statement, and general-ledger report APIs.
- `fiscalPeriod.model/repository/service/controller/routes`: fiscal period lifecycle and locked-period posting guard.
- Posting guard integration in accounting write paths that create or mutate financial postings: manual journal, journal reversal, AR payment, AR allocation, AR write-off, AP invoice create/update/approve/payment batch export, reconciliation, categorization, netting, and manual cash/bank balance actions where applicable.
- Client service/query additions for new APIs; pages render server state and trigger hooks only.
- Move AP line payload and preview calculation into `client/src/modules/accounting/utils` so UI components do not own business logic.

## Data Model

### FiscalPeriod

Fields:

- `name`
- `startDate`
- `endDate`
- `status`: `OPEN`, `CLOSED`, `ARCHIVED`
- `closedAt`, `closedBy`
- `reopenedAt`, `reopenedBy`
- `closeReason`, `reopenReason`
- timestamps

Rules:

- Periods cannot overlap.
- Posting dates require an open period if any period exists for that date.
- Closed or archived periods reject postings with code `ACCT_PERIOD_CLOSED`.
- Reopen requires a meaningful reason.

## API Design

New endpoints:

- `GET /api/v1/accounting/dashboard`
- `GET /api/v1/accounting/reports/balance-sheet`
- `GET /api/v1/accounting/reports/trial-balance`
- `GET /api/v1/accounting/reports/cash-flow`
- `GET /api/v1/accounting/reports/general-ledger`
- `GET /api/v1/accounting/fiscal-periods`
- `POST /api/v1/accounting/fiscal-periods`
- `POST /api/v1/accounting/fiscal-periods/:id/close`
- `POST /api/v1/accounting/fiscal-periods/:id/reopen`

All report/dashboard endpoints accept date range and currency. Company/branch parameters are reserved in the contract but ignored until the multi-company model exists; responses must state `scope.company = null` and `scope.branch = null`.

## UI Design

Accounting dashboard:

- Replace multi-query KPI assembly with `useAccountingDashboard`.
- Keep existing cards but source all values from one backend response.
- Show snapshot freshness and unavailable KPI markers instead of silently omitting enterprise KPIs.

Reports page:

- Add report tabs for P&L, balance sheet, trial balance, cash flow, and general ledger.
- Keep CSV export for supported reports.
- Use loading, empty, and error states already used by accounting pages.

Payables page:

- Move AP payload construction and line total preview into accounting utilities.
- UI keeps form state only.

Fiscal periods:

- Add backend first and tests first.
- UI management can follow after server guard is proven; initial Phase 1 acceptance is API and posting-guard coverage.

## Error Handling

- Use existing `AppError`, `ConflictError`, `ValidationError`, and `ERROR_CODES`.
- Closed-period posting failures return a deterministic error code.
- Report endpoints return empty rows with totals of zero for empty ledgers, not 500.
- Dashboard response includes `warnings` for KPIs that cannot be computed from current local models, such as payroll liabilities and tax liabilities.

## Performance

- Dashboard endpoint must aggregate server-side in one request and avoid full collection reads.
- Reports use Mongo aggregation over journal entries and account metadata.
- General ledger report stays cursor-paginated.
- Client list/report views remain paginated; virtualization is a later UI performance phase for dense interactive drilldowns.

## Validation Plan

Server tests:

- Dashboard snapshot maps AR, AP, bank, cash, P&L, and aging data.
- Balance sheet groups asset/liability/equity accounts with debit/credit-normal balances.
- Trial balance totals debits and credits and exposes imbalance.
- Cash-flow report derives operating/investing/financing buckets from available account types with unknown buckets explicit.
- Fiscal-period close rejects postings in closed periods.
- Open periods allow existing accounting write flows.

Client tests:

- Accounting service exposes dashboard and new report calls.
- AP payload utility normalizes and rounds line payloads outside UI components.
- Dashboard hook uses a single dashboard query.

Manual verification:

- Focused server accounting unit suite.
- Focused client accounting tests.
- Targeted lint for touched server/client files.

## Non-Goals For Phase 1

- Native EBICS/open-banking certification.
- OCR accuracy benchmarks.
- SMTP acceptance testing.
- Multi-company/branch ledgers.
- Full FX lifecycle and revaluation.
- Fixed assets, budgets, recurring transactions, intercompany, consolidation.
- Production seeded load tests.
