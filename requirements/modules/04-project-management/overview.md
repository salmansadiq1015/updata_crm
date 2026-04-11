# Module 04: Project Management

## Module Metadata

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Module ID         | MOD-04                                     |
| Module Name       | Project Management                         |
| SOW Reference     | Section 3                                  |
| Version           | 1.0                                        |
| Status            | Draft                                      |
| Last Updated      | 2026-03-29                                 |
| Owner             | MB Boiler & Heizung AG                     |

---

## 1. Purpose

The Project Management module provides the central capability for creating, organizing, tracking, and completing projects within the MB Boiler & Heizung AG ERP/Field-Service platform. Projects encompass construction work, renovation projects, heating system installations, and other multi-step engagements that require coordination of resources, partners, materials, and documentation.

This module serves as the organizational backbone that ties together scheduling (Module 05), field deployment (Module 06), customer data (Module 02), and financial documents (Module 08) into a coherent project lifecycle.

---

## 2. Scope

### In Scope

- **Project Creation**: Full CRUD operations for projects including construction and renovation projects.
- **Status Tracking**: Lifecycle management with configurable status workflow (e.g., Draft, Planning, In Progress, On Hold, Completed, Archived).
- **Preparatory Actions Management**: Tracking and managing pre-project activities such as:
  - Funding applications (Foerderantraege)
  - Material orders
  - Scheduling coordination
- **Construction Schedule Management**: Building and maintaining construction site schedules (Bauplaene) with:
  - Appointment confirmations to partner companies (Terminbestaetigung an Partnerfirmen)
  - Milestone tracking
- **Project Document Creation**: Generation of project-related documents (e.g., confirmation letters, schedules, status reports).
- **Document Repository**: Centralized, per-project document storage and retrieval.
- **Project Dashboard**: Overview screen showing all projects with key status indicators, filters, and quick actions.

### Out of Scope

- **Individual Task Tracking**: Granular task management and assignment is handled by Module 12 (Task Management). This module tracks project-level milestones and preparatory actions, not individual work tasks.
- **Quotation & Invoicing**: Financial document creation and management is handled by Module 08 (Quotation & Invoicing).
- **Employee HR Data**: Employee records and HR management are outside this module's scope.
- **Detailed Field Scheduling**: Calendar-based deployment planning is handled by Module 05 (Field Deployment Planning).

---

## 3. Key Features

| # | Feature                              | Description                                                                                          |
|---|--------------------------------------|------------------------------------------------------------------------------------------------------|
| 1 | Project CRUD                         | Create, read, update, and delete projects with all associated metadata.                              |
| 2 | Status Overview                      | Visual dashboard showing project statuses, progress indicators, and key dates.                       |
| 3 | Preparatory Workflow Management      | Structured tracking of funding applications, material orders, and scheduling prerequisites.          |
| 4 | Construction Schedule                | Timeline view for construction projects with partner company appointment confirmations.              |
| 5 | Partner Appointment Confirmations    | Send and track confirmations to partner/subcontractor companies for scheduled work.                  |
| 6 | Document Creation                    | Generate project documents from templates (confirmations, schedules, reports).                       |
| 7 | Document Storage                     | Per-project document repository with upload, download, categorization, and search.                   |

---

## 4. Requirements Summary

| Requirement ID | Title                              | Priority | Complexity |
|----------------|------------------------------------|----------|------------|
| PROJ-001       | Project Creation & Management      | High     | Medium     |
| PROJ-002       | Project Status Tracking            | High     | Medium     |
| PROJ-003       | Preparatory Actions Management     | High     | High       |
| PROJ-004       | Construction Schedule Management   | High     | High       |
| PROJ-005       | Project Document Creation          | Medium   | Medium     |
| PROJ-006       | Document Repository per Project    | Medium   | Low        |
| PROJ-007       | Project Dashboard & Overview       | Medium   | Medium     |

---

## 5. Actors

| Actor                  | Role in Module                                                        |
|------------------------|-----------------------------------------------------------------------|
| Project Manager        | Creates and manages projects, tracks status, coordinates partners.    |
| Office Administrator   | Assists with document creation, funding applications, scheduling.     |
| Field Technician       | Views project details and assigned work (read-only in this module).   |
| Partner Company        | Receives appointment confirmations (external actor).                  |
| System Administrator   | Configures project templates, statuses, and workflows.                |

---

## 6. Dependencies

| Dependency          | Module / System      | Nature                                                        |
|---------------------|----------------------|---------------------------------------------------------------|
| Customer Data       | MOD-02 (CRM)        | Projects are linked to customers/sites from the CRM module.  |
| Scheduling          | MOD-05 (Deployment)  | Project schedules feed into deployment planning calendars.    |
| Mobile App          | MOD-06 (Mobile)      | Technicians access project info and documents via mobile.     |
| Quotation/Invoicing | MOD-08 (Finance)     | Projects reference quotations; invoicing references projects. |
| Task Management     | MOD-12 (Tasks)       | Individual tasks within a project are managed in MOD-12.      |
| Document Management | Platform Service     | Core file storage and retrieval service.                      |

---

## 7. Key Business Rules

1. Every project must be associated with at least one customer record from the CRM module.
2. A project cannot transition to "In Progress" status until all mandatory preparatory actions are marked complete.
3. Partner appointment confirmations must be sent at least 5 business days before the scheduled date (configurable).
4. Documents uploaded to a project repository inherit the project's access permissions.
5. Completed projects are archived after a configurable retention period but remain searchable.
6. Project numbers are generated automatically using a sequential numbering scheme with a configurable prefix.
