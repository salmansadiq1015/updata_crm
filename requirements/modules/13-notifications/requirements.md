# Module 13: Notifications - Detailed Requirements

---

## NOTIF-001: Push Notification Service

**ID:** NOTIF-001
**Title:** Push Notification Service
**Priority:** High
**Complexity:** Medium
**Module:** 13 - Notifications

### Description

Provide real-time push notifications to the web & mobile application (technician app) via websocket . The service must accept notification requests from any module via the internal event bus or direct API call, resolve the target user's device tokens, and dispatch push notifications with appropriate payload structure for both Android and iOS.

### Actors

- **System** (event-driven trigger from other modules)
- **Back-Office User** (manual notification via admin interface)
- **Technician** (recipient on mobile device)

### Preconditions

1. Target user has a registered mobile device with a valid FCM token stored in the system.
2. Target user has not disabled push notifications for the relevant notification category.
<!-- 3. The FCM service credentials are configured and valid. -->

### Flow

**Main Flow:**
1. A triggering module publishes a notification event (e.g., `task.assigned`, `order.status_changed`) to the event bus, or calls the Notification API directly.
2. The Notification Service receives the event and resolves the notification type, target user(s), and channel routing based on notification preferences.
3. For the push channel, the service retrieves the target user's active FCM device tokens from the device registry.
4. The service renders the notification title, body, and data payload using the appropriate template (see NOTIF-006).
5. The service dispatches the push notification via FCM, including the rendered content and any deep-link data (e.g., link to the specific task or order).
6. FCM returns a delivery receipt (success/failure per token).
7. The service logs the delivery status and updates the notification record (see NOTIF-008, NOTIF-009).

**Alternate Flows:**
- **A1 - Invalid/Expired Token:** If FCM returns an "unregistered" or "invalid token" error, the service marks the token as inactive in the device registry and does not retry for that token. If the user has other active tokens, those are used.
- **A2 - FCM Unavailable:** If FCM is temporarily unreachable, the notification is queued for retry with exponential backoff (initial delay 10s, max 3 retries). After all retries fail, the notification is marked as `failed` and an alert is raised to the ops dashboard.
- **A3 - User Has No Devices:** If no active device tokens exist for the target user, the push channel is skipped. The notification is still delivered via other enabled channels (in-app, email).
- **A4 - Bulk Push:** For broadcast notifications (e.g., daily incomplete report reminders to all technicians), the service batches FCM requests (up to 500 per batch) for efficient delivery.

### Postconditions

1. The push notification is delivered to all active devices of the target user.
2. A notification record is created in the notification history with delivery status.
3. Invalid device tokens are deactivated.

### Acceptance Criteria

- [ ] AC-1: When a `task.assigned` event is published for a user with an active mobile device, a push notification appears on the device within 3 seconds.
- [ ] AC-2: The push notification displays the correct title and body text as defined by the notification template.
- [ ] AC-3: Tapping the push notification deep-links to the relevant screen in the mobile app (e.g., task detail).
- [ ] AC-4: When a device token is invalid, it is marked inactive and no further pushes are sent to that token.
- [ ] AC-5: When FCM is temporarily unavailable, the notification is retried up to 3 times with exponential backoff.
- [ ] AC-6: A notification record with status `delivered` or `failed` is persisted in the notification history.
- [ ] AC-7: Push notifications respect the user's notification preferences (category opt-out, quiet hours).

### Dependencies

- Module 01 (Core Platform): Event bus, user/device registry
- Module 14 (Integrations): FCM connector configuration
- NOTIF-005: Notification preferences
- NOTIF-006: Template engine

### Tags

`push`, `mobile`, `fcm`, `real-time`, `technician`

---

## NOTIF-002: Email Dispatch Service

**ID:** NOTIF-002
**Title:** Email Dispatch Service
**Priority:** High
**Complexity:** Medium
**Module:** 13 - Notifications

### Description

Provide a reliable email dispatch service for transactional emails (appointment reminders, document delivery, invoice notifications, quotation follow-ups) and bulk emails (newsletters). The service must support HTML templates, file attachments (PDF documents from Module 09), and tracking of delivery status via SMTP/email service provider webhooks.

### Actors

- **System** (event-driven or scheduled trigger)
- **Back-Office User** (manual email send, newsletter dispatch)
- **Customer** (email recipient)
- **Partner Company** (email recipient for appointment confirmations)

### Preconditions

1. Recipient has a valid email address stored in the system (CRM Module 02).
2. SMTP or email service provider credentials are configured and valid.
3. For marketing/newsletter emails, the recipient has opted in (managed by CRM Module 02).

### Flow

**Main Flow:**
1. A triggering module publishes a notification event or calls the Notification API with channel preference `email`.
2. The Notification Service resolves the recipient email address(es) from the user/customer record.
3. The service selects and renders the appropriate email template (HTML + plain-text fallback) with dynamic variables (recipient name, appointment date, document links, etc.).
4. If attachments are specified (e.g., PDF quotation, invoice), the service retrieves the file references from cloud storage (Module 14) and attaches them.
5. The service submits the email to the SMTP relay or email service provider API.
6. The email service provider processes the email and returns a message ID.
7. Delivery status webhooks (delivered, bounced, opened, clicked) are received and stored against the notification record.

**Alternate Flows:**
- **A1 - Invalid Email Address:** If the email address fails format validation, the notification is marked as `failed` with reason `invalid_address`. No dispatch is attempted.
- **A2 - Bounce Handling:** On hard bounce, the email address is flagged in the CRM record. On soft bounce, the service retries up to 3 times over 24 hours.
- **A3 - Attachment Too Large:** If total attachment size exceeds 10 MB, the service replaces attachments with secure download links and notes this in the email body.
- **A4 - Newsletter/Bulk:** For bulk email sends, the service uses batch processing with rate limiting to comply with email provider sending limits. Each email is personalized via the template engine.
- **A5 - Unsubscribe:** Every marketing email includes a one-click unsubscribe link. Unsubscribe actions are propagated back to Module 02 (CRM) to update the customer's communication preferences.

### Postconditions

1. The email is dispatched to the recipient's email address.
2. A notification record with delivery status is persisted.
3. Bounce and unsubscribe events are propagated to CRM.

### Acceptance Criteria

- [ ] AC-1: Transactional emails (e.g., appointment reminder) are dispatched within 30 seconds of the triggering event.
- [ ] AC-2: Emails render correctly in major email clients (Outlook, Gmail, Apple Mail) in both HTML and plain-text formats.
- [ ] AC-3: PDF attachments (quotations, invoices, service reports) are correctly attached and openable.
- [ ] AC-4: When an attachment exceeds 10 MB, a secure download link is provided instead.
- [ ] AC-5: Hard bounces result in the email address being flagged in the CRM.
- [ ] AC-6: Newsletter emails include an unsubscribe link that, when clicked, updates the customer's opt-in status in the CRM within 24 hours.
- [ ] AC-7: Email dispatch respects the recipient's language preference (DE/FR/IT/EN) for template selection.
- [ ] AC-8: Bulk email sends are rate-limited to comply with provider limits and do not block transactional email delivery.

### Dependencies

- Module 01 (Core Platform): Event bus, user context
- Module 02 (CRM): Customer email addresses, language preferences, opt-in status
- Module 09 (Documents & Templates): PDF attachments
- Module 14 (Integrations): SMTP/email service connector
- NOTIF-006: Template engine

### Tags

`email`, `smtp`, `transactional`, `newsletter`, `attachments`, `bounce-handling`

---

## NOTIF-003: WhatsApp Messaging Integration

**ID:** NOTIF-003
**Title:** WhatsApp Messaging Integration
**Priority:** High
**Complexity:** High
**Module:** 13 - Notifications

### Description

Enable outbound WhatsApp messaging to customers and partner companies via the WhatsApp Business API. Use cases include appointment reminders, service completion notifications, maintenance due alerts, and newsletters (with opt-in). All WhatsApp messages must use pre-approved message templates as required by the WhatsApp Business API policy.

### Actors

- **System** (event-driven or scheduled trigger)
- **Back-Office User** (manual WhatsApp message trigger)
- **Customer** (WhatsApp recipient)
- **Partner Company** (WhatsApp recipient for appointment confirmations)

### Preconditions

1. The customer/partner has a valid WhatsApp-capable phone number stored in the CRM.
2. The customer/partner has opted in to receive WhatsApp messages (consent recorded in CRM).
3. WhatsApp Business API account is configured, verified, and has approved message templates.
4. The WhatsApp Business API connector (Module 14, INT-004) is operational.

### Flow

**Main Flow:**
1. A triggering module publishes a notification event or calls the Notification API with channel preference `whatsapp`.
2. The Notification Service checks the recipient's WhatsApp opt-in status via the CRM record.
3. The service selects the appropriate pre-approved WhatsApp message template and populates dynamic parameters (customer name, appointment date/time, technician name, etc.).
4. The service submits the message to the WhatsApp Business API via the connector (Module 14).
5. The WhatsApp Business API returns a message ID and initial status (`sent`).
6. Status callbacks (delivered, read, failed) are received via webhook and stored against the notification record.

**Alternate Flows:**
- **A1 - No Opt-In:** If the recipient has not opted in to WhatsApp messages, the channel is skipped. The notification falls through to the next preferred channel (email or SMS).
- **A2 - Invalid Phone Number:** If the phone number is not registered on WhatsApp, the API returns an error. The notification is marked as `failed` with reason `not_on_whatsapp`, and the next channel is attempted.
- **A3 - Template Not Approved:** If a required template has not been approved by WhatsApp, the notification is held in a pending queue and an alert is raised to the admin. The admin must submit the template for approval or select an alternative.
- **A4 - Rate Limiting:** The WhatsApp Business API enforces messaging limits based on account tier. The service respects these limits and queues excess messages for later dispatch.
- **A5 - 24-Hour Window:** For messages outside the 24-hour customer-initiated conversation window, only pre-approved template messages can be sent. The service enforces this constraint.

### Postconditions

1. The WhatsApp message is delivered to the recipient's device.
2. A notification record with delivery/read status is persisted.
3. If delivery fails, fallback to the next available channel is attempted.

### Acceptance Criteria

- [ ] AC-1: Appointment reminder WhatsApp messages are delivered to opted-in customers within 60 seconds of the scheduled trigger time.
- [ ] AC-2: WhatsApp messages use only pre-approved templates and populate dynamic parameters correctly.
- [ ] AC-3: Customers without WhatsApp opt-in do not receive WhatsApp messages; the system falls back to email.
- [ ] AC-4: Delivery and read receipts are tracked and visible in the notification history.
- [ ] AC-5: WhatsApp Business API rate limits are respected; excess messages are queued and sent when capacity is available.
- [ ] AC-6: Messages are sent in the recipient's preferred language (DE/FR/IT/EN) using language-specific approved templates.
- [ ] AC-7: An admin can view pending/failed WhatsApp messages and retry or redirect to another channel.

### Dependencies

- Module 02 (CRM): Customer phone numbers, WhatsApp opt-in status, language preferences
- Module 14 (Integrations): WhatsApp Business API connector (INT-004)
- NOTIF-005: Notification preferences
- NOTIF-006: Template engine (WhatsApp template management)

### Tags

`whatsapp`, `messaging`, `opt-in`, `appointment-reminder`, `customer-communication`

---

## NOTIF-004: In-App Notification Center

**ID:** NOTIF-004
**Title:** In-App Notification Center
**Priority:** Medium
**Complexity:** Medium
**Module:** 13 - Notifications

### Description

Provide a persistent, real-time notification feed within both the web application and the mobile application. The notification center displays actionable and informational notifications, supports read/unread state management, filtering by category, and deep-linking to the relevant entity (task, order, quotation, etc.).

### Actors

- **Technician** (mobile app user)
- **Back-Office User** (web app user)
- **Dispatcher** (web app user)
- **Manager** (web app user)

### Preconditions

1. The user is authenticated and has an active session.
2. The notification service is operational.

### Flow

**Main Flow:**
1. When a notification event targets a user for the in-app channel, the Notification Service creates a notification record and pushes it to the user's notification feed via WebSocket (web) or push data message (mobile).
2. The notification appears in the notification bell/icon with an unread count badge.
3. The user opens the notification center to see a chronological list of notifications.
4. Each notification displays: icon (by category), title, summary text, timestamp, and read/unread indicator.
5. The user taps/clicks a notification to navigate to the linked entity (deep-link).
6. The notification is marked as `read` upon viewing.
7. The user can mark all notifications as read, or dismiss individual notifications.

**Alternate Flows:**
- **A1 - Filtering:** The user filters notifications by category (e.g., Tasks, Orders, Chat, System) to find relevant items.
- **A2 - Bulk Actions:** The user selects multiple notifications and marks them as read or dismisses them.
- **A3 - Offline (Mobile):** Notifications received while the mobile app is in the background are stored locally and synced when the app is foregrounded.
- **A4 - No Notifications:** If the user has no notifications, the notification center displays an empty state message.

### Postconditions

1. Notifications are displayed in real-time within the application.
2. Read/unread state is persisted and synced across devices.
3. Deep-links navigate to the correct entity.

### Acceptance Criteria

- [ ] AC-1: New in-app notifications appear in the notification center within 3 seconds of the trigger event, without requiring a page refresh.
- [ ] AC-2: The notification bell displays an accurate unread count badge.
- [ ] AC-3: Clicking/tapping a notification navigates to the correct entity detail screen.
- [ ] AC-4: Notifications can be filtered by category (Tasks, Orders, Chat, System, etc.).
- [ ] AC-5: "Mark all as read" updates the unread count to zero and persists the state.
- [ ] AC-6: The notification center loads the most recent 50 notifications initially, with lazy loading/pagination for older entries.
- [ ] AC-7: Read/unread state is synchronized between web and mobile for the same user.

### Dependencies

- Module 01 (Core Platform): WebSocket infrastructure, authentication
- Module 05 (Mobile/Field Service): Mobile notification feed integration

### Tags

`in-app`, `notification-center`, `real-time`, `websocket`, `ux`

---

## NOTIF-005: Notification Preferences per User

**ID:** NOTIF-005
**Title:** Notification Preferences per User
**Priority:** Medium
**Complexity:** Medium
**Module:** 13 - Notifications

### Description

Allow each user to configure their notification preferences, including channel selection per notification category, quiet hours (do-not-disturb), and opt-in/opt-out for non-critical notification types. Preferences are respected by all notification dispatch logic.

### Actors

- **Technician** (configuring own preferences)
- **Back-Office User** (configuring own preferences)
- **Admin** (setting organization-wide defaults, overriding for specific users)

### Preconditions

1. The user is authenticated.
2. Default notification preferences are initialized upon user creation.

### Flow

**Main Flow:**
1. The user navigates to Settings > Notification Preferences.
2. The system displays a matrix of notification categories (rows) vs. channels (columns: Push, Email, In-App, WhatsApp).
3. For each category, the user enables or disables specific channels.
4. The user configures quiet hours (e.g., no push notifications between 20:00 and 07:00).
5. The user saves preferences.
6. The system validates and persists the preferences.
7. All subsequent notification dispatches for this user respect the updated preferences.

**Alternate Flows:**
- **A1 - Mandatory Notifications:** Certain notification types (e.g., critical system alerts, security notifications) cannot be disabled. These are shown as locked/enabled in the preferences UI.
- **A2 - Admin Override:** An admin can set organization-wide default preferences that apply to all new users. Existing users retain their customized preferences unless the admin issues a force-reset.
- **A3 - Quiet Hours with Exceptions:** During quiet hours, critical notifications (security, emergency) still bypass the DND filter.

### Postconditions

1. User preferences are persisted and immediately effective.
2. Subsequent notifications respect the saved preferences.

### Acceptance Criteria

- [ ] AC-1: A user can enable/disable push notifications for the "Task Assignment" category, and subsequent task assignment events respect this setting.
- [ ] AC-2: Quiet hours prevent push notifications from being delivered during the configured window, except for critical notifications.
- [ ] AC-3: Mandatory notification types cannot be disabled in the UI.
- [ ] AC-4: An admin can set default preferences for new users.
- [ ] AC-5: Preference changes take effect immediately (no delay or cache lag).
- [ ] AC-6: Preferences are accessible and configurable from both web and mobile apps.

### Dependencies

- Module 01 (Core Platform): User settings infrastructure
- NOTIF-001: Push channel
- NOTIF-002: Email channel
- NOTIF-003: WhatsApp channel
- NOTIF-004: In-App channel

### Tags

`preferences`, `settings`, `quiet-hours`, `opt-in`, `user-configuration`

---

## NOTIF-006: Template-Based Notifications

**ID:** NOTIF-006
**Title:** Template-Based Notifications
**Priority:** Medium
**Complexity:** Medium
**Module:** 13 - Notifications

### Description

Provide a template engine for composing notification content across all channels. Templates support multilingual content (DE, FR, IT, EN), dynamic variable substitution, channel-specific formatting (HTML for email, plain text for push/WhatsApp), and versioning. Administrators can manage templates via a back-office UI.

### Actors

- **Admin** (creating and managing templates)
- **System** (rendering templates at dispatch time)

### Preconditions

1. At least one template exists for each required notification type and channel.
2. The admin has the `notification_template.manage` permission.

### Flow

**Main Flow:**
1. An admin navigates to Settings > Notification Templates.
2. The system displays a list of all notification templates, grouped by notification type.
3. The admin creates or edits a template, specifying:
   - Notification type (e.g., `appointment_reminder`)
   - Channel (push, email, whatsapp, in-app)
   - Language (DE, FR, IT, EN)
   - Subject/Title (for email and push)
   - Body content with dynamic placeholders (e.g., `{{customer.name}}`, `{{appointment.date}}`, `{{technician.name}}`)
   - For email: HTML body with layout and branding
   - For WhatsApp: Template text matching the approved WhatsApp Business template
4. The admin previews the template with sample data.
5. The admin saves and publishes the template.
6. At dispatch time, the Notification Service selects the template by notification type, channel, and recipient language, then renders it with the actual data payload.

**Alternate Flows:**
- **A1 - Missing Language:** If a template does not exist in the recipient's preferred language, the system falls back to German (DE) as the default language.
- **A2 - Template Versioning:** When a template is updated, the previous version is archived. Notifications already queued continue to use the version that was active at queue time.
- **A3 - Invalid Placeholders:** If a dynamic variable is missing from the data payload, the placeholder is replaced with an empty string and a warning is logged.

### Postconditions

1. The template is saved and available for use by the notification dispatch engine.
2. Existing queued notifications are not affected by template updates.

### Acceptance Criteria

- [ ] AC-1: An admin can create a new email template with HTML formatting and dynamic placeholders.
- [ ] AC-2: Templates are available in all four languages (DE, FR, IT, EN); missing language falls back to DE.
- [ ] AC-3: The preview function renders the template with sample data accurately.
- [ ] AC-4: Dynamic placeholders (e.g., `{{customer.name}}`) are correctly substituted at dispatch time.
- [ ] AC-5: Template versioning preserves previous versions and allows rollback.
- [ ] AC-6: WhatsApp templates align with the approved WhatsApp Business API template structure.

### Dependencies

- Module 01 (Core Platform): Admin UI framework, permissions
- NOTIF-001 through NOTIF-004: Channel-specific rendering requirements

### Tags

`templates`, `multilingual`, `i18n`, `dynamic-content`, `admin`

---

## NOTIF-007: Scheduled Notifications

**ID:** NOTIF-007
**Title:** Scheduled Notifications
**Priority:** Medium
**Complexity:** Medium
**Module:** 13 - Notifications

### Description

Support time-based scheduling of notifications, including one-time future notifications (e.g., appointment reminder 24h before), recurring notifications (e.g., daily incomplete report reminder at 17:00), and cron-like schedules for batch notifications (e.g., weekly maintenance due summary). The scheduler must handle timezone-aware scheduling (Swiss time zones) and be resilient to server restarts.

### Actors

- **System** (configuring scheduled notifications based on business rules)
- **Back-Office User** (configuring follow-up reminders, appointment reminders)
- **Admin** (configuring recurring system notifications)

### Preconditions

1. The notification type and template exist.
2. The scheduling parameters are valid (future date, valid cron expression).

### Flow

**Main Flow:**
1. A module or user schedules a notification by calling the Notification API with scheduling parameters:
   - `scheduled_at` (ISO 8601 datetime) for one-time future dispatch
   - `cron_expression` for recurring schedules
   - `timezone` (default: `Europe/Zurich`)
   - Notification payload (type, recipients, template variables)
2. The scheduler persists the scheduled notification in the database.
3. A background scheduler process polls for due notifications at a configurable interval (default: every 30 seconds).
4. When a scheduled notification becomes due, it is dispatched through the normal notification pipeline (channel routing, template rendering, delivery).
5. For recurring notifications, the next occurrence is calculated and persisted after each dispatch.
6. The scheduled notification record is updated with the dispatch result.

**Alternate Flows:**
- **A1 - Cancellation:** A scheduled notification can be cancelled before its dispatch time. Cancelled notifications are marked as `cancelled` and not dispatched.
- **A2 - Rescheduling:** A scheduled notification can be rescheduled to a new time (e.g., appointment time changed).
- **A3 - Server Restart:** The scheduler recovers missed notifications on startup by checking for overdue items and dispatching them immediately (with a configurable grace period; notifications more than 24 hours overdue are skipped and logged).
- **A4 - Recurring End Date:** Recurring notifications can have an optional end date, after which they are automatically deactivated.

### Postconditions

1. The notification is dispatched at the scheduled time (within the polling interval tolerance).
2. Recurring schedules produce new instances as expected.
3. Completed and cancelled scheduled notifications are recorded in history.

### Acceptance Criteria

- [ ] AC-1: A notification scheduled for a future time is dispatched within 60 seconds of the scheduled time.
- [ ] AC-2: A recurring daily notification at 17:00 CET fires every day at the correct local time, including across DST transitions.
- [ ] AC-3: A scheduled notification can be cancelled before dispatch, and no message is sent.
- [ ] AC-4: After a server restart, overdue scheduled notifications (within 24h) are dispatched upon recovery.
- [ ] AC-5: The scheduling API validates that `scheduled_at` is in the future and rejects past dates.
- [ ] AC-6: Recurring notifications with an end date automatically stop after the end date.

### Dependencies

- Module 01 (Core Platform): Background job infrastructure, database
- NOTIF-001 through NOTIF-004: Dispatch channels

### Tags

`scheduling`, `cron`, `recurring`, `timezone`, `background-job`

---

## NOTIF-008: Notification Delivery Tracking

**ID:** NOTIF-008
**Title:** Notification Delivery Tracking
**Priority:** Low
**Complexity:** Medium
**Module:** 13 - Notifications

### Description

Track the delivery lifecycle of each notification across all channels, from creation through dispatch to final delivery/read status. Provide a dashboard for administrators to monitor delivery rates, failure rates, and channel health in real time.

### Actors

- **Admin** (monitoring delivery metrics)
- **System** (recording delivery events)

### Preconditions

1. Notification channels are configured and operational.
2. Webhook endpoints for delivery callbacks (email, WhatsApp) are registered.

### Flow

**Main Flow:**
1. When a notification is created, a tracking record is initialized with status `pending`.
2. When the notification is submitted to a channel provider, the status updates to `sent`.
3. The channel provider sends delivery callbacks:
   - **Push:** FCM delivery receipt -> `delivered`
   - **Email:** SMTP/provider webhook -> `delivered`, `bounced`, `opened`, `clicked`
   - **WhatsApp:** API callback -> `delivered`, `read`, `failed`
   - **In-App:** Client-side read event -> `read`
4. Each status transition is timestamped and recorded.
5. The admin dashboard aggregates these records into delivery metrics:
   - Delivery rate per channel (last 24h, 7d, 30d)
   - Failure rate per channel
   - Average delivery latency per channel
   - Top failure reasons

**Alternate Flows:**
- **A1 - No Callback Received:** If no delivery callback is received within a configurable timeout (e.g., 1 hour for email), the status remains `sent` and is flagged for review.
- **A2 - Multiple Channels:** For notifications dispatched on multiple channels, each channel has its own tracking record. The aggregate notification status is `delivered` if at least one channel succeeds.

### Postconditions

1. Every notification has a complete delivery lifecycle record.
2. Delivery metrics are available on the admin dashboard.

### Acceptance Criteria

- [ ] AC-1: Each notification record tracks status transitions with timestamps (pending -> sent -> delivered/failed).
- [ ] AC-2: Email open and click tracking is recorded when the email provider supports it.
- [ ] AC-3: WhatsApp read receipts are captured and stored.
- [ ] AC-4: The admin dashboard displays delivery rate, failure rate, and average latency per channel for configurable time windows.
- [ ] AC-5: Notifications without a delivery callback within 1 hour are flagged for admin review.

### Dependencies

- Module 14 (Integrations): Webhook endpoint registration for channel providers
- NOTIF-001 through NOTIF-004: Channel dispatch

### Tags

`tracking`, `delivery`, `metrics`, `dashboard`, `monitoring`

---

## NOTIF-009: Notification History & Audit

**ID:** NOTIF-009
**Title:** Notification History & Audit
**Priority:** Low
**Complexity:** Low
**Module:** 13 - Notifications

### Description

Maintain a complete, searchable history of all notifications sent by the system. The history serves as an audit trail for compliance, troubleshooting, and customer service inquiries ("Did the customer receive the appointment reminder?"). History records include the notification type, channel, recipient, content summary, delivery status, and timestamps.

### Actors

- **Admin** (searching and reviewing notification history)
- **Back-Office User** (checking if a specific notification was sent to a customer)
- **System** (writing audit records)

### Preconditions

1. The notification service is operational and recording notification events.

### Flow

**Main Flow:**
1. Every notification dispatched by the system creates a history record containing:
   - Notification ID
   - Type/category
   - Channel (push, email, whatsapp, in-app)
   - Recipient (user ID, email, phone number - partially masked for privacy)
   - Content summary (subject/title, body preview - first 200 characters)
   - Template used (ID and version)
   - Trigger source (module, event type)
   - Delivery status and status history
   - Timestamps (created, sent, delivered, read)
2. An admin or back-office user navigates to Admin > Notification History.
3. The user searches/filters by:
   - Date range
   - Recipient (name, email, phone)
   - Notification type
   - Channel
   - Delivery status
4. The system displays matching records in a paginated list.
5. The user can drill into a specific record to see full details, including delivery status timeline.

**Alternate Flows:**
- **A1 - Export:** The admin exports filtered notification history to CSV for external analysis or compliance reporting.
- **A2 - Data Retention:** Records older than the retention period (default 2 years) are archived or deleted per data retention policy.
- **A3 - GDPR Deletion:** When a customer exercises their right to erasure, all notification history records for that customer are anonymized (recipient data removed, content purged) while retaining aggregate statistics.

### Postconditions

1. All notifications are recorded in the searchable history.
2. History is retained for the configured retention period.
3. GDPR deletion requests are honored.

### Acceptance Criteria

- [ ] AC-1: Every notification sent by the system has a corresponding history record within 5 seconds.
- [ ] AC-2: The history is searchable by recipient, date range, notification type, channel, and delivery status.
- [ ] AC-3: The detail view shows the full delivery status timeline (created -> sent -> delivered -> read).
- [ ] AC-4: History records are retained for at least 2 years.
- [ ] AC-5: Notification history can be exported to CSV.
- [ ] AC-6: GDPR deletion anonymizes recipient data in notification history without deleting the audit record structure.
- [ ] AC-7: Phone numbers and email addresses are partially masked in list views (e.g., `j***@example.com`, `+41 79 *** ** 45`).

### Dependencies

- Module 01 (Core Platform): Database, search infrastructure
- NOTIF-008: Delivery tracking data
- Module 02 (CRM): GDPR data deletion events

### Tags

`audit`, `history`, `compliance`, `gdpr`, `search`, `export`
