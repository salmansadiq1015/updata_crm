'use client';

import { ErrorBoundary } from '@/shared/components/error-boundary';

/**
 * CRM route group layout. Client-rendered so route transitions within /crm/*
 * skip the server round-trip (the pages are auth-gated CSR dashboards anyway).
 * The ErrorBoundary keeps a crashing panel contained to the CRM section.
 */
export default function CrmLayout({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
