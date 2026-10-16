// AsyncStorage adapter for non-sensitive preferences. Failures degrade to
// defaults instead of breaking startup.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

import { logger } from '@/services/logging/logger';

export const preferencesStorage: StateStorage = {
  async getItem(key) {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      logger.warn('preferences.read_failed', { key, error });
      return null;
    }
  },
  async setItem(key, value) {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      logger.warn('preferences.write_failed', { key, error });
    }
  },
  async removeItem(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      logger.warn('preferences.remove_failed', { key, error });
    }
  },
};
