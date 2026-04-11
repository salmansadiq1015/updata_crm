# Module 12: Task Management

## Source
Statement of Work -- Section 11

## Purpose
Integrated task and to-do system enabling individuals and teams at MB Boiler & Heizung AG to track work items across projects, orders, and personal activities with full web-mobile synchronization.

## Scope

### Core Task Capabilities
- Task creation and management (title, description, status).
- Multiple task lists for organizing work.
- Assignment of tasks to projects, orders, or personal lists.
- Due date management.
- Reminder functions (push notifications, in-app alerts).
- Prioritization (urgency/importance levels).
- Completion marking with timestamp tracking.

### Advanced Features
- Subtask support (hierarchical task decomposition).
- Notes and file uploads attached to tasks.
- Group lists (shared task lists for teams/departments).

### Cross-Platform & Integration
- Web-mobile synchronization (real-time or near-real-time).
- Personal task overview dashboards.
- Integration into project and order structures (tasks visible within project/order context).

## Out of Scope / Boundaries
- **Project-level status management** -- project lifecycle states, milestones, and phase tracking belong to Module 04 (Order/Project Management).
- **Scheduling and calendar** -- calendar views, appointment booking, and resource scheduling belong to Module 05 (Scheduling).
- **Time tracking** -- logging hours against tasks is handled by Module 06 (Time Tracking) if applicable.
- **Workflow automation** -- automated task creation from triggers (e.g., "when order status changes, create task") is a future enhancement, not in initial scope.

## Requirements Summary

| ID | Title | Priority |
|----|-------|----------|
| TASK-001 | Task Creation & Management | High |
| TASK-002 | Multiple Task Lists | Medium |
| TASK-003 | Task Assignment to Projects/Orders/Personal | High |
| TASK-004 | Due Date Management | High |
| TASK-005 | Reminder Functions | Medium |
| TASK-006 | Prioritization | Medium |
| TASK-007 | Completion Marking | High |
| TASK-008 | Subtask Support | Medium |
| TASK-009 | Notes & File Uploads | Medium |
| TASK-010 | Group Lists | Medium |
| TASK-011 | Web-Mobile Synchronization | High |
| TASK-012 | Personal Task Overview Dashboard | Medium |
| TASK-013 | Project/Order Structure Integration | High |

## Key Stakeholders
- **All employees** -- every user can create and manage personal tasks.
- **Field technicians** -- receive tasks on mobile, mark completion in the field.
- **Project managers** -- create and assign project-related tasks, monitor completion.
- **Office staff** -- manage administrative tasks, group lists.
- **Management** -- overview of team workload and task completion rates.

## Integration Points
- **Module 04 (Order/Project Management)** -- tasks linked to projects/orders; task completion may influence project progress.
- **Module 05 (Scheduling)** -- tasks with due dates may appear in scheduling views (read-only reference).
- **Module 07 (Field-Service Reports)** -- field tasks may trigger or be triggered by service report workflows.
- **Module 13 (Notifications)** -- reminder delivery via push notifications and in-app alerts.
- **Mobile app** -- offline-capable task access with background sync.

## Assumptions
1. Every user has a default personal task list created automatically upon account provisioning.
2. Tasks support a simple status model: Open, In Progress, Completed, Cancelled.
3. File uploads on tasks share the platform's global file storage and size limits.
4. Web-mobile sync uses the same real-time infrastructure as other modules (WebSocket/SSE).
5. Group lists have an owner (creator) and members; membership is managed by list owners or administrators.
