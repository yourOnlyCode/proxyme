import { signInWithProvider } from '@/lib/socialAuth';
import { useState } from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export function SocialAuthButtons() {
  const [loadingProvider, setLoadingProvider] = useState<null | 'apple' | 'google' | 'facebook'>(null);
  const router = useRouter();

  const run = async (provider: 'apple' | 'google' | 'facebook') => {
    try {
      setLoadingProvider(provider);
      await signInWithProvider(provider);

      // Ensure we actually have a session before leaving the auth screen.
      // RootLayout will still redirect to onboarding if needed.
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      Alert.alert('Sign-in failed', e?.message || 'Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View className="mt-4">
      <View className="flex-row items-center my-4">
        <View className="flex-1 h-px bg-slate-200" />
        <Text className="mx-3 text-slate-500 text-xs">or continue with</Text>
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

        <TouchableOpacity
          onPress={() => run('facebook')}
          disabled={!!loadingProvider}
          accessibilityRole="button"
          accessibilityLabel="Continue with Facebook"
          className="w-12 h-12 rounded-full items-center justify-center bg-white border border-slate-200 shadow-sm"
          activeOpacity={0.85}
          style={{ opacity: loadingProvider ? 0.6 : 1 }}
        >
          <FontAwesome name="facebook" size={20} color="#1877F2" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

