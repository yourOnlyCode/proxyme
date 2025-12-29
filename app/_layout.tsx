import { ReferralProvider } from '@/components/ReferralProvider';
import { TutorialProvider } from '@/components/TutorialProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import "../global.css";
import { AuthProvider, useAuth } from '../lib/auth';
import { LocationProvider } from '../lib/location'; // New Import
import { registerForPushNotificationsAsync } from '../lib/push';
import { supabase } from '../lib/supabase';

import { useColorScheme } from '@/hooks/use-color-scheme';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function InitialLayout() {
  const { session, user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  // Load Libertinus Sans fonts
  const [fontsLoaded, fontError] = useFonts({
    'LibertinusSans-Regular': require('../assets/fonts/LibertinusSans-Regular.ttf'),
    'LibertinusSans-Bold': require('../assets/fonts/LibertinusSans-Bold.ttf'),
    'LibertinusSans-Italic': require('../assets/fonts/LibertinusSans-Italic.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (loading || !fontsLoaded) return;

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
  }, [session, loading, segments, fontsLoaded]);

  // Register for Push Notifications when user is logged in
  useEffect(() => {
      if (user) {
          registerForPushNotificationsAsync(user.id);
      }
  }, [user]);

  if (loading || !fontsLoaded) {
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
        <Stack.Screen name="clubs/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="requests" options={{ headerShown: false }} />
        <Stack.Screen name="inbox" options={{ headerShown: false }} />
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
            <ReferralProvider>
              <InitialLayout />
            </ReferralProvider>
          </TutorialProvider>
        </LocationProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
