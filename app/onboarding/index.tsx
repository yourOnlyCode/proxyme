import { IconSymbol } from '@/components/ui/icon-symbol';
import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native';
import Avatar from '../../components/profile/Avatar';
import ProfileGallery from '../../components/profile/ProfileGallery';
import { InterestSelector } from '../../components/profile/InterestSelector';
import { useAuth } from '../../lib/auth';
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

const STEPS = [
    { title: 'Welcome', subtitle: 'Start by adding a profile picture.' },
    { title: 'The Basics', subtitle: 'Tell us a bit about yourself.' },
    { title: 'Looking For', subtitle: 'What brings you here?' },
    { title: 'Interests', subtitle: 'What are you into? Add specific favorites.' },
    { title: 'Connect', subtitle: 'Add your socials so others can follow you.' },
    { title: 'Gallery', subtitle: 'Show off your best photos.' },
];

export default function CompleteProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  
  // Form State
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [relationshipGoals, setRelationshipGoals] = useState<string[]>([]);
  const [socials, setSocials] = useState<SocialLinks>({});
  const [detailedInterests, setDetailedInterests] = useState<Record<string, string[]>>({});
  
  // Modal State
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');
  const [savingSocial, setSavingSocial] = useState(false);

  useEffect(() => {
    if (user) getProfile();
  }, [user]);

  async function getProfile() {
    try {
      setLoading(true);
      if (!user) throw new Error('No user on the session!');

      const { data, error, status } = await supabase
        .from('profiles')
        .select(`username, full_name, bio, avatar_url, relationship_goals, social_links, detailed_interests`)
        .eq('id', user.id)
        .single();

      if (error && status !== 406) throw error;

      if (data) {
        setUsername(data.username || '');
        setFullName(data.full_name || '');
        setBio(data.bio || '');
        setAvatarUrl(data.avatar_url);
        setRelationshipGoals(data.relationship_goals || []);
        setSocials(data.social_links || {});
        setDetailedInterests(data.detailed_interests || {});
      }
    } catch (error) {
        console.log(error);
    } finally {
      setLoading(false);
    }
  }

  const nextStep = () => {
      // Validation per step
      if (step === 0 && !avatarUrl) {
          Alert.alert('Required', 'Please upload a profile picture.');
          return;
      }
      if (step === 1 && (!username.trim() || !fullName.trim())) {
          Alert.alert('Required', 'Please enter your username and full name.');
          return;
      }
      if (step === 2 && relationshipGoals.length === 0) {
          Alert.alert('Required', 'Please select what you are looking for.');
          return;
      }
      if (step === 3) {
          // Check if at least one interest category is selected
          const hasInterest = Object.keys(detailedInterests).length > 0;
          if (!hasInterest) {
              Alert.alert('Required', 'Please add at least one interest category.');
              return;
          }
      }

      if (step < STEPS.length - 1) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setStep(step + 1);
      } else {
          completeSetup();
      }
  };

  const prevStep = () => {
      if (step > 0) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setStep(step - 1);
      }
  };

  async function completeSetup() {
    try {
      if (!user) throw new Error('No user on the session!');
      setSaving(true);

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
        detailed_interests: detailedInterests,
        is_onboarded: true, 
        updated_at: new Date(),
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      router.replace('/(tabs)');

    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  // --- Helpers ---

  const selectGoal = (goal: string) => {
    setRelationshipGoals([goal]);
  };

  const getGoalStyle = (goal: string, isSelected: boolean) => {
      switch(goal) {
          case 'Romance': return isSelected ? 'bg-romance border-romance' : 'border-romance/30 bg-white';
          case 'Friendship': return isSelected ? 'bg-friendship border-friendship' : 'border-friendship/30 bg-white';
          case 'Professional': return isSelected ? 'bg-business border-business' : 'border-business/30 bg-white';
          default: return isSelected ? 'bg-black border-black' : 'border-gray-300 bg-white';
      }
  };

  const getGoalTextStyle = (goal: string, isSelected: boolean) => {
      if (isSelected) return 'text-white';
      switch(goal) {
          case 'Romance': return 'text-romance';
          case 'Friendship': return 'text-friendship';
          case 'Professional': return 'text-business';
          default: return 'text-gray-700';
      }
  };

  const handleSetCover = async (path: string) => {
      setAvatarUrl(path);
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
              const newSocials = { ...socials, [selectedPlatform]: tempLink.trim() };
              setSocials(newSocials);
              // Auto-save not needed strictly in wizard, but good for persistence if they drop off?
              // Let's stick to final save for consistency in wizard flow, OR save partially.
              // Saving partially is safer against crashes.
              await supabase.from('profiles').update({ social_links: newSocials }).eq('id', user.id);
              setShowSocialModal(false);
          } catch (error) {
              Alert.alert('Error', 'Failed to save social link.');
          } finally {
              setSavingSocial(false);
          }
      }
  };

  const removeSocial = async (key: string) => {
      if (!user) return;
      const newSocials = { ...socials };
      delete newSocials[key as keyof SocialLinks];
      setSocials(newSocials);
      await supabase.from('profiles').update({ social_links: newSocials }).eq('id', user.id);
  };

  if (loading) return <View className="flex-1 justify-center"><ActivityIndicator /></View>;

  const currentPlatformConfig = SOCIAL_PLATFORMS.find(p => p.id === selectedPlatform);

  return (
    <View className="flex-1 bg-white pt-12">
      <View className="px-6 mb-6">
          <View className="flex-row justify-between items-end mb-2">
              <View>
                  <Text className="text-3xl font-bold text-ink">{STEPS[step].title}</Text>
                  <Text className="text-gray-500 text-base mt-1">{STEPS[step].subtitle}</Text>
              </View>
              <Text className="text-gray-300 font-bold text-xl">{step + 1}/{STEPS.length}</Text>
          </View>
          {/* Progress Bar */}
          <View className="h-1.5 bg-gray-100 rounded-full w-full overflow-hidden">
              <View 
                className="h-full bg-black rounded-full" 
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} 
              />
          </View>
      </View>

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* Step 0: Welcome / Avatar */}
        {step === 0 && (
            <View className="items-center mt-10">
                <Avatar
                    url={avatarUrl}
                    size={160}
                    onUpload={(url) => setAvatarUrl(url)}
                    editable
                />
                <Text className="text-gray-400 text-sm mt-4">Tap to upload profile picture</Text>
            </View>
        )}

        {/* Step 1: Basics */}
        {step === 1 && (
            <View className="mt-4">
                <View className="mb-6">
                    <Text className="text-gray-500 mb-2 ml-1 font-bold">Username</Text>
                    <TextInput
                        value={username}
                        onChangeText={setUsername}
                        className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-lg text-ink"
                        placeholder="Unique username"
                        autoCapitalize="none"
                    />
                </View>

                <View className="mb-6">
                    <Text className="text-gray-500 mb-2 ml-1 font-bold">Full Name</Text>
                    <TextInput
                        value={fullName}
                        onChangeText={setFullName}
                        className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-lg text-ink"
                        placeholder="Your name"
                    />
                </View>

                <View className="mb-6">
                    <Text className="text-gray-500 mb-2 ml-1 font-bold">Bio (Optional)</Text>
                    <TextInput
                        value={bio}
                        onChangeText={setBio}
                        multiline
                        numberOfLines={4}
                        className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-lg h-32 text-ink"
                        style={{ textAlignVertical: 'top' }}
                        placeholder="Tell us about yourself..."
                    />
                </View>
            </View>
        )}

        {/* Step 2: Goals */}
        {step === 2 && (
            <View className="mt-4">
                {RELATIONSHIP_OPTS.map(opt => {
                    const isSelected = relationshipGoals.includes(opt);
                    return (
                        <TouchableOpacity 
                            key={opt}
                            onPress={() => selectGoal(opt)}
                            className={`w-full py-6 rounded-2xl border mb-4 items-center justify-center shadow-sm ${getGoalStyle(opt, isSelected)}`}
                        >
                            <Text className={`font-bold text-xl ${getGoalTextStyle(opt, isSelected)}`}>
                                {opt}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        )}

        {/* Step 3: Interests */}
        {step === 3 && (
            <View className="mt-2">
                <InterestSelector 
                    interests={detailedInterests}
                    onChange={setDetailedInterests}
                />
            </View>
        )}

        {/* Step 4: Socials */}
        {step === 4 && (
            <View className="mt-4">
                {Object.entries(socials).map(([key, value]) => {
                    const config = SOCIAL_PLATFORMS.find(p => p.id === key);
                    if (!config) return null;
                    const IconComponent = config.lib;
                    return (
                        <View key={key} className="flex-row items-center justify-between bg-white p-4 rounded-xl mb-3 border border-gray-200 shadow-sm">
                            <View className="flex-row items-center flex-1">
                                <IconComponent name={config.icon as any} size={24} color={config.color} />
                                <Text className="ml-3 font-bold text-ink capitalize text-lg">{config.name}</Text>
                                <Text className="ml-2 text-gray-500 text-sm flex-1" numberOfLines={1}>{value}</Text>
                            </View>
                            <TouchableOpacity onPress={() => removeSocial(key)} className="p-2">
                                <IconSymbol name="xmark.circle.fill" size={24} color="#EF4444" />
                            </TouchableOpacity>
                        </View>
                    );
                })}

                <TouchableOpacity 
                    onPress={openSocialModal}
                    className="flex-row items-center justify-center bg-gray-100 py-4 rounded-xl mt-2 border border-dashed border-gray-300"
                >
                    <IconSymbol name="plus" size={20} color="#4A5568" />
                    <Text className="text-gray-600 font-bold ml-2 text-lg">Add Link</Text>
                </TouchableOpacity>
            </View>
        )}

        {/* Step 5: Gallery */}
        {step === 5 && user && (
            <View className="mt-4">
                <ProfileGallery 
                  userId={user.id} 
                  onSetAvatar={handleSetCover} 
                />
            </View>
        )}

      </ScrollView>

      {/* Footer Navigation */}
      <View className="p-6 bg-white border-t border-gray-100">
          <View className="flex-row space-x-4">
              {step > 0 && (
                  <TouchableOpacity 
                      onPress={prevStep}
                      disabled={saving}
                      className="flex-1 bg-gray-100 py-4 rounded-2xl items-center border border-gray-200"
                  >
                      <Text className="text-gray-600 font-bold text-lg">Back</Text>
                  </TouchableOpacity>
              )}
              <TouchableOpacity 
                  onPress={nextStep}
                  disabled={saving}
                  className="flex-1 bg-black py-4 rounded-2xl items-center shadow-lg"
              >
                  {saving ? (
                      <ActivityIndicator color="white" />
                  ) : (
                      <Text className="text-white font-bold text-lg">
                          {step === STEPS.length - 1 ? 'Finish' : 'Next'}
                      </Text>
                  )}
              </TouchableOpacity>
          </View>
      </View>

      {/* Social Modal */}
      <Modal visible={showSocialModal} animationType="slide" transparent>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 justify-end bg-black/50"
          >
              <View className="bg-white rounded-t-3xl p-6 h-[85%] pb-10">
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
