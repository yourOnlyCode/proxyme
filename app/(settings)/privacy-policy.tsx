import { KeyboardDismissWrapper } from '@/components/KeyboardDismissButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  return (
    <KeyboardDismissWrapper>
      <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top, backgroundColor: isDark ? '#0B1220' : undefined }}>
        <View className="px-4 py-3 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
            <IconSymbol name="chevron.left" size={18} color={isDark ? '#E5E7EB' : '#111827'} />
          </TouchableOpacity>
          <Text className="flex-1 text-center text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular', color: isDark ? '#E5E7EB' : undefined }}>
            Privacy Policy
          </Text>
          <View className="w-10" />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <View
            className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm"
            style={{ backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}
          >
            <Text className="text-gray-500 text-xs mb-3" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
              Last updated: 2026-01-16
            </Text>

            <Text className="text-ink font-bold text-lg mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              Summary
            </Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              Proxyme is a social app with location-based discovery, messaging, clubs, events, and temporary statuses. We collect only what we need to
              run these features, keep the community safe, and improve reliability.
            </Text>

            <Text className="text-ink font-bold text-lg mt-6 mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              Age & date of birth
            </Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - We ask for your date of birth to determine which experience you are eligible for.{'\n'}
              - We separate experiences by age group (13–17 vs 18+) so minors and adults do not see each other in discovery or connection flows.{'\n'}
              - 13–17 accounts are friendship-only. Romance intent is disabled for minors.{'\n'}
              - If you report someone as underage, we may restrict their account while we review.
            </Text>

            <Text className="text-ink font-bold text-lg mt-6 mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              What we collect
            </Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - Account/profile info you provide (username, name, bio, photos, interests, intent preferences){'\n'}
              - Messages and shared content you send in chats{'\n'}
              - Temporary statuses you post (and their captions){'\n'}
              - Safety signals (blocks, reports, report reasons, and optional details){'\n'}
              - Location signals used for discovery (if you enable Proxy)
            </Text>

            <Text className="text-ink font-bold text-lg mt-6 mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              Location & Crossed Paths (privacy-first)
            </Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - Proxy discovery uses your device location when enabled.{'\n'}
              - Crossed Paths only collects/updates data when Proxy is ON and Crossed Paths history is enabled in settings.{'\n'}
              - We store a non-reversible “place fingerprint” (a hashed key) to match people at the same spot without storing raw coordinates in this history table.{'\n'}
              - We show a redacted label (venue name or a street block) and do not need to display exact addresses.{'\n'}
              - Crossed Paths is designed to show up to a week of history.
            </Text>

            <Text className="text-ink font-bold text-lg mt-6 mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              How we use data
            </Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - Provide core features (discovery, messaging, clubs, events, statuses){'\n'}
              - Enforce age segmentation and romance age-range preferences (18+ only){'\n'}
              - Safety & moderation (blocking, reporting, review workflows){'\n'}
              - Reliability and fraud prevention
            </Text>

            <Text className="text-ink font-bold text-lg mt-6 mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              Your choices
            </Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - You can turn Proxy and Crossed Paths history on/off in settings.{'\n'}
              - You can block or report users at any time.{'\n'}
              - You can edit your profile information in settings.
            </Text>

            <Text className="text-ink font-bold text-lg mt-6 mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>
              Contact
            </Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              For privacy requests or questions, contact support (see the Contact page).
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardDismissWrapper>
  );
}

