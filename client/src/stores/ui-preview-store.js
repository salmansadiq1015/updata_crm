import { create } from 'zustand';

/**
 * Testmodus (Key User): preview the UI configuration of another role without
 * logging in as another user. Holds the previewed role's name + uiConfig;
 * cleared on "Beenden" or page reload (deliberately not persisted).
 */
export const useUiPreviewStore = create((set) => ({
  preview: null, // { roleId, roleName, config } | null
  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),
}));
