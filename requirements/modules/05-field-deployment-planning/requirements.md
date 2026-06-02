# Module 05: Field Deployment Planning -- Detailed Requirements

## Document Metadata

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Module ID         | MOD-05                                     |
| Document Type     | Requirements Specification                 |
| Version           | 1.0                                        |
| Status            | Draft                                      |
| Last Updated      | 2026-03-29                                 |

---

## SCHED-001: Calendar-Based Deployment Planning

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | SCHED-001                                                                                         |
| **Title**        | Calendar-Based Deployment Planning                                                                |
| **Priority**     | High                                                                                              |
| **Complexity**   | High                                                                                              |
| **Tags**         | `scheduling`, `calendar`, `deployment`, `planning`, `core`, `web`                                 |

### Description

The system must provide an interactive, calendar-based interface for planning field staff deployment. The calendar supports day, week, and month views, displaying assignments color-coded by type (service call, project work, maintenance), status, or employee. The calendar is the primary tool for dispatchers to visualize and manage the field workforce schedule.

### Actors

- **Dispatcher / Planner** (primary): Uses the calendar to plan and adjust field deployments.
- **Project Manager**: Views and coordinates project-related scheduling.
- **Team Lead**: Views team schedules.

### Preconditions

1. The user is authenticated and has `schedule:read` or `schedule:write` permission.
2. Employee records with availability data are accessible.
3. Working hours and company holiday calendars are configured.

### Main Flow

1. User navigates to the Deployment Planning section.
2. System displays the deployment calendar in the default view (configurable: day, week, or month).
3. Calendar shows:
   - **Rows**: One row per employee (or grouped by team).
   - **Columns**: Time slots (hours for day view, days for week/month view).
   - **Blocks**: Color-coded assignment blocks with summary text (order number, customer name, location).
   - **Indicators**: Availability markers, vacation/absence periods (greyed out), public holidays.
4. User can switch between day, week, and month views using view controls.
5. User can filter by:
   - Team or department.
   - Employee.
   - Assignment type (service, project, maintenance).
   - Status (planned, confirmed, in progress, completed).
6. Hovering over an assignment block shows a tooltip with details (order number, customer, address, time, status).
7. Clicking an assignment block opens the assignment detail view or edit form.

### Alternate Flows

- **AF-1: Create Assignment from Calendar**: User clicks on an empty time slot for an employee. System opens the assignment creation form pre-filled with the employee and date/time. (See SCHED-002.)
- **AF-2: Today Navigation**: User clicks "Today" to snap the calendar to the current date.
- **AF-3: Print View**: User prints the current calendar view with a print-optimized layout.
- **AF-4: Team Grouping**: User toggles between individual employee rows and team-grouped views.

### Postconditions

1. The calendar displays accurate, up-to-date assignment data.
2. User's view preferences (default view, filters) are persisted.

### Acceptance Criteria

1. **AC-1**: The calendar renders day, week, and month views correctly with employee rows and time columns.
2. **AC-2**: Assignments are displayed as color-coded blocks with readable summary text.
3. **AC-3**: Employee absences and public holidays are visually distinguished (e.g., greyed-out slots).
4. **AC-4**: Filters by team, employee, assignment type, and status correctly reduce the displayed data.
5. **AC-5**: Hovering over an assignment shows a tooltip with order number, customer, address, time, and status.
6. **AC-6**: The calendar loads and renders within 3 seconds for up to 50 employees and 500 assignments in the visible range.
7. **AC-7**: The calendar view can be printed with a clean, readable layout.

### Dependencies

- SCHED-002: Assignment data to display.
- Employee Master Data: Employee records, availability, team membership.
- Company Calendar: Working hours, public holidays, company closures.

---

## SCHED-002: Employee Assignment to Orders/Projects

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | SCHED-002                                                                                         |
| **Title**        | Employee Assignment to Orders/Projects                                                            |
| **Priority**     | High                                                                                              |
| **Complexity**   | High                                                                                              |
| **Tags**         | `scheduling`, `assignment`, `employees`, `orders`, `projects`, `web`                              |

### Description

The system must allow dispatchers to assign one or more employees to orders, projects, or service assignments. Each assignment specifies the employee, time window, order/project reference, assignment type, and any special instructions. The system checks employee availability, skills, and potential conflicts before confirming the assignment.

### Actors

- **Dispatcher / Planner** (primary): Creates and modifies assignments.
- **Project Manager**: Requests assignments for project work.
- **System**: Validates availability and detects conflicts.

### Preconditions

1. The user has `schedule:assign` permission.
2. The order/project/service assignment exists in the system.
3. Employee records with availability and skill data are accessible.

### Main Flow

1. User initiates assignment creation (from calendar click, order detail, or assignment form).
2. System presents the assignment form with:
   - **Employee Selection**: Dropdown or search with availability indicators. Multi-select for team assignments.
   - **Order/Project Reference**: Search and select the order, project, or service assignment.
   - **Date & Time**: Start date/time, end date/time, or full-day flag.
   - **Assignment Type**: Service Call, Project Work, Maintenance, Installation, Inspection, Other.
   - **Priority**: Normal, High, Urgent.
   - **Instructions**: Free-text field for special instructions or notes.
   - **Recurrence**: Optional recurrence pattern (daily, weekly, custom) for recurring assignments.
3. User selects employees and fills in assignment details.
4. System performs validation:
   - Employee is available during the specified time (not on leave, not already assigned).
   - Employee has the required skills/certifications for the assignment type (if configured).
   - No scheduling conflicts exist (see SCHED-007).
5. If validation passes, system creates the assignment.
6. System sends a notification to the assigned employee(s) (push notification via MOD-06, email, or both).
7. Assignment appears on the deployment calendar.

### Alternate Flows

- **AF-1: Conflict Detected**: System warns of a conflict (see SCHED-007). User can resolve by choosing a different time, different employee, or overriding with justification.
- **AF-2: Skill Mismatch Warning**: System warns if the employee lacks a recommended skill. User can proceed with acknowledgment.
- **AF-3: Multi-Employee Assignment**: User assigns multiple employees to the same order/time. System creates individual assignment records linked to the same order.
- **AF-4: Assignment from Order Context**: User navigates from an order detail view and selects "Assign Technician." System pre-fills the order reference.
- **AF-5: Recurring Assignment**: User sets a recurrence pattern. System generates individual assignment instances for each occurrence.

### Postconditions

1. Assignment records are created and linked to the employee(s) and order/project.
2. Assigned employees are notified.
3. The calendar reflects the new assignment(s).
4. The order/project shows the assignment in its detail view.

### Acceptance Criteria

1. **AC-1**: An assignment can be created with employee, order reference, date/time, type, and instructions.
2. **AC-2**: Multiple employees can be assigned to the same order simultaneously.
3. **AC-3**: The system checks employee availability and warns of conflicts before confirming.
4. **AC-4**: A notification is sent to the assigned employee within 30 seconds of assignment creation.
5. **AC-5**: The assignment appears on the deployment calendar immediately after creation.
6. **AC-6**: Recurring assignments generate correct individual instances based on the recurrence pattern.
7. **AC-7**: Assignments can be edited (time, employee, details) and deleted by authorized users.
8. **AC-8**: Employee skill/certification warnings are displayed but do not block assignment (soft validation).

### Dependencies

- SCHED-001: Calendar displays assignments.
- SCHED-007: Conflict detection.
- MOD-04 (Project Management): Project references.
- MOD-06 (Mobile App): Push notifications for assigned employees.
- Employee Master Data: Availability, skills, certifications.

---

## SCHED-003: Appointment Management

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | SCHED-003                                                                                         |
| **Title**        | Appointment Management                                                                            |
| **Priority**     | High                                                                                              |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `scheduling`, `appointments`, `customers`, `notifications`, `web`                                 |

### Description

The system must support full lifecycle management of field appointments including creation, confirmation, rescheduling, and cancellation. Appointments are customer-facing time commitments that may trigger customer notifications. This requirement covers the appointment aspects of deployment, as distinct from internal scheduling.

### Actors

- **Dispatcher / Planner** (primary): Creates and manages appointments.
- **Customer** (external): Receives appointment confirmations and notifications.
- **Field Technician**: Executes the appointment.

### Preconditions

1. An order or service assignment exists.
2. Customer contact information is available.
3. The user has `schedule:appointments:manage` permission.

### Main Flow

1. User creates or selects an assignment (SCHED-002) that requires a customer appointment.
2. User marks the assignment as "Customer Appointment" and adds appointment-specific details:
   - **Customer Contact**: Name, phone, email (pre-filled from order/CRM).
   - **Appointment Window**: Specific time or time window (e.g., "morning," "08:00-12:00").
   - **Confirmation Method**: Email, SMS, phone (manual note).
   - **Customer Notes**: Access instructions, parking info, contact on arrival.
3. User selects "Send Confirmation."
4. System sends a confirmation message to the customer via the selected method.
5. System records the confirmation as "Sent" with a timestamp.
6. Appointment status progresses: Planned -> Confirmed -> In Progress -> Completed / No-Show.

### Alternate Flows

- **AF-1: Reschedule**: User changes the appointment date/time. System sends an updated notification to the customer with the new time.
- **AF-2: Cancel**: User cancels the appointment. System sends a cancellation notification to the customer. Reason is recorded.
- **AF-3: Customer Requests Reschedule**: Customer contacts the office to reschedule. Dispatcher updates the appointment and adjusts the deployment calendar.
- **AF-4: No-Show**: Technician reports a no-show. Dispatcher marks the appointment as "No-Show" and initiates rebooking.
- **AF-5: Reminder**: System sends an automated reminder to the customer 24 hours before the appointment (configurable).

### Postconditions

1. The appointment is recorded with full status history.
2. Customer notifications are sent and logged.
3. The appointment is visible on the deployment calendar and in the mobile app.

### Acceptance Criteria

1. **AC-1**: An appointment can be created with customer contact, time window, and confirmation method.
2. **AC-2**: A confirmation email can be sent to the customer and is logged in the system.
3. **AC-3**: Rescheduling an appointment sends an updated notification to the customer.
4. **AC-4**: Cancellation sends a cancellation notification and records the reason.
5. **AC-5**: An automated reminder is sent 24 hours before the appointment (configurable timing).
6. **AC-6**: Appointment status history (planned, confirmed, in progress, completed, no-show) is tracked and viewable.
7. **AC-7**: The technician sees the appointment details (including customer notes) in the mobile app.

### Dependencies

- SCHED-002: Assignments are the basis for appointments.
- MOD-03 (CRM & Asset Management): Customer contact data.
- MOD-06 (Mobile App): Technician sees appointment details.
- Platform: Email / SMS notification service.

---

## SCHED-004: Assignment Overview Dashboard

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | SCHED-004                                                                                         |
| **Title**        | Assignment Overview Dashboard                                                                     |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `scheduling`, `dashboard`, `overview`, `reporting`, `web`                                         |

### Description

The system must provide a dashboard that gives dispatchers and managers a consolidated overview of all current and upcoming assignments. The dashboard displays key metrics, unassigned orders, today's schedule summary, and alerts for conflicts or overdue items.

### Actors

- **Dispatcher / Planner** (primary): Uses dashboard for daily operations.
- **Management**: Reviews scheduling KPIs.
- **Team Lead**: Views team workload.

### Preconditions

1. The user has `schedule:read` permission.

### Main Flow

1. User navigates to the Deployment Planning section.
2. System displays the assignment overview dashboard with:
   - **Today's Summary**: Total assignments today, by status (planned, in progress, completed), by team.
   - **Unassigned Orders**: List of orders/service requests awaiting technician assignment.
   - **Employee Utilization**: Visual indicator of each employee's schedule fill rate for the current week.
   - **Alerts**: Conflicts, overdue assignments, unconfirmed appointments.
   - **Upcoming**: Next 7 days' assignment count by day.
3. User can click through dashboard elements to navigate to the relevant detail views.
4. User can filter by team, date range, and assignment type.

### Alternate Flows

- **AF-1: Quick Assign from Dashboard**: User drags an unassigned order to an employee to create an assignment.
- **AF-2: Export**: User exports the dashboard data or assignment list as CSV.

### Postconditions

1. Dashboard displays real-time, accurate scheduling data.

### Acceptance Criteria

1. **AC-1**: The dashboard shows today's assignment count broken down by status.
2. **AC-2**: Unassigned orders are listed and can be clicked to open the assignment form.
3. **AC-3**: Employee utilization for the current week is displayed as a percentage or bar chart.
4. **AC-4**: Alerts for conflicts, overdue assignments, and unconfirmed appointments are prominently displayed.
5. **AC-5**: Dashboard elements are clickable and navigate to the appropriate detail views.
6. **AC-6**: The dashboard refreshes automatically or provides a manual refresh option.

### Dependencies

- SCHED-001: Calendar data.
- SCHED-002: Assignment data.
- SCHED-003: Appointment confirmation status.
- SCHED-007: Conflict data for alerts.

---

## SCHED-005: Mobile App Assignment Provision

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | SCHED-005                                                                                         |
| **Title**        | Mobile App Assignment Provision                                                                   |
| **Priority**     | High                                                                                              |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `scheduling`, `mobile`, `sync`, `push`, `api`                                                    |

### Description

The system must deliver assignment information to the Mobile Technician App (MOD-06) in real time. When assignments are created, modified, or cancelled, the mobile app must reflect these changes promptly. This includes providing all data a technician needs: order details, customer/site info, time slot, instructions, and any attached documents.

### Actors

- **System** (primary): Pushes assignment data to mobile app.
- **Dispatcher**: Triggers data push by creating/modifying assignments.
- **Field Technician**: Receives and views assignment data on mobile.

### Preconditions

1. The assignment exists in the system (SCHED-002).
2. The assigned employee has an active mobile app installation.
3. Push notification infrastructure is operational.

### Main Flow

1. Dispatcher creates or modifies an assignment (SCHED-002).
2. System publishes an assignment event to the message bus.
3. Mobile backend service receives the event.
4. Service prepares the assignment data payload including:
   - Assignment ID, date/time, status.
   - Order/project reference and details.
   - Customer name and site address.
   - Special instructions and notes.
   - Attached documents (references/URLs).
5. Service pushes the data to the technician's mobile device via push notification.
6. Mobile app receives the push, updates local storage, and displays a notification.
7. Technician opens the app and sees the updated assignment.

### Alternate Flows

- **AF-1: Offline Device**: If the device is offline, the push notification is queued by the push service (APNS/FCM). When the device comes online, it receives the notification and triggers a sync.
- **AF-2: Bulk Sync**: On app startup or manual refresh, the mobile app requests all assignments for the employee from the API, ensuring local data is current.
- **AF-3: Assignment Cancelled**: System pushes a cancellation notification. Mobile app marks the assignment as cancelled and notifies the technician.

### Postconditions

1. The technician's mobile app displays the current assignment data.
2. Push notifications are delivered for assignment changes.

### Acceptance Criteria

1. **AC-1**: When an assignment is created, the assigned technician receives a push notification within 60 seconds.
2. **AC-2**: The mobile app displays the complete assignment data (order, customer, site, time, instructions).
3. **AC-3**: When an assignment is modified, the mobile app reflects the changes after the next sync or push.
4. **AC-4**: When an assignment is cancelled, the technician receives a cancellation notification.
5. **AC-5**: The mobile app can perform a full sync of all assignments on demand.
6. **AC-6**: Assignment data pushed to mobile includes references to attached documents.

### Dependencies

- SCHED-002: Assignment data source.
- MOD-06 (Mobile App): Receives and displays assignment data.
- Platform: Push notification service (APNS for iOS, FCM for Android).
- Platform: Message bus / event system.

---

## SCHED-006: Drag-and-Drop Rescheduling

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | SCHED-006                                                                                         |
| **Title**        | Drag-and-Drop Rescheduling                                                                        |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `scheduling`, `calendar`, `ux`, `drag-drop`, `web`                                               |

### Description

The deployment calendar must support drag-and-drop interaction for rescheduling assignments. Users can drag an assignment block to a different time slot, a different day, or a different employee row. The system validates the change, detects conflicts, and updates all affected records and notifications.

### Actors

- **Dispatcher / Planner** (primary): Drags assignments to reschedule.
- **System**: Validates the move and updates records.

### Preconditions

1. The user has `schedule:assign` permission.
2. The deployment calendar is displayed (SCHED-001).
3. At least one assignment exists.

### Main Flow

1. User clicks and holds on an assignment block in the calendar.
2. System highlights the block as "being dragged" with visual feedback.
3. User drags the block to a new position:
   - **Same employee, different time**: Reschedules the time.
   - **Different employee, same time**: Reassigns to a different employee.
   - **Different employee, different time**: Reassigns and reschedules.
4. System shows a drop preview with visual indicators:
   - Green: Valid drop (no conflicts).
   - Yellow: Warning (soft conflict, e.g., tight travel window).
   - Red: Invalid (hard conflict, e.g., employee on leave).
5. User drops the assignment.
6. System validates the new position (availability, conflicts).
7. If valid, system updates the assignment record.
8. System sends notifications to affected parties (original employee if reassigned, new employee, customer if appointment time changed).
9. Calendar re-renders with the updated assignment.

### Alternate Flows

- **AF-1: Conflict on Drop**: System shows a confirmation dialog listing the conflict. User can cancel the move or override with justification.
- **AF-2: Resize**: User drags the edge of an assignment block to extend or shorten its duration.
- **AF-3: Undo**: User can undo the last drag-and-drop action within 30 seconds via an undo toast notification.

### Postconditions

1. The assignment is updated with the new time and/or employee.
2. Affected parties are notified.
3. The calendar reflects the change.

### Acceptance Criteria

1. **AC-1**: An assignment block can be dragged to a different time slot on the same employee row to reschedule.
2. **AC-2**: An assignment block can be dragged to a different employee row to reassign.
3. **AC-3**: Visual feedback (green/yellow/red) is shown during the drag to indicate validity.
4. **AC-4**: Dropping on a conflicting slot shows a confirmation dialog.
5. **AC-5**: After a successful drop, the assignment record is updated and affected parties are notified.
6. **AC-6**: The last drag-and-drop action can be undone within 30 seconds.
7. **AC-7**: Assignment blocks can be resized to change duration.

### Dependencies

- SCHED-001: Calendar rendering.
- SCHED-002: Assignment data.
- SCHED-007: Conflict detection for drop validation.

---

## SCHED-007: Conflict Detection

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | SCHED-007                                                                                         |
| **Title**        | Conflict Detection                                                                                |
| **Priority**     | Medium                                                                                            |
| **Complexity**   | Medium                                                                                            |
| **Tags**         | `scheduling`, `validation`, `conflicts`, `business-rules`, `web`                                  |

### Description

The system must automatically detect and warn about scheduling conflicts when assignments are created, modified, or rescheduled. Conflicts include double-bookings (employee assigned to overlapping time slots), assignments during absence periods, assignments outside working hours, and insufficient travel time between consecutive assignments.

### Actors

- **System** (primary): Detects conflicts automatically.
- **Dispatcher / Planner**: Receives conflict warnings and resolves them.

### Preconditions

1. Employee availability data, working hours, and absence records are accessible.
2. Assignment data exists or is being created/modified.

### Main Flow

1. When an assignment is created or modified (SCHED-002, SCHED-006), system evaluates:
   - **Double-Booking**: Does the employee have another assignment overlapping the proposed time?
   - **Absence Conflict**: Is the employee on leave, sick, or otherwise unavailable during the proposed time?
   - **Working Hours**: Does the assignment fall outside configured working hours?
   - **Travel Time**: Is there sufficient gap between the end of the previous assignment and the start of this one (configurable minimum, default 1 hour)?
2. System classifies each conflict:
   - **Hard Conflict** (blocks assignment): Absence period, employee inactive.
   - **Soft Conflict** (warning only): Double-booking, working hours violation, insufficient travel time.
3. System presents conflicts to the user:
   - Hard conflicts: Assignment is blocked; user must resolve before proceeding.
   - Soft conflicts: Warning dialog with details; user can proceed with acknowledgment or override.
4. If the user overrides a soft conflict, the override reason is logged.

### Alternate Flows

- **AF-1: No Conflicts**: If no conflicts are detected, the assignment proceeds without interruption.
- **AF-2: Batch Conflict Check**: When importing or bulk-creating assignments, system performs batch conflict detection and presents a summary of all conflicts.
- **AF-3: Conflict Dashboard Alert**: Existing conflicts (e.g., created by a subsequent absence entry) appear as alerts on the assignment overview dashboard (SCHED-004).

### Postconditions

1. Conflicts are detected and presented before assignment confirmation.
2. Override decisions are logged in the audit trail.

### Acceptance Criteria

1. **AC-1**: The system detects and warns when an employee is assigned to overlapping time slots.
2. **AC-2**: The system blocks assignments during employee absence periods.
3. **AC-3**: The system warns when an assignment falls outside configured working hours.
4. **AC-4**: The system warns when the gap between consecutive assignments is less than the configured minimum travel time.
5. **AC-5**: Hard conflicts prevent assignment creation; soft conflicts allow override with acknowledgment.
6. **AC-6**: Conflict override reasons are recorded in the audit log.
7. **AC-7**: Existing conflicts (caused by later changes) are surfaced as alerts on the dashboard.

### Dependencies

- SCHED-002: Assignment creation triggers conflict checks.
- SCHED-006: Drag-and-drop triggers conflict checks.
- Employee Master Data: Availability, absence records, working hours.

---

## SCHED-008: Coarse Scheduling View (OF-Bau Variant)

| Field            | Value                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| **ID**           | SCHED-008                                                                                         |
| **Title**        | Coarse Scheduling View (OF-Bau Variant)                                                          |
| **Priority**     | Low                                                                                               |
| **Complexity**   | Low                                                                                               |
| **Tags**         | `scheduling`, `construction`, `coarse-planning`, `of-bau`, `web`                                  |

### Description

The system must provide a coarse, high-level scheduling view designed for construction and renovation projects ("OF-Bau" variant). Unlike the detailed hourly calendar, this view operates at the week level, allowing planners to allocate employees to projects for entire weeks without specifying exact time slots. This is suitable for longer-term construction projects where daily scheduling flexibility is needed on-site.

### Actors

- **Dispatcher / Planner** (primary): Allocates employees to projects at the week level.
- **Project Manager**: Views resource allocation for their projects.

### Preconditions

1. The user has `schedule:coarse:manage` permission.
2. Projects requiring coarse scheduling exist.
3. Employee records are available.

### Main Flow

1. User selects the "Coarse Planning" or "OF-Bau" view in the Deployment Planning section.
2. System displays a matrix view:
   - **Rows**: Employees (or teams).
   - **Columns**: Calendar weeks (e.g., CW 14, CW 15, CW 16...).
   - **Cells**: Project allocation indicators (color-coded by project, showing project name/number).
3. User clicks on an empty cell to allocate an employee to a project for that week.
4. System presents a simple form: select project, allocation percentage (25%, 50%, 75%, 100%).
5. User confirms the allocation.
6. System records the week-level allocation.
7. The cell displays the project color/name and allocation percentage.

### Alternate Flows

- **AF-1: Multi-Week Allocation**: User selects a range of weeks (click and drag across columns) to allocate an employee to a project for multiple consecutive weeks.
- **AF-2: Split Week**: An employee can be allocated to multiple projects in the same week with different percentages (e.g., 50% Project A + 50% Project B).
- **AF-3: Remove Allocation**: User clicks an existing allocation and removes it.
- **AF-4: View by Project**: User switches to a project-centric view showing which employees are allocated to a selected project across weeks.

### Postconditions

1. Week-level allocations are recorded.
2. The coarse view reflects current allocations.
3. Coarse allocations are visible as context in the detailed calendar view (SCHED-001).

### Acceptance Criteria

1. **AC-1**: The coarse planning view displays a matrix of employees vs. calendar weeks.
2. **AC-2**: An employee can be allocated to a project for a specific week with an allocation percentage.
3. **AC-3**: Multiple projects can share an employee's week (split allocation) as long as total does not exceed 100%.
4. **AC-4**: Multi-week allocation can be created by selecting a range of weeks.
5. **AC-5**: The coarse allocations are visible as background indicators in the detailed calendar view.
6. **AC-6**: A project-centric view shows all employees allocated to a project across weeks.

### Dependencies

- SCHED-001: Coarse allocations provide context in the detailed calendar.
- MOD-04 (Project Management): Project references for allocation.
- Employee Master Data: Employee records.
