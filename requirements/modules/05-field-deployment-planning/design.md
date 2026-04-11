# Module 05: Field Deployment Planning -- Design Specification

## Document Metadata

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Module ID         | MOD-05                                     |
| Document Type     | Design Specification                       |
| Version           | 1.0                                        |
| Status            | Draft                                      |
| Last Updated      | 2026-03-29                                 |

---

## 1. Data Models

### 1.1 Assignment

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `employee_id`         | UUID (FK)     | Yes      | Reference to employee record.                           |
| `order_id`            | UUID (FK)     | No       | Reference to order (if order-based assignment).          |
| `project_id`          | UUID (FK)     | No       | Reference to project (if project-based assignment).      |
| `assignment_type`     | Enum          | Yes      | SERVICE_CALL, PROJECT_WORK, MAINTENANCE, INSTALLATION, INSPECTION, OTHER. |
| `title`               | String(200)   | No       | Optional title/summary (auto-generated if not provided). |
| `start_datetime`      | Timestamp     | Yes      | Assignment start date and time.                          |
| `end_datetime`        | Timestamp     | Yes      | Assignment end date and time.                            |
| `is_full_day`         | Boolean       | Yes      | Whether the assignment is a full-day assignment.         |
| `status`              | Enum          | Yes      | PLANNED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED.  |
| `priority`            | Enum          | Yes      | NORMAL, HIGH, URGENT.                                    |
| `instructions`        | Text          | No       | Special instructions or notes.                           |
| `customer_id`         | UUID (FK)     | No       | Reference to customer (denormalized for performance).    |
| `site_id`             | UUID (FK)     | No       | Reference to site/location.                              |
| `recurrence_group_id` | UUID          | No       | Groups recurring assignment instances.                   |
| `color_code`          | String(7)     | No       | Hex color for calendar display.                          |
| `is_customer_appointment` | Boolean   | Yes      | Whether this involves a customer-facing appointment.     |
| `created_at`          | Timestamp     | Yes      | Creation timestamp.                                      |
| `created_by`          | UUID (FK)     | Yes      | User who created the assignment.                         |
| `updated_at`          | Timestamp     | Yes      | Last update timestamp.                                   |
| `updated_by`          | UUID (FK)     | Yes      | User who last updated the record.                        |
| `version`             | Integer       | Yes      | Optimistic locking version.                              |

**Indexes**: `employee_id + start_datetime`, `order_id`, `project_id`, `status`, `start_datetime`, `recurrence_group_id`.

### 1.2 AppointmentDetails

| Field                    | Type          | Required | Description                                            |
|--------------------------|---------------|----------|--------------------------------------------------------|
| `id`                     | UUID          | Yes      | Primary key.                                           |
| `assignment_id`          | UUID (FK)     | Yes      | Reference to Assignment (1:1).                         |
| `customer_contact_name`  | String(200)   | No       | Customer contact name.                                 |
| `customer_contact_phone` | String(50)    | No       | Customer phone number.                                 |
| `customer_contact_email` | String(200)   | No       | Customer email.                                        |
| `appointment_window`     | String(100)   | No       | Human-readable time window (e.g., "morning", "08-12"). |
| `confirmation_method`    | Enum          | No       | EMAIL, SMS, PHONE.                                     |
| `confirmation_status`    | Enum          | Yes      | PENDING, SENT, CONFIRMED, RESCHEDULED, CANCELLED.      |
| `confirmation_sent_at`   | Timestamp     | No       | When confirmation was sent.                            |
| `customer_notes`         | Text          | No       | Access instructions, parking info, etc.                |
| `reminder_sent`          | Boolean       | Yes      | Whether the automated reminder was sent.               |
| `reminder_sent_at`       | Timestamp     | No       | When reminder was sent.                                |

### 1.3 RecurrencePattern

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key (same as recurrence_group_id).               |
| `frequency`           | Enum          | Yes      | DAILY, WEEKLY, BIWEEKLY, MONTHLY, CUSTOM.                |
| `interval`            | Integer       | Yes      | Every N occurrences (e.g., every 2 weeks).               |
| `days_of_week`        | String(20)    | No       | Comma-separated days (MON,WED,FRI) for WEEKLY.           |
| `end_type`            | Enum          | Yes      | NEVER, AFTER_COUNT, UNTIL_DATE.                          |
| `end_count`           | Integer       | No       | Number of occurrences (if AFTER_COUNT).                  |
| `end_date`            | Date          | No       | End date (if UNTIL_DATE).                                |
| `created_at`          | Timestamp     | Yes      | Creation timestamp.                                      |

### 1.4 ConflictRecord

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `assignment_id`       | UUID (FK)     | Yes      | The assignment that has/causes the conflict.             |
| `conflicting_with_id` | UUID (FK)     | No       | The other assignment (null for absence conflicts).       |
| `conflict_type`       | Enum          | Yes      | DOUBLE_BOOKING, ABSENCE, WORKING_HOURS, TRAVEL_TIME.    |
| `severity`            | Enum          | Yes      | HARD, SOFT.                                              |
| `description`         | String(500)   | Yes      | Human-readable conflict description.                     |
| `resolved`            | Boolean       | Yes      | Whether the conflict has been resolved.                  |
| `resolved_by`         | UUID (FK)     | No       | User who resolved or overrode the conflict.              |
| `override_reason`     | Text          | No       | Justification for overriding a conflict.                 |
| `detected_at`         | Timestamp     | Yes      | When the conflict was detected.                          |

### 1.5 CoarseAllocation (OF-Bau)

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `id`                  | UUID          | Yes      | Primary key.                                             |
| `employee_id`         | UUID (FK)     | Yes      | Reference to employee.                                   |
| `project_id`          | UUID (FK)     | Yes      | Reference to project.                                    |
| `calendar_year`       | Integer       | Yes      | Year (e.g., 2026).                                       |
| `calendar_week`       | Integer       | Yes      | ISO calendar week (1-53).                                |
| `allocation_percent`  | Integer       | Yes      | Allocation percentage (25, 50, 75, 100).                 |
| `notes`               | Text          | No       | Allocation notes.                                        |
| `created_at`          | Timestamp     | Yes      | Creation timestamp.                                      |
| `created_by`          | UUID (FK)     | Yes      | User who created the allocation.                         |
| `updated_at`          | Timestamp     | Yes      | Last update timestamp.                                   |

**Indexes**: `employee_id + calendar_year + calendar_week`, `project_id + calendar_year + calendar_week`.

**Constraint**: Sum of `allocation_percent` for a given employee + year + week must not exceed 100.

### 1.6 EmployeeAvailability (read model / cache)

| Field                 | Type          | Required | Description                                              |
|-----------------------|---------------|----------|----------------------------------------------------------|
| `employee_id`         | UUID (FK)     | Yes      | Reference to employee.                                   |
| `date`                | Date          | Yes      | The date.                                                |
| `availability_type`   | Enum          | Yes      | WORKING, VACATION, SICK, PUBLIC_HOLIDAY, COMPANY_CLOSURE, OTHER_ABSENCE. |
| `work_start`          | Time          | No       | Working day start time (if WORKING).                     |
| `work_end`            | Time          | No       | Working day end time (if WORKING).                       |
| `notes`               | String(200)   | No       | Availability notes.                                      |

**Primary Key**: Composite (`employee_id`, `date`).

---

## 2. REST API Endpoints

Base path: `/api/v1/scheduling`

### 2.1 Calendar & Assignments

| Method | Endpoint                                     | Description                            | Auth                    |
|--------|----------------------------------------------|----------------------------------------|-------------------------|
| GET    | `/api/v1/scheduling/calendar`                | Get calendar data for a date range.    | `schedule:read`         |
| POST   | `/api/v1/scheduling/assignments`             | Create a new assignment.               | `schedule:assign`       |
| GET    | `/api/v1/scheduling/assignments/{id}`        | Get assignment details.                | `schedule:read`         |
| PUT    | `/api/v1/scheduling/assignments/{id}`        | Update an assignment.                  | `schedule:assign`       |
| DELETE | `/api/v1/scheduling/assignments/{id}`        | Cancel/delete an assignment.           | `schedule:assign`       |
| POST   | `/api/v1/scheduling/assignments/{id}/move`   | Move assignment (drag-and-drop).       | `schedule:assign`       |
| POST   | `/api/v1/scheduling/assignments/{id}/resize` | Resize assignment duration.            | `schedule:assign`       |

**GET `/api/v1/scheduling/calendar` Query Parameters:**

| Parameter       | Type     | Description                                          |
|-----------------|----------|------------------------------------------------------|
| `start_date`    | Date     | Range start (required).                              |
| `end_date`      | Date     | Range end (required).                                |
| `employee_ids`  | String   | Comma-separated employee UUIDs (optional filter).    |
| `team_id`       | UUID     | Filter by team.                                      |
| `type`          | String   | Filter by assignment type.                           |
| `status`        | String   | Filter by status.                                    |
| `view`          | String   | Calendar view hint: DAY, WEEK, MONTH.                |

**Response (200 OK):**

```json
{
  "start_date": "2026-04-06",
  "end_date": "2026-04-12",
  "employees": [
    {
      "employee_id": "uuid-emp-1",
      "employee_name": "Hans Mueller",
      "team": "Team A",
      "availability": [
        { "date": "2026-04-06", "type": "WORKING", "start": "07:00", "end": "16:30" },
        { "date": "2026-04-10", "type": "PUBLIC_HOLIDAY", "note": "Karfreitag" }
      ],
      "assignments": [
        {
          "id": "uuid-assignment-1",
          "start_datetime": "2026-04-06T08:00:00",
          "end_datetime": "2026-04-06T12:00:00",
          "type": "SERVICE_CALL",
          "status": "PLANNED",
          "priority": "NORMAL",
          "title": "Heizungswartung",
          "order_id": "uuid-order",
          "customer_name": "Muster AG",
          "site_address": "Bahnhofstrasse 10, 8001 Zuerich",
          "color_code": "#4CAF50",
          "is_customer_appointment": true
        }
      ],
      "coarse_allocations": [
        {
          "project_id": "uuid-project",
          "project_name": "Umbau Schulhaus",
          "allocation_percent": 50
        }
      ]
    }
  ]
}
```

**POST `/api/v1/scheduling/assignments` Request Body:**

```json
{
  "employee_ids": ["uuid-emp-1", "uuid-emp-2"],
  "order_id": "uuid-order",
  "project_id": null,
  "assignment_type": "SERVICE_CALL",
  "start_datetime": "2026-04-07T08:00:00",
  "end_datetime": "2026-04-07T12:00:00",
  "is_full_day": false,
  "priority": "NORMAL",
  "instructions": "Customer has a dog, ring bell twice",
  "is_customer_appointment": true,
  "appointment": {
    "customer_contact_name": "Frau Mueller",
    "customer_contact_phone": "+41 44 123 45 67",
    "customer_contact_email": "mueller@example.ch",
    "appointment_window": "08:00-12:00",
    "confirmation_method": "EMAIL",
    "customer_notes": "Parking available in courtyard"
  },
  "recurrence": null
}
```

**Response (201 Created):**

```json
{
  "assignments": [
    {
      "id": "uuid-assignment-new-1",
      "employee_id": "uuid-emp-1",
      "status": "PLANNED",
      "conflicts": []
    },
    {
      "id": "uuid-assignment-new-2",
      "employee_id": "uuid-emp-2",
      "status": "PLANNED",
      "conflicts": [
        {
          "type": "TRAVEL_TIME",
          "severity": "SOFT",
          "description": "Only 30 minutes gap after previous assignment (minimum: 60 minutes)"
        }
      ]
    }
  ]
}
```

**POST `/api/v1/scheduling/assignments/{id}/move` Request Body:**

```json
{
  "new_employee_id": "uuid-emp-3",
  "new_start_datetime": "2026-04-08T09:00:00",
  "new_end_datetime": "2026-04-08T13:00:00",
  "override_conflicts": false,
  "override_reason": null
}
```

### 2.2 Appointments

| Method | Endpoint                                                         | Description                           | Auth                            |
|--------|------------------------------------------------------------------|---------------------------------------|---------------------------------|
| GET    | `/api/v1/scheduling/assignments/{id}/appointment`                | Get appointment details.              | `schedule:read`                 |
| PUT    | `/api/v1/scheduling/assignments/{id}/appointment`                | Update appointment details.           | `schedule:appointments:manage`  |
| POST   | `/api/v1/scheduling/assignments/{id}/appointment/confirm`        | Send confirmation to customer.        | `schedule:appointments:manage`  |
| POST   | `/api/v1/scheduling/assignments/{id}/appointment/cancel`         | Cancel appointment with notification. | `schedule:appointments:manage`  |
| POST   | `/api/v1/scheduling/assignments/{id}/appointment/reschedule`     | Reschedule with notification.         | `schedule:appointments:manage`  |

**POST `.../appointment/confirm` Response:**

```json
{
  "confirmation_status": "SENT",
  "sent_at": "2026-03-29T15:00:00Z",
  "method": "EMAIL",
  "recipient": "mueller@example.ch"
}
```

### 2.3 Conflict Detection

| Method | Endpoint                                                   | Description                            | Auth                |
|--------|------------------------------------------------------------|----------------------------------------|---------------------|
| POST   | `/api/v1/scheduling/conflicts/check`                       | Check for conflicts (preview).         | `schedule:read`     |
| GET    | `/api/v1/scheduling/conflicts`                              | List active unresolved conflicts.      | `schedule:read`     |
| PUT    | `/api/v1/scheduling/conflicts/{id}/resolve`                 | Mark a conflict as resolved.           | `schedule:assign`   |

**POST `/api/v1/scheduling/conflicts/check` Request Body:**

```json
{
  "employee_id": "uuid-emp-1",
  "start_datetime": "2026-04-07T08:00:00",
  "end_datetime": "2026-04-07T12:00:00",
  "exclude_assignment_id": null
}
```

**Response:**

```json
{
  "has_conflicts": true,
  "conflicts": [
    {
      "type": "DOUBLE_BOOKING",
      "severity": "SOFT",
      "description": "Overlaps with assignment 'Wartung Boiler' (08:30-10:00)",
      "conflicting_assignment_id": "uuid-existing",
      "overlap_start": "08:30",
      "overlap_end": "10:00"
    }
  ]
}
```

### 2.4 Dashboard

| Method | Endpoint                                          | Description                            | Auth                |
|--------|---------------------------------------------------|----------------------------------------|---------------------|
| GET    | `/api/v1/scheduling/dashboard/summary`            | Get dashboard summary for today.       | `schedule:read`     |
| GET    | `/api/v1/scheduling/dashboard/unassigned-orders`  | Get orders awaiting assignment.        | `schedule:read`     |
| GET    | `/api/v1/scheduling/dashboard/utilization`        | Get employee utilization data.         | `schedule:read`     |
| GET    | `/api/v1/scheduling/dashboard/alerts`             | Get active alerts.                     | `schedule:read`     |

**GET `/api/v1/scheduling/dashboard/summary` Response:**

```json
{
  "date": "2026-03-29",
  "assignments_today": {
    "total": 24,
    "planned": 8,
    "in_progress": 12,
    "completed": 4,
    "cancelled": 0
  },
  "unassigned_orders": 5,
  "active_conflicts": 2,
  "upcoming_7_days": [18, 22, 20, 19, 15, 8, 0]
}
```

### 2.5 Coarse Scheduling (OF-Bau)

| Method | Endpoint                                                  | Description                            | Auth                       |
|--------|-----------------------------------------------------------|----------------------------------------|----------------------------|
| GET    | `/api/v1/scheduling/coarse`                               | Get coarse allocation matrix.          | `schedule:coarse:manage`   |
| POST   | `/api/v1/scheduling/coarse/allocations`                   | Create a coarse allocation.            | `schedule:coarse:manage`   |
| PUT    | `/api/v1/scheduling/coarse/allocations/{id}`              | Update a coarse allocation.            | `schedule:coarse:manage`   |
| DELETE | `/api/v1/scheduling/coarse/allocations/{id}`              | Delete a coarse allocation.            | `schedule:coarse:manage`   |
| POST   | `/api/v1/scheduling/coarse/allocations/bulk`              | Bulk create/update allocations.        | `schedule:coarse:manage`   |

**GET `/api/v1/scheduling/coarse` Query Parameters:**

| Parameter       | Type     | Description                                          |
|-----------------|----------|------------------------------------------------------|
| `year`          | Integer  | Calendar year (required).                            |
| `week_from`     | Integer  | Start calendar week (required).                      |
| `week_to`       | Integer  | End calendar week (required).                        |
| `employee_ids`  | String   | Comma-separated employee UUIDs (optional).           |
| `project_id`    | UUID     | Filter by project (optional).                        |
| `view`          | String   | EMPLOYEE_CENTRIC (default) or PROJECT_CENTRIC.       |

### 2.6 Mobile Data Provision

| Method | Endpoint                                                     | Description                              | Auth               |
|--------|--------------------------------------------------------------|------------------------------------------|---------------------|
| GET    | `/api/v1/scheduling/mobile/assignments`                      | Get assignments for the authenticated employee. | `mobile:read`  |
| GET    | `/api/v1/scheduling/mobile/assignments/{id}`                 | Get full assignment details for mobile.  | `mobile:read`       |
| GET    | `/api/v1/scheduling/mobile/assignments/sync`                 | Sync assignments since last sync.        | `mobile:read`       |

**GET `/api/v1/scheduling/mobile/assignments` Query Parameters:**

| Parameter       | Type      | Description                                         |
|-----------------|-----------|-----------------------------------------------------|
| `date_from`     | Date      | Start date (default: today).                        |
| `date_to`       | Date      | End date (default: today + 7 days).                 |
| `since`         | Timestamp | Return only records modified after this timestamp.  |

---

## 3. Event Flows

### 3.1 Published Events

| Event Name                              | Trigger                                            | Payload                                                       |
|-----------------------------------------|----------------------------------------------------|---------------------------------------------------------------|
| `schedule.assignment.created`           | New assignment created.                            | `{ assignmentId, employeeId, orderId, projectId, startDatetime, endDatetime, type }` |
| `schedule.assignment.updated`           | Assignment modified.                               | `{ assignmentId, employeeId, changedFields[] }`               |
| `schedule.assignment.moved`             | Assignment rescheduled (drag-and-drop or edit).    | `{ assignmentId, oldEmployeeId, newEmployeeId, oldStart, newStart }` |
| `schedule.assignment.cancelled`         | Assignment cancelled.                              | `{ assignmentId, employeeId, reason }`                        |
| `schedule.appointment.confirmed`        | Confirmation sent to customer.                     | `{ assignmentId, method, recipientEmail }`                    |
| `schedule.appointment.cancelled`        | Appointment cancelled.                             | `{ assignmentId, reason }`                                    |
| `schedule.appointment.rescheduled`      | Appointment rescheduled.                           | `{ assignmentId, oldDatetime, newDatetime }`                  |
| `schedule.appointment.reminder`         | Automated reminder sent to customer.               | `{ assignmentId, reminderType }`                              |
| `schedule.conflict.detected`            | New conflict detected.                             | `{ conflictId, assignmentId, conflictType, severity }`        |
| `schedule.coarse.allocation.changed`    | Coarse allocation created/updated/deleted.         | `{ employeeId, projectId, year, week, allocationPercent }`    |

### 3.2 Subscribed Events

| Event Name                            | Source Module     | Action                                                      |
|---------------------------------------|-------------------|--------------------------------------------------------------|
| `project.created`                     | MOD-04            | Make project available for assignment reference.              |
| `project.status.changed`              | MOD-04            | Update assignment validity (e.g., cancel if project archived).|
| `project.schedule.entry.created`      | MOD-04            | Create corresponding assignment suggestions.                 |
| `employee.absence.created`            | HR System         | Update availability; re-check conflicts for affected dates.  |
| `employee.absence.cancelled`          | HR System         | Update availability; clear related absence conflicts.        |
| `order.created`                       | MOD-08            | Add to unassigned orders queue.                              |
| `order.cancelled`                     | MOD-08            | Cancel related assignments.                                  |
| `mobile.assignment.status.updated`    | MOD-06            | Update assignment status (e.g., in_progress, completed).     |

---

## 4. Integration Points

### 4.1 Employee Master Data / HR System

- **Direction**: Deployment Planning reads from HR.
- **Data**: Employee records (name, skills, certifications, team membership), absence records (vacation, sick leave), working hour configurations.
- **Method**: REST API or database view. Cached locally with event-based invalidation.
- **Sync**: Employee availability is rebuilt nightly and updated in real-time via absence events.

### 4.2 Project Management (MOD-04)

- **Direction**: Bidirectional.
- **Data**: Project references for assignment context. Construction schedule entries generate suggested assignments.
- **Method**: Events + REST API for project lookups.

### 4.3 Mobile Technician App (MOD-06)

- **Direction**: Deployment Planning pushes to Mobile.
- **Data**: Assignment details, customer/site info, instructions.
- **Method**: REST API (mobile pull) + Push notifications (server push via APNS/FCM).
- **Real-time**: WebSocket connection for live assignment updates (optional enhancement).

### 4.4 Order Management (MOD-08)

- **Direction**: Orders feed into scheduling.
- **Data**: New orders requiring technician assignment appear in the unassigned queue.
- **Method**: Events (`order.created`, `order.cancelled`).

### 4.5 CRM Module (MOD-02)

- **Direction**: Deployment Planning reads from CRM.
- **Data**: Customer contact info, site addresses for appointment management.
- **Method**: REST API.

### 4.6 Notification Service (Platform)

- **Direction**: Deployment Planning sends to notification service.
- **Data**: Push notifications, email confirmations, SMS messages.
- **Method**: Platform notification API.

---

## 5. Security & Access Control

### 5.1 Permissions

| Permission                        | Description                                              |
|-----------------------------------|----------------------------------------------------------|
| `schedule:read`                   | View calendar, assignments, dashboard.                   |
| `schedule:assign`                 | Create, edit, delete, move assignments.                  |
| `schedule:appointments:manage`    | Manage customer appointments (confirm, cancel, reschedule). |
| `schedule:coarse:manage`          | Manage coarse OF-Bau allocations.                        |
| `schedule:conflict:override`      | Override soft conflicts with justification.              |
| `mobile:read`                     | Access own assignments via mobile API.                   |

### 5.2 Data Access Rules

- Dispatchers see all employees and assignments within their organizational scope.
- Team leads see assignments for their team members.
- Technicians see only their own assignments (via mobile API).
- Assignment modification is restricted to dispatchers and authorized team leads.

---

## 6. Non-Functional Considerations

| Concern            | Approach                                                                     |
|--------------------|------------------------------------------------------------------------------|
| Performance        | Calendar query < 1s for 50 employees x 4-week range. Indexed on employee + date. |
| Real-time Updates  | Calendar auto-refreshes every 60 seconds or via WebSocket for instant updates. |
| Concurrency        | Optimistic locking on assignment records to prevent concurrent edit conflicts. |
| Scalability        | Calendar data is date-range scoped; no full-table scans.                     |
| Audit              | All assignment changes logged with user, timestamp, and previous values.     |
| Undo               | Drag-and-drop undo stores previous state for 30 seconds client-side.         |
| Printing           | Print-optimized CSS for calendar views (day and week).                       |
