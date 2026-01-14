import { KeyboardDismissWrapper } from '@/components/KeyboardDismissButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'support@proxyme.app'; // change if needed before publishing

export default function ContactScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <KeyboardDismissWrapper>
      <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
        <View className="px-4 py-3 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
            <IconSymbol name="chevron.left" size={18} color="#111827" />
          </TouchableOpacity>
          <Text className="flex-1 text-center text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular' }}>
            Contact
          </Text>
          <View className="w-10" />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <View className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
            <Text className="text-ink font-bold text-lg mb-2">Need help?</Text>
            <Text className="text-gray-700 leading-6">
              Email us and include your username + a screenshot if possible.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Proxyme Support')}`)}
              className="mt-5 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 flex-row items-center"
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-white border border-gray-200">
                <IconSymbol name="envelope.fill" size={18} color="#111827" />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-ink font-bold">{SUPPORT_EMAIL}</Text>
                <Text className="text-gray-500 text-xs mt-1">Tap to compose email</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardDismissWrapper>
  );
}

