import { Redirect } from 'expo-router';

/**
 * Legacy route kept for compatibility.
 *
 * We previously had two inbox implementations:
 * - `/inbox` (this file)
 * - `/(tabs)/inbox` (the canonical, newer implementation with notifications)
 *
 * Keep `/inbox` as a thin redirect so any existing links (e.g. router.push('/inbox'))
 * land on the single canonical screen.
 */
export default function Inbox() {
  return <Redirect href="/(tabs)/inbox" />;
}

