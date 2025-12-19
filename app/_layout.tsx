import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import "../global.css";
import { AuthProvider, useAuth } from '../lib/auth';
import { LocationProvider } from '../lib/location'; // New Import
import { registerForPushNotificationsAsync } from '../lib/push';
import { supabase } from '../lib/supabase';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { TutorialProvider } from '@/components/TutorialProvider';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function InitialLayout() {
  const { session, user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === 'onboarding';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session) {
      // Fetch profile to check onboarding status
      supabase.from('profiles').select('is_onboarded').eq('id', session.user.id).single()
      .then(({ data }) => {
          if (data && !data.is_onboarded && !inOnboardingGroup) {
              router.replace('/onboarding');
          } else if (data && data.is_onboarded && (inAuthGroup || inOnboardingGroup)) {
              router.replace('/(tabs)');
          }
      });
    }
  }, [session, loading, segments]);

  // Register for Push Notifications when user is logged in
  useEffect(() => {
      if (user) {
          registerForPushNotificationsAsync(user.id);
      }
  }, [user]);

  if (loading) {
     return null; 
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack screenOptions={{ 
          headerStyle: { backgroundColor: 'white' },
          headerTintColor: 'black',
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: 'bold' }
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(settings)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="requests" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ToastProvider>
      <AuthProvider>
        <LocationProvider>
          <TutorialProvider>
            <InitialLayout />
          </TutorialProvider>
        </LocationProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
