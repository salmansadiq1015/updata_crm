# Module 15: Data Migration

## 1. Purpose

Technical migration of legacy data from the client's (MB Boiler & Heizung AG) existing systems into the new ERP/Field-Service platform. This is a one-time migration effort executed during the implementation phase, not an ongoing synchronization. The goal is to ensure business continuity by transferring all historically relevant data -- customer records, quotations, invoices, and plant/installation data -- so that the new platform starts with a complete operational dataset.

## 2. Scope

### In Scope

- **OF Software Data Extraction & Import:** Migration of operational data from the client's existing OF (Orgafile/field-service) software, including addresses, orders, plant data, and historical service records.
- **Messerli CRM Data Extraction & Import:** Migration of customer relationship data from the Messerli CRM system, including contact records, communication history, and customer classifications.
- **Address Data Migration:** All customer, supplier, partner, and internal contact addresses from both source systems. Includes deduplication across systems where the same entity exists in both OF and Messerli.
- **Quotation Data Migration:** Historical quotations with line items, statuses, and associated documents.
- **Invoice Data Migration:** Historical invoices (both customer invoices and supplier invoices where available) with line items, payment status, and associated documents.
- **Plant/Installation Data Migration:** Heating system and installation records, including equipment details, location, installation dates, maintenance history, and warranty information.
- **Data Validation & Integrity Checks:** Automated validation of migrated data against business rules and referential integrity constraints.
- **Migration Dry-Run & Rollback:** Ability to perform full migration dry-runs in a staging environment and roll back migrated data if issues are discovered.
- **Migration Protocol & Spot-Check Verification:** Formal sign-off process with the client, including spot-check verification of migrated data accuracy.

### Data Sources

| Source System | Data Types | Format |
|---|---|---|
| OF Software | Addresses, orders, plant data, service history | Database export (CSV/SQL/proprietary) |
| Messerli CRM | Contacts, communication history, classifications | Database export (CSV/SQL/proprietary) |
| Other agreed sources | As contractually agreed | TBD |

### Contractual Provisions (SOW Section 13)

> "Client shall provide source data in evaluable form, complete and on schedule."

This means:
- The client is responsible for exporting data from legacy systems in a format that can be programmatically processed (CSV, SQL dump, structured export).
- The client ensures the exported data is complete (no missing tables or truncated records).
- The client delivers the data according to the agreed migration timeline.

> "Professional cleansing of materially incorrect, incomplete, or duplicate legacy data is only owed where expressly agreed."

This means:
- The migration service will transfer data as-is from the source systems.
- If the source data contains errors (wrong phone numbers, misspelled names), incorrect classifications, or incomplete records, the migration service is NOT responsible for fixing these unless specifically contracted.
- Deduplication of records that exist in both source systems IS in scope (cross-system deduplication), but deduplication of duplicates within a single source system is only performed if agreed.

## 3. Boundaries

- **One-time effort, NOT ongoing sync.** After the migration is complete and signed off, there is no continuous data synchronization between legacy systems and the new platform. Any new data entered in legacy systems after the migration cutoff date is the client's responsibility to enter manually in the new system.
- **Data quality of source data is the client's responsibility.** The migration service validates data format and referential integrity but does not verify the business accuracy of the source data.
- **Document file migration scope is limited.** Physical document files (PDFs, images) are migrated only if they are accessible and referenced in the source data exports. Orphaned files or files in undocumented storage locations are out of scope.
- **Legacy system access is the client's responsibility.** The client must provide access to legacy systems, databases, and documentation needed for data extraction.

## 4. Requirements Summary

| Req ID | Title | Priority | Complexity |
|---|---|---|---|
| MIG-001 | OF Software Data Extraction & Import | High | High |
| MIG-002 | Messerli CRM Data Extraction & Import | High | High |
| MIG-003 | Address Data Migration | High | Medium |
| MIG-004 | Quotation Data Migration | High | Medium |
| MIG-005 | Invoice Data Migration | High | Medium |
| MIG-006 | Plant/Installation Data Migration | High | High |
| MIG-007 | Data Validation & Integrity Checks | High | Medium |
| MIG-008 | Migration Dry-Run & Rollback | Medium | Medium |
| MIG-009 | Migration Protocol & Spot-Check Verification | High | Low |
| MIG-010 | Migration Progress Reporting | Medium | Low |

## 5. Key Dependencies

| Module | Relationship |
|---|---|
| 01 - Core Platform | Target database schema, user accounts for migration |
| 02 - CRM | Target schema for customer/contact records |
| 03 - Order Management | Target schema for orders (if historical orders are migrated) |
| 06 - Plant Management | Target schema for plant/installation records |
| 07 - Quotations | Target schema for quotation records |
| 10 - Finance | Target schema for invoice records |
| 14 - Integrations | Cloud storage for document file migration |

## 6. Migration Timeline (Typical)

| Phase | Duration | Activities |
|---|---|---|
| 1. Analysis | 2 weeks | Source data analysis, schema mapping, gap identification |
| 2. ETL Development | 3-4 weeks | Build extraction scripts, transformation logic, load procedures |
| 3. Dry-Run 1 | 1 week | First full migration in staging, identify issues |
| 4. Fix & Iterate | 1-2 weeks | Fix mapping issues, handle edge cases |
| 5. Dry-Run 2 | 1 week | Second full migration, client spot-check |
| 6. Production Migration | 1-2 days | Final production migration during cutover weekend |
| 7. Verification & Sign-Off | 1 week | Client verification, formal sign-off |

## 7. Non-Functional Requirements

- **Performance:** Full migration must complete within the agreed cutover window (typically a weekend: Friday evening to Sunday evening).
- **Idempotency:** The migration process must be re-runnable without creating duplicate data. Each run should be a clean migration (truncate and re-import, or upsert with unique keys).
- **Auditability:** Every record migrated must be traceable to its source record (source system, source ID). Migration logs must be retained for at least 1 year.
- **Data Integrity:** Foreign key relationships must be preserved or remapped. No orphaned records in the target system.
- **Rollback:** A complete rollback to pre-migration state must be possible within 4 hours of the migration completion.
