# Module 04: Project Management -- Detailed Requirements

## Document Metadata

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Module ID         | MOD-04                                     |
| Document Type     | Requirements Specification                 |
| Version           | 1.0                                        |
| Status            | Draft                                      |
| Last Updated      | 2026-03-29                                 |

---

## PROJ-001: Project Creation & Management

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | PROJ-001                                                                                          |
| **Title**        | Project Creation & Management                                                                     |
| **Priority**     | High                                                                                              |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `project`, `crud`, `core`, `web`                                                                  |

### Description

The system must allow authorized users to create, view, edit, and delete (soft-delete) projects. A project represents a discrete body of work such as a heating system installation, building renovation, or maintenance contract. Each project captures essential metadata including customer association, site reference, project type, responsible manager, planned dates, budget information, and descriptive details.

### Actors

- **Project Manager** (primary): Creates and manages projects.
- **Office Administrator**: Assists with project data entry and maintenance.
- **System Administrator**: Configures project types, numbering schemes, and templates.

### Preconditions

1. The user is authenticated and has the `project:create` or `project:edit` permission.
2. At least one customer record exists in the CRM module (MOD-02) for association.
3. Project types and templates have been configured by a system administrator.

### Main Flow

1. User navigates to the Project Management section and selects "New Project."
2. System presents the project creation form with the following sections:
   - **General Information**: Project number (auto-generated), project name, description, project type (e.g., New Installation, Renovation, Maintenance, Service Contract).
   - **Customer & Site**: Customer selection (from CRM), site/location selection.
   - **Dates**: Planned start date, planned end date, actual start date, actual end date.
   - **Responsibility**: Project manager assignment, team assignment.
   - **Budget**: Estimated budget, currency (CHF default).
   - **Notes**: Free-text notes field.
3. User fills in required fields and submits the form.
4. System validates all inputs:
   - Project name is non-empty and unique within the customer context.
   - Customer reference is valid.
   - Planned end date is after planned start date.
5. System generates a unique project number using the configured numbering scheme (e.g., `PRJ-2026-00042`).
6. System creates the project record with initial status "Draft."
7. System displays the newly created project detail view.

### Alternate Flows

- **AF-1: Create from Template**: User selects a project template in step 2. System pre-fills fields from the template, including default preparatory actions. User adjusts as needed.
- **AF-2: Duplicate Existing Project**: User opens an existing project and selects "Duplicate." System creates a new project with copied metadata (except dates and project number).
- **AF-3: Validation Failure**: If validation fails in step 4, system highlights invalid fields with error messages. User corrects and resubmits.
- **AF-4: Edit Project**: User opens an existing project, modifies fields, and saves. System validates and updates the record. Changes are audit-logged.
- **AF-5: Soft-Delete Project**: User selects "Delete" on a project in Draft status. System marks the project as deleted (soft-delete). Projects in other statuses cannot be deleted -- only archived.

### Postconditions

1. A new project record exists in the system with a unique project number.
2. The project is associated with a customer and optionally a site.
3. The project appears in the project dashboard and is searchable.
4. An audit log entry records the creation event.

### Acceptance Criteria

1. **AC-1**: A user with `project:create` permission can create a project with all required fields and receive a unique auto-generated project number.
2. **AC-2**: A user without `project:create` permission is denied access to the creation form.
3. **AC-3**: The system rejects project creation when required fields (name, customer) are missing, displaying specific field-level error messages.
4. **AC-4**: A project can be created from a template, and all template fields are correctly pre-filled.
5. **AC-5**: Editing a project updates the record and creates an audit log entry with the changed fields.
6. **AC-6**: Soft-deleted projects do not appear in default project listings but can be found via an "Include Deleted" filter.
7. **AC-7**: Projects with status other than "Draft" cannot be deleted, only archived.

### Dependencies

- MOD-02 (CRM): Customer and site records for association.
- Platform: Audit logging service.
- Platform: Auto-numbering service.

---

## PROJ-002: Project Status Tracking

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | PROJ-002                                                                                          |
| **Title**        | Project Status Tracking                                                                           |
| **Priority**     | High                                                                                              |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `project`, `status`, `workflow`, `lifecycle`, `web`                                               |

### Description

The system must support a configurable project lifecycle with defined statuses and valid transitions. Each project progresses through a sequence of statuses from creation to completion/archival. Status transitions may have conditions (e.g., all preparatory actions complete before moving to "In Progress") and trigger side effects (e.g., notifications).

### Actors

- **Project Manager** (primary): Transitions project status.
- **System**: Enforces transition rules and triggers automated actions on status change.

### Preconditions

1. A project exists in the system.
2. The user has `project:status:update` permission.
3. Status workflow has been configured by the system administrator.

### Main Flow

1. User opens a project detail view.
2. System displays the current status with available transition actions (e.g., "Start Project," "Put On Hold," "Complete").
3. User selects a status transition action.
4. System checks transition preconditions:
   - For "Draft -> Planning": No preconditions.
   - For "Planning -> In Progress": All mandatory preparatory actions (PROJ-003) must be marked complete.
   - For "In Progress -> Completed": All construction schedule milestones (PROJ-004) must be finished or explicitly waived.
   - For any status -> "On Hold": A reason must be provided.
5. If preconditions are met, system updates the project status.
6. System records the transition in the project history with timestamp, user, and optional comment.
7. System triggers configured notifications (e.g., email to project team on status change).

### Alternate Flows

- **AF-1: Precondition Not Met**: System displays which preconditions are unmet. User can either fulfill them or (if authorized) override with a justification comment.
- **AF-2: Reopen Completed Project**: An authorized user can transition a "Completed" project back to "In Progress" with a mandatory reason.
- **AF-3: Archive**: A completed project is automatically archived after the configured retention period, or manually archived by a project manager.

### Postconditions

1. The project status is updated in the database.
2. A status history entry is created with timestamp, user, previous status, new status, and optional comment.
3. Configured notifications are dispatched.

### Acceptance Criteria

1. **AC-1**: The project detail view shows only valid transition actions based on the current status.
2. **AC-2**: Transitioning from "Planning" to "In Progress" is blocked when mandatory preparatory actions are incomplete, and the system lists the outstanding actions.
3. **AC-3**: Every status transition creates a history entry viewable in the project's status history tab.
4. **AC-4**: "On Hold" transitions require a reason; the system rejects the transition if no reason is provided.
5. **AC-5**: Status transitions can be overridden by users with `project:status:override` permission, with the override reason logged.
6. **AC-6**: Notifications are sent to configured recipients on each status change within 60 seconds.

### Dependencies

- PROJ-001: Project must exist.
- PROJ-003: Preparatory actions are checked as preconditions.
- PROJ-004: Construction milestones are checked as preconditions.
- Platform: Notification service.

---

## PROJ-003: Preparatory Actions Management

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | PROJ-003                                                                                          |
| **Title**        | Preparatory Actions Management                                                                    |
| **Priority**     | High                                                                                              |
| **Complexity**   | High                                                                                              |
| **Tags**         | `project`, `preparation`, `funding`, `materials`, `scheduling`, `workflow`, `web`                 |

### Description

The system must support tracking and managing preparatory actions that must be completed before a project can proceed to the active/construction phase. Preparatory actions include funding applications (Foerderantraege), material orders, and scheduling coordination. Each action has its own lifecycle (created, in progress, completed, rejected/cancelled) and can be marked as mandatory or optional for project progression.

### Actors

- **Project Manager** (primary): Creates and manages preparatory actions.
- **Office Administrator**: Processes funding applications, places material orders.
- **System**: Enforces mandatory action completion before project status transition.

### Preconditions

1. A project exists in status "Draft" or "Planning."
2. The user has `project:prep-actions:manage` permission.

### Main Flow

1. User opens the project detail view and navigates to the "Preparatory Actions" tab.
2. System displays a list of existing preparatory actions with their statuses.
3. User selects "Add Preparatory Action."
4. System presents a form with:
   - **Action Type**: Funding Application, Material Order, Scheduling, Other.
   - **Title**: Descriptive name.
   - **Description**: Detailed description of the action.
   - **Mandatory**: Boolean flag (mandatory actions block project progression).
   - **Due Date**: Target completion date.
   - **Assigned To**: Person responsible.
   - **Reference**: Optional external reference number (e.g., funding application number).
   - **Attachments**: Supporting documents.
5. User fills in the form and saves.
6. System creates the preparatory action record linked to the project.
7. System sends a notification to the assigned person.

**Funding Application Sub-Flow**:
1. When action type is "Funding Application," additional fields are shown:
   - Funding body / program name.
   - Application amount (CHF).
   - Submission date.
   - Expected decision date.
   - Status: Draft, Submitted, Approved, Partially Approved, Rejected.
2. When the funding decision is received, user updates the status and records the approved amount.

**Material Order Sub-Flow**:
1. When action type is "Material Order," additional fields are shown:
   - Supplier.
   - Material list (items from catalog or free-text).
   - Order date.
   - Expected delivery date.
   - Order reference / PO number.
   - Status: Pending, Ordered, Partially Delivered, Delivered.

### Alternate Flows

- **AF-1: Create from Template**: Project template includes default preparatory actions. These are auto-created when the project is created from template.
- **AF-2: Mark Complete**: User updates the action status to "Completed." If all mandatory actions are now complete, system shows a notification that the project can proceed.
- **AF-3: Action Rejected/Cancelled**: User marks a mandatory action as "Rejected" or "Cancelled." System warns that this will block project progression unless the action is replaced or its mandatory flag is removed.
- **AF-4: Overdue Notification**: When a preparatory action's due date passes without completion, system sends an overdue notification to the assigned person and project manager.

### Postconditions

1. Preparatory action records are linked to the project.
2. Mandatory action statuses are evaluated during project status transitions.
3. Assigned persons receive notifications for new and overdue actions.

### Acceptance Criteria

1. **AC-1**: A preparatory action can be created with all specified fields and is linked to the correct project.
2. **AC-2**: Funding application actions display additional fields (funding body, amount, decision status).
3. **AC-3**: Material order actions display additional fields (supplier, material list, delivery status).
4. **AC-4**: A project cannot transition from "Planning" to "In Progress" when any mandatory preparatory action is not in "Completed" status.
5. **AC-5**: An overdue notification is sent when a preparatory action's due date passes and status is not "Completed."
6. **AC-6**: Preparatory actions can be edited and their history is tracked.
7. **AC-7**: The preparatory actions tab shows a summary count (e.g., "3/5 completed") and visual progress indicator.

### Dependencies

- PROJ-001: Project must exist.
- PROJ-002: Preparatory actions gate status transitions.
- MOD-07 / Material Catalog: Material items referenced in material orders.
- Platform: Notification service.

---

## PROJ-004: Construction Schedule Management

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | PROJ-004                                                                                          |
| **Title**        | Construction Schedule Management                                                                  |
| **Priority**     | High                                                                                              |
| **Complexity**   | High                                                                                              |
| **Tags**         | `project`, `schedule`, `construction`, `partner`, `appointments`, `web`                           |

### Description

The system must support creating and managing construction site schedules (Bauplaene) for projects. A construction schedule defines the sequence of work phases, milestones, and appointments for a project. A key feature is the ability to send appointment confirmations to partner/subcontractor companies and track their responses. The schedule integrates with the Field Deployment Planning module (MOD-05) for resource assignment.

### Actors

- **Project Manager** (primary): Creates and manages the construction schedule.
- **Office Administrator**: Sends appointment confirmations to partners.
- **Partner Company** (external): Receives appointment confirmations and responds.
- **Dispatcher**: Coordinates with the schedule for deployment planning.

### Preconditions

1. A project exists in status "Planning" or "In Progress."
2. The user has `project:schedule:manage` permission.
3. Partner company contacts are available in the system (CRM or partner directory).

### Main Flow

1. User opens the project detail view and navigates to the "Construction Schedule" tab.
2. System displays the current schedule as a Gantt-style timeline or list view.
3. User selects "Add Phase / Milestone."
4. System presents a form with:
   - **Phase/Milestone Name**: e.g., "Demolition," "Plumbing Rough-In," "Heating Installation."
   - **Type**: Phase (has duration) or Milestone (point in time).
   - **Start Date** and **End Date** (for phases) or **Date** (for milestones).
   - **Responsible Party**: Internal team or partner company.
   - **Predecessor**: Optional dependency on another phase/milestone.
   - **Notes**: Additional instructions or context.
5. User saves the entry.
6. System adds the entry to the schedule and recalculates dependent dates if predecessors shift.

**Partner Appointment Confirmation Sub-Flow**:
1. User selects a schedule entry assigned to a partner company.
2. User selects "Send Appointment Confirmation."
3. System generates a confirmation document from a template, including:
   - Project reference and site address.
   - Scheduled date(s) and expected duration.
   - Scope of work description.
   - Contact person.
4. System sends the confirmation via email (and optionally generates a PDF).
5. System records the confirmation as "Sent" with a timestamp.
6. Partner company responds (confirmed, declined, proposed alternative).
7. User records the partner's response in the system.
8. If declined or alternative proposed, user adjusts the schedule accordingly.

### Alternate Flows

- **AF-1: Drag-and-Drop Rescheduling**: User drags a phase on the Gantt chart to a new date range. System recalculates dependent phases and highlights conflicts.
- **AF-2: Bulk Confirmation**: User selects multiple partner appointments and sends confirmations in batch.
- **AF-3: Schedule Conflict**: When a schedule change creates a conflict (overlapping partner assignments, resource unavailability), system warns the user and suggests alternatives.
- **AF-4: Schedule Export**: User exports the construction schedule as PDF or iCal for sharing.

### Postconditions

1. The construction schedule is saved and visible in the project detail view.
2. Partner appointment confirmations are recorded with sent/response status.
3. Schedule changes are reflected in dependent phases and the deployment planning module.

### Acceptance Criteria

1. **AC-1**: A construction schedule can be created with phases and milestones, displayed as a timeline or list.
2. **AC-2**: Phases can have predecessor dependencies, and moving a predecessor automatically adjusts dependent dates.
3. **AC-3**: An appointment confirmation email can be sent to a partner company with a generated PDF document.
4. **AC-4**: The partner's response (confirmed/declined/alternative) can be recorded and is visible in the schedule.
5. **AC-5**: Confirmations must be sendable at least 5 business days before the scheduled date (configurable threshold); the system warns if the threshold is not met.
6. **AC-6**: Schedule entries assigned to internal teams are visible in the Field Deployment Planning module (MOD-05).
7. **AC-7**: The schedule can be exported as PDF.

### Dependencies

- PROJ-001: Project must exist.
- MOD-05 (Deployment Planning): Schedule feeds into resource deployment.
- MOD-02 (CRM) / Partner Directory: Partner company contacts.
- Platform: Email service for sending confirmations.
- Platform: PDF generation service.

---

## PROJ-005: Project Document Creation

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | PROJ-005                                                                                          |
| **Title**        | Project Document Creation                                                                         |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `project`, `documents`, `templates`, `generation`, `web`                                          |

### Description

The system must allow users to create project-related documents from predefined templates. Documents include appointment confirmations, project status reports, handover protocols, completion certificates, and other project correspondence. Generated documents are automatically stored in the project's document repository (PROJ-006).

### Actors

- **Project Manager** (primary): Initiates document creation.
- **Office Administrator**: Creates and manages project correspondence.
- **System Administrator**: Configures document templates.

### Preconditions

1. A project exists in the system.
2. Document templates have been configured.
3. The user has `project:documents:create` permission.

### Main Flow

1. User opens the project detail view and selects "Create Document."
2. System displays available document templates filtered by project type and context.
3. User selects a template (e.g., "Appointment Confirmation," "Status Report," "Completion Certificate").
4. System pre-fills template variables from project data:
   - Project number, name, and description.
   - Customer name and address.
   - Site address.
   - Project manager name and contact.
   - Relevant dates.
   - Schedule milestones (if applicable).
5. User reviews and edits the generated document content.
6. User finalizes the document.
7. System generates the document in PDF format.
8. System stores the document in the project's document repository (PROJ-006) with metadata (type, creation date, author).
9. Optionally, user can send the document via email directly from the system.

### Alternate Flows

- **AF-1: Edit Template Variables**: User modifies pre-filled variables or adds custom content before generation.
- **AF-2: Save as Draft**: User saves the document as draft for later completion.
- **AF-3: Regenerate**: User regenerates a document after project data changes.

### Postconditions

1. A document is generated and stored in the project's document repository.
2. The document is available for download and sharing.
3. Document creation is recorded in the project activity log.

### Acceptance Criteria

1. **AC-1**: A document can be created from a template with project data auto-populated.
2. **AC-2**: The generated document is saved as PDF in the project's document repository.
3. **AC-3**: At least the following template types are supported: Appointment Confirmation, Status Report, Completion Certificate.
4. **AC-4**: The user can edit pre-filled content before finalizing.
5. **AC-5**: Documents can be sent via email directly from the system.
6. **AC-6**: Document creation is logged in the project activity log with author and timestamp.

### Dependencies

- PROJ-001: Project must exist.
- PROJ-006: Documents are stored in the project repository.
- Platform: PDF generation service.
- Platform: Email service.

---

## PROJ-006: Document Repository per Project

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | PROJ-006                                                                                          |
| **Title**        | Document Repository per Project                                                                   |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Low                                                                                               |
| **Tags**         | `project`, `documents`, `storage`, `repository`, `web`, `mobile`                                  |

### Description

Each project must have a dedicated document repository for storing, organizing, and retrieving all project-related documents. This includes system-generated documents (from PROJ-005), uploaded files (plans, contracts, photos, correspondence), and documents synced from the mobile app (MOD-06). The repository supports categorization, search, and access control.

### Actors

- **Project Manager** (primary): Manages the document repository.
- **Office Administrator**: Uploads and organizes documents.
- **Field Technician**: Uploads photos/documents from mobile; views documents.

### Preconditions

1. A project exists in the system.
2. The user has `project:documents:read` or `project:documents:write` permission.

### Main Flow

1. User opens the project detail view and navigates to the "Documents" tab.
2. System displays a categorized list of documents with:
   - File name.
   - Category (e.g., Plans, Contracts, Photos, Correspondence, Reports, Other).
   - Upload date.
   - Uploaded by.
   - File size and type.
3. **Upload**: User drags and drops files or uses a file picker to upload documents.
4. System prompts for category assignment and optional description.
5. System uploads and stores the file, linking it to the project.
6. **Download**: User selects a document and downloads it.
7. **Search**: User searches documents by name, category, or date range.

### Alternate Flows

- **AF-1: Bulk Upload**: User uploads multiple files at once. System prompts for a common category or individual categorization.
- **AF-2: Delete Document**: User with `project:documents:delete` permission removes a document. System soft-deletes with the option to restore within 30 days.
- **AF-3: Mobile Upload**: Field technician uploads a document or photo via the mobile app. System receives and stores it in the project repository with mobile-provided metadata.
- **AF-4: Version Control**: If a document with the same name exists, system prompts to replace (creating a version) or rename.

### Postconditions

1. Documents are stored securely and linked to the project.
2. Documents are accessible to authorized users via web and mobile.
3. Upload and deletion actions are logged.

### Acceptance Criteria

1. **AC-1**: Documents can be uploaded to a project with category assignment.
2. **AC-2**: Documents are listed with name, category, date, uploader, and file size.
3. **AC-3**: Documents can be searched by name, category, and date range.
4. **AC-4**: Documents can be downloaded by authorized users.
5. **AC-5**: Documents uploaded from the mobile app appear in the project repository.
6. **AC-6**: Deleted documents are soft-deleted and restorable within 30 days.
7. **AC-7**: Access to documents respects project-level permissions.
8. **AC-8**: Maximum file size per upload is configurable (default: 50 MB).

### Dependencies

- PROJ-001: Project must exist.
- MOD-06 (Mobile App): Mobile document/photo uploads.
- Platform: File storage service (e.g., Azure Blob, S3).
- Platform: Access control service.

---

## PROJ-007: Project Dashboard & Overview

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | PROJ-007                                                                                          |
| **Title**        | Project Dashboard & Overview                                                                      |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `project`, `dashboard`, `overview`, `reporting`, `web`                                            |

### Description

The system must provide a project dashboard that gives users a consolidated overview of all projects. The dashboard displays key metrics, status distributions, upcoming milestones, and allows filtering and sorting. It serves as the primary entry point for the Project Management module.

### Actors

- **Project Manager** (primary): Uses dashboard for daily project oversight.
- **Office Administrator**: Views project statuses for administrative tasks.
- **Management**: Reviews high-level project portfolio status.

### Preconditions

1. The user is authenticated and has `project:read` permission.
2. At least one project exists in the system.

### Main Flow

1. User navigates to the Project Management section.
2. System displays the project dashboard with:
   - **Summary Cards**: Total projects, projects by status (Draft, Planning, In Progress, On Hold, Completed), overdue projects.
   - **Project List**: Table/grid of projects with columns for project number, name, customer, status, project manager, planned dates, progress indicator.
   - **Filters**: Status, project type, project manager, customer, date range.
   - **Sort**: By name, date, status, customer.
   - **Search**: Free-text search across project fields.
3. User applies filters to narrow the view (e.g., "In Progress" projects for a specific customer).
4. User clicks on a project to navigate to its detail view.

### Alternate Flows

- **AF-1: Export List**: User exports the filtered project list as CSV or PDF.
- **AF-2: Quick Status Update**: User changes a project's status directly from the dashboard via a dropdown (subject to transition rules from PROJ-002).
- **AF-3: Upcoming Milestones Widget**: Dashboard includes a widget showing milestones due in the next 7/14/30 days across all projects.
- **AF-4: My Projects View**: User toggles to see only projects assigned to them.

### Postconditions

1. The dashboard displays accurate, real-time project data.
2. Applied filters and sort preferences are retained for the user's session (optionally persisted).

### Acceptance Criteria

1. **AC-1**: The dashboard displays summary cards with correct counts per status.
2. **AC-2**: The project list is filterable by status, type, project manager, customer, and date range.
3. **AC-3**: The project list is sortable by name, date, status, and customer.
4. **AC-4**: Free-text search returns projects matching the query across project number, name, and customer name.
5. **AC-5**: Clicking a project navigates to its detail view.
6. **AC-6**: The "My Projects" toggle shows only projects assigned to the current user.
7. **AC-7**: The project list can be exported as CSV.
8. **AC-8**: Dashboard data refreshes automatically or provides a manual refresh option.

### Dependencies

- PROJ-001: Project records provide the data.
- PROJ-002: Status data for filtering and summary cards.
- PROJ-004: Milestone data for the upcoming milestones widget.
