# Module 03 -- CRM & Asset Management: Technical Design

---

## 1. API Design

### 1.1 Customer Endpoints

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| GET | `/api/v1/crm/customers` | List customers (paginated, filterable) | Yes | `crm:read` |
| POST | `/api/v1/crm/customers` | Create a new customer | Yes | `crm:write` |
| GET | `/api/v1/crm/customers/:id` | Get customer by ID | Yes | `crm:read` |
| PATCH | `/api/v1/crm/customers/:id` | Update customer | Yes | `crm:write` |
| POST | `/api/v1/crm/customers/:id/archive` | Archive customer | Yes | `crm:admin` |
| POST | `/api/v1/crm/customers/merge` | Merge two customers | Yes | `crm:admin` |
| GET | `/api/v1/crm/customers/:id/history` | Get customer history timeline | Yes | `crm:read` |
| GET | `/api/v1/crm/customers/search` | Full-text search across customers | Yes | `crm:read` |
| GET | `/api/v1/crm/customers/duplicates` | Check for duplicate customers | Yes | `crm:read` |

### 1.2 Contact Endpoints

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| GET | `/api/v1/crm/customers/:customerId/contacts` | List contacts for a customer | Yes | `crm:read` |
| POST | `/api/v1/crm/customers/:customerId/contacts` | Add a contact | Yes | `crm:write` |
| GET | `/api/v1/crm/contacts/:id` | Get contact by ID | Yes | `crm:read` |
| PATCH | `/api/v1/crm/contacts/:id` | Update contact | Yes | `crm:write` |
| DELETE | `/api/v1/crm/contacts/:id` | Soft-delete contact | Yes | `crm:write` |
| POST | `/api/v1/crm/contacts/:id/set-primary` | Set as primary contact | Yes | `crm:write` |
| GET | `/api/v1/crm/contacts/search` | Search contacts across all customers | Yes | `crm:read` |

### 1.3 Address Book Endpoints (Mobile-optimized)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| GET | `/api/v1/crm/address-book` | Full address book (lightweight, for sync) | Yes | `crm:read` |
| GET | `/api/v1/crm/address-book/delta` | Delta sync (changes since timestamp) | Yes | `crm:read` |
| GET | `/api/v1/crm/address-book/search` | Server-side search | Yes | `crm:read` |

Query parameter for delta: `since=2026-03-28T10:00:00Z`

### 1.4 Site Endpoints

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| GET | `/api/v1/crm/customers/:customerId/sites` | List sites for a customer | Yes | `crm:read` |
| POST | `/api/v1/crm/customers/:customerId/sites` | Create a site | Yes | `crm:write` |
| GET | `/api/v1/crm/sites/:id` | Get site by ID | Yes | `crm:read` |
| PATCH | `/api/v1/crm/sites/:id` | Update site | Yes | `crm:write` |
| POST | `/api/v1/crm/sites/:id/deactivate` | Deactivate site | Yes | `crm:admin` |
| GET | `/api/v1/crm/sites/:id/history` | Get site history timeline | Yes | `crm:read` |
| GET | `/api/v1/crm/sites/:id/images` | List site images | Yes | `crm:read` |
| POST | `/api/v1/crm/sites/:id/images` | Upload site image | Yes | `crm:write` |
| GET | `/api/v1/crm/sites/:id/notes` | List site notes | Yes | `crm:read` |
| POST | `/api/v1/crm/sites/:id/notes` | Add site note | Yes | `crm:write` |
| GET | `/api/v1/crm/sites/map` | Get sites with geocoordinates for map view | Yes | `crm:read` |

### 1.5 Installation Endpoints

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| GET | `/api/v1/crm/sites/:siteId/installations` | List installations at a site | Yes | `crm:read` |
| POST | `/api/v1/crm/sites/:siteId/installations` | Create an installation | Yes | `crm:write` |
| GET | `/api/v1/crm/installations/:id` | Get installation by ID | Yes | `crm:read` |
| PATCH | `/api/v1/crm/installations/:id` | Update installation | Yes | `crm:write` |
| POST | `/api/v1/crm/installations/:id/decommission` | Decommission installation | Yes | `crm:admin` |
| GET | `/api/v1/crm/installations/:id/history` | Get installation history timeline | Yes | `crm:read` |
| GET | `/api/v1/crm/installations/:id/images` | List installation images | Yes | `crm:read` |
| POST | `/api/v1/crm/installations/:id/images` | Upload installation image | Yes | `crm:write` |
| GET | `/api/v1/crm/installations/:id/notes` | List installation notes | Yes | `crm:read` |
| POST | `/api/v1/crm/installations/:id/notes` | Add installation note | Yes | `crm:write` |
| GET | `/api/v1/crm/installations/:id/spare-parts` | List linked spare parts | Yes | `crm:read` |
| POST | `/api/v1/crm/installations/:id/spare-parts` | Link spare part to installation | Yes | `crm:write` |

### 1.6 Maintenance Endpoints

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| GET | `/api/v1/crm/installations/:id/maintenance` | List maintenance intervals for installation | Yes | `crm:read` |
| POST | `/api/v1/crm/installations/:id/maintenance` | Create maintenance interval | Yes | `crm:write` |
| PATCH | `/api/v1/crm/maintenance/:id` | Update maintenance interval | Yes | `crm:write` |
| DELETE | `/api/v1/crm/maintenance/:id` | Delete maintenance interval | Yes | `crm:admin` |
| GET | `/api/v1/crm/maintenance/dashboard` | Maintenance dashboard (due/overdue summary) | Yes | `crm:read` |
| GET | `/api/v1/crm/maintenance/due` | List all due maintenance items | Yes | `crm:read` |
| GET | `/api/v1/crm/maintenance/overdue` | List all overdue maintenance items | Yes | `crm:read` |

### 1.7 Spare Parts Catalog Endpoints

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| GET | `/api/v1/crm/spare-parts` | List spare parts catalog (paginated) | Yes | `crm:read` |
| POST | `/api/v1/crm/spare-parts` | Add part to catalog | Yes | `crm:write` |
| GET | `/api/v1/crm/spare-parts/:id` | Get spare part details | Yes | `crm:read` |
| PATCH | `/api/v1/crm/spare-parts/:id` | Update spare part | Yes | `crm:write` |
| POST | `/api/v1/crm/spare-parts/import` | Import parts from CSV | Yes | `crm:admin` |
| POST | `/api/v1/crm/spare-parts/:id/order-request` | Flag part for ordering | Yes | `crm:write` |
| GET | `/api/v1/crm/spare-parts/order-requests` | List pending order requests | Yes | `crm:read` |

### 1.8 Newsletter Endpoints

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| GET | `/api/v1/crm/newsletters` | List sent/scheduled newsletters | Yes | `crm:admin` |
| POST | `/api/v1/crm/newsletters` | Create and send/schedule newsletter | Yes | `crm:admin` |
| GET | `/api/v1/crm/newsletters/:id` | Get newsletter details and delivery status | Yes | `crm:admin` |
| POST | `/api/v1/crm/newsletters/:id/cancel` | Cancel a scheduled newsletter | Yes | `crm:admin` |
| GET | `/api/v1/crm/newsletters/preview-recipients` | Preview recipient count for given filters | Yes | `crm:admin` |

### 1.9 Website Plugin Endpoints (Public)

| Method | Path | Description | Auth | Rate Limit |
|--------|------|-------------|------|------------|
| POST | `/api/v1/public/service-requests` | Submit a service request | No (CAPTCHA) | 20/hr/IP |
| GET | `/api/v1/public/service-requests/:ref/status` | Check request status by reference | No | 60/hr/IP |
| GET | `/api/v1/public/widget/config` | Get widget configuration (branding, categories) | No | 120/hr/IP |

Internal endpoints for managing submitted requests:

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| GET | `/api/v1/crm/service-requests` | List service requests | Yes | `crm:read` |
| GET | `/api/v1/crm/service-requests/:id` | Get request details | Yes | `crm:read` |
| PATCH | `/api/v1/crm/service-requests/:id` | Update request (assign, status change) | Yes | `crm:write` |
| POST | `/api/v1/crm/service-requests/:id/convert` | Convert to service order | Yes | `crm:write` |

---

## 2. Data Models

### 2.1 Customers

Table: `customers`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| customer_number | VARCHAR(10) | NOT NULL, UNIQUE | Sequential (K-00001) |
| name | VARCHAR(255) | NOT NULL | Company or person name |
| type | VARCHAR(20) | NOT NULL | 'private' or 'business' |
| street | VARCHAR(255) | NOT NULL | Street and house number |
| postal_code | VARCHAR(10) | NOT NULL | Swiss PLZ |
| city | VARCHAR(100) | NOT NULL | City/Ort |
| canton | VARCHAR(2) | NULL | Swiss canton code (ZH, BE, etc.) |
| country | VARCHAR(2) | NOT NULL, DEFAULT 'CH' | ISO country code |
| phone | VARCHAR(30) | NULL | Main phone number |
| mobile | VARCHAR(30) | NULL | Mobile phone number |
| email | VARCHAR(255) | NULL | Main email address |
| website | VARCHAR(255) | NULL | Website URL |
| newsletter_opt_in | BOOLEAN | NOT NULL, DEFAULT false | Newsletter consent |
| newsletter_channel | VARCHAR(20) | NULL | 'email', 'whatsapp', 'both' |
| notes | TEXT | NULL | General notes |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | active, archived |
| merged_into_id | UUID | FK -> customers.id, NULL | If merged, points to survivor |
| created_by | UUID | FK -> users.id | Creating user |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Indexes:
- `idx_customers_number` on `(customer_number)` UNIQUE
- `idx_customers_name` on `(name)` (for search)
- `idx_customers_postal_code` on `(postal_code)`
- `idx_customers_status` on `(status)`
- Full-text index on `(name, city, email)` using `tsvector`

### 2.2 Contacts

Table: `contacts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| customer_id | UUID | FK -> customers.id, NOT NULL | Parent customer |
| first_name | VARCHAR(100) | NOT NULL | First name |
| last_name | VARCHAR(100) | NOT NULL | Last name |
| function_title | VARCHAR(100) | NULL | Job title / function |
| phone | VARCHAR(30) | NULL | Phone number |
| mobile | VARCHAR(30) | NULL | Mobile number |
| email | VARCHAR(255) | NULL | Email address |
| is_primary | BOOLEAN | NOT NULL, DEFAULT false | Primary contact flag |
| notes | TEXT | NULL | Free text notes |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | Soft delete |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Indexes:
- `idx_contacts_customer` on `(customer_id)`
- `idx_contacts_primary` on `(customer_id)` WHERE `is_primary = true`
- Full-text index on `(first_name, last_name, email)`

### 2.3 Sites

Table: `sites`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| customer_id | UUID | FK -> customers.id, NOT NULL | Parent customer |
| site_number | VARCHAR(10) | NOT NULL | Sequential per customer (O-001) |
| name | VARCHAR(255) | NOT NULL | Site label/name |
| street | VARCHAR(255) | NOT NULL | Street address |
| postal_code | VARCHAR(10) | NOT NULL | Swiss PLZ |
| city | VARCHAR(100) | NOT NULL | City |
| canton | VARCHAR(2) | NULL | Canton code |
| country | VARCHAR(2) | NOT NULL, DEFAULT 'CH' | Country |
| floor_unit | VARCHAR(50) | NULL | Floor / apartment / unit |
| access_instructions | TEXT | NULL | Access details for technicians |
| site_type | VARCHAR(20) | NOT NULL, DEFAULT 'residential' | residential, commercial, industrial |
| latitude | DECIMAL(10,7) | NULL | Geocoded latitude |
| longitude | DECIMAL(10,7) | NULL | Geocoded longitude |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | active, inactive |
| created_by | UUID | FK -> users.id | Creating user |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Indexes:
- `idx_sites_customer` on `(customer_id)`
- `idx_sites_number` on `(customer_id, site_number)` UNIQUE
- `idx_sites_location` on `(latitude, longitude)` WHERE `latitude IS NOT NULL`
- `idx_sites_postal_code` on `(postal_code)`
- `idx_sites_status` on `(status)`

### 2.4 Installations

Table: `installations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| installation_number | VARCHAR(10) | NOT NULL, UNIQUE | System-wide (A-00001) |
| site_id | UUID | FK -> sites.id, NOT NULL | Parent site |
| type | VARCHAR(30) | NOT NULL | boiler, heat_pump, solar_thermal, radiator_system, ventilation, hot_water, other |
| manufacturer | VARCHAR(100) | NOT NULL | Equipment manufacturer |
| model | VARCHAR(100) | NOT NULL | Model name/number |
| serial_number | VARCHAR(100) | NULL | Serial number |
| commissioning_date | DATE | NULL | Date put into service |
| warranty_end_date | DATE | NULL | Warranty expiry |
| power_output_kw | DECIMAL(10,2) | NULL | Power output in kW |
| fuel_type | VARCHAR(20) | NULL | gas, oil, electric, pellet, other |
| year_of_manufacture | INTEGER | NULL | Manufacturing year |
| technical_notes | TEXT | NULL | Technical specifications and notes |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | active, decommissioned |
| decommissioned_date | DATE | NULL | Decommissioning date |
| decommission_reason | TEXT | NULL | Reason for decommissioning |
| created_by | UUID | FK -> users.id | Creating user |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Indexes:
- `idx_installations_number` on `(installation_number)` UNIQUE
- `idx_installations_site` on `(site_id)`
- `idx_installations_type` on `(type)`
- `idx_installations_manufacturer` on `(manufacturer)`
- `idx_installations_status` on `(status)`
- `idx_installations_serial` on `(serial_number)` WHERE `serial_number IS NOT NULL`

### 2.5 Maintenance Intervals

Table: `maintenance_intervals`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| installation_id | UUID | FK -> installations.id, NOT NULL | Parent installation |
| maintenance_type | VARCHAR(50) | NOT NULL | annual_service, filter_change, chimney_sweep, general_inspection, other |
| custom_type_label | VARCHAR(100) | NULL | Custom label if type is 'other' |
| frequency_months | INTEGER | NOT NULL | Interval in months |
| last_service_date | DATE | NULL | Date of last completed service |
| next_due_date | DATE | NOT NULL | Calculated next due date |
| maintenance_status | VARCHAR(20) | NOT NULL, DEFAULT 'ok' | ok, due, overdue, scheduled |
| linked_service_order_id | UUID | NULL | ID of scheduled service order |
| notes | TEXT | NULL | Specific maintenance instructions |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Indexes:
- `idx_maintenance_installation` on `(installation_id)`
- `idx_maintenance_due_date` on `(next_due_date)` WHERE `maintenance_status IN ('ok', 'due', 'overdue')`
- `idx_maintenance_status` on `(maintenance_status)`

### 2.6 Notes

Table: `entity_notes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| entity_type | VARCHAR(20) | NOT NULL | 'site' or 'installation' |
| entity_id | UUID | NOT NULL | Site or installation ID |
| text | TEXT | NOT NULL | Note content (max 2000 chars) |
| category | VARCHAR(20) | NOT NULL, DEFAULT 'general' | general, warning, access_info, technical |
| is_pinned | BOOLEAN | NOT NULL, DEFAULT false | Pinned to top |
| is_warning | BOOLEAN | NOT NULL, DEFAULT false | Show as warning banner |
| author_id | UUID | FK -> users.id, NOT NULL | Note author |
| editable_until | TIMESTAMPTZ | NOT NULL | 24h after creation |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Indexes:
- `idx_notes_entity` on `(entity_type, entity_id)`
- `idx_notes_warning` on `(entity_type, entity_id)` WHERE `is_warning = true`

### 2.7 Entity Images

Table: `entity_images`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| entity_type | VARCHAR(20) | NOT NULL | 'customer', 'site', or 'installation' |
| entity_id | UUID | NOT NULL | Entity ID |
| file_id | UUID | FK -> file_metadata.id, NOT NULL | Reference to file storage |
| caption | VARCHAR(255) | NULL | Image caption |
| category | VARCHAR(20) | NOT NULL, DEFAULT 'general' | nameplate, damage, before_after, general |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | Display order |
| thumbnail_url_small | VARCHAR(500) | NULL | 200x200 thumbnail URL |
| thumbnail_url_medium | VARCHAR(500) | NULL | 600x600 thumbnail URL |
| uploaded_by | UUID | FK -> users.id, NOT NULL | Uploading user |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Indexes:
- `idx_entity_images_entity` on `(entity_type, entity_id)`

### 2.8 Spare Parts Catalog

Table: `spare_parts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| name | VARCHAR(255) | NOT NULL | Part name |
| part_number | VARCHAR(50) | NULL | Manufacturer part number |
| manufacturer | VARCHAR(100) | NULL | Manufacturer name |
| supplier | VARCHAR(100) | NULL | Supplier name |
| unit_price_chf | DECIMAL(10,2) | NULL | Price in CHF |
| description | TEXT | NULL | Description |
| category | VARCHAR(50) | NULL | Part category |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Active in catalog |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Indexes:
- `idx_spare_parts_number` on `(part_number)` WHERE `part_number IS NOT NULL`
- Full-text index on `(name, part_number, manufacturer)`

### 2.9 Installation-Spare Part Link

Table: `installation_spare_parts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| installation_id | UUID | FK -> installations.id, NOT NULL | Installation |
| spare_part_id | UUID | FK -> spare_parts.id, NOT NULL | Spare part |
| typical_quantity | INTEGER | NOT NULL, DEFAULT 1 | Typical quantity needed |
| notes | TEXT | NULL | Usage notes |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Unique constraint: `(installation_id, spare_part_id)`

### 2.10 Spare Part Order Requests

Table: `spare_part_order_requests`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| spare_part_id | UUID | FK -> spare_parts.id, NOT NULL | Requested part |
| installation_id | UUID | FK -> installations.id, NULL | Related installation |
| requested_by | UUID | FK -> users.id, NOT NULL | Requesting user |
| quantity | INTEGER | NOT NULL | Requested quantity |
| urgency | VARCHAR(10) | NOT NULL, DEFAULT 'normal' | low, normal, urgent |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | pending, approved, ordered, received, cancelled |
| notes | TEXT | NULL | Additional notes |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### 2.11 Newsletters

Table: `newsletters`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| subject | VARCHAR(255) | NOT NULL | Email subject / WhatsApp header |
| body_html | TEXT | NULL | Email body (HTML) |
| body_text | TEXT | NOT NULL | Plain text body (WhatsApp + fallback) |
| channel | VARCHAR(20) | NOT NULL | 'email', 'whatsapp', 'both' |
| recipient_filter | JSONB | NOT NULL | Filter criteria used |
| total_recipients | INTEGER | NOT NULL | Total recipients at send time |
| sent_count | INTEGER | NOT NULL, DEFAULT 0 | Successfully sent |
| failed_count | INTEGER | NOT NULL, DEFAULT 0 | Failed deliveries |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | draft, scheduled, sending, completed, cancelled |
| scheduled_at | TIMESTAMPTZ | NULL | Scheduled send time |
| sent_at | TIMESTAMPTZ | NULL | Actual send start time |
| completed_at | TIMESTAMPTZ | NULL | Send completion time |
| created_by | UUID | FK -> users.id, NOT NULL | Author |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### 2.12 Service Requests (Website Plugin)

Table: `service_requests`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique ID |
| reference_number | VARCHAR(15) | NOT NULL, UNIQUE | Public reference (SR-20260329-001) |
| customer_name | VARCHAR(255) | NOT NULL | Submitted name |
| customer_phone | VARCHAR(30) | NULL | Submitted phone |
| customer_email | VARCHAR(255) | NULL | Submitted email |
| customer_address | TEXT | NULL | Submitted address |
| category | VARCHAR(20) | NOT NULL | heizung, sanitaer, sonstiges |
| priority | VARCHAR(10) | NOT NULL, DEFAULT 'mittel' | niedrig, mittel, hoch |
| description | TEXT | NOT NULL | Problem description |
| photo_file_id | UUID | FK -> file_metadata.id, NULL | Attached photo |
| matched_customer_id | UUID | FK -> customers.id, NULL | Matched CRM customer |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'new' | new, in_review, converted, rejected |
| converted_to_order_id | UUID | NULL | Service order ID if converted |
| ip_address | INET | NOT NULL | Submitter IP |
| user_agent | TEXT | NULL | Submitter user agent |
| processed_by | UUID | FK -> users.id, NULL | Dispatcher who handled |
| processed_at | TIMESTAMPTZ | NULL | When processed |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Indexes:
- `idx_service_requests_ref` on `(reference_number)` UNIQUE
- `idx_service_requests_status` on `(status)`
- `idx_service_requests_customer` on `(matched_customer_id)` WHERE matched_customer_id IS NOT NULL

---

## 3. Event Flows

### 3.1 Events Published by This Module

| Event Type | Payload | Trigger |
|------------|---------|---------|
| `customer.created` | `{ customerId, customerNumber, name, type, createdBy }` | Customer created |
| `customer.updated` | `{ customerId, changedFields }` | Customer updated |
| `customer.archived` | `{ customerId, archivedBy }` | Customer archived |
| `customer.merged` | `{ survivorId, mergedId, mergedBy }` | Customers merged |
| `contact.created` | `{ contactId, customerId }` | Contact added |
| `contact.updated` | `{ contactId, changedFields }` | Contact updated |
| `contact.deleted` | `{ contactId, customerId }` | Contact removed |
| `site.created` | `{ siteId, customerId, address }` | Site created |
| `site.updated` | `{ siteId, changedFields }` | Site updated |
| `site.deactivated` | `{ siteId, customerId }` | Site deactivated |
| `installation.created` | `{ installationId, siteId, type, manufacturer, model }` | Installation created |
| `installation.updated` | `{ installationId, changedFields }` | Installation updated |
| `installation.decommissioned` | `{ installationId, reason, date }` | Installation decommissioned |
| `maintenance.due` | `{ maintenanceId, installationId, siteId, dueDate }` | Maintenance now due |
| `maintenance.overdue` | `{ maintenanceId, installationId, siteId, dueDate, daysPast }` | Maintenance overdue |
| `maintenance.rescheduled` | `{ maintenanceId, previousDueDate, newDueDate }` | Maintenance rescheduled after service |
| `spare_part.order_requested` | `{ requestId, partId, quantity, urgency, requestedBy }` | Part flagged for ordering |
| `service_request.submitted` | `{ requestId, referenceNumber, category, priority }` | Website order submitted |
| `service_request.converted` | `{ requestId, orderId }` | Request converted to order |

### 3.2 Events Consumed by This Module

| Event Type | Source Module | Handler Action |
|------------|--------------|----------------|
| `service_order.completed` | Field Service (06) | Update maintenance interval's last_service_date and recalculate next_due_date |
| `invoice.created` | Invoicing (09) | Add to site/installation history timeline |
| `quotation.created` | Quotations (08) | Add to site/installation history timeline |
| `quotation.accepted` | Quotations (08) | Add to site/installation history timeline |

### 3.3 Maintenance Check Background Job Flow

```
Scheduler (06:00 CET daily)
       |
       v
[MaintenanceDueCheckJob]
       |
       v
SELECT * FROM maintenance_intervals
WHERE status IN ('active')
  AND next_due_date <= CURRENT_DATE + interval ':lookahead days'
  AND maintenance_status = 'ok'
       |
       v
For each result:
  ├── next_due_date <= CURRENT_DATE?
  │   ├── YES -> Set status = 'overdue', publish maintenance.overdue
  │   └── NO  -> Set status = 'due', publish maintenance.due
  └── Already has linked_service_order_id?
      └── YES -> Set status = 'scheduled', skip notification
       |
       v
[Send notifications to dispatchers/project managers]
       |
       v
[Update Prometheus counter: maintenance_due_total, maintenance_overdue_total]
```

### 3.4 Website Plugin Service Request Flow

```
End Customer Browser        Widget JS         Public API       CRM Service        EventBus       Dispatcher
       |                       |                  |                 |                  |              |
       |-- fill form --------->|                  |                 |                  |              |
       |                       |-- POST /service-requests -------->|                  |              |
       |                       |                  |-- validate CAPTCHA               |              |
       |                       |                  |-- validate input                 |              |
       |                       |                  |-- check duplicate                |              |
       |                       |                  |-- match customer ------>|        |              |
       |                       |                  |                 |<------|        |              |
       |                       |                  |-- create record ------->|        |              |
       |                       |                  |                 |-- publish ----->|              |
       |                       |                  |                 |                  |-- notify -->|
       |                       |                  |                 |-- queue confirmation email    |
       |                       |<-- 201 { ref } --|                 |                  |              |
       |<-- "Thank you, ref" --|                  |                 |                  |              |
```

---

## 4. Integration Points

### 4.1 Module Dependencies

| Dependency | Module | Purpose |
|------------|--------|---------|
| API Gateway | Core Platform (01) | Request routing, rate limiting |
| Event Bus | Core Platform (01) | Publishing and consuming domain events |
| File Storage | Core Platform (01) | Images, photos, nameplate scans |
| Background Jobs | Core Platform (01) | Maintenance checks, newsletter sending, geocoding |
| Cache | Core Platform (01) | Address book caching, frequently accessed customers |
| Auth Middleware | Auth (02) | Permission enforcement on all endpoints |

### 4.2 External Integrations

| Integration | Protocol | Purpose |
|-------------|----------|---------|
| Geocoding API | HTTPS (REST) | Convert site addresses to lat/lng coordinates |
| WhatsApp Business API | HTTPS (REST) | Newsletter delivery via WhatsApp |
| SMTP / Email API | SMTP or HTTPS | Newsletter delivery, confirmation emails |
| reCAPTCHA / hCaptcha | HTTPS | Spam prevention on website plugin |

### 4.3 Downstream Module Interactions

| Consumer Module | Data Consumed | Access Pattern |
|-----------------|--------------|----------------|
| Scheduling (05) | Sites, installations, maintenance due dates | Read via API |
| Field Service (06) | Sites, installations, access instructions, notes, images | Read via API + offline sync |
| Quotations (08) | Customers, sites, installations | Read via API |
| Invoicing (09) | Customers (billing address), sites | Read via API |
| Reporting | All CRM data | Read via API (aggregated views) |

---

## 5. Mobile Sync Strategy

### 5.1 Delta Sync Protocol

The mobile app synchronizes CRM data using a delta-sync approach:

1. On first sync, the app downloads all active records (customers, contacts, sites, installations, notes with warnings).
2. On subsequent syncs, the app sends the `lastSyncTimestamp` and receives only records modified after that timestamp.
3. Deleted/archived records are included in the delta with a `deleted: true` flag so the local cache can remove them.

**Delta Sync Endpoint:** `GET /api/v1/crm/address-book/delta?since=2026-03-28T10:00:00Z`

**Response:**
```json
{
  "success": true,
  "data": {
    "customers": [ { "id": "...", "name": "...", "_deleted": false } ],
    "contacts": [ ],
    "sites": [ { "id": "...", "_deleted": true } ],
    "installations": [ ],
    "warnings": [ { "entityType": "site", "entityId": "...", "text": "Aggressive dog!" } ]
  },
  "meta": {
    "syncTimestamp": "2026-03-29T10:15:30.000Z",
    "totalRecords": 42
  }
}
```

### 5.2 Offline Data Capture Queue

Data captured offline (new customers, installation updates, photos) is stored in a local queue:

```json
{
  "queue": [
    {
      "id": "local-uuid",
      "action": "PATCH",
      "endpoint": "/api/v1/crm/installations/abc-123",
      "payload": { "serial_number": "SN-12345" },
      "capturedAt": "2026-03-29T09:30:00Z",
      "status": "pending"
    }
  ]
}
```

On sync, each queued action is replayed in order. Conflicts (server record updated in the meantime) return HTTP 409 with both versions for user resolution.

---

## 6. Security Considerations

- **Public API (widget):** Rate-limited, CAPTCHA-protected, no authentication required. Input is strictly validated and sanitized. No PII is returned beyond the reference number.
- **Customer data:** Subject to Swiss FADP/nDSG. Access requires `crm:read` permission. Export requires `crm:admin` permission.
- **Newsletter opt-out:** Every email includes an unsubscribe link. Opt-out is processed within 24 hours. WhatsApp opt-out follows WhatsApp Business API rules.
- **Image storage:** Images are stored with entity-scoped paths. No direct public URLs; access requires authentication and permission check (via pre-signed URLs).
- **Address geocoding:** Only street, postal code, city, and country are sent to the geocoding API. No customer names or personal data.

---

## 7. Performance Considerations

- **Customer search:** Uses PostgreSQL full-text search with `tsvector` indexes for sub-second results across 50,000+ customer records.
- **Address book sync:** Delta sync payload is lightweight (only changed records). Full sync is compressed (gzip). Expected full dataset for 5,000 customers with contacts and sites: approximately 2-3 MB compressed.
- **Maintenance check job:** Runs a single indexed query against `maintenance_intervals`. Expected execution time for 10,000 intervals: < 5 seconds.
- **Image thumbnails:** Generated asynchronously via background job on upload. Mobile views load thumbnails (200x200), detail views load medium (600x600), full-size on explicit request.
- **History timeline:** Aggregated via a materialized view or denormalized history table, refreshed on relevant events. Avoids cross-module queries at read time.
