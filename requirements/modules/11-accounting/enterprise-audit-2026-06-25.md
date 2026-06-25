# Accounting Module Enterprise Audit - 2026-06-25

## 1. Problem Breakdown

The requested target is broader than the original Module 11 scope. The current module is a strong local SME accounting core, but it is not yet an enterprise accounting platform comparable to SAP Business One, NetSuite, Dynamics, Odoo, Xero, or QuickBooks across all required dimensions.

What exists locally:

- Chart of accounts, account mappings, journal entries, reversals, account overviews, and CSV exports.
- AR receivables, payments, allocation, write-off, dunning output, customer credit exposure, and aging.
- AP invoices, split allocations, approval and second approval, payables aging, payment batches, and pain.001 export.
- Bank accounts, camt.053/camt.054 import, pain.001 export, pain.002 import, gateway-folder retrieval, and reconciliation.
- Cash balances, 90-day forecast, open-item statements, document archive, OCR workflow, and mobile accounting scan upload.
- React Query based client service/hooks and route pages for accounting workspaces.

Constraints:

- Backend is feature-based under `server/src/modules/accounting`.
- Client accounting state is already layered through `client/src/modules/accounting/services` and `hooks`.
- AR invoice creation and lifecycle are primarily in QOP and feed accounting through receivables/journal/document integrations.
- External completeness cannot be proven locally for bank certification, SMTP delivery, OCR accuracy, scanner/camera hardware, object-storage SLA, or production-size data.
- Current worktree has unrelated user changes in `client/public/sw.js` and `client/src/modules/crm/components/customer-form.jsx`; this audit does not touch them.

What can break:

- Ledger integrity if amount storage, journal immutability, or posting flows are changed without migration and transactional guards.
- Management trust if dashboard KPIs are assembled from stale client-side queries or mixed currencies.
- Compliance if fiscal-period locks, approvals, and audit evidence are added as UI-only rules.
- Reconciliation accuracy if bank imports overwrite AR/AP state instead of applying atomic deltas.

## 2. Architecture Decision

Recommended direction: keep the existing accounting module and add enterprise foundations around it. Replacing the module would risk breaking working AR/AP/bank workflows.

Production-grade architecture should be staged as:

1. A backend accounting snapshot/query layer for dashboard and management KPIs.
2. Fiscal-period and posting-control services before more automation.
3. A money/FX model before full multi-currency, consolidation, tax, and enterprise reporting.
4. Company and branch dimensions before exposing company/branch filters.
5. Thin UI pages backed by domain utilities/hooks and server-authoritative calculations.

Impact:

- Existing operational workflows remain stable.
- Enterprise work becomes additive and migration-aware.
- The UI can be upgraded without embedding accounting rules in components.

## 3. Current State Audit

| Area | Status | Evidence / gap |
| --- | --- | --- |
| Architecture | Partially implemented | Server has feature modules and route aggregation under `/api/v1/accounting`; client has service/query/mutation boundaries. Some pages still contain payload-building and calculations. |
| Dashboard | Partially implemented | Shows open AR, overdue AR, AP, bank balance, 30-day cash, YTD profit, and AR/AP aging. Missing one authoritative backend dashboard endpoint, EBITDA, gross profit, monthly revenue/expenses, burn rate, tax/payroll liabilities, widget customization, company/branch/currency filters. |
| General ledger | Partially implemented | Accounts, journal, reversals, account overview, exports, and immutability guards exist. Missing fiscal periods, close/reopen, locked-period posting guard, and manual journal approval workflow. |
| AR | Mostly implemented locally | Receivables, payments, allocations, write-off, dunning, customer credit, aging, and QOP invoice integration exist. External SMTP/print/template signoff remains. |
| AP | Mostly implemented locally | Supplier invoices, split allocations, approval, second approval, payment-batch reservation, aging, and pain.001 export exist. Supplier master UX and target-bank acceptance remain gaps. |
| Banking | Partially implemented | camt.053/camt.054, pain.001, pain.002, manual imports, and gateway-folder retrieval exist. Native EBICS/open-banking certification is not proven. |
| Reconciliation | Mostly implemented locally | AR/AP reconciliation uses transactional posting and learning rules. Real transaction-set auto-match benchmarks are still missing. |
| Cash flow | Partially implemented | Bank balances and 90-day aggregate forecast exist. Forecast lacks exact source-row drilldown, tax/payroll obligations, recurring commitments, and scenario persistence. |
| Reporting | Partially implemented | Profit and loss exists. Missing balance sheet, trial balance, cash-flow statement, general ledger report family, tax summary, scheduled reports, PDF export, and Excel export. |
| Search/filtering | Partially implemented | List-level search exists. No unified financial search across invoices, customers, vendors, bank transactions, journal entries, accounts, dates, and amounts. |
| Multi-currency | Partially implemented | CHF/EUR fields exist. Missing base/document currency split, exchange-rate table, historical rates, realized/unrealized gain/loss, and revaluation. |
| Tax | Partially implemented | Swiss VAT rates appear in invoice flows. Missing tax codes/groups/exemptions, withholding tax, GST handling, tax liability dashboard, and tax return workflow. |
| Security/RBAC | Mostly implemented locally | Granular accounting permissions are defined and tested. Export-specific UX gates, SoD policies, and auditor workspace are not complete. |
| Audit trail | Partially implemented | Financial actions call audit logging. Missing complete before/after change snapshots and a consolidated audit evidence workspace. |
| Performance | Partially implemented | Cursor pagination, Mongo aggregations, indexes, and large-read tests exist. Client tables are paginated but not virtualized; dashboard is multiple client queries instead of one snapshot endpoint. |
| Multi-company/branch | Missing | No first-class `companyId` or `branchId` accounting dimension was found in accounting models/services. |
| Advanced accounting | Missing | Fixed assets, depreciation, asset disposal, budgets, budget-vs-actual, intercompany, consolidation, recurring journals/bills/invoices are not implemented. |

## 4. Gap Analysis Against ERP Standards

The module is stronger than a prototype and usable as a Swiss SME operational accounting slice after external validation. It is not enterprise-grade yet.

Main benchmark gaps:

- SAP/NetSuite/Dynamics level dimensional accounting requires company, branch, cost center, period, currency, tax, and consolidation dimensions as first-class data, not filters bolted onto pages.
- Xero/QuickBooks style management visibility requires one reliable financial overview endpoint with KPI freshness, drilldowns, and consistent currency basis.
- Odoo-style workflow breadth requires recurring entries, approvals, budget, asset, and tax modules.
- Enterprise audit readiness requires fiscal close, immutable evidence exports, segregation-of-duties policy checks, and locked-period controls.

## 5. Missing Features Matrix

| Module | Feature | Priority | Complexity | Status |
| --- | --- | --- | --- | --- |
| Dashboard | Single backend financial overview endpoint with freshness metadata | Critical | Medium | Missing |
| Dashboard | EBITDA, gross profit, revenue/expense trend, burn, tax/payroll liabilities | Critical | Medium | Missing |
| Dashboard | Date/company/branch/currency filters with drilldowns | Critical | High | Missing |
| Ledger | Fiscal periods, close/reopen, locked-period posting guard | Critical | High | Missing |
| Ledger | Manual journal approval workflow | Critical | Medium | Missing |
| Reports | Balance sheet, trial balance, cash-flow statement, GL report | Critical | High | Missing |
| Money | Decimal/minor-unit strategy and migration | Critical | High | Missing |
| Multi-currency | FX rates, historical rates, gains/losses, revaluation | Critical | High | Missing |
| Multi-company | Company/branch ledgers and scoped permissions | Critical | High | Missing |
| Tax | Tax code/groups/exemptions/withholding/liability reporting | Important | High | Missing |
| Banking | Certified EBICS/open-banking connector | Important | High | External gate |
| UX | Virtualized large finance tables and saved filters | Important | Medium | Partial |
| Search | Unified global financial search | Important | Medium | Missing |
| Automation | Recurring invoices, bills, and journals | Important | Medium | Missing |
| Assets | Fixed assets, depreciation, and disposal | Important | High | Missing |
| Planning | Budget planning and budget-vs-actual | Important | High | Missing |
| Enterprise | Intercompany journals, eliminations, consolidation | Enterprise | Very high | Missing |

## 6. Database Review

Implemented model families:

- `Account`
- `AccountMapping`
- `JournalEntry`
- `ArPayment`
- `ArPaymentAllocation`
- `ApInvoice`
- `PaymentBatch`
- `BankAccount`
- `BankTransaction`
- `ReconciliationLearning`
- `AccountingDocument`
- `OcrResult`
- `DunningTemplate`
- `AccountingDocumentAutoAllocationRule`

Strengths:

- Journal entries are guarded against update-style mutations.
- AP invoices have duplicate supplier invoice protection and payment-batch reservation.
- AR/AP/open item query paths use cursor pagination and aggregation tests.
- Document archive contains hash and retention behavior.
- Bank/reconciliation models have indexes for reference/account/status paths.

Risks:

- Monetary amounts use JavaScript `Number`; this is not sufficient for enterprise FX, consolidation, tax, and audit-grade arithmetic.
- No `companyId`, `branchId`, fiscal period, or posting-period lock is present in core accounting models.
- Bank `connectionConfig` exists as mixed config; production encryption/certification needs explicit verification.
- Tax, budget, asset, recurring, and consolidation data models are absent.

## 7. API Audit

Existing accounting API surface:

- `/api/v1/accounting/accounts`
- `/api/v1/accounting/account-mappings`
- `/api/v1/accounting/journal`
- `/api/v1/accounting/ar`
- `/api/v1/accounting/ap/invoices`
- `/api/v1/accounting/documents`
- `/api/v1/accounting/bank`
- `/api/v1/accounting/reconciliation`
- `/api/v1/accounting/cash`
- `/api/v1/accounting/open-items`
- `/api/v1/accounting/reports/profit-loss`

Strengths:

- Routes are permission-gated.
- Joi validation exists across the accounting route family.
- Critical posting flows use service/repository boundaries.
- Unit tests cover route permission seeding, journal integrity, AR/AP postings, ISO 20022, OCR, documents, and performance guards.

Missing API surface:

- `GET /api/v1/accounting/dashboard`
- `GET /api/v1/accounting/reports/balance-sheet`
- `GET /api/v1/accounting/reports/trial-balance`
- `GET /api/v1/accounting/reports/cash-flow`
- `GET /api/v1/accounting/reports/general-ledger`
- `GET /api/v1/accounting/search`
- Fiscal periods: list, create, close, reopen, posting guard checks.
- FX rates: import/update rates, revaluation, realized/unrealized gain/loss.
- Tax engine: tax codes, tax groups, tax summary/liability reports.
- Budget, asset, recurring transaction, and consolidation endpoints.
- Company/branch-scoped query parameters enforced server-side.

## 8. UI/UX Audit

Strengths:

- Accounting workspace pages exist for dashboard, receivables, payables, bank, cash, reconciliation, open items, reports, documents, journal, chart of accounts, and mobile scanning.
- Pages use loading skeletons, empty states, filters, and React Query hooks.
- Operational pages generally use a service layer rather than direct fetch calls.

Risks:

- Dashboard is composed from several client queries, so it is not an atomic financial snapshot.
- Payables page still builds AP payloads and line totals in the UI. This violates the target architecture rule that business logic should not live inside UI components.
- Journal page consumes paginated query data but does not expose pagination controls.
- Tables are paginated but not virtualized for dense 10K+ drilldown/report work.
- Reports page only exposes P&L.
- No saved filters, dashboard personalization, company/branch/currency filter bar, or executive KPI drilldown model.

## 9. Security And Compliance Audit

Strengths:

- Accounting permissions exist for read/write/admin, chart, journal, AR, AP, documents, bank, reconciliation, cash, and open items.
- Permission tests pass for seeded accounting permissions and the accounting role.
- Accounting actions log audit events.
- Document retention behavior is locally tested.

Remaining compliance gaps:

- No formal segregation-of-duties policy model.
- No manual journal approval workflow.
- No fiscal close/locked period controls.
- No auditor workspace with immutable evidence exports and before/after snapshots.
- IFRS/GAAP readiness cannot be claimed until full statements, FX, periods, and consolidation foundations exist.

## 10. Integration Audit

Implemented local integrations:

- QOP invoice lifecycle and invoice PDFs.
- Document archive and file service.
- Notification/email boundary for invoices, statements, and dunning.
- Mobile accounting scan upload and offline queue behavior.
- ISO 20022 camt/pain parsing and generation.
- Bank retrieval through gateway folder paths.

External gates:

- SMTP delivery acceptance.
- Bank acceptance of pain.001 and pain.002 flows.
- Native EBICS/open-banking certification or certified gateway.
- OCR provider accuracy benchmark for German/French/Italian invoices.
- Object storage durability/SLA proof.
- Device-level mobile scanner, camera, and offline validation.
- Production-scale data tests for 10K to 100K record paths.

## 11. Technical Improvement Plan

### Phase 1 - Critical production foundation

1. Add an accounting dashboard backend endpoint that returns one financial snapshot with freshness metadata and drilldown links.
2. Add balance sheet, trial balance, cash-flow statement, and general-ledger report services from journal entries.
3. Add fiscal periods and locked-period posting guards across manual journals, AR, AP, bank reconciliation, netting, and write-off flows.
4. Define money precision strategy and migration path before FX/consolidation.
5. Move remaining AP payload and money calculations out of UI components into domain utilities/hooks while keeping server calculations authoritative.
6. Add journal pagination controls and export permission gating in the UI.

### Phase 2 - Automation and banking

1. Add supplier master selection/creation UX and default AP mappings.
2. Add scheduled report delivery and PDF/Excel exports.
3. Add global financial search.
4. Add provider-backed EBICS/open-banking gateway abstraction.
5. Add reconciliation benchmark harness using anonymized bank data.

### Phase 3 - Advanced finance

1. Add FX rate table, historical rates, realized/unrealized gains, and revaluation.
2. Add tax codes, groups, exemptions, withholding, and tax liability reporting.
3. Add recurring invoices, bills, and journals.
4. Add budgets and budget-vs-actual reporting.
5. Add forecast source-row drilldowns and obligation calendars.

### Phase 4 - Enterprise scope

1. Add multi-company and branch ledgers.
2. Add intercompany journals and eliminations.
3. Add consolidation reports.
4. Add fixed assets, depreciation, and disposal.
5. Add auditor workspace and SoD policy enforcement.

## 12. Validation

Fresh verification run on 2026-06-25:

- Server focused accounting unit tests: 18 suites passed, 71 tests passed.
- Client focused accounting tests: 2 files passed, 10 tests passed.
- First client command used Jest's `--runInBand` flag with Vitest and failed before running tests; rerun without the flag passed.

Validated locally:

- Accounting route permissions and role seeding.
- Journal immutability and reversal guards.
- AR payment allocation, customer mismatch rejection, overpayment credit balance, and aggregation-based receivable summaries.
- AP payment-batch integrity, supplier IBAN export guard, second-approver separation, and split allocation validation.
- ISO 20022 camt/pain parsing and generation.
- Bank retrieval duplicate handling.
- OCR workflow, accounting document archive retention, assignment, dunning, statements, and ZIP export.
- P&L calculation/export and account overview export limits.

Not validated locally:

- External SMTP delivery.
- Bank certification and acceptance.
- OCR accuracy benchmark against real multilingual supplier invoices.
- Production MongoDB performance on seeded 10K to 100K datasets.
- Mobile camera/scanner hardware quality.
- Full client production build for this audit run.

## Final Verdict

The current Accounting module is locally SME-capable and regression-tested, but it is not yet a production-grade enterprise accounting system.

The next approved implementation slice should be Phase 1: authoritative dashboard/reporting backend, fiscal-period posting controls, money precision plan, and removal of UI business logic from payables/journal workflows. This creates the management visibility required by the prompt without destabilizing the working AR/AP/banking core.
