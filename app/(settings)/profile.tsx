import { KeyboardDismissWrapper } from '@/components/KeyboardDismissButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/profile/Avatar';
import ProfileGallery from '../../components/profile/ProfileGallery';
import { useAuth } from '../../lib/auth';
import { validateFullName, validateUsername } from '../../lib/nameValidation';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const RELATIONSHIP_OPTS = ['Romance', 'Friendship', 'Professional'];

type SocialLinks = {
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  linkedin?: string;
  x?: string;
};

const SOCIAL_PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: 'instagram', lib: FontAwesome, color: '#E1306C', placeholder: 'Instagram Handle (@user)' },
  { id: 'tiktok', name: 'TikTok', icon: 'tiktok', lib: FontAwesome5, color: '#000000', placeholder: 'TikTok Handle (@user)' },
  { id: 'facebook', name: 'Facebook', icon: 'facebook-square', lib: FontAwesome, color: '#1877F2', placeholder: 'Facebook Profile URL' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'linkedin-square', lib: FontAwesome, color: '#0077B5', placeholder: 'LinkedIn URL' },
  { id: 'x', name: 'X (Twitter)', icon: 'twitter', lib: FontAwesome, color: '#1DA1F2', placeholder: 'X Handle (@user)' },
];

export default function EditProfileScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [relationshipGoals, setRelationshipGoals] = useState<string[]>([]);
  const [socials, setSocials] = useState<SocialLinks>({});
  const [isVerified, setIsVerified] = useState(false);
  const [saveCrossedPaths, setSaveCrossedPaths] = useState(true);

  // Modal State
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');
  const [savingSocial, setSavingSocial] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (user) getProfile();
  }, [user]);

  async function getProfile() {
    try {
      setLoading(true);
      if (!user) throw new Error('No user on the session!');

      const { data, error, status } = await supabase
        .from('profiles')
        .select(`username, full_name, bio, avatar_url, relationship_goals, social_links, is_verified, save_crossed_paths`)
        .eq('id', user.id)
        .single();

      if (error && status !== 406) {
        throw error;
      }

      if (data) {
        setUsername(data.username || '');
        setFullName(data.full_name || '');
        setBio(data.bio || '');
        setAvatarUrl(data.avatar_url);
        setRelationshipGoals(data.relationship_goals || []);
        setSocials(data.social_links || {});
        setIsVerified(data.is_verified || false);
        setSaveCrossedPaths(data.save_crossed_paths ?? true);
      }
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile() {
    try {
      setSaving(true);
      if (!user) throw new Error('No user on the session!');

      const u = validateUsername(username);
      if (!u.ok) {
        Alert.alert('Username', u.message);
        return;
      }
      const n = validateFullName(fullName);
      if (!n.ok) {
        Alert.alert('Name', n.message);
        return;
      }

      let cleanAvatarPath = avatarUrl;
      if (avatarUrl && avatarUrl.startsWith('http')) {
        const matches = avatarUrl.match(/public\/avatars\/(.*)/);
        if (matches && matches[1]) {
          cleanAvatarPath = matches[1];
        }
      }

      const updates = {
        username,
        full_name: fullName,
        bio,
        avatar_url: cleanAvatarPath,
        relationship_goals: relationshipGoals,
        social_links: socials,
        save_crossed_paths: saveCrossedPaths,
        updated_at: new Date(),
      };

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;

      router.back();
    } catch (error: any) {
      Alert.alert('Error Updating Profile', error.message || 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }

  const selectGoal = (goal: string) => {
    setRelationshipGoals([goal]);
  };

  const getGoalStyle = (goal: string, isSelected: boolean) => {
    switch (goal) {
      case 'Romance':
        return isSelected ? 'bg-romance border-romance' : 'border-romance/30 bg-white';
      case 'Friendship':
        return isSelected ? 'bg-friendship border-friendship' : 'border-friendship/30 bg-white';
      case 'Professional':
        return isSelected ? 'bg-business border-business' : 'border-business/30 bg-white';
      default:
        return isSelected ? 'bg-black border-black' : 'border-gray-300 bg-white';
    }
  };

  const getGoalTextStyle = (goal: string, isSelected: boolean) => {
    if (isSelected) return 'text-white';
    switch (goal) {
      case 'Romance':
        return 'text-romance';
      case 'Friendship':
        return 'text-friendship';
      case 'Professional':
        return 'text-business';
      default:
        return 'text-gray-700';
    }
  };

  const handleSetCover = async (path: string) => {
    setAvatarUrl(path);
    Alert.alert('Cover Selected', "Don't forget to save your profile!");
  };

  const openSocialModal = () => {
    setSelectedPlatform(null);
    setTempLink('');
    setShowSocialModal(true);
  };

  const handleAddSocial = async () => {
    if (selectedPlatform && tempLink.trim() && user) {
      try {
        setSavingSocial(true);

        // Optimistic Update
        const newSocials = { ...socials, [selectedPlatform]: tempLink.trim() };
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSocials(newSocials);

        // Save to Supabase
        const { error } = await supabase.from('profiles').update({ social_links: newSocials, updated_at: new Date() }).eq('id', user.id);
        if (error) throw error;

        setShowSocialModal(false);
      } catch (error) {
        Alert.alert('Error', 'Failed to save social link.');
        getProfile();
      } finally {
        setSavingSocial(false);
      }
    }
  };

  const removeSocial = async (key: string) => {
    if (!user) return;
    try {
      const newSocials = { ...socials };
      delete newSocials[key as keyof SocialLinks];
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSocials(newSocials);

      const { error } = await supabase.from('profiles').update({ social_links: newSocials, updated_at: new Date() }).eq('id', user.id);
      if (error) throw error;
    } catch (error) {
      Alert.alert('Error', 'Failed to remove link.');
      getProfile();
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert('Delete Account', 'Are you sure? This action is irreversible. All your data will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_own_account');
            if (error) throw error;
            signOut();
            router.replace('/(auth)/sign-in');
          } catch (error) {
            Alert.alert('Error', 'Failed to delete account. Please try again.');
          }
        },
      },
    ]);
  };

  if (loading) return <View className="flex-1 justify-center"><ActivityIndicator /></View>;

  const currentPlatformConfig = SOCIAL_PLATFORMS.find((p) => p.id === selectedPlatform);

  return (
    <KeyboardDismissWrapper>
      <SafeAreaView className="flex-1 bg-white" edges={['top']} style={{ backgroundColor: isDark ? '#0B1220' : '#FFFFFF' }}>
        <View className="flex-1">
          {/* Custom Header */}
          <View
            className="px-4 flex-row items-center justify-between bg-white border-b border-gray-100"
            style={{
              paddingTop: 12,
              paddingBottom: 12,
              backgroundColor: isDark ? '#0B1220' : '#FFFFFF',
              borderBottomColor: isDark ? 'rgba(148,163,184,0.18)' : '#F3F4F6',
            }}
          >
            <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
              <IconSymbol name="chevron.left" size={28} color={isDark ? '#E5E7EB' : '#1A1A1A'} />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-ink" style={{ color: isDark ? '#E5E7EB' : '#0F172A' }}>
              Edit Profile
            </Text>
            <View className="w-10" />
          </View>

          <ScrollView
            className="flex-1 px-4 pt-4"
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            automaticallyAdjustsScrollIndicatorInsets={false}
          >
            {/* Verification Banner */}
            <TouchableOpacity
              onPress={() => router.push('/(settings)/get-verified')}
              className={`mb-6 p-4 rounded-2xl flex-row items-center justify-between ${isVerified ? 'bg-business/10 border border-business/20' : 'bg-gray-50 border border-gray-100 shadow-sm'}`}
            >
              <View className="flex-row items-center">
                <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isVerified ? 'bg-business' : 'bg-gray-200'}`}>
                  <IconSymbol name="checkmark.seal.fill" size={20} color="white" />
                </View>
                <View>
                  <Text className="font-bold text-base text-ink">{isVerified ? 'You are Verified' : 'Get Verified'}</Text>
                  <Text className="text-gray-500 text-xs">{isVerified ? 'Badge active on your profile' : 'Stand out with a blue checkmark'}</Text>
                </View>
              </View>
              {!isVerified && <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />}
            </TouchableOpacity>

            <View className="items-center mb-8">
              <Avatar url={avatarUrl} size={160} onUpload={(url) => setAvatarUrl(url)} editable />
            </View>

            <View className="mb-4">
              <Text className="text-gray-500 mb-1 ml-1 font-medium">Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-base text-ink"
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => {
                  if (Platform.OS !== 'web') Keyboard.dismiss();
                }}
                onFocus={(e) => {
                  if (Platform.OS === 'web') e.stopPropagation();
                }}
              />
            </View>

            <View className="mb-4">
              <Text className="text-gray-500 mb-1 ml-1 font-medium">Full Name</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-base text-ink"
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => {
                  if (Platform.OS !== 'web') Keyboard.dismiss();
                }}
                onFocus={(e) => {
                  if (Platform.OS === 'web') e.stopPropagation();
                }}
              />
            </View>

            <View className="mb-6">
              <Text className="text-gray-500 mb-1 ml-1 font-medium">Bio</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={4}
                className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-base h-24 text-ink"
                style={{ textAlignVertical: 'top' }}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => {
                  if (Platform.OS !== 'web') Keyboard.dismiss();
                }}
                onFocus={(e) => {
                  if (Platform.OS === 'web') e.stopPropagation();
                }}
              />
            </View>

            <View className="mb-6">
              <Text className="text-gray-500 mb-2 ml-1 font-bold">What’re you looking for?</Text>
              <View className="flex-row justify-between">
                {RELATIONSHIP_OPTS.map((opt) => {
                  const isSelected = relationshipGoals.includes(opt);
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => selectGoal(opt)}
                      className={`w-[32%] py-3 rounded-lg border items-center justify-center shadow-sm ${getGoalStyle(opt, isSelected)}`}
                    >
                      <Text className={`font-bold ${getGoalTextStyle(opt, isSelected)}`}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="mb-6">
              <Text className="text-gray-500 mb-2 ml-1 font-bold">Interests</Text>
              <TouchableOpacity
                onPress={() => router.push('/(settings)/edit-interests')}
                className="flex-row items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm"
              >
                <View className="flex-row items-center">
                  <IconSymbol name="star.fill" size={20} color="#F59E0B" />
                  <Text className="ml-3 font-semibold text-lg text-ink">Manage Detailed Interests</Text>
                </View>
                <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Dynamic Social Links List */}
            <View className="mb-8 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <Text className="text-lg font-bold mb-1 text-ink">Social Links</Text>
              <Text className="text-gray-400 text-xs mb-4">Added links are saved automatically.</Text>

              {Object.entries(socials).map(([key, value]) => {
                const config = SOCIAL_PLATFORMS.find((p) => p.id === key);
                if (!config) return null;
                const IconComponent = config.lib;
                return (
                  <View key={key} className="flex-row items-center justify-between bg-white p-3 rounded-lg mb-2 border border-gray-200 shadow-sm">
                    <View className="flex-row items-center flex-1">
                      <IconComponent name={config.icon as any} size={20} color={config.color} />
                      <Text className="ml-3 font-semibold text-ink capitalize">{config.name}</Text>
                      <Text className="ml-2 text-gray-500 text-xs flex-1" numberOfLines={1}>
                        {value}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeSocial(key)} className="p-1">
                      <IconSymbol name="xmark.circle.fill" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                );
              })}

              <TouchableOpacity onPress={openSocialModal} className="flex-row items-center justify-center bg-black py-3 rounded-lg mt-2 shadow-md">
                <IconSymbol name="plus" size={16} color="white" />
                <Text className="text-white font-bold ml-2">Add Link</Text>
              </TouchableOpacity>
            </View>

            {user && <ProfileGallery userId={user.id} onSetAvatar={handleSetCover} />}

            <View className="mt-8 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <Text className="text-gray-500 mb-2 ml-1 font-bold">Privacy</Text>
              <View className="bg-white border border-gray-200 rounded-xl px-4 py-4 flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 pr-3">
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-gray-50">
                    <IconSymbol name="clock.arrow.circlepath" size={18} color="#111827" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-ink font-bold">Crossed Paths history</Text>
                    <Text className="text-gray-500 text-xs mt-1" numberOfLines={2}>
                      Save people you crossed paths with for up to 7 days.
                    </Text>
                  </View>
                </View>
                <Switch
                  value={saveCrossedPaths}
                  onValueChange={(v) => setSaveCrossedPaths(v)}
                />
              </View>
              <Text className="text-gray-400 text-[11px] mt-3 ml-1 leading-4">
                Turning this off stops new history from being saved. Existing history may still appear until it expires.
              </Text>
            </View>

            <View className="h-8" />

            <TouchableOpacity onPress={updateProfile} disabled={saving} className="bg-black py-4 rounded-xl items-center shadow-lg mb-4">
              {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Save Profile</Text>}
            </TouchableOpacity>

            {/* Delete Account Button */}
            <TouchableOpacity onPress={handleDeleteAccount} className="items-center py-4 mb-10">
              <Text className="text-romance font-bold">Delete Account</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Social Modal - Full Height Keyboard Avoiding */}
          <Modal visible={showSocialModal} animationType="slide" transparent>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/50">
              <View className="bg-white rounded-t-3xl p-6 h-[85%] pb-10">
                {/* Modal Grabber */}
                <View className="items-center mb-6">
                  <View className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </View>

                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-2xl font-bold text-ink">Add Social Link</Text>
                  <TouchableOpacity onPress={() => setShowSocialModal(false)} className="p-2 bg-gray-100 rounded-full">
                    <IconSymbol name="xmark" size={20} color="#1A1A1A" />
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                  {!selectedPlatform ? (
                    <View className="flex-row flex-wrap justify-between">
                      {SOCIAL_PLATFORMS.map((p) => {
                        if (socials[p.id as keyof SocialLinks]) return null;
                        const IconComponent = p.lib;
                        return (
                          <TouchableOpacity
                            key={p.id}
                            onPress={() => setSelectedPlatform(p.id)}
                            className="w-[30%] aspect-square bg-gray-50 rounded-2xl items-center justify-center mb-4 border border-gray-200 shadow-sm"
                          >
                            <IconComponent name={p.icon as any} size={32} color={p.color} />
                            <Text className="text-xs font-bold mt-2 text-ink">{p.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View>
                      <View className="flex-row items-center mb-6">
                        <TouchableOpacity onPress={() => setSelectedPlatform(null)} className="mr-3 p-2 bg-gray-100 rounded-full border border-gray-200">
                          <IconSymbol name="chevron.left" size={24} color="#1A1A1A" />
                        </TouchableOpacity>
                        <View className="flex-row items-center">
                          {currentPlatformConfig && (
                            <>
                              <currentPlatformConfig.lib name={currentPlatformConfig.icon as any} size={28} color={currentPlatformConfig.color} />
                              <Text className="text-xl font-bold ml-3 text-ink">{currentPlatformConfig.name}</Text>
                            </>
                          )}
                        </View>
                      </View>

                      <Text className="text-gray-500 mb-2 font-semibold ml-1">Enter your handle or URL:</Text>
                      <TextInput
                        placeholder={currentPlatformConfig?.placeholder}
                        placeholderTextColor="#6b7280"
                        value={tempLink}
                        onChangeText={setTempLink}
                        autoCapitalize="none"
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={() => {
                          if (Platform.OS !== 'web') Keyboard.dismiss();
                        }}
                        onFocus={(e) => {
                          if (Platform.OS === 'web') e.stopPropagation();
                        }}
                        className="bg-gray-50 p-5 rounded-2xl text-lg mb-6 border border-gray-200 text-ink"
                        autoFocus
                      />

                      <TouchableOpacity
                        onPress={handleAddSocial}
                        disabled={!tempLink.trim() || savingSocial}
                        className={`py-4 rounded-xl items-center flex-row justify-center shadow-lg ${!tempLink.trim() ? 'bg-gray-200' : 'bg-black'}`}
                      >
                        {savingSocial ? (
                          <ActivityIndicator color="white" />
                        ) : (
                          <Text className={`font-bold text-lg ${!tempLink.trim() ? 'text-gray-400' : 'text-white'}`}>Save Link</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      </SafeAreaView>
    </KeyboardDismissWrapper>
  );
}

