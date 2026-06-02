# Module 06: Mobile Technician App -- Detailed Requirements

## Document Metadata

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Module ID         | MOD-06                                     |
| Document Type     | Requirements Specification                 |
| Version           | 1.0                                        |
| Status            | Draft                                      |
| Last Updated      | 2026-03-29                                 |

---

## MOB-001: Order Overview for Assigned Employee

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-001                                                                                           |
| **Title**        | Order Overview for Assigned Employee                                                              |
| **Priority**     | High                                                                                              |
| **Complexity**   | Low                                                                                               |
| **Tags**         | `mobile`, `orders`, `overview`, `list`, `core`                                                    |

### Description

The mobile app must display a filterable, sortable list of all orders (service calls, project assignments, maintenance tasks) assigned to the logged-in technician. The list shows essential information at a glance and provides navigation to order details.

### Actors

- **Field Technician** (primary): Views assigned orders.
- **Team Lead**: Views own assignments and optionally team assignments.

### Preconditions

1. The technician is authenticated in the mobile app.
2. Assignment data has been synced (or is available via API).

### Main Flow

1. Technician opens the mobile app.
2. App displays the order list, defaulting to today's assignments sorted by time.
3. Each order card shows:
   - Order number and type icon (service, project, maintenance).
   - Customer name.
   - Site address (abbreviated).
   - Scheduled time / time window.
   - Status indicator (planned, in progress, completed).
   - Priority indicator (normal, high, urgent).
4. Technician can filter by: date (today, tomorrow, this week, custom range), status, type.
5. Technician can sort by: time, priority, customer name.
6. Technician taps an order card to open the order detail view (MOB-002).

### Alternate Flows

- **AF-1: No Orders**: If no orders are assigned for the selected filter, system displays a "No assignments" message.
- **AF-2: Pull to Refresh**: Technician pulls down to refresh the order list from the server.
- **AF-3: Offline Mode**: If offline, the list displays locally cached orders with an offline indicator banner.
- **AF-4: New Order Notification**: When a new order is pushed (MOB-013), the list updates and the new order is highlighted.

### Postconditions

1. The technician sees an accurate, up-to-date list of assigned orders.

### Acceptance Criteria

1. **AC-1**: The order list displays all orders assigned to the logged-in technician.
2. **AC-2**: Each order card shows order number, customer name, address, time, status, and priority.
3. **AC-3**: The list defaults to today's orders sorted by scheduled time.
4. **AC-4**: Filters by date, status, and type correctly narrow the list.
5. **AC-5**: Tapping an order navigates to the order detail view.
6. **AC-6**: Pull-to-refresh fetches the latest data from the server.
7. **AC-7**: In offline mode, cached orders are displayed with an offline indicator.

### Dependencies

- SCHED-005: Assignment data provision from deployment planning.
- MOB-012: Offline data access.

---

## MOB-002: Order/Site/Installation Information Access

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-002                                                                                           |
| **Title**        | Order/Site/Installation Information Access                                                        |
| **Priority**     | High                                                                                              |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `mobile`, `orders`, `site`, `installation`, `detail`, `read`                                      |

### Description

The mobile app must provide technicians with comprehensive access to order details, site information, and installation records. This includes order scope, customer/site details, installation history, previous service reports, and any special instructions.

### Actors

- **Field Technician** (primary): Views order and site information before and during work.

### Preconditions

1. The technician has navigated to an order from the order list (MOB-001).
2. Order and site data has been synced.

### Main Flow

1. Technician taps an order from the order list.
2. App displays the order detail view with tabs or sections:
   - **Order Info**: Order number, type, description, scope of work, priority, special instructions, assigned date/time.
   - **Customer & Site**: Customer name, contact phone/email, site address (with map link), access instructions, parking info.
   - **Installation(s)**: List of installations at the site (e.g., boiler model, serial number, installation date, warranty status, last service date).
   - **History**: Previous orders/service reports for this site or installation.
   - **Documents**: Attached documents (plans, manuals, previous reports).
3. Technician can tap the address to open navigation (Google Maps / Apple Maps).
4. Technician can tap the phone number to initiate a call.
5. Technician can navigate between tabs to find needed information.

### Alternate Flows

- **AF-1: No Installation Data**: If no installations are linked, the section shows "No installations recorded" with an option to add one (if permitted).
- **AF-2: Offline**: All synced data is accessible. If data was not synced before going offline, a "Data unavailable offline" message is shown for missing sections.

### Postconditions

1. The technician has access to all relevant order, site, and installation information.

### Acceptance Criteria

1. **AC-1**: The order detail view shows order number, type, description, scope, priority, and instructions.
2. **AC-2**: Customer name, contact info, and site address are displayed with tap-to-call and tap-to-navigate.
3. **AC-3**: Installations at the site are listed with model, serial number, installation date, and last service date.
4. **AC-4**: Previous service reports for the site/installation are accessible.
5. **AC-5**: Attached documents can be viewed or downloaded.
6. **AC-6**: In offline mode, synced data is fully accessible.

### Dependencies

- MOB-001: Order list provides navigation to detail.
- MOD-03 (CRM & Asset Management): Customer and site data.
- MOB-012: Offline data caching.

---

## MOB-003: Work Report Creation & Editing

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-003                                                                                           |
| **Title**        | Work Report Creation & Editing                                                                    |
| **Priority**     | High                                                                                              |
| **Complexity**   | High                                                                                              |
| **Tags**         | `mobile`, `reports`, `work-report`, `forms`, `core`                                               |

### Description

The mobile app must allow technicians to create and edit structured work reports for each order. Work reports capture the work performed, findings, materials used, time spent, and next steps. Reports must support draft saving, validation before submission, and photo attachments. Submitted reports feed into the back-office for review, invoicing, and record-keeping.

### Actors

- **Field Technician** (primary): Creates and edits work reports.
- **System**: Validates report completeness before submission.
- **Back Office**: Receives submitted reports for processing.

### Preconditions

1. An order is assigned to the technician.
2. The technician has navigated to the order detail view.

### Main Flow

1. Technician opens an order and selects "Create Work Report" (or "Edit Report" for an existing draft).
2. App presents the work report form with sections:
   - **General**: Report date, arrival time, departure time, order reference (pre-filled).
   - **Work Performed**: Structured text field or checklist of activities performed.
   - **Findings**: Description of findings, condition assessments, anomalies.
   - **Materials Used**: Link to material entry (MOB-004).
   - **Photos**: Link to photo documentation (MOB-007).
   - **Next Steps**: Required follow-up actions, parts to order, next appointment needed (boolean + notes).
   - **Customer Signature**: Digital signature capture pad for customer sign-off.
   - **Technician Notes**: Internal notes not visible to customer.
3. Technician fills in the form progressively during the work.
4. Technician can save as draft at any time.
5. When work is complete, technician selects "Submit Report."
6. System validates:
   - All required fields are filled (work performed, arrival/departure time).
   - At least one activity or finding is recorded.
   - Materials used are entered (if applicable).
   - Customer signature is captured (configurable requirement).
7. If validation passes, report status changes to "Submitted."
8. Report is synced to the server (immediately if online, queued if offline).
9. Back office receives a notification of the submitted report.

### Alternate Flows

- **AF-1: Save as Draft**: Technician saves an incomplete report as draft. Draft is persisted locally and synced when possible.
- **AF-2: Validation Failure**: System highlights missing required fields. Technician can fix and resubmit or save as draft.
- **AF-3: Edit Submitted Report**: Within a configurable grace period (default: 24 hours), technician can edit a submitted report. After the grace period, edits require back-office approval.
- **AF-4: Multiple Reports per Order**: Some orders may require multiple reports (e.g., multi-day work). System supports creating additional reports for the same order.
- **AF-5: Offline Submission**: Report is saved locally and marked for submission. When connectivity is restored, it is automatically synced.

### Postconditions

1. A work report is created or updated and linked to the order.
2. Submitted reports are available in the back-office for review.
3. The order's status is updated to reflect the report submission.

### Acceptance Criteria

1. **AC-1**: A work report can be created with all specified fields from the order detail view.
2. **AC-2**: The report form supports progressive saving as draft.
3. **AC-3**: Submission is blocked if required fields (work performed, times) are not filled, with specific error messages.
4. **AC-4**: A customer signature can be captured on the device and is included in the report.
5. **AC-5**: Submitted reports appear in the back-office within 60 seconds (when online).
6. **AC-6**: Reports created offline are automatically submitted when connectivity is restored.
7. **AC-7**: A submitted report can be edited within the configurable grace period.
8. **AC-8**: Multiple reports can be created for the same order.

### Dependencies

- MOB-001/MOB-002: Order context.
- MOB-004: Material entry within report.
- MOB-007: Photo attachments.
- MOB-008: Time data linked to report.
- MOB-009: Report submission gates time report release.
- MOB-012: Offline support.

---

## MOB-004: Service Line Items & Material Lists

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-004                                                                                           |
| **Title**        | Service Line Items & Material Lists                                                               |
| **Priority**     | High                                                                                              |
| **Complexity**   | High                                                                                              |
| **Tags**         | `mobile`, `materials`, `catalog`, `igh`, `line-items`, `core`                                     |

### Description

The mobile app must allow technicians to record service line items and materials used during an order. Technicians can search and select items from the IGH catalog (industry-standard HVAC catalog) and the company's internal material catalog. Each entry includes item reference, description, quantity, and unit. The material list is linked to the work report and feeds into back-office invoicing.

### Actors

- **Field Technician** (primary): Records materials and service items used.
- **System**: Provides catalog search and validates entries.

### Preconditions

1. A work report exists (draft or in progress) for the order.
2. Catalog data (IGH + internal) has been synced to the device (at least partially).

### Main Flow

1. Technician opens the work report and navigates to the "Materials / Service Items" section.
2. App displays the current list of added items (if any).
3. Technician selects "Add Item."
4. App presents a search interface:
   - **Search Field**: Text search across item number, description, category.
   - **Catalog Toggle**: Switch between IGH catalog and internal catalog.
   - **Recent Items**: Quick-access list of recently used items.
   - **Favorites**: Technician-curated list of frequently used items.
5. Technician searches for and selects an item.
6. App presents the item entry form:
   - Item number (pre-filled from catalog).
   - Description (pre-filled, editable).
   - Quantity (numeric input).
   - Unit (pre-filled from catalog: piece, meter, liter, kg, hour, etc.).
7. Technician enters quantity and confirms.
8. Item is added to the material list.
9. Technician can add more items or return to the report.

### Alternate Flows

- **AF-1: Free-Text Item**: Technician selects "Custom Item" to add a material not found in the catalog. Enters description, quantity, and unit manually.
- **AF-2: Edit Item**: Technician taps an existing item to modify quantity or description.
- **AF-3: Remove Item**: Technician swipes or selects an item to remove it from the list.
- **AF-4: Barcode/QR Scan**: Technician scans a barcode or QR code on a material package. System looks up the item in the catalog and pre-fills the entry form.
- **AF-5: Offline Catalog**: If the full catalog is not synced, technician can still search the cached subset. Items not in cache can be entered as free-text.

### Postconditions

1. Material/service line items are recorded and linked to the work report.
2. Line item data is available for back-office invoicing after report submission.

### Acceptance Criteria

1. **AC-1**: Technician can search items across IGH and internal catalogs by item number, description, or category.
2. **AC-2**: Selecting a catalog item pre-fills item number, description, and unit.
3. **AC-3**: Quantity can be entered as a decimal number with the appropriate unit.
4. **AC-4**: Free-text items can be added for materials not in the catalog.
5. **AC-5**: Recently used and favorited items are accessible for quick entry.
6. **AC-6**: Items can be edited and removed from the material list.
7. **AC-7**: The material list is persisted with the work report (draft and submitted).
8. **AC-8**: Catalog search works offline using cached catalog data.

### Dependencies

- MOB-003: Material list is part of the work report.
- MOD-10 (Material Catalogs & Interfaces) / IGH Integration: Catalog data source.
- MOB-012: Offline catalog caching.

---

## MOB-005: Small Order Assignment within Project

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-005                                                                                           |
| **Title**        | Small Order Assignment within Project                                                             |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `mobile`, `orders`, `project`, `sub-orders`, `assignment`                                         |

### Description

The mobile app must allow authorized technicians (e.g., team leads) to create and assign small/subsidiary orders within the context of an existing project. This enables on-site task delegation without returning to the back-office. Small orders are linked to the parent project and follow the standard order lifecycle.

### Actors

- **Team Lead / Senior Technician** (primary): Creates and assigns small orders.
- **Field Technician**: Receives and executes small order assignments.

### Preconditions

1. The user has `mobile:small-order:create` permission.
2. A parent project exists and is active.
3. Team members are available in the assignment list.

### Main Flow

1. Team lead opens a project in the mobile app.
2. Team lead selects "Create Small Order."
3. App presents a simplified order form:
   - **Title**: Brief description of the work.
   - **Description**: Details and instructions.
   - **Assign To**: Select from team members assigned to the project.
   - **Priority**: Normal, High, Urgent.
   - **Due Date**: Expected completion date.
   - **Parent Project**: Pre-filled (locked to current project).
4. Team lead fills in the form and submits.
5. System creates the small order linked to the parent project.
6. Assigned technician receives a push notification (MOB-013).
7. The small order appears in the assigned technician's order list (MOB-001).

### Alternate Flows

- **AF-1: Self-Assignment**: Team lead assigns the small order to themselves.
- **AF-2: Offline Creation**: Small order is created offline and synced when connectivity is restored.
- **AF-3: Edit/Cancel**: Team lead can edit or cancel a small order they created.

### Postconditions

1. A small order is created, linked to the parent project, and assigned to a technician.
2. The assigned technician is notified.
3. The small order is visible in both the mobile app and the back-office.

### Acceptance Criteria

1. **AC-1**: A small order can be created from the project view with title, description, assignee, priority, and due date.
2. **AC-2**: The small order is linked to the parent project.
3. **AC-3**: The assigned technician receives a push notification.
4. **AC-4**: The small order appears in the assigned technician's order list.
5. **AC-5**: Only users with `mobile:small-order:create` permission can create small orders.
6. **AC-6**: Small orders created offline are synced and visible in the back-office.

### Dependencies

- MOD-04 (Project Management): Parent project reference.
- MOB-001: Small orders appear in the order list.
- MOB-013: Push notifications for assignment.
- MOB-012: Offline support.

---

## MOB-006: Document Access & Storage per Order

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-006                                                                                           |
| **Title**        | Document Access & Storage per Order                                                               |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `mobile`, `documents`, `storage`, `access`, `files`                                               |

### Description

The mobile app must allow technicians to view documents attached to orders and projects, and to upload new documents from the device. Documents include plans, manuals, previous reports, photos, and any other file types. Downloaded documents are cached locally for offline access.

### Actors

- **Field Technician** (primary): Views and uploads documents.

### Preconditions

1. An order or project exists with attached documents (for viewing) or the technician has a file to upload.
2. The technician has navigated to the order/project detail view.

### Main Flow

1. Technician opens the order detail view and navigates to the "Documents" section.
2. App displays a list of attached documents with: file name, type icon, size, upload date.
3. **View**: Technician taps a document to view it. Supported types (PDF, images, text) open inline; others trigger a download prompt.
4. **Upload**: Technician selects "Upload Document," picks a file from the device (file picker or camera), optionally adds a description and category, and uploads.
5. Uploaded document is synced to the server and appears in the project's document repository (PROJ-006).

### Alternate Flows

- **AF-1: Offline View**: Previously viewed/cached documents are available offline. Documents not cached show a "Download required" indicator.
- **AF-2: Offline Upload**: Document is queued locally and uploaded when connectivity is restored.
- **AF-3: Large File Warning**: If file exceeds the size limit, system warns the user and suggests compression or Wi-Fi upload.

### Postconditions

1. Documents are accessible to the technician.
2. Uploaded documents are stored in the project repository.

### Acceptance Criteria

1. **AC-1**: The documents section lists all documents attached to the order/project.
2. **AC-2**: PDFs and images can be viewed inline on the device.
3. **AC-3**: Technician can upload a document with optional description and category.
4. **AC-4**: Uploaded documents appear in the web-based project document repository.
5. **AC-5**: Previously viewed documents are available offline.
6. **AC-6**: Documents queued offline are uploaded automatically on reconnect.

### Dependencies

- PROJ-006: Server-side document repository.
- MOB-012: Offline caching and sync.

---

## MOB-007: Photo Documentation

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-007                                                                                           |
| **Title**        | Photo Documentation                                                                               |
| **Priority**     | High                                                                                              |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `mobile`, `photos`, `camera`, `documentation`, `core`                                             |

### Description

The mobile app must allow technicians to capture, annotate, categorize, and attach photos to orders and work reports. Photos serve as visual documentation of work performed, site conditions, installations, damages, and before/after comparisons. Metadata (timestamp, GPS, order reference) is automatically embedded.

### Actors

- **Field Technician** (primary): Captures and annotates photos.

### Preconditions

1. The device has a functional camera.
2. The technician has an active order.
3. Camera permission has been granted.

### Main Flow

1. Technician opens an order or work report and selects "Add Photo."
2. App opens the device camera.
3. Technician captures a photo.
4. App displays the captured photo with options:
   - **Annotate**: Draw, add text labels, or highlight areas on the photo.
   - **Categorize**: Select a category (Before, After, Damage, Installation, General, Nameplate/Serial).
   - **Description**: Add a text caption.
5. Technician confirms and saves the photo.
6. System automatically embeds metadata:
   - Timestamp.
   - GPS coordinates (if location permission granted).
   - Order/report reference.
   - Technician ID.
7. Photo is attached to the work report and/or order.
8. Photo is queued for upload to the server.

### Alternate Flows

- **AF-1: Gallery Import**: Technician selects "Choose from Gallery" to attach an existing photo from the device.
- **AF-2: Multiple Photos**: Technician can capture multiple photos in sequence before returning to the report.
- **AF-3: Delete Photo**: Technician can delete a photo before report submission.
- **AF-4: Offline**: Photos are stored locally and uploaded when connectivity is restored.

### Postconditions

1. Photos are attached to the order/report with metadata.
2. Photos are uploaded to the server document repository.

### Acceptance Criteria

1. **AC-1**: A photo can be captured from within the app using the device camera.
2. **AC-2**: Photos can be annotated with drawing tools and text labels.
3. **AC-3**: Photos can be categorized (Before, After, Damage, Installation, General, Nameplate/Serial).
4. **AC-4**: Metadata (timestamp, GPS, order reference, technician) is automatically embedded.
5. **AC-5**: Multiple photos can be attached to a single order/report.
6. **AC-6**: Photos captured offline are stored locally and uploaded on reconnect.
7. **AC-7**: Uploaded photos appear in the project document repository.

### Dependencies

- MOB-003: Photos attach to work reports.
- MOB-006: Photos stored in document repository.
- MOB-012: Offline storage and sync.
- Device: Camera hardware and permissions.

---

## MOB-008: Mobile Time Recording

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-008                                                                                           |
| **Title**        | Mobile Time Recording                                                                             |
| **Priority**     | High                                                                                              |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `mobile`, `time`, `recording`, `tracking`, `core`                                                 |

### Description

The mobile app must allow technicians to record time spent on each order. Time recording supports both timer-based (start/stop) and manual entry modes. Time entries include activity type, order reference, break tracking, and travel time. Time data feeds into the central time management system and is subject to the report lock (MOB-009).

### Actors

- **Field Technician** (primary): Records working time.
- **System**: Enforces time recording rules and report lock.

### Preconditions

1. An order is assigned to the technician.
2. The technician has navigated to the order.

### Main Flow

1. Technician opens an order and selects "Start Timer" or "Record Time."
2. **Timer Mode**:
   - Technician taps "Start" to begin recording.
   - Timer runs visibly on screen (and in background if app is minimized).
   - Technician can tap "Break" to pause (break time is tracked separately).
   - Technician taps "Stop" to end recording.
   - System records: start time, end time, break duration, net working time.
3. **Manual Entry Mode**:
   - Technician enters: date, start time, end time, break duration.
   - System calculates net working time.
4. Technician selects an activity type: Travel, On-Site Work, Administrative, Other.
5. Technician can add a note to the time entry.
6. Time entry is saved and linked to the order.

### Alternate Flows

- **AF-1: Multiple Time Entries**: A technician can record multiple time entries per order (e.g., travel + on-site work).
- **AF-2: Edit Time Entry**: Technician can edit a time entry before the report is submitted.
- **AF-3: Overnight Timer**: If the timer crosses midnight, system automatically splits the entry across two days.
- **AF-4: Offline**: Time entries are recorded locally and synced when connectivity is restored.

### Postconditions

1. Time entries are recorded and linked to the order.
2. Time data is available for the time report lock check (MOB-009).
3. Time data is synced to the central time management system.

### Acceptance Criteria

1. **AC-1**: A timer can be started, paused (break), and stopped for an order.
2. **AC-2**: The running timer is visible even when the app is minimized (e.g., persistent notification).
3. **AC-3**: Manual time entry is supported with date, start/end time, and break duration.
4. **AC-4**: Activity type (Travel, On-Site Work, Administrative, Other) can be assigned to each entry.
5. **AC-5**: Multiple time entries can be recorded per order.
6. **AC-6**: Time entries are editable before report submission.
7. **AC-7**: Time data recorded offline is synced on reconnect.
8. **AC-8**: Net working time is calculated correctly (total time minus breaks).

### Dependencies

- MOB-003: Time data is part of the work report context.
- MOB-009: Time report lock depends on report submission.
- Central time management (back-office time/payroll system).
- MOB-012: Offline support.

---

## MOB-009: Time Report Lock

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-009                                                                                           |
| **Title**        | Time Report Lock                                                                                  |
| **Priority**     | High                                                                                              |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `mobile`, `time`, `lock`, `enforcement`, `business-rule`                                          |

### Description

The system must enforce a lock on time reports: time entries for an order can only be finalized and released for payroll/billing when the associated work report for that order is fully submitted. This ensures that time records are always backed by a complete work report, preventing unbacked time claims.

### Actors

- **System** (primary): Enforces the lock rule.
- **Field Technician**: Submits work reports to unlock time entries.
- **Back Office**: Reviews released time reports.

### Preconditions

1. Time entries exist for an order (MOB-008).
2. A work report exists (or is required) for the same order (MOB-003).

### Main Flow

1. Technician has recorded time entries for an order (MOB-008).
2. Technician attempts to finalize/release time entries for the order.
3. System checks whether a work report for the order exists and is in "Submitted" status.
4. **If work report is submitted**: Time entries are released (status: "Released"). Back office is notified.
5. **If work report is NOT submitted**: System blocks the release and displays a message: "Time entries cannot be released until the work report for this order is submitted." System provides a link to the work report form.

### Alternate Flows

- **AF-1: Auto-Release**: When a work report is submitted, system automatically releases all associated time entries that are pending release. Technician is notified.
- **AF-2: Back-Office Override**: A back-office user with `time:release:override` permission can manually release time entries without a submitted work report, with a mandatory reason.
- **AF-3: Report Retracted**: If a submitted work report is retracted (sent back for editing), the associated released time entries are reverted to "Pending" status.

### Postconditions

1. Time entries are released only when backed by a submitted work report.
2. Released time entries are available for payroll/billing processing.
3. Override actions are logged.

### Acceptance Criteria

1. **AC-1**: Time entries cannot be released when no work report is submitted for the order.
2. **AC-2**: The system displays a clear message explaining why release is blocked and links to the report form.
3. **AC-3**: When a work report is submitted, associated pending time entries are automatically released.
4. **AC-4**: Back-office users with override permission can release time entries without a report, with logged justification.
5. **AC-5**: Retracting a work report reverts associated time entries to "Pending" status.
6. **AC-6**: Released time entries are visible in the back-office time management module.

### Dependencies

- MOB-003: Work report submission triggers time release.
- MOB-008: Time entries subject to lock.
- Central time management (back-office) receives released entries.

---

## MOB-010: Project-Related Chat

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-010                                                                                           |
| **Title**        | Project-Related Chat                                                                              |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | High                                                                                              |
| **Tags**         | `mobile`, `chat`, `messaging`, `project`, `collaboration`                                         |

### Description

The mobile app must provide a project-scoped chat feature that allows technicians and office staff to communicate within the context of a specific project or order. Messages, photos, and files can be shared. Chat history is persisted and accessible from both mobile and web.

### Actors

- **Field Technician** (primary): Sends and receives messages.
- **Project Manager**: Participates in project chats from web or mobile.
- **Office Staff**: Participates in project chats from the web app.

### Preconditions

1. The user is a member of the project team.
2. The user has navigated to a project or order.

### Main Flow

1. Technician opens a project or order and navigates to the "Chat" section.
2. App displays the chat history for the project/order context.
3. Technician types a message and taps "Send."
4. Message is delivered to all project/order participants in real time (when online).
5. Recipients receive a push notification (configurable, see MOB-013).
6. Messages are persisted on the server and synchronized across devices.

### Alternate Flows

- **AF-1: Share Photo**: Technician attaches a photo from camera or gallery to a chat message.
- **AF-2: Share Document**: Technician attaches a document to a chat message.
- **AF-3: Offline**: Messages typed offline are queued and sent when connectivity is restored. Offline indicator is shown.
- **AF-4: Mention**: Technician @-mentions a specific team member to highlight the message.
- **AF-5: Web Access**: Chat is accessible from the web application with full history.

### Postconditions

1. Messages are delivered to participants and persisted.
2. Push notifications are sent for new messages.

### Acceptance Criteria

1. **AC-1**: Messages can be sent and received in real time within a project/order context.
2. **AC-2**: Photos and documents can be attached to chat messages.
3. **AC-3**: Chat history is persisted and visible across mobile and web.
4. **AC-4**: Push notifications are sent for new chat messages.
5. **AC-5**: Messages typed offline are queued and delivered on reconnect.
6. **AC-6**: Only project/order team members can see and participate in the chat.

### Dependencies

- MOD-04: Project context.
- MOB-013: Push notifications.
- MOB-012: Offline message queuing.
- Platform: Real-time messaging infrastructure (WebSocket / similar).

---

## MOB-011: Installation Overview for Employees

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-011                                                                                           |
| **Title**        | Installation Overview for Employees                                                               |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Low                                                                                               |
| **Tags**         | `mobile`, `installations`, `overview`, `read`                                                     |

### Description

The mobile app must provide technicians with an overview of all installations at a customer site, independent of a specific order. This allows technicians to see the full picture of equipment at a site, including type, model, age, warranty status, service history, and any known issues.

### Actors

- **Field Technician** (primary): Views installation data.

### Preconditions

1. The technician has navigated to a site (via order or direct search).
2. Installation records exist for the site.

### Main Flow

1. Technician navigates to the site view and selects "Installations."
2. App displays a list of all installations at the site:
   - Equipment type and model.
   - Serial number.
   - Installation date.
   - Warranty expiration.
   - Last service date.
   - Status indicator (operational, needs repair, decommissioned).
3. Technician taps an installation for detailed view:
   - Technical specifications.
   - Service history (list of past orders/reports).
   - Attached documents (manuals, certificates).
   - Known issues or open defects.

### Alternate Flows

- **AF-1: No Installations**: "No installations recorded for this site" message displayed.
- **AF-2: Offline**: Synced installation data is accessible offline.

### Postconditions

1. Technician has access to comprehensive installation information.

### Acceptance Criteria

1. **AC-1**: All installations at a site are listed with type, model, serial number, and key dates.
2. **AC-2**: Tapping an installation shows detailed specifications and service history.
3. **AC-3**: Attached documents (manuals, certificates) are accessible from the installation detail.
4. **AC-4**: Installation data is available offline when previously synced.

### Dependencies

- MOD-03 (CRM & Asset Management): Installation records source.
- MOB-002: Installations accessible from order context.
- MOB-012: Offline caching.

---

## MOB-012: Offline Functionality with Auto-Sync

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-012                                                                                           |
| **Title**        | Offline Functionality with Auto-Sync                                                              |
| **Priority**     | High                                                                                              |
| **Complexity**   | High                                                                                              |
| **Tags**         | `mobile`, `offline`, `sync`, `storage`, `core`, `infrastructure`                                  |

### Description

The mobile app must function fully for core operations when the device has no network connectivity. Data is stored locally on the device using an embedded database. When connectivity is restored, the app must automatically synchronize local changes with the server, handling conflicts gracefully. This is critical for technicians working in basements, rural areas, or buildings with poor connectivity.

### Actors

- **Field Technician** (primary): Uses the app offline.
- **System**: Manages local storage, sync queue, and conflict resolution.

### Preconditions

1. The app has been used while online at least once to populate the initial local data cache.
2. The device has sufficient storage for local data.

### Main Flow

1. App detects loss of network connectivity.
2. App displays a persistent offline indicator (e.g., banner or icon).
3. Technician continues working with locally cached data:
   - View assigned orders (synced during last online session).
   - View site, customer, and installation data (cached).
   - Create and edit work reports (saved locally).
   - Capture photos (stored locally).
   - Record time entries (saved locally).
   - Create chat messages (queued locally).
4. All create/update operations are written to the local database and added to a sync queue.
5. App periodically checks for connectivity.
6. When connectivity is restored:
   - App displays a "Syncing..." indicator.
   - Sync engine processes the queue in chronological order.
   - Server-side changes since last sync are pulled down.
   - Conflicts are resolved (see conflict resolution rules).
   - App updates local data with server state.
   - Sync complete indicator is shown.

### Alternate Flows

- **AF-1: Conflict Resolution (Last Write Wins)**: If the same record was modified on both server and device, the last-modified timestamp determines the winner. The overwritten version is logged server-side for audit purposes.
- **AF-2: Sync Failure**: If a specific record fails to sync (e.g., referenced entity deleted on server), the record is flagged for manual resolution and the technician is notified.
- **AF-3: Selective Sync**: On first login or manual trigger, technician can choose which projects/orders to sync for offline access (to manage storage).
- **AF-4: Storage Warning**: If local storage is near capacity, app warns the technician and suggests clearing old cached data.

### Postconditions

1. All offline changes are synchronized with the server.
2. Local data reflects the current server state.
3. Conflicts are resolved and logged.

### Acceptance Criteria

1. **AC-1**: The app displays assigned orders, site data, and installation info when offline.
2. **AC-2**: Work reports can be created and edited while offline.
3. **AC-3**: Photos can be captured and stored locally while offline.
4. **AC-4**: Time entries can be recorded while offline.
5. **AC-5**: An offline indicator is visible when the device has no connectivity.
6. **AC-6**: When connectivity is restored, all queued changes are automatically synced within 2 minutes.
7. **AC-7**: Sync conflicts are resolved using last-write-wins and the overwritten data is logged.
8. **AC-8**: Failed sync items are flagged for manual resolution with a clear error description.
9. **AC-9**: Local data is encrypted at rest on the device.
10. **AC-10**: The app functions without errors for at least 8 hours of continuous offline use.

### Dependencies

- All MOB-* requirements depend on offline support.
- Platform: Embedded database (SQLite or equivalent).
- Platform: Encryption at rest.

---

## MOB-013: Push Notifications

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-013                                                                                           |
| **Title**        | Push Notifications                                                                                |
| **Priority**     | High                                                                                              |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `mobile`, `notifications`, `push`, `alerts`, `core`                                               |

### Description

The mobile app must support push notifications to alert technicians of important events in real time. Notification types include new task assignments, order changes, chat messages, upcoming appointments, overdue tasks, and daily report reminders. Notifications are configurable per user.

### Actors

- **System** (primary): Sends push notifications based on events.
- **Field Technician**: Receives and acts on notifications.

### Preconditions

1. The technician has the mobile app installed with push notification permission granted.
2. The device is registered for push notifications (APNS / FCM).

### Main Flow

1. A triggering event occurs in the backend (e.g., new assignment created, order modified, chat message sent).
2. Backend notification service evaluates the event against notification rules.
3. Service constructs the notification payload:
   - Title (e.g., "New Assignment").
   - Body (e.g., "Service call at Muster AG, tomorrow 08:00").
   - Action (deep link to the relevant screen in the app).
   - Priority (normal or high).
4. Service sends the notification via APNS (iOS) and/or FCM (Android).
5. Device receives and displays the notification.
6. Technician taps the notification.
7. App opens and navigates to the relevant screen (e.g., order detail, chat).

### Alternate Flows

- **AF-1: Notification Preferences**: Technician configures which notification types to receive in app settings. Muted types are not sent.
- **AF-2: Quiet Hours**: Notifications are suppressed during configured quiet hours (e.g., 20:00-07:00) except for urgent priority.
- **AF-3: Badge Count**: App icon shows a badge with the count of unread notifications.
- **AF-4: In-App Notification Center**: A notification center within the app lists all recent notifications.

### Postconditions

1. Technician is alerted to important events in near real-time.

### Acceptance Criteria

1. **AC-1**: Push notifications are received for new task assignments within 60 seconds.
2. **AC-2**: Push notifications are received for order changes (reschedule, cancellation).
3. **AC-3**: Push notifications are received for new chat messages.
4. **AC-4**: Tapping a notification opens the app and navigates to the relevant screen.
5. **AC-5**: Notification types can be individually enabled/disabled in app settings.
6. **AC-6**: Quiet hours can be configured; non-urgent notifications are suppressed during quiet hours.
7. **AC-7**: An in-app notification center lists recent notifications.

### Dependencies

- SCHED-005: Assignment events trigger notifications.
- MOB-010: Chat message events trigger notifications.
- MOB-015: Daily reminder notification.
- Platform: APNS (iOS), FCM (Android).

---

## MOB-014: Quotation View without Prices

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-014                                                                                           |
| **Title**        | Quotation View without Prices                                                                     |
| **Priority**     | Low                                                                                               |
| **Complexity**   | Low                                                                                               |
| **Tags**         | `mobile`, `quotation`, `read`, `price-hidden`                                                     |

### Description

The mobile app must allow technicians to view quotation details associated with an order, but with all pricing information (unit prices, totals, discounts, margins) hidden. This enables technicians to understand the scope of quoted work without exposing commercially sensitive pricing data.

### Actors

- **Field Technician** (primary): Views quotation scope.

### Preconditions

1. A quotation exists linked to the order.
2. The technician's role does not include price visibility permissions.

### Main Flow

1. Technician opens an order with a linked quotation.
2. App displays a "Quotation" section or tab.
3. The view shows:
   - Quotation number and date.
   - List of quoted line items: description, quantity, unit.
   - Scope of work description.
   - Included materials and services (descriptions only).
4. All price columns (unit price, total, discount, tax) are hidden.
5. The quotation is presented as read-only.

### Alternate Flows

- **AF-1: No Quotation**: If no quotation is linked to the order, the section displays "No quotation available."
- **AF-2: Role-Based Price Visibility**: If a user has the `quotation:view-prices` permission (e.g., senior technician), prices are shown. This is the exception, not the default.

### Postconditions

1. The technician sees the scope of the quotation without pricing information.

### Acceptance Criteria

1. **AC-1**: Quotation line items are displayed with description, quantity, and unit only.
2. **AC-2**: No price, discount, margin, or total values are visible to standard technician roles.
3. **AC-3**: Users with `quotation:view-prices` permission see full pricing details.
4. **AC-4**: The quotation view is read-only.

### Dependencies

- MOD-08 (Quotations & Order Processing): Quotation data source.
- MOB-002: Accessible from order detail view.

---

## MOB-015: Daily Reminder for Incomplete Reports

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | MOB-015                                                                                           |
| **Title**        | Daily Reminder for Incomplete Reports                                                             |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Low                                                                                               |
| **Tags**         | `mobile`, `reminder`, `notification`, `reports`, `compliance`                                     |

### Description

The system must send a daily push notification reminding technicians to complete and submit any outstanding work reports. The reminder triggers at a configurable time (default: 17:00 local time) if the technician has orders from the current day (or previous days) with incomplete or unsubmitted work reports.

### Actors

- **System** (primary): Evaluates incomplete reports and sends reminders.
- **Field Technician**: Receives the reminder and completes reports.

### Preconditions

1. The technician has orders with incomplete (draft or not started) work reports.
2. Push notification permission is granted.
3. The configured reminder time has been reached.

### Main Flow

1. At the configured reminder time (default: 17:00), system evaluates each technician's orders for the day.
2. System identifies orders where:
   - Work was assigned for today (or previous days).
   - The work report is missing, in draft status, or not submitted.
3. If incomplete reports exist, system sends a push notification:
   - Title: "Incomplete Reports"
   - Body: "You have X incomplete work report(s). Please complete and submit them."
   - Action: Deep link to the order list filtered by orders with incomplete reports.
4. Technician taps the notification and is taken to the filtered order list.
5. Technician completes and submits the outstanding reports.

### Alternate Flows

- **AF-1: No Incomplete Reports**: If all reports are submitted, no reminder is sent.
- **AF-2: Reminder Snooze**: Technician can snooze the reminder for 1 hour (one-time). After snooze, the reminder triggers again.
- **AF-3: Escalation**: If reports remain incomplete for more than 24 hours after the order date, a notification is also sent to the team lead or back office (configurable).

### Postconditions

1. Technicians are reminded to complete outstanding reports.
2. Report completion rates improve through consistent reminders.

### Acceptance Criteria

1. **AC-1**: A push notification is sent at the configured time if the technician has incomplete reports.
2. **AC-2**: No notification is sent if all reports are complete.
3. **AC-3**: Tapping the notification navigates to the order list filtered by incomplete reports.
4. **AC-4**: The reminder time is configurable (default: 17:00 local time).
5. **AC-5**: Escalation notification is sent to the team lead if reports are incomplete for more than 24 hours (when configured).
6. **AC-6**: The reminder can be snoozed once for 1 hour.

### Dependencies

- MOB-003: Work report status evaluation.
- MOB-013: Push notification delivery.
- MOB-001: Order list with filter capability.
