import * as Sentry from '@sentry/react-native';

export function initMonitoring() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
  if (!dsn) return;

  Sentry.init({
    dsn,
    enableNative: true,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
    tracesSampleRate: 0.1,
    // Keep this quiet by default; enable if debugging prod startup.
    debug: false,
  });
}

