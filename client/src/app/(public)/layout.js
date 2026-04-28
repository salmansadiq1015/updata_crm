/**
 * Public layout — renders children without the platform shell (no sidebar, no auth).
 * Used for embeddable widgets and public-facing pages.
 */
export default function PublicLayout({ children }) {
  return <>{children}</>;
}
