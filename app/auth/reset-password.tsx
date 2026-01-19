import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';

function getParam(url: string, key: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const fromLinking = (parsed.queryParams?.[key] as string | undefined) ?? null;
    if (typeof fromLinking === 'string' && fromLinking.length) return fromLinking;

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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();

  const [stage, setStage] = useState<'processing' | 'ready' | 'error'>('processing');
  const [message, setMessage] = useState('Preparing password reset…');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const paramString = useMemo(() => {
    // expo-router gives us parsed query params, but recovery links sometimes include hash fragments.
    // Build a pseudo URL so we can reuse parsing logic that includes hash.
    const base =
      Platform.OS === 'web'
        ? typeof window !== 'undefined'
          ? window.location.href
          : 'https://local/'
        : 'proxybusiness://auth/reset-password';
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) u.searchParams.set(k, v[0] ?? '');
      else if (typeof v === 'string') u.searchParams.set(k, v);
    }
    return u.toString();
  }, [params]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const err = getParam(paramString, 'error');
      const errDesc = getParam(paramString, 'error_description');
      if (err) {
        if (!cancelled) {
          setStage('error');
          setMessage(errDesc || err);
        }
        return;
      }

      // If the session already exists, we can proceed to update the password.
      const { data: existing } = await supabase.auth.getSession();
      if (existing?.session) {
        if (!cancelled) setStage('ready');
        return;
      }

      const code = getParam(paramString, 'code');
      const accessToken = getParam(paramString, 'access_token');
      const refreshToken = getParam(paramString, 'refresh_token');

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          if (!cancelled) setStage('ready');
          return;
        }

        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) throw setSessionError;
          if (!cancelled) setStage('ready');
          return;
        }

        if (!cancelled) {
          setStage('error');
          setMessage('Missing reset credentials. Please request a new reset email and open the link on this device.');
        }
      } catch (e: any) {
        if (!cancelled) {
          setStage('error');
          setMessage(e?.message || 'Could not validate reset link. Please request a new email.');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [paramString]);

  async function submit() {
    const p = password.trim();
    const c = confirm.trim();
    if (p.length < 8) {
      Alert.alert('Password', 'Please use at least 8 characters.');
      return;
    }
    if (p !== c) {
      Alert.alert('Password', 'Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p });
      if (error) throw error;
      Alert.alert('Success', 'Your password has been updated.');
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update password. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (stage === 'processing') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12, textAlign: 'center' }}>{message}</Text>
      </View>
    );
  }

  if (stage === 'error') {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Reset link error</Text>
        <Text style={{ color: '#475569', marginBottom: 16 }}>{message}</Text>
        <Link href="/(auth)/sign-in" asChild>
          <TouchableOpacity
            activeOpacity={0.85}
            style={{ backgroundColor: '#111827', paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>Back to Sign In</Text>
          </TouchableOpacity>
        </Link>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '900' }}>Choose a new password</Text>
      <Text style={{ color: '#475569', marginTop: 8 }}>
        Enter a new password for your account.
      </Text>

      <Text style={{ marginTop: 18, marginBottom: 6, fontWeight: '800', color: '#334155' }}>New password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#94A3B8"
        style={{
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderColor: '#E2E8F0',
          borderWidth: 1,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          color: '#0F172A',
        }}
      />

      <Text style={{ marginTop: 14, marginBottom: 6, fontWeight: '800', color: '#334155' }}>Confirm password</Text>
      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#94A3B8"
        style={{
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderColor: '#E2E8F0',
          borderWidth: 1,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          color: '#0F172A',
        }}
      />

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={saving}
        onPress={() => void submit()}
        style={{
          marginTop: 18,
          backgroundColor: saving ? '#94A3B8' : '#111827',
          paddingVertical: 14,
          borderRadius: 16,
          alignItems: 'center',
        }}
      >
        {saving ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: '900' }}>Update password</Text>}
      </TouchableOpacity>
    </View>
  );
}

