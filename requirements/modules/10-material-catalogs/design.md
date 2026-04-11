# Module 10: Material Catalogs & Interfaces -- Design

---

## 1. REST API Design

### 1.1 Catalog Categories

```
GET    /api/v1/catalog/categories                  # List all categories (tree structure)
GET    /api/v1/catalog/categories/{id}              # Get category by ID
POST   /api/v1/catalog/categories                   # Create category
PUT    /api/v1/catalog/categories/{id}              # Update category
PATCH  /api/v1/catalog/categories/{id}/move         # Move category to new parent
PATCH  /api/v1/catalog/categories/{id}/deactivate   # Deactivate category
```

**POST /api/v1/catalog/categories** -- Request Body:
```json
{
  "code": "HEATING-BOILERS",
  "name": "Heizkessel",
  "description": "Boiler systems and components",
  "parentId": "cat-001",
  "sortOrder": 10
}
```

**Response** (201 Created):
```json
{
  "id": "cat-042",
  "code": "HEATING-BOILERS",
  "name": "Heizkessel",
  "description": "Boiler systems and components",
  "parentId": "cat-001",
  "sortOrder": 10,
  "status": "ACTIVE",
  "articleCount": 0,
  "createdAt": "2026-03-29T10:00:00Z",
  "createdBy": "user-123"
}
```

### 1.2 Articles

```
GET    /api/v1/catalog/articles                     # List/search articles (paginated)
GET    /api/v1/catalog/articles/{id}                # Get article by ID
POST   /api/v1/catalog/articles                     # Create article
PUT    /api/v1/catalog/articles/{id}                # Update article
DELETE /api/v1/catalog/articles/{id}                # Soft-delete article
POST   /api/v1/catalog/articles/import              # Bulk import (CSV/Excel)
GET    /api/v1/catalog/articles/{id}/versions        # Get version history
GET    /api/v1/catalog/articles/{id}/versions/{ver}  # Get specific version
```

**Query parameters for GET /api/v1/catalog/articles:**
```
?q=<search-term>           # Full-text search
&categoryId=<id>           # Filter by category
&type=MATERIAL|SERVICE     # Filter by type
&status=ACTIVE|INACTIVE    # Filter by status
&source=INTERNAL|IGH       # Filter by source
&priceMin=<amount>         # Price range min
&priceMax=<amount>         # Price range max
&page=1&size=50            # Pagination
&sort=name|articleNumber|price&order=asc|desc
```

**POST /api/v1/catalog/articles** -- Request Body:
```json
{
  "articleNumber": "MB-HK-0042",
  "name": "Brennwertkessel BW-200",
  "description": "Condensing boiler, 200kW, natural gas",
  "categoryId": "cat-042",
  "type": "MATERIAL",
  "unitOfMeasure": "STK",
  "basePrice": 12500.00,
  "currency": "CHF",
  "supplierReference": "SUP-Viessmann-BW200",
  "ighArticleNumber": "IGH-742918",
  "status": "ACTIVE"
}
```

### 1.3 Text Blocks

```
GET    /api/v1/catalog/text-blocks                  # List/search text blocks
GET    /api/v1/catalog/text-blocks/{id}             # Get text block by ID
POST   /api/v1/catalog/text-blocks                  # Create text block
PUT    /api/v1/catalog/text-blocks/{id}             # Update text block
DELETE /api/v1/catalog/text-blocks/{id}             # Soft-delete text block
```

**POST /api/v1/catalog/text-blocks** -- Request Body:
```json
{
  "title": "Standard-Inbetriebnahme Heizung",
  "categoryId": "tb-cat-commissioning",
  "bodyHtml": "<p>Inbetriebnahme der Heizungsanlage inkl. Funktionskontrolle, Einregulierung und Einweisung des Betreibers.</p>",
  "price": 450.00,
  "unit": "PAUSCHAL",
  "status": "ACTIVE"
}
```

### 1.4 IGH Integration

```
GET    /api/v1/catalog/igh/config                   # Get IGH connection config
PUT    /api/v1/catalog/igh/config                   # Update IGH connection config
POST   /api/v1/catalog/igh/import/full              # Trigger full import
POST   /api/v1/catalog/igh/import/delta             # Trigger delta import
GET    /api/v1/catalog/igh/import/{jobId}           # Get import job status
GET    /api/v1/catalog/igh/import/{jobId}/log       # Get import job log
GET    /api/v1/catalog/igh/import/history            # List import history
```

### 1.5 Units of Measure

```
GET    /api/v1/catalog/units                        # List all units
POST   /api/v1/catalog/units                        # Create unit
PUT    /api/v1/catalog/units/{code}                 # Update unit (name/conversion only)
DELETE /api/v1/catalog/units/{code}                 # Delete unit (if unreferenced)
```

### 1.6 Price Management

```
POST   /api/v1/catalog/prices/update                # Apply price update (batch)
GET    /api/v1/catalog/prices/history/{articleId}   # Price history for an article
POST   /api/v1/catalog/prices/schedule              # Schedule future price update
POST   /api/v1/catalog/prices/rollback/{batchId}   # Rollback a batch update
```

### 1.7 Article Picker (for Quotation/Order/Report integration)

```
GET    /api/v1/catalog/picker/articles              # Optimized search for article picker
GET    /api/v1/catalog/picker/text-blocks           # Optimized search for text block picker
POST   /api/v1/catalog/picker/barcode               # Lookup by barcode/EAN/QR
```

---

## 2. Data Models

### 2.1 Entity Relationship Overview

```
CatalogCategory (1) ──── (N) Article
Article (1) ──── (N) ArticleVersion
Article (N) ──── (1) UnitOfMeasure
Article (1) ──── (N) PriceHistory
Article (1) ──── (N) ArticleImage
CatalogCategory (1) ──── (N) TextBlock
TextBlock (1) ──── (N) TextBlockVersion
PriceUpdateBatch (1) ──── (N) PriceHistory
```

### 2.2 CatalogCategory

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| code | VARCHAR(50) | UNIQUE, NOT NULL | Category code |
| name | VARCHAR(200) | NOT NULL | Display name |
| description | TEXT | | Category description |
| parent_id | UUID | FK -> CatalogCategory.id, NULLABLE | Parent category |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | Display order within parent |
| status | ENUM('ACTIVE','INACTIVE') | NOT NULL, DEFAULT 'ACTIVE' | Category status |
| created_at | TIMESTAMP | NOT NULL | Creation timestamp |
| created_by | UUID | FK -> User.id, NOT NULL | Creator |
| updated_at | TIMESTAMP | NOT NULL | Last update timestamp |
| updated_by | UUID | FK -> User.id, NOT NULL | Last updater |

**Indexes:** `idx_category_parent (parent_id)`, `idx_category_code (code)`, `idx_category_status (status)`

### 2.3 Article

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| article_number | VARCHAR(20) | UNIQUE, NOT NULL | Internal article number |
| name | VARCHAR(300) | NOT NULL | Article name |
| description | TEXT | | Detailed description |
| category_id | UUID | FK -> CatalogCategory.id, NOT NULL | Category |
| type | ENUM('MATERIAL','SERVICE') | NOT NULL | Article type |
| unit_of_measure | VARCHAR(10) | FK -> UnitOfMeasure.code, NOT NULL | Unit |
| base_price | DECIMAL(12,2) | NOT NULL, CHECK >= 0 | Base price in CHF |
| currency | CHAR(3) | NOT NULL, DEFAULT 'CHF' | Currency code |
| supplier_reference | VARCHAR(100) | | External supplier reference |
| igh_article_number | VARCHAR(50) | | IGH catalog article number |
| source | ENUM('INTERNAL','IGH') | NOT NULL, DEFAULT 'INTERNAL' | Data source |
| status | ENUM('ACTIVE','INACTIVE','DELETED') | NOT NULL, DEFAULT 'ACTIVE' | Article status |
| version | INTEGER | NOT NULL, DEFAULT 1 | Current version number |
| last_used_at | TIMESTAMP | | Last time article was used in a document |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |
| updated_by | UUID | FK -> User.id, NOT NULL | |

**Indexes:** `idx_article_number (article_number)`, `idx_article_category (category_id)`, `idx_article_type (type)`, `idx_article_status (status)`, `idx_article_igh (igh_article_number)`, `idx_article_search (name, description)` (full-text)

### 2.4 ArticleVersion

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| article_id | UUID | FK -> Article.id, NOT NULL | Parent article |
| version | INTEGER | NOT NULL | Version number |
| snapshot | JSONB | NOT NULL | Full article state at this version |
| changed_fields | VARCHAR[] | | List of fields changed |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |

### 2.5 ArticleImage

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| article_id | UUID | FK -> Article.id, NOT NULL | Parent article |
| file_path | VARCHAR(500) | NOT NULL | Storage path |
| file_name | VARCHAR(200) | NOT NULL | Original file name |
| file_size | INTEGER | NOT NULL | Size in bytes |
| mime_type | VARCHAR(50) | NOT NULL | MIME type |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | Display order |
| created_at | TIMESTAMP | NOT NULL | |

### 2.6 TextBlock

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| title | VARCHAR(300) | NOT NULL | Title |
| category_id | UUID | FK -> CatalogCategory.id | Category |
| body_html | TEXT | NOT NULL | Rich text content |
| price | DECIMAL(12,2) | NULLABLE | Optional price |
| unit | VARCHAR(10) | NULLABLE | Optional unit |
| status | ENUM('ACTIVE','INACTIVE','DELETED') | NOT NULL, DEFAULT 'ACTIVE' | |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |
| updated_by | UUID | FK -> User.id, NOT NULL | |

### 2.7 UnitOfMeasure

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| code | VARCHAR(10) | PK | Unit code (e.g., STK, m, h) |
| name_de | VARCHAR(100) | NOT NULL | German name |
| name_fr | VARCHAR(100) | NOT NULL | French name |
| name_it | VARCHAR(100) | NOT NULL | Italian name |
| base_unit_code | VARCHAR(10) | FK -> UnitOfMeasure.code, NULLABLE | Base unit for conversion |
| conversion_factor | DECIMAL(12,6) | NULLABLE | Conversion factor to base unit |
| is_system | BOOLEAN | NOT NULL, DEFAULT FALSE | True for pre-seeded units |
| created_at | TIMESTAMP | NOT NULL | |

### 2.8 PriceHistory

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| article_id | UUID | FK -> Article.id, NOT NULL | |
| batch_id | UUID | FK -> PriceUpdateBatch.id, NULLABLE | Batch reference |
| old_price | DECIMAL(12,2) | NOT NULL | Previous price |
| new_price | DECIMAL(12,2) | NOT NULL | New price |
| effective_date | DATE | NOT NULL | Date the price takes effect |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |

### 2.9 PriceUpdateBatch

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| description | VARCHAR(500) | | Batch description |
| type | ENUM('MANUAL','PERCENTAGE','IMPORT','SCHEDULED') | NOT NULL | Update type |
| percentage | DECIMAL(6,2) | NULLABLE | Percentage adjustment |
| article_count | INTEGER | NOT NULL | Number of articles affected |
| status | ENUM('PENDING','APPLIED','ROLLED_BACK') | NOT NULL | |
| scheduled_date | DATE | NULLABLE | For scheduled updates |
| applied_at | TIMESTAMP | NULLABLE | When the batch was applied |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |

### 2.10 IghImportJob

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| type | ENUM('FULL','DELTA') | NOT NULL | Import type |
| status | ENUM('PENDING','RUNNING','COMPLETED','FAILED') | NOT NULL | |
| articles_created | INTEGER | DEFAULT 0 | |
| articles_updated | INTEGER | DEFAULT 0 | |
| articles_skipped | INTEGER | DEFAULT 0 | |
| errors_count | INTEGER | DEFAULT 0 | |
| log | TEXT | | Detailed log |
| started_at | TIMESTAMP | NULLABLE | |
| completed_at | TIMESTAMP | NULLABLE | |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |

---

## 3. Event Flows

### 3.1 Domain Events

| Event | Trigger | Payload | Consumers |
|-------|---------|---------|-----------|
| `catalog.category.created` | Category created | Category ID, code, parent ID | Audit service, search indexer |
| `catalog.category.updated` | Category modified | Category ID, changed fields | Audit service, search indexer |
| `catalog.article.created` | Article created | Article ID, article number | Search indexer, audit service |
| `catalog.article.updated` | Article modified | Article ID, changed fields, version | Search indexer, audit service |
| `catalog.article.deleted` | Article soft-deleted | Article ID | Search indexer, audit service |
| `catalog.article.price_changed` | Price updated | Article ID, old price, new price | Notification service (price drift alerts) |
| `catalog.price_batch.applied` | Batch update applied | Batch ID, article count | Audit service |
| `catalog.igh.import.started` | IGH import begins | Job ID, type | Notification service |
| `catalog.igh.import.completed` | IGH import finishes | Job ID, counts | Notification service, audit |
| `catalog.igh.import.failed` | IGH import fails | Job ID, error details | Notification service (alert admins) |
| `catalog.text_block.created` | Text block created | Text block ID | Search indexer |
| `catalog.text_block.updated` | Text block modified | Text block ID | Search indexer |

### 3.2 Article Usage Flow

```
User selects article in Quotation/Order/Report
  |
  v
Article Picker queries GET /api/v1/catalog/picker/articles?q=...
  |
  v
User confirms selection
  |
  v
Client creates a LineItemSnapshot:
  {
    sourceArticleId: "art-042",
    snapshotArticleNumber: "MB-HK-0042",
    snapshotName: "Brennwertkessel BW-200",
    snapshotPrice: 12500.00,
    snapshotUnit: "STK",
    quantity: 2,
    lineTotal: 25000.00
  }
  |
  v
Snapshot is saved within the parent document (quotation/order/report)
  |
  v
Event: catalog.article.used { articleId, documentType, documentId }
  -> Updates article.last_used_at
```

### 3.3 IGH Import Flow

```
Admin triggers full/delta import
  |
  v
System creates IghImportJob (status: PENDING)
  -> Event: catalog.igh.import.started
  |
  v
Background worker connects to IGH endpoint
  |
  v
Worker downloads catalog data (XML/CSV)
  |
  v
Worker parses and validates each article:
  ├── Valid: upsert into Article table (source=IGH)
  ├── Invalid: log error, increment errors_count
  └── Unchanged (delta): skip, increment articles_skipped
  |
  v
Worker updates IghImportJob (status: COMPLETED/FAILED)
  -> Event: catalog.igh.import.completed / .failed
  |
  v
Notification sent to admins with import summary
```

### 3.4 Price Update Flow

```
Admin selects articles and specifies new prices / percentage
  |
  v
System creates PriceUpdateBatch (status: PENDING)
  |
  v
System generates preview: old price -> new price per article
  |
  v
Admin confirms
  |
  v
System applies update in a transaction:
  For each article:
    1. Insert PriceHistory (old_price, new_price, effective_date)
    2. Update Article.base_price
    3. Emit catalog.article.price_changed event
  |
  v
PriceUpdateBatch.status = APPLIED
  -> Event: catalog.price_batch.applied
```

---

## 4. Integration Points

### 4.1 Module 03 -- Quotation Management

- **Quotation line items** reference catalog articles via `sourceArticleId`.
- Line items store a snapshot of the article data at selection time.
- The article picker component is shared across modules via a reusable UI component.
- Price drift detection: when viewing a quotation, the system compares `snapshotPrice` against the current `Article.basePrice` and displays a visual indicator if they differ.

### 4.2 Module 04 -- Order/Project Management

- Order material lists reference catalog articles identically to quotation line items.
- When a quotation is converted to an order, line-item snapshots are carried forward.
- Orders can add additional articles not in the original quotation.

### 4.3 Module 07 -- Field-Service Reports

- Field technicians log consumed materials in service reports using the article picker.
- Mobile article picker supports barcode scanning for rapid material identification.
- Consumed quantities are recorded against the report and linked to the source article.

### 4.4 Module 11 -- Accounting

- Invoice line items reference the same catalog articles, ensuring pricing consistency.
- When generating an invoice from an order, catalog snapshot data is carried into invoice line items.

### 4.5 IGH External Catalog

- **Protocol:** HTTP/HTTPS (REST or file download depending on IGH's interface).
- **Data format:** XML (DATANORM or IGH-specific schema) or CSV.
- **Authentication:** Credentials provided by IGH (API key, basic auth, or certificate-based).
- **Sync frequency:** Configurable; recommended daily delta sync with weekly full sync.
- **Error handling:** Retry with exponential backoff (3 attempts); failures alert administrators.
- **Dependency caveat:** Full integration scope depends on timely provision of IGH documentation and access.

### 4.6 Search Infrastructure

- Articles and text blocks are indexed in a search engine (Elasticsearch or PostgreSQL full-text search).
- Index updates are triggered by domain events (`catalog.article.created/updated/deleted`).
- Search supports: full-text queries, faceted filtering, typo tolerance, German compound word splitting.

---

## 5. Non-Functional Considerations

### 5.1 Performance
- Article search: < 500 ms for catalogs up to 100,000 articles.
- Article picker: < 1 second for interactive search-as-you-type.
- Bulk import (CSV): 1,000 articles in < 30 seconds.
- IGH full import: 100,000 articles in < 10 minutes.

### 5.2 Data Integrity
- Article numbers are immutable after creation.
- Soft-delete preserves referential integrity with historical documents.
- Version history enables full audit trail of article changes.
- Price snapshots in line items are independent of catalog price changes.

### 5.3 Security
- Permissions: `catalog:read`, `catalog:manage`, `catalog:pricing`, `catalog:igh:manage`.
- All catalog modifications are logged in the audit trail.
- IGH credentials are stored encrypted at rest.

### 5.4 Multi-Language
- Article names and descriptions are stored in a single language (primary: German).
- Units of measure support DE/FR/IT names.
- UI labels and messages support all three Swiss national languages.
