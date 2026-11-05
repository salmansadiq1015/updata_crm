# CRM batch import performance

The extension now sends up to 500 selected businesses in one request to the existing `/crm/leads/bulk-import` endpoint, matching its current schema limit. Larger selections use checkpointed 500-record batches. Discovery scraping batches remain 25.

Previously the server looped through the selected businesses and awaited address repair, duplicate detection, a second duplicate-warning ladder, individual number allocation, assignment and an individual insertion for each business. The extension also saved each returned status in a separate IndexedDB transaction.

The new multi-record path:

1. Normalizes records and resolves addresses with bounded concurrency, preserving the shared address resolver and field mapping.
2. Looks up all authoritative identities using indexed `$in` queries in one read. Unmatched records use one combined, indexed normalized-name query; raw-name matching is restricted to unnormalized legacy records. The existing strict branch-identity comparison confirms candidates. A shared phone, website or brand does not identify a business by itself.
3. Deduplicates repeated businesses inside the selection before writing.
4. Reserves all lead numbers with one atomic counter increment.
5. Uses the existing bulk-create service and one unordered MongoDB `insertMany`, preserving validation, canonical address/identity hooks, authenticated creator attribution, assignment/SLA behavior and quality hooks.
6. Maps results by server-generated IDs back to the original client IDs. Unique-key races are resolved together. Partial validation/write failures retain their original row indexes, and unconfirmed writes are never shown as successful.
7. Retains re-import enrichment of missing provider details and run-level metrics/auditing. New records retain their identity aliases so a no-op re-import does not need to write them later.
8. Reads and saves selected local records using a single IndexedDB transaction per operation. Cancellation remains cooperative at batch boundaries; checkpoint recovery resends only unconfirmed records.

## Measured local performance

Actual isolated local MongoDB, normal schema validation and indexes, supplied addresses, external geocoding not needed. These are service timings, not production browser-to-server latency:

| Selected records | Measured service time |
| --- | --- |
| 10 | 94 ms |
| 100 | 409 ms |
| 500 | 1,619 ms |

In a warmed 10-record before/after comparison, the prior serial path used 80 database operations and 124 ms; the bulk path used 5 operations and 38 ms. The five operations include identity queries, lead-number reservation, the assignment-policy read and bulk insertion. Different data, enabled assignment policies, database/network latency and required external address repair can take longer.

The one-second target is met locally for the 10-record selection in the reported screenshot and for 100 supplied-address records. It is **not a guaranteed maximum** for arbitrary selections: the 500-record benchmark exceeded one second. No timer or optimistic success state hides this work. Profiling showed that the remaining large-batch CPU cost is primarily Mongoose document construction and validation; those checks were retained.

## Verification and rollout

New coverage verifies one database insert and one number reservation per selection, global and intra-batch duplicates, distinct chain branches, concurrent imports, legacy identity matching, soft deletes, creator attribution, mixed validation/duplicate-key errors and row-order preservation. Extension-worker coverage verifies one request for 100 records, 500/1 chunking for 501 records, missing records/outcomes, cancellation, resume and rejected requests.

Extension type checking, all 144 extension tests, production build and ZIP packaging pass. All 153 targeted server tests pass across the service, real MongoDB import, HTTP route, identity, validation, geography, shared bulk-create, discovery import and index-migration checks. An initial wider run was interrupted during long database-buffer waits in existing shared-service tests; the affected shared-service suite subsequently passed separately.

Deploy the changed CRM backend **and** install/reload the rebuilt extension to obtain the full improvement. The endpoint, permissions and authentication contract are unchanged. The backward-compatible CSV fallback also delegates to the optimized structured import service on the updated backend. Migration `043_lead_import_name_lookup.js` creates the supporting non-unique normalized-name index and must run during backend rollout. No production migration or live lead import was performed.

MongoDB execution-plan verification on 1,000 synthetic records confirmed `lead_import_name_lookup` was used and examined one document to return the one matching business.
