// The user's AI agent defaults live on the user record (preferences.aiAgentDefaults):
// GET /users/me returns them, PATCH /users/me/preferences replaces them. The server
// validates them with the AI calling campaign rules, so they are campaign-valid.
import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

import { meDefaultsSchema, preferencesResponseSchema, type AgentDefaultsInput } from '../types';

export const callAgentApi = {
  /** null when the user never saved defaults. */
  async defaults(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.users.me, meDefaultsSchema, { signal });
    return data;
  },
  /** Other preferences are untouched: the server merges only the keys sent. */
  async saveDefaults(input: AgentDefaultsInput) {
    const { data } = await api.patch(
      ENDPOINTS.users.preferences,
      { aiAgentDefaults: input },
      preferencesResponseSchema,
    );
    return data;
  },
};
