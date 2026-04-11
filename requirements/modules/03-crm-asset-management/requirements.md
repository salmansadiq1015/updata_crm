# Module 03 -- CRM & Asset Management: Detailed Requirements

---

## CRM-001: Customer Master Data Management

| Field | Value |
|-------|-------|
| **ID** | CRM-001 |
| **Title** | Customer Master Data Management |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CORE-001, CORE-005, AUTH-003 |
| **Tags** | `crm`, `customer`, `master-data`, `crud` |

### Description

The system shall provide full CRUD operations for customer master data. Each customer record includes company/person name, classification (private/business), billing address, communication preferences, and status. Customers are the top-level entity in the CRM hierarchy and serve as the anchor for contacts, sites, and all related business records.

### Actors

- **Admin** -- full CRUD on all customers.
- **Projektleiter** -- full CRUD on all customers.
- **Techniker** -- read access; can create customers via mobile.
- **Disponent** -- read access.
- **System** -- enforces validation and uniqueness rules.

### Preconditions

1. The user is authenticated and has `crm:read` or `crm:write` permission.
2. The customers table exists (CORE-005 migration applied).

### Flow

**Main Flow -- Create Customer:**

1. User submits customer data: name, type (private/business), address, phone, email.
2. The system validates required fields and formats (Swiss postal code, phone format).
3. The system checks for potential duplicates (matching name + postal code).
4. If potential duplicates are found, the system warns the user but allows creation.
5. The system creates the customer record with status `active`.
6. The system assigns a sequential customer number (e.g., `K-00001`).
7. The system publishes `customer.created` event.
8. The system returns the created customer.

**Main Flow -- Update Customer:**

1. User submits a PATCH request with changed fields.
2. The system validates the fields.
3. The system updates the record, sets `updated_at`.
4. The system publishes `customer.updated` event.

**Main Flow -- Search/List Customers:**

1. User submits a GET request with optional filters: name, city, postal code, status, type.
2. The system returns a paginated list of matching customers.
3. Results include a summary count of sites and installations per customer.

**Alternate Flows:**

- **A1 -- Archive customer:** Customer status is set to `archived`. All related sites and installations remain accessible but are marked as belonging to an archived customer.
- **A2 -- Merge duplicate customers:** Admin selects two customers and merges them. All child records (contacts, sites) are reassigned to the surviving customer. The merged customer is archived with a reference to the survivor.

### Postconditions

- The customer record exists in the database with a unique customer number.
- Related events have been published.

### Acceptance Criteria

- [ ] Customers can be created with: name (required), type (private/business, required), street (required), postal code (required, Swiss PLZ format), city (required), canton (optional), country (default: CH), phone (optional, Swiss format), email (optional, valid format), website (optional).
- [ ] Each customer receives a unique, sequential customer number (format: `K-NNNNN`).
- [ ] Duplicate detection runs on create, matching name + postal code, and warns the user.
- [ ] Customer list supports pagination, full-text search (name, city), and filtering (type, status, canton).
- [ ] Customers can be archived (soft delete) but not permanently deleted.
- [ ] Customer merge functionality reassigns all child records and archives the duplicate.
- [ ] A `customer.created`, `customer.updated`, `customer.archived` event is published for each action.
- [ ] Customer records include computed fields: total sites count, total installations count, last service date.

---

## CRM-002: Contact Management

| Field | Value |
|-------|-------|
| **ID** | CRM-002 |
| **Title** | Contact Management |
| **Priority** | H |
| **Complexity** | Low |
| **Dependencies** | CRM-001 |
| **Tags** | `crm`, `contacts`, `communication` |

### Description

The system shall allow multiple contacts (Ansprechpartner) to be associated with each customer. Each contact has personal details, communication channels, and a role/function within the customer organization. One contact can be designated as the primary contact for the customer.

### Actors

- **Projektleiter** -- manages contacts.
- **Techniker** -- views contacts; can add contacts via mobile.
- **Disponent** -- views contacts.

### Preconditions

1. The parent customer exists.
2. The user has `crm:read` or `crm:write` permission.

### Flow

**Main Flow -- Add Contact:**

1. User submits contact details linked to a customer ID.
2. The system validates fields and the customer reference.
3. If this is the first contact, it is automatically set as primary.
4. The system creates the contact record.
5. The system publishes `contact.created` event.

**Alternate Flows:**

- **A1 -- Set as primary:** The system unsets the previous primary contact and sets the new one.
- **A2 -- Delete contact:** The contact is soft-deleted. If it was the primary contact, the user is prompted to designate a new primary.

### Postconditions

- The contact is linked to the customer.
- The customer has at most one primary contact.

### Acceptance Criteria

- [ ] Contacts can be created with: firstName (required), lastName (required), function/title (optional), phone (optional), mobile (optional), email (optional), notes (optional).
- [ ] Each contact belongs to exactly one customer.
- [ ] One contact per customer can be marked as primary.
- [ ] Contacts are searchable by name, email, phone across all customers.
- [ ] Contacts can be soft-deleted.
- [ ] Contact information is visible in the mobile address book (CRM-003).

---

## CRM-003: Address Book with Mobile Access

| Field | Value |
|-------|-------|
| **ID** | CRM-003 |
| **Title** | Address Book with Mobile Access |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CRM-001, CRM-002 |
| **Tags** | `crm`, `mobile`, `address-book`, `offline`, `sync` |

### Description

The system shall provide a mobile-optimized address book that allows technicians and other field staff to search customers, contacts, and site addresses quickly. The address book must support offline access with periodic synchronization and one-tap actions for calling, emailing, or navigating to a customer location.

### Actors

- **Techniker** -- primary user; accesses the address book in the field.
- **Disponent** -- uses the address book for coordination.

### Preconditions

1. The user is authenticated and has `crm:read` permission.
2. The mobile app has been synchronized at least once.

### Flow

**Main Flow:**

1. Technician opens the address book on the mobile app.
2. The app displays a searchable list from the local offline cache.
3. Technician types a search query (name, city, postal code).
4. The app filters results instantly from the local cache.
5. Technician taps a result to view full details.
6. From the detail view, technician can tap to call, email, or open navigation.

**Alternate Flows:**

- **A1 -- Online mode:** If connectivity is available, a server-side search is also triggered for results not yet in the local cache.
- **A2 -- Sync:** The app periodically (configurable, default: every 30 minutes) syncs updated records from the server using a delta-sync approach (only records changed since last sync).

### Postconditions

- The user has accessed the needed contact information.
- Usage metrics are tracked for address book searches.

### Acceptance Criteria

- [ ] The mobile address book loads and is searchable within 2 seconds, even offline.
- [ ] Search works by customer name, contact name, city, postal code, and phone number.
- [ ] Tapping a phone number opens the device's dialer.
- [ ] Tapping an email opens the device's email client.
- [ ] Tapping an address opens the device's maps application with navigation.
- [ ] Delta sync transfers only records modified since the last sync timestamp.
- [ ] The offline cache stores all active customers, contacts, and site addresses.
- [ ] Sync frequency is configurable (default: 30 minutes when on Wi-Fi, 60 minutes on cellular).

---

## CRM-004: Site/Object Management

| Field | Value |
|-------|-------|
| **ID** | CRM-004 |
| **Title** | Site/Object Management |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CRM-001, CORE-006 (File Storage) |
| **Tags** | `crm`, `sites`, `objects`, `locations`, `property` |

### Description

The system shall manage sites (Objekte) -- physical locations where MB Boiler & Heizung AG has installed or services equipment. A customer can have multiple sites (e.g., different buildings or properties). Each site has its own address, access instructions, and associated installations. Sites may have a different address from the customer's billing address.

### Actors

- **Projektleiter** -- creates and manages sites.
- **Techniker** -- views sites; can create sites via mobile.
- **Disponent** -- views sites for scheduling.

### Preconditions

1. The parent customer exists and is active.
2. The user has `crm:write` permission.

### Flow

**Main Flow -- Create Site:**

1. User submits site data linked to a customer: name/label, address, floor/unit, access instructions, site type.
2. The system validates the address and customer reference.
3. The system creates the site record with a sequential site number per customer.
4. The system geocodes the address (optional, background job) for map display.
5. The system publishes `site.created` event.

**Alternate Flows:**

- **A1 -- Site address same as customer:** User checks a flag to copy the customer's address.
- **A2 -- Site deactivation:** Site is marked inactive. All installations under it are also marked inactive. A warning is shown if there are open orders for the site.

### Postconditions

- The site is linked to the customer and has its own address.
- Geocoordinates are stored if geocoding succeeds.

### Acceptance Criteria

- [ ] Sites can be created with: name/label (required), street (required), postal code (required), city (required), canton (optional), floor/unit (optional), access_instructions (text, optional), site_type (enum: residential, commercial, industrial), customer_id (required).
- [ ] Each site has a unique number within the customer (e.g., Customer K-00001, Site O-001).
- [ ] Sites can have a different address from the customer billing address.
- [ ] Access instructions (e.g., "Ring at Meier, 3rd floor left") are stored and visible on mobile.
- [ ] Sites are displayed on a map view using geocoded coordinates.
- [ ] Sites can be deactivated (soft delete) but not permanently deleted.
- [ ] A list of all installations at the site is accessible from the site detail view.
- [ ] `site.created`, `site.updated`, `site.deactivated` events are published.

---

## CRM-005: Technical Installation Management

| Field | Value |
|-------|-------|
| **ID** | CRM-005 |
| **Title** | Technical Installation Management |
| **Priority** | H |
| **Complexity** | High |
| **Dependencies** | CRM-004, CORE-006 |
| **Tags** | `crm`, `installations`, `equipment`, `assets`, `hvac` |

### Description

The system shall manage technical installations (Anlagen) at each site. An installation represents a specific piece of HVAC equipment (boiler, heat pump, radiator system, solar thermal, etc.). Each installation has a type, manufacturer, model, serial number, commissioning date, warranty information, and technical specifications. Installations are the core asset tracked throughout the system.

### Actors

- **Projektleiter** -- creates and manages installations.
- **Techniker** -- views installations; captures installation data in the field.
- **System** -- tracks maintenance schedules and warranty expiry.

### Preconditions

1. The parent site exists.
2. The user has `crm:write` permission.

### Flow

**Main Flow -- Create Installation:**

1. User submits installation data linked to a site: type, manufacturer, model, serial number.
2. The system validates the data and site reference.
3. The system creates the installation record with a unique installation ID.
4. The system sets up default maintenance intervals based on the installation type (if configured).
5. The system publishes `installation.created` event.

**Alternate Flows:**

- **A1 -- Installation from catalog:** User selects a manufacturer/model from the product catalog; technical specs are pre-filled.
- **A2 -- Installation decommissioned:** The installation is marked as decommissioned with a date and reason. It remains in the system for historical reference.

### Postconditions

- The installation is linked to the site and is trackable for maintenance and service.

### Acceptance Criteria

- [ ] Installations can be created with: type (enum: boiler, heat_pump, solar_thermal, radiator_system, ventilation, hot_water, other), manufacturer (required), model (required), serial_number (optional), commissioning_date (optional), warranty_end_date (optional), power_output_kw (optional), fuel_type (optional: gas, oil, electric, pellet, other), technical_notes (text, optional), site_id (required).
- [ ] Each installation has a unique system-wide ID (format: `A-NNNNN`).
- [ ] Installations can be decommissioned with a date and reason.
- [ ] Decommissioned installations are retained for historical reference but excluded from active maintenance checks.
- [ ] Default maintenance intervals are auto-created based on installation type (configurable per type).
- [ ] The installation detail view shows: all maintenance intervals, full service history, assigned images, notes, and linked spare parts.
- [ ] `installation.created`, `installation.updated`, `installation.decommissioned` events are published.

---

## CRM-006: Installation Information Capture

| Field | Value |
|-------|-------|
| **ID** | CRM-006 |
| **Title** | Installation Information Capture |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CRM-005, CORE-006 (File Storage) |
| **Tags** | `crm`, `installations`, `data-capture`, `mobile`, `field` |

### Description

The system shall allow technicians to capture and update installation information directly in the field using the mobile app. This includes photographing nameplates, recording serial numbers, updating technical specifications, and scanning barcodes/QR codes. Captured data is synchronized to the server when connectivity is available.

### Actors

- **Techniker** -- captures data in the field.
- **Projektleiter** -- reviews and corrects captured data.

### Preconditions

1. The installation record exists (or can be created on-the-fly).
2. The mobile app is installed and the user is authenticated.

### Flow

**Main Flow:**

1. Technician opens an installation record on the mobile app.
2. Technician taps "Capture Information."
3. The app presents a form with fields pre-filled from existing data.
4. Technician can: photograph the nameplate (camera), scan a barcode/QR code, manually enter or update fields.
5. The app stores the data locally.
6. When connectivity is available, the app syncs the captured data to the server.
7. The system validates and merges the data with the existing record.
8. The system publishes `installation.updated` event.

**Alternate Flows:**

- **A1 -- Conflict on sync:** If the server record was updated while the technician was offline, the system presents both versions and lets the user choose or merge.
- **A2 -- New installation discovered:** Technician can create a new installation record directly from the capture screen.

### Postconditions

- The installation record is updated with the captured information.
- Photos are stored in the file storage service and linked to the installation.

### Acceptance Criteria

- [ ] Technicians can update installation fields from the mobile app.
- [ ] The mobile app supports camera capture for photographing nameplates and equipment.
- [ ] Barcode/QR code scanning auto-populates the serial number field.
- [ ] Data captured offline is queued and synchronized when connectivity is restored.
- [ ] Conflict resolution is available when the server record was modified during offline capture.
- [ ] All captured data changes are logged with the capturing user and timestamp.
- [ ] Photos captured in the field are automatically compressed to a configurable maximum size (default: 2 MB) before upload.

---

## CRM-007: Maintenance Interval Management

| Field | Value |
|-------|-------|
| **ID** | CRM-007 |
| **Title** | Maintenance Interval Management |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CRM-005 |
| **Tags** | `crm`, `maintenance`, `intervals`, `scheduling`, `preventive` |

### Description

The system shall allow defining maintenance intervals for each installation. An interval specifies the type of maintenance, the frequency (e.g., every 12 months), and the reference date (last service or commissioning). The system tracks when each maintenance is due and provides views of upcoming and overdue maintenance.

### Actors

- **Projektleiter** -- defines and modifies maintenance intervals.
- **Disponent** -- views upcoming maintenance for scheduling.
- **System** -- calculates due dates and flags overdue items.

### Preconditions

1. The installation exists.
2. The user has `crm:write` permission to modify intervals.

### Flow

**Main Flow -- Create Interval:**

1. User selects an installation and adds a maintenance interval.
2. User specifies: maintenance type (e.g., annual service, filter change), frequency in months, reference date (last service or commissioning date).
3. The system calculates the next due date.
4. The system stores the interval.

**Main Flow -- After Service Completion:**

1. When a service order linked to a maintenance interval is completed, the system updates the last-service date.
2. The system recalculates the next due date.
3. The system publishes `maintenance.rescheduled` event.

**Alternate Flows:**

- **A1 -- Custom intervals:** Some installations may have non-standard intervals (e.g., every 6 months for high-usage equipment).
- **A2 -- Interval templates:** Default intervals can be configured per installation type and auto-applied on installation creation.

### Postconditions

- The maintenance interval is stored and the next due date is calculated.
- The installation appears in the appropriate "upcoming" or "overdue" maintenance views.

### Acceptance Criteria

- [ ] Maintenance intervals support: type (free text or enum: annual_service, filter_change, chimney_sweep, general_inspection, other), frequency_months (integer, required), last_service_date (date, optional), next_due_date (date, auto-calculated).
- [ ] Multiple intervals can be defined per installation (e.g., annual service + semi-annual filter change).
- [ ] Next due date is automatically calculated: last_service_date + frequency_months. If no last_service_date, commissioning_date is used.
- [ ] Default interval templates are configurable per installation type.
- [ ] After a service is completed, the interval's next_due_date is automatically updated.
- [ ] A dashboard view shows upcoming maintenance grouped by week/month.
- [ ] Overdue maintenance is highlighted distinctly from upcoming maintenance.

---

## CRM-008: Automatic Maintenance Due Marking

| Field | Value |
|-------|-------|
| **ID** | CRM-008 |
| **Title** | Automatic Maintenance Due Marking |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CRM-007, CORE-007 (Background Jobs), CORE-002 (Event Bus) |
| **Tags** | `crm`, `maintenance`, `automation`, `alerts`, `scheduling` |

### Description

The system shall run a daily background job that checks all active maintenance intervals and marks installations as "maintenance due" when the next due date is within a configurable lookahead window (default: 30 days). Overdue maintenance (past due date) is flagged with increasing urgency. Notifications are sent to dispatchers and project managers.

### Actors

- **System** -- runs the daily check and publishes notifications.
- **Disponent** -- receives notifications and schedules service.
- **Projektleiter** -- receives notifications and oversees maintenance.

### Preconditions

1. Maintenance intervals exist (CRM-007).
2. The background job scheduler is operational (CORE-007).

### Flow

**Main Flow:**

1. The daily background job runs at a configured time (default: 06:00 CET).
2. The job queries all active installations with maintenance intervals where `next_due_date <= today + lookahead_days`.
3. For each matching interval, the job sets the maintenance status to `due` (if within lookahead) or `overdue` (if past due).
4. The job publishes `maintenance.due` events for newly due items.
5. The job publishes `maintenance.overdue` events for newly overdue items.
6. Notifications are sent to dispatchers and project managers.

**Alternate Flows:**

- **A1 -- Already scheduled:** If a service order already exists for the maintenance interval, the status is `scheduled` and no additional notification is sent.
- **A2 -- Escalation:** Maintenance overdue by more than 30 days triggers an escalation notification to the admin.

### Postconditions

- All due and overdue maintenance items are flagged in the system.
- Relevant stakeholders are notified.

### Acceptance Criteria

- [ ] A background job runs daily to check maintenance due dates.
- [ ] The lookahead window is configurable (default: 30 days).
- [ ] Installations are marked with maintenance status: `ok`, `due`, `overdue`.
- [ ] `maintenance.due` and `maintenance.overdue` events are published for newly flagged items.
- [ ] A dashboard widget shows the count of due and overdue maintenance items.
- [ ] Notifications (in-app and/or email) are sent to users with the `scheduling:read` permission.
- [ ] Maintenance that is overdue by more than 30 days triggers an escalation notification.
- [ ] The job is idempotent: running it multiple times on the same day produces the same result.

---

## CRM-009: Order & Service History per Site/Installation

| Field | Value |
|-------|-------|
| **ID** | CRM-009 |
| **Title** | Order & Service History per Site/Installation |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CRM-004, CRM-005 |
| **Tags** | `crm`, `history`, `orders`, `service`, `timeline` |

### Description

The system shall maintain and display a complete chronological history of all orders, service visits, quotations, and invoices related to each site and installation. This history is aggregated from multiple modules (field service, quotations, invoicing) and presented as a unified timeline.

### Actors

- **Projektleiter** -- reviews full history for planning and customer communication.
- **Techniker** -- views history before a service visit to understand past issues.
- **Buchhalter** -- views financial history per site/customer.

### Preconditions

1. The site or installation exists.
2. Historical records have been created by other modules.

### Flow

**Main Flow:**

1. User navigates to a site or installation detail view.
2. User opens the "History" tab.
3. The system queries all related records: service orders, quotations, invoices, maintenance events, notes.
4. The system presents a unified, chronologically sorted timeline.
5. Each entry shows: date, type (service/quotation/invoice/maintenance/note), summary, status, linked user.

**Alternate Flows:**

- **A1 -- Filter by type:** User filters the timeline by record type (e.g., only service orders).
- **A2 -- Export history:** User exports the history as PDF or CSV for a customer.

### Postconditions

- The user has a complete view of all interactions with the site/installation.

### Acceptance Criteria

- [ ] The history timeline aggregates: service orders, quotations, invoices, maintenance events, notes, and images.
- [ ] The timeline is sorted chronologically (newest first, with option to reverse).
- [ ] Each entry shows: date, type icon/label, summary text, status, and responsible user.
- [ ] Clicking an entry navigates to the full record in the respective module.
- [ ] The timeline is filterable by type and date range.
- [ ] History is available at both site level (all installations) and individual installation level.
- [ ] History can be exported as PDF (formatted report) or CSV (raw data).
- [ ] The history view loads within 3 seconds for sites with up to 500 history entries.

---

## CRM-010: Image Storage & Assignment

| Field | Value |
|-------|-------|
| **ID** | CRM-010 |
| **Title** | Image Storage & Assignment |
| **Priority** | M |
| **Complexity** | Medium |
| **Dependencies** | CRM-004, CRM-005, CORE-006 (File Storage) |
| **Tags** | `crm`, `images`, `photos`, `media`, `mobile` |

### Description

The system shall allow images to be uploaded and assigned to customers, sites, and installations. Images can be captured via the mobile app camera or uploaded from files. Each image has metadata (caption, category, upload date, uploader). Images are stored using the Core Platform file storage service and are accessible on both web and mobile.

### Actors

- **Techniker** -- captures photos in the field.
- **Projektleiter** -- uploads and reviews images.

### Preconditions

1. The target entity (customer, site, or installation) exists.
2. File storage is operational (CORE-006).

### Flow

**Main Flow:**

1. User selects an entity and taps "Add Image."
2. On mobile: the camera opens, or the user selects from gallery. On web: a file picker opens.
3. The user optionally adds a caption and selects a category (nameplate, damage, before/after, general).
4. The image is compressed (if from mobile camera, max 2 MB).
5. The image is uploaded to file storage.
6. Metadata is recorded linking the image to the entity.

**Alternate Flows:**

- **A1 -- Multiple upload:** User selects multiple images at once.
- **A2 -- Offline upload:** Images are stored locally and queued for upload when connectivity is restored.

### Postconditions

- The image is stored and linked to the entity.
- The image is viewable on the entity's detail page.

### Acceptance Criteria

- [ ] Images can be assigned to customers, sites, and installations.
- [ ] Supported formats: JPEG, PNG, HEIF (auto-converted to JPEG).
- [ ] Images are automatically compressed to a maximum of 2 MB for mobile uploads.
- [ ] Thumbnails are generated automatically (200x200px and 600x600px).
- [ ] Each image has metadata: caption (optional), category (nameplate, damage, before_after, general), uploaded_by, uploaded_at.
- [ ] Images are displayed in a gallery view on the entity detail page.
- [ ] Images can be downloaded in original quality.
- [ ] Images captured offline are queued and uploaded on connectivity restoration.
- [ ] A maximum of 50 images per entity is supported (configurable).

---

## CRM-011: Special Notes per Site/Installation

| Field | Value |
|-------|-------|
| **ID** | CRM-011 |
| **Title** | Special Notes per Site/Installation |
| **Priority** | M |
| **Complexity** | Low |
| **Dependencies** | CRM-004, CRM-005 |
| **Tags** | `crm`, `notes`, `comments`, `warnings` |

### Description

The system shall allow users to add timestamped notes to sites and installations. Notes can be categorized (general, warning, access info, technical) and optionally pinned for prominence. Warning notes are displayed as banners when technicians open the site or installation on the mobile app.

### Actors

- **Techniker** -- adds notes from the field; sees warning notes.
- **Projektleiter** -- adds and reviews notes.
- **Disponent** -- sees warning notes when scheduling.

### Preconditions

1. The site or installation exists.
2. The user has `crm:write` permission.

### Flow

**Main Flow:**

1. User opens a site or installation detail view.
2. User selects "Add Note."
3. User enters the note text, selects a category, and optionally toggles "Pin" and "Warning."
4. The system stores the note with the user ID and timestamp.

**Alternate Flows:**

- **A1 -- Warning note:** When a technician opens a site/installation with a warning note, it is displayed as a prominent banner at the top of the screen.
- **A2 -- Edit note:** Notes can be edited within 24 hours of creation by the author. After 24 hours, notes are immutable (a new note must be added for corrections).

### Postconditions

- The note is stored and visible in the entity's notes section and history timeline.

### Acceptance Criteria

- [ ] Notes can be added to sites and installations.
- [ ] Each note has: text (required, max 2000 chars), category (general, warning, access_info, technical), is_pinned (boolean), is_warning (boolean), author, timestamp.
- [ ] Warning notes are displayed as banners on mobile when viewing the entity.
- [ ] Pinned notes appear at the top of the notes list.
- [ ] Notes are editable by the author within 24 hours of creation.
- [ ] Notes are included in the history timeline (CRM-009).
- [ ] Notes can be added offline and synced later.

---

## CRM-012: Spare Parts & Ordering Information

| Field | Value |
|-------|-------|
| **ID** | CRM-012 |
| **Title** | Spare Parts & Ordering Information |
| **Priority** | M |
| **Complexity** | Medium |
| **Dependencies** | CRM-005 |
| **Tags** | `crm`, `spare-parts`, `inventory`, `ordering`, `catalog` |

### Description

The system shall maintain a catalog of spare parts and link them to specific installations. Each part has a name, part number, manufacturer, supplier, price indication, and ordering information. Technicians can look up required parts for an installation in the field and flag parts that need to be ordered.

### Actors

- **Projektleiter** -- manages the spare parts catalog.
- **Techniker** -- looks up and flags parts for ordering.
- **Admin** -- manages supplier information.

### Preconditions

1. The spare parts catalog table exists.
2. The installation exists for linking.

### Flow

**Main Flow -- Link Part to Installation:**

1. User selects an installation and navigates to "Spare Parts."
2. User searches the parts catalog by name, part number, or manufacturer.
3. User selects a part and links it to the installation.
4. Optionally, user specifies quantity typically needed.

**Main Flow -- Flag for Ordering:**

1. Technician identifies a needed part during a service visit.
2. Technician flags the part as "needs ordering" with a quantity and urgency.
3. The system publishes `spare_part.order_requested` event.
4. The request appears in the ordering dashboard for procurement.

**Alternate Flows:**

- **A1 -- Part not in catalog:** Technician can add a new part with minimal info (name, description) for later completion by a project manager.
- **A2 -- Catalog import:** Parts can be imported via CSV from manufacturer catalogs.

### Postconditions

- The part is linked to the installation.
- Order requests are visible in the procurement dashboard.

### Acceptance Criteria

- [ ] A spare parts catalog exists with: name (required), part_number (optional), manufacturer (optional), supplier (optional), unit_price (optional, CHF), description (optional), category (optional).
- [ ] Parts can be linked to one or more installations.
- [ ] Technicians can flag parts as "needs ordering" with quantity and urgency (low, normal, urgent).
- [ ] Order requests are visible on a procurement dashboard.
- [ ] The catalog supports full-text search by name, part number, and manufacturer.
- [ ] Parts can be imported via CSV upload.
- [ ] The catalog is accessible from the mobile app (read-only, with order flagging).

---

## CRM-013: Newsletter Distribution (WhatsApp/Email)

| Field | Value |
|-------|-------|
| **ID** | CRM-013 |
| **Title** | Newsletter Distribution (WhatsApp/Email) |
| **Priority** | L |
| **Complexity** | High |
| **Dependencies** | CRM-001, CRM-002, CORE-007 (Background Jobs) |
| **Tags** | `crm`, `newsletter`, `whatsapp`, `email`, `marketing`, `communication` |

### Description

The system shall allow administrators to compose and send newsletters or announcements to customers via email and/or WhatsApp. Recipients can be selected by filter criteria (customer type, location, installation type). Customers can opt out of communications. Delivery status is tracked per recipient.

### Actors

- **Admin** -- composes and sends newsletters.
- **Projektleiter** -- composes and sends newsletters.
- **System** -- handles delivery via background jobs.

### Preconditions

1. Email sending is configured (SMTP or API-based provider).
2. WhatsApp Business API is configured (if WhatsApp delivery is used).
3. At least one recipient matches the filter criteria.

### Flow

**Main Flow:**

1. User selects "New Newsletter."
2. User defines recipient filters: customer type, canton/city, installation types, opt-in status.
3. The system previews the recipient count.
4. User composes the message (subject, body with rich text for email; plain text for WhatsApp).
5. User selects delivery channel(s): email, WhatsApp, or both.
6. User sends or schedules the newsletter.
7. The system enqueues a background job for each recipient.
8. Delivery status is tracked: pending, sent, delivered, failed, bounced.

**Alternate Flows:**

- **A1 -- Customer has opted out:** The system skips opted-out customers and logs the skip.
- **A2 -- WhatsApp API rate limit:** The system throttles sending to comply with API limits.
- **A3 -- Scheduled send:** The newsletter is queued for a future date/time.

### Postconditions

- The newsletter is sent to all eligible recipients.
- Delivery status is recorded for each recipient.

### Acceptance Criteria

- [ ] Newsletters can be sent via email, WhatsApp, or both.
- [ ] Recipients can be filtered by: customer type, location (canton, city), installation type, opt-in status.
- [ ] The system respects customer opt-out preferences.
- [ ] Delivery status is tracked per recipient: pending, sent, delivered, failed, bounced.
- [ ] Email newsletters support rich text (HTML) formatting.
- [ ] WhatsApp messages are plain text with optional template support (WhatsApp Business API).
- [ ] Newsletter sending is asynchronous via background jobs.
- [ ] Newsletters can be scheduled for future delivery.
- [ ] A log of all sent newsletters with statistics (total, delivered, failed) is maintained.
- [ ] Compliance with Swiss data protection law (nDSG): opt-out is easy, unsubscribe link in every email.

---

## CRM-014: Website Plugin for Customer Orders

| Field | Value |
|-------|-------|
| **ID** | CRM-014 |
| **Title** | Website Plugin for Customer Orders |
| **Priority** | H |
| **Complexity** | High |
| **Dependencies** | CRM-001, CORE-001 (API Gateway), CORE-002 (Event Bus) |
| **Tags** | `crm`, `website`, `plugin`, `customer-portal`, `orders`, `embed` |

### Description

The system shall provide an embeddable website plugin (widget) that allows end-customers to submit service requests online. The plugin is embedded on the MB Boiler & Heizung AG company website via a script tag or iframe. Customers fill in their contact details, select a service category, describe the issue, and set a priority. Submitted orders create a record in the CRM and notify dispatchers.

### Actors

- **End Customer** -- submits a service request via the widget.
- **Disponent** -- receives and processes the submitted request.
- **System** -- validates and stores the submission, sends notifications.

### Preconditions

1. The widget script/iframe is embedded on the company website.
2. The API gateway is accessible from the public internet (or via a dedicated public endpoint).

### Flow

**Main Flow:**

1. End customer visits the MB Boiler website and sees the service request widget.
2. Customer fills in: name, address, phone, email.
3. Customer selects a category: Heizung (Heating), Sanitaer (Sanitary/Plumbing), Sonstiges (Other).
4. Customer describes the problem (free text).
5. Customer selects priority: Niedrig (Low), Mittel (Medium), Hoch (High/Urgent).
6. Customer optionally uploads a photo.
7. Customer submits the form.
8. The system validates the input (CAPTCHA to prevent spam).
9. The system creates a new service request record.
10. The system attempts to match the customer to an existing CRM record (by email or phone).
11. If matched, the request is linked to the existing customer. If not, a new customer prospect is created.
12. The system publishes `service_request.submitted` event.
13. The system sends a confirmation email to the customer.
14. Dispatchers are notified of the new request.

**Alternate Flows:**

- **A1 -- CAPTCHA failure:** The form submission is rejected.
- **A2 -- Duplicate submission:** If a very similar request (same email + same problem text within 1 hour) exists, the system warns and prevents duplicate creation.
- **A3 -- High priority request:** An urgent notification (email + in-app) is sent immediately to dispatchers.

### Postconditions

- A service request record exists in the CRM.
- Dispatchers are notified.
- The customer receives a confirmation email with a reference number.

### Acceptance Criteria

- [ ] The widget is embeddable via a single `<script>` tag or `<iframe>`.
- [ ] The widget is responsive and works on mobile browsers.
- [ ] Required fields: name, phone or email (at least one), category, description.
- [ ] Categories: Heizung, Sanitaer, Sonstiges.
- [ ] Priorities: Niedrig, Mittel, Hoch.
- [ ] CAPTCHA (reCAPTCHA or hCaptcha) is integrated to prevent spam.
- [ ] Photo upload is supported (max 1 photo, max 5 MB).
- [ ] Customer matching against existing CRM records by email and phone.
- [ ] Unmatched submissions create a new customer prospect record.
- [ ] A confirmation email is sent to the customer with a reference number.
- [ ] Dispatchers receive an in-app notification for new requests.
- [ ] High-priority requests trigger an additional email notification.
- [ ] Duplicate submissions within 1 hour (same email + similar description) are detected and blocked.
- [ ] The widget is styled to match the company branding (configurable colors and logo).
- [ ] The widget supports German language; additional languages are configurable.
- [ ] The public API endpoint for the widget uses rate limiting (max 20 submissions per IP per hour).
