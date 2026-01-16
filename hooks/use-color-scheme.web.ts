import { useResolvedColorScheme } from '@/components/ThemePreferenceProvider';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  return useResolvedColorScheme();
}
