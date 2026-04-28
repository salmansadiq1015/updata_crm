'use client';

import { useRouter } from 'next/navigation';
import { MessageSquare, ChevronRight, Wifi, WifiOff } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useOrderList } from '@/modules/mobile/hooks/use-order-queries';
import { useNetworkStatus } from '@/modules/mobile/hooks/use-network-status';
import { cn } from '@/lib/utils';

function ProjectCard({ project, lastMessage, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
        'hover:bg-muted/50 active:bg-muted/70 border-b border-border last:border-0'
      )}
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 shrink-0">
        <MessageSquare className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{project.name || project.project_name}</p>
        {lastMessage && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{lastMessage}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function ProjectSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            <div className="h-3 w-48 bg-muted rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChatLandingPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const isOnline = useNetworkStatus();

  const { data, isLoading, isError, refetch } = useOrderList();

  const orders = Array.isArray(data) ? data : data?.items || data?.orders || [];

  // Deduplicate projects from orders
  const projectMap = new Map();
  for (const order of orders) {
    const id = order.project_id;
    if (id && !projectMap.has(id)) {
      projectMap.set(id, {
        id,
        name: order.project_name || order.project?.name || `Project ${id}`,
      });
    }
  }
  const projects = Array.from(projectMap.values());

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={lang === 'de' ? 'Chat' : 'Chat'}
        right={
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {isOnline ? (
              <Wifi className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <ProjectSkeleton />
        ) : isError ? (
          <div className="px-4 py-8">
            <EmptyState
              variant="error"
              title={lang === 'de' ? 'Fehler beim Laden' : 'Failed to load'}
              description={lang === 'de' ? 'Projekte konnten nicht geladen werden.' : 'Could not load projects.'}
              action={
                <button
                  onClick={() => refetch()}
                  className="mt-3 text-sm text-primary underline underline-offset-2"
                >
                  {lang === 'de' ? 'Erneut versuchen' : 'Try again'}
                </button>
              }
            />
          </div>
        ) : projects.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              variant="empty"
              title={lang === 'de' ? 'Kein aktiver Chat' : 'No active chats'}
              description={
                lang === 'de'
                  ? 'Sobald Sie Aufträgen mit Projekten zugewiesen werden, erscheinen diese hier.'
                  : 'Projects you are assigned to will appear here.'
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => router.push(`/chat/${project.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
