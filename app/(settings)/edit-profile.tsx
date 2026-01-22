import { KeyboardDismissWrapper } from '@/components/KeyboardDismissButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const cardStyle = { backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined } as const;
  const textPrimary = { color: isDark ? '#E5E7EB' : undefined } as const;
  const textSecondary = { color: isDark ? 'rgba(226,232,240,0.65)' : undefined } as const;

  const Row = ({
    icon,
    title,
    subtitle,
    onPress,
    danger,
  }: {
    icon: any;
    title: string;
    subtitle?: string;
    onPress: () => void;
    danger?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={`bg-white border border-gray-100 rounded-2xl px-4 py-4 flex-row items-center mb-3 ${danger ? 'border-red-100' : ''}`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 2,
        ...(danger ? {} : cardStyle),
      }}
    >
      <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${danger ? 'bg-red-50' : 'bg-gray-50'}`}>
        <IconSymbol name={icon} size={18} color={danger ? '#EF4444' : (isDark ? '#E5E7EB' : '#111827')} />
      </View>
      <View className="flex-1 pr-2">
        <Text className={`${danger ? 'text-red-600' : 'text-ink'} font-bold text-base`} style={danger ? undefined : textPrimary}>{title}</Text>
        {subtitle ? <Text className="text-gray-500 text-xs mt-1" style={danger ? undefined : textSecondary}>{subtitle}</Text> : null}
      </View>
      <IconSymbol name="chevron.right" size={16} color="#9CA3AF" />
    </TouchableOpacity>
  );

  return (
    <KeyboardDismissWrapper>
      <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top, backgroundColor: isDark ? '#0B1220' : undefined }}>
        <View className="px-4 py-3 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
            <IconSymbol name="chevron.left" size={18} color={isDark ? '#E5E7EB' : '#111827'} />
          </TouchableOpacity>
          <Text className="flex-1 text-center text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular', color: isDark ? '#E5E7EB' : undefined }}>
            Settings
          </Text>
          <View className="w-10" />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
          <Text className="text-gray-500 font-bold text-xs mb-3 mt-2">ACCOUNT</Text>
          <Row icon="person.crop.circle" title="Edit Profile" subtitle="Photos, bio, intent, social links" onPress={() => router.push('/(settings)/profile')} />
          <Row icon="star.fill" title="Edit Interests" subtitle="Update your interests" onPress={() => router.push('/(settings)/edit-interests')} />
          <Row icon="checkmark.seal.fill" title="Get Verified" subtitle="Link Apple/Google to unlock features" onPress={() => router.push('/(settings)/get-verified')} />

          <Text className="text-gray-500 font-bold text-xs mb-3 mt-6">LEGAL</Text>
          <Row icon="doc.text" title="Privacy Policy" subtitle="How we use and protect your data" onPress={() => router.push('/(settings)/privacy-policy')} />

          <Text className="text-gray-500 font-bold text-xs mb-3 mt-6">SUPPORT</Text>
          <Row icon="envelope" title="Contact" subtitle="Get help or report an issue" onPress={() => router.push('/(settings)/contact')} />

          <Text className="text-gray-500 font-bold text-xs mb-3 mt-6">ACCOUNT ACTIONS</Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Sign out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
              ])
            }
            activeOpacity={0.85}
            className="bg-white border border-red-100 rounded-2xl px-4 py-4 flex-row items-center mb-16"
          >
            <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-red-50">
              <IconSymbol name="rectangle.portrait.and.arrow.right" size={18} color="#EF4444" />
            </View>
            <View className="flex-1 pr-2">
              <Text className="text-red-600 font-bold text-base">Sign out</Text>
              <Text className="text-gray-500 text-xs mt-1">Come back soon!</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardDismissWrapper>
  );
}
