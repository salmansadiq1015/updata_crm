# Module 06: Mobile Technician App

## Module Metadata

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Module ID         | MOD-06                                     |
| Module Name       | Mobile Technician App                      |
| SOW Reference     | Section 5                                  |
| Version           | 1.0                                        |
| Status            | Draft                                      |
| Last Updated      | 2026-03-29                                 |
| Owner             | MB Boiler & Heizung AG                     |

---

## 1. Purpose

The Mobile Technician App is a native mobile application for iOS and Android that equips field technicians and service staff with the tools they need to perform their work efficiently on-site. It provides access to assigned orders, site and installation information, work reporting, material tracking, time recording, photo documentation, and project communication -- all with full offline capability.

The app acts as the primary field interface to the MB Boiler & Heizung AG ERP platform, consuming APIs from the web-based backend modules while providing a purpose-built mobile experience optimized for use on construction sites and in customer premises.

---

## 2. Scope

### In Scope

- **Order Overview**: Display of all orders assigned to the logged-in technician.
- **Order/Site/Installation Info**: Access to detailed order information, site data, and installation records.
- **Work Report Creation & Editing**: Structured work reports that capture performed activities, findings, and next steps.
- **Service Line Items & Material Lists**: Entry and management of service line items using both IGH catalog and internal material catalog.
- **Small Order Assignment**: Ability to create and assign small/subsidiary orders within a parent project context.
- **Document Access & Storage**: View and upload documents associated with orders and projects.
- **Photo Documentation**: Capture, annotate, and attach photos to orders and work reports.
- **Mobile Time Recording**: Clock-in/clock-out and activity-based time recording per order.
- **Time Report Lock**: System-enforced lock preventing time report release until the associated work report is fully submitted.
- **Project-Related Chat**: In-app messaging scoped to project/order context for team communication.
- **Installation Overview**: View of all installations at a site with history and technical details.
- **Offline Functionality**: Full offline capability for core functions with automatic synchronization when connectivity is restored.
- **Push Notifications**: Real-time notifications for new tasks, order changes, chat messages, and overdue items.
- **Quotation View (No Prices)**: Technicians can view quotation details without price information.
- **Daily Reminder**: Automated daily reminder for incomplete or unsubmitted work reports.

### Out of Scope

- **Core Business Logic**: All business logic resides in the web-based backend modules. The mobile app consumes APIs and provides a field-optimized UI.
- **Payment Processing**: No payment collection or accounting functionality.
- **Pricing / Financial Data**: Technicians do not see prices (except where explicitly allowed by role).
- **Administrative Functions**: User management, system configuration, and master data management are web-only.

---

## 3. Key Features

| #  | Feature                          | Description                                                                                      |
|----|----------------------------------|--------------------------------------------------------------------------------------------------|
| 1  | Order Dashboard                  | Filterable list of assigned orders with status indicators, dates, and quick actions.             |
| 2  | Order Detail View                | Complete order, site, and installation information with navigation and history.                  |
| 3  | Work Report Editor               | Structured form for creating and editing work reports with validation.                           |
| 4  | Material & Service Entry         | Search and add items from IGH and internal catalogs with quantity tracking.                      |
| 5  | Photo Capture & Annotation       | Camera integration with markup tools, categorization, and attachment to reports.                 |
| 6  | Time Tracker                     | Start/stop timer or manual time entry per order with break tracking.                             |
| 7  | Report Lock Enforcement          | System prevents time report finalization until work report is complete.                          |
| 8  | Project Chat                     | Real-time messaging within project/order context with media sharing.                             |
| 9  | Offline Engine                   | Local data storage, queue-based sync, conflict resolution on reconnect.                          |
| 10 | Push Notification System         | Configurable push notifications for assignments, changes, messages, and reminders.               |
| 11 | Daily Report Reminder            | Automated end-of-day notification prompting completion of open reports.                          |

---

## 4. Requirements Summary

| Requirement ID | Title                                        | Priority | Complexity |
|----------------|----------------------------------------------|----------|------------|
| MOB-001        | Order Overview for Assigned Employee         | High     | Low        |
| MOB-002        | Order/Site/Installation Information Access   | High     | Medium     |
| MOB-003        | Work Report Creation & Editing               | High     | High       |
| MOB-004        | Service Line Items & Material Lists          | High     | High       |
| MOB-005        | Small Order Assignment within Project        | Medium   | Medium     |
| MOB-006        | Document Access & Storage per Order          | Medium   | Medium     |
| MOB-007        | Photo Documentation                          | High     | Medium     |
| MOB-008        | Mobile Time Recording                        | High     | Medium     |
| MOB-009        | Time Report Lock                             | High     | Medium     |
| MOB-010        | Project-Related Chat                         | Medium   | High       |
| MOB-011        | Installation Overview for Employees          | Medium   | Low        |
| MOB-012        | Offline Functionality with Auto-Sync         | High     | High       |
| MOB-013        | Push Notifications                           | High     | Medium     |
| MOB-014        | Quotation View without Prices                | Low      | Low        |
| MOB-015        | Daily Reminder for Incomplete Reports        | Medium   | Low        |

---

## 5. Offline Requirements (Minimum)

The following capabilities must be fully available when the device has no network connectivity:

| Capability                 | Offline Behavior                                                              |
|----------------------------|-------------------------------------------------------------------------------|
| Display assigned orders    | Orders synced during last online session are available in local storage.       |
| View site/order data       | All synced site, order, and installation data accessible from local cache.    |
| Report capture             | Work reports can be created and edited; queued for sync on reconnect.         |
| Photo capture              | Photos can be taken and attached locally; uploaded on reconnect.              |
| Time recording             | Timer and manual entry work fully offline; synced on reconnect.              |

Auto-sync must occur automatically when connectivity is restored, with conflict resolution for any concurrent server-side changes.

---

## 6. Actors

| Actor                  | Role in Module                                                                |
|------------------------|-------------------------------------------------------------------------------|
| Field Technician       | Primary user: views orders, creates reports, records time, takes photos.      |
| Team Lead              | Views team assignments, may reassign small orders within projects.            |
| Dispatcher / Planner   | Indirectly interacts by pushing assignments and receiving report submissions. |
| System                 | Sends push notifications, enforces report locks, triggers daily reminders.    |

---

## 7. Dependencies

| Dependency               | Module / System       | Nature                                                                  |
|--------------------------|-----------------------|-------------------------------------------------------------------------|
| Field Deployment Planning| MOD-05                | Assignment data is the source for the technician's order list.          |
| Project Management       | MOD-04                | Project details, documents, and schedules are accessed via mobile.      |
| CRM / Customer Data      | MOD-02                | Site and installation information is sourced from CRM.                  |
| Material Catalog         | MOD-07 / IGH          | Material and service item catalogs for line item entry.                 |
| Quotation & Invoicing    | MOD-08                | Quotation data (without prices) is displayed to technicians.            |
| Time Management          | MOD-10                | Time records from mobile feed into central time management.             |
| Notification Service     | Platform Service      | Push notification delivery infrastructure.                              |
| File Storage Service     | Platform Service      | Document and photo storage backend.                                     |

---

## 8. Key Business Rules

1. Technicians can only view orders assigned to them unless they have team lead permissions.
2. Time reports cannot be finalized/released until the associated work report is fully submitted and validated.
3. The daily reminder for incomplete reports triggers at a configurable time (default: 17:00 local time).
4. Photos must include metadata (timestamp, GPS coordinates if available, order reference) automatically.
5. Offline data must be encrypted at rest on the device using platform-standard encryption.
6. Sync conflicts are resolved using a last-write-wins strategy with server-side audit logging of overwritten data.
7. Push notifications respect device-level notification settings and quiet hours configuration.
8. Quotation views for technicians must never display unit prices, discounts, or margin information.

---

## 9. Platform Requirements

| Requirement            | Specification                               |
|------------------------|---------------------------------------------|
| iOS Minimum Version    | iOS 15.0+                                   |
| Android Minimum Version| Android 10 (API level 29)+                  |
| Framework              | Cross-platform (React Native or Flutter)    |
| Offline Storage        | SQLite or equivalent embedded database       |
| Camera Access          | Required for photo documentation             |
| Location Access        | Optional, used for photo metadata            |
| Network                | Wi-Fi and cellular data support              |
