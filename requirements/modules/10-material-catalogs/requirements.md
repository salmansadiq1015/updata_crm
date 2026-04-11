# Module 10: Material Catalogs & Interfaces -- Requirements

---

## MAT-001: Internal Article Catalog Management

| Field | Value |
|-------|-------|
| **ID** | MAT-001 |
| **Title** | Internal Article Catalog Management |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | None (foundational) |
| **Tags** | `catalog`, `articles`, `back-office`, `core` |

### Description
The system shall provide a centralized internal article catalog that serves as the single source of truth for all materials, services, and articles used by MB Boiler & Heizung AG. The catalog supports hierarchical categorization, article metadata, and versioning of catalog entries.

### Actors
- **Back-office administrator** -- creates and maintains the catalog structure.
- **System** -- enforces uniqueness constraints and maintains audit trail.

### Preconditions
1. User is authenticated and has the `catalog:manage` permission.
2. At least one category exists in the catalog (root category created at system initialization).

### Main Flow
1. Administrator navigates to the catalog management section.
2. System displays the catalog tree with categories and article counts.
3. Administrator selects a category or creates a new one.
4. Administrator defines category attributes (name, code, parent category, description, sort order).
5. System validates uniqueness of category code within the catalog.
6. System saves the category and updates the catalog tree.
7. System logs the change in the audit trail.

### Alternate Flows
- **AF-1: Duplicate category code** -- System displays a validation error; administrator must choose a unique code.
- **AF-2: Move category** -- Administrator drags a category to a new parent; system re-parents all child categories and articles.
- **AF-3: Deactivate category** -- Administrator marks a category as inactive; articles within remain accessible but the category is hidden from new article creation.

### Postconditions
- Catalog structure is persisted with the new/updated category.
- Audit log entry records the actor, timestamp, and change details.

### Acceptance Criteria
1. A new category can be created with name, code, parent, and description; it appears in the catalog tree within 2 seconds.
2. Category codes are unique across the entire catalog; duplicate codes are rejected with a clear error message.
3. Moving a category preserves all child categories and article associations.
4. Deactivated categories are excluded from category selection dropdowns but existing articles remain searchable.
5. The catalog supports at least 5 levels of nesting.
6. All catalog structure changes are recorded in the audit log with actor, timestamp, and before/after values.

---

## MAT-002: Material & Service CRUD

| Field | Value |
|-------|-------|
| **ID** | MAT-002 |
| **Title** | Material & Service CRUD |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | MAT-001, MAT-008 |
| **Tags** | `catalog`, `articles`, `CRUD`, `core` |

### Description
The system shall support full create, read, update, and delete (soft-delete) operations for catalog articles. Articles represent physical materials (pipes, fittings, boiler components) and services (labour hours, commissioning, maintenance packages). Each article has a unique article number, description, category, unit of measure, and base price.

### Actors
- **Back-office administrator** -- performs CRUD operations.
- **Sales staff** -- reads article data.
- **Field technician** -- reads article data on mobile.

### Preconditions
1. User is authenticated with appropriate permissions (`catalog:manage` for CUD, `catalog:read` for R).
2. At least one catalog category exists (MAT-001).
3. At least one unit of measure is defined (MAT-008).

### Main Flow
1. Administrator opens the article management view.
2. Administrator clicks "Create Article."
3. System presents the article form with fields: article number, name, description, category, type (Material / Service), unit of measure, base price (CHF), supplier reference (optional), IGH article number (optional), status (Active/Inactive), image upload.
4. Administrator fills in required fields and submits.
5. System validates: article number uniqueness, required fields present, price >= 0.
6. System saves the article and assigns a creation timestamp.
7. System confirms creation with a success message.

### Alternate Flows
- **AF-1: Edit article** -- Administrator selects an existing article, modifies fields, saves. System creates a version snapshot before applying changes.
- **AF-2: Soft-delete article** -- Administrator marks an article as deleted. Article is excluded from search results and selection lists but historical references (past quotations, orders) remain intact.
- **AF-3: Bulk import** -- Administrator uploads a CSV/Excel file; system validates each row, creates articles, and reports errors per row.
- **AF-4: Duplicate article number** -- System rejects with a validation error.

### Postconditions
- Article is persisted in the catalog with all metadata.
- Version history is maintained for edited articles.
- Soft-deleted articles are flagged but not physically removed.

### Acceptance Criteria
1. An article can be created with all required fields; the article is immediately searchable.
2. Editing an article creates a version history entry; the previous version is retrievable.
3. Soft-deleted articles do not appear in search results or selection lists.
4. Soft-deleted articles remain visible in historical quotation/order line items.
5. Bulk import of 1,000 articles completes within 30 seconds and reports per-row errors.
6. Article images are stored and displayed as thumbnails (max 2 MB per image).
7. Article number format supports alphanumeric values up to 20 characters.

---

## MAT-003: Article Usage in Quotations/Orders/Reports

| Field | Value |
|-------|-------|
| **ID** | MAT-003 |
| **Title** | Article Usage in Quotations/Orders/Reports |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | MAT-001, MAT-002, Module 03, Module 04, Module 07 |
| **Tags** | `catalog`, `quotation`, `order`, `report`, `integration` |

### Description
The system shall allow users to select articles from the internal catalog (and IGH catalog) when creating or editing quotation line items, order material lists, and field-service report material consumption entries. The selected article's current catalog data (name, description, price, unit) is copied into the line item at the time of selection, creating a snapshot that is independent of future catalog changes.

### Actors
- **Sales staff** -- selects articles for quotation line items.
- **Project manager** -- selects articles for order material planning.
- **Field technician** -- logs consumed materials in service reports.

### Preconditions
1. User is authenticated and working within a quotation, order, or report.
2. The catalog contains at least one active article.

### Main Flow
1. User opens the line-item editor within a quotation, order, or report.
2. User clicks "Add Article" or begins typing in the article search field.
3. System presents a searchable article picker with filters (category, type, keyword).
4. User selects an article from the results.
5. System copies the article's current data (number, name, description, unit, base price) into the line item.
6. User adjusts quantity and optionally overrides the description or price.
7. System calculates line total (quantity x unit price).
8. User saves the line item.

### Alternate Flows
- **AF-1: Free-text line item** -- User opts to create a line item without a catalog article (manual entry). No catalog link is stored.
- **AF-2: Article price changed after selection** -- The line-item snapshot retains the price at selection time. A visual indicator shows if the current catalog price differs.
- **AF-3: Article not found** -- User can request a new article be added to the catalog (triggers a notification to catalog administrators).

### Postconditions
- Line item is saved with a snapshot of the article data and a reference to the source article ID.
- Quantity and calculated total are persisted.
- The catalog article's "last used" timestamp is updated.

### Acceptance Criteria
1. Article picker loads results within 1 second for catalogs up to 50,000 articles.
2. Selected article data is snapshotted; changing the catalog price afterward does not alter existing line items.
3. A price-drift indicator appears on line items where the catalog price has changed since selection.
4. Free-text line items can be created without a catalog reference.
5. Article picker is available in quotation, order, and report contexts with identical behavior.
6. Quantity supports decimal values with up to 3 decimal places.
7. The article picker supports barcode/QR scan input on mobile devices.

---

## MAT-004: Text Blocks with Prices

| Field | Value |
|-------|-------|
| **ID** | MAT-004 |
| **Title** | Text Blocks with Prices |
| **Priority** | Medium |
| **Complexity** | Low |
| **Dependencies** | MAT-001 |
| **Tags** | `catalog`, `text-blocks`, `quotation`, `templates` |

### Description
The system shall support reusable text blocks -- predefined descriptive text passages (e.g., standard service descriptions, scope-of-work clauses, warranty terms) that optionally carry an associated price. Text blocks can be inserted into quotations, orders, and reports as line items or supplementary text.

### Actors
- **Back-office administrator** -- creates and maintains text blocks.
- **Sales staff** -- inserts text blocks into quotations.
- **Field technician** -- inserts text blocks into service reports.

### Preconditions
1. User has `catalog:manage` permission for CUD operations or `catalog:read` for selection.
2. At least one text block category exists.

### Main Flow
1. Administrator navigates to the text block management section.
2. Administrator creates a new text block with: title, category, body text (rich text), optional price (CHF), optional unit, status (Active/Inactive).
3. System saves the text block.
4. A user in a quotation/order/report opens the text block picker.
5. User searches or browses text blocks by category.
6. User selects a text block; system inserts the title, body text, and price into the document.
7. User may edit the inserted text without affecting the source text block.

### Alternate Flows
- **AF-1: Text block without price** -- Block is inserted as descriptive text only; no price line is added.
- **AF-2: Update source text block** -- Updating a text block does not retroactively change previously inserted instances.

### Postconditions
- Text block is stored in the catalog with all metadata.
- Inserted instances are independent copies.

### Acceptance Criteria
1. Text blocks can be created with rich text (bold, italic, bullet lists) and an optional price.
2. Inserting a text block into a quotation copies the content; subsequent edits to the source do not affect the inserted copy.
3. Text blocks are searchable by title and body content.
4. Text blocks can be categorized and filtered by category.
5. At least 500 text blocks are supported without performance degradation in the picker.

---

## MAT-005: IGH Industry Catalog Interface

| Field | Value |
|-------|-------|
| **ID** | MAT-005 |
| **Title** | IGH Industry Catalog Interface |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | MAT-001, MAT-002 |
| **Tags** | `catalog`, `IGH`, `integration`, `import`, `third-party` |

### Description
The system shall interface with the IGH (Interessengemeinschaft Haustechnik) industry catalog to import and synchronize HVAC articles, technical specifications, and pricing data. The interface supports initial full import and incremental delta updates. Scope is contingent on IGH providing adequate technical documentation, API access, and licenses in a timely manner.

### Actors
- **Back-office administrator** -- initiates imports, reviews and approves imported data.
- **System** -- executes scheduled sync jobs.

### Preconditions
1. IGH catalog access credentials and technical documentation have been provided.
2. IGH catalog format (XML, CSV, API) is documented and accessible.
3. Network connectivity to the IGH data source is available.

### Main Flow
1. Administrator navigates to the IGH integration settings.
2. Administrator configures connection parameters (endpoint URL, credentials, sync schedule).
3. Administrator initiates a full import.
4. System connects to the IGH data source and downloads the catalog data.
5. System parses and validates the data against the internal article schema.
6. System presents a preview of new, updated, and obsolete articles with counts.
7. Administrator reviews and confirms the import.
8. System creates or updates internal catalog articles with IGH data, tagging them with the IGH source identifier.
9. System logs the import result (articles created, updated, skipped, errors).

### Alternate Flows
- **AF-1: Scheduled delta sync** -- System runs an automated incremental sync at the configured interval. Only changed articles are processed. Errors are logged and an alert is sent to administrators.
- **AF-2: Connection failure** -- System retries up to 3 times with exponential backoff. If all retries fail, an error notification is sent to administrators.
- **AF-3: Data validation errors** -- Articles that fail validation are skipped and reported in the import log. Valid articles are imported normally.
- **AF-4: IGH documentation unavailable** -- Feature is disabled with a configuration flag; the system displays a notice explaining the dependency.

### Postconditions
- IGH articles are imported into the internal catalog with source tracking.
- Import log records all operations and errors.
- Administrators are notified of import results.

### Acceptance Criteria
1. A full import of up to 100,000 IGH articles completes within 10 minutes.
2. Delta sync identifies and processes only changed articles since the last sync.
3. Each imported article retains the IGH article number as a secondary identifier.
4. Import preview shows accurate counts of new, updated, and obsolete articles before confirmation.
5. Connection failures trigger up to 3 retries and then an administrator notification.
6. Validation errors are logged per article with the specific field and error reason.
7. The IGH integration can be disabled without affecting the rest of the catalog functionality.

---

## MAT-006: Catalog Search & Filtering

| Field | Value |
|-------|-------|
| **ID** | MAT-006 |
| **Title** | Catalog Search & Filtering |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | MAT-001, MAT-002 |
| **Tags** | `catalog`, `search`, `UX` |

### Description
The system shall provide full-text search and faceted filtering across all catalog articles (internal and IGH-sourced). Search shall support article number, name, description, and supplier reference. Filtering shall support category, article type, price range, status, and source (internal vs. IGH).

### Actors
- **All catalog users** -- search for articles during any catalog interaction.

### Preconditions
1. User is authenticated.
2. Catalog contains at least one article.

### Main Flow
1. User enters a search query in the catalog search bar.
2. System performs a full-text search across indexed fields.
3. System returns results ranked by relevance, displaying article number, name, category, price, and status.
4. User applies one or more filters (category, type, price range, status, source).
5. System narrows results according to applied filters.
6. User selects an article to view details.

### Alternate Flows
- **AF-1: No results** -- System displays "No articles found" with suggestions (check spelling, broaden filters).
- **AF-2: Barcode/QR scan** -- On mobile, user scans a barcode; system searches by article number or EAN code.
- **AF-3: Recent searches** -- System shows the user's last 10 search queries for quick re-access.

### Postconditions
- Search results are displayed to the user.
- Search query is logged for analytics (anonymized).

### Acceptance Criteria
1. Full-text search returns results within 500 ms for catalogs up to 100,000 articles.
2. Search matches across article number, name, description, and supplier reference fields.
3. Faceted filters (category, type, price range, status, source) can be combined; results update within 500 ms.
4. Partial matches and typo tolerance are supported (e.g., "Heizköper" matches "Heizkörper").
5. Mobile barcode scanning initiates a search by article number.
6. Results pagination supports at least 50 items per page with server-side pagination.

---

## MAT-007: Price Management & Updates

| Field | Value |
|-------|-------|
| **ID** | MAT-007 |
| **Title** | Price Management & Updates |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | MAT-002 |
| **Tags** | `catalog`, `pricing`, `back-office` |

### Description
The system shall support maintaining current base prices for catalog articles and applying bulk price updates. Price history is retained for auditing and analysis. Price updates can be applied individually, by category, or via import. Price changes do not retroactively affect existing quotations, orders, or reports.

### Actors
- **Back-office administrator** -- manages prices.
- **System** -- applies scheduled/bulk updates, maintains price history.

### Preconditions
1. User has `catalog:pricing` permission.
2. Target articles exist in the catalog.

### Main Flow
1. Administrator navigates to the price management section.
2. Administrator selects articles for price update (individual, by category, or via file upload).
3. Administrator enters new prices or a percentage adjustment.
4. System previews the changes: article number, name, old price, new price, delta.
5. Administrator confirms the update.
6. System applies the new prices and records the old prices in the price history table with effective dates.
7. System confirms completion with a summary.

### Alternate Flows
- **AF-1: Percentage adjustment** -- Administrator specifies a percentage increase/decrease; system calculates and rounds new prices to 2 decimal places.
- **AF-2: Scheduled price update** -- Administrator sets a future effective date; system applies the update automatically on that date.
- **AF-3: Rollback** -- Administrator reverts a batch update; system restores previous prices from history.

### Postconditions
- New prices are active in the catalog.
- Price history entries are created with old price, new price, effective date, and actor.

### Acceptance Criteria
1. Individual price updates take effect immediately upon confirmation.
2. Bulk updates of up to 10,000 articles complete within 60 seconds.
3. Price history retains all previous prices with effective date and actor for each article.
4. Scheduled price updates execute automatically on the specified date.
5. A bulk update can be rolled back within 30 days, restoring previous prices.
6. Price change preview is accurate to 2 decimal places in CHF.

---

## MAT-008: Unit of Measure Management

| Field | Value |
|-------|-------|
| **ID** | MAT-008 |
| **Title** | Unit of Measure Management |
| **Priority** | Low |
| **Complexity** | Low |
| **Dependencies** | None |
| **Tags** | `catalog`, `configuration`, `reference-data` |

### Description
The system shall provide management of units of measure (UoM) used in the article catalog and across quotations, orders, and reports. Standard HVAC units shall be pre-configured (pieces, meters, liters, hours, kg, m2, m3, sets). Administrators can add custom units. Each unit has a code, name (DE/FR/IT), and optional conversion factor to a base unit.

### Actors
- **Back-office administrator** -- manages units of measure.
- **System** -- enforces referential integrity (units referenced by articles cannot be deleted).

### Preconditions
1. User has `catalog:manage` permission.

### Main Flow
1. Administrator navigates to the unit-of-measure configuration page.
2. System displays the list of existing units with code, name, and usage count.
3. Administrator adds a new unit: code (e.g., "lfm"), name (DE: "Laufmeter", FR: "metre courant", IT: "metro corrente"), optional base unit and conversion factor.
4. System validates uniqueness of the unit code.
5. System saves the unit.

### Alternate Flows
- **AF-1: Edit unit** -- Administrator modifies the name or conversion factor. Code is immutable after creation to prevent data integrity issues.
- **AF-2: Delete unit** -- System checks for article references. If referenced, deletion is blocked with a message listing dependent articles. If unreferenced, unit is deleted.
- **AF-3: Seed defaults** -- On initial system setup, standard units are seeded automatically.

### Postconditions
- Unit of measure is persisted and available for article assignment.

### Acceptance Criteria
1. The system ships with pre-configured standard units: Stk (pieces), m, lfm, l, h, kg, m2, m3, Set.
2. Custom units can be created with a unique code and multilingual name (DE, FR, IT).
3. Units referenced by articles cannot be deleted; the system displays the count of dependent articles.
4. Unit codes are immutable after creation.
5. At least 100 custom units are supported.
