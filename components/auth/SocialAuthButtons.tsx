import { linkWithProvider, signInWithProvider } from '@/lib/socialAuth';
import { useState } from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { syncVerificationStatusForCurrentUser } from '@/lib/verification';

export function SocialAuthButtons({
  mode = 'signIn',
  onComplete,
}: {
  mode?: 'signIn' | 'link';
  onComplete?: () => void;
}) {
  const [loadingProvider, setLoadingProvider] = useState<null | 'apple' | 'google' | 'facebook'>(null);
  const router = useRouter();

  const run = async (provider: 'apple' | 'google' | 'facebook') => {
    try {
      setLoadingProvider(provider);
      if (mode === 'link') {
        await linkWithProvider(provider);
        // Keep RLS-friendly profile flag in sync immediately.
        await syncVerificationStatusForCurrentUser();
        onComplete?.();
        return;
      }

      await signInWithProvider(provider);

      // Ensure we actually have a session before leaving the auth screen.
      // RootLayout will still redirect to onboarding if needed.
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        router.replace('/(tabs)');
      }
      onComplete?.();
    } catch (e: any) {
      const msg = String(e?.message || '').trim();
      const isManualLinkingDisabled =
        msg.toLowerCase().includes('manual linking is disabled') ||
        String((e as any)?.code || '').toLowerCase().includes('manual') ||
        String((e as any)?.name || '').toLowerCase().includes('manual');

      if (mode === 'link' && isManualLinkingDisabled) {
        Alert.alert(
          'Link failed',
          'Linking providers is currently disabled in Auth settings. To link Apple/Google after account creation, enable manual identity linking in Supabase Auth settings (or enable automatic identity linking) and try again.'
        );
        return;
      }

      Alert.alert(mode === 'link' ? 'Link failed' : 'Sign-in failed', msg || 'Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View className="mt-4">
      <View className="flex-row items-center my-4">
        <View className="flex-1 h-px bg-slate-200" />
        <Text className="mx-3 text-slate-500 text-xs">{mode === 'link' ? 'link with' : 'or continue with'}</Text>
        <View className="flex-1 h-px bg-slate-200" />
      </View>

      <View className="flex-row justify-center gap-3">
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            onPress={() => run('apple')}
            disabled={!!loadingProvider}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
            className="w-12 h-12 rounded-full items-center justify-center bg-black shadow-md"
            activeOpacity={0.85}
            style={{ opacity: loadingProvider ? 0.6 : 1 }}
          >
            <FontAwesome name="apple" size={22} color="white" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => run('google')}
          disabled={!!loadingProvider}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          className="w-12 h-12 rounded-full items-center justify-center bg-white border border-slate-200 shadow-sm"
          activeOpacity={0.85}
          style={{ opacity: loadingProvider ? 0.6 : 1 }}
        >
          <FontAwesome name="google" size={20} color="#111827" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

