'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Execute voice command navigation/search targets on the client (AI-007).
 */
export function useVoiceCommandRouter() {
  const router = useRouter();

  const executeCommand = useCallback((result) => {
    if (!result) return false;

    const action = result.action || result.actionType;
    const target = result.recordType || result.actionTarget || result.target;

    if (action === 'update_status') {
      return true;
    }

    if (action === 'NAVIGATE' && target) {
      if (target === 'help:commands') return false;
      router.push(target);
      return true;
    }

    if (action === 'SEARCH' && target) {
      const path = target.includes('?') ? target : `${target}?search=1`;
      router.push(path);
      return true;
    }

    if (action === 'CREATE' && target === '/orders/create') {
      router.push('/orders/create');
      return true;
    }

    if (typeof target === 'string' && target.startsWith('/')) {
      router.push(target);
      return true;
    }

    return false;
  }, [router]);

  return { executeCommand };
}
