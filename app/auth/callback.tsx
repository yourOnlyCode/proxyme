import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();

  const [message, setMessage] = useState('Finishing sign-in…');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const code = Array.isArray(params.code) ? params.code[0] : params.code;
      const err = Array.isArray(params.error) ? params.error[0] : params.error;
      const errDesc = Array.isArray(params.error_description) ? params.error_description[0] : params.error_description;

      if (err) {
        if (!cancelled) setMessage(errDesc || err);
        // Send user back to sign-in so they can retry.
        router.replace('/(auth)/sign-in');
        return;
      }

      // If the session already exists (common when using openAuthSessionAsync + exchangeCodeForSession),
      // just continue into the app.
      const { data: existing } = await supabase.auth.getSession();
      if (existing?.session) {
        router.replace('/(tabs)');
        return;
      }

      if (!code) {
        if (!cancelled) setMessage('Missing auth code. Please try again.');
        router.replace('/(auth)/sign-in');
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        if (!cancelled) setMessage(exchangeError.message);
        router.replace('/(auth)/sign-in');
        return;
      }

      router.replace('/(tabs)');
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.error, params.error_description, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 12, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

