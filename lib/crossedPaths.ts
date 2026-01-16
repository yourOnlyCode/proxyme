import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as ExpoLocation from 'expo-location';
import { supabase } from '@/lib/supabase';

export type CrossedPathRow = {
  id?: string;
  user_id: string;
  crossed_user_id: string;
  address_label: string;
  address_key: string;
  day_key: string; // YYYY-MM-DD
  seen_at: string; // ISO
};

export type CrossedPathGroup = {
  day_key: string; // YYYY-MM-DD
  place_key: string;
  address_label: string | null;
  last_seen: string; // ISO
};

export type CrossedPathPerson = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  relationship_goals: string[] | null;
  match_percent: number;
  same_intent: boolean;
  last_seen: string;
  cursor_intent: number;
  cursor_match: number;
  cursor_seen_at: string;
  cursor_user_id: string;
};

export type CrossedPathProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean | null;
};

const STORAGE_KEY_PREFIX = 'crossedPaths:v1:';
const STORAGE_SEEN_PREFIX = 'crossedPaths:seenIds:v1:';
const STORAGE_VISITS_PREFIX = 'crossedPaths:visits:v1:';

const inMemorySeen = new Map<string, Set<string>>();

function looksLikeMissingTable(error: any) {
  // PostgREST missing table: 42P01
  return error?.code === '42P01' || `${error?.message ?? ''}`.toLowerCase().includes('does not exist');
}

function looksLikeMissingRpc(error: any) {
  // PostgREST missing function: 42883 or "Could not find the function"
  return error?.code === '42883' || `${error?.message ?? ''}`.toLowerCase().includes('could not find the function');
}

export function formatAddressLabel(address: ExpoLocation.LocationGeocodedAddress | null): string | null {
  if (!address) return null;
  const a: any = address as any;

  // Display label should NOT reveal an exact street number.
  // Prefer a true venue/place name. If not available, show a redacted "block of street" label.
  const name = String(a.name ?? '').trim();
  const streetNumber = String(a.streetNumber ?? '').trim();
  const street = String(a.street ?? '').trim();

  const city = String(a.city ?? '').trim();
  const region = String(a.region ?? '').trim();

  const isNameStreety =
    !name ||
    /^\d+$/.test(name) ||
    // Sometimes reverse geocode returns a literal address line as the "name".
    (/\d+/.test(name) && (name.includes(' ') || name.includes(',')));

  const primary = (() => {
    if (!isNameStreety) return name;
    if (streetNumber && street) {
      const n = parseInt(streetNumber, 10);
      if (Number.isFinite(n)) {
        const block = Math.floor(n / 100) * 100;
        return `${street} (${block} block)`;
      }
      return street; // non-numeric street number, still redact
    }
    return city;
  })();

  const secondaryParts = [primary !== city ? city : '', region].filter(Boolean);
  const secondary = secondaryParts.join(', ');

  const label = [primary, secondary].filter(Boolean).join(' • ').trim();
  return label || null;
}

function placeKeyInput(params: {
  addressLabel: string;
  address?: ExpoLocation.LocationGeocodedAddress | null;
  location?: { lat: number; long: number } | null;
}): string {
  const a: any = params.address as any;

  const name = String(a?.name ?? '').trim();
  const streetNumber = String(a?.streetNumber ?? '').trim();
  const street = String(a?.street ?? '').trim();
  const streetLine = `${streetNumber} ${street}`.trim();

  const city = String(a?.city ?? '').trim();
  const region = String(a?.region ?? '').trim();
  const postalCode = String(a?.postalCode ?? '').trim();
  const country = String(a?.country ?? '').trim();

  // If we have a numbered address, key off the address components (exact place, no coordinates stored).
  if (streetNumber && street) {
    return `${streetLine}|${postalCode}|${city}|${region}|${country}`;
  }

  // If we have a true venue name, include a snapped lat/long so "Smileys Bar" in two different towns doesn't collide.
  const lat = params.location?.lat;
  const long = params.location?.long;
  const hasGeo = Number.isFinite(lat) && Number.isFinite(long);
  const geo = hasGeo ? `${Number(lat).toFixed(4)},${Number(long).toFixed(4)}` : 'nogeo';

  const safeName = name && !/^\d+$/.test(name) ? name : params.addressLabel;
  return `${safeName}|${postalCode}|${city}|${region}|${country}|${geo}`;
}

export function dayKeyLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeKey(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function hashKey(s: string): string {
  // Simple stable hash (djb2) for onConflict keying without heavy deps.
  const str = normalizeKey(s);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) + hash + str.charCodeAt(i);
  return `h${(hash >>> 0).toString(16)}`;
}

export function computePlaceKeyHash(params: {
  addressLabel: string;
  address?: ExpoLocation.LocationGeocodedAddress | null;
  location?: { lat: number; long: number } | null;
}): string {
  return hashKey(placeKeyInput({ addressLabel: params.addressLabel, address: params.address ?? null, location: params.location ?? null }));
}

export async function recordVisit(params: {
  viewerId: string;
  addressLabel: string | null;
  address?: ExpoLocation.LocationGeocodedAddress | null;
  location?: { lat: number; long: number } | null;
  seenAt?: Date;
}): Promise<void> {
  // Writes a single (user, place, day) "visit" row for scalable Crossed Paths.
  const addressLabel = params.addressLabel?.trim() || null;
  if (!addressLabel) return;

  const seenAt = params.seenAt ?? new Date();
  const day_key = dayKeyLocal(seenAt);
  const place_key = computePlaceKeyHash({ addressLabel, address: params.address ?? null, location: params.location ?? null });
  const seen_at = seenAt.toISOString();

  // Primary: Supabase table
  const { error } = await supabase
    .from('crossed_path_visits')
    .upsert(
      {
        user_id: params.viewerId,
        place_key,
        day_key,
        seen_at,
        address_label: addressLabel,
      } as any,
      { onConflict: 'user_id,day_key,place_key' },
    );

  if (!error) return;

  // Fallback: local storage (per device) if table isn't deployed yet.
  if (!looksLikeMissingTable(error)) return;
  const key = `${STORAGE_VISITS_PREFIX}${params.viewerId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const existing: Array<{ user_id: string; place_key: string; day_key: string; seen_at: string; address_label: string | null }> = raw
      ? (JSON.parse(raw) as any[])
      : [];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const kept = (existing || []).filter((r) => new Date(r.seen_at).getTime() >= weekAgo);

    const sig = new Set(kept.map((r) => `${r.user_id}|${r.day_key}|${r.place_key}`));
    const sigKey = `${params.viewerId}|${day_key}|${place_key}`;
    if (!sig.has(sigKey)) {
      kept.push({ user_id: params.viewerId, place_key, day_key, seen_at, address_label: addressLabel });
    } else {
      // Update seen_at to latest
      for (const r of kept) {
        if (`${r.user_id}|${r.day_key}|${r.place_key}` === sigKey) {
          r.seen_at = seen_at;
          r.address_label = addressLabel;
        }
      }
    }
    await AsyncStorage.setItem(key, JSON.stringify(kept));
  } catch {
    // ignore
  }
}

// Legacy writer (v1): writes per-user crossed_paths rows.
export async function recordCrossedPaths(params: {
  viewerId: string;
  addressLabel: string | null;
  address?: ExpoLocation.LocationGeocodedAddress | null;
  location?: { lat: number; long: number } | null;
  profiles: CrossedPathProfile[];
  seenAt?: Date;
}): Promise<void> {
  const { viewerId, profiles } = params;
  const addressLabel = params.addressLabel?.trim() || null;
  if (!addressLabel) return;
  if (!profiles || profiles.length === 0) return;

  const seenAt = params.seenAt ?? new Date();
  const day_key = dayKeyLocal(seenAt);
  // "Exact place" fingerprint: address when available, otherwise venue name + snapped geo.
  // We store ONLY the hash as the key; no raw coordinates go into the DB.
  const address_key = computePlaceKeyHash({ addressLabel, address: params.address ?? null, location: params.location ?? null });
  const seen_at = seenAt.toISOString();

  const seenKey = `${viewerId}:${day_key}:${address_key}`;
  let seenSet = inMemorySeen.get(seenKey);
  if (!seenSet) {
    seenSet = new Set<string>();
    inMemorySeen.set(seenKey, seenSet);
    // Best-effort hydrate from disk so we don't re-write on app restart.
    try {
      const raw = await AsyncStorage.getItem(`${STORAGE_SEEN_PREFIX}${seenKey}`);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      for (const id of parsed || []) if (typeof id === 'string') seenSet.add(id);
    } catch {
      // ignore
    }
  }

  // Only record *new* people for this venue/day (prevents repeated writes on feed refresh).
  const newProfiles = profiles
    .filter((p) => !!p?.id && p.id !== viewerId)
    .filter((p) => !seenSet!.has(p.id))
    .slice(0, 80);

  if (newProfiles.length === 0) return;

  const rows: CrossedPathRow[] = newProfiles.map((p) => ({
    user_id: viewerId,
    crossed_user_id: p.id,
    address_label: addressLabel,
    address_key,
    day_key,
    seen_at,
  }));

  if (rows.length === 0) return;

  // Primary: Supabase table.
  const { error } = await supabase.from('crossed_paths').upsert(rows as any, { onConflict: 'user_id,crossed_user_id,day_key,address_key' });

  if (!error) {
    for (const p of newProfiles) seenSet.add(p.id);
    void AsyncStorage.setItem(`${STORAGE_SEEN_PREFIX}${seenKey}`, JSON.stringify(Array.from(seenSet))).catch(() => {});
    return;
  }

  // Fallback: local storage (per device)
  if (!looksLikeMissingTable(error)) {
    // If table exists but request failed, don't silently cache mismatched data.
    return;
  }

  const key = `${STORAGE_KEY_PREFIX}${viewerId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const existing: CrossedPathRow[] = raw ? (JSON.parse(raw) as CrossedPathRow[]) : [];
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const kept = existing.filter((r) => new Date(r.seen_at).getTime() >= weekAgo);
    const sig = new Set(kept.map((r) => `${r.crossed_user_id}|${r.day_key}|${r.address_key}`));
    for (const r of rows) {
      const k = `${r.crossed_user_id}|${r.day_key}|${r.address_key}`;
      if (!sig.has(k)) {
        kept.push(r);
        sig.add(k);
      }
    }
    await AsyncStorage.setItem(key, JSON.stringify(kept));
    for (const p of newProfiles) seenSet.add(p.id);
    await AsyncStorage.setItem(`${STORAGE_SEEN_PREFIX}${seenKey}`, JSON.stringify(Array.from(seenSet)));
  } catch {
    // ignore
  }
}

// Legacy reader (v1): reads per-user crossed_paths rows.
export async function fetchCrossedPaths(params: { viewerId: string }): Promise<CrossedPathRow[]> {
  const { viewerId } = params;
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('crossed_paths')
    .select('user_id,crossed_user_id,address_label,address_key,day_key,seen_at')
    .eq('user_id', viewerId)
    .gte('seen_at', sinceIso)
    .order('day_key', { ascending: false })
    .order('seen_at', { ascending: false });

  if (!error) return (data as any as CrossedPathRow[]) || [];

  if (!looksLikeMissingTable(error)) return [];

  const key = `${STORAGE_KEY_PREFIX}${viewerId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CrossedPathRow[];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (parsed || []).filter((r) => new Date(r.seen_at).getTime() >= weekAgo);
  } catch {
    return [];
  }
}

export async function fetchCrossedPathGroups(): Promise<CrossedPathGroup[]> {
  const { data, error } = await supabase.rpc('get_my_crossed_paths_groups', {});
  if (!error) {
    return ((data as any[]) || []).map((r) => ({
      day_key: String(r.day_key),
      place_key: String(r.place_key),
      address_label: (r.address_label as string | null) ?? null,
      last_seen: String(r.last_seen),
    }));
  }
  if (looksLikeMissingRpc(error) || looksLikeMissingTable(error)) return [];
  return [];
}

export async function fetchCrossedPathPeople(params: {
  day_key: string;
  place_key: string;
  limit?: number;
  cursor?: { intent: number; match: number; seen_at: string; user_id: string } | null;
}): Promise<CrossedPathPerson[]> {
  const payload: any = {
    p_day: params.day_key,
    p_place_key: params.place_key,
    p_limit: params.limit ?? 30,
    p_cursor_intent: params.cursor?.intent ?? null,
    p_cursor_match: params.cursor?.match ?? null,
    p_cursor_seen_at: params.cursor?.seen_at ?? null,
    p_cursor_user_id: params.cursor?.user_id ?? null,
  };
  const { data, error } = await supabase.rpc('get_crossed_paths_people', payload);
  if (!error) return (data as any as CrossedPathPerson[]) || [];
  if (looksLikeMissingRpc(error) || looksLikeMissingTable(error)) return [];
  return [];
}

