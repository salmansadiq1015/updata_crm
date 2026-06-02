# Module 14: Integrations

## 1. Purpose

All external system integrations and third-party connectors for the MB Boiler & Heizung AG ERP/Field-Service platform. This module serves as the adapter/connector layer that standardizes communication between the platform and external services, APIs, and data sources. Each integration is encapsulated as an independent connector with a consistent internal interface, enabling the platform to interact with external systems without embedding third-party logic into business modules.

## 2. Scope

### In Scope

- **Website Plugin/Widget for Customer Order Submission:** An embeddable widget for the MB Boiler & Heizung AG website that allows customers (end-consumers) to submit service requests, heating orders, or contact inquiries directly into the ERP system.
- **IGH Industry Catalog API Integration:** Connection to the IGH (Interessengemeinschaft Haustechnik) catalog system for retrieving standardized HVAC product data, article numbers, pricing, and specifications used in quotations and orders.
- **Banking Interface for Payment Reconciliation:** Integration with Swiss banking systems for automated payment matching. Import of bank statements (ISO 20022 / camt.053/054) and reconciliation with open invoices.
- **WhatsApp Business API Connector:** Technical adapter for the WhatsApp Business API, handling authentication, message submission, template management, and webhook processing. Business logic for what/when to send is in Module 13 (Notifications).
- **SMTP/Email Service Integration:** Connector for email dispatch via SMTP relay or transactional email provider API (e.g., SendGrid, Mailgun, Amazon SES). Handles sending, bounce/delivery webhooks, and connection pooling.
- **OCR Service Integration:** Integration with an OCR (Optical Character Recognition) service for automated extraction of data from scanned supplier invoices, delivery notes, and other paper documents.
- **Cloud Storage Integration:** Connector for cloud storage services (e.g., AWS S3, Azure Blob Storage, or Swiss-hosted alternatives) for document storage, backup, and retrieval.
- **Calendar Sync (Optional):** Optional integration with external calendar systems (Google Calendar, Microsoft Outlook/Exchange) for synchronizing technician schedules and appointments.
- **Integration Health Monitoring:** Centralized monitoring dashboard showing the operational status, error rates, and latency of all active integrations.

### Contractual Note

> "Interfaces to third-party systems are only owed to the extent that their technical documentation, access, licences, and cooperation obligations are made available in good time."

This means:
- Each integration requires the third-party provider to supply API documentation, credentials, and test environments before development begins.
- Integrations are contingent on the availability and stability of external APIs.
- If a third-party system changes its API or becomes unavailable, the platform is not responsible for maintaining compatibility beyond reasonable effort.

## 3. Boundaries

- **Does NOT contain business logic.** Integrations are pure adapters/connectors. They translate between the platform's internal data formats and external system protocols. Business rules (e.g., when to send a WhatsApp message, how to apply a catalog price) reside in the consuming modules.
- **Does NOT handle internal module-to-module communication.** Internal event bus, message passing, and API calls between platform modules are managed by Module 01 (Core Platform).
- **Does NOT store master data.** Integrated data (e.g., IGH catalog items, bank transactions) is imported into the relevant module's data store (e.g., Module 10 for articles, Module 11 for payments). The integration module handles the transfer, not the storage.
- **Does NOT provide a general-purpose iPaaS.** This is not a low-code integration platform. Each connector is purpose-built for a specific external system.

## 4. Requirements Summary

| Req ID | Title | Priority | Complexity |
|---|---|---|---|
| INT-001 | Website Plugin/Widget for Customer Orders | High | High |
| INT-002 | IGH Industry Catalog API Integration | High | Medium |
| INT-003 | Banking Interface | High | High |
| INT-004 | WhatsApp Business API Connector | High | Medium |
| INT-005 | SMTP/Email Service Integration | High | Low |
| INT-006 | OCR Service Integration | High | High |
| INT-007 | Cloud Storage Integration | Medium | Low |
| INT-008 | Calendar Sync | Medium | Medium |
| INT-009 | Integration Health Monitoring | Medium | Medium |

## 5. Key Dependencies

| Module | Relationship |
|---|---|
| 01 - Core Platform | Event bus, authentication, configuration management |
| 03 - CRM & Asset Management | Customer/contact matching and service-request (lead) creation from website widget submissions |
| 08 - Quotations & Order Processing | IGH catalog data for quotation line items |
| 09 - Document Templates & Layout System | Document storage in cloud storage |
| 10 - Material Catalogs & Interfaces | IGH catalog article import |
| 11 - Accounting | Banking interface for payment reconciliation, OCR for supplier invoices |
| 13 - Notifications | WhatsApp and email connectors for notification dispatch |

## 6. Non-Functional Requirements

- **Resilience:** All integrations must implement circuit breaker patterns. A failing external service must not cascade failures into the platform.
- **Retry Logic:** Transient failures are retried with exponential backoff. Permanent failures are logged and flagged.
- **Timeout:** All external API calls have configurable timeouts (default: 30 seconds).
- **Rate Limiting:** Integrations respect external API rate limits and implement client-side throttling.
- **Logging:** All integration calls are logged with request/response metadata (excluding sensitive data) for debugging.
- **Configuration:** Integration credentials and endpoints are stored in secure configuration (environment variables or vault), never in code.
- **Data Residency:** All data processed through integrations must comply with Swiss data protection regulations. Cloud storage must offer Swiss or EU data residency options.
