# Business type defect: Maps action text persisted instead of Hotel

Status: source fix implemented and tested; production deployment and data repair have not been performed in this workspace.

## Root cause and trace

The text “Add a label” in the screenshot is a Google Maps action, not a CRM placeholder for an empty category. The CRM Type column reads `sourceMetadata.businessType`; the generic `business` value underneath is the separate lead kind.

The defect was reproduced in tests before changing the implementation:

1. Google Maps reused `.DkEaL` on an action control. The adapter accepted the first matching node as a category.
2. The extension's category checks rejected reviews and other metadata, but did not reject “Add a label”. Consequently that nonempty value outranked the saved `discoveryCategories: ['Hotel']` fallback.
3. The backend applied the same incomplete category checks and persisted the action as `sourceMetadata.businessType`.
4. Re-import enrichment considered the polluted value valid, so it did not replace it. Migration 041 likewise could not recognize this action as invalid.
5. The CRM formatter displayed the stored value directly and did not fall back to saved discovery types.

The initial regression run failed four action-label cases in both extension serialization and server category resolution. After the fix those cases pass, including the specific selected-Hotel scenario tested through real persistence.

## Fix

- Maps extraction prefers explicit category controls, rejects recognized label actions, and continues searching for a real category rather than accepting the first matching CSS class.
- A pure extension category validator rejects action text in both newly extracted and previously saved records. JSON and CSV imports retain the per-lead selected category. Supported variations include capitalization, plus signs, localized label actions and underscore/hyphen forms.
- The server rejects those actions independently, including payloads sent by an older extension. It resolves Hotel from saved discovery provenance and accepts both string and `{ id, name }` discovery-type entries.
- Re-imports repair invalid category values and restore missing extension discovery provenance. Valid categories and more specific labels remain intact. Bulk insertion and duplicate detection remain in place.
- The CRM label helper suppresses the action text and reads saved discovery type IDs/names when the primary value is unavailable, so table/card/map/detail views use the same fallback. The actual Type column is tested, not just the formatter.
- The classic content-script build guard checks Rollup import metadata. Browser regression checks parse the final bundle as a classic script, preventing minified ESM imports from slipping into a Manifest V3 content script.

## Existing records

New migration: `server/src/migrations/044_extension_maps_action_business_type.js`.

It repairs invalid/missing business types only for proven extension records with saved discovery provenance. It batches database writes, protects against concurrent edits, leaves manual and deleted leads alone, and logs repaired/unrecoverable counts. Re-running it does not change already repaired records. This is a new migration because 041 may already be marked applied.

A tested fixture containing seven records repaired three recoverable entries, preserved a valid Boutique hotel, preserved manual/deleted records, and reported one entry without enough evidence. A second run repaired zero records. Records without saved category evidence are deliberately not classified by guessing from their business name; re-importing with the saved single-type search or supplying the correct category is required for those records.

## Verification

- Extension: 152 tests pass, including category extraction, original search-context recovery, JSON/CSV payloads, mixed campaigns, import cancellation and recovery. Type checking and production ZIP packaging pass.
- CRM frontend: 54 relevant tests pass, including API normalization, selected-Hotel recovery and rendering the actual Type column. Full frontend TypeScript checking passes.
- Server: 90 relevant tests pass, covering category resolution, label normalization, HTTP validation, actual MongoDB single/bulk imports, CRM list responses and Hotel filter options, existing-lead re-imports, CSV fallback, provenance, idempotent historical repair, mixed categories and preserved bulk-import behavior.
- The exact Hotel import is verified for both one record and ten records through HTTP → real isolated MongoDB → CRM list/filter response.
- Chrome package checks use local fixtures and an isolated browser profile. They test “Add a label” alone, action text before a genuine Hotel category, explicit category priority and the saved-record Hotel fallback in the extension UI.

No live CRM database was inspected or modified, and no production account was used. Deploy the updated backend and CRM frontend, apply migration 044, then reload the updated extension. The corrected extension package is `lead-finder-extension.zip`.
