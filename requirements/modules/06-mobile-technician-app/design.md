# Module 06: Mobile Technician App -- Design Specification

## Document Metadata

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Module ID         | MOD-06                                     |
| Document Type     | Design Specification                       |
| Version           | 1.0                                        |
| Status            | Draft                                      |
| Last Updated      | 2026-03-29                                 |

---

## 1. Architecture Overview

The Mobile Technician App follows an offline-first architecture. All data consumed by the app is cached locally in an embedded SQLite database. Write operations (reports, time entries, photos) are stored locally first and synchronized to the backend via a queue-based sync engine. The backend exposes dedicated mobile API endpoints optimized for bandwidth and payload size.

```
+-------------------+       +------------------+       +-------------------+
|   Mobile App      | <---> |   Mobile BFF     | <---> |  Backend Modules  |
| (React Native /   |       | (Backend for     |       |  (MOD-04, 05, 08  |
|  Flutter)         |       |  Frontend)       |       |   etc.)           |
+-------------------+       +------------------+       +-------------------+
        |                          |
        |  SQLite (local)          |  Push (APNS/FCM)
        |  Sync Queue              |  WebSocket (chat)
        v                          v
  [Local Storage]           [Notification Service]
```

---

## 2. Data Models

### 2.1 LocalOrder (mobile-local model, synced from server)

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key (same as server-side assignment ID).         |
| `order_id`            | UUID          | No       | Server-side order reference.                             |
| `project_id`          | UUID          | No       | Server-side project reference.                           |
| `order_number`        | String(30)    | Yes      | Display order number.                                    |
| `order_type`          | Enum          | Yes      | SERVICE_CALL, PROJECT_WORK, MAINTENANCE, INSTALLATION, INSPECTION. |
| `title`               | String(200)   | No       | Order title/summary.                                     |
| `description`         | Text          | No       | Scope of work description.                               |
| `status`              | Enum          | Yes      | PLANNED, IN_PROGRESS, COMPLETED, CANCELLED.              |
| `priority`            | Enum          | Yes      | NORMAL, HIGH, URGENT.                                    |
| `scheduled_start`     | Timestamp     | Yes      | Scheduled start date/time.                               |
| `scheduled_end`       | Timestamp     | Yes      | Scheduled end date/time.                                 |
| `instructions`        | Text          | No       | Special instructions.                                    |
| `customer_name`       | String(200)   | No       | Customer name (denormalized).                            |
| `customer_phone`      | String(50)    | No       | Customer phone (denormalized).                           |
| `customer_email`      | String(200)   | No       | Customer email (denormalized).                           |
| `site_address`        | String(500)   | No       | Full site address.                                       |
| `site_latitude`       | Decimal(9,6)  | No       | Site GPS latitude.                                       |
| `site_longitude`      | Decimal(9,6)  | No       | Site GPS longitude.                                      |
| `access_instructions` | Text          | No       | Site access notes.                                       |
| `has_work_report`     | Boolean       | Yes      | Whether a work report exists for this order.             |
| `report_status`       | Enum          | No       | DRAFT, SUBMITTED, APPROVED.                              |
| `last_synced_at`      | Timestamp     | Yes      | Last sync timestamp.                                     |

### 2.2 WorkReport

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key (generated locally, used on server).         |
| `order_id`            | UUID (FK)     | Yes      | Reference to LocalOrder.                                 |
| `report_date`         | Date          | Yes      | Date of the report.                                      |
| `arrival_time`        | Timestamp     | No       | Arrival at site.                                         |
| `departure_time`      | Timestamp     | No       | Departure from site.                                     |
| `work_performed`      | Text          | Yes      | Description of work performed.                           |
| `findings`            | Text          | No       | Findings and observations.                               |
| `next_steps`          | Text          | No       | Required follow-up actions.                              |
| `follow_up_needed`    | Boolean       | Yes      | Whether follow-up is required (default: false).          |
| `technician_notes`    | Text          | No       | Internal notes (not customer-visible).                   |
| `customer_signature`  | Blob          | No       | Digital signature data (PNG or SVG path data).           |
| `customer_signer_name`| String(200)   | No       | Name of the person who signed.                           |
| `status`              | Enum          | Yes      | DRAFT, SUBMITTED, APPROVED, REJECTED.                    |
| `submitted_at`        | Timestamp     | No       | Timestamp of submission.                                 |
| `sync_status`         | Enum          | Yes      | SYNCED, PENDING_SYNC, SYNC_FAILED.                       |
| `created_at`          | Timestamp     | Yes      | Local creation timestamp.                                |
| `updated_at`          | Timestamp     | Yes      | Local update timestamp.                                  |

### 2.3 MaterialLineItem

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `work_report_id`      | UUID (FK)     | Yes      | Reference to WorkReport.                                 |
| `catalog_source`      | Enum          | Yes      | IGH, INTERNAL, CUSTOM.                                   |
| `catalog_item_id`     | String(50)    | No       | Catalog item number (from IGH or internal).              |
| `description`         | String(300)   | Yes      | Item description.                                        |
| `quantity`            | Decimal(10,3) | Yes      | Quantity used.                                           |
| `unit`                | String(20)    | Yes      | Unit of measure.                                         |
| `sort_order`          | Integer       | Yes      | Display order in the list.                               |
| `sync_status`         | Enum          | Yes      | SYNCED, PENDING_SYNC.                                    |

### 2.4 Photo

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `order_id`            | UUID (FK)     | Yes      | Reference to LocalOrder.                                 |
| `work_report_id`      | UUID (FK)     | No       | Reference to WorkReport (if attached to report).         |
| `local_file_path`     | String(500)   | Yes      | Path to the photo on local storage.                      |
| `remote_file_url`     | String(500)   | No       | URL after upload to server.                              |
| `thumbnail_path`      | String(500)   | No       | Path to locally generated thumbnail.                     |
| `category`            | Enum          | Yes      | BEFORE, AFTER, DAMAGE, INSTALLATION, GENERAL, NAMEPLATE. |
| `caption`             | String(300)   | No       | Text caption.                                            |
| `has_annotations`     | Boolean       | Yes      | Whether annotations were added.                          |
| `annotation_data`     | Text          | No       | Serialized annotation data (JSON).                       |
| `latitude`            | Decimal(9,6)  | No       | GPS latitude at capture.                                 |
| `longitude`           | Decimal(9,6)  | No       | GPS longitude at capture.                                |
| `captured_at`         | Timestamp     | Yes      | Photo capture timestamp.                                 |
| `file_size_bytes`     | Long          | Yes      | File size.                                               |
| `sync_status`         | Enum          | Yes      | SYNCED, PENDING_UPLOAD, UPLOAD_FAILED.                   |

### 2.5 TimeEntry

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `order_id`            | UUID (FK)     | Yes      | Reference to LocalOrder.                                 |
| `date`                | Date          | Yes      | Date of the time entry.                                  |
| `start_time`          | Timestamp     | Yes      | Start time.                                              |
| `end_time`            | Timestamp     | No       | End time (null if timer still running).                   |
| `break_duration_min`  | Integer       | Yes      | Break duration in minutes (default: 0).                  |
| `net_duration_min`    | Integer       | No       | Calculated net working minutes.                          |
| `activity_type`       | Enum          | Yes      | TRAVEL, ONSITE_WORK, ADMINISTRATIVE, OTHER.              |
| `note`                | String(500)   | No       | Optional note.                                           |
| `is_timer_active`     | Boolean       | Yes      | Whether the timer is currently running.                  |
| `release_status`      | Enum          | Yes      | PENDING, RELEASED, LOCKED.                               |
| `sync_status`         | Enum          | Yes      | SYNCED, PENDING_SYNC.                                    |
| `created_at`          | Timestamp     | Yes      | Local creation timestamp.                                |
| `updated_at`          | Timestamp     | Yes      | Local update timestamp.                                  |

### 2.6 ChatMessage

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `project_id`          | UUID          | Yes      | Project context.                                         |
| `order_id`            | UUID          | No       | Optional order context.                                  |
| `sender_id`           | UUID          | Yes      | User who sent the message.                               |
| `sender_name`         | String(200)   | Yes      | Display name (denormalized).                             |
| `message_type`        | Enum          | Yes      | TEXT, PHOTO, DOCUMENT.                                   |
| `content`             | Text          | Yes      | Message text or file reference.                          |
| `attachment_url`      | String(500)   | No       | URL of attached file (if any).                           |
| `attachment_local_path`| String(500)  | No       | Local path of attachment (before upload).                |
| `mentions`            | Text          | No       | JSON array of mentioned user IDs.                        |
| `sent_at`             | Timestamp     | Yes      | Send timestamp.                                          |
| `is_read`             | Boolean       | Yes      | Whether the current user has read this message.          |
| `sync_status`         | Enum          | Yes      | SYNCED, PENDING_SEND.                                    |

### 2.7 SyncQueueItem

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `entity_type`         | Enum          | Yes      | WORK_REPORT, TIME_ENTRY, PHOTO, CHAT_MESSAGE, DOCUMENT, MATERIAL_ITEM, SMALL_ORDER. |
| `entity_id`           | UUID          | Yes      | Reference to the local entity.                           |
| `operation`           | Enum          | Yes      | CREATE, UPDATE, DELETE.                                  |
| `payload`             | Text          | Yes      | Serialized JSON of the entity data.                      |
| `status`              | Enum          | Yes      | QUEUED, IN_PROGRESS, COMPLETED, FAILED.                  |
| `retry_count`         | Integer       | Yes      | Number of sync attempts (default: 0).                    |
| `max_retries`         | Integer       | Yes      | Maximum retry attempts (default: 5).                     |
| `error_message`       | Text          | No       | Last error message (if FAILED).                          |
| `created_at`          | Timestamp     | Yes      | When the item was queued.                                |
| `last_attempted_at`   | Timestamp     | No       | Last sync attempt timestamp.                             |
| `completed_at`        | Timestamp     | No       | When sync completed.                                     |
| `priority`            | Integer       | Yes      | Sync priority (lower = higher priority).                 |

### 2.8 CatalogItem (local cache)

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | String(50)    | Yes      | Catalog item number (primary key).                       |
| `catalog_source`      | Enum          | Yes      | IGH, INTERNAL.                                           |
| `description`         | String(300)   | Yes      | Item description.                                        |
| `category`            | String(100)   | No       | Item category.                                           |
| `unit`                | String(20)    | Yes      | Default unit of measure.                                 |
| `is_favorite`         | Boolean       | Yes      | User-marked favorite (default: false).                   |
| `last_used_at`        | Timestamp     | No       | Last time this item was used by the technician.          |
| `synced_at`           | Timestamp     | Yes      | Last catalog sync timestamp.                             |

### 2.9 Notification (local)

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `notification_type`   | Enum          | Yes      | NEW_ASSIGNMENT, ORDER_CHANGED, CHAT_MESSAGE, REMINDER, ESCALATION. |
| `title`               | String(200)   | Yes      | Notification title.                                      |
| `body`                | String(500)   | Yes      | Notification body text.                                  |
| `deep_link`           | String(300)   | No       | In-app navigation target.                                |
| `is_read`             | Boolean       | Yes      | Whether the user has read/dismissed it.                  |
| `received_at`         | Timestamp     | Yes      | When the notification was received.                      |
| `related_entity_type` | String(50)    | No       | Type of related entity (order, chat, etc.).              |
| `related_entity_id`   | UUID          | No       | ID of related entity.                                    |

---

## 3. REST API Endpoints (Mobile BFF)

Base path: `/api/v1/mobile`

All mobile endpoints require authentication via JWT bearer token. The authenticated user's employee ID is extracted from the token.

### 3.1 Orders & Assignments

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| GET    | `/api/v1/mobile/orders`                          | Get assigned orders for the technician.  | `mobile:read`    |
| GET    | `/api/v1/mobile/orders/{id}`                     | Get full order details.                  | `mobile:read`    |
| GET    | `/api/v1/mobile/orders/{id}/history`             | Get previous orders/reports for site.    | `mobile:read`    |
| PUT    | `/api/v1/mobile/orders/{id}/status`              | Update order status (start/complete).    | `mobile:write`   |

**GET `/api/v1/mobile/orders` Query Parameters:**

| Parameter    | Type      | Description                                         |
|--------------|-----------|-----------------------------------------------------|
| `date_from`  | Date      | Start date filter (default: today).                 |
| `date_to`    | Date      | End date filter (default: today + 7 days).          |
| `status`     | String    | Filter by status.                                   |
| `type`       | String    | Filter by order type.                               |
| `since`      | Timestamp | Incremental sync: return records modified after this.|

**Response (200 OK):**

```json
{
  "orders": [
    {
      "id": "uuid",
      "order_number": "ORD-2026-01234",
      "order_type": "SERVICE_CALL",
      "title": "Heizungswartung",
      "status": "PLANNED",
      "priority": "NORMAL",
      "scheduled_start": "2026-04-07T08:00:00",
      "scheduled_end": "2026-04-07T12:00:00",
      "customer_name": "Muster AG",
      "site_address": "Bahnhofstrasse 10, 8001 Zuerich",
      "has_work_report": false,
      "report_status": null
    }
  ],
  "sync_timestamp": "2026-03-29T16:00:00Z"
}
```

### 3.2 Work Reports

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| POST   | `/api/v1/mobile/orders/{id}/reports`             | Create a work report.                    | `mobile:write`   |
| PUT    | `/api/v1/mobile/reports/{reportId}`              | Update a work report.                    | `mobile:write`   |
| GET    | `/api/v1/mobile/reports/{reportId}`              | Get a work report.                       | `mobile:read`    |
| POST   | `/api/v1/mobile/reports/{reportId}/submit`       | Submit a completed report.               | `mobile:write`   |

**POST `/api/v1/mobile/orders/{id}/reports` Request Body:**

```json
{
  "id": "uuid-generated-locally",
  "report_date": "2026-04-07",
  "arrival_time": "2026-04-07T08:15:00",
  "departure_time": "2026-04-07T11:45:00",
  "work_performed": "Jahreswartung Heizungsanlage durchgefuehrt. Filter gewechselt, Brenner gereinigt.",
  "findings": "Dichtung am Ausdehnungsgefaess zeigt Verschleiss. Empfehle Austausch bei naechster Wartung.",
  "next_steps": "Dichtung bestellen und Folgetermin vereinbaren.",
  "follow_up_needed": true,
  "technician_notes": "Kunde war sehr zufrieden. Zugang ueber Hintereingang.",
  "customer_signature": "base64-encoded-png",
  "customer_signer_name": "Herr Muster",
  "material_items": [
    {
      "catalog_source": "INTERNAL",
      "catalog_item_id": "FLT-001",
      "description": "Heizungsfilter Standard",
      "quantity": 1,
      "unit": "piece"
    }
  ]
}
```

### 3.3 Materials & Catalog

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| GET    | `/api/v1/mobile/catalog/search`                  | Search catalog items.                    | `mobile:read`    |
| GET    | `/api/v1/mobile/catalog/sync`                    | Sync catalog data for offline use.       | `mobile:read`    |
| GET    | `/api/v1/mobile/catalog/favorites`               | Get user's favorite items.               | `mobile:read`    |
| POST   | `/api/v1/mobile/catalog/favorites/{itemId}`      | Add item to favorites.                   | `mobile:write`   |
| DELETE | `/api/v1/mobile/catalog/favorites/{itemId}`      | Remove item from favorites.              | `mobile:write`   |
| GET    | `/api/v1/mobile/catalog/recent`                  | Get recently used items.                 | `mobile:read`    |

**GET `/api/v1/mobile/catalog/search` Query Parameters:**

| Parameter    | Type     | Description                                         |
|--------------|----------|-----------------------------------------------------|
| `query`      | String   | Search text (item number, description, category).   |
| `source`     | Enum     | IGH, INTERNAL, ALL (default: ALL).                  |
| `category`   | String   | Filter by category.                                 |
| `limit`      | Integer  | Max results (default: 50).                          |

### 3.4 Photos

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| POST   | `/api/v1/mobile/orders/{id}/photos`              | Upload a photo.                          | `mobile:write`   |
| GET    | `/api/v1/mobile/orders/{id}/photos`              | List photos for an order.                | `mobile:read`    |
| DELETE | `/api/v1/mobile/photos/{photoId}`                | Delete a photo (before submission).      | `mobile:write`   |

**POST `.../photos` -- Multipart Form Data:**

| Field           | Type     | Description                                |
|-----------------|----------|--------------------------------------------|
| `file`          | Binary   | Photo file (JPEG/PNG).                     |
| `category`      | String   | Photo category enum value.                 |
| `caption`       | String   | Optional caption.                          |
| `annotation_data`| String  | JSON annotation data (if annotated).       |
| `latitude`      | Decimal  | GPS latitude.                              |
| `longitude`     | Decimal  | GPS longitude.                             |
| `captured_at`   | Timestamp| Capture timestamp.                         |
| `work_report_id`| UUID     | Optional work report reference.            |

### 3.5 Time Entries

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| POST   | `/api/v1/mobile/orders/{id}/time-entries`        | Create a time entry.                     | `mobile:write`   |
| PUT    | `/api/v1/mobile/time-entries/{entryId}`          | Update a time entry.                     | `mobile:write`   |
| DELETE | `/api/v1/mobile/time-entries/{entryId}`          | Delete a time entry (if not released).   | `mobile:write`   |
| GET    | `/api/v1/mobile/time-entries`                    | Get all time entries for date range.     | `mobile:read`    |
| POST   | `/api/v1/mobile/time-entries/{entryId}/release`  | Attempt to release a time entry.         | `mobile:write`   |

**POST `.../time-entries/release` Response (locked):**

```json
{
  "released": false,
  "reason": "WORK_REPORT_NOT_SUBMITTED",
  "message": "Time entries cannot be released until the work report for order ORD-2026-01234 is submitted.",
  "order_id": "uuid",
  "report_status": null
}
```

### 3.6 Chat

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| GET    | `/api/v1/mobile/projects/{id}/chat`              | Get chat messages for a project.         | `mobile:read`    |
| POST   | `/api/v1/mobile/projects/{id}/chat`              | Send a chat message.                     | `mobile:write`   |
| PUT    | `/api/v1/mobile/chat/{messageId}/read`           | Mark a message as read.                  | `mobile:write`   |

**WebSocket endpoint**: `wss://api.example.com/ws/chat/{projectId}` -- For real-time message delivery.

**Chat Message Payload:**

```json
{
  "id": "uuid",
  "sender_id": "uuid-technician",
  "sender_name": "Hans Mueller",
  "message_type": "TEXT",
  "content": "Zugang zur Heizung ist blockiert. Brauche Schluessel vom Hausmeister.",
  "mentions": ["uuid-project-manager"],
  "sent_at": "2026-04-07T09:30:00Z"
}
```

### 3.7 Documents

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| GET    | `/api/v1/mobile/orders/{id}/documents`           | List documents for an order.             | `mobile:read`    |
| GET    | `/api/v1/mobile/documents/{docId}/download`      | Download a document.                     | `mobile:read`    |
| POST   | `/api/v1/mobile/orders/{id}/documents`           | Upload a document.                       | `mobile:write`   |

### 3.8 Installations

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| GET    | `/api/v1/mobile/sites/{siteId}/installations`    | Get installations at a site.             | `mobile:read`    |
| GET    | `/api/v1/mobile/installations/{id}`              | Get installation details.                | `mobile:read`    |
| GET    | `/api/v1/mobile/installations/{id}/history`      | Get service history for installation.    | `mobile:read`    |

### 3.9 Small Orders

| Method | Endpoint                                         | Description                              | Auth                         |
|--------|--------------------------------------------------|------------------------------------------|------------------------------|
| POST   | `/api/v1/mobile/projects/{id}/small-orders`      | Create a small order within a project.   | `mobile:small-order:create`  |
| PUT    | `/api/v1/mobile/small-orders/{id}`               | Update a small order.                    | `mobile:small-order:create`  |
| DELETE | `/api/v1/mobile/small-orders/{id}`               | Cancel a small order.                    | `mobile:small-order:create`  |

### 3.10 Quotations (No Prices)

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| GET    | `/api/v1/mobile/orders/{id}/quotation`           | Get quotation details (prices stripped). | `mobile:read`    |

**Response (200 OK):**

```json
{
  "quotation_number": "QUO-2026-00567",
  "quotation_date": "2026-03-15",
  "scope_description": "Komplettsanierung Heizungsanlage",
  "line_items": [
    {
      "description": "Waermepumpe Viessmann Vitocal 250-A",
      "quantity": 1,
      "unit": "piece"
    },
    {
      "description": "Installation und Inbetriebnahme",
      "quantity": 1,
      "unit": "service"
    }
  ]
}
```

Note: `unit_price`, `total`, `discount`, and `tax` fields are excluded from the response for standard technician roles.

### 3.11 Sync

| Method | Endpoint                                     | Description                              | Auth             |
|--------|----------------------------------------------|------------------------------------------|------------------|
| POST   | `/api/v1/mobile/sync`                        | Full bidirectional sync.                 | `mobile:write`   |
| GET    | `/api/v1/mobile/sync/status`                 | Get sync status and pending count.       | `mobile:read`    |

**POST `/api/v1/mobile/sync` Request Body:**

```json
{
  "last_sync_timestamp": "2026-04-07T08:00:00Z",
  "outbound": {
    "work_reports": [ ... ],
    "time_entries": [ ... ],
    "photos": [ ... ],
    "chat_messages": [ ... ],
    "material_items": [ ... ]
  },
  "device_info": {
    "platform": "android",
    "app_version": "2.1.0",
    "os_version": "Android 14",
    "device_id": "uuid-device"
  }
}
```

**Response:**

```json
{
  "sync_timestamp": "2026-04-07T16:30:00Z",
  "inbound": {
    "orders": [ ... ],
    "documents": [ ... ],
    "catalog_updates": [ ... ],
    "chat_messages": [ ... ],
    "notifications": [ ... ]
  },
  "outbound_results": {
    "work_reports": [
      { "local_id": "uuid", "server_id": "uuid", "status": "SUCCESS" }
    ],
    "time_entries": [ ... ],
    "photos": [ ... ],
    "conflicts": [
      {
        "entity_type": "TIME_ENTRY",
        "entity_id": "uuid",
        "resolution": "SERVER_WINS",
        "server_version": { ... },
        "local_version_archived": true
      }
    ]
  }
}
```

### 3.12 Notifications & Reminders

| Method | Endpoint                                         | Description                              | Auth             |
|--------|--------------------------------------------------|------------------------------------------|------------------|
| GET    | `/api/v1/mobile/notifications`                   | Get notification history.                | `mobile:read`    |
| PUT    | `/api/v1/mobile/notifications/{id}/read`         | Mark notification as read.               | `mobile:write`   |
| PUT    | `/api/v1/mobile/notifications/preferences`       | Update notification preferences.         | `mobile:write`   |
| GET    | `/api/v1/mobile/notifications/preferences`       | Get notification preferences.            | `mobile:read`    |

**PUT `.../notifications/preferences` Request Body:**

```json
{
  "new_assignment": true,
  "order_changed": true,
  "chat_message": true,
  "daily_reminder": true,
  "escalation": true,
  "quiet_hours_enabled": true,
  "quiet_hours_start": "20:00",
  "quiet_hours_end": "07:00"
}
```

---

## 4. Event Flows

### 4.1 Published Events (from Mobile via sync)

| Event Name                              | Trigger                                            | Payload                                                       |
|-----------------------------------------|----------------------------------------------------|---------------------------------------------------------------|
| `mobile.report.created`                 | Work report synced from mobile.                    | `{ reportId, orderId, employeeId, status }`                   |
| `mobile.report.submitted`              | Work report submitted.                             | `{ reportId, orderId, employeeId }`                           |
| `mobile.time-entry.created`            | Time entry synced from mobile.                     | `{ timeEntryId, orderId, employeeId, duration }`              |
| `mobile.time-entry.released`           | Time entry released (report lock cleared).         | `{ timeEntryId, orderId, employeeId }`                        |
| `mobile.photo.uploaded`                | Photo uploaded from mobile.                        | `{ photoId, orderId, projectId, category }`                   |
| `mobile.document.uploaded`             | Document uploaded from mobile.                     | `{ documentId, orderId, projectId, fileName }`                |
| `mobile.chat.message.sent`            | Chat message sent from mobile.                     | `{ messageId, projectId, senderId, messageType }`             |
| `mobile.small-order.created`           | Small order created from mobile.                   | `{ orderId, projectId, assignedTo, createdBy }`               |
| `mobile.order.status.updated`         | Order status changed by technician.                | `{ orderId, newStatus, employeeId }`                          |

### 4.2 Subscribed Events (consumed by Mobile BFF / push service)

| Event Name                            | Source Module     | Action                                                      |
|---------------------------------------|-------------------|--------------------------------------------------------------|
| `schedule.assignment.created`         | MOD-05            | Push notification to technician; add to sync queue.          |
| `schedule.assignment.updated`         | MOD-05            | Push notification; update local data on next sync.           |
| `schedule.assignment.cancelled`       | MOD-05            | Push cancellation notification; mark order cancelled locally.|
| `schedule.assignment.moved`           | MOD-05            | Push reschedule notification; update local data.             |
| `project.document.uploaded`           | MOD-04            | Make available for next document sync.                       |
| `chat.message.received`              | Chat Service      | Real-time delivery via WebSocket; push notification.         |
| `report.approved`                    | Back Office       | Update report status locally on next sync.                   |
| `report.rejected`                    | Back Office       | Push notification; update report status locally.             |

---

## 5. Offline Sync Engine Design

### 5.1 Sync Strategy

| Aspect              | Approach                                                                    |
|---------------------|-----------------------------------------------------------------------------|
| Architecture        | Offline-first with queue-based sync.                                        |
| Local Storage       | SQLite database encrypted at rest (SQLCipher or platform encryption).       |
| Sync Direction      | Bidirectional: push local changes, pull server changes.                     |
| Sync Trigger        | On connectivity restored (automatic), on app foreground, manual pull-to-refresh. |
| Conflict Resolution | Last-write-wins based on `updated_at` timestamp. Overwritten data archived server-side. |
| Queue Priority      | Work report submissions > time entries > photos > chat messages > others.   |
| Retry Policy        | Exponential backoff: 5s, 15s, 45s, 2min, 5min. Max 5 retries per item.    |
| Photo Upload        | Photos are uploaded individually via multipart POST. Large photos are compressed client-side (max 2048px longest edge, 85% JPEG quality). |
| Catalog Sync        | Full catalog sync on first login. Incremental updates daily.               |
| Data Expiry         | Local order data older than 30 days is purged automatically.               |

### 5.2 Sync Flow Diagram

```
[App Starts / Connectivity Restored]
           |
           v
[Check Sync Queue for pending items]
           |
           v
[Process outbound queue (FIFO by priority)]
  - POST/PUT each item to server
  - On success: mark COMPLETED, update server ID
  - On failure: increment retry_count, schedule retry
           |
           v
[Pull inbound changes (GET /sync?since=last_sync)]
  - Receive new/updated orders, documents, catalog, chat
  - Apply to local database
  - Resolve conflicts (last-write-wins)
           |
           v
[Update last_sync_timestamp]
           |
           v
[Display sync complete indicator]
```

---

## 6. Push Notification Configuration

### 6.1 Notification Types & Templates

| Type               | Title Template           | Body Template                                               | Priority | Deep Link               |
|--------------------|--------------------------|--------------------------------------------------------------|----------|--------------------------|
| NEW_ASSIGNMENT     | "Neuer Auftrag"          | "{orderType} bei {customerName}, {date} {time}"             | HIGH     | `/orders/{orderId}`      |
| ORDER_CHANGED      | "Auftrag geaendert"      | "{orderNumber}: {changeDescription}"                         | NORMAL   | `/orders/{orderId}`      |
| ORDER_CANCELLED    | "Auftrag storniert"      | "{orderNumber} bei {customerName} wurde storniert"           | HIGH     | `/orders/{orderId}`      |
| CHAT_MESSAGE       | "{senderName}"           | "{messagePreview}"                                           | NORMAL   | `/chat/{projectId}`      |
| DAILY_REMINDER     | "Offene Berichte"        | "Sie haben {count} unvollstaendige Berichte. Bitte ausfuellen." | NORMAL | `/orders?filter=incomplete` |
| ESCALATION         | "Ueberfaellige Berichte" | "Berichte seit {date} nicht eingereicht"                     | HIGH     | `/orders?filter=overdue` |

### 6.2 Daily Reminder Logic

```
CRON: daily at configurable time (default 17:00 local time)

FOR EACH active technician:
  incomplete_reports = count orders WHERE:
    - assigned_to = technician
    - scheduled_date <= today
    - status IN (PLANNED, IN_PROGRESS)
    - (work_report IS NULL OR work_report.status = DRAFT)

  IF incomplete_reports > 0:
    SEND push notification (DAILY_REMINDER)

  IF any order.scheduled_date < today - 1 day AND report incomplete:
    SEND push notification (ESCALATION) to technician
    SEND push notification (ESCALATION) to team_lead (if configured)
```

---

## 7. Integration Points

### 7.1 Backend Modules

| Module          | Integration                                                                |
|-----------------|----------------------------------------------------------------------------|
| MOD-04          | Project details, documents, schedules read via BFF. Mobile uploads go to project repo. |
| MOD-05          | Assignments are the source of orders. Status updates flow back.           |
| MOD-02 (CRM)   | Customer, site, installation data served via BFF.                         |
| MOD-07 / IGH    | Material catalogs synced for offline search.                              |
| MOD-08          | Quotation data (prices stripped for technicians). Work reports feed invoicing. |
| MOD-10          | Time entries sync to central time management.                             |

### 7.2 Platform Services

| Service              | Integration                                                              |
|----------------------|--------------------------------------------------------------------------|
| Auth Service         | JWT-based authentication. Token refresh supported offline (cached token). |
| Push (APNS/FCM)      | Device token registration. Notification delivery.                        |
| File Storage         | Photo and document upload/download.                                      |
| WebSocket Service    | Real-time chat message delivery.                                         |

---

## 8. Security

### 8.1 Permissions

| Permission                    | Description                                          |
|-------------------------------|------------------------------------------------------|
| `mobile:read`                 | View assigned orders, documents, installations.      |
| `mobile:write`                | Create/edit reports, time entries, photos.            |
| `mobile:small-order:create`   | Create small orders within projects.                 |
| `quotation:view-prices`       | View quotation pricing (exception role).             |
| `time:release:override`       | Override time report lock (back-office only).        |

### 8.2 Data Security

| Concern                | Approach                                                               |
|------------------------|------------------------------------------------------------------------|
| Data at Rest           | SQLite encrypted via SQLCipher or OS-level encryption.                 |
| Data in Transit        | TLS 1.3 for all API calls. Certificate pinning recommended.           |
| Authentication         | JWT with 15-minute access token, 7-day refresh token.                 |
| Session Timeout        | Auto-logout after 24 hours of inactivity.                             |
| Remote Wipe            | Server can flag a device for data wipe on next sync.                  |
| Screenshot Prevention  | Sensitive screens disable screenshots (OS API).                       |

---

## 9. Non-Functional Considerations

| Concern            | Approach                                                                     |
|--------------------|------------------------------------------------------------------------------|
| Performance        | Order list renders < 500ms. Photo capture to save < 2s. Sync < 30s for typical daily payload. |
| Battery             | Background sync uses WorkManager (Android) / BGTaskScheduler (iOS) for efficiency. |
| Storage             | Typical offline data footprint: 50-200 MB. Photos compressed client-side.    |
| Accessibility       | WCAG 2.1 AA compliance. High-contrast mode. Minimum touch target 44x44pt.   |
| Localization        | German (de-CH) as primary language. English (en) as secondary.               |
| App Updates          | Forced update mechanism for breaking API changes. Grace period for minor updates. |
| Crash Reporting      | Integration with Crashlytics or Sentry for production crash monitoring.      |
| Analytics            | Anonymous usage analytics for feature adoption tracking.                     |
