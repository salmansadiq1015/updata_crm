import { TaskWorkspace } from '@/modules/tasks/ui/task-workspace';

// The merged tasks page: the former dashboard's status tiles head the list and
// filter it, and its analysis blocks fold away below them. No listId, so it
// spans every list the user can see.
export default function TasksPage() {
  return <TaskWorkspace />;
}
