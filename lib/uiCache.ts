// Tiny in-memory cache for "stale-while-revalidate" UI.
// Keeps the last good data around so screens don't flash blank while refetching.

import AsyncStorage from '@react-native-async-storage/async-storage';

const cache = new Map<string, unknown>();
const STORAGE_PREFIX = 'uiCache:';

export function getUiCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setUiCache<T>(key: string, value: T): void {
  cache.set(key, value);
  // Persist (best-effort). This enables showing cached UI even after app restarts.
  void AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
}

export async function loadUiCache<T>(key: string): Promise<T | undefined> {
  // Prefer memory.
  const mem = getUiCache<T>(key);
  if (mem !== undefined) return mem;

  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as T;
    cache.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

