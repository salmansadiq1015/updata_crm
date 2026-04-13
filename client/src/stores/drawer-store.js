import { create } from 'zustand';

export const useDrawerStore = create((set) => ({
  isOpen: false,
  content: null,
  title: '',
  openDrawer: ({ title, content }) => set({ isOpen: true, title, content }),
  closeDrawer: () => set({ isOpen: false, content: null, title: '' }),
}));
