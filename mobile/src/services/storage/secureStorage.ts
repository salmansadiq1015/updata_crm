// Session material only, encrypted with an Android Keystore key (expo-secure-store).
import * as SecureStore from 'expo-secure-store';

import { SECURE_KEYS } from '@/constants/storageKeys';

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Not readable until the device has been unlocked once after boot.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const secureStorage = {
  getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_KEYS.refreshToken, OPTIONS);
  },
  setRefreshToken(token: string): Promise<void> {
    return SecureStore.setItemAsync(SECURE_KEYS.refreshToken, token, OPTIONS);
  },
  async clear(): Promise<void> {
    await Promise.all(Object.values(SECURE_KEYS).map((key) => SecureStore.deleteItemAsync(key, OPTIONS)));
  },
};
