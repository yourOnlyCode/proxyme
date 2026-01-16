import { useResolvedColorScheme } from '@/components/ThemePreferenceProvider';

/**
 * App-wide color scheme hook.
 * - Defaults to System
 * - Can be overridden in Settings (stored locally)
 */
export function useColorScheme() {
  return useResolvedColorScheme();
}
