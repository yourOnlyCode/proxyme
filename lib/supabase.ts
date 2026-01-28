import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return Promise.resolve(null);
      return Promise.resolve(localStorage.getItem(key));
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return Promise.resolve();
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return Promise.resolve();
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const isTestEnv = !!process.env.JEST_WORKER_ID;

export const supabase = createClient(url, key, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    // Avoid background timers in Jest.
    autoRefreshToken: !isTestEnv,
    persistSession: !isTestEnv,
    // On web, Supabase completes OAuth by parsing the redirect URL and exchanging the code.
    // On native, we handle the exchange manually in lib/socialAuth.ts (via openAuthSessionAsync).
    detectSessionInUrl: Platform.OS === 'web',
  },
});
