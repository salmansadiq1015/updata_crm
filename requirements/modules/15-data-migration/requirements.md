# Module 15: Data Migration - Detailed Requirements

---

## MIG-001: OF Software Data Extraction & Import

**ID:** MIG-001
**Title:** OF Software Data Extraction & Import
**Priority:** High
**Complexity:** High
**Module:** 15 - Data Migration

### Description

Extract all relevant operational data from the client's existing OF (Orgafile/field-service) software and import it into the new ERP platform. The OF software is the primary operational system containing addresses, orders, plant/installation records, service history, and related operational data. Extraction requires understanding the OF data model, establishing a field mapping to the new platform's schema, and building an ETL (Extract-Transform-Load) pipeline.

### Actors

- **Migration Engineer** (developing and executing the migration)
- **Client IT Contact** (providing OF system access, data exports, and domain knowledge)
- **Project Manager** (coordinating migration timeline and sign-off)

### Preconditions

1. The client has provided access to the OF software database or a complete data export in an evaluable format (SQL dump, CSV, or structured export).
2. The OF data model documentation (or reverse-engineered schema) is available.
3. The target platform schema (Modules 02, 03, 06, 07, 10) is finalized and deployed to the staging environment.
4. A field mapping document has been created and approved by both parties.

### Flow

**Main Flow:**
1. The migration engineer receives the OF data export from the client.
2. The engineer loads the export into a staging database for analysis and transformation.
3. The ETL pipeline executes the following steps for each data domain:
   a. **Extract:** Read source records from the staging database.
   b. **Transform:** Apply field mappings, data type conversions, value translations (e.g., status codes to new enum values), and format normalization (phone numbers to E.164, addresses to structured format).
   c. **Validate:** Check each transformed record against the target schema validation rules (required fields, format constraints, referential integrity).
   d. **Load:** Insert valid records into the target platform database, preserving the source system ID as a cross-reference.
4. Records that fail validation are logged to an error report with the source record, error details, and suggested fix.
5. The migration engineer reviews the error report and either fixes the transformation logic or escalates data quality issues to the client.
6. Steps 3-5 are repeated until the error rate is within the acceptable threshold (< 1% of total records).

**Alternate Flows:**
- **A1 - Proprietary Export Format:** If the OF software uses a proprietary export format that is not directly parseable, the migration engineer works with the client to create an intermediate CSV/JSON export.
- **A2 - Incremental Data:** If the client continues using OF during the migration development phase, a delta migration process captures records created/modified after the initial export.
- **A3 - Binary/Blob Data:** If the OF software stores documents (PDFs, images) as binary blobs in the database, these are extracted, converted to files, and uploaded to cloud storage (Module 14, INT-007), with references updated in the migrated records.

### Postconditions

1. All agreed data domains from the OF software are migrated to the target platform.
2. Source record IDs are preserved as cross-references for traceability.
3. A migration log documents all records processed, migrated, and errored.

### Acceptance Criteria

- [ ] AC-1: All address records from OF are migrated to the CRM module (Module 02) with all mapped fields populated.
- [ ] AC-2: All plant/installation records from OF are migrated to the Plant Management module (Module 06).
- [ ] AC-3: Historical service records from OF are migrated and linked to the corresponding plant records.
- [ ] AC-4: The migration error rate is below 1% of total records (excluding known source data quality issues documented in the error report).
- [ ] AC-5: Each migrated record contains a `source_system = 'OF'` and `source_id` reference for traceability.
- [ ] AC-6: The ETL pipeline can be re-run from scratch (idempotent) without creating duplicate records.
- [ ] AC-7: The complete OF migration executes within 8 hours for the production dataset.

### Dependencies

- Module 02 (CRM): Target address/contact schema
- Module 03 (Order Management): Target order schema
- Module 06 (Plant Management): Target plant/installation schema
- Module 14 (Integrations, INT-007): Cloud storage for document files
- MIG-007: Validation rules

### Tags

`extraction`, `of-software`, `etl`, `legacy`, `field-service`

---

## MIG-002: Messerli CRM Data Extraction & Import

**ID:** MIG-002
**Title:** Messerli CRM Data Extraction & Import
**Priority:** High
**Complexity:** High
**Module:** 15 - Data Migration

### Description

Extract all relevant customer relationship data from the Messerli CRM system and import it into the new platform's CRM module (Module 02). Messerli CRM contains customer contacts, communication history, customer classifications/tags, and potentially sales-related data. Where entities exist in both Messerli and OF, cross-system deduplication must be performed.

### Actors

- **Migration Engineer** (developing and executing the migration)
- **Client IT Contact** (providing Messerli system access and data exports)
- **Client CRM User** (providing domain knowledge about Messerli data structure and classifications)

### Preconditions

1. The client has provided a complete data export from Messerli CRM in an evaluable format.
2. The Messerli data model documentation is available.
3. The field mapping document (Messerli -> new CRM schema) is approved.
4. Cross-system deduplication rules (matching Messerli contacts to OF contacts) are defined.

### Flow

**Main Flow:**
1. The migration engineer receives the Messerli CRM data export.
2. The export is loaded into the staging database.
3. The ETL pipeline executes:
   a. **Extract:** Read contact records, communication history, classifications, and related data.
   b. **Transform:** Apply field mappings, normalize contact data (names, phone numbers, email, addresses), and translate classifications/tags to the new system's taxonomy.
   c. **Deduplicate:** For each Messerli contact, attempt to match against already-migrated OF contacts using matching rules:
      - Exact match on email address
      - Exact match on phone number (normalized)
      - Fuzzy match on name + address (Levenshtein distance < 3 on name, exact ZIP code)
   d. **Merge or Create:**
      - If a match is found, merge the Messerli data into the existing record (Messerli data supplements but does not overwrite OF data unless OF field is empty).
      - If no match is found, create a new contact record.
   e. **Validate:** Check referential integrity and required fields.
   f. **Load:** Insert/update records in the target database.
4. Deduplication decisions are logged (matched, created new, ambiguous).
5. Ambiguous matches (multiple potential matches) are exported for client review and manual resolution.

**Alternate Flows:**
- **A1 - Communication History:** If Messerli stores communication history (emails, call notes), these are migrated as notes/activities linked to the contact record in the new CRM.
- **A2 - Client-Specific Classifications:** If Messerli uses custom classification schemes not present in the new system, a mapping table is created in collaboration with the client.
- **A3 - Messerli-Only Contacts:** Contacts existing only in Messerli (not in OF) are created as new records with `source_system = 'messerli'`.

### Postconditions

1. All Messerli CRM contacts are either merged into existing records or created as new records.
2. Communication history is preserved and linked to the correct contacts.
3. Deduplication decisions are documented.

### Acceptance Criteria

- [ ] AC-1: All Messerli contact records are processed (migrated or merged).
- [ ] AC-2: Cross-system deduplication correctly identifies and merges at least 90% of overlapping contacts (verified by client spot-check).
- [ ] AC-3: Ambiguous matches are exported for client review; fewer than 5% of total contacts require manual resolution.
- [ ] AC-4: Communication history from Messerli is linked to the correct contact in the new CRM.
- [ ] AC-5: Messerli-specific classifications are mapped to the new system's taxonomy or preserved as custom tags.
- [ ] AC-6: Each migrated record contains `source_system` and `source_id` references.

### Dependencies

- Module 02 (CRM): Target contact/customer schema
- MIG-001: OF data must be migrated first (for deduplication matching)
- MIG-007: Validation rules

### Tags

`extraction`, `messerli`, `crm`, `deduplication`, `contacts`

---

## MIG-003: Address Data Migration

**ID:** MIG-003
**Title:** Address Data Migration
**Priority:** High
**Complexity:** Medium
**Module:** 15 - Data Migration

### Description

Migrate all customer, supplier, partner, and internal contact addresses from both source systems (OF and Messerli CRM) into the new platform's CRM module. This includes structured address normalization (Swiss postal format), phone number normalization (E.164 / +41 format), and email validation.

### Actors

- **Migration Engineer** (executing address migration)
- **Client** (verifying address data quality)

### Preconditions

1. Address data has been extracted from OF (MIG-001) and Messerli (MIG-002).
2. Target address schema in Module 02 is finalized.
3. Swiss postal code reference data is available for validation.

### Flow

**Main Flow:**
1. Address records from both source systems are collected in the staging area.
2. For each address record:
   a. **Normalize:** Standardize address components (street, house number, ZIP, city, canton).
   b. **Validate ZIP:** Validate Swiss postal codes against the official PLZ directory.
   c. **Normalize Phone:** Convert phone numbers to E.164 format (+41...). Handle various input formats (079..., 0041..., +41..., etc.).
   d. **Validate Email:** Validate email format and optionally check domain existence (MX record).
   e. **Classify:** Determine address type (customer, supplier, partner, internal) based on source data or explicit mapping.
   f. **Geocode (Optional):** If geocoding is required for map-based features (Module 04 dispatching), geocode addresses via a geocoding API.
3. Validated and normalized addresses are loaded into the target CRM.
4. Invalid addresses (e.g., non-existent ZIP code, invalid email format) are logged in the error report.

**Alternate Flows:**
- **A1 - Unstructured Addresses:** If source addresses are stored as free-text (single field), a parsing algorithm attempts to extract street, ZIP, and city. Unparseable addresses are flagged for manual review.
- **A2 - Foreign Addresses:** Non-Swiss addresses (e.g., German or Austrian customers) are normalized according to the respective country's format.

### Postconditions

1. All address records are migrated with normalized formatting.
2. Invalid addresses are documented in the error report.

### Acceptance Criteria

- [ ] AC-1: All address records from both source systems are migrated to the target CRM.
- [ ] AC-2: Swiss phone numbers are normalized to E.164 format (+41...) with 95%+ success rate.
- [ ] AC-3: Swiss postal codes are validated; invalid codes are flagged (not silently dropped).
- [ ] AC-4: Email addresses with invalid format are flagged but the contact record is still created (email field left blank, original value in notes).
- [ ] AC-5: Address type classification (customer, supplier, partner) is preserved from source data.

### Dependencies

- MIG-001: OF data extraction
- MIG-002: Messerli data extraction
- Module 02 (CRM): Target address schema
- MIG-007: Validation rules

### Tags

`addresses`, `normalization`, `phone`, `email`, `swiss-postal`

---

## MIG-004: Quotation Data Migration

**ID:** MIG-004
**Title:** Quotation Data Migration
**Priority:** High
**Complexity:** Medium
**Module:** 15 - Data Migration

### Description

Migrate historical quotation data from the legacy systems into the new platform's Quotation module (Module 07). This includes quotation headers (customer, date, status, validity, amounts), line items (articles, quantities, prices), and associated documents (PDF quotation documents).

### Actors

- **Migration Engineer** (executing quotation migration)
- **Client** (defining which quotation history to migrate and verifying data)

### Preconditions

1. Quotation data has been extracted from the source system(s).
2. Customer records have been migrated (MIG-003) so that quotations can be linked to the correct customer.
3. Article master data is available (either migrated or manually created) for line item references.
4. The client has defined the migration scope (e.g., quotations from the last 3 years, or all quotations).

### Flow

**Main Flow:**
1. Quotation records from the source system are loaded into the staging area.
2. For each quotation:
   a. **Map Customer:** Link the quotation to the migrated customer record using the source customer ID cross-reference.
   b. **Map Status:** Translate source system quotation statuses to the new system's status enum (e.g., draft, sent, accepted, rejected, expired).
   c. **Map Line Items:** For each line item, attempt to match the source article to the migrated article master. If no match is found, create a "custom" line item with the original description and pricing.
   d. **Calculate Totals:** Verify that migrated line item totals match the source quotation total. Log discrepancies.
   e. **Migrate Documents:** If PDF quotation documents are available, upload them to cloud storage and link them to the quotation record.
   f. **Set Metadata:** Mark the quotation as `migrated = true` and `read_only = true` (historical quotations should not be editable).
3. Validated quotations are loaded into the target Quotation module.

**Alternate Flows:**
- **A1 - Missing Customer:** If a quotation references a customer that was not migrated (e.g., deleted in source), the quotation is still migrated with customer details stored as snapshot data (name, address in the quotation record itself).
- **A2 - Missing Articles:** Line items referencing articles not in the article master are created as free-text line items with the original description and pricing.
- **A3 - Scope Limitation:** If the client decides to migrate only recent quotations (e.g., last 3 years), older quotations are excluded and documented.

### Postconditions

1. Historical quotations are available in the new platform for reference.
2. Quotations are linked to the correct customer records.
3. Migrated quotations are marked as read-only.

### Acceptance Criteria

- [ ] AC-1: All in-scope quotations are migrated with header data (customer, date, status, amounts) intact.
- [ ] AC-2: Quotation line items are migrated with article references where available, or as free-text items.
- [ ] AC-3: Quotation totals in the new system match source system totals (tolerance: CHF 0.05 for rounding).
- [ ] AC-4: PDF quotation documents are uploaded and linked to the corresponding quotation record.
- [ ] AC-5: Migrated quotations are marked as read-only and cannot be edited by users.
- [ ] AC-6: Quotations are linked to the correct migrated customer records.

### Dependencies

- MIG-001/MIG-002: Source data extraction
- MIG-003: Customer records migrated first
- Module 07 (Quotations): Target quotation schema
- Module 14 (INT-007): Cloud storage for document files

### Tags

`quotations`, `historical`, `line-items`, `documents`, `read-only`

---

## MIG-005: Invoice Data Migration

**ID:** MIG-005
**Title:** Invoice Data Migration
**Priority:** High
**Complexity:** Medium
**Module:** 15 - Data Migration

### Description

Migrate historical invoice data from the legacy systems into the new platform's Finance module (Module 10). This includes invoice headers (customer, date, due date, amounts, payment status), line items, payment records, and associated PDF documents. Both customer invoices (accounts receivable) and, where available, supplier invoices (accounts payable) are in scope.

### Actors

- **Migration Engineer** (executing invoice migration)
- **Client Finance Team** (verifying financial data accuracy)

### Preconditions

1. Invoice data has been extracted from the source system(s).
2. Customer and supplier records have been migrated (MIG-003).
3. The client has defined the migration scope and confirmed which financial years to include.
4. Open vs. paid status is available in the source data.

### Flow

**Main Flow:**
1. Invoice records from the source system are loaded into the staging area.
2. For each invoice:
   a. **Map Customer/Supplier:** Link the invoice to the migrated customer or supplier record.
   b. **Map Status:** Translate payment status (open, partially paid, paid, overdue, cancelled, written off).
   c. **Map Line Items:** Migrate line item details (description, quantity, unit price, VAT rate, total).
   d. **Map Payment Records:** If the source system tracks individual payments against invoices, migrate payment records with dates and amounts.
   e. **Verify Financials:** Validate that line item totals + VAT = invoice total. Log discrepancies.
   f. **Migrate Documents:** Upload PDF invoices to cloud storage and link them.
   g. **Set Metadata:** Mark as `migrated = true` and `read_only = true`.
3. Validated invoices are loaded into the target Finance module.

**Alternate Flows:**
- **A1 - Open Invoices:** Open (unpaid) invoices require special attention. They must be verified with the client's finance team to ensure the outstanding balance is correct as of the migration date.
- **A2 - VAT Rate Changes:** Historical invoices may use older VAT rates (e.g., 7.7% before 2024 vs. 8.1% after). The migration preserves the original VAT rate, not the current rate.
- **A3 - Credit Notes:** Credit notes are migrated as negative invoices, linked to the original invoice where possible.

### Postconditions

1. Historical invoices are available in the new platform for reference and financial reporting.
2. Open invoice balances are accurate as of the migration date.
3. Financial totals can be reconciled between source and target systems.

### Acceptance Criteria

- [ ] AC-1: All in-scope invoices are migrated with header, line items, and payment status.
- [ ] AC-2: Invoice totals in the new system match source system totals (tolerance: CHF 0.05).
- [ ] AC-3: Open invoice balances are verified against the client's accounts receivable report.
- [ ] AC-4: Payment records are linked to the correct invoices.
- [ ] AC-5: VAT rates are preserved as they were on the original invoice (not updated to current rates).
- [ ] AC-6: PDF invoice documents are uploaded and linked.
- [ ] AC-7: Migrated invoices are marked as read-only.
- [ ] AC-8: A reconciliation report compares total revenue/receivables in source vs. target system.

### Dependencies

- MIG-001/MIG-002: Source data extraction
- MIG-003: Customer/supplier records migrated first
- Module 10 (Finance): Target invoice schema
- Module 14 (INT-007): Cloud storage for document files

### Tags

`invoices`, `financial`, `accounts-receivable`, `payment-status`, `vat`, `reconciliation`

---

## MIG-006: Plant/Installation Data Migration

**ID:** MIG-006
**Title:** Plant/Installation Data Migration
**Priority:** High
**Complexity:** High
**Module:** 15 - Data Migration

### Description

Migrate heating plant and installation data from the legacy OF software into the new platform's Plant Management module (Module 06). This is one of the most critical migration domains as it contains the technical backbone of the field-service operation: what equipment is installed at each customer site, when it was installed, maintenance history, warranty status, and component details.

### Actors

- **Migration Engineer** (executing plant data migration)
- **Client Technical Lead** (providing domain expertise on plant data structure)
- **Field Service Manager** (verifying migrated plant data accuracy)

### Preconditions

1. Plant/installation data has been extracted from the OF software.
2. Customer/address records have been migrated (MIG-003) so that plants can be linked to customer locations.
3. The plant data model in Module 06 is finalized.
4. Equipment type and manufacturer reference data is available in the target system.

### Flow

**Main Flow:**
1. Plant records from the OF software are loaded into the staging area.
2. For each plant/installation record:
   a. **Map Customer & Location:** Link the plant to the migrated customer record and address (installation location).
   b. **Map Equipment:** Identify the equipment type, manufacturer, model, and serial number. Map to the target system's equipment catalog where possible.
   c. **Map Installation Details:** Migrate installation date, commissioning date, warranty expiry, and system parameters (capacity, fuel type, etc.).
   d. **Map Components:** If the source system tracks individual components (burner, heat exchanger, pump, controls), migrate each component as a child record of the plant.
   e. **Map Maintenance History:** Migrate historical maintenance/service records, including service dates, work performed, parts replaced, and technician (if identifiable).
   f. **Map Documents:** Migrate associated documents (installation protocols, commissioning reports, equipment photos) to cloud storage.
   g. **Calculate Next Maintenance:** Based on the last maintenance date and the default maintenance interval for the equipment type, pre-populate the next maintenance due date.
3. Validated plant records are loaded into the target Plant Management module.

**Alternate Flows:**
- **A1 - Unknown Equipment Type:** If the source data does not clearly identify the equipment manufacturer/model, the plant is created with a generic "Unknown" type and flagged for manual classification by a technician during the next site visit.
- **A2 - Missing Installation Date:** If the installation date is unknown, the field is left blank. The plant is flagged for data completion.
- **A3 - Decommissioned Plants:** Plants marked as decommissioned or removed in the source system are migrated with status `decommissioned` for historical reference but excluded from active maintenance scheduling.

### Postconditions

1. All plant/installation records are available in the new Plant Management module.
2. Plants are linked to the correct customer and installation address.
3. Maintenance history is preserved and linked.
4. Next maintenance due dates are pre-calculated.

### Acceptance Criteria

- [ ] AC-1: All plant records from the OF software are migrated to Module 06.
- [ ] AC-2: Plants are correctly linked to the migrated customer and installation address.
- [ ] AC-3: Equipment type, manufacturer, model, and serial number are populated where available in the source data.
- [ ] AC-4: Maintenance history records are migrated and linked to the correct plant.
- [ ] AC-5: Next maintenance due dates are calculated for active plants with known maintenance intervals.
- [ ] AC-6: Decommissioned plants are migrated with `decommissioned` status and excluded from active scheduling.
- [ ] AC-7: Plant documents (protocols, photos) are migrated to cloud storage and linked.
- [ ] AC-8: A client spot-check of 50 randomly selected plants confirms data accuracy for at least 95% of records.

### Dependencies

- MIG-001: OF data extraction (primary source for plant data)
- MIG-003: Customer/address records migrated first
- Module 06 (Plant Management): Target plant schema
- Module 14 (INT-007): Cloud storage for documents

### Tags

`plants`, `installations`, `heating-systems`, `maintenance-history`, `equipment`, `components`

---

## MIG-007: Data Validation & Integrity Checks

**ID:** MIG-007
**Title:** Data Validation & Integrity Checks
**Priority:** High
**Complexity:** Medium
**Module:** 15 - Data Migration

### Description

Provide a comprehensive validation framework that runs during and after migration to ensure data quality, referential integrity, and business rule compliance. The validation framework produces detailed error reports and summary statistics that inform migration decisions and client sign-off.

### Actors

- **Migration Engineer** (configuring and running validations)
- **System** (executing automated validation checks)
- **Project Manager / Client** (reviewing validation reports)

### Preconditions

1. Target platform schema and business rules are defined.
2. Validation rules are configured for each data domain.

### Flow

**Main Flow:**
1. During ETL processing (MIG-001 through MIG-006), each record passes through the validation framework before being loaded into the target database.
2. The validation framework applies the following check categories:
   a. **Schema Validation:** Required fields present, data types correct, string lengths within limits.
   b. **Format Validation:** Phone numbers in E.164, email addresses valid, dates parseable, Swiss postal codes valid.
   c. **Referential Integrity:** Foreign keys resolve to existing records (customer exists for an invoice, plant exists for a maintenance record).
   d. **Business Rule Validation:** Amounts are non-negative, dates are logical (invoice date <= due date), status values are valid enums.
   e. **Uniqueness Checks:** No duplicate records by unique key (e.g., invoice number per customer, serial number per manufacturer).
   f. **Cross-Domain Consistency:** Quotation totals match sum of line items, invoice payments do not exceed invoice total.
3. Validation results are categorized:
   - **Error (blocking):** Record cannot be migrated as-is. Requires fix or explicit skip.
   - **Warning (non-blocking):** Record can be migrated but has a data quality concern.
   - **Info:** Observation logged for reference (e.g., record has no phone number).
4. A validation report is generated per migration run with:
   - Total records processed, valid, warning, error per data domain
   - Top 10 error types with counts and examples
   - Referential integrity failures
   - Summary statistics

**Alternate Flows:**
- **A1 - Post-Migration Validation:** After all data is loaded, a separate post-migration validation run checks the entire target database for consistency (e.g., orphaned records, broken links, missing mandatory relationships).
- **A2 - Client-Defined Rules:** The client can request additional custom validation rules (e.g., "all plants installed before 2000 must have a decommission review flag").

### Postconditions

1. All migrated data passes schema and referential integrity checks.
2. Validation reports are available for review.
3. Blocking errors are resolved before production migration.

### Acceptance Criteria

- [ ] AC-1: Every migrated record is validated against schema, format, referential integrity, and business rules.
- [ ] AC-2: Blocking errors prevent the record from being loaded into the target database.
- [ ] AC-3: A validation report is generated for each migration run with categorized results (error, warning, info).
- [ ] AC-4: The validation report includes counts, top error types, and example records.
- [ ] AC-5: Post-migration validation confirms zero orphaned records (foreign keys pointing to non-existent records).
- [ ] AC-6: The production migration achieves a blocking error rate below 1%.

### Dependencies

- All migration requirements (MIG-001 through MIG-006)
- Module 01 (Core Platform): Target database schema

### Tags

`validation`, `data-quality`, `integrity`, `error-reporting`, `business-rules`

---

## MIG-008: Migration Dry-Run & Rollback

**ID:** MIG-008
**Title:** Migration Dry-Run & Rollback
**Priority:** Medium
**Complexity:** Medium
**Module:** 15 - Data Migration

### Description

Enable full migration dry-runs in a staging environment that mirrors production, and provide a reliable rollback mechanism that can restore the target database to its pre-migration state within 4 hours. Dry-runs validate the entire migration pipeline end-to-end and allow the client to verify data before the production cutover.

### Actors

- **Migration Engineer** (executing dry-runs and managing rollback)
- **Client** (reviewing dry-run results and approving production migration)
- **DBA / DevOps** (managing staging environment and database backups)

### Preconditions

1. A staging environment exists that mirrors the production database schema and infrastructure.
2. A complete source data export is available for dry-run.
3. Database backup/restore mechanisms are tested and operational.

### Flow

**Main Flow (Dry-Run):**
1. The migration engineer initiates a dry-run in the staging environment.
2. The staging database is reset to a clean state (empty target tables or restored from a pre-migration baseline).
3. The full ETL pipeline runs against the staging environment using the real source data.
4. Validation reports are generated (MIG-007).
5. Migration progress and timing are recorded (MIG-010).
6. The client is invited to spot-check the migrated data in the staging environment.
7. Issues identified are logged, prioritized, and addressed before the next dry-run or production migration.

**Main Flow (Rollback):**
1. Before the production migration begins, a full database backup is taken and verified.
2. The backup is stored in a secure, accessible location.
3. If the production migration fails or unacceptable data issues are discovered post-migration:
   a. The migration engineer initiates a rollback.
   b. The production database is restored from the pre-migration backup.
   c. The platform is restarted and verified to be operational with the pre-migration state.
4. The rollback completion time is recorded and must be under 4 hours.

**Alternate Flows:**
- **A1 - Partial Rollback:** If only a specific data domain has issues (e.g., quotations), a targeted rollback of that domain is attempted (truncate and re-import) without rolling back the entire migration.
- **A2 - Multiple Dry-Runs:** At least 2 dry-runs are performed. Dry-run 1 identifies major issues. Dry-run 2 confirms fixes. Additional dry-runs if needed.

### Postconditions

1. Dry-run results inform the go/no-go decision for production migration.
2. A verified rollback mechanism is ready before production migration.

### Acceptance Criteria

- [ ] AC-1: At least 2 full dry-runs are completed before production migration.
- [ ] AC-2: Dry-run results include validation reports, timing data, and client spot-check feedback.
- [ ] AC-3: A pre-migration database backup is created and verified (test restore) before production migration.
- [ ] AC-4: A full rollback can be completed within 4 hours.
- [ ] AC-5: Partial rollback (single data domain) can be completed within 1 hour.
- [ ] AC-6: The dry-run environment mirrors the production schema and infrastructure configuration.

### Dependencies

- All migration requirements (MIG-001 through MIG-007)
- Module 01 (Core Platform): Database backup/restore infrastructure

### Tags

`dry-run`, `rollback`, `staging`, `backup`, `risk-mitigation`

---

## MIG-009: Migration Protocol & Spot-Check Verification

**ID:** MIG-009
**Title:** Migration Protocol & Spot-Check Verification
**Priority:** High
**Complexity:** Low
**Module:** 15 - Data Migration

### Description

Formalize the migration sign-off process with a migration protocol document and a structured spot-check verification procedure. The protocol serves as the contractual acceptance document for the data migration deliverable. The spot-check involves the client verifying a statistically significant sample of migrated records against the source data.

### Actors

- **Migration Engineer** (preparing the protocol and coordinating spot-checks)
- **Client Representative** (performing spot-checks and signing off)
- **Project Manager** (facilitating the sign-off process)

### Preconditions

1. Production migration is complete.
2. Post-migration validation (MIG-007) has passed with acceptable results.
3. The spot-check sample is prepared.

### Flow

**Main Flow:**
1. After the production migration, the migration engineer prepares the migration protocol document containing:
   - Migration scope (source systems, data domains, date ranges)
   - Migration timeline (start, end, duration per domain)
   - Record counts (source vs. target per domain)
   - Validation report summary (errors, warnings)
   - Known data quality issues from the source (documented and accepted by the client)
   - Exclusions (any data intentionally not migrated and the reason)
2. The migration engineer generates a spot-check sample:
   - For each data domain (addresses, quotations, invoices, plants), select N records randomly (minimum 20 per domain, or 2% of total, whichever is greater, up to a maximum of 100).
   - Provide the client with the selected records' source IDs and a view in the new system to compare.
3. The client performs spot-checks:
   - For each sample record, the client compares the migrated data in the new system against the source record in the legacy system.
   - Discrepancies are logged (field, expected value, actual value).
4. If discrepancies are found:
   - Critical discrepancies (wrong customer linked, missing financial data) are investigated and fixed.
   - Minor discrepancies (formatting differences, truncated comments) are documented and accepted.
5. After all critical discrepancies are resolved, the client signs the migration protocol, formally accepting the migrated data.

**Alternate Flows:**
- **A1 - Spot-Check Failure:** If more than 5% of spot-check records have critical discrepancies, the migration is considered failed. A re-migration or targeted fix is required before re-verification.
- **A2 - Conditional Acceptance:** The client may accept the migration with documented exceptions (e.g., "Address data accepted; quotation migration to be re-done for 2024 records").

### Postconditions

1. The migration protocol is signed by both parties.
2. All critical discrepancies are resolved.
3. The migration deliverable is formally accepted.

### Acceptance Criteria

- [ ] AC-1: A migration protocol document is produced containing scope, timeline, record counts, and validation summary.
- [ ] AC-2: A spot-check sample of at least 20 records per data domain is provided to the client.
- [ ] AC-3: The client spot-check achieves at least 95% accuracy (less than 5% of spot-check records have critical discrepancies).
- [ ] AC-4: All critical discrepancies identified during spot-check are resolved before sign-off.
- [ ] AC-5: The migration protocol is signed by the client representative, constituting formal acceptance.

### Dependencies

- All migration requirements (MIG-001 through MIG-008)

### Tags

`protocol`, `sign-off`, `spot-check`, `verification`, `acceptance`, `contractual`

---

## MIG-010: Migration Progress Reporting

**ID:** MIG-010
**Title:** Migration Progress Reporting
**Priority:** Medium
**Complexity:** Low
**Module:** 15 - Data Migration

### Description

Provide real-time progress reporting during migration execution, showing the status, record counts, error rates, and estimated completion time for each data domain. This enables the migration engineer and project manager to monitor the migration and identify issues early.

### Actors

- **Migration Engineer** (monitoring progress)
- **Project Manager** (tracking overall migration status)
- **System** (recording and displaying progress metrics)

### Preconditions

1. The ETL pipeline is instrumented with progress tracking hooks.

### Flow

**Main Flow:**
1. When a migration run is initiated, a progress dashboard is available (web-based or console-based).
2. The dashboard displays, for each data domain:
   - Total source records to process
   - Records processed so far
   - Records successfully migrated
   - Records failed (errors)
   - Records with warnings
   - Current processing rate (records/second)
   - Estimated time remaining
   - Overall progress percentage
3. The dashboard updates in real-time (every 5 seconds or per batch completion).
4. Upon completion, a final summary is displayed and logged.

**Alternate Flows:**
- **A1 - Alerting:** If the error rate for a data domain exceeds a configurable threshold (default 5%), the migration engineer is alerted and can pause/stop the migration.
- **A2 - Resume:** If a migration is paused or interrupted, the progress tracker shows where it stopped and supports resuming from the last successful batch.

### Postconditions

1. Progress data is available in real-time during migration execution.
2. A final summary report is generated and stored.

### Acceptance Criteria

- [ ] AC-1: The progress dashboard shows real-time status for each data domain during migration.
- [ ] AC-2: Progress includes record counts (total, processed, success, error, warning) and processing rate.
- [ ] AC-3: Estimated time remaining is displayed and updated as the migration progresses.
- [ ] AC-4: An alert is triggered if the error rate exceeds 5% for any data domain.
- [ ] AC-5: A final summary report is generated at the end of the migration run.
- [ ] AC-6: The migration can be paused and resumed without data loss or duplication.

### Dependencies

- All migration requirements (MIG-001 through MIG-006)
- MIG-007: Error counting for progress metrics

### Tags

`progress`, `monitoring`, `dashboard`, `reporting`, `real-time`
