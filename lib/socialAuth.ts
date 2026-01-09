import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'facebook' | 'apple';

function getQueryParam(url: string, key: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const val = (parsed.queryParams?.[key] as string | undefined) ?? null;
    return typeof val === 'string' ? val : null;
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

  const redirectTo = Linking.createURL('auth/callback'); // proxybusiness://auth/callback

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No auth URL returned.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    // User cancelled or OS dismissed.
    return;
  }

  const code = getQueryParam(result.url, 'code');
  const err = getQueryParam(result.url, 'error');
  const errDesc = getQueryParam(result.url, 'error_description');

  if (err) {
    throw new Error(errDesc || err);
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }
}

