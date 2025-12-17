import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native';
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
        id: user.id,
        username,
        full_name: fullName,
        bio,
        avatar_url: cleanAvatarPath,
        relationship_goals: relationshipGoals,
        // Socials are auto-saved now, but no harm including them to be safe
        social_links: socials,
        updated_at: new Date(),
      };

      console.log('Sending update to Supabase:', updates);

      const { data, error } = await supabase
        .from('profiles')
        .upsert(updates)
        .select();

      if (error) {
        throw error;
      }

      Alert.alert('Success', 'Profile updated successfully!');
      router.back();
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  const selectGoal = (goal: string) => {
    setRelationshipGoals([goal]);
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
      <ScrollView className="flex-1 p-4">
        {/* Verification Banner */}
        <TouchableOpacity 
            onPress={() => router.push('/(settings)/get-verified')}
            className={`mb-6 p-4 rounded-xl flex-row items-center justify-between ${
                isVerified ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'
            }`}
        >
            <View className="flex-row items-center">
                <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                    isVerified ? 'bg-blue-500' : 'bg-gray-200'
                }`}>
                    <IconSymbol name="checkmark.seal.fill" size={20} color="white" />
                </View>
                <View>
                    <Text className="font-bold text-base">
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
          <Text className="text-gray-500 mb-1 ml-1">Username</Text>
          <TextInput
              value={username}
              onChangeText={setUsername}
              className="border border-gray-300 rounded-lg p-3 text-base"
          />
        </View>

        <View className="mb-4">
          <Text className="text-gray-500 mb-1 ml-1">Full Name</Text>
          <TextInput
              value={fullName}
              onChangeText={setFullName}
              className="border border-gray-300 rounded-lg p-3 text-base"
          />
        </View>

        <View className="mb-6">
          <Text className="text-gray-500 mb-1 ml-1">Bio</Text>
          <TextInput
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
              className="border border-gray-300 rounded-lg p-3 text-base h-24"
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
                          className={`w-[32%] py-3 rounded-lg border items-center justify-center ${
                              isSelected ? 'bg-black border-black' : 'bg-white border-gray-300'
                          }`}
                      >
                          <Text className={`font-bold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
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
              className="flex-row items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-200"
            >
                <View className="flex-row items-center">
                    <IconSymbol name="star.fill" size={20} color="#F59E0B" />
                    <Text className="ml-3 font-semibold text-lg">Manage Detailed Interests</Text>
                </View>
                <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
            </TouchableOpacity>
        </View>

        {/* Dynamic Social Links List */}
        <View className="mb-8 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <Text className="text-lg font-bold mb-4">Social Links</Text>
            <Text className="text-gray-400 text-xs mb-4">Added links are saved automatically.</Text>
            
            {Object.entries(socials).map(([key, value]) => {
                const config = SOCIAL_PLATFORMS.find(p => p.id === key);
                if (!config) return null;
                return (
                    <View key={key} className="flex-row items-center justify-between bg-white p-3 rounded-lg mb-2 border border-gray-200">
                        <View className="flex-row items-center flex-1">
                            <IconSymbol name={config.icon as any} size={20} color={config.color} />
                            <Text className="ml-3 font-semibold text-gray-700 capitalize">{config.name}</Text>
                            <Text className="ml-2 text-gray-400 text-xs flex-1" numberOfLines={1}>{value}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeSocial(key)} className="p-1">
                            <IconSymbol name="xmark.circle.fill" size={20} color="#EF4444" />
                        </TouchableOpacity>
                    </View>
                );
            })}

            <TouchableOpacity 
              onPress={openSocialModal}
              className="flex-row items-center justify-center bg-black py-3 rounded-lg mt-2"
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

        <Button title={saving ? 'Saving...' : 'Save Profile'} onPress={updateProfile} disabled={saving} color="#000" />
        
        <View className="h-12" />

        {/* Delete Account Button */}
        <TouchableOpacity 
            onPress={handleDeleteAccount}
            className="items-center py-4"
        >
            <Text className="text-red-500 font-bold">Delete Account</Text>
        </TouchableOpacity>
        
        <View className="h-10" />
      </ScrollView>

      {/* Social Modal - Full Height Keyboard Avoiding */}
      <Modal visible={showSocialModal} animationType="slide" transparent>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 justify-end bg-black/50"
          >
              <View className="bg-white rounded-t-3xl p-6 h-[85%] pb-10">
                  <View className="flex-row justify-between items-center mb-6">
                      <Text className="text-xl font-bold">Add Social Link</Text>
                      <TouchableOpacity onPress={() => setShowSocialModal(false)}>
                          <IconSymbol name="xmark" size={24} color="black" />
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
                                      className="w-[30%] aspect-square bg-gray-50 rounded-xl items-center justify-center mb-4 border border-gray-200"
                                    >
                                        <IconSymbol name={p.icon as any} size={32} color={p.color} />
                                        <Text className="text-xs font-bold mt-2">{p.name}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ) : (
                        <View>
                            <View className="flex-row items-center mb-6">
                                <TouchableOpacity onPress={() => setSelectedPlatform(null)} className="mr-3 p-2 bg-gray-100 rounded-full">
                                    <IconSymbol name="chevron.left" size={24} color="black" />
                                </TouchableOpacity>
                                <View className="flex-row items-center">
                                    <IconSymbol name={currentPlatformConfig?.icon as any} size={28} color={currentPlatformConfig?.color} />
                                    <Text className="text-xl font-bold ml-3">{currentPlatformConfig?.name}</Text>
                                </View>
                            </View>
                            
                            <Text className="text-gray-500 mb-2 font-semibold">Enter your handle or URL:</Text>
                            <TextInput
                                placeholder={currentPlatformConfig?.placeholder}
                                value={tempLink}
                                onChangeText={setTempLink}
                                autoCapitalize="none"
                                className="bg-gray-100 p-5 rounded-2xl text-lg mb-6 border border-gray-200"
                                autoFocus
                            />

                            <TouchableOpacity 
                                onPress={handleAddSocial}
                                disabled={!tempLink.trim() || savingSocial}
                                className={`py-4 rounded-xl items-center flex-row justify-center ${!tempLink.trim() ? 'bg-gray-200' : 'bg-black'}`}
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
