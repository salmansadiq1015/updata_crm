// Every persisted key in one place, so logout can clear exactly what it owns.

/** Android Keystore-backed (expo-secure-store). Keys may only contain [A-Za-z0-9._-]. */
export const SECURE_KEYS = {
  refreshToken: 'updata.session.refreshToken',
} as const;

/**
 * AsyncStorage — non-sensitive only, with two documented exceptions: the per-user
 * communication outbox (call notes awaiting sync) and the per-user SIM call queue (lead
 * names and outcomes). Both are suffixed with the user id, never loaded for another
 * user, and deleted when that user signs out.
 */
export const STORAGE_KEYS = {
  preferences: 'updata.preferences',
  communicationOperations: 'updata.communication.operations.v1',
  callQueue: 'updata.callQueue.v1',
  callCampaignOutbox: 'updata.callCampaign.outbox.v1',
} as const;
