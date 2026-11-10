// Full-height canvas: the builder owns its own scrolling, so the platform
// layout's content padding is cancelled here (same pattern as /ai-calling).
export default function WorkflowBuilderLayout({ children }) {
  return (
    <div className="-m-4 h-[calc(100%+2rem)] min-h-0 overflow-hidden sm:-m-6 sm:h-[calc(100%+3rem)]">
      {children}
    </div>
  );
}
