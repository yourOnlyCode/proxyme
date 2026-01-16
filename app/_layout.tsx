import { ReferralProvider } from '@/components/ReferralProvider';
import { ThemePreferenceProvider } from '@/components/ThemePreferenceProvider';
import { TutorialProvider } from '@/components/TutorialProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';
import "../global.css";
import { AuthProvider, useAuth } from '../lib/auth';
import { LocationProvider } from '../lib/location'; // New Import
import { registerForPushNotificationsAsync } from '../lib/push';
import { supabase } from '../lib/supabase';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/hooks/use-color-scheme';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function InitialLayout() {
  const { session, user, loading, signOut, ensureProfile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const hasCheckedOnboarding = useRef(false);
  const lastSessionId = useRef<string | null>(null);

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

    // Note: `/auth/callback` is not inside the `(auth)` route group folder,
    // so segments[0] will be "auth" for that path. Treat it as part of auth routing
    // so OAuth can complete without being immediately redirected back to sign-in.
    const inAuthGroup = segments[0] === '(auth)' || segments[0] === 'auth';
    const inOnboardingGroup = segments[0] === 'onboarding';
    const inTabsGroup = segments[0] === '(tabs)';

    // If no session and not in auth, redirect to sign in
    if (!session && !inAuthGroup) {
      hasCheckedOnboarding.current = false;
      lastSessionId.current = null;
      router.replace('/(auth)/sign-in');
      return;
    }

    // If session exists
    if (session) {
      const currentSessionId = session.user.id;
      
      // Only check onboarding status once per session, or when session changes
      if (hasCheckedOnboarding.current && lastSessionId.current === currentSessionId) {
        // Already checked for this session, don't redirect again
        return;
      }

      // Mark that we're checking (prevent multiple simultaneous checks)
      if (lastSessionId.current !== currentSessionId) {
        hasCheckedOnboarding.current = false;
        lastSessionId.current = currentSessionId;
      }

      // Ensure profile row exists (first-login safety)
      ensureProfile()
        .then(() =>
          supabase.from('profiles').select('is_onboarded').eq('id', session.user.id).maybeSingle()
        )
      .then(({ data, error }) => {
          hasCheckedOnboarding.current = true;

          // If the profile check itself errored, treat it as "account not loaded" and send to sign-in.
          if (error) {
              console.error('Error checking onboarding status:', error);
              signOut().finally(() => router.replace('/(auth)/sign-in'));
              return;
          }
          
          // If profile doesn't exist or onboarding not complete, redirect to onboarding
          if (!data || !data.is_onboarded) {
              if (!inOnboardingGroup) {
                  router.replace('/onboarding');
              }
          } else if (data && data.is_onboarded && (inAuthGroup || inOnboardingGroup)) {
              router.replace('/(tabs)');
          }
      })
      .catch((err) => {
          hasCheckedOnboarding.current = true;
          console.error('Error checking onboarding status:', err);
          // If account/profile can't be loaded, default to sign-in (prevents onboarding loops).
          signOut().finally(() => router.replace('/(auth)/sign-in'));
      });
    }
  }, [session, loading, fontsLoaded]);

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
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ 
          headerStyle: { backgroundColor: colorScheme === 'dark' ? '#0B1220' : 'white' },
          headerTintColor: colorScheme === 'dark' ? 'white' : 'black',
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: 'bold' }
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(settings)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="clubs/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="connections/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="requests" options={{ headerShown: false }} />
        <Stack.Screen name="inbox" options={{ headerShown: false }} />
        <Stack.Screen
          name="crossed-paths"
          options={{
            headerShown: false,
            // Slide in from the left (avoid gestureDirection tweaks which caused native crashes on some Android builds)
            animation: 'slide_from_left',
          }}
        />
        <Stack.Screen name="messages" options={{ headerShown: false }} />
        <Stack.Screen name="events/[id]" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastProvider>
        <AuthProvider>
          <LocationProvider>
            <TutorialProvider>
              <ReferralProvider>
                <ThemePreferenceProvider>
                  <InitialLayout />
                </ThemePreferenceProvider>
              </ReferralProvider>
            </TutorialProvider>
          </LocationProvider>
        </AuthProvider>
      </ToastProvider>
    </GestureHandlerRootView>
  );
}
