# Module 13: Notifications

## 1. Purpose

Centralized notification service handling all outbound communications across channels for the MB Boiler & Heizung AG ERP/Field-Service platform. This module provides a unified, reliable, and auditable messaging infrastructure that all other modules consume to reach users, technicians, customers, and partner companies through their preferred communication channels.

## 2. Scope

### In Scope

- **Push Notifications (Mobile):** Real-time push notifications via Firebase Cloud Messaging (FCM) to the technician mobile app for new task assignments, order changes, chat messages, due tasks, and schedule updates.
- **Email Dispatch:** Transactional and scheduled emails for document delivery (quotations, invoices, service reports), appointment reminders, follow-up reminders, and newsletters.
- **WhatsApp Messaging Integration:** Outbound WhatsApp messages via WhatsApp Business API for appointment reminders, service notifications, and newsletters to customers who have opted in.
- **SMS (Optional):** SMS gateway integration as a fallback channel for critical notifications where other channels are unavailable.
- **In-App Notifications:** A notification center within both the web and mobile applications, providing a persistent feed of actionable and informational notifications.
- **Notification Preferences per User:** User-configurable preferences for channel selection, quiet hours, notification categories, and opt-in/opt-out per notification type.
- **Template-Based Notifications:** A template engine supporting multilingual (DE, FR, IT, EN) notification content with dynamic variable substitution and branding.
- **Scheduled/Triggered Notifications:** Support for both event-driven (triggered) and time-based (scheduled) notification dispatch, including recurring reminders.
- **Delivery Tracking:** Tracking of notification delivery status (sent, delivered, read, failed, bounced) across all channels.
- **Notification History & Audit:** Complete audit trail of all notifications sent, enabling compliance review and troubleshooting.

### Key Notification Scenarios

| Scenario | Trigger | Channel(s) | Source Module |
|---|---|---|---|
| New task assigned to technician | Task creation/assignment event | Push, In-App | 12 - Task Management |
| Daily reminder for incomplete reports | Scheduled (end of day) | Push, In-App | 06 - Mobile Technician App |
| Appointment reminder to customer | Scheduled (configurable lead time) | Email, WhatsApp, SMS | 08 - Quotations & Order Processing |
| Quotation follow-up reminder | Scheduled (after quotation sent) | In-App, Email | 08 - Quotations & Order Processing |
| Maintenance due notification | Scheduled (based on maintenance plan) | Email, WhatsApp, Push | 03 - CRM & Asset Management |
| Document ready for download | Document generation event | Email, In-App | 09 - Document Templates & Layout System |
| Chat message received | Real-time event | Push, In-App | 06 - Mobile Technician App |
| Order status change | Order lifecycle event | Push, In-App, Email | 08 - Quotations & Order Processing |
| Invoice overdue reminder | Scheduled (based on payment terms) | Email, WhatsApp | 11 - Accounting |
| Appointment confirmation to partner | Appointment confirmed event | Email, WhatsApp | 04 - Project Management |
| Task due date approaching | Scheduled (configurable lead time) | Push, In-App | 12 - Task Management |

## 3. Boundaries

- **Does NOT compose document content.** The Notifications module dispatches messages but does not generate PDF documents, quotation content, or invoice layouts. Document composition is the responsibility of Module 09 (Documents & Templates).
- **Does NOT determine business rules for when to notify.** Consuming modules decide when a notification should be sent by publishing events or calling the notification API. This module is responsible for *how* the notification is delivered, not *why*.
- **Does NOT manage customer communication preferences at a CRM level.** Marketing opt-in/opt-out for newsletters is managed by Module 03 (CRM & Asset Management). This module respects those preferences but does not own them.
- **Does NOT provide a two-way messaging platform.** For interactive chat, see Module 06 (Mobile Technician App, project chat — MOB-010). This module handles outbound/one-directional notifications only.

## 4. Requirements Summary

| Req ID | Title | Priority | Complexity |
|---|---|---|---|
| NOTIF-001 | Push Notification Service | High | Medium |
| NOTIF-002 | Email Dispatch Service | High | Medium |
| NOTIF-003 | WhatsApp Messaging Integration | High | High |
| NOTIF-004 | In-App Notification Center | Medium | Medium |
| NOTIF-005 | Notification Preferences per User | Medium | Medium |
| NOTIF-006 | Template-Based Notifications | Medium | Medium |
| NOTIF-007 | Scheduled Notifications | Medium | Medium |
| NOTIF-008 | Notification Delivery Tracking | Low | Medium |
| NOTIF-009 | Notification History & Audit | Low | Low |

## 5. Key Dependencies

| Module | Relationship |
|---|---|
| 01 - Core Platform | Event bus for trigger consumption; authentication for user context |
| 03 - CRM & Asset Management | Customer contact data, communication preferences, opt-in status; maintenance-due triggers |
| 04 - Project Management | Partner appointment-confirmation triggers |
| 05 - Field Deployment Planning | Appointment scheduling/assignment triggers |
| 06 - Mobile Technician App | Push notification delivery target; incomplete-report and chat-message triggers |
| 08 - Quotations & Order Processing | Order lifecycle, quotation follow-up, and appointment-reminder triggers |
| 09 - Document Templates & Layout System | Document attachment references for email dispatch |
| 11 - Accounting | Invoice/payment reminder triggers |
| 12 - Task Management | Task assignment and due-date triggers |
| 14 - Integrations | WhatsApp Business API connector, SMTP connector, SMS gateway |

## 6. Non-Functional Requirements

- **Throughput:** Must support at least 1,000 notifications per minute across all channels during peak hours.
- **Latency:** Push notifications and in-app notifications must be delivered within 3 seconds of trigger. Email within 30 seconds. WhatsApp within 60 seconds.
- **Reliability:** At-least-once delivery guarantee. Failed deliveries must be retried with exponential backoff (max 3 retries for push/in-app, max 5 for email, max 3 for WhatsApp).
- **Availability:** 99.5% uptime for the notification service. Channel-specific outages must not block other channels.
- **Data Retention:** Notification history retained for 2 years minimum for audit compliance.
- **GDPR Compliance:** All notification data must respect user consent and data deletion requests. Notification content must not contain sensitive personal data in plain text in logs.
