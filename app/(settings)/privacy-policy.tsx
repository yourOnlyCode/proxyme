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
            <Text className="text-gray-500 text-xs mb-3" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>Last updated: TBD</Text>

            <Text className="text-ink font-bold text-lg mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>Summary</Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              This is a placeholder privacy policy screen. Replace this text with your official privacy policy before publishing.
            </Text>

            <Text className="text-ink font-bold text-lg mt-6 mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>What we collect</Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - Account details you provide (email, profile info){'\n'}
              - Content you upload (photos, comments){'\n'}
              - Approximate location/city for discovery (if enabled){'\n'}
              - Basic usage/diagnostic data for reliability
            </Text>

            <Text className="text-ink font-bold text-lg mt-6 mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>How we use it</Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              - Provide core features (profiles, messaging, events){'\n'}
              - Safety & moderation workflows{'\n'}
              - Improve performance and reliability
            </Text>

            <Text className="text-ink font-bold text-lg mt-6 mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>Contact</Text>
            <Text className="text-gray-700 leading-6" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
              For privacy requests, contact support (see the Contact page).
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardDismissWrapper>
  );
}

