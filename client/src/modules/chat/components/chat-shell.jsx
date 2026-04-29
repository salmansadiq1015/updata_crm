export function ChatShell({ sidebar, children }) {
  return (
    <div className="flex h-full overflow-hidden bg-background">
      <div className="hidden md:flex w-80 shrink-0 flex-col border-r border-border/40">
        {sidebar}
      </div>
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {children}
      </div>
    </div>
  );
}
