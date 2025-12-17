import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native';
import Avatar from '../../components/profile/Avatar';
import ProfileGallery from '../../components/profile/ProfileGallery';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const RELATIONSHIP_OPTS = ['Romance', 'Friendship', 'Business'];

type SocialLinks = {
    instagram?: string;
    tiktok?: string;
    facebook?: string;
    linkedin?: string;
    x?: string;
};

const SOCIAL_PLATFORMS = [
    { id: 'instagram', name: 'Instagram', icon: 'camera.fill', color: '#E1306C', placeholder: 'Instagram Handle (@user)' },
    { id: 'tiktok', name: 'TikTok', icon: 'music.note', color: '#000000', placeholder: 'TikTok Handle (@user)' },
    { id: 'facebook', name: 'Facebook', icon: 'hand.thumbsup.fill', color: '#1877F2', placeholder: 'Facebook Profile URL' },
    { id: 'linkedin', name: 'LinkedIn', icon: 'briefcase.fill', color: '#0077B5', placeholder: 'LinkedIn URL' },
    { id: 'x', name: 'X (Twitter)', icon: 'bubble.left.fill', color: '#1DA1F2', placeholder: 'X Handle (@user)' },
] as const;

export default function EditProfileScreen() {
  const { user, signOut } = useAuth();
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
        .select(`username, full_name, bio, avatar_url, relationship_goals, social_links, is_verified`)
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
        updated_at: new Date(),
      };

      console.log('Sending update to Supabase:', updates);

      // Use Update instead of Upsert to avoid RLS confusion if row exists
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) {
        console.error('Supabase Update Error:', error);
        throw error;
      }

      console.log('Update successful, navigating back...');
      
      // Navigate back immediately, then show a toast or small alert if needed
      // Or just go back. Standard iOS pattern is just to go back.
      router.back(); 
      // Optional: Alert.alert('Success', 'Profile updated');

    } catch (error: any) {
      console.error('Catch Error:', error);
      Alert.alert('Error Updating Profile', error.message || 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }

  const selectGoal = (goal: string) => {
    setRelationshipGoals([goal]);
  };

  const getGoalStyle = (goal: string, isSelected: boolean) => {
      switch(goal) {
          case 'Romance': return isSelected ? 'bg-romance border-romance' : 'border-romance/30 bg-white';
          case 'Friendship': return isSelected ? 'bg-friendship border-friendship' : 'border-friendship/30 bg-white';
          case 'Business': return isSelected ? 'bg-business border-business' : 'border-business/30 bg-white';
          default: return isSelected ? 'bg-black border-black' : 'border-gray-300 bg-white';
      }
  };

  const getGoalTextStyle = (goal: string, isSelected: boolean) => {
      if (isSelected) return 'text-white';
      switch(goal) {
          case 'Romance': return 'text-romance';
          case 'Friendship': return 'text-friendship';
          case 'Business': return 'text-business';
          default: return 'text-gray-700';
      }
  };

  const handleSetCover = async (path: string) => {
      setAvatarUrl(path);
      Alert.alert('Cover Selected', 'Don\'t forget to save your profile!');
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
              const { error } = await supabase
                .from('profiles')
                .update({ social_links: newSocials, updated_at: new Date() })
                .eq('id', user.id);

              if (error) throw error;

              setShowSocialModal(false);
          } catch (error) {
              Alert.alert('Error', 'Failed to save social link.');
              // Revert on error (could be cleaner, but simple fetch works)
              getProfile();
          } finally {
              setSavingSocial(false);
          }
      }
  };

  const removeSocial = async (key: string) => {
      if (!user) return;
      try {
          // Optimistic Update
          const newSocials = { ...socials };
          delete newSocials[key as keyof SocialLinks];
          
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSocials(newSocials);
          
          // Save to Supabase
          const { error } = await supabase
            .from('profiles')
            .update({ social_links: newSocials, updated_at: new Date() })
            .eq('id', user.id);
            
          if (error) throw error;

      } catch (error) {
          Alert.alert('Error', 'Failed to remove link.');
          getProfile();
      }
  };

  const handleDeleteAccount = () => {
      Alert.alert(
          'Delete Account',
          'Are you sure? This action is irreversible. All your data will be permanently deleted.',
          [
              { text: 'Cancel', style: 'cancel' },
              {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                      try {
                          const { error } = await supabase.rpc('delete_own_account');
                          if (error) throw error;
                          
                          // Sign out after deletion
                          signOut();
                          router.replace('/(auth)/sign-in');
                      } catch (error) {
                          Alert.alert('Error', 'Failed to delete account. Please try again.');
                          console.error(error);
                      }
                  }
              }
          ]
      );
  };

  if (loading) return <View className="flex-1 justify-center"><ActivityIndicator /></View>;

  const currentPlatformConfig = SOCIAL_PLATFORMS.find(p => p.id === selectedPlatform);

  return (
    <View className="flex-1 bg-white">
      {/* Modal Grabber Indicator */}
      <View className="items-center pt-2 pb-2 bg-white">
          <View className="w-12 h-1.5 bg-gray-300 rounded-full" />
      </View>

      <ScrollView className="flex-1 px-4">
        {/* Verification Banner */}
        <TouchableOpacity 
            onPress={() => router.push('/(settings)/get-verified')}
            className={`mb-6 p-4 rounded-2xl flex-row items-center justify-between ${
                isVerified ? 'bg-business/10 border border-business/20' : 'bg-gray-50 border border-gray-100 shadow-sm'
            }`}
        >
            <View className="flex-row items-center">
                <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                    isVerified ? 'bg-business' : 'bg-gray-200'
                }`}>
                    <IconSymbol name="checkmark.seal.fill" size={20} color="white" />
                </View>
                <View>
                    <Text className="font-bold text-base text-ink">
                        {isVerified ? 'You are Verified' : 'Get Verified'}
                    </Text>
                    <Text className="text-gray-500 text-xs">
                        {isVerified ? 'Badge active on your profile' : 'Stand out with a blue checkmark'}
                    </Text>
                </View>
            </View>
            {!isVerified && <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />}
        </TouchableOpacity>

        <View className="items-center mb-8">
          <Avatar
            url={avatarUrl}
            size={120}
            onUpload={(url) => setAvatarUrl(url)}
            editable
          />
        </View>

        <View className="mb-4">
          <Text className="text-gray-500 mb-1 ml-1 font-medium">Username</Text>
          <TextInput
              value={username}
              onChangeText={setUsername}
              className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-base text-ink"
          />
        </View>

        <View className="mb-4">
          <Text className="text-gray-500 mb-1 ml-1 font-medium">Full Name</Text>
          <TextInput
              value={fullName}
              onChangeText={setFullName}
              className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-base text-ink"
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
          />
        </View>

        <View className="mb-6">
          <Text className="text-gray-500 mb-2 ml-1 font-bold">Looking For (Select One)</Text>
          <View className="flex-row justify-between">
              {RELATIONSHIP_OPTS.map(opt => {
                  const isSelected = relationshipGoals.includes(opt);
                  return (
                      <TouchableOpacity 
                          key={opt}
                          onPress={() => selectGoal(opt)}
                          className={`w-[32%] py-3 rounded-lg border items-center justify-center shadow-sm ${getGoalStyle(opt, isSelected)}`}
                      >
                          <Text className={`font-bold ${getGoalTextStyle(opt, isSelected)}`}>
                              {opt}
                          </Text>
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
                const config = SOCIAL_PLATFORMS.find(p => p.id === key);
                if (!config) return null;
                return (
                    <View key={key} className="flex-row items-center justify-between bg-white p-3 rounded-lg mb-2 border border-gray-200 shadow-sm">
                        <View className="flex-row items-center flex-1">
                            <IconSymbol name={config.icon as any} size={20} color={config.color} />
                            <Text className="ml-3 font-semibold text-ink capitalize">{config.name}</Text>
                            <Text className="ml-2 text-gray-500 text-xs flex-1" numberOfLines={1}>{value}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeSocial(key)} className="p-1">
                            <IconSymbol name="xmark.circle.fill" size={20} color="#EF4444" />
                        </TouchableOpacity>
                    </View>
                );
            })}

            <TouchableOpacity 
              onPress={openSocialModal}
              className="flex-row items-center justify-center bg-black py-3 rounded-lg mt-2 shadow-md"
            >
                <IconSymbol name="plus" size={16} color="white" />
                <Text className="text-white font-bold ml-2">Add Link</Text>
            </TouchableOpacity>
        </View>
        
        {user && (
            <ProfileGallery 
              userId={user.id} 
              onSetAvatar={handleSetCover} 
            />
        )}

        <View className="h-8" />

        <TouchableOpacity 
            onPress={updateProfile}
            disabled={saving}
            className="bg-black py-4 rounded-xl items-center shadow-lg mb-4"
        >
            {saving ? (
                <ActivityIndicator color="white" />
            ) : (
                <Text className="text-white font-bold text-lg">Save Profile</Text>
            )}
        </TouchableOpacity>
        
        {/* Delete Account Button */}
        <TouchableOpacity 
            onPress={handleDeleteAccount}
            className="items-center py-4 mb-10"
        >
            <Text className="text-romance font-bold">Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Social Modal - Full Height Keyboard Avoiding */}
      <Modal visible={showSocialModal} animationType="slide" transparent>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 justify-end bg-black/50"
          >
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
                            {SOCIAL_PLATFORMS.map(p => {
                                if (socials[p.id as keyof SocialLinks]) return null;
                                return (
                                    <TouchableOpacity 
                                      key={p.id}
                                      onPress={() => setSelectedPlatform(p.id)}
                                      className="w-[30%] aspect-square bg-gray-50 rounded-2xl items-center justify-center mb-4 border border-gray-200 shadow-sm"
                                    >
                                        <IconSymbol name={p.icon as any} size={32} color={p.color} />
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
                                    <IconSymbol name={currentPlatformConfig?.icon as any} size={28} color={currentPlatformConfig?.color} />
                                    <Text className="text-xl font-bold ml-3 text-ink">{currentPlatformConfig?.name}</Text>
                                </View>
                            </View>
                            
                            <Text className="text-gray-500 mb-2 font-semibold ml-1">Enter your handle or URL:</Text>
                            <TextInput
                                placeholder={currentPlatformConfig?.placeholder}
                                value={tempLink}
                                onChangeText={setTempLink}
                                autoCapitalize="none"
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
                                    <Text className={`font-bold text-lg ${!tempLink.trim() ? 'text-gray-400' : 'text-white'}`}>
                                        Save Link
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                  </ScrollView>
              </View>
          </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
