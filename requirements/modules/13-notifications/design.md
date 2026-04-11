# Module 13: Notifications - Technical Design

## 1. Architecture Overview

The Notification Service follows a **channel-agnostic dispatch architecture** built on an internal message queue. All modules interact with notifications through a single API or event interface. The service resolves channels, applies preferences, renders templates, and dispatches through channel-specific adapters.

```
+-------------------+     +-------------------+     +--------------------+
|  Triggering       |     |  Notification     |     |  Channel Adapters  |
|  Modules          |---->|  Service Core     |---->|                    |
|  (Events / API)   |     |                   |     |  - FCM (Push)      |
+-------------------+     |  - Channel Router |     |  - SMTP (Email)    |
                          |  - Preference Mgr |     |  - WhatsApp API    |
                          |  - Template Engine|     |  - In-App (WS)     |
                          |  - Scheduler      |     |  - SMS Gateway     |
                          |  - Delivery Track |     +--------------------+
                          +-------------------+
                                   |
                          +-------------------+
                          |  Message Queue    |
                          |  (Redis / Bull)   |
                          +-------------------+
                                   |
                          +-------------------+
                          |  Notification DB  |
                          |  (PostgreSQL)     |
                          +-------------------+
```

### Design Principles

1. **Asynchronous by Default:** All notification dispatches are enqueued and processed asynchronously. The calling module receives an immediate acknowledgment.
2. **At-Least-Once Delivery:** The message queue guarantees at-least-once processing. Idempotency keys prevent duplicate delivery.
3. **Channel Independence:** Each channel adapter is independent. A failure in one channel does not block others.
4. **Fail-Open for Non-Critical:** Non-critical notification failures are logged but do not raise system alarms. Critical notification failures trigger ops alerts.

---

## 2. Data Models

### 2.1 Notification

```
Table: notifications
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Unique notification identifier       |
| type                | VARCHAR(100)               | Notification type key                |
|                     |                            | (e.g., task_assigned,                |
|                     |                            | appointment_reminder)                |
| category            | VARCHAR(50)                | Category for grouping                |
|                     |                            | (tasks, orders, chat, system, etc.)  |
| priority            | VARCHAR(20)                | critical, high, normal, low          |
| source_module       | VARCHAR(50)                | Originating module identifier        |
| source_event        | VARCHAR(100)               | Triggering event type                |
| source_entity_type  | VARCHAR(50)                | Entity type (task, order, etc.)      |
| source_entity_id    | UUID                       | Entity ID for deep-linking           |
| payload             | JSONB                      | Template variable data               |
| idempotency_key     | VARCHAR(255) UNIQUE        | Prevents duplicate processing        |
| created_at          | TIMESTAMP WITH TZ          | Creation timestamp                   |
| created_by          | UUID (FK -> users)         | User or system that triggered        |
| tenant_id           | UUID (FK -> tenants)       | Multi-tenancy support                |
+---------------------+----------------------------+--------------------------------------+
Indexes: (type, created_at), (source_entity_type, source_entity_id), (idempotency_key)
```

### 2.2 Notification Recipient

```
Table: notification_recipients
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Record identifier                    |
| notification_id     | UUID (FK -> notifications) | Parent notification                  |
| user_id             | UUID (FK -> users)         | Target user (nullable for external)  |
| recipient_type      | VARCHAR(20)                | user, customer, partner, external    |
| recipient_name      | VARCHAR(255)               | Display name                         |
| email               | VARCHAR(255)               | Email address (if applicable)        |
| phone               | VARCHAR(50)                | Phone/WhatsApp number                |
| language            | VARCHAR(5)                 | Preferred language (de, fr, it, en)  |
| created_at          | TIMESTAMP WITH TZ          | Record creation                      |
+---------------------+----------------------------+--------------------------------------+
Indexes: (notification_id), (user_id, created_at)
```

### 2.3 Notification Delivery

```
Table: notification_deliveries
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Delivery record identifier           |
| notification_id     | UUID (FK -> notifications) | Parent notification                  |
| recipient_id        | UUID (FK -> notif_recip.)  | Target recipient                     |
| channel             | VARCHAR(20)                | push, email, whatsapp, in_app, sms   |
| status              | VARCHAR(20)                | pending, queued, sent, delivered,     |
|                     |                            | read, failed, bounced, cancelled     |
| provider_message_id | VARCHAR(255)               | External provider message ID         |
| template_id         | UUID (FK -> notif_templ.)  | Template used for rendering          |
| template_version    | INTEGER                    | Template version at render time      |
| rendered_subject    | VARCHAR(500)               | Rendered subject/title               |
| rendered_body       | TEXT                       | Rendered body (stored for audit)     |
| error_code          | VARCHAR(50)                | Error code on failure                |
| error_message       | TEXT                       | Error detail on failure              |
| retry_count         | INTEGER DEFAULT 0          | Number of retry attempts             |
| max_retries         | INTEGER DEFAULT 3          | Maximum retry attempts               |
| next_retry_at       | TIMESTAMP WITH TZ          | Next retry scheduled time            |
| sent_at             | TIMESTAMP WITH TZ          | Timestamp of dispatch to provider    |
| delivered_at        | TIMESTAMP WITH TZ          | Timestamp of confirmed delivery      |
| read_at             | TIMESTAMP WITH TZ          | Timestamp of read confirmation       |
| failed_at           | TIMESTAMP WITH TZ          | Timestamp of final failure           |
| created_at          | TIMESTAMP WITH TZ          | Record creation                      |
| updated_at          | TIMESTAMP WITH TZ          | Last status update                   |
+---------------------+----------------------------+--------------------------------------+
Indexes: (notification_id), (recipient_id, channel), (status, next_retry_at),
         (channel, status, created_at), (provider_message_id)
```

### 2.4 Notification Template

```
Table: notification_templates
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Template identifier                  |
| type                | VARCHAR(100)               | Notification type key                |
| channel             | VARCHAR(20)                | Target channel                       |
| language            | VARCHAR(5)                 | Language code (de, fr, it, en)       |
| version             | INTEGER                    | Template version (auto-incremented)  |
| is_active           | BOOLEAN DEFAULT true       | Whether this version is active       |
| subject_template    | VARCHAR(500)               | Subject/title with placeholders      |
| body_template       | TEXT                       | Body content with placeholders       |
| body_html_template  | TEXT                       | HTML body (email only)               |
| whatsapp_template_id| VARCHAR(100)               | WhatsApp Business template ID        |
| variables           | JSONB                      | List of expected variable names      |
|                     |                            | with descriptions and defaults       |
| metadata            | JSONB                      | Channel-specific metadata            |
| created_at          | TIMESTAMP WITH TZ          | Creation timestamp                   |
| updated_at          | TIMESTAMP WITH TZ          | Last update timestamp                |
| created_by          | UUID (FK -> users)         | Author                               |
+---------------------+----------------------------+--------------------------------------+
Indexes: (type, channel, language, is_active), (type, channel, language, version)
Unique: (type, channel, language, version)
```

### 2.5 User Notification Preferences

```
Table: user_notification_preferences
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Record identifier                    |
| user_id             | UUID (FK -> users)         | User                                 |
| notification_type   | VARCHAR(100)               | Notification type or '*' for all     |
| channel             | VARCHAR(20)                | Channel                              |
| enabled             | BOOLEAN DEFAULT true       | Whether this channel is enabled      |
| created_at          | TIMESTAMP WITH TZ          | Record creation                      |
| updated_at          | TIMESTAMP WITH TZ          | Last update                          |
+---------------------+----------------------------+--------------------------------------+
Unique: (user_id, notification_type, channel)
```

```
Table: user_quiet_hours
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Record identifier                    |
| user_id             | UUID (FK -> users) UNIQUE  | User                                 |
| enabled             | BOOLEAN DEFAULT false      | Whether quiet hours are active       |
| start_time          | TIME                       | Start of quiet period (e.g., 20:00)  |
| end_time            | TIME                       | End of quiet period (e.g., 07:00)    |
| timezone            | VARCHAR(50)                | User's timezone                      |
| bypass_critical     | BOOLEAN DEFAULT true       | Allow critical notifs during quiet   |
| created_at          | TIMESTAMP WITH TZ          | Record creation                      |
| updated_at          | TIMESTAMP WITH TZ          | Last update                          |
+---------------------+----------------------------+--------------------------------------+
```

### 2.6 Device Token Registry

```
Table: device_tokens
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Record identifier                    |
| user_id             | UUID (FK -> users)         | Device owner                         |
| token               | VARCHAR(500)               | FCM device token                     |
| platform            | VARCHAR(10)                | android, ios                         |
| device_id           | VARCHAR(255)               | Unique device identifier             |
| app_version         | VARCHAR(20)                | App version at registration          |
| is_active           | BOOLEAN DEFAULT true       | Whether token is still valid         |
| last_used_at        | TIMESTAMP WITH TZ          | Last successful push to this token   |
| registered_at       | TIMESTAMP WITH TZ          | Token registration timestamp         |
| deactivated_at      | TIMESTAMP WITH TZ          | Token deactivation timestamp         |
+---------------------+----------------------------+--------------------------------------+
Indexes: (user_id, is_active), (token)
Unique: (token)
```

### 2.7 Scheduled Notification

```
Table: scheduled_notifications
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Schedule identifier                  |
| notification_type   | VARCHAR(100)               | Notification type to dispatch        |
| schedule_type       | VARCHAR(20)                | one_time, recurring                  |
| scheduled_at        | TIMESTAMP WITH TZ          | One-time dispatch datetime           |
| cron_expression     | VARCHAR(100)               | Cron expression for recurring        |
| timezone            | VARCHAR(50) DEFAULT        | Timezone for scheduling              |
|                     | 'Europe/Zurich'            |                                      |
| end_date            | TIMESTAMP WITH TZ          | Optional end date for recurring      |
| recipient_query     | JSONB                      | Dynamic recipient resolution query   |
| payload             | JSONB                      | Template variable data               |
| status              | VARCHAR(20)                | active, paused, completed, cancelled |
| last_dispatched_at  | TIMESTAMP WITH TZ          | Last successful dispatch             |
| next_dispatch_at    | TIMESTAMP WITH TZ          | Pre-calculated next dispatch time    |
| source_module       | VARCHAR(50)                | Originating module                   |
| source_entity_type  | VARCHAR(50)                | Entity type                          |
| source_entity_id    | UUID                       | Entity ID                            |
| created_at          | TIMESTAMP WITH TZ          | Record creation                      |
| updated_at          | TIMESTAMP WITH TZ          | Last update                          |
| created_by          | UUID (FK -> users)         | Creator                              |
+---------------------+----------------------------+--------------------------------------+
Indexes: (status, next_dispatch_at), (source_entity_type, source_entity_id)
```

---

## 3. REST API Endpoints

### 3.1 Notification Dispatch

```
POST /api/v1/notifications
```
Create and dispatch a notification. The notification is enqueued for asynchronous processing.

**Request Body:**
```json
{
  "type": "appointment_reminder",
  "priority": "high",
  "source": {
    "module": "orders",
    "event": "appointment.reminder_due",
    "entity_type": "appointment",
    "entity_id": "uuid"
  },
  "recipients": [
    {
      "type": "customer",
      "user_id": null,
      "email": "kunde@example.ch",
      "phone": "+41791234567",
      "name": "Hans Muster",
      "language": "de"
    }
  ],
  "channels": ["email", "whatsapp"],
  "payload": {
    "customer_name": "Hans Muster",
    "appointment_date": "2026-04-15",
    "appointment_time": "09:00",
    "technician_name": "Peter Meier",
    "address": "Bahnhofstrasse 1, 8001 Zurich"
  },
  "idempotency_key": "appt-reminder-uuid-20260414",
  "schedule": null
}
```

**Response (202 Accepted):**
```json
{
  "id": "uuid",
  "status": "queued",
  "recipients_count": 1,
  "channels": ["email", "whatsapp"],
  "created_at": "2026-04-14T08:00:00Z"
}
```

### 3.2 Notification Status

```
GET /api/v1/notifications/{id}
```

**Response (200):**
```json
{
  "id": "uuid",
  "type": "appointment_reminder",
  "status": "delivered",
  "created_at": "2026-04-14T08:00:00Z",
  "deliveries": [
    {
      "channel": "email",
      "status": "delivered",
      "sent_at": "2026-04-14T08:00:05Z",
      "delivered_at": "2026-04-14T08:00:12Z"
    },
    {
      "channel": "whatsapp",
      "status": "read",
      "sent_at": "2026-04-14T08:00:03Z",
      "delivered_at": "2026-04-14T08:00:04Z",
      "read_at": "2026-04-14T08:02:30Z"
    }
  ]
}
```

### 3.3 Notification History

```
GET /api/v1/notifications?recipient_id={userId}&type={type}&channel={channel}&status={status}&from={date}&to={date}&page={n}&per_page={n}
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "task_assigned",
      "category": "tasks",
      "recipient": { "name": "Peter Meier", "email": "p***@mb-boiler.ch" },
      "channels": ["push", "in_app"],
      "aggregate_status": "delivered",
      "created_at": "2026-04-14T08:00:00Z"
    }
  ],
  "pagination": { "page": 1, "per_page": 25, "total": 142 }
}
```

### 3.4 In-App Notifications (User Feed)

```
GET /api/v1/users/me/notifications?status={read|unread|all}&category={category}&page={n}&per_page={n}
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "task_assigned",
      "category": "tasks",
      "title": "Neue Aufgabe zugewiesen",
      "body": "Heizungswartung bei Muster AG wurde Ihnen zugewiesen.",
      "is_read": false,
      "deep_link": "/tasks/uuid",
      "created_at": "2026-04-14T08:00:00Z"
    }
  ],
  "unread_count": 5,
  "pagination": { "page": 1, "per_page": 50, "total": 87 }
}
```

```
PATCH /api/v1/users/me/notifications/{id}/read
```
Mark a single notification as read.

```
POST /api/v1/users/me/notifications/mark-all-read
```
Mark all notifications as read.

```
DELETE /api/v1/users/me/notifications/{id}
```
Dismiss a notification from the feed.

### 3.5 Notification Preferences

```
GET /api/v1/users/me/notification-preferences
```

**Response (200):**
```json
{
  "preferences": [
    { "notification_type": "task_assigned", "channel": "push", "enabled": true },
    { "notification_type": "task_assigned", "channel": "email", "enabled": false },
    { "notification_type": "appointment_reminder", "channel": "whatsapp", "enabled": true },
    { "notification_type": "appointment_reminder", "channel": "email", "enabled": true }
  ],
  "quiet_hours": {
    "enabled": true,
    "start_time": "20:00",
    "end_time": "07:00",
    "timezone": "Europe/Zurich",
    "bypass_critical": true
  }
}
```

```
PUT /api/v1/users/me/notification-preferences
```
Update preferences (full replacement of the preferences array and quiet hours).

### 3.6 Notification Templates (Admin)

```
GET    /api/v1/admin/notification-templates?type={type}&channel={channel}&language={lang}
GET    /api/v1/admin/notification-templates/{id}
POST   /api/v1/admin/notification-templates
PUT    /api/v1/admin/notification-templates/{id}
DELETE /api/v1/admin/notification-templates/{id}
```

```
POST /api/v1/admin/notification-templates/{id}/preview
```
**Request Body:**
```json
{
  "sample_data": {
    "customer_name": "Hans Muster",
    "appointment_date": "15. April 2026",
    "technician_name": "Peter Meier"
  }
}
```

**Response (200):**
```json
{
  "rendered_subject": "Terminerinnerung: 15. April 2026",
  "rendered_body": "Sehr geehrter Herr Muster, ...",
  "rendered_html": "<html>..."
}
```

### 3.7 Scheduled Notifications

```
POST   /api/v1/scheduled-notifications
GET    /api/v1/scheduled-notifications?status={active|paused|completed}&source_entity_id={id}
GET    /api/v1/scheduled-notifications/{id}
PUT    /api/v1/scheduled-notifications/{id}
DELETE /api/v1/scheduled-notifications/{id}
POST   /api/v1/scheduled-notifications/{id}/cancel
POST   /api/v1/scheduled-notifications/{id}/pause
POST   /api/v1/scheduled-notifications/{id}/resume
```

### 3.8 Device Token Management

```
POST   /api/v1/users/me/devices
```
Register or refresh a device token.

**Request Body:**
```json
{
  "token": "fcm-token-string",
  "platform": "android",
  "device_id": "device-unique-id",
  "app_version": "1.2.0"
}
```

```
DELETE /api/v1/users/me/devices/{deviceId}
```
Unregister a device.

### 3.9 Delivery Webhooks (Internal)

```
POST /api/v1/webhooks/email-delivery
POST /api/v1/webhooks/whatsapp-delivery
```
Webhook endpoints for email service provider and WhatsApp Business API delivery callbacks. These are internal endpoints called by integration adapters (Module 14).

### 3.10 Delivery Metrics (Admin Dashboard)

```
GET /api/v1/admin/notification-metrics?period={24h|7d|30d}&channel={channel}
```

**Response (200):**
```json
{
  "period": "24h",
  "channels": {
    "push": { "sent": 320, "delivered": 315, "failed": 5, "avg_latency_ms": 1200 },
    "email": { "sent": 85, "delivered": 82, "bounced": 2, "opened": 45, "failed": 1, "avg_latency_ms": 8500 },
    "whatsapp": { "sent": 42, "delivered": 40, "read": 35, "failed": 2, "avg_latency_ms": 3200 },
    "in_app": { "sent": 410, "delivered": 410, "read": 280, "failed": 0, "avg_latency_ms": 800 }
  }
}
```

---

## 4. Event Flows

### 4.1 Events Consumed (from other modules)

The Notification Service subscribes to the following events on the platform event bus:

| Event | Source Module | Notification Type | Default Channels |
|---|---|---|---|
| `task.assigned` | 04 - Task Mgmt | task_assigned | push, in_app |
| `task.due_soon` | 11 - Project Mgmt | task_due_reminder | push, in_app |
| `order.status_changed` | 03 - Orders | order_status_changed | push, in_app, email |
| `order.appointment_confirmed` | 03 - Orders | appointment_confirmation | email, whatsapp |
| `quotation.sent` | 07 - Quotations | quotation_follow_up | scheduled (in_app, email) |
| `quotation.appointment_scheduled` | 07 - Quotations | appointment_reminder | scheduled (email, whatsapp) |
| `report.incomplete_eod` | 05 - Mobile | daily_report_reminder | push, in_app |
| `maintenance.due_soon` | 06 - Plants | maintenance_due | email, whatsapp |
| `invoice.overdue` | 10 - Finance | invoice_overdue_reminder | email, whatsapp |
| `chat.message_received` | 12 - Comms | chat_message | push, in_app |
| `document.generated` | 09 - Documents | document_ready | in_app, email |
| `user.device_registered` | 01 - Core | (internal) device_token_update | (internal) |
| `customer.gdpr_deletion` | 02 - CRM | (internal) purge_notification_history | (internal) |

### 4.2 Events Published (by Notification Service)

| Event | Description | Consumers |
|---|---|---|
| `notification.sent` | Notification successfully dispatched to provider | Audit, Metrics |
| `notification.delivered` | Delivery confirmed by provider | Audit, Metrics |
| `notification.failed` | Delivery failed after all retries | Audit, Alerting |
| `notification.bounced` | Email bounced | CRM (flag address) |
| `notification.unsubscribed` | User unsubscribed via email link | CRM (update prefs) |

### 4.3 Notification Processing Pipeline

```
Event Received / API Called
       |
       v
+-------------------+
| 1. Validate &     |
|    Deduplicate     |
|    (idempotency)   |
+-------------------+
       |
       v
+-------------------+
| 2. Resolve        |
|    Recipients      |
|    (user lookup)   |
+-------------------+
       |
       v
+-------------------+
| 3. Apply          |
|    Preferences &   |
|    Channel Routing |
+-------------------+
       |
       v
+-------------------+
| 4. Check Quiet    |
|    Hours & DND     |
+-------------------+
       |
       v (per channel)
+-------------------+
| 5. Render         |
|    Template        |
|    (per language)  |
+-------------------+
       |
       v
+-------------------+
| 6. Enqueue to     |
|    Channel Queue   |
+-------------------+
       |
       v
+-------------------+
| 7. Channel Worker |
|    Dispatches via  |
|    Adapter         |
+-------------------+
       |
       v
+-------------------+
| 8. Record         |
|    Delivery Status |
+-------------------+
```

---

## 5. Integration Points

### 5.1 Firebase Cloud Messaging (Push Notifications)

- **Protocol:** HTTPS (FCM HTTP v1 API)
- **Authentication:** Google Service Account (OAuth 2.0)
- **Payload Format:**
  ```json
  {
    "message": {
      "token": "device-fcm-token",
      "notification": {
        "title": "Neue Aufgabe",
        "body": "Heizungswartung bei Muster AG"
      },
      "data": {
        "notification_id": "uuid",
        "deep_link": "/tasks/uuid",
        "type": "task_assigned"
      },
      "android": {
        "priority": "high",
        "notification": { "click_action": "OPEN_TASK" }
      },
      "apns": {
        "payload": {
          "aps": { "badge": 5, "sound": "default" }
        }
      }
    }
  }
  ```
- **Error Handling:** Token invalidation on `UNREGISTERED` error. Retry on `UNAVAILABLE` and `INTERNAL` errors.
- **Batching:** Up to 500 messages per batch request.

### 5.2 SMTP / Email Service Provider

- **Primary Option:** Transactional email provider (e.g., Mailgun, SendGrid, Amazon SES)
- **Protocol:** HTTPS API (preferred) or SMTP relay
- **Features Required:**
  - Delivery webhooks (delivered, bounced, opened, clicked)
  - Bounce/complaint handling
  - Dedicated sending domain with DKIM/SPF/DMARC
  - Rate limiting and throughput management
- **Configuration:**
  ```
  SMTP_HOST=smtp.provider.ch
  SMTP_PORT=587
  SMTP_USER=notifications@mb-boiler.ch
  SMTP_FROM_NAME=MB Boiler & Heizung AG
  SMTP_FROM_EMAIL=info@mb-boiler.ch
  ```

### 5.3 WhatsApp Business API

- **Provider:** Meta WhatsApp Business Platform (via BSP such as Twilio, MessageBird, or 360dialog)
- **Protocol:** HTTPS REST API
- **Authentication:** Bearer token (API key from BSP)
- **Template Management:**
  - Templates must be pre-approved by WhatsApp/Meta
  - Templates are submitted via BSP dashboard or API
  - Template IDs are stored in the `notification_templates` table
- **Message Format:**
  ```json
  {
    "messaging_product": "whatsapp",
    "to": "41791234567",
    "type": "template",
    "template": {
      "name": "appointment_reminder_de",
      "language": { "code": "de" },
      "components": [
        {
          "type": "body",
          "parameters": [
            { "type": "text", "text": "Hans Muster" },
            { "type": "text", "text": "15. April 2026, 09:00" },
            { "type": "text", "text": "Peter Meier" }
          ]
        }
      ]
    }
  }
  ```
- **Webhook Events:** `message.status` (sent, delivered, read, failed)
- **Rate Limits:** Tier-based (250, 1K, 10K, 100K messages/day). Service respects current tier.

### 5.4 SMS Gateway (Optional)

- **Provider:** Swiss-compatible SMS gateway (e.g., Swisscom SMS API, Twilio)
- **Use Case:** Fallback for critical notifications when push and WhatsApp are unavailable
- **Protocol:** HTTPS REST API
- **Character Limit:** 160 characters (GSM-7) or 70 characters (UCS-2 for special characters)

### 5.5 WebSocket (In-App Real-Time)

- **Protocol:** WebSocket (Socket.IO or native WS)
- **Channel:** `notifications:{userId}`
- **Event:**
  ```json
  {
    "event": "new_notification",
    "data": {
      "id": "uuid",
      "type": "task_assigned",
      "category": "tasks",
      "title": "Neue Aufgabe zugewiesen",
      "body": "Heizungswartung bei Muster AG",
      "deep_link": "/tasks/uuid",
      "created_at": "2026-04-14T08:00:00Z"
    }
  }
  ```
- **Unread Count Update:**
  ```json
  {
    "event": "unread_count",
    "data": { "count": 5 }
  }
  ```

---

## 6. Message Queue Design

### 6.1 Queue Architecture (Redis + Bull/BullMQ)

| Queue Name | Purpose | Concurrency | Retry Policy |
|---|---|---|---|
| `notifications:dispatch` | Main dispatch queue | 10 | 3 retries, exponential backoff |
| `notifications:push` | FCM push delivery | 20 | 3 retries, 10s/30s/90s |
| `notifications:email` | Email delivery | 10 | 5 retries, 30s/60s/300s/900s/3600s |
| `notifications:whatsapp` | WhatsApp delivery | 5 | 3 retries, 10s/60s/300s |
| `notifications:sms` | SMS delivery | 5 | 3 retries, 10s/60s/300s |
| `notifications:scheduled` | Scheduled notification polling | 1 | N/A (continuous) |

### 6.2 Dead Letter Queue

Failed notifications after all retries are moved to a dead letter queue (`notifications:dlq`) for manual review and potential re-dispatch by an administrator.

---

## 7. Template Engine

### 7.1 Technology

- **Engine:** Handlebars.js (or similar logic-less template engine)
- **Features:**
  - Variable substitution: `{{customer.name}}`
  - Conditional blocks: `{{#if appointment.is_morning}}Guten Morgen{{/if}}`
  - Date formatting: `{{formatDate appointment.date "DD. MMMM YYYY"}}`
  - Pluralization and number formatting (Swiss locale)
  - Nested objects: `{{address.street}}, {{address.zip}} {{address.city}}`

### 7.2 Template Resolution Order

1. Look up template by `(type, channel, language)` where `is_active = true`
2. If not found, fall back to `(type, channel, 'de')` (German default)
3. If still not found, use a system-level generic template for the channel
4. If no template exists at all, log an error and skip the channel

### 7.3 Email Template Structure

```html
<!-- Base layout (shared across all email templates) -->
<html>
<head>
  <style>/* MB Boiler brand styles */</style>
</head>
<body>
  <header>
    <img src="logo.png" alt="MB Boiler & Heizung AG" />
  </header>
  <main>
    {{> content}}  <!-- Injected per-template content -->
  </main>
  <footer>
    <p>MB Boiler & Heizung AG | Kontakt: info@mb-boiler.ch</p>
    {{#if is_marketing}}
    <p><a href="{{unsubscribe_url}}">Abmelden</a></p>
    {{/if}}
  </footer>
</body>
</html>
```

---

## 8. Security Considerations

1. **API Authentication:** All notification API endpoints require a valid JWT. Admin endpoints require the `notification.admin` role.
2. **Webhook Verification:** Inbound webhooks from email/WhatsApp providers are verified via signature validation (HMAC or provider-specific mechanism).
3. **PII in Logs:** Notification content is stored in the database for audit but is NOT logged in application logs. Log entries reference notification IDs only.
4. **Encryption at Rest:** Notification content in the database is encrypted at rest (database-level encryption).
5. **Rate Limiting:** The notification API enforces rate limits per calling module to prevent accidental flood (default: 100 notifications/minute per module).

---

## 9. Monitoring & Alerting

| Metric | Threshold | Alert |
|---|---|---|
| Push delivery failure rate | > 5% in 1h | Warning |
| Email bounce rate | > 3% in 1h | Warning |
| WhatsApp failure rate | > 10% in 1h | Warning |
| Queue depth (any channel) | > 1,000 messages | Warning |
| Queue depth (any channel) | > 5,000 messages | Critical |
| Scheduled notification backlog | > 10 minutes behind | Warning |
| Dead letter queue size | > 50 messages | Warning |
| Channel adapter error rate | > 10% in 15min | Critical |
