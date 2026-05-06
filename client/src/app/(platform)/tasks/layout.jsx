export default function TasksLayout({ children }) {
  return (
    <div className="-m-4 h-[calc(100%+2rem)] min-h-0 overflow-hidden sm:-m-6 sm:h-[calc(100%+3rem)]">
      {children}
    </div>
  );
}
