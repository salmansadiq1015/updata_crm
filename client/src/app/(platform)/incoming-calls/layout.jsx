// Full-height shell like /ai-calling: the workspace owns its own scrolling, so the
// platform layout's content padding is cancelled here.
export default function IncomingCallsLayout({ children }) {
  return (
    <div className="-m-4 h-[calc(100%+2rem)] min-h-0 overflow-hidden sm:-m-6 sm:h-[calc(100%+3rem)]">
      {children}
    </div>
  );
}
