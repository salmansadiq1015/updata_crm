import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/**
 * Client for the Chrome Extension connect endpoints. These are thin wrappers
 * over the existing authenticated API (apiClient injects the session token and
 * unwraps the `{ success, data }` envelope). The browser↔extension messaging
 * lives in `use-extension-connection.ts`; this file only talks to the CRM.
 */

export type ExtensionConnectionInfo = {
  id: string;
  instanceId: string;
  status: 'connected' | 'revoked' | 'error';
  extensionVersion: string | null;
  browser: string | null;
  os: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
};

export type ExtensionStatus = {
  connected: boolean;
  error?: string;
  extensionId: string;
  connection: ExtensionConnectionInfo | null;
};

export type ExtensionPairing = {
  grant: string;
  extensionId: string;
  expiresInSec: number;
};

type Envelope<T> = { data: T };

export const extensionApi = {
  /** Current user's extension connection state (authoritative "Connected"). */
  async getStatus(): Promise<ExtensionStatus> {
    const res = (await apiClient.get(ENDPOINTS.EXTENSION.STATUS)) as Envelope<ExtensionStatus>;
    return res.data;
  },

  /** Mint a one-time pairing grant to hand to the extension. */
  async createPairing(): Promise<ExtensionPairing> {
    const res = (await apiClient.post(ENDPOINTS.EXTENSION.PAIRING)) as Envelope<ExtensionPairing>;
    return res.data;
  },

  /** Revoke this (or, with no id, every) extension link for the current user. */
  async disconnect(connectionId?: string): Promise<{ disconnected: number }> {
    const res = (await apiClient.post(
      ENDPOINTS.EXTENSION.DISCONNECT,
      connectionId ? { connectionId } : {},
    )) as Envelope<{ disconnected: number }>;
    return res.data;
  },
};
