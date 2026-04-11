# Module 12: Task Management -- Requirements

---

## TASK-001: Task Creation & Management

| Field | Value |
|-------|-------|
| **ID** | TASK-001 |
| **Title** | Task Creation & Management |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | Module 01 (User Management) |
| **Tags** | `tasks`, `CRUD`, `core` |

### Description
The system shall support creation, editing, viewing, and deletion of tasks. Each task includes a title, description, status (Open, In Progress, Completed, Cancelled), creator, assignee, creation date, and modification history. Tasks are the atomic unit of the task management module and can exist independently or within a task list.

### Actors
- **Any authenticated user** -- creates and manages tasks.
- **System** -- tracks status changes and timestamps.

### Preconditions
1. User is authenticated.
2. User has a default personal task list (auto-created at account provisioning).

### Main Flow
1. User navigates to the task management section or a specific task list.
2. User clicks "Create Task."
3. User enters: title (required), description (optional, rich text), assignee (defaults to self), due date (optional), priority (optional), task list (defaults to personal).
4. System creates the task with status "Open" and records the creation timestamp and creator.
5. System displays the task in the selected task list.
6. User can edit any field at any time; system records the modification timestamp.

### Alternate Flows
- **AF-1: Quick-add** -- User types a task title in an inline input field and presses Enter; a task is created with defaults (status: Open, assignee: self, no due date, default priority).
- **AF-2: Delete task** -- User deletes a task. If the task has subtasks, user is prompted to confirm deletion of the hierarchy. Completed tasks can also be deleted.
- **AF-3: Bulk operations** -- User selects multiple tasks and applies a bulk action (change status, reassign, set priority, move to another list).

### Postconditions
- Task is persisted with all metadata.
- Task appears in the appropriate list(s).
- Modification history is recorded.

### Acceptance Criteria
1. A task can be created with only a title; all other fields are optional.
2. Quick-add creates a task in under 1 second without opening a full form.
3. Task status transitions are recorded with timestamp and actor.
4. Bulk operations apply to up to 100 selected tasks simultaneously.
5. Task titles support up to 500 characters.
6. Task descriptions support rich text (bold, italic, bullet lists, links).

---

## TASK-002: Multiple Task Lists

| Field | Value |
|-------|-------|
| **ID** | TASK-002 |
| **Title** | Multiple Task Lists |
| **Priority** | Medium |
| **Complexity** | Low |
| **Dependencies** | TASK-001 |
| **Tags** | `tasks`, `lists`, `organization` |

### Description
The system shall support multiple task lists per user to organize tasks by context (e.g., "Daily Tasks," "Pending Approvals," "Site Visit Prep"). Each user has a default personal list. Additional lists can be created, renamed, reordered, and archived. Tasks can be moved between lists.

### Actors
- **Any authenticated user** -- creates and manages task lists.

### Preconditions
1. User is authenticated.

### Main Flow
1. User navigates to the task list overview.
2. System displays all task lists belonging to the user (and shared group lists from TASK-010).
3. User creates a new list with a name and optional color/icon.
4. System creates the list and adds it to the sidebar/navigation.
5. User creates tasks within the list or moves existing tasks into it.
6. User can rename, reorder (drag-and-drop), or archive a list.

### Alternate Flows
- **AF-1: Archive list** -- User archives a list; it is hidden from the main view but accessible via an "Archived" section. Tasks within remain accessible.
- **AF-2: Delete list** -- User deletes an empty list. If the list contains tasks, user must move them to another list or confirm deletion of all tasks.
- **AF-3: Default list** -- The default personal list cannot be deleted or archived.

### Postconditions
- Task list is persisted and visible in the user's navigation.

### Acceptance Criteria
1. Users can create up to 50 task lists.
2. Lists can be reordered via drag-and-drop in the sidebar.
3. Archived lists are hidden from the main view but accessible.
4. The default personal list cannot be deleted.
5. Moving a task between lists updates the task's list association immediately.
6. Each list displays the count of open tasks.

---

## TASK-003: Task Assignment to Projects/Orders/Personal

| Field | Value |
|-------|-------|
| **ID** | TASK-003 |
| **Title** | Task Assignment to Projects/Orders/Personal |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | TASK-001, Module 04 (Order/Project Management) |
| **Tags** | `tasks`, `projects`, `orders`, `assignment`, `integration` |

### Description
The system shall allow tasks to be linked to projects, orders, or kept as personal items. A task can be associated with exactly one project or order (or neither for personal tasks). When linked, the task appears both in the user's personal task view and within the project/order context. Project managers can view all tasks linked to their projects.

### Actors
- **Any authenticated user** -- links tasks to projects or orders.
- **Project manager** -- views all tasks linked to a project.

### Preconditions
1. Task exists (TASK-001).
2. If linking to a project/order, the project/order exists in Module 04.

### Main Flow
1. During task creation or editing, user selects a project or order from a searchable dropdown.
2. System validates that the project/order exists and the user has access.
3. System links the task to the selected project/order.
4. The task appears in the project/order task tab and in the user's personal view.
5. Project managers see all linked tasks when viewing the project.

### Alternate Flows
- **AF-1: Unlink task** -- User removes the project/order association; the task becomes a personal task.
- **AF-2: Project/order closed** -- Tasks linked to closed projects/orders remain visible but are flagged as belonging to a closed entity.
- **AF-3: Cross-project view** -- A user can view all their tasks across all projects in a unified "My Tasks" view.

### Postconditions
- Task is linked to the specified project/order.
- Task is visible in both personal and project/order contexts.

### Acceptance Criteria
1. Tasks can be linked to a project or order via a searchable dropdown.
2. Linked tasks appear in the project/order's task tab.
3. A "My Tasks" view shows all tasks across all projects/orders and personal lists.
4. Unlinking a task removes it from the project/order view but retains it in the personal view.
5. Tasks linked to closed projects are visually distinguished (e.g., grayed-out project badge).
6. The project/order selector searches by name and number with results within 500 ms.

---

## TASK-004: Due Date Management

| Field | Value |
|-------|-------|
| **ID** | TASK-004 |
| **Title** | Due Date Management |
| **Priority** | High |
| **Complexity** | Low |
| **Dependencies** | TASK-001 |
| **Tags** | `tasks`, `due-dates`, `scheduling` |

### Description
The system shall support setting, editing, and tracking due dates on tasks. Due dates are optional. Tasks past their due date are visually flagged as overdue. Due dates can be set as a specific date or as a relative duration (e.g., "in 3 days"). The system provides views sorted/filtered by due date.

### Actors
- **Any authenticated user** -- sets and manages due dates.
- **System** -- calculates overdue status, triggers reminders.

### Preconditions
1. Task exists.

### Main Flow
1. User sets a due date on a task during creation or editing.
2. User selects a date from a date picker or types a relative expression (e.g., "tomorrow," "next Monday," "+3d").
3. System stores the due date.
4. System continuously evaluates due dates; tasks past their due date are flagged as overdue.
5. Overdue tasks are visually distinguished (e.g., red text, overdue badge).

### Alternate Flows
- **AF-1: Remove due date** -- User clears the due date; the task is no longer time-bound.
- **AF-2: Overdue notification** -- System sends a notification when a task becomes overdue (see TASK-005).
- **AF-3: Due today view** -- User views all tasks due today across all lists.

### Postconditions
- Due date is stored on the task.
- Overdue calculation is performed in real-time.

### Acceptance Criteria
1. Due dates can be set to any future or past date.
2. Relative expressions ("tomorrow," "+3d," "next Friday") are correctly parsed and converted to absolute dates.
3. Overdue tasks are visually flagged within 1 minute of the due date passing.
4. A "Due Today" filter shows all tasks due on the current date.
5. Due dates are displayed in the user's local timezone.

---

## TASK-005: Reminder Functions

| Field | Value |
|-------|-------|
| **ID** | TASK-005 |
| **Title** | Reminder Functions |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | TASK-001, TASK-004, Module 13 (Notifications) |
| **Tags** | `tasks`, `reminders`, `notifications` |

### Description
The system shall support configurable reminders for tasks. Users can set one or more reminders relative to the due date (e.g., 1 day before, 2 hours before) or at a specific date/time. Reminders are delivered via push notification (mobile), in-app notification (web), and optionally email.

### Actors
- **Any authenticated user** -- configures reminders.
- **System** -- triggers reminders at the specified time.

### Preconditions
1. Task exists with a due date (for relative reminders) or a specific reminder time.
2. Notification infrastructure is available (Module 13).

### Main Flow
1. User opens a task and navigates to the reminder settings.
2. User adds a reminder: relative (e.g., "1 day before due date") or absolute (specific date/time).
3. System schedules the reminder.
4. At the reminder time, system sends notifications via configured channels (push, in-app, email).
5. User receives the reminder and can navigate directly to the task.

### Alternate Flows
- **AF-1: Multiple reminders** -- User sets multiple reminders on a single task (e.g., 1 week before and 1 day before).
- **AF-2: Snooze** -- User snoozes a reminder for a configurable duration (15 min, 1 hour, 1 day).
- **AF-3: Default reminder** -- User configures a global default reminder (e.g., always remind 1 day before due) that applies to all new tasks with due dates.

### Postconditions
- Reminder is scheduled and will fire at the specified time.
- Notification is delivered to the user.

### Acceptance Criteria
1. Reminders fire within 1 minute of the scheduled time.
2. Up to 5 reminders can be set per task.
3. Snooze options include 15 minutes, 1 hour, 4 hours, 1 day, and custom duration.
4. Default reminder preferences are configurable per user.
5. Reminder notifications include the task title, due date, and a direct link to the task.
6. Reminders are delivered via push notification and in-app notification; email is optional per user preference.

---

## TASK-006: Prioritization

| Field | Value |
|-------|-------|
| **ID** | TASK-006 |
| **Title** | Prioritization |
| **Priority** | Medium |
| **Complexity** | Low |
| **Dependencies** | TASK-001 |
| **Tags** | `tasks`, `priority`, `organization` |

### Description
The system shall support task prioritization with predefined priority levels. Tasks can be sorted and filtered by priority. Visual indicators (colors, icons) distinguish priority levels at a glance.

### Actors
- **Any authenticated user** -- sets task priority.

### Preconditions
1. Task exists.

### Main Flow
1. User sets a priority on a task during creation or editing.
2. User selects from predefined levels: None, Low, Medium, High, Urgent.
3. System stores the priority and applies the corresponding visual indicator.
4. User can filter task lists by priority level.
5. User can sort tasks by priority (Urgent first by default).

### Alternate Flows
- **AF-1: Change priority** -- User changes priority; the visual indicator updates immediately.
- **AF-2: Bulk priority change** -- User selects multiple tasks and sets the same priority.

### Postconditions
- Task priority is stored and visually reflected.

### Acceptance Criteria
1. Five priority levels are available: None, Low, Medium, High, Urgent.
2. Each priority level has a distinct color (e.g., None: gray, Low: blue, Medium: yellow, High: orange, Urgent: red).
3. Tasks can be filtered by one or more priority levels simultaneously.
4. Sorting by priority orders tasks: Urgent > High > Medium > Low > None.
5. Priority change is reflected immediately in all views (no page reload required).

---

## TASK-007: Completion Marking

| Field | Value |
|-------|-------|
| **ID** | TASK-007 |
| **Title** | Completion Marking |
| **Priority** | High |
| **Complexity** | Low |
| **Dependencies** | TASK-001 |
| **Tags** | `tasks`, `completion`, `status`, `core` |

### Description
The system shall allow users to mark tasks as completed with a single action (checkbox click or swipe gesture on mobile). Completed tasks are timestamped, visually distinguished (strikethrough, moved to bottom, or hidden), and can be reopened if needed. Completion statistics are tracked per user and per project.

### Actors
- **Any authenticated user** -- marks tasks as complete.
- **System** -- records completion timestamp and tracks statistics.

### Preconditions
1. Task exists with status "Open" or "In Progress."

### Main Flow
1. User clicks the completion checkbox next to a task (web) or swipes right (mobile).
2. System changes the task status to "Completed" and records the completion timestamp and actor.
3. Task is visually marked as complete (strikethrough text, checkmark icon).
4. Completed task moves to the bottom of the list or is hidden based on user preference.
5. System updates completion statistics.

### Alternate Flows
- **AF-1: Reopen task** -- User unchecks a completed task; status reverts to "Open" with a reopen timestamp.
- **AF-2: Complete with subtasks** -- If a task has incomplete subtasks, user is prompted: "Complete all subtasks too?" or "Complete parent only?"
- **AF-3: Completion from detail view** -- User can also mark completion from the task detail view via a "Mark Complete" button.

### Postconditions
- Task status is "Completed" with a timestamp.
- Completion statistics are updated.
- Subtask behavior is applied per user choice.

### Acceptance Criteria
1. Single-click/tap completion changes status and applies visual styling within 500 ms.
2. Completion timestamp and actor are recorded and displayed on the task detail view.
3. Completed tasks can be hidden or shown via a toggle ("Show Completed").
4. Reopening a task reverts it to "Open" with a reopen timestamp in the history.
5. Completing a parent task with open subtasks prompts the user for confirmation.
6. Completion statistics (tasks completed today, this week, this month) are available per user.

---

## TASK-008: Subtask Support

| Field | Value |
|-------|-------|
| **ID** | TASK-008 |
| **Title** | Subtask Support |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | TASK-001, TASK-007 |
| **Tags** | `tasks`, `subtasks`, `hierarchy` |

### Description
The system shall support subtasks -- tasks nested under a parent task to decompose work into smaller steps. Subtasks have the same attributes as regular tasks (title, description, status, assignee, due date, priority) and are displayed inline within the parent task. A progress indicator on the parent task shows subtask completion progress.

### Actors
- **Any authenticated user** -- creates and manages subtasks.

### Preconditions
1. Parent task exists.

### Main Flow
1. User opens a task detail view and clicks "Add Subtask."
2. User enters subtask details (title required, other fields optional).
3. System creates the subtask as a child of the parent task.
4. Parent task displays all subtasks inline with individual completion checkboxes.
5. Parent task shows a progress bar (e.g., "3/5 subtasks complete").
6. User completes subtasks individually.

### Alternate Flows
- **AF-1: Convert to subtask** -- User drags an existing task under another task to make it a subtask.
- **AF-2: Promote subtask** -- User promotes a subtask to an independent task (removes the parent relationship).
- **AF-3: Nested subtasks** -- Subtasks can have their own subtasks, up to a maximum depth of 3 levels.
- **AF-4: Reorder subtasks** -- User reorders subtasks within the parent via drag-and-drop.

### Postconditions
- Subtask is created as a child of the parent task.
- Parent task progress indicator is updated.

### Acceptance Criteria
1. Subtasks are displayed inline within the parent task detail view.
2. Parent task shows a progress indicator (fraction and/or progress bar).
3. Subtask nesting supports up to 3 levels deep.
4. Subtasks can be individually completed without completing the parent.
5. Promoting a subtask removes the parent reference and moves it to the parent's task list.
6. Drag-and-drop reordering of subtasks persists the new order immediately.

---

## TASK-009: Notes & File Uploads

| Field | Value |
|-------|-------|
| **ID** | TASK-009 |
| **Title** | Notes & File Uploads |
| **Priority** | Medium |
| **Complexity** | Low |
| **Dependencies** | TASK-001 |
| **Tags** | `tasks`, `notes`, `attachments`, `files` |

### Description
The system shall support adding notes (comments) and file attachments to tasks. Notes create a chronological activity feed on the task. File uploads support common formats (PDF, images, Office documents) with size limits. Notes and files are visible to all users with access to the task.

### Actors
- **Any authenticated user with task access** -- adds notes and files.

### Preconditions
1. Task exists and user has access.

### Main Flow
1. User opens a task detail view.
2. User types a note in the comment field and clicks "Add."
3. System appends the note to the task's activity feed with author and timestamp.
4. User clicks "Attach File" and selects a file from the file system or drags-and-drops.
5. System uploads the file (validated for type and size) and displays it in the attachments section.
6. Other users with task access can view notes and download attachments.

### Alternate Flows
- **AF-1: Edit note** -- User edits their own note within 15 minutes of posting. An "edited" indicator is shown.
- **AF-2: Delete note** -- User deletes their own note. The note is removed from the activity feed.
- **AF-3: Image preview** -- Image attachments display an inline thumbnail preview.
- **AF-4: @mention** -- User @mentions another user in a note; the mentioned user receives a notification.

### Postconditions
- Note is added to the task's activity feed.
- File is stored and linked to the task.

### Acceptance Criteria
1. Notes support rich text formatting (bold, italic, bullet lists, links).
2. File uploads support PDF, JPEG, PNG, DOCX, XLSX, and ZIP formats.
3. Maximum file size: 25 MB per file.
4. Up to 50 files can be attached per task.
5. Notes are displayed in chronological order with author avatar, name, and timestamp.
6. @mentions trigger a notification to the mentioned user within 60 seconds.

---

## TASK-010: Group Lists

| Field | Value |
|-------|-------|
| **ID** | TASK-010 |
| **Title** | Group Lists |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | TASK-001, TASK-002, Module 01 (User Management) |
| **Tags** | `tasks`, `lists`, `collaboration`, `teams` |

### Description
The system shall support shared group task lists that multiple users can access and collaborate on. Group lists have an owner (creator) and members. Members can view and manage tasks within the list based on their role (Viewer, Editor, Admin). Group lists enable team coordination (e.g., "Service Team Weekly Tasks," "Office Admin Tasks").

### Actors
- **List owner** -- creates the group list, manages members and roles.
- **List members** -- interact with tasks according to their role.

### Preconditions
1. List owner is authenticated.
2. Member users have active accounts.

### Main Flow
1. User creates a new task list and sets it as a "Group List."
2. User adds members by searching for users and assigning roles (Viewer, Editor, Admin).
3. System notifies invited members.
4. Members see the group list in their sidebar alongside personal lists.
5. Members create, edit, and complete tasks within the group list according to their role.
6. All changes are visible to all members in real-time.

### Alternate Flows
- **AF-1: Remove member** -- Owner removes a member; the list disappears from the member's sidebar.
- **AF-2: Transfer ownership** -- Owner transfers list ownership to another Admin member.
- **AF-3: Leave list** -- A member leaves a group list voluntarily; tasks assigned to them are reassigned to the owner or unassigned.
- **AF-4: Role-based permissions** -- Viewers can see tasks but cannot create/edit. Editors can create/edit tasks. Admins can manage members.

### Postconditions
- Group list is accessible to all members.
- Member changes propagate in real-time.

### Acceptance Criteria
1. Group lists support up to 50 members.
2. Three roles are available: Viewer (read-only), Editor (CRUD tasks), Admin (CRUD tasks + manage members).
3. Changes by any member are visible to all other members within 3 seconds (real-time sync).
4. Removing a member revokes access immediately.
5. Group lists are visually distinguished from personal lists in the sidebar (e.g., people icon).
6. The owner can transfer ownership to an Admin member.

---

## TASK-011: Web-Mobile Synchronization

| Field | Value |
|-------|-------|
| **ID** | TASK-011 |
| **Title** | Web-Mobile Synchronization |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | TASK-001, all TASK-* requirements |
| **Tags** | `tasks`, `sync`, `mobile`, `real-time`, `offline` |

### Description
The system shall synchronize task data between the web application and the mobile app in real-time or near-real-time. Changes made on one platform are reflected on the other within seconds when online. The mobile app supports offline access with local caching and background sync upon connectivity restoration. Conflict resolution follows a last-write-wins strategy with user notification for conflicts.

### Actors
- **Any user on web** -- makes task changes that sync to mobile.
- **Any user on mobile** -- makes task changes that sync to web.
- **System** -- manages sync, caching, and conflict resolution.

### Preconditions
1. User has accounts on both web and mobile.
2. Mobile app is installed and authenticated.

### Main Flow
1. User creates or modifies a task on the web.
2. System pushes the change to the server via WebSocket/API.
3. Server notifies the mobile app via push/WebSocket.
4. Mobile app updates the local cache and displays the change.
5. Reverse flow applies for mobile-to-web changes.

### Alternate Flows
- **AF-1: Offline mobile** -- User makes changes on mobile while offline. Changes are queued locally. When connectivity is restored, the queue is processed and synced.
- **AF-2: Conflict** -- Two users edit the same task field simultaneously. Last-write-wins is applied; the overwritten user receives a notification of the conflict with the ability to review both versions.
- **AF-3: Initial sync** -- On first login on mobile, all tasks accessible to the user are downloaded to the local cache.

### Postconditions
- Task data is consistent across web and mobile.
- Offline changes are synced upon reconnection.

### Acceptance Criteria
1. Online changes sync between web and mobile within 5 seconds.
2. Offline changes are queued and synced within 30 seconds of connectivity restoration.
3. Conflict resolution applies last-write-wins and notifies the affected user.
4. Initial sync downloads all user tasks within 30 seconds for up to 5,000 tasks.
5. Local mobile cache supports full task access (read and create) while offline.
6. Sync status is indicated in the mobile app (synced, syncing, offline).

---

## TASK-012: Personal Task Overview Dashboard

| Field | Value |
|-------|-------|
| **ID** | TASK-012 |
| **Title** | Personal Task Overview Dashboard |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | TASK-001, TASK-003, TASK-004, TASK-006 |
| **Tags** | `tasks`, `dashboard`, `overview`, `personal` |

### Description
The system shall provide a personal task overview dashboard that aggregates all tasks assigned to the current user across all lists, projects, and orders. The dashboard shows: tasks due today, overdue tasks, upcoming tasks, recently completed tasks, and summary statistics. It serves as the user's primary entry point for task management.

### Actors
- **Any authenticated user** -- views their personal dashboard.

### Preconditions
1. User is authenticated.
2. At least one task exists for the user.

### Main Flow
1. User navigates to "My Tasks" or the task dashboard.
2. System displays sections: Overdue (sorted by how overdue), Due Today, Upcoming (next 7 days), Recently Completed (last 7 days).
3. Each section shows tasks with title, project/order badge, priority indicator, and due date.
4. User clicks a task to open the detail view.
5. Summary statistics are shown: total open tasks, tasks completed this week, overdue count.

### Alternate Flows
- **AF-1: Filter by project** -- User filters the dashboard to show tasks for a specific project or order only.
- **AF-2: Custom date range** -- User changes the "Upcoming" window (e.g., next 14 days instead of 7).
- **AF-3: Widget on home screen** -- The task summary is available as a widget on the platform's main dashboard/home screen.

### Postconditions
- Dashboard displays the current task state for the user.

### Acceptance Criteria
1. Dashboard loads within 2 seconds.
2. Overdue tasks are highlighted with a red indicator and sorted by days overdue (most overdue first).
3. "Due Today" section shows all tasks with today's due date.
4. Summary statistics are accurate and update in real-time as tasks are completed.
5. Filtering by project/order narrows all sections to the selected context.
6. The dashboard is accessible from both web and mobile with responsive layout.

---

## TASK-013: Project/Order Structure Integration

| Field | Value |
|-------|-------|
| **ID** | TASK-013 |
| **Title** | Project/Order Structure Integration |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | TASK-001, TASK-003, Module 04 (Order/Project Management) |
| **Tags** | `tasks`, `projects`, `orders`, `integration`, `cross-module` |

### Description
The system shall deeply integrate the task management module into the project and order structures of Module 04. Projects and orders shall have a dedicated "Tasks" tab showing all linked tasks. Project managers can create tasks directly from the project context. Task completion progress is surfaced in the project overview. Closing a project/order triggers a review of open tasks.

### Actors
- **Project manager** -- creates and manages project tasks.
- **Team members** -- work on assigned project tasks.
- **System** -- aggregates task progress, triggers reviews on project closure.

### Preconditions
1. Project or order exists in Module 04.
2. Task management module is active.

### Main Flow
1. Project manager opens a project/order in Module 04.
2. Manager navigates to the "Tasks" tab.
3. System displays all tasks linked to this project/order with status, assignee, due date, and priority.
4. Manager clicks "Add Task" to create a task directly linked to this project/order.
5. Manager can filter and sort tasks within the project context.
6. Project overview shows a task completion summary (e.g., "12/18 tasks completed").
7. When the project is moved to "Closed" status, system checks for open tasks and warns the manager.

### Alternate Flows
- **AF-1: Open tasks on project close** -- Manager attempts to close a project with open tasks. System displays the list of open tasks and offers options: complete all, cancel all, or keep open (prevent closure).
- **AF-2: Task progress widget** -- Project overview includes a progress widget showing task completion percentage and a mini-chart of task status distribution.
- **AF-3: Template tasks** -- When a new project is created from a project template, predefined task templates are automatically created as tasks within the project.
- **AF-4: Cross-project task report** -- Management views a report showing task completion rates across all active projects.

### Postconditions
- Tasks are visible and manageable within the project/order context.
- Project overview reflects task completion progress.
- Project closure is guarded by open-task checks.

### Acceptance Criteria
1. The "Tasks" tab on projects/orders lists all linked tasks with correct metadata.
2. Tasks created from the project context are automatically linked to that project.
3. Project overview shows task completion count and percentage.
4. Closing a project with open tasks triggers a warning listing all unresolved tasks.
5. Template tasks are auto-created when a project is instantiated from a template with predefined tasks.
6. Task status changes within the project context update the project task summary in real-time.
7. Cross-project task report shows completion rates for up to 100 active projects.
