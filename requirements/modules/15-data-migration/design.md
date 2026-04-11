# Module 15: Data Migration - Technical Design

## 1. Architecture Overview

The data migration follows an **ETL (Extract-Transform-Load) pipeline** architecture. Each source system and data domain has its own pipeline stage, orchestrated by a central migration runner. The pipeline is designed for idempotent execution, detailed progress tracking, and rollback capability.

```
+------------------+     +------------------+     +------------------+
| Source Systems   |     | Migration        |     | Target Platform  |
|                  |     | Pipeline         |     |                  |
| +- OF Software   |---->| +- Staging DB    |---->| +- CRM (02)      |
| |  (DB export)   |     | +- ETL Engine    |     | +- Orders (03)   |
| +- Messerli CRM  |---->| +- Validators    |---->| +- Plants (06)   |
| |  (CSV/SQL)     |     | +- Deduplicator  |     | +- Quotes (07)   |
| +- Documents     |---->| +- Progress Mgr  |---->| +- Finance (10)  |
|    (Files)       |     | +- Error Handler |     | +- Storage (14)  |
+------------------+     +------------------+     +------------------+
                                |
                          +------------------+
                          | Reports &        |
                          | Audit Logs       |
                          +------------------+
```

### Design Principles

1. **Idempotent Execution:** Every migration run produces the same result regardless of how many times it is executed. Target tables are cleared (or upserted by unique key) at the start of each run.
2. **Domain Independence:** Each data domain (addresses, quotations, invoices, plants) has its own pipeline that can be run independently, though execution order matters for referential integrity.
3. **Source Traceability:** Every migrated record retains a reference to its source system and source ID.
4. **Fail-Safe:** Errors on individual records do not halt the pipeline. They are logged, and the pipeline continues with the next record. The pipeline halts only if the error rate exceeds a configurable threshold.
5. **Deterministic Order:** Migration domains run in a defined order to satisfy foreign key dependencies.

### Execution Order

```
Phase 1: Reference Data
  1.1  Equipment types, manufacturers (manual/config)
  1.2  Article master (if applicable)

Phase 2: Core Entities
  2.1  Addresses/Contacts from OF (MIG-001 -> MIG-003)
  2.2  Addresses/Contacts from Messerli with deduplication (MIG-002 -> MIG-003)

Phase 3: Operational Data
  3.1  Plants/Installations (MIG-006) -- depends on Phase 2
  3.2  Quotations (MIG-004) -- depends on Phase 2
  3.3  Invoices (MIG-005) -- depends on Phase 2

Phase 4: Historical/Supplementary
  4.1  Maintenance history (part of MIG-006) -- depends on Phase 3.1
  4.2  Payment records (part of MIG-005) -- depends on Phase 3.3
  4.3  Document files migration -- depends on all phases
```

---

## 2. Data Models

### 2.1 Migration Run

```
Table: migration_runs
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Run identifier                       |
| run_type            | VARCHAR(20)                | dry_run, production                  |
| environment         | VARCHAR(20)                | staging, production                  |
| status              | VARCHAR(20)                | pending, running, completed, failed, |
|                     |                            | paused, cancelled                    |
| started_at          | TIMESTAMP WITH TZ          | Run start time                       |
| completed_at        | TIMESTAMP WITH TZ          | Run completion time                  |
| started_by          | VARCHAR(100)               | Migration engineer username          |
| source_data_date    | DATE                       | Date of source data export           |
| config              | JSONB                      | Run configuration (thresholds,       |
|                     |                            | scope filters, etc.)                 |
| pre_backup_ref      | VARCHAR(255)               | Reference to pre-migration backup    |
| notes               | TEXT                       | Run notes                            |
+---------------------+----------------------------+--------------------------------------+
```

### 2.2 Migration Domain Status

```
Table: migration_domain_statuses
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Record identifier                    |
| run_id              | UUID (FK -> migration_runs)| Parent run                           |
| domain              | VARCHAR(50)                | addresses_of, addresses_messerli,    |
|                     |                            | quotations, invoices, plants,        |
|                     |                            | maintenance_history, documents       |
| status              | VARCHAR(20)                | pending, running, completed, failed  |
| total_source        | INTEGER                    | Total source records                 |
| processed           | INTEGER DEFAULT 0          | Records processed so far             |
| migrated_ok         | INTEGER DEFAULT 0          | Successfully migrated                |
| migrated_warning    | INTEGER DEFAULT 0          | Migrated with warnings               |
| skipped             | INTEGER DEFAULT 0          | Skipped (non-blocking errors)        |
| failed              | INTEGER DEFAULT 0          | Failed (blocking errors)             |
| deduplication_merged| INTEGER DEFAULT 0          | Records merged (dedup)               |
| started_at          | TIMESTAMP WITH TZ          | Domain start time                    |
| completed_at        | TIMESTAMP WITH TZ          | Domain completion time               |
| error_rate          | DECIMAL(5,2)               | Current error rate percentage        |
| processing_rate     | DECIMAL(10,2)              | Records per second                   |
+---------------------+----------------------------+--------------------------------------+
Indexes: (run_id, domain)
```

### 2.3 Migration Error Log

```
Table: migration_errors
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Error record identifier              |
| run_id              | UUID (FK -> migration_runs)| Parent run                           |
| domain              | VARCHAR(50)                | Data domain                          |
| severity            | VARCHAR(10)                | error, warning, info                 |
| source_system       | VARCHAR(20)                | of, messerli                         |
| source_id           | VARCHAR(100)               | Source record identifier             |
| source_table        | VARCHAR(100)               | Source table/entity name             |
| error_type          | VARCHAR(50)                | validation_failed, mapping_error,    |
|                     |                            | ref_integrity, format_error,         |
|                     |                            | duplicate, unknown                   |
| error_field         | VARCHAR(100)               | Field that caused the error          |
| error_message       | TEXT                       | Detailed error description           |
| source_value        | TEXT                       | Original value that caused the error |
| suggested_fix       | TEXT                       | Suggested resolution                 |
| resolution_status   | VARCHAR(20)                | open, fixed, accepted, skipped       |
| resolved_by         | VARCHAR(100)               | Who resolved the issue               |
| resolved_at         | TIMESTAMP WITH TZ          | Resolution timestamp                 |
| created_at          | TIMESTAMP WITH TZ          | Error creation timestamp             |
+---------------------+----------------------------+--------------------------------------+
Indexes: (run_id, domain, severity), (run_id, error_type),
         (source_system, source_id)
```

### 2.4 Migration Record Map (Cross-Reference)

```
Table: migration_record_map
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Record identifier                    |
| run_id              | UUID (FK -> migration_runs)| Migration run                        |
| source_system       | VARCHAR(20)                | of, messerli                         |
| source_table        | VARCHAR(100)               | Source table name                    |
| source_id           | VARCHAR(100)               | Source record ID                     |
| target_table        | VARCHAR(100)               | Target table name                    |
| target_id           | UUID                       | Target record ID                     |
| action              | VARCHAR(20)                | created, merged, updated, skipped    |
| created_at          | TIMESTAMP WITH TZ          | Record creation                      |
+---------------------+----------------------------+--------------------------------------+
Indexes: (source_system, source_table, source_id),
         (target_table, target_id),
         (run_id, source_system)
Unique: (source_system, source_table, source_id)
```

### 2.5 Source Record Traceability (Added to Target Tables)

All target tables that receive migrated data include the following columns:

```
Columns added to target tables (e.g., contacts, plants, invoices, quotations):
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| source_system       | VARCHAR(20)                | of, messerli, manual, null           |
| source_id           | VARCHAR(100)               | Original record ID in source system  |
| migrated_at         | TIMESTAMP WITH TZ          | Migration timestamp                  |
| is_migrated         | BOOLEAN DEFAULT false      | Whether record was created by        |
|                     |                            | migration (vs. normal operation)     |
| is_read_only        | BOOLEAN DEFAULT false      | Historical migrated records:         |
|                     |                            | read-only in the UI                  |
+---------------------+----------------------------+--------------------------------------+
```

---

## 3. ETL Pipeline Design

### 3.1 Pipeline Architecture

```
                    +----------------------------------+
                    |        Migration Runner          |
                    |  (orchestrates domain pipelines) |
                    +----------------------------------+
                         |          |          |
              +----------+   +-----+-----+   +----------+
              |              |            |              |
      +-------v------+ +----v------+ +---v--------+ +---v--------+
      | Address       | | Quotation | | Invoice    | | Plant      |
      | Pipeline      | | Pipeline  | | Pipeline   | | Pipeline   |
      +-------+------+ +----+------+ +---+--------+ +---+--------+
              |              |            |              |
      +-------v------+ +----v------+ +---v--------+ +---v--------+
      | Extractor    | | Extractor | | Extractor  | | Extractor  |
      | (OF/Messerli)| | (OF)      | | (OF)       | | (OF)       |
      +-------+------+ +----+------+ +---+--------+ +---+--------+
              |              |            |              |
      +-------v------+ +----v------+ +---v--------+ +---v--------+
      | Transformer  | | Transform.| | Transform. | | Transform. |
      | (normalize,  | | (map cust,| | (map cust, | | (map cust, |
      |  dedup)      | |  articles)| |  payments) | |  equipment)|
      +-------+------+ +----+------+ +---+--------+ +---+--------+
              |              |            |              |
      +-------v------+ +----v------+ +---v--------+ +---v--------+
      | Validator    | | Validator | | Validator  | | Validator  |
      +-------+------+ +----+------+ +---+--------+ +---+--------+
              |              |            |              |
      +-------v------+ +----v------+ +---v--------+ +---v--------+
      | Loader       | | Loader    | | Loader     | | Loader     |
      | (upsert to   | | (insert   | | (insert    | | (insert    |
      |  CRM DB)     | |  to DB)   | |  to DB)    | |  to DB)    |
      +--------------+ +-----------+ +------------+ +------------+
```

### 3.2 Extractor Interface

Each source system has an extractor implementation:

```
Interface: DataExtractor
  - getSourceName() -> string              // "of" or "messerli"
  - getDomains() -> string[]              // ["addresses", "quotations", ...]
  - getTotalCount(domain) -> number       // Total records for progress calc
  - extractBatch(domain, offset, limit)   // Returns batch of source records
    -> SourceRecord[]
  - getSchema(domain) -> FieldDef[]       // Source schema description
```

**OF Software Extractor:**
- Reads from SQL database dump (loaded into staging PostgreSQL)
- Supports tables: `adressen`, `auftraege`, `anlagen`, `wartungen`, `offerten`, `rechnungen`

**Messerli CRM Extractor:**
- Reads from CSV exports or SQL dump
- Supports tables: `kontakte`, `kommunikation`, `klassifikationen`

### 3.3 Transformer Interface

```
Interface: DataTransformer
  - transform(sourceRecord, context) -> TransformedRecord | Error
  - context includes:
    - recordMap (for foreign key resolution)
    - referenceData (equipment types, status mappings, etc.)
    - deduplicationIndex (for address dedup)
```

### 3.4 Key Transformation Rules

#### Address Normalization

```
Input (OF):  "Bahnhofstr. 1, 8001 Zürich"
Output:      { street: "Bahnhofstrasse", house_number: "1",
               zip: "8001", city: "Zurich", canton: "ZH", country: "CH" }

Phone Normalization:
  "079 123 45 67"  ->  "+41791234567"
  "0041 79 123 45 67" -> "+41791234567"
  "044 123 45 67"  ->  "+41441234567"
  "+41 79 123 45 67"  -> "+41791234567"
```

#### Status Mapping Tables

```
OF Quotation Status -> Target Status:
  "E" (Erstellt)     -> "draft"
  "G" (Gesendet)     -> "sent"
  "A" (Angenommen)   -> "accepted"
  "X" (Abgelehnt)    -> "rejected"
  "V" (Verfallen)    -> "expired"

OF Invoice Status -> Target Status:
  "O" (Offen)        -> "open"
  "T" (Teilbezahlt)  -> "partially_paid"
  "B" (Bezahlt)      -> "paid"
  "M" (Mahnung)      -> "overdue"
  "S" (Storniert)    -> "cancelled"
```

#### Deduplication Algorithm (Cross-System)

```
For each Messerli contact:
  1. Exact email match against OF contacts -> MATCH (confidence 1.0)
  2. Exact normalized phone match -> MATCH (confidence 0.95)
  3. Exact (last_name + zip_code) match:
     a. First name Levenshtein distance <= 2 -> MATCH (confidence 0.85)
     b. First name Levenshtein distance <= 4 -> AMBIGUOUS (manual review)
  4. Exact (company_name normalized + zip_code) -> MATCH (confidence 0.90)
  5. No match found -> CREATE NEW (confidence 1.0)

Merge Strategy (when matched):
  - OF data is the primary record (created first)
  - Messerli data supplements empty fields
  - Messerli communication history is appended
  - Both source_system/source_id references are preserved
  - Merge decision is logged in migration_record_map with action "merged"
```

### 3.5 Validator Framework

```
Interface: RecordValidator
  - validate(record, rules) -> ValidationResult
    - errors: ValidationIssue[]    (blocking)
    - warnings: ValidationIssue[]  (non-blocking)
    - info: ValidationIssue[]      (informational)

ValidationIssue:
  - field: string
  - rule: string
  - message: string
  - source_value: any
  - severity: "error" | "warning" | "info"
```

**Validation Rule Categories:**

| Category | Example Rules |
|---|---|
| Required Fields | Contact must have at least name or company_name |
| Format | Phone matches E.164, email matches RFC 5322, ZIP is 4 digits (CH) |
| Referential | Invoice.customer_id exists in contacts table |
| Business Logic | Invoice.total >= 0, quotation.valid_until >= quotation.date |
| Uniqueness | No duplicate (invoice_number, customer_id) combination |
| Cross-Domain | Plant.customer_id matches a migrated contact |
| Financial | Sum(line_items.total) = invoice.subtotal (tolerance CHF 0.05) |

### 3.6 Loader

```
Interface: DataLoader
  - loadBatch(records, options) -> LoadResult
  - options:
    - mode: "insert" | "upsert" | "truncate_and_insert"
    - conflict_key: string[]  // columns for upsert conflict detection
    - batch_size: 500         // records per database transaction
  - LoadResult:
    - inserted: number
    - updated: number
    - skipped: number
    - errors: LoadError[]
```

**Loading Strategy:**
- First run (dry-run 1): `truncate_and_insert` mode
- Subsequent dry-runs: `truncate_and_insert` mode
- Production: `truncate_and_insert` mode (clean target tables before load)
- All loads within database transactions (per batch of 500 records)
- Transaction rollback on any error within a batch

---

## 4. Data Mapping Schemas

### 4.1 OF Addresses -> CRM Contacts (Module 02)

```
Source: OF.adressen
Target: contacts

Mapping:
+---------------------------+---------------------------+------------------------+
| OF Field                  | Target Field              | Transformation         |
+---------------------------+---------------------------+------------------------+
| adr_id                    | source_id                 | Cast to string         |
| (constant)                | source_system             | "of"                   |
| anrede                    | salutation                | Map: H->Herr, F->Frau |
| vorname                   | first_name                | Trim, Title Case       |
| nachname                  | last_name                 | Trim, Title Case       |
| firma                     | company_name              | Trim                   |
| strasse                   | address.street            | Parse street + number  |
| plz                       | address.zip               | Validate against PLZ   |
| ort                       | address.city              | Trim, validate         |
| land                      | address.country           | Map to ISO 3166, def CH|
| telefon                   | phone_primary             | Normalize to E.164     |
| mobile                    | phone_mobile              | Normalize to E.164     |
| email                     | email                     | Lowercase, validate    |
| typ                       | contact_type              | Map: K->customer,      |
|                           |                           | L->supplier, P->partner|
| bemerkung                 | notes                     | Preserve as-is         |
| erstellt_am               | created_at                | Parse date             |
| geaendert_am              | updated_at                | Parse date             |
| aktiv                     | is_active                 | Map: 1->true, 0->false |
+---------------------------+---------------------------+------------------------+
```

### 4.2 OF Plants -> Plant Management (Module 06)

```
Source: OF.anlagen
Target: plants

Mapping:
+---------------------------+---------------------------+------------------------+
| OF Field                  | Target Field              | Transformation         |
+---------------------------+---------------------------+------------------------+
| anl_id                    | source_id                 | Cast to string         |
| (constant)                | source_system             | "of"                   |
| adr_id                    | customer_id               | Lookup in record_map   |
| standort_adr_id           | location_id               | Lookup in record_map   |
| hersteller                | manufacturer              | Normalize manufacturer |
| modell                    | model                     | Trim                   |
| seriennummer              | serial_number             | Trim                   |
| typ                       | equipment_type            | Map to equipment_types |
| brennstoff                | fuel_type                 | Map: G->gas, O->oil,   |
|                           |                           | WP->heat_pump, etc.    |
| leistung_kw               | capacity_kw               | Parse decimal          |
| baujahr                   | manufacture_year          | Parse integer          |
| einbaudatum               | installation_date         | Parse date             |
| garantie_bis              | warranty_expiry           | Parse date             |
| wartungsintervall_monate  | maintenance_interval_months| Parse integer          |
| letzte_wartung            | last_maintenance_date     | Parse date             |
| naechste_wartung          | next_maintenance_date     | Calculate if null:     |
|                           |                           | last + interval        |
| status                    | status                    | Map: A->active,        |
|                           |                           | D->decommissioned,     |
|                           |                           | S->suspended           |
| bemerkung                 | notes                     | Preserve as-is         |
+---------------------------+---------------------------+------------------------+
```

### 4.3 OF Quotations -> Quotations (Module 07)

```
Source: OF.offerten / OF.offerten_positionen
Target: quotations / quotation_line_items

Header Mapping:
+---------------------------+---------------------------+------------------------+
| OF Field                  | Target Field              | Transformation         |
+---------------------------+---------------------------+------------------------+
| off_id                    | source_id                 | Cast to string         |
| off_nr                    | quotation_number          | Preserve               |
| adr_id                    | customer_id               | Lookup in record_map   |
| datum                     | quotation_date            | Parse date             |
| gueltig_bis               | valid_until               | Parse date             |
| status                    | status                    | Map (see status table) |
| netto_betrag              | subtotal                  | Parse decimal          |
| mwst_betrag               | vat_amount                | Parse decimal          |
| mwst_satz                 | vat_rate                  | Parse decimal          |
| brutto_betrag             | total                     | Parse decimal          |
| bemerkung                 | notes                     | Preserve               |
| (constant)                | is_migrated               | true                   |
| (constant)                | is_read_only              | true                   |
+---------------------------+---------------------------+------------------------+

Line Item Mapping:
+---------------------------+---------------------------+------------------------+
| OF Field                  | Target Field              | Transformation         |
+---------------------------+---------------------------+------------------------+
| pos_id                    | source_id                 | Cast to string         |
| off_id                    | quotation_id              | Lookup in record_map   |
| position                  | sort_order                | Parse integer          |
| artikel_nr                | article_number            | Try match in articles  |
| bezeichnung               | description               | Preserve               |
| menge                     | quantity                  | Parse decimal          |
| einheit                   | unit                      | Map: Stk->piece, etc.  |
| einzelpreis               | unit_price                | Parse decimal          |
| rabatt_prozent            | discount_percent          | Parse decimal          |
| betrag                    | total                     | Parse decimal          |
+---------------------------+---------------------------+------------------------+
```

### 4.4 OF Invoices -> Finance (Module 10)

```
Source: OF.rechnungen / OF.rechnungen_positionen / OF.zahlungen
Target: invoices / invoice_line_items / payments

Header Mapping:
+---------------------------+---------------------------+------------------------+
| OF Field                  | Target Field              | Transformation         |
+---------------------------+---------------------------+------------------------+
| rech_id                   | source_id                 | Cast to string         |
| rech_nr                   | invoice_number            | Preserve               |
| adr_id                    | customer_id               | Lookup in record_map   |
| datum                     | invoice_date              | Parse date             |
| faellig_am                | due_date                  | Parse date             |
| status                    | payment_status            | Map (see status table) |
| netto_betrag              | subtotal                  | Parse decimal          |
| mwst_betrag               | vat_amount                | Parse decimal          |
| mwst_satz                 | vat_rate                  | Preserve original rate |
| brutto_betrag             | total                     | Parse decimal          |
| bezahlt_betrag            | paid_amount               | Parse decimal          |
| offener_betrag            | outstanding_amount        | Calculate: total-paid  |
| qr_referenz               | qr_reference              | Preserve               |
| (constant)                | is_migrated               | true                   |
| (constant)                | is_read_only              | true                   |
+---------------------------+---------------------------+------------------------+

Payment Mapping:
+---------------------------+---------------------------+------------------------+
| OF Field                  | Target Field              | Transformation         |
+---------------------------+---------------------------+------------------------+
| zahl_id                   | source_id                 | Cast to string         |
| rech_id                   | invoice_id                | Lookup in record_map   |
| datum                     | payment_date              | Parse date             |
| betrag                    | amount                    | Parse decimal          |
| zahlungsart               | payment_method            | Map: B->bank, K->cash  |
| referenz                  | reference                 | Preserve               |
+---------------------------+---------------------------+------------------------+
```

---

## 5. Rollback Strategy

### 5.1 Pre-Migration Backup

Before production migration:
1. Full PostgreSQL database dump (`pg_dump`) of the target database.
2. Backup stored in two locations (local + cloud storage).
3. Backup integrity verified via `pg_restore --list` (dry-run restore listing).
4. Backup timestamp and checksum recorded in the migration protocol.

### 5.2 Rollback Procedure

```
Full Rollback (< 4 hours):
1. Stop the application (maintenance mode)
2. Restore database from pre-migration backup:
   pg_restore --clean --if-exists --no-owner -d target_db backup.dump
3. Verify table counts match pre-migration state
4. Delete migrated files from cloud storage (batch delete by migration timestamp)
5. Restart application
6. Verify application health checks pass
7. Notify stakeholders

Partial Rollback (< 1 hour):
1. Identify affected target tables
2. Delete records where is_migrated = true in affected tables
3. Delete corresponding records from migration_record_map
4. Verify referential integrity
5. Re-run migration for the specific domain if needed
```

### 5.3 Point-of-No-Return

After the client signs the migration protocol (MIG-009) and production operations begin in the new system:
- Rollback is no longer feasible without data loss (new data entered in the new system would be lost).
- The pre-migration backup is retained for 90 days as a reference copy.

---

## 6. Migration Protocol Template

```
==========================================================
MIGRATION PROTOCOL - MB Boiler & Heizung AG
==========================================================

Migration Run ID: [UUID]
Run Type:         [dry_run / production]
Date:             [Date]
Environment:      [staging / production]
Executed By:      [Migration Engineer Name]

----------------------------------------------------------
1. SCOPE
----------------------------------------------------------
Source Systems:    OF Software, Messerli CRM
Data Domains:     Addresses, Quotations, Invoices,
                  Plants/Installations, Maintenance History
Source Data Date:  [Date of data export]
Cutover Window:   [Start datetime] - [End datetime]

----------------------------------------------------------
2. RECORD COUNTS
----------------------------------------------------------
| Domain             | Source | Migrated | Merged | Errors | Warnings |
|--------------------|--------|----------|--------|--------|----------|
| Addresses (OF)     |        |          |   -    |        |          |
| Addresses (Mess.)  |        |          |        |        |          |
| Quotations         |        |          |   -    |        |          |
| Invoices           |        |          |   -    |        |          |
| Plants             |        |          |   -    |        |          |
| Maint. History     |        |          |   -    |        |          |
| Documents          |        |          |   -    |        |          |
| TOTAL              |        |          |        |        |          |

----------------------------------------------------------
3. TIMING
----------------------------------------------------------
| Domain             | Start    | End      | Duration  |
|--------------------|----------|----------|-----------|
| Addresses (OF)     |          |          |           |
| Addresses (Mess.)  |          |          |           |
| Quotations         |          |          |           |
| Invoices           |          |          |           |
| Plants             |          |          |           |
| TOTAL              |          |          |           |

----------------------------------------------------------
4. VALIDATION SUMMARY
----------------------------------------------------------
Total Validation Errors (blocking):  [count]
Total Validation Warnings:           [count]
Error Rate:                          [percentage]

Top Error Types:
1. [Error type] - [count] occurrences
2. [Error type] - [count] occurrences
3. [Error type] - [count] occurrences

----------------------------------------------------------
5. KNOWN DATA QUALITY ISSUES
----------------------------------------------------------
[List of known issues in source data accepted by client]

----------------------------------------------------------
6. EXCLUSIONS
----------------------------------------------------------
[Data intentionally not migrated and reason]

----------------------------------------------------------
7. SPOT-CHECK RESULTS
----------------------------------------------------------
Sample Size: [N records per domain]
Results:
| Domain      | Checked | OK  | Discrepancies | Critical |
|-------------|---------|-----|---------------|----------|
| Addresses   |         |     |               |          |
| Quotations  |         |     |               |          |
| Invoices    |         |     |               |          |
| Plants      |         |     |               |          |

----------------------------------------------------------
8. SIGN-OFF
----------------------------------------------------------

Client Representative:
Name:       _______________________________
Signature:  _______________________________
Date:       _______________________________

Migration Engineer:
Name:       _______________________________
Signature:  _______________________________
Date:       _______________________________

[ ] Migration accepted without conditions
[ ] Migration accepted with the following conditions:
    _______________________________________________
    _______________________________________________
```

---

## 7. REST API Endpoints (Migration Admin)

These endpoints are available only to administrators during the migration phase.

### 7.1 Migration Runs

```
POST   /api/v1/admin/migration/runs
```
Create a new migration run.

**Request Body:**
```json
{
  "run_type": "dry_run",
  "environment": "staging",
  "source_data_date": "2026-03-20",
  "config": {
    "error_threshold_percent": 5,
    "batch_size": 500,
    "domains": ["addresses_of", "addresses_messerli", "quotations", "invoices", "plants"],
    "scope_filter": {
      "quotations_from_date": "2023-01-01",
      "invoices_from_date": "2022-01-01"
    }
  },
  "notes": "First dry-run with full dataset"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "status": "pending",
  "created_at": "2026-03-28T18:00:00Z"
}
```

```
POST   /api/v1/admin/migration/runs/{runId}/start
POST   /api/v1/admin/migration/runs/{runId}/pause
POST   /api/v1/admin/migration/runs/{runId}/resume
POST   /api/v1/admin/migration/runs/{runId}/cancel
GET    /api/v1/admin/migration/runs/{runId}
GET    /api/v1/admin/migration/runs
```

### 7.2 Migration Progress (Real-Time)

```
GET /api/v1/admin/migration/runs/{runId}/progress
```

**Response (200):**
```json
{
  "run_id": "uuid",
  "status": "running",
  "overall_progress_percent": 62,
  "elapsed_seconds": 3600,
  "estimated_remaining_seconds": 2200,
  "domains": [
    {
      "domain": "addresses_of",
      "status": "completed",
      "total_source": 12500,
      "processed": 12500,
      "migrated_ok": 12380,
      "migrated_warning": 95,
      "failed": 25,
      "processing_rate": 42.5,
      "error_rate": 0.2
    },
    {
      "domain": "plants",
      "status": "running",
      "total_source": 8200,
      "processed": 4100,
      "migrated_ok": 4050,
      "migrated_warning": 35,
      "failed": 15,
      "processing_rate": 28.3,
      "error_rate": 0.37
    }
  ]
}
```

```
WebSocket: ws://host/api/v1/admin/migration/runs/{runId}/progress/live
```
Real-time progress updates via WebSocket (updates every 5 seconds).

### 7.3 Migration Errors

```
GET /api/v1/admin/migration/runs/{runId}/errors?domain={domain}&severity={severity}&error_type={type}&page={n}&per_page={n}
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "domain": "addresses_of",
      "severity": "error",
      "source_system": "of",
      "source_id": "12345",
      "error_type": "format_error",
      "error_field": "phone_primary",
      "error_message": "Phone number '123' could not be normalized to E.164 format",
      "source_value": "123",
      "suggested_fix": "Provide a valid Swiss phone number (e.g., 079 123 45 67)",
      "resolution_status": "open"
    }
  ],
  "summary": {
    "total_errors": 25,
    "by_severity": { "error": 25, "warning": 95 },
    "by_type": { "format_error": 12, "ref_integrity": 8, "validation_failed": 5 }
  },
  "pagination": { "page": 1, "per_page": 50, "total": 25 }
}
```

```
GET /api/v1/admin/migration/runs/{runId}/errors/export?format=csv
```
Export errors as CSV for offline analysis.

### 7.4 Migration Validation Report

```
GET /api/v1/admin/migration/runs/{runId}/validation-report
```

**Response (200):**
```json
{
  "run_id": "uuid",
  "generated_at": "2026-03-28T22:00:00Z",
  "summary": {
    "total_records": 35200,
    "valid": 34800,
    "warnings": 310,
    "errors": 90,
    "error_rate_percent": 0.26
  },
  "by_domain": {
    "addresses_of": { "total": 12500, "valid": 12380, "warnings": 95, "errors": 25 },
    "quotations": { "total": 5200, "valid": 5180, "warnings": 12, "errors": 8 }
  },
  "referential_integrity": {
    "orphaned_quotations": 3,
    "orphaned_invoices": 1,
    "orphaned_plants": 0
  },
  "financial_reconciliation": {
    "source_total_invoices_chf": 2456789.50,
    "target_total_invoices_chf": 2456789.50,
    "difference_chf": 0.00
  }
}
```

### 7.5 Spot-Check Sample Generation

```
POST /api/v1/admin/migration/runs/{runId}/spot-check/generate
```

**Request Body:**
```json
{
  "sample_size_per_domain": 30,
  "domains": ["addresses", "quotations", "invoices", "plants"]
}
```

**Response (200):**
```json
{
  "spot_check_id": "uuid",
  "samples": {
    "addresses": [
      {
        "source_system": "of",
        "source_id": "12345",
        "target_id": "uuid",
        "target_url": "/admin/crm/contacts/uuid"
      }
    ],
    "quotations": [],
    "invoices": [],
    "plants": []
  }
}
```

### 7.6 Rollback

```
POST /api/v1/admin/migration/runs/{runId}/rollback
```

**Request Body:**
```json
{
  "rollback_type": "full",
  "confirmation": "I understand this will restore the database to pre-migration state"
}
```

Partial rollback:
```json
{
  "rollback_type": "partial",
  "domains": ["quotations"],
  "confirmation": "I understand this will delete all migrated quotation records"
}
```

---

## 8. Integration Points

| Integration | Purpose | Details |
|---|---|---|
| PostgreSQL | Staging DB for source data; Target DB for loaded data | Direct database connection |
| Cloud Storage (INT-007) | Store migrated document files (PDFs, images) | Via Module 14 storage connector |
| Source System DB | Read source data from OF/Messerli exports | JDBC/ODBC or CSV file reader |
| Swiss PLZ Directory | Validate postal codes during address normalization | Static reference data (loaded at startup) |

---

## 9. Security Considerations

1. **Source Data Handling:** Source data exports contain personal data (names, addresses, phone numbers, financial data). They must be stored encrypted at rest and deleted from staging after migration completion.
2. **Access Control:** Migration admin endpoints require the `migration.admin` role, which should be granted only to migration engineers during the migration phase and revoked after sign-off.
3. **Audit Trail:** All migration actions (run start, pause, rollback, data modifications) are logged with the executing user and timestamp.
4. **Staging Environment Isolation:** The staging environment must not be accessible from the public internet. Source data in staging must be treated with the same security as production data.
5. **Post-Migration Cleanup:** After successful production migration and sign-off:
   - Delete source data exports from staging
   - Delete staging database
   - Revoke migration admin permissions
   - Retain migration logs and protocol for 1 year
