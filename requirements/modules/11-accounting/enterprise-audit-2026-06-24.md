# Accounting Module Enterprise Audit - 2026-06-24

## 1. Problem Breakdown

The requested target is broader than the original Module 11 scope. The current module covers a strong SME accounting core: chart of accounts, journal, AR open items/payments/dunning, AP invoices/payment batches, ISO 20022 file import/export, reconciliation, cash forecast, document archive/OCR, and basic P&L reporting. The enterprise target adds consolidated management KPIs, multi-company and branch dimensions, full multi-currency/FX accounting, broader financial statements, advanced tax/payroll liabilities, fixed assets, budgeting, approval orchestration, and production certification against external providers.

Primary constraints:

- Existing backend is feature-based under `server/src/modules/accounting`.
- Existing client uses a service/query/mutation layer under `client/src/modules/accounting` with route pages under `client/src/app/(platform)/accounting`.
- Financial state is already used by QOP invoice workflows, document archive, notification/email jobs, mobile scanning, and banking jobs.
- Current worktree contains many unrelated user changes; this audit does not modify module code.

What can break if this is patched casually:

- Ledger integrity if money precision or journal immutability is changed without migration.
- Bank reconciliation correctness if real-time or imported transactions overwrite open-item state instead of applying atomic deltas.
- Dashboard trust if KPIs are composed from mismatched currencies or stale multi-query client data.
- External compliance if generated bank files, OCR outputs, or SMTP delivery are treated as certified without provider/bank validation.

## 2. Architecture Decision

Recommended direction: build an accounting command/query boundary around the existing feature modules instead of replacing them.

- Keep operational accounting commands in existing services: AR, AP, bank, reconciliation, journal, documents.
- Add a read-optimized reporting/dashboard API layer that aggregates from journal/open items/bank balances in one backend request, with clear freshness metadata.
- Introduce a first-class money/FX model before enterprise multi-currency and consolidation.
- Add company/branch/accounting-period dimensions at the data-contract level before dashboard filters are exposed.
- Keep UI thin: pages should render state and trigger hooks; calculations, normalization, posting rules, and payload construction belong in services/hooks.

Impact:

- Low-risk improvements can continue in the current module structure.
- Enterprise-grade features require schema/data migration and cannot be safely hidden as UI-only work.
- External provider gates remain certification work, not local code completion.

## 3. Current State Audit

| Area | Status | Evidence / gap |
| --- | --- | --- |
| Accounting architecture | Partially implemented | Backend is feature-based with route aggregator under `/api/v1/accounting`; client has service/query/mutation boundaries. Some UI pages still contain payload-building and money calculations. |
| Dashboard | Partially implemented | Dashboard shows AR, AP, bank balance, 30-day cash, YTD profit, AR/AP aging. Missing EBITDA, gross profit, monthly revenue/expenses, tax/payroll liabilities, cash burn, available cash, forecasted cash, widget customization, company/branch/currency filters. |
| General Ledger | Partially implemented | Chart, journal, account overview, immutability guards, reversals, CSV export exist. Missing fiscal-period close/lock workflow, approval workflow for manual journals, balance sheet/trial balance/cash-flow statement endpoints. |
| AR | Mostly implemented locally | QOP invoice lifecycle, open receivables, payments, allocation, write-off, customer credit, dunning PDFs/email boundary and performance safeguards exist. External SMTP/print/template signoff remains. |
| AP | Mostly implemented locally | Supplier invoices, split allocation validation, approval/second approval, payables aging/summary, payment batch reservation and pain.001 export exist. Supplier master UX and bank acceptance remain gaps. |
| Banking | Partially implemented | camt.053/camt.054 import, pain.001 export, pain.002 import, gateway-folder retrieval and duplicate statement skip exist. Native EBICS certification/open banking provider support is not proven. |
| Reconciliation | Mostly implemented locally | AR/AP manual and auto reconciliation uses transactional posting paths and learning rules. Production auto-match rates are not benchmarked on real bank data. |
| Cash flow | Partially implemented | Balances and 90-day aggregate forecast exist with client what-if controls. Forecast does not expose exact underlying source rows per period and does not model payroll/tax/fixed obligations. |
| Reporting | Partially implemented | Only P&L exists in the reports API. Missing balance sheet, trial balance, cash flow statement, GL report endpoint family, tax summary, scheduled reports, PDF/Excel export. |
| Search/filtering | Partially implemented | Local search/filter exists in key lists. No unified financial search across invoice/customer/vendor/transaction/journal/account/amount/date. |
| Multi-currency | Partially implemented | CHF/EUR fields exist in several models. Missing exchange-rate table, historical rates, base/document currency distinction, realized/unrealized gain/loss, FX revaluation. |
| Tax | Partially implemented | Swiss VAT rates are used in invoice flows. Missing full tax engine for tax groups, exemptions, GST/withholding, tax liability dashboard, tax return workflow. |
| Security/RBAC | Mostly implemented locally | Granular accounting permissions are defined and tested. Needs export-specific UX gating review and SOX-style approval/segregation policy model. |
| Audit trail | Mostly implemented locally | Services call audit logging for financial actions. Missing consolidated auditor workspace and immutable change snapshots for all previous/new values. |
| Performance | Partially implemented | Backend has cursor pagination, aggregation safeguards, indexes, and tests for large-read protection. Client lists use pagination but not virtualization; dashboard is multiple parallel client queries rather than one optimized endpoint. |
| Multi-company/branch | Missing | No accounting `companyId`/`branchId` dimension was found in accounting models/services. Current implementation is single-company oriented. |
| Advanced accounting | Missing | Fixed assets, depreciation, disposal, budgeting, budget-vs-actual, intercompany, consolidation, recurring journals/bills/invoices are not implemented. |

## 4. Gap Analysis Against ERP Benchmarks

Compared with SAP Business One, NetSuite, Dynamics, Odoo, Xero, and QuickBooks:

- Stronger than a prototype: the module has real journal, AR/AP, documents, ISO 20022, reconciliation, and regression tests.
- Comparable to a focused SME back-office accounting slice for Swiss invoice/payment workflows.
- Not comparable to enterprise ERP accounting yet because it lacks dimensional accounting, fiscal periods, full financial statement set, FX lifecycle, consolidation, budgeting, asset accounting, and certified banking/provider integrations.
- Management visibility is not yet enterprise-grade because the dashboard is not a single authoritative backend snapshot and does not cover the full KPI list.

## 5. Missing Features Matrix

| Module | Feature | Priority | Complexity | Status |
| --- | --- | --- | --- | --- |
| Dashboard | Single backend financial overview endpoint with freshness metadata | Critical | Medium | Missing |
| Dashboard | EBITDA, gross profit, monthly revenue/expense, burn, tax/payroll liabilities | Critical | Medium | Missing |
| Dashboard | Company/branch/currency/date filters and drilldowns | Critical | High | Missing |
| Ledger | Fiscal periods, close/reopen, locked-period posting rules | Critical | High | Missing |
| Ledger | Manual journal approval workflow | Critical | Medium | Missing |
| Reporting | Balance sheet, trial balance, cash flow statement, GL report | Critical | High | Missing |
| Money | Decimal/minor-unit money strategy and migration | Critical | High | Missing |
| Multi-currency | FX rates, historical rates, realized/unrealized gain/loss, revaluation | Critical | High | Missing |
| Multi-company | Company/branch dimensions and scoped ledgers | Critical | High | Missing |
| Tax | Tax code/groups/exemptions/withholding and liability reporting | Important | High | Missing |
| Banking | Certified EBICS/open-banking connector and bank acceptance | Important | High | External gate |
| UX | Virtualized large finance tables and advanced saved filters | Important | Medium | Partial |
| Search | Global financial search | Important | Medium | Missing |
| Automation | Recurring invoices/bills/journals | Important | Medium | Missing |
| Assets | Fixed assets/depreciation/disposal | Important | High | Missing |
| Planning | Budgets and budget-vs-actual | Important | High | Missing |
| Enterprise | Intercompany journals and consolidation | Enterprise | Very high | Missing |

## 6. Database Review

Implemented collections/models include accounts, account mappings, journal entries, AR payments/allocations, AP invoices, payment batches, bank accounts/transactions, reconciliation learning rules, accounting documents, OCR results, dunning templates, and document auto-allocation rules.

Strengths:

- Key query paths have indexes for account, AP, bank transaction, document, journal, and open-item use cases.
- Journal model blocks update/delete-style operations.
- AP payment batches reserve invoices to prevent duplicate active batches.
- Document archive stores hash/retention metadata and has searchable fields.

Risks:

- Financial amounts are stored as JavaScript `Number`, not decimal/minor-unit money. This is acceptable only with strict rounding for simple CHF/EUR flows; it is not enterprise-grade for FX, consolidation, tax, and audit-grade arithmetic.
- No company/branch dimension exists in accounting models.
- No fiscal-period model or closed-period posting guard exists in the Accounting module.
- Connection config exists for bank accounts, but production credential encryption/certification must be verified before enterprise rollout.

## 7. API Audit

Existing API surface:

- `/accounts`, `/account-mappings`, `/journal`
- `/ar/receivables`, `/ar/payments`, `/ar/dunning`
- `/ap/invoices`, `/ap/invoices/payment-batch`
- `/documents`, OCR, assignment, bulk download, auto-allocation rules
- `/bank`, bank import/retrieve/payment-status
- `/reconciliation`, suggestions, AR/AP match, categorization
- `/cash`, balances and forecast
- `/open-items`, aging, statement, netting
- `/reports/profit-loss`

Strengths:

- Routes are permission-gated and validated with Joi.
- Accounting services use repositories and transactional paths for critical postings.
- Unit tests cover the main accounting API contracts and posting rules.

Missing API surface:

- `GET /api/v1/accounting/dashboard`
- `GET /api/v1/accounting/reports/balance-sheet`
- `GET /api/v1/accounting/reports/trial-balance`
- `GET /api/v1/accounting/reports/cash-flow`
- `GET /api/v1/accounting/search`
- FX rates and revaluation endpoints
- Fiscal periods and close/reopen endpoints
- Budget, asset, recurring transaction, and consolidation endpoints
- Company/branch-scoped query parameters enforced server-side

## 8. UI/UX Audit

Strengths:

- Accounting pages have focused workspaces, loading skeletons, empty states, filters, and cursor pagination on most large operational tables.
- Dashboard gives an initial financial overview and drilldown links.
- Pages use React Query hooks and a service layer rather than direct API calls.

Risks:

- UI pages still contain business logic: AP payload construction and line total/VAT calculation are in the payables page. These should move into a domain utility/hook and remain server-authoritative.
- Journal page consumes paginated query data but does not expose pagination controls.
- Large tables are paginated but not virtualized. For 10K+ operational workflows, pagination is acceptable, but virtualization is still needed for dense drilldown/report screens.
- Reports UI only exposes P&L; no full financial statement workspace.
- No dashboard customization or saved filter presets.
- No company/branch/currency filters in the dashboard.

## 9. Security And Compliance Audit

Strengths:

- Granular accounting permissions exist for chart, journal, AR, AP, documents, bank, reconciliation, cash, and open items.
- Tests confirm accounting route permissions are seeded and assigned to the Buchhalter role.
- Audit logging is present across accounting services.
- Document retention rules and retention-safe delete exist.

Remaining compliance gaps:

- SOX-style segregation-of-duties policies are not modeled.
- Manual journal approval is missing.
- Period close/locked period control is missing.
- Immutable before/after snapshots for every sensitive data mutation are not consolidated into an auditor workspace.
- IFRS/GAAP readiness cannot be claimed until reporting, FX, fiscal-period, and consolidation foundations exist.

## 10. Integration Audit

Implemented local integrations:

- QOP invoices and invoice PDFs.
- Document archive and file service.
- Notification/email jobs for invoices/statements/dunning.
- Mobile accounting scan upload.
- ISO 20022 camt/pain parser/generator.
- Bank retrieval through gateway folder paths.

External gates:

- SMTP delivery acceptance.
- Bank acceptance of pain.001 and pain.002 workflows.
- Native EBICS/open banking certification or certified gateway.
- OCR provider accuracy benchmark for German/French/Italian invoices.
- Object storage durability/SLA evidence.
- Device-level mobile scanner/camera/offline validation.

## 11. Technical Improvement Plan

### Phase 1 - Critical production foundation

1. Add money/decimal strategy and migration plan.
2. Add accounting dashboard backend endpoint with consolidated snapshot, date/company/branch/currency inputs, and freshness metadata.
3. Add balance sheet, trial balance, and cash flow report services from journal entries.
4. Add fiscal periods and locked-period posting guard.
5. Move remaining UI business logic into accounting domain utilities/hooks and keep server authoritative.
6. Add journal page pagination and export gating.

### Phase 2 - Important automation and banking

1. Add supplier master UX and saved AP defaults.
2. Add scheduled reports and PDF/Excel exports.
3. Add global financial search.
4. Add provider-backed EBICS/open-banking integration behind a gateway interface.
5. Add reconciliation accuracy benchmark harness with anonymized bank samples.

### Phase 3 - Advanced planning and analytics

1. Add FX rate table, historical rate capture, realized/unrealized gains, and revaluation.
2. Add tax code/groups/exemptions/withholding and tax liability reporting.
3. Add recurring invoices/bills/journals.
4. Add budgeting and budget-vs-actual reporting.
5. Add cash forecast source-row drilldowns and obligation calendar.

### Phase 4 - Enterprise scope

1. Add multi-company/branch ledgers and scoped permissions.
2. Add intercompany journals and eliminations.
3. Add consolidation reports.
4. Add fixed assets, depreciation, and disposal.
5. Add auditor workspace, immutable evidence exports, and formal segregation-of-duties policy checks.

## 12. Validation

Fresh verification run on 2026-06-24:

- Server unit accounting suite: 22 suites passed, 85 tests passed.
- Client accounting suite: 2 suites passed, 10 tests passed.
- Server replica-set integration suite was attempted but blocked by local `mongodb-memory-server` startup failure: `Mongod internal error (fassert() failure)`. No accounting assertion failure was reached in that suite.

Edge cases validated by existing unit tests include:

- Journal immutability and reversal race protection.
- AR allocation grouping, customer mismatch rejection, and overpayment credit exposure.
- AP payment-batch reservation, duplicate invoice rejection, second-approver separation, and split allocation balancing.
- ISO 20022 camt.053/camt.054 parsing, pain.001 generation, and pain.002 import.
- Document archive retention, ZIP export, OCR workflow, dunning/statement PDF output, and permission seeding.

## Final Verdict

The current Accounting module is a strong local SME accounting implementation, but it is not yet a production-grade enterprise accounting system. The largest blockers are not small bugs; they are foundational product and architecture gaps: authoritative dashboard/reporting APIs, money precision, fiscal periods, multi-company/branch dimensions, full multi-currency/FX lifecycle, complete financial statements, advanced tax, and external certification gates.

Recommended first implementation slice: Phase 1, starting with the dashboard/reporting backend and fiscal/money architecture design. That creates the management visibility required by the prompt without destabilizing the existing AR/AP/banking work.
