import { redirect } from 'next/navigation';

// The dashboard was merged into the tasks page: its status tiles head the list
// and its analysis blocks fold away there. Old links and bookmarks land on the
// merged page rather than a dead route.
export default function TaskDashboardRedirect() {
  redirect('/tasks');
}
