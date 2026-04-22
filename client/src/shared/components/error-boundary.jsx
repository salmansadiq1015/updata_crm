'use client';

import React from 'react';
import { ErrorFallback } from '@/shared/components/error-fallback';

/**
 * Classic React error boundary — catches render-time errors only.
 * Data-fetch errors are handled by react-query's `error` state; use this
 * boundary to keep a crashing panel from taking down the whole route.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep a console trace so devs see it during smoke tests.
    // Production should forward this to Sentry/Datadog via an observer.
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', error, info);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const Fallback = this.props.fallback || ErrorFallback;
      return <Fallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}
