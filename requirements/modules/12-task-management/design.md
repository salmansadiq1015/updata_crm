# Module 12: Task Management -- Design

---

## 1. REST API Design

### 1.1 Tasks

```
GET    /api/v1/tasks                                # List/search tasks (paginated, filterable)
GET    /api/v1/tasks/{id}                           # Get task by ID (includes subtasks, notes, files)
POST   /api/v1/tasks                                # Create task
PUT    /api/v1/tasks/{id}                           # Update task
DELETE /api/v1/tasks/{id}                           # Delete task
PATCH  /api/v1/tasks/{id}/status                    # Change task status
PATCH  /api/v1/tasks/{id}/complete                  # Mark task as completed
PATCH  /api/v1/tasks/{id}/reopen                    # Reopen a completed task
PATCH  /api/v1/tasks/{id}/move                      # Move task to a different list
POST   /api/v1/tasks/bulk                           # Bulk operations (status, assign, priority, move)
```

**Query parameters for GET /api/v1/tasks:**
```
?q=<search-term>               # Full-text search on title/description
&listId=<id>                   # Filter by task list
&projectId=<id>                # Filter by project
&orderId=<id>                  # Filter by order
&assigneeId=<id>               # Filter by assignee
&createdById=<id>              # Filter by creator
&status=OPEN|IN_PROGRESS|COMPLETED|CANCELLED
&priority=NONE|LOW|MEDIUM|HIGH|URGENT
&dueFrom=<date>                # Due date range
&dueTo=<date>
&overdue=true|false            # Only overdue tasks
&dueToday=true                 # Only tasks due today
&hasParent=true|false          # Filter subtasks vs top-level
&parentId=<id>                 # Get subtasks of a specific parent
&page=1&size=50
&sort=dueDate|priority|createdAt|title&order=asc|desc
```

**POST /api/v1/tasks** -- Request Body:
```json
{
  "title": "Heizungsanlage inspizieren",
  "description": "<p>Jährliche Inspektion der Heizungsanlage am Standort Zürich.</p>",
  "listId": "list-personal-001",
  "assigneeId": "user-042",
  "dueDate": "2026-04-15",
  "priority": "HIGH",
  "projectId": "prj-2026-0015",
  "orderId": null,
  "parentTaskId": null,
  "reminders": [
    { "type": "RELATIVE", "offsetMinutes": -1440 }
  ]
}
```

**Response** (201 Created):
```json
{
  "id": "task-001",
  "title": "Heizungsanlage inspizieren",
  "description": "<p>Jährliche Inspektion der Heizungsanlage am Standort Zürich.</p>",
  "status": "OPEN",
  "priority": "HIGH",
  "listId": "list-personal-001",
  "assigneeId": "user-042",
  "createdById": "user-010",
  "dueDate": "2026-04-15",
  "projectId": "prj-2026-0015",
  "orderId": null,
  "parentTaskId": null,
  "subtaskCount": 0,
  "subtaskCompletedCount": 0,
  "noteCount": 0,
  "attachmentCount": 0,
  "createdAt": "2026-03-29T10:00:00Z",
  "updatedAt": "2026-03-29T10:00:00Z",
  "completedAt": null
}
```

**POST /api/v1/tasks/bulk** -- Request Body:
```json
{
  "taskIds": ["task-001", "task-002", "task-003"],
  "action": "SET_STATUS",
  "value": "COMPLETED"
}
```

Supported bulk actions: `SET_STATUS`, `SET_PRIORITY`, `SET_ASSIGNEE`, `MOVE_TO_LIST`, `DELETE`.

### 1.2 Subtasks

```
GET    /api/v1/tasks/{parentId}/subtasks             # List subtasks of a parent
POST   /api/v1/tasks/{parentId}/subtasks             # Create subtask
PATCH  /api/v1/tasks/{id}/promote                    # Promote subtask to top-level task
PATCH  /api/v1/tasks/{id}/reorder                    # Reorder subtasks within parent
```

**PATCH /api/v1/tasks/{id}/reorder** -- Request Body:
```json
{
  "subtaskIds": ["sub-003", "sub-001", "sub-002"]
}
```

### 1.3 Task Lists

```
GET    /api/v1/task-lists                            # List all task lists for current user
GET    /api/v1/task-lists/{id}                       # Get task list details
POST   /api/v1/task-lists                            # Create task list
PUT    /api/v1/task-lists/{id}                       # Update task list (name, color, icon)
DELETE /api/v1/task-lists/{id}                       # Delete task list (must be empty or force)
PATCH  /api/v1/task-lists/{id}/archive               # Archive task list
PATCH  /api/v1/task-lists/{id}/unarchive             # Unarchive task list
PATCH  /api/v1/task-lists/reorder                    # Reorder lists in sidebar
```

**POST /api/v1/task-lists** -- Request Body:
```json
{
  "name": "Site Visit Preparation",
  "color": "#4A90D9",
  "icon": "clipboard",
  "type": "PERSONAL"
}
```

### 1.4 Group Lists

```
POST   /api/v1/task-lists                            # Create group list (type: GROUP)
GET    /api/v1/task-lists/{id}/members                # List members of a group list
POST   /api/v1/task-lists/{id}/members                # Add member
PUT    /api/v1/task-lists/{id}/members/{userId}       # Change member role
DELETE /api/v1/task-lists/{id}/members/{userId}        # Remove member
POST   /api/v1/task-lists/{id}/leave                  # Leave group list (self)
POST   /api/v1/task-lists/{id}/transfer-ownership     # Transfer ownership
```

**POST /api/v1/task-lists/{id}/members** -- Request Body:
```json
{
  "userId": "user-042",
  "role": "EDITOR"
}
```

### 1.5 Task Notes (Comments)

```
GET    /api/v1/tasks/{taskId}/notes                  # List notes for a task
POST   /api/v1/tasks/{taskId}/notes                  # Add note
PUT    /api/v1/tasks/{taskId}/notes/{noteId}         # Edit note (within 15 min)
DELETE /api/v1/tasks/{taskId}/notes/{noteId}         # Delete note
```

**POST /api/v1/tasks/{taskId}/notes** -- Request Body:
```json
{
  "bodyHtml": "<p>Kunde hat bestätigt: Termin am 15.4. passt. @user-042 bitte Werkzeug vorbereiten.</p>",
  "mentions": ["user-042"]
}
```

### 1.6 Task Attachments

```
GET    /api/v1/tasks/{taskId}/attachments             # List attachments
POST   /api/v1/tasks/{taskId}/attachments             # Upload attachment (multipart)
DELETE /api/v1/tasks/{taskId}/attachments/{id}        # Remove attachment
GET    /api/v1/tasks/{taskId}/attachments/{id}/download  # Download attachment
```

### 1.7 Reminders

```
GET    /api/v1/tasks/{taskId}/reminders               # List reminders for a task
POST   /api/v1/tasks/{taskId}/reminders               # Add reminder
DELETE /api/v1/tasks/{taskId}/reminders/{id}          # Remove reminder
PUT    /api/v1/users/me/reminder-defaults              # Set default reminder preferences
GET    /api/v1/users/me/reminder-defaults              # Get default reminder preferences
```

**POST /api/v1/tasks/{taskId}/reminders** -- Request Body:
```json
{
  "type": "RELATIVE",
  "offsetMinutes": -1440,
  "channels": ["PUSH", "IN_APP"]
}
```

Or absolute:
```json
{
  "type": "ABSOLUTE",
  "fireAt": "2026-04-14T08:00:00Z",
  "channels": ["PUSH", "IN_APP", "EMAIL"]
}
```

### 1.8 Dashboard

```
GET    /api/v1/tasks/dashboard                        # Personal task dashboard
GET    /api/v1/tasks/dashboard/stats                  # Task statistics for current user
```

**Response for GET /api/v1/tasks/dashboard:**
```json
{
  "overdue": [ /* tasks */ ],
  "dueToday": [ /* tasks */ ],
  "upcoming": [ /* tasks due in next 7 days */ ],
  "recentlyCompleted": [ /* tasks completed in last 7 days */ ],
  "stats": {
    "totalOpen": 24,
    "completedThisWeek": 8,
    "overdueCount": 3
  }
}
```

### 1.9 Project/Order Task Integration

```
GET    /api/v1/projects/{projectId}/tasks             # List tasks linked to a project
GET    /api/v1/projects/{projectId}/tasks/summary      # Task completion summary for a project
GET    /api/v1/orders/{orderId}/tasks                  # List tasks linked to an order
POST   /api/v1/projects/{projectId}/tasks              # Create task linked to project
POST   /api/v1/orders/{orderId}/tasks                  # Create task linked to order
GET    /api/v1/projects/tasks/report                   # Cross-project task completion report
```

**Response for GET /api/v1/projects/{projectId}/tasks/summary:**
```json
{
  "projectId": "prj-2026-0015",
  "totalTasks": 18,
  "completedTasks": 12,
  "completionPercentage": 66.7,
  "statusDistribution": {
    "OPEN": 3,
    "IN_PROGRESS": 3,
    "COMPLETED": 12,
    "CANCELLED": 0
  },
  "overdueTasks": 1
}
```

### 1.10 Sync

```
GET    /api/v1/tasks/sync                             # Get changes since last sync timestamp
POST   /api/v1/tasks/sync/push                        # Push offline changes from mobile
```

**GET /api/v1/tasks/sync?since=2026-03-29T09:00:00Z** -- Returns all tasks modified since the given timestamp for the current user.

**POST /api/v1/tasks/sync/push** -- Request Body:
```json
{
  "changes": [
    {
      "localId": "local-uuid-001",
      "serverId": null,
      "action": "CREATE",
      "data": { /* task fields */ },
      "timestamp": "2026-03-29T09:30:00Z"
    },
    {
      "localId": null,
      "serverId": "task-042",
      "action": "UPDATE",
      "data": { "status": "COMPLETED" },
      "timestamp": "2026-03-29T09:35:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    { "localId": "local-uuid-001", "serverId": "task-099", "status": "CREATED" },
    { "localId": null, "serverId": "task-042", "status": "UPDATED" }
  ],
  "conflicts": []
}
```

---

## 2. Data Models

### 2.1 Entity Relationship Overview

```
User (1) ──── (N) TaskList (owner)
TaskList (1) ──── (N) Task
TaskList (1) ──── (N) TaskListMember (for GROUP lists)
Task (1) ──── (N) Task (subtasks via parent_task_id)
Task (1) ──── (N) TaskNote
Task (1) ──── (N) TaskAttachment
Task (1) ──── (N) TaskReminder
Task (N) ──── (1) User (assignee)
Task (N) ──── (1) User (creator)
Task (N) ──── (0..1) Project
Task (N) ──── (0..1) Order
TaskNote (N) ──── (N) User (mentions)
```

### 2.2 Task

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| title | VARCHAR(500) | NOT NULL | Task title |
| description | TEXT | | Rich text description (HTML) |
| status | ENUM('OPEN','IN_PROGRESS','COMPLETED','CANCELLED') | NOT NULL, DEFAULT 'OPEN' | |
| priority | ENUM('NONE','LOW','MEDIUM','HIGH','URGENT') | NOT NULL, DEFAULT 'NONE' | |
| list_id | UUID | FK -> TaskList.id, NOT NULL | Owning task list |
| assignee_id | UUID | FK -> User.id, NULLABLE | Assigned user |
| created_by_id | UUID | FK -> User.id, NOT NULL | Creator |
| parent_task_id | UUID | FK -> Task.id, NULLABLE | Parent task (for subtasks) |
| project_id | UUID | FK -> Project.id, NULLABLE | Linked project |
| order_id | UUID | FK -> Order.id, NULLABLE | Linked order |
| due_date | DATE | NULLABLE | Due date |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | Order within list/parent |
| depth | INTEGER | NOT NULL, DEFAULT 0 | Nesting depth (0=top-level, max 3) |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |
| completed_at | TIMESTAMP | NULLABLE | Completion timestamp |
| completed_by_id | UUID | FK -> User.id, NULLABLE | Who completed it |
| cancelled_at | TIMESTAMP | NULLABLE | |

**Indexes:**
- `idx_task_list (list_id)`
- `idx_task_assignee (assignee_id)`
- `idx_task_status (status)`
- `idx_task_due_date (due_date)`
- `idx_task_project (project_id)`
- `idx_task_order (order_id)`
- `idx_task_parent (parent_task_id)`
- `idx_task_updated (updated_at)` -- for sync queries
- `idx_task_search (title)` -- full-text

**Check constraint:** `depth <= 3`
**Check constraint:** `(project_id IS NULL) OR (order_id IS NULL)` -- a task links to at most one of project/order (or neither).

### 2.3 TaskList

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| name | VARCHAR(200) | NOT NULL | List name |
| type | ENUM('PERSONAL','GROUP') | NOT NULL | |
| owner_id | UUID | FK -> User.id, NOT NULL | List owner/creator |
| color | CHAR(7) | NULLABLE | Hex color code |
| icon | VARCHAR(50) | NULLABLE | Icon identifier |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | Sidebar display order |
| is_default | BOOLEAN | NOT NULL, DEFAULT FALSE | True for the user's default personal list |
| is_archived | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

**Constraint:** Each user has exactly one list where `is_default = TRUE`.

### 2.4 TaskListMember

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| list_id | UUID | FK -> TaskList.id, NOT NULL | |
| user_id | UUID | FK -> User.id, NOT NULL | |
| role | ENUM('VIEWER','EDITOR','ADMIN') | NOT NULL | |
| joined_at | TIMESTAMP | NOT NULL | |
| invited_by_id | UUID | FK -> User.id, NOT NULL | |

**Unique constraint:** `UNIQUE(list_id, user_id)`

### 2.5 TaskNote

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| task_id | UUID | FK -> Task.id, NOT NULL | |
| author_id | UUID | FK -> User.id, NOT NULL | |
| body_html | TEXT | NOT NULL | Rich text content |
| is_edited | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

### 2.6 TaskNoteMention

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| note_id | UUID | FK -> TaskNote.id, NOT NULL | |
| user_id | UUID | FK -> User.id, NOT NULL | Mentioned user |

### 2.7 TaskAttachment

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| task_id | UUID | FK -> Task.id, NOT NULL | |
| file_path | VARCHAR(500) | NOT NULL | Storage path |
| file_name | VARCHAR(200) | NOT NULL | Original file name |
| file_size | INTEGER | NOT NULL | Size in bytes (max 25 MB) |
| mime_type | VARCHAR(50) | NOT NULL | |
| uploaded_by_id | UUID | FK -> User.id, NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |

**Check constraint:** `file_size <= 26214400` (25 MB)

### 2.8 TaskReminder

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| task_id | UUID | FK -> Task.id, NOT NULL | |
| user_id | UUID | FK -> User.id, NOT NULL | Who receives the reminder |
| type | ENUM('RELATIVE','ABSOLUTE') | NOT NULL | |
| offset_minutes | INTEGER | NULLABLE | Negative = before due date (for RELATIVE) |
| fire_at | TIMESTAMP | NOT NULL | Computed absolute fire time |
| channels | VARCHAR[] | NOT NULL | Array of channels: PUSH, IN_APP, EMAIL |
| status | ENUM('PENDING','FIRED','SNOOZED','CANCELLED') | NOT NULL, DEFAULT 'PENDING' | |
| snoozed_until | TIMESTAMP | NULLABLE | If snoozed |
| fired_at | TIMESTAMP | NULLABLE | When the reminder actually fired |
| created_at | TIMESTAMP | NOT NULL | |

**Index:** `idx_reminder_fire_at (fire_at)` -- for the scheduler to query pending reminders.

### 2.9 TaskStatusHistory

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| task_id | UUID | FK -> Task.id, NOT NULL | |
| old_status | ENUM('OPEN','IN_PROGRESS','COMPLETED','CANCELLED') | | Previous status (NULL for creation) |
| new_status | ENUM('OPEN','IN_PROGRESS','COMPLETED','CANCELLED') | NOT NULL | New status |
| changed_by_id | UUID | FK -> User.id, NOT NULL | |
| changed_at | TIMESTAMP | NOT NULL | |

### 2.10 UserReminderDefaults

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | PK, FK -> User.id | |
| enabled | BOOLEAN | NOT NULL, DEFAULT TRUE | Auto-create reminders for new tasks with due dates |
| default_offset_minutes | INTEGER | NOT NULL, DEFAULT -1440 | Default: 1 day before |
| default_channels | VARCHAR[] | NOT NULL, DEFAULT '{PUSH,IN_APP}' | |

---

## 3. Event Flows

### 3.1 Domain Events

| Event | Trigger | Payload | Consumers |
|-------|---------|---------|-----------|
| `task.created` | Task created | Task ID, list ID, assignee, project/order | Notification (if assigned to another user), sync, project stats |
| `task.updated` | Task fields changed | Task ID, changed fields | Sync, project stats |
| `task.completed` | Task marked complete | Task ID, completed by, completed at | Notification (if creator != completer), sync, project stats |
| `task.reopened` | Completed task reopened | Task ID | Sync, project stats |
| `task.deleted` | Task deleted | Task ID | Sync |
| `task.assigned` | Assignee changed | Task ID, old assignee, new assignee | Notification (to new assignee) |
| `task.moved` | Task moved to different list | Task ID, old list, new list | Sync |
| `task.due_date_changed` | Due date set/changed | Task ID, old due date, new due date | Reminder recalculation |
| `task.overdue` | Task due date has passed | Task ID, assignee | Notification |
| `task.note.added` | Note added to task | Task ID, note ID, mentions | Notification (to mentioned users, to assignee) |
| `task.attachment.added` | File uploaded to task | Task ID, attachment ID | Sync |
| `task.reminder.fired` | Reminder triggers | Task ID, user ID, channels | Notification service |
| `task_list.created` | List created | List ID, owner | Sync |
| `task_list.member.added` | Member added to group list | List ID, user ID, role | Notification (to invited user) |
| `task_list.member.removed` | Member removed from group list | List ID, user ID | Notification, revoke access |

### 3.2 Task Completion Flow

```
User clicks checkbox / swipes right (mobile)
  │
  ▼
Client sends PATCH /api/v1/tasks/{id}/complete
  │
  ▼
Server checks: does task have incomplete subtasks?
  ├── No subtasks or all complete:
  │     └── Set status = COMPLETED, completed_at = now(), completed_by = user
  │
  └── Has incomplete subtasks:
        └── Return 409 Conflict with prompt options:
            ├── COMPLETE_ALL: complete parent + all subtasks
            ├── COMPLETE_PARENT_ONLY: complete parent, leave subtasks
            └── CANCEL: abort
        Client resends with ?subtaskAction=COMPLETE_ALL or COMPLETE_PARENT_ONLY
  │
  ▼
Server records TaskStatusHistory entry
  │
  ▼
Event: task.completed
  │
  ▼
Consumers:
  ├── Sync service: push update to all clients
  ├── Notification service: notify task creator if different from completer
  └── Project stats: recalculate project task completion percentage
```

### 3.3 Reminder Scheduling Flow

```
Task created/updated with due date + reminder config
  │
  ▼
Server calculates absolute fire_at:
  fire_at = due_date + offset_minutes (e.g., due April 15 + (-1440 min) = April 14 00:00)
  │
  ▼
TaskReminder record created (status: PENDING)
  │
  ▼
Reminder Scheduler (cron job or event-driven):
  Queries: SELECT * FROM task_reminder WHERE fire_at <= now() AND status = 'PENDING'
  │
  ▼
For each due reminder:
  ├── Emit event: task.reminder.fired
  ├── Notification service delivers via configured channels (PUSH, IN_APP, EMAIL)
  └── Set reminder status = FIRED, fired_at = now()
  │
  ▼
User receives notification:
  ├── Opens task directly from notification
  ├── Or snoozes: PATCH /api/v1/tasks/{taskId}/reminders/{id}/snooze?minutes=60
  │     └── Set status = SNOOZED, snoozed_until = now() + 60 min
  │           Scheduler will re-process when snoozed_until passes
  └── Or dismisses: no action needed
```

### 3.4 Web-Mobile Sync Flow

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Web App   │◄───────►│   Server     │◄───────►│  Mobile App  │
│ (WebSocket) │         │ (API + WS)   │         │ (API + Push) │
└─────────────┘         └──────────────┘         └──────────────┘

Online Sync:
  1. Client A makes a change (e.g., complete task)
  2. Client A sends API request (REST)
  3. Server processes, persists, emits domain event
  4. Server broadcasts change via WebSocket to all connected clients for this user
  5. Client B receives WebSocket message and updates local state

Offline Sync (Mobile):
  1. Mobile goes offline
  2. User makes changes locally (stored in local SQLite/Realm DB)
  3. Each change is queued with a local timestamp
  4. Mobile comes back online
  5. Mobile sends POST /api/v1/tasks/sync/push with queued changes
  6. Server processes each change:
     ├── No conflict: apply and return server ID
     └── Conflict (same field changed by another user):
           Apply last-write-wins, return conflict info
  7. Mobile fetches GET /api/v1/tasks/sync?since=<lastSyncTimestamp>
  8. Mobile applies server changes to local DB
  9. If conflicts: show notification to user with both versions

Conflict Resolution:
  - Last-write-wins based on change timestamp
  - Conflicting user is notified with: field name, their value, winning value
  - User can manually re-apply their change if needed
```

### 3.5 Project Integration Flow

```
Project manager opens Project in Module 04
  │
  ▼
"Tasks" tab loads: GET /api/v1/projects/{projectId}/tasks
  │
  ▼
Server returns all tasks where task.project_id = projectId
  │
  ▼
Tab displays tasks with filters (status, assignee, priority, due date)
  │
  ▼
Project overview widget calls: GET /api/v1/projects/{projectId}/tasks/summary
  │
  ▼
Returns: { totalTasks: 18, completedTasks: 12, completionPercentage: 66.7, ... }
  │
  ▼
Manager clicks "Close Project"
  │
  ▼
Module 04 calls: GET /api/v1/projects/{projectId}/tasks?status=OPEN,IN_PROGRESS
  │
  ├── No open tasks: proceed with closure
  │
  └── Open tasks exist:
        Display warning: "3 tasks are still open"
        Options:
        ├── Complete all open tasks
        ├── Cancel all open tasks
        └── Go back (do not close project)
```

---

## 4. Integration Points

### 4.1 Module 01 -- User Management
- Task assignees and creators reference User records.
- Default personal task list is auto-created via a hook on user provisioning: when `user.created` event fires, the task module creates a TaskList with `is_default=TRUE` for that user.
- User deactivation: tasks assigned to deactivated users are flagged; group list membership is revoked.

### 4.2 Module 04 -- Order/Project Management
- Tasks can be linked to projects via `project_id` and orders via `order_id`.
- The project "Tasks" tab is powered by `GET /api/v1/projects/{projectId}/tasks`.
- Task completion summary is exposed via `GET /api/v1/projects/{projectId}/tasks/summary`.
- Project closure checks for open tasks before proceeding.
- **Template tasks:** Project templates (if supported by Module 04) can include task templates. When a project is instantiated from a template, the task module receives a `project.created_from_template` event and creates the predefined tasks.

### 4.3 Module 05 -- Scheduling
- Tasks with due dates may appear as reference items in scheduling views (read-only).
- No bidirectional sync -- scheduling events and tasks are separate entities.
- If a scheduling module calendar view exists, tasks can optionally be displayed as secondary items.

### 4.4 Module 07 -- Field-Service Reports
- Field technicians may have tasks linked to service appointments (e.g., "Inspect boiler at site X").
- Completing a field-service report can trigger task completion if a linked task exists.
- The service report can reference the task ID for traceability.

### 4.5 Module 13 -- Notifications
- All task notifications (assignment, reminders, overdue, mentions, completion) are delivered via the platform notification service.
- Notification channels: push notification (mobile), in-app notification (web + mobile), email (optional, per user preference).
- Notification payloads include a deep-link to the specific task.

### 4.6 Mobile App
- **Local storage:** Tasks are cached in a local database (SQLite or Realm) for offline access.
- **Background sync:** The mobile app periodically syncs with the server in the background using the sync API.
- **Push notifications:** Firebase Cloud Messaging (FCM) for Android, Apple Push Notification Service (APNS) for iOS.
- **Real-time updates:** WebSocket connection when the app is in the foreground.

---

## 5. Non-Functional Considerations

### 5.1 Performance
- Task list loading: < 1 second for up to 500 tasks per list.
- Dashboard loading: < 2 seconds.
- Quick-add task creation: < 1 second end-to-end.
- Full-text search: < 500 ms for up to 50,000 tasks.
- Sync endpoint: < 2 seconds for delta sync of up to 1,000 changed tasks.
- WebSocket message delivery: < 500 ms from server to connected client.

### 5.2 Offline Support
- Mobile app must support full task read access while offline.
- Task creation and status changes must be possible offline with queued sync.
- Notes can be added offline; file uploads are queued for upload when online.
- Maximum offline queue size: 500 changes before forced sync.

### 5.3 Security
- Permissions: `tasks:manage` (own tasks), `tasks:manage:all` (admin -- all tasks), `tasks:lists:manage`.
- Group list access is governed by TaskListMember records.
- Users can only view tasks in lists they own or are members of, or tasks assigned to them.
- Project task visibility follows the project access control from Module 04.

### 5.4 Real-Time
- WebSocket connection for real-time updates on web and mobile (foreground).
- Heartbeat interval: 30 seconds.
- Automatic reconnection with exponential backoff on connection loss.
- Server-sent events (SSE) as a fallback if WebSocket is unavailable.

### 5.5 Data Retention
- Completed tasks are retained indefinitely (no auto-deletion).
- Deleted tasks are soft-deleted and retained for 90 days before permanent removal.
- Task attachments follow the platform's global file retention policy.
- Task status history is retained for the lifetime of the task.
