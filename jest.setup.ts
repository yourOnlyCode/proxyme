// Jest setup for Expo/React Native app.

// Ensure app env vars exist for modules that initialize on import (Supabase client, etc).
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

// Silence noisy native warnings in test output (optional).
jest.spyOn(console, 'warn').mockImplementation((...args) => {
  const msg = String(args?.[0] ?? '');
  if (msg.includes('Animated: `useNativeDriver`')) return;
  // eslint-disable-next-line no-console
  console.warn(...args);
});

jest.spyOn(console, 'error').mockImplementation((...args) => {
  // eslint-disable-next-line no-console
  console.error(...args);
});

// Some RN versions relocate this module; provide a virtual mock to avoid resolution failures.
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}), { virtual: true });

// Reanimated mock recommended by library.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// AsyncStorage mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Expo SecureStore mock (used by Supabase adapter).
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// Expo WebBrowser + Linking are used in OAuth flows.
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'proxybusiness://auth/callback'),
  parse: jest.fn(() => ({ queryParams: {} })),
}));

// Expo Router hooks (so screens can render in tests).
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useFocusEffect: (cb: any) => cb?.(),
  useLocalSearchParams: () => ({}),
}));

// Location / Notifications are used in providers; default to safe no-ops.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 0, longitude: 0 },
  })),
  reverseGeocodeAsync: jest.fn(async () => []),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationHandler: jest.fn(),
}));

