import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHECK_EVERY_MS = 1000 * 60 * 60 * 12; // 12 hours
const LAST_CHECK_KEY = (userId: string) => `cityMilestones:lastCheckedAt:${userId}`;
const LAST_MILESTONE_KEY = (userId: string, cityKey: string) => `cityMilestones:lastMilestone:${userId}:${cityKey}`;

const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000, 50000, 100000, 500000, 1000000, 2500000, 5000000, 10000000] as const;

function normalizeCityKey(city: string, state?: string | null) {
  return `${city}`.trim().toLowerCase() + '|' + `${state || ''}`.trim().toLowerCase();
}

function pickMilestone(count: number): number {
  let m = 0;
  for (const x of MILESTONES) {
    if (count >= x) m = x;
  }
  return m;
}

function copyForMilestone(city: string, milestone: number) {
  const prettyCity = city.trim();
  return {
    title: `${prettyCity} hit ${milestone} people!`,
    body:
      "Proxyme is growing because of you. Your city is coming alive—open City and connect with someone today.",
    data: { url: '/(tabs)/feed', city: prettyCity, milestone },
  };
}

export async function checkAndNotifyCityMilestones(userId: string) {
  const now = Date.now();
  const lastCheckedRaw = await AsyncStorage.getItem(LAST_CHECK_KEY(userId));
  const lastChecked = Number(lastCheckedRaw || 0);
  if (Number.isFinite(lastChecked) && lastChecked > 0 && now - lastChecked < CHECK_EVERY_MS) return;

  // Best-effort: stamp first to avoid spamming if the query is slow/retried.
  await AsyncStorage.setItem(LAST_CHECK_KEY(userId), String(now));

  const { data: me, error: meErr } = await supabase
    .from('profiles')
    .select('city, state, is_onboarded')
    .eq('id', userId)
    .maybeSingle();
  if (meErr) return;

  const city = (me as any)?.city as string | null | undefined;
  const state = (me as any)?.state as string | null | undefined;
  const isOnboarded = (me as any)?.is_onboarded ?? true;
  if (!isOnboarded) return;
  if (!city || !city.trim()) return;

  // Count onboarded profiles in the same city (state optional).
  let q: any = supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('city', city)
    .eq('is_onboarded', true);
  if (state && state.trim()) q = q.eq('state', state);
  const { count, error } = await q;
  if (error) return;

  const cityCount = Number(count || 0);
  if (!Number.isFinite(cityCount) || cityCount <= 0) return;

  const milestone = pickMilestone(cityCount);
  if (milestone <= 0) return;

  const cityKey = normalizeCityKey(city, state);
  const lastMilestoneRaw = await AsyncStorage.getItem(LAST_MILESTONE_KEY(userId, cityKey));
  const lastMilestone = Number(lastMilestoneRaw || 0);
  if (Number.isFinite(lastMilestone) && milestone <= lastMilestone) return;

  const { title, body, data } = copyForMilestone(city, milestone);
  const insert = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'city_milestone',
    title,
    body,
    data,
    read: false,
    created_at: new Date().toISOString(),
  } as any);

  // If the notifications table/constraint isn't deployed yet, don't keep trying every app open.
  if ((insert as any)?.error) {
    await AsyncStorage.setItem(LAST_MILESTONE_KEY(userId, cityKey), String(milestone));
    return;
  }

  await AsyncStorage.setItem(LAST_MILESTONE_KEY(userId, cityKey), String(milestone));
}

