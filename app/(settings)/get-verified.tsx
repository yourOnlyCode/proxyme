import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '../../lib/auth';
import { REQUIRED_REFERRALS_FOR_SUPER_USER, REQUIRED_REFERRALS_FOR_VERIFICATION, checkVerificationStatus, isSuperUserByReferralCount } from '../../lib/verification';
import { supabase } from '../../lib/supabase';

export default function GetVerifiedScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState<number>(0);
  const isSuperUser = isSuperUserByReferralCount(referralCount);

  useEffect(() => {
    if (user) {
        initialize();
    }
  }, [user]);

  const initialize = async () => {
      if (!user) return;
      try {
        const verified = await checkVerificationStatus(user.id);
        setIsVerified(verified);

        const { data, error } = await supabase
          .from('profiles')
          .select('friend_code, referral_count')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;

        setFriendCode((data as any)?.friend_code ?? null);
        setReferralCount(Number((data as any)?.referral_count ?? 0));
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
        <View className="items-center pt-2 pb-2 bg-white z-10" style={{ backgroundColor: isDark ? '#0B1220' : '#FFFFFF' }}>
            <View className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-3xl font-extrabold mb-3 text-ink text-center" style={{ color: isDark ? '#E5E7EB' : undefined }}>
            {isSuperUser ? 'You’re a Super User' : isVerified ? 'You’re Verified' : 'Get Verified'}
          </Text>
          <Text className="text-gray-500 mb-6 text-center text-base leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
            Verification is earned by inviting friends — it helps Proxyme build real trust and reduce fake accounts.
          </Text>

          <View
            className="bg-gray-50 border border-gray-100 rounded-2xl p-5 mb-4"
            style={{ backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}
          >
            <Text className="text-ink font-bold mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>How it works</Text>
            <Text className="text-gray-600 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              1) Share your friend code{'\n'}
              2) Your friends enter it during onboarding{'\n'}
              3) Each successful referral counts toward verification{'\n'}
              4) Invite {REQUIRED_REFERRALS_FOR_VERIFICATION} friends to get verified{'\n'}
              5) Invite {REQUIRED_REFERRALS_FOR_SUPER_USER} friends to unlock a purple check (Super User)
            </Text>
          </View>

          <View
            className="bg-white border border-gray-100 rounded-2xl p-5 mb-4 shadow-sm"
            style={{ backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}
          >
            <Text className="text-gray-500 font-bold mb-2" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>Your progress</Text>
            <Text className="text-ink text-2xl font-extrabold mb-1" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              {isVerified
                ? `${Math.min(referralCount, REQUIRED_REFERRALS_FOR_SUPER_USER)}/${REQUIRED_REFERRALS_FOR_SUPER_USER}`
                : `${Math.min(referralCount, REQUIRED_REFERRALS_FOR_VERIFICATION)}/${REQUIRED_REFERRALS_FOR_VERIFICATION}`}
            </Text>
            <Text className="text-gray-500 text-sm" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
              {isVerified
                ? 'You’re verified. Next goal: Super User (purple check).'
                : 'Referrals are counted when someone enters your code in onboarding.'}
            </Text>

            <View className="h-2 bg-gray-100 rounded-full w-full overflow-hidden mt-4" style={{ backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}>
              <View
                className={`h-full rounded-full ${isVerified ? 'bg-purple-600' : 'bg-business'}`}
                style={{
                  width: `${
                    Math.min(
                      1,
                      referralCount / (isVerified ? REQUIRED_REFERRALS_FOR_SUPER_USER : REQUIRED_REFERRALS_FOR_VERIFICATION),
                    ) * 100
                  }%`,
                }}
              />
            </View>
          </View>

          <View
            className="bg-white border border-gray-100 rounded-2xl p-5 mb-6 shadow-sm"
            style={{ backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}
          >
            <Text className="text-gray-500 font-bold mb-2" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>Your friend code</Text>
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
