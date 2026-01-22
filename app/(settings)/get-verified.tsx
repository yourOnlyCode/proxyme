import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, PanResponder, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import {
  REQUIRED_REFERRALS_FOR_TRENDSETTER,
  REQUIRED_SHARES_FOR_SUPER_USER,
  isSuperUserByShareCount,
  isTrendsetterByReferralCount,
  syncVerificationStatusForCurrentUser,
} from '../../lib/verification';

export default function GetVerifiedScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState<number>(0);
  const [shareCount, setShareCount] = useState<number>(0);
  const isSuperUser = isSuperUserByShareCount(shareCount);
  const isTrendsetter = isTrendsetterByReferralCount(referralCount);

  const closePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          gestureState.dy > 8 && Math.abs(gestureState.dx) < 30,
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dy > 90) {
            router.back();
          }
        },
      }),
    [router]
  );

  useEffect(() => {
    if (user) {
        initialize();
    }
  }, [user]);

  const initialize = async () => {
      if (!user) return;
      try {
        const verified = await syncVerificationStatusForCurrentUser();
        setIsVerified(verified);

        const { data, error } = await supabase
          .from('profiles')
          .select('friend_code, referral_count, share_count, is_verified')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;

        setFriendCode((data as any)?.friend_code ?? null);
        setReferralCount(Number((data as any)?.referral_count ?? 0));
        setShareCount(Number((data as any)?.share_count ?? 0));
        // trust server value if it's already set (but we still sync in the background)
        if ((data as any)?.is_verified !== undefined) setIsVerified(!!(data as any)?.is_verified);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load verification details.');
      } finally {
        setIsLoaded(true);
      }
  };

  if (!isLoaded) {
      return (
          <View className="flex-1 justify-center items-center bg-white" style={{ backgroundColor: isDark ? '#0B1220' : '#FFFFFF' }}>
              <ActivityIndicator size="large" color="#2962FF" />
          </View>
      );
  }

  return (
      <View className="flex-1 bg-white" style={{ backgroundColor: isDark ? '#0B1220' : '#FFFFFF' }}>
        <View
          {...closePanResponder.panHandlers}
          className="pt-2 pb-2 bg-white z-10 px-4 flex-row items-center"
          style={{ backgroundColor: isDark ? '#0B1220' : '#FFFFFF' }}
        >
          <View className="flex-1" />
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="w-10 h-10 items-center justify-center ml-auto"
          >
            <IconSymbol name="xmark" size={20} color={isDark ? '#E5E7EB' : '#111827'} />
          </TouchableOpacity>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-3xl font-extrabold mb-3 text-ink text-center" style={{ color: isDark ? '#E5E7EB' : undefined }}>
            {isVerified ? 'You’re Verified' : 'Verify your account'}
          </Text>
          <Text className="text-gray-500 mb-6 text-center text-base leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
            Verification is proof you’re real enough to safely interact on Proxyme. It’s used for access, not social status.
          </Text>

          <View
            className="bg-gray-50 border border-gray-100 rounded-2xl p-5 mb-4"
            style={{ backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}
          >
            <Text className="text-ink font-bold mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>How to get verified</Text>
            <Text className="text-gray-600 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - Sign in with Apple or Google (OAuth), or link Apple/Google to your email account.{'\n'}
              - (Optional / coming soon) Face / biometric verification to prove you’re a real person.
            </Text>
          </View>

          <View
            className="bg-white border border-gray-100 rounded-2xl p-5 mb-4 shadow-sm"
            style={{ backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}
          >
            <Text className="text-gray-500 font-bold mb-2" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>Verification status</Text>
            <Text className="text-ink text-2xl font-extrabold mb-1" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              {isVerified ? 'Verified' : 'Not verified'}
            </Text>
            <Text className="text-gray-500 text-sm" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
              {isVerified ? 'You can post stories, join clubs, attend events, and view Crossed Paths.' : 'Link Apple or Google to instantly verify.'}
            </Text>

            {!isVerified ? (
              <View className="mt-2">
                <SocialAuthButtons mode="link" onComplete={() => initialize()} />
              </View>
            ) : null}
          </View>

          <View
            className="bg-white border border-gray-100 rounded-2xl p-5 mb-6 shadow-sm"
            style={{ backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}
          >
            <Text className="text-gray-500 font-bold mb-2" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>Social status (optional)</Text>
            <Text className="text-gray-600 leading-6 mb-3" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - Blue check (Super user): share the app {REQUIRED_SHARES_FOR_SUPER_USER} times.{'\n'}
              - Orange check (Trendsetter): {REQUIRED_REFERRALS_FOR_TRENDSETTER} friends sign up with your friend code.
            </Text>

            <View className="flex-row flex-wrap">
              <View className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mr-2 mb-2">
                <Text className="text-blue-700 font-bold text-xs">
                  {Math.min(shareCount, REQUIRED_SHARES_FOR_SUPER_USER)}/{REQUIRED_SHARES_FOR_SUPER_USER} shares 
                </Text>
              </View>
              <View className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mr-2 mb-2">
                <Text className="text-orange-700 font-bold text-xs">
                  {Math.min(referralCount, REQUIRED_REFERRALS_FOR_TRENDSETTER)}/{REQUIRED_REFERRALS_FOR_TRENDSETTER} signups 
                </Text>
              </View>
            </View>

            <Text className="text-gray-500 font-bold mb-2 mt-2" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>Your friend code</Text>
            <Text className="text-ink text-3xl font-extrabold tracking-widest" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              {friendCode || '—'}
            </Text>
            <TouchableOpacity
              disabled={!friendCode}
              onPress={async () => {
                if (!friendCode) return;
                await Clipboard.setStringAsync(friendCode);
                Alert.alert('Copied', 'Friend code copied to clipboard.');
              }}
              className={`mt-4 py-4 rounded-2xl items-center ${friendCode ? 'bg-business' : 'bg-gray-200'}`}
            >
              <Text className="text-white font-bold text-lg">Copy Code</Text>
            </TouchableOpacity>
          </View>

          <View
            className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-6"
            style={{ backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}
          >
            <Text className="text-blue-900 font-bold mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>Why it helps</Text>
            <Text className="text-blue-800 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - Reduces fake accounts{'\n'}
              - Builds a safer community{'\n'}
              - Makes connections feel more trustworthy
            </Text>
          </View>

          <TouchableOpacity onPress={() => router.back()} className="py-3 items-center">
            <Text className="text-gray-400 font-medium" style={{ color: isDark ? 'rgba(226,232,240,0.55)' : undefined }}>Go Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
  );
}
