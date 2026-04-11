# Module 05: Field Deployment Planning

## Module Metadata

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Module ID         | MOD-05                                     |
| Module Name       | Field Deployment Planning                  |
| SOW Reference     | Section 4                                  |
| Version           | 1.0                                        |
| Status            | Draft                                      |
| Last Updated      | 2026-03-29                                 |
| Owner             | MB Boiler & Heizung AG                     |

---

## 1. Purpose

The Field Deployment Planning module provides a calendar-based system for planning, scheduling, and assigning field staff to projects, service orders, and maintenance assignments. It serves as the central scheduling hub that ensures technicians are optimally deployed, appointments are managed, and field operations run smoothly.

The module supports both fine-grained daily scheduling and coarse/high-level planning (referred to as "Variant OF-Bau") for longer-term construction projects where exact times are less critical than week-level resource allocation.

---

## 2. Scope

### In Scope

- **Calendar-Based Deployment Planning**: Interactive calendar views (day, week, month) for visualizing and managing staff deployment.
- **Employee Assignment**: Assigning employees to orders, projects, and service assignments with role and skill matching.
- **Appointment Management**: Creating, updating, confirming, and canceling field appointments.
- **Assignment Overview**: Dashboard providing a consolidated view of all current and upcoming assignments per employee, team, or project.
- **Mobile App Provision**: Pushing assignment information to the Mobile Technician App (Module 06) so field staff can see their schedules.
- **Drag-and-Drop Rescheduling**: Interactive calendar manipulation for quick schedule changes.
- **Conflict Detection**: Automatic detection and warning for double-bookings, overlapping assignments, and resource conflicts.
- **Coarse Scheduling (OF-Bau Variant)**: High-level, week-based scheduling view for construction projects where precise time slots are not required.

### Out of Scope

- **Employee HR Data**: Managing employee records, contracts, certifications, or personal data. This module only references employees for scheduling purposes.
- **Project Details**: Full project management (creation, documents, preparatory actions) is handled by Module 04 (Project Management).
- **Route Optimization**: Automatic route planning or travel time optimization is not included in this version.
- **Payroll Integration**: Time data for payroll is managed by the time recording features in Module 06 and Module 10.

---

## 3. Key Features

| # | Feature                              | Description                                                                                        |
|---|--------------------------------------|----------------------------------------------------------------------------------------------------|
| 1 | Interactive Calendar                 | Day/week/month calendar views with color-coded assignments per employee or team.                   |
| 2 | Employee Assignment Engine           | Assign one or more employees to orders, projects, or service calls with skill/availability checks. |
| 3 | Appointment Management               | Full lifecycle management of field appointments including customer notifications.                   |
| 4 | Assignment Overview Dashboard        | Consolidated view of all assignments with filters by employee, team, project, date range, status.  |
| 5 | Mobile Push                          | Real-time delivery of assignment data to the Mobile Technician App.                                |
| 6 | Drag-and-Drop Scheduling             | Visual rescheduling by dragging assignments across the calendar.                                   |
| 7 | Conflict Detection                   | Automated warnings when scheduling conflicts arise (double-booking, unavailability).               |
| 8 | OF-Bau Coarse Scheduling             | Week-level resource allocation view for construction/renovation projects.                          |

---

## 4. Requirements Summary

| Requirement ID | Title                                       | Priority | Complexity |
|----------------|---------------------------------------------|----------|------------|
| SCHED-001      | Calendar-Based Deployment Planning          | High     | High       |
| SCHED-002      | Employee Assignment to Orders/Projects      | High     | High       |
| SCHED-003      | Appointment Management                      | High     | Medium     |
| SCHED-004      | Assignment Overview Dashboard               | Medium   | Medium     |
| SCHED-005      | Mobile App Assignment Provision             | High     | Medium     |
| SCHED-006      | Drag-and-Drop Rescheduling                  | Medium   | Medium     |
| SCHED-007      | Conflict Detection                          | Medium   | Medium     |
| SCHED-008      | Coarse Scheduling View (OF-Bau Variant)     | Low      | Low        |

---

## 5. Actors

| Actor                  | Role in Module                                                               |
|------------------------|------------------------------------------------------------------------------|
| Dispatcher / Planner   | Primary user: creates schedules, assigns employees, resolves conflicts.      |
| Project Manager        | Views and adjusts schedules for their projects; coordinates with planner.    |
| Field Technician       | Views own schedule via web or mobile app (read-only in planning module).     |
| Team Lead              | Views team schedules, may suggest reassignments.                             |
| System Administrator   | Configures calendar settings, working hours, holiday calendars.              |

---

## 6. Dependencies

| Dependency               | Module / System       | Nature                                                                 |
|--------------------------|-----------------------|------------------------------------------------------------------------|
| Project Management       | MOD-04                | Schedules reference projects; project milestones drive schedule dates.  |
| Mobile Technician App    | MOD-06                | Assignment data is pushed to mobile for field staff consumption.        |
| Customer / Site Data     | MOD-02 (CRM)         | Appointments reference customer sites and contact information.          |
| Employee Master Data     | MOD-10 / HR System    | Employee availability, skills, and roles are sourced externally.        |
| Order Management         | MOD-08                | Service orders and work orders drive scheduling needs.                  |
| Notification Service     | Platform Service      | Sends push/email notifications for schedule changes.                   |

---

## 7. Key Business Rules

1. An employee cannot be assigned to overlapping time slots unless explicitly overridden by a dispatcher with appropriate permissions.
2. Assignments must respect configured working hours and company holiday calendars.
3. Schedule changes within 24 hours of the appointment must trigger an immediate push notification to the affected technician.
4. The OF-Bau coarse scheduling view allocates employees at the week level and does not require specific time slots.
5. When an assignment is rescheduled, all affected parties (technician, customer if applicable) must be notified.
6. A minimum lead time (configurable, default 1 hour) is required between consecutive assignments to account for travel.
