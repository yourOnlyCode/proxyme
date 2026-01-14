import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'facebook' | 'apple';

function getParam(url: string, key: string): string | null {
  try {
    // Expo's Linking.parse is convenient, but some providers return params in the hash fragment.
    const parsed = Linking.parse(url);
    const fromLinking = (parsed.queryParams?.[key] as string | undefined) ?? null;
    if (typeof fromLinking === 'string' && fromLinking.length) return fromLinking;

    // Fallback: parse with URL and include hash params.
    const u = new URL(url);
    const fromSearch = u.searchParams.get(key);
    if (fromSearch) return fromSearch;

    const hash = u.hash?.startsWith('#') ? u.hash.slice(1) : u.hash ?? '';
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const fromHash = hashParams.get(key);
      if (fromHash) return fromHash;
    }

    return null;
  } catch {
    return null;
  }
}

export async function signInWithProvider(provider: OAuthProvider) {
  // Web: let Supabase handle the full redirect.
  if (Platform.OS === 'web') {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) throw error;
    return;
  }

  const returnUrl = Linking.createURL('auth/callback'); // proxybusiness://auth/callback

  // Apple often ends up completing in a browser context; route it through our web landing page
  // which will deep-link back into the app with the code.
  const redirectTo = provider === 'apple' ? 'https://www.proxyme.app/auth/callback' : returnUrl;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No auth URL returned.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
  if (result.type !== 'success' || !result.url) {
    // User cancelled or OS dismissed.
    return;
  }

  const code = getParam(result.url, 'code');
  const err = getParam(result.url, 'error');
  const errDesc = getParam(result.url, 'error_description');
  const accessToken = getParam(result.url, 'access_token');
  const refreshToken = getParam(result.url, 'refresh_token');

  if (err) {
    throw new Error(errDesc || err);
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return;
  }

  // Some flows/providers may return tokens directly (hash fragment). Support that as a fallback.
  if (accessToken && refreshToken) {
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setSessionError) throw setSessionError;
  }
}

