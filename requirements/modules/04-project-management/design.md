# Module 04: Project Management -- Design Specification

## Document Metadata

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Module ID         | MOD-04                                     |
| Document Type     | Design Specification                       |
| Version           | 1.0                                        |
| Status            | Draft                                      |
| Last Updated      | 2026-03-29                                 |

---

## 1. Data Models

### 1.1 Project

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `project_number`      | String(20)    | Yes      | Auto-generated unique project number (e.g., PRJ-2026-00042). |
| `name`                | String(200)   | Yes      | Project name.                                            |
| `description`         | Text          | No       | Detailed project description.                            |
| `project_type`        | Enum          | Yes      | NEW_INSTALLATION, RENOVATION, MAINTENANCE, SERVICE_CONTRACT, OTHER. |
| `status`              | Enum          | Yes      | DRAFT, PLANNING, IN_PROGRESS, ON_HOLD, COMPLETED, ARCHIVED. |
| `customer_id`         | UUID (FK)     | Yes      | Reference to CRM customer record.                        |
| `site_id`             | UUID (FK)     | No       | Reference to CRM site/location record.                   |
| `project_manager_id`  | UUID (FK)     | Yes      | Reference to employee record (project manager).          |
| `team_id`             | UUID (FK)     | No       | Reference to team assignment.                            |
| `planned_start_date`  | Date          | No       | Planned project start date.                              |
| `planned_end_date`    | Date          | No       | Planned project end date.                                |
| `actual_start_date`   | Date          | No       | Actual project start date.                               |
| `actual_end_date`     | Date          | No       | Actual project end date.                                 |
| `estimated_budget`    | Decimal(12,2) | No       | Estimated budget in CHF.                                 |
| `currency`            | String(3)     | Yes      | Currency code (default: CHF).                            |
| `notes`               | Text          | No       | Internal notes.                                          |
| `template_id`         | UUID (FK)     | No       | Reference to project template used (if any).             |
| `is_deleted`          | Boolean       | Yes      | Soft-delete flag (default: false).                       |
| `created_at`          | Timestamp     | Yes      | Creation timestamp.                                      |
| `created_by`          | UUID (FK)     | Yes      | User who created the record.                             |
| `updated_at`          | Timestamp     | Yes      | Last update timestamp.                                   |
| `updated_by`          | UUID (FK)     | Yes      | User who last updated the record.                        |

**Indexes**: `project_number` (unique), `customer_id`, `status`, `project_manager_id`, `planned_start_date`.

### 1.2 ProjectStatusHistory

| Field              | Type          | Required | Description                                              |
|--------------------|---------------|----------|----------------------------------------------------------|
| `id`               | UUID          | Yes      | Primary key.                                             |
| `project_id`       | UUID (FK)     | Yes      | Reference to project.                                    |
| `from_status`      | Enum          | No       | Previous status (null for initial creation).              |
| `to_status`        | Enum          | Yes      | New status.                                              |
| `comment`          | Text          | No       | Optional comment or reason for transition.               |
| `is_override`      | Boolean       | Yes      | Whether preconditions were overridden.                   |
| `override_reason`  | Text          | No       | Reason for override (required if is_override = true).    |
| `changed_at`       | Timestamp     | Yes      | Timestamp of the change.                                 |
| `changed_by`       | UUID (FK)     | Yes      | User who made the change.                                |

### 1.3 PreparatoryAction

| Field                  | Type          | Required | Description                                              |
|------------------------|---------------|----------|----------------------------------------------------------|
| `id`                   | UUID          | Yes      | Primary key.                                             |
| `project_id`           | UUID (FK)     | Yes      | Reference to project.                                    |
| `action_type`          | Enum          | Yes      | FUNDING_APPLICATION, MATERIAL_ORDER, SCHEDULING, OTHER.  |
| `title`                | String(200)   | Yes      | Action title.                                            |
| `description`          | Text          | No       | Detailed description.                                    |
| `is_mandatory`         | Boolean       | Yes      | Whether action blocks project progression.               |
| `status`               | Enum          | Yes      | CREATED, IN_PROGRESS, COMPLETED, REJECTED, CANCELLED.    |
| `due_date`             | Date          | No       | Target completion date.                                  |
| `assigned_to_id`       | UUID (FK)     | No       | Person responsible.                                      |
| `external_reference`   | String(100)   | No       | External reference number.                               |
| `created_at`           | Timestamp     | Yes      | Creation timestamp.                                      |
| `created_by`           | UUID (FK)     | Yes      | User who created the record.                             |
| `updated_at`           | Timestamp     | Yes      | Last update timestamp.                                   |
| `updated_by`           | UUID (FK)     | Yes      | User who last updated the record.                        |

### 1.4 FundingApplicationDetails

| Field                    | Type          | Required | Description                                            |
|--------------------------|---------------|----------|--------------------------------------------------------|
| `id`                     | UUID          | Yes      | Primary key.                                           |
| `preparatory_action_id`  | UUID (FK)     | Yes      | Reference to PreparatoryAction (1:1).                  |
| `funding_body`           | String(200)   | Yes      | Funding body / program name.                           |
| `application_amount`     | Decimal(12,2) | No       | Applied amount in CHF.                                 |
| `approved_amount`        | Decimal(12,2) | No       | Approved amount in CHF.                                |
| `submission_date`        | Date          | No       | Date application was submitted.                        |
| `expected_decision_date` | Date          | No       | Expected decision date.                                |
| `funding_status`         | Enum          | Yes      | DRAFT, SUBMITTED, APPROVED, PARTIALLY_APPROVED, REJECTED. |

### 1.5 MaterialOrderDetails

| Field                    | Type          | Required | Description                                            |
|--------------------------|---------------|----------|--------------------------------------------------------|
| `id`                     | UUID          | Yes      | Primary key.                                           |
| `preparatory_action_id`  | UUID (FK)     | Yes      | Reference to PreparatoryAction (1:1).                  |
| `supplier`               | String(200)   | No       | Supplier name.                                         |
| `order_reference`        | String(100)   | No       | PO number or order reference.                          |
| `order_date`             | Date          | No       | Date order was placed.                                 |
| `expected_delivery_date` | Date          | No       | Expected delivery date.                                |
| `delivery_status`        | Enum          | Yes      | PENDING, ORDERED, PARTIALLY_DELIVERED, DELIVERED.      |

### 1.6 MaterialOrderItem

| Field                      | Type          | Required | Description                                          |
|----------------------------|---------------|----------|------------------------------------------------------|
| `id`                       | UUID          | Yes      | Primary key.                                         |
| `material_order_id`        | UUID (FK)     | Yes      | Reference to MaterialOrderDetails.                   |
| `catalog_item_id`          | UUID (FK)     | No       | Reference to catalog item (if from catalog).         |
| `description`              | String(300)   | Yes      | Item description.                                    |
| `quantity`                 | Decimal(10,3) | Yes      | Ordered quantity.                                    |
| `unit`                     | String(20)    | Yes      | Unit of measure (piece, meter, kg, etc.).            |

### 1.7 ConstructionScheduleEntry

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `project_id`          | UUID (FK)     | Yes      | Reference to project.                                    |
| `name`                | String(200)   | Yes      | Phase or milestone name.                                 |
| `entry_type`          | Enum          | Yes      | PHASE, MILESTONE.                                        |
| `start_date`          | Date          | Cond.    | Required for PHASE.                                      |
| `end_date`            | Date          | Cond.    | Required for PHASE.                                      |
| `milestone_date`      | Date          | Cond.    | Required for MILESTONE.                                  |
| `responsible_type`    | Enum          | Yes      | INTERNAL_TEAM, PARTNER_COMPANY.                          |
| `responsible_team_id` | UUID (FK)     | No       | Reference to internal team (if INTERNAL_TEAM).           |
| `partner_company_id`  | UUID (FK)     | No       | Reference to partner company (if PARTNER_COMPANY).       |
| `predecessor_id`      | UUID (FK)     | No       | Reference to predecessor ConstructionScheduleEntry.      |
| `status`              | Enum          | Yes      | PLANNED, IN_PROGRESS, COMPLETED, CANCELLED, WAIVED.     |
| `notes`               | Text          | No       | Additional instructions.                                 |
| `sort_order`          | Integer       | Yes      | Display order within the schedule.                       |
| `created_at`          | Timestamp     | Yes      | Creation timestamp.                                      |
| `updated_at`          | Timestamp     | Yes      | Last update timestamp.                                   |

### 1.8 PartnerAppointmentConfirmation

| Field                      | Type          | Required | Description                                          |
|----------------------------|---------------|----------|------------------------------------------------------|
| `id`                       | UUID          | Yes      | Primary key.                                         |
| `schedule_entry_id`        | UUID (FK)     | Yes      | Reference to ConstructionScheduleEntry.              |
| `partner_company_id`       | UUID (FK)     | Yes      | Reference to partner company.                        |
| `partner_contact_email`    | String(200)   | Yes      | Email address for confirmation.                      |
| `confirmation_status`      | Enum          | Yes      | DRAFT, SENT, CONFIRMED, DECLINED, ALTERNATIVE_PROPOSED. |
| `sent_at`                  | Timestamp     | No       | Timestamp when confirmation was sent.                |
| `response_at`              | Timestamp     | No       | Timestamp when partner responded.                    |
| `response_notes`           | Text          | No       | Partner's response text or proposed alternative.     |
| `document_id`              | UUID (FK)     | No       | Reference to generated confirmation document.        |
| `created_at`               | Timestamp     | Yes      | Creation timestamp.                                  |
| `updated_at`               | Timestamp     | Yes      | Last update timestamp.                               |

### 1.9 ProjectDocument

| Field              | Type          | Required | Description                                              |
|--------------------|---------------|----------|----------------------------------------------------------|
| `id`               | UUID          | Yes      | Primary key.                                             |
| `project_id`       | UUID (FK)     | Yes      | Reference to project.                                    |
| `file_name`        | String(255)   | Yes      | Original file name.                                      |
| `file_path`        | String(500)   | Yes      | Storage path (blob storage key).                         |
| `file_size_bytes`  | Long          | Yes      | File size in bytes.                                      |
| `mime_type`        | String(100)   | Yes      | MIME type.                                               |
| `category`         | Enum          | Yes      | PLANS, CONTRACTS, PHOTOS, CORRESPONDENCE, REPORTS, OTHER.|
| `description`      | Text          | No       | Optional description.                                    |
| `version`          | Integer       | Yes      | Document version number (default: 1).                    |
| `is_generated`     | Boolean       | Yes      | Whether document was system-generated.                   |
| `is_deleted`       | Boolean       | Yes      | Soft-delete flag.                                        |
| `uploaded_by`      | UUID (FK)     | Yes      | User who uploaded/generated the document.                |
| `uploaded_at`      | Timestamp     | Yes      | Upload timestamp.                                        |
| `deleted_at`       | Timestamp     | No       | Soft-delete timestamp.                                   |

---

## 2. REST API Endpoints

Base path: `/api/v1/projects`

### 2.1 Project CRUD

| Method | Endpoint                          | Description                        | Auth                    |
|--------|-----------------------------------|------------------------------------|-------------------------|
| POST   | `/api/v1/projects`                | Create a new project.              | `project:create`        |
| GET    | `/api/v1/projects`                | List projects (paginated, filtered).| `project:read`         |
| GET    | `/api/v1/projects/{id}`           | Get project details.               | `project:read`          |
| PUT    | `/api/v1/projects/{id}`           | Update a project.                  | `project:edit`          |
| DELETE | `/api/v1/projects/{id}`           | Soft-delete a project.             | `project:delete`        |
| POST   | `/api/v1/projects/{id}/duplicate` | Duplicate a project.               | `project:create`        |

**GET `/api/v1/projects` Query Parameters:**

| Parameter          | Type     | Description                                          |
|--------------------|----------|------------------------------------------------------|
| `status`           | String   | Filter by status (comma-separated for multiple).     |
| `project_type`     | String   | Filter by project type.                              |
| `customer_id`      | UUID     | Filter by customer.                                  |
| `project_manager_id`| UUID    | Filter by project manager.                           |
| `date_from`        | Date     | Planned start date >= date_from.                     |
| `date_to`          | Date     | Planned start date <= date_to.                       |
| `search`           | String   | Free-text search across name, number, customer name. |
| `include_deleted`  | Boolean  | Include soft-deleted projects (default: false).      |
| `page`             | Integer  | Page number (default: 1).                            |
| `page_size`        | Integer  | Items per page (default: 25, max: 100).              |
| `sort_by`          | String   | Sort field (name, planned_start_date, status, created_at). |
| `sort_dir`         | String   | Sort direction (asc, desc).                          |

**POST `/api/v1/projects` Request Body:**

```json
{
  "name": "Heizungsanlage Familie Mueller",
  "description": "Complete heating system replacement",
  "project_type": "RENOVATION",
  "customer_id": "uuid-customer",
  "site_id": "uuid-site",
  "project_manager_id": "uuid-manager",
  "team_id": "uuid-team",
  "planned_start_date": "2026-05-01",
  "planned_end_date": "2026-06-15",
  "estimated_budget": 45000.00,
  "currency": "CHF",
  "notes": "Customer prefers morning appointments",
  "template_id": "uuid-template"
}
```

**Response (201 Created):**

```json
{
  "id": "uuid-project",
  "project_number": "PRJ-2026-00042",
  "name": "Heizungsanlage Familie Mueller",
  "status": "DRAFT",
  "created_at": "2026-03-29T10:00:00Z",
  "...": "..."
}
```

### 2.2 Project Status

| Method | Endpoint                                    | Description                        | Auth                            |
|--------|---------------------------------------------|------------------------------------|---------------------------------|
| POST   | `/api/v1/projects/{id}/status`              | Transition project status.         | `project:status:update`         |
| GET    | `/api/v1/projects/{id}/status-history`      | Get status change history.         | `project:read`                  |

**POST `/api/v1/projects/{id}/status` Request Body:**

```json
{
  "target_status": "IN_PROGRESS",
  "comment": "All preparatory actions completed",
  "override": false,
  "override_reason": null
}
```

**Response (200 OK):**

```json
{
  "project_id": "uuid-project",
  "from_status": "PLANNING",
  "to_status": "IN_PROGRESS",
  "changed_at": "2026-03-29T14:30:00Z",
  "preconditions_met": true
}
```

**Error Response (409 Conflict - Preconditions Not Met):**

```json
{
  "error": "PRECONDITIONS_NOT_MET",
  "message": "Cannot transition to IN_PROGRESS. Outstanding mandatory preparatory actions.",
  "outstanding_actions": [
    {
      "id": "uuid-action",
      "title": "Funding application ProKlima",
      "status": "IN_PROGRESS"
    }
  ]
}
```

### 2.3 Preparatory Actions

| Method | Endpoint                                              | Description                         | Auth                           |
|--------|-------------------------------------------------------|-------------------------------------|--------------------------------|
| GET    | `/api/v1/projects/{id}/preparatory-actions`           | List preparatory actions.           | `project:read`                 |
| POST   | `/api/v1/projects/{id}/preparatory-actions`           | Create a preparatory action.        | `project:prep-actions:manage`  |
| GET    | `/api/v1/projects/{id}/preparatory-actions/{actionId}`| Get action details.                 | `project:read`                 |
| PUT    | `/api/v1/projects/{id}/preparatory-actions/{actionId}`| Update a preparatory action.        | `project:prep-actions:manage`  |
| DELETE | `/api/v1/projects/{id}/preparatory-actions/{actionId}`| Delete a preparatory action.        | `project:prep-actions:manage`  |

### 2.4 Construction Schedule

| Method | Endpoint                                                        | Description                         | Auth                       |
|--------|-----------------------------------------------------------------|-------------------------------------|----------------------------|
| GET    | `/api/v1/projects/{id}/schedule`                                | Get construction schedule.          | `project:read`             |
| POST   | `/api/v1/projects/{id}/schedule/entries`                        | Add a schedule entry.               | `project:schedule:manage`  |
| PUT    | `/api/v1/projects/{id}/schedule/entries/{entryId}`              | Update a schedule entry.            | `project:schedule:manage`  |
| DELETE | `/api/v1/projects/{id}/schedule/entries/{entryId}`              | Delete a schedule entry.            | `project:schedule:manage`  |
| POST   | `/api/v1/projects/{id}/schedule/entries/{entryId}/confirmations`| Send partner appointment confirmation.| `project:schedule:manage`|
| PUT    | `/api/v1/projects/{id}/schedule/entries/{entryId}/confirmations/{confId}` | Update confirmation response. | `project:schedule:manage` |
| GET    | `/api/v1/projects/{id}/schedule/export`                         | Export schedule as PDF/iCal.        | `project:read`             |

### 2.5 Documents

| Method | Endpoint                                          | Description                         | Auth                       |
|--------|---------------------------------------------------|-------------------------------------|----------------------------|
| GET    | `/api/v1/projects/{id}/documents`                 | List documents for a project.       | `project:documents:read`   |
| POST   | `/api/v1/projects/{id}/documents`                 | Upload a document.                  | `project:documents:write`  |
| GET    | `/api/v1/projects/{id}/documents/{docId}`         | Get document metadata.              | `project:documents:read`   |
| GET    | `/api/v1/projects/{id}/documents/{docId}/download`| Download a document file.           | `project:documents:read`   |
| PUT    | `/api/v1/projects/{id}/documents/{docId}`         | Update document metadata.           | `project:documents:write`  |
| DELETE | `/api/v1/projects/{id}/documents/{docId}`         | Soft-delete a document.             | `project:documents:delete` |
| POST   | `/api/v1/projects/{id}/documents/{docId}/restore` | Restore a soft-deleted document.    | `project:documents:delete` |
| POST   | `/api/v1/projects/{id}/documents/generate`        | Generate document from template.    | `project:documents:create` |

### 2.6 Dashboard

| Method | Endpoint                                  | Description                         | Auth               |
|--------|-------------------------------------------|-------------------------------------|---------------------|
| GET    | `/api/v1/projects/dashboard/summary`      | Get dashboard summary statistics.   | `project:read`      |
| GET    | `/api/v1/projects/dashboard/milestones`   | Get upcoming milestones.            | `project:read`      |

**GET `/api/v1/projects/dashboard/summary` Response:**

```json
{
  "total_projects": 47,
  "by_status": {
    "DRAFT": 3,
    "PLANNING": 8,
    "IN_PROGRESS": 22,
    "ON_HOLD": 4,
    "COMPLETED": 10
  },
  "overdue_projects": 2,
  "upcoming_milestones_7d": 5
}
```

---

## 3. Event Flows

The Project Management module publishes and subscribes to events via the platform message bus.

### 3.1 Published Events

| Event Name                          | Trigger                                               | Payload                                                    |
|-------------------------------------|-------------------------------------------------------|------------------------------------------------------------|
| `project.created`                   | New project created.                                  | `{ projectId, projectNumber, customerId, projectType }`    |
| `project.updated`                   | Project details updated.                              | `{ projectId, changedFields[] }`                           |
| `project.status.changed`            | Project status transitioned.                          | `{ projectId, fromStatus, toStatus, changedBy }`           |
| `project.deleted`                   | Project soft-deleted.                                 | `{ projectId, deletedBy }`                                 |
| `project.prep-action.created`       | Preparatory action created.                           | `{ projectId, actionId, actionType, assignedTo }`          |
| `project.prep-action.completed`     | Preparatory action completed.                         | `{ projectId, actionId, actionType }`                      |
| `project.prep-action.overdue`       | Preparatory action due date passed.                   | `{ projectId, actionId, dueDate, assignedTo }`             |
| `project.schedule.entry.created`    | Schedule entry added.                                 | `{ projectId, entryId, entryType, startDate, endDate }`    |
| `project.schedule.entry.updated`    | Schedule entry modified.                              | `{ projectId, entryId, changedFields[] }`                  |
| `project.schedule.confirmation.sent`| Partner appointment confirmation sent.                | `{ projectId, entryId, confirmationId, partnerCompanyId }` |
| `project.schedule.confirmation.responded` | Partner responded to confirmation.              | `{ projectId, confirmationId, confirmationStatus }`        |
| `project.document.uploaded`         | Document uploaded to project.                         | `{ projectId, documentId, fileName, category }`            |
| `project.document.generated`        | Document generated from template.                     | `{ projectId, documentId, templateType }`                  |

### 3.2 Subscribed Events

| Event Name                          | Source Module    | Action                                                     |
|-------------------------------------|------------------|-------------------------------------------------------------|
| `customer.updated`                  | MOD-02 (CRM)    | Update cached customer data on affected projects.            |
| `customer.site.updated`             | MOD-02 (CRM)    | Update cached site data on affected projects.                |
| `schedule.assignment.created`       | MOD-05           | Update project schedule with deployment details.             |
| `mobile.document.uploaded`          | MOD-06           | Store mobile-uploaded document in project repository.        |
| `mobile.report.submitted`           | MOD-06           | Update project activity log with report submission.          |

---

## 4. Integration Points

### 4.1 CRM Module (MOD-02)

- **Direction**: Project Management reads from CRM.
- **Data**: Customer records, site/location records, partner company contacts.
- **Method**: REST API calls to CRM module endpoints.
- **Caching**: Customer and site data is cached locally with a 15-minute TTL and event-based invalidation.

### 4.2 Field Deployment Planning (MOD-05)

- **Direction**: Bidirectional.
- **Data**: Construction schedule entries (phases assigned to internal teams) are pushed to deployment planning for resource assignment. Deployment assignments are referenced back in the project.
- **Method**: Events (`project.schedule.entry.created`, `schedule.assignment.created`).

### 4.3 Mobile Technician App (MOD-06)

- **Direction**: Bidirectional.
- **Data**: Project details, documents, and schedules are served to mobile. Photos and documents uploaded from mobile are stored in the project repository.
- **Method**: REST API (mobile reads project data), events (mobile uploads trigger `mobile.document.uploaded`).

### 4.4 Quotation & Invoicing (MOD-08)

- **Direction**: Project Management references quotations.
- **Data**: Quotation references linked to projects.
- **Method**: REST API calls to MOD-08 endpoints.

### 4.5 Email Service (Platform)

- **Direction**: Project Management sends to email service.
- **Data**: Partner appointment confirmations, status change notifications.
- **Method**: Platform email API.

### 4.6 PDF Generation Service (Platform)

- **Direction**: Project Management sends to PDF service.
- **Data**: Document templates with project data for rendering.
- **Method**: Platform PDF generation API.

### 4.7 File Storage Service (Platform)

- **Direction**: Project Management reads/writes to storage.
- **Data**: Project documents, generated PDFs.
- **Method**: Blob storage API (e.g., Azure Blob Storage, S3).

---

## 5. Security & Access Control

### 5.1 Permissions

| Permission                    | Description                                          |
|-------------------------------|------------------------------------------------------|
| `project:create`              | Create new projects.                                 |
| `project:read`                | View project details and listings.                   |
| `project:edit`                | Edit project metadata.                               |
| `project:delete`              | Soft-delete projects (Draft status only).            |
| `project:status:update`       | Transition project status.                           |
| `project:status:override`     | Override status transition preconditions.             |
| `project:prep-actions:manage` | Create, edit, delete preparatory actions.             |
| `project:schedule:manage`     | Create, edit, delete construction schedule entries.   |
| `project:documents:read`      | View and download project documents.                 |
| `project:documents:write`     | Upload documents to project repository.              |
| `project:documents:create`    | Generate documents from templates.                   |
| `project:documents:delete`    | Soft-delete documents.                               |

### 5.2 Data Access Rules

- Users can only see projects they are authorized to access based on their role and team assignment.
- Project managers see all projects assigned to them.
- Office administrators see all projects within their organizational scope.
- Field technicians see only projects to which they have active assignments.

---

## 6. Non-Functional Considerations

| Concern         | Approach                                                                    |
|-----------------|-----------------------------------------------------------------------------|
| Performance     | Dashboard queries target < 500ms for up to 10,000 projects. Indexed fields. |
| Scalability     | Pagination on all list endpoints. Document storage on blob service.         |
| Audit           | All create/update/delete operations are audit-logged with user and timestamp.|
| Data Retention  | Completed projects archived after configurable period (default: 2 years).   |
| Concurrency     | Optimistic locking on project and schedule records (version field).         |
