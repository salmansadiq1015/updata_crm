'use client';

export function ChatShell({ sidebar, children }) {
  return (
    <div className="flex h-full overflow-hidden">
      {sidebar}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {children}
      </div>
    </div>
  );
}
