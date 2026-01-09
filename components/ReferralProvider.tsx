import { ReferralPopup } from '@/components/ReferralPopup';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

const LAST_SESSION_KEY = 'last_referral_popup_session_id';
const NEVER_SHOW_AGAIN_KEY = 'referral_popup_never_show_again';

export function ReferralProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [showPopup, setShowPopup] = useState(false);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const hasCheckedThisSession = useRef(false);

  const checkAndShowPopup = async () => {
    if (authLoading || !user || hasCheckedThisSession.current) {
      setLoading(false);
      return;
    }

    try {
      // Fetch user's profile to get city and friend code
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('city, friend_code')
        .eq('id', user.id)
        .maybeSingle();

      // If profile can't be loaded, treat it like "account isn't ready" and send user to sign-in.
      // This prevents onboarding loops/crashes during partial auth states.
      if (profileError) {
        console.error('Error fetching profile:', profileError);
        await signOut();
        router.replace('/(auth)/sign-in');
        return;
      }

      // Profile row not present yet: don't show popup and don't crash.
      if (!profile) {
        setLoading(false);
        return;
      }

      setFriendCode(profile.friend_code || null);

      // Check if user has a city
      if (!profile.city) {
        setLoading(false);
        return;
      }

      // Check city user count
      const { data: cityCount, error: cityError } = await supabase.rpc('get_city_user_count', {
        check_city: profile.city,
      });

      if (cityError) {
        console.error('Error checking city count:', cityError);
        setLoading(false);
        return;
      }

      // Check if user has selected "never show again"
      const neverShowAgain = await AsyncStorage.getItem(NEVER_SHOW_AGAIN_KEY);
      if (neverShowAgain === 'true') {
        setLoading(false);
        return;
      }

      // Only show popup if city has less than 1,000 users
      if (cityCount && cityCount < 1000) {
        // Generate a unique session ID for this app session
        const currentSessionId = `${Date.now()}-${Math.random()}`;
        const lastSessionId = await AsyncStorage.getItem(LAST_SESSION_KEY);

        // Show popup if this is a new session (different session ID)
        if (lastSessionId !== currentSessionId) {
          setShowPopup(true);
          await AsyncStorage.setItem(LAST_SESSION_KEY, currentSessionId);
          hasCheckedThisSession.current = true;
        }
      }
    } catch (error) {
      console.error('Error in referral popup check:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    // Check when user logs in
    checkAndShowPopup();

    // Listen for app state changes to detect new sessions
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground - reset session check
        hasCheckedThisSession.current = false;
        checkAndShowPopup();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [user]);

  const handleClosePopup = () => {
    setShowPopup(false);
  };

  const handleNeverShowAgain = async () => {
    await AsyncStorage.setItem(NEVER_SHOW_AGAIN_KEY, 'true');
    setShowPopup(false);
    // Navigate to profile tab and set a flag to highlight friend code
    router.push('/(tabs)/explore');
    // Set a flag that profile screen can check to auto-show friend code
    await AsyncStorage.setItem('highlight_friend_code', 'true');
  };

  return (
    <>
      {children}
      {!loading && (
        <ReferralPopup
          visible={showPopup}
          onClose={handleClosePopup}
          friendCode={friendCode}
          onNeverShowAgain={handleNeverShowAgain}
        />
      )}
    </>
  );
}

