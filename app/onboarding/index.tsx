import { KeyboardToolbar } from '@/components/KeyboardDismissButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  LayoutAnimation,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import Avatar from '../../components/profile/Avatar';
import { InterestSelector } from '../../components/profile/InterestSelector';
import ProfileGallery from '../../components/profile/ProfileGallery';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const RELATIONSHIP_OPTS = ['Romance', 'Friendship', 'Professional'];

const STEPS = [
  { title: 'Verification', subtitle: 'Use a friend code to keep Proxyme safe and move closer to verification.' },
  { title: 'Your Profile', subtitle: 'Add photos, your intent, and a short bio.' },
  { title: 'Interests', subtitle: 'Pick interests so Proxyme can match you with the right people.' },
];

export default function OnboardingScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingFriendCode, setApplyingFriendCode] = useState(false);
  const [step, setStep] = useState(0);

  // Referral
  const [friendCode, setFriendCode] = useState('');

  // Profile
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [relationshipGoals, setRelationshipGoals] = useState<string[]>([]);

  // Interests
  const [detailedInterests, setDetailedInterests] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (user) void getProfile();
  }, [user]);

  async function getProfile() {
    try {
      setLoading(true);
      if (!user) throw new Error('No user on the session!');

      const { data, error, status } = await supabase
        .from('profiles')
        .select('username, full_name, bio, avatar_url, relationship_goals, detailed_interests, referred_by')
        .eq('id', user.id)
        .single();

      if (error && status !== 406) throw error;

      if (data) {
        setUsername(data.username || '');
        setFullName(data.full_name || '');
        setBio(data.bio || '');
        setAvatarUrl(data.avatar_url);
        setRelationshipGoals(data.relationship_goals || []);
        setDetailedInterests(data.detailed_interests || {});
        // If already referred, keep input blank (and RPC will reject re-applying anyway).
      }
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
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
  };

  const applyFriendCode = async () => {
    if (!user) return;
    const trimmed = friendCode.trim();
    if (!trimmed) return;

    setApplyingFriendCode(true);
    try {
      const { error } = await supabase.rpc('apply_friend_code', { p_friend_code: trimmed });
      if (error) throw error;
    } finally {
      setApplyingFriendCode(false);
    }
  };

  const nextStep = async () => {
    // Step 0: friend code (optional)
    if (step === 0) {
      if (friendCode.trim()) {
        try {
          await applyFriendCode();
          Alert.alert('Applied', 'Friend code applied successfully.');
        } catch (error: any) {
          Alert.alert('Friend code not applied', error?.message || 'Please check the code and try again.');
          return;
        }
      }
    }

    // Step 1: profile requirements
    if (step === 1) {
      if (!avatarUrl) {
        Alert.alert('Required', 'Please upload a profile picture.');
        return;
      }
      if (!username.trim() || !fullName.trim()) {
        Alert.alert('Required', 'Please enter your username and full name.');
        return;
      }
      if (relationshipGoals.length === 0) {
        Alert.alert('Required', 'Please select what you are looking for.');
        return;
      }
    }

    // Step 2: interests
    if (step === 2) {
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
      await completeSetup();
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
        detailed_interests: detailedInterests,
        is_onboarded: true,
        updated_at: new Date(),
      };

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;

      // Verify the update was successful by fetching it back
      const { data: verifyData, error: verifyError } = await supabase
        .from('profiles')
        .select('is_onboarded')
        .eq('id', user.id)
        .single();

      if (verifyError || !verifyData?.is_onboarded) {
        throw new Error('Failed to complete onboarding. Please try again.');
      }

      // Small delay to ensure routing check sees updated data
      await new Promise(resolve => setTimeout(resolve, 100));
      
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View className="flex-1 justify-center"><ActivityIndicator /></View>;

  return (
    <View className="flex-1 bg-white pt-12">
      <View className="px-6 mb-6">
        <View className="mb-2">
          <Text className="text-3xl font-bold text-ink">{STEPS[step].title}</Text>
          <Text className="text-gray-500 text-base mt-1">{STEPS[step].subtitle}</Text>
        </View>
        <View className="flex-row items-center justify-between mb-2">
          <View className="h-1.5 bg-gray-100 rounded-full flex-1 overflow-hidden mr-3">
            <View className="h-full bg-black rounded-full" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </View>
          <Text className="text-gray-400 font-bold text-sm">{step + 1}/{STEPS.length}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View className="mt-6">
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-black items-center justify-center mr-3">
                  <IconSymbol name="checkmark.seal.fill" size={18} color="white" />
                </View>
                <View className="flex-1">
                  <Text className="text-ink font-bold text-lg">How verification works</Text>
                  <Text className="text-gray-500 text-sm mt-0.5">
                    Friend codes help reduce fake accounts. Referrals also move people closer to verification.
                  </Text>
                </View>
              </View>

              <View className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 mt-3">
                <Text className="text-gray-500 font-bold mb-2 ml-1">Friend Code (optional)</Text>
                <TextInput
                  value={friendCode}
                  onChangeText={(t) => setFriendCode(t.replace(/\s/g, ''))}
                  className="text-ink text-2xl font-bold tracking-widest"
                  placeholder="123456"
                  placeholderTextColor="#9CA3AF"
                  maxLength={6}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                <Text className="text-gray-400 text-xs mt-2">
                  If you were referred, enter your friend’s 6-digit code.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setFriendCode('');
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setStep(1);
                }}
                className="mt-4 items-center"
              >
                <Text className="text-gray-500 font-bold">Skip for now</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 1 && user && (
          <View className="mt-4">
            <View className="items-center mt-2">
              <Avatar url={avatarUrl} size={150} onUpload={(url) => setAvatarUrl(url)} editable />
              <Text className="text-gray-400 text-sm mt-3">Tap to upload your main photo</Text>
            </View>

            <View className="mt-6">
              <Text className="text-gray-500 font-bold mb-3 ml-1">More photos (optional)</Text>
              <ProfileGallery userId={user.id} onSetAvatar={handleSetCover} />
            </View>

            <View className="mt-6">
              <View className="mb-6">
                <Text className="text-gray-500 mb-2 ml-1 font-bold">Username</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-lg text-ink"
                  placeholder="Unique username"
                  autoCapitalize="none"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>

              <View className="mb-6">
                <Text className="text-gray-500 mb-2 ml-1 font-bold">Full Name</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-lg text-ink"
                  placeholder="Your name"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>

              <View className="mb-6">
                <Text className="text-gray-500 mb-2 ml-1 font-bold">Bio</Text>
                <TextInput
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={4}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-lg h-32 text-ink"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={{ textAlignVertical: 'top' }}
                  placeholder="Tell people what you're about..."
                />
              </View>
            </View>

            <View className="mt-2">
              <Text className="text-gray-500 mb-3 ml-1 font-bold">What are you looking for?</Text>
              {RELATIONSHIP_OPTS.map((opt) => {
                const isSelected = relationshipGoals.includes(opt);
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => selectGoal(opt)}
                    className={`w-full py-6 rounded-2xl border mb-4 items-center justify-center shadow-sm ${getGoalStyle(opt, isSelected)}`}
                  >
                    <Text className={`font-bold text-xl ${getGoalTextStyle(opt, isSelected)}`}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {step === 2 && (
          <View className="mt-2">
            <Text className="text-gray-500 mb-4 text-base leading-5">
              Select up to <Text className="font-bold text-black">3 categories</Text>, then add your top favorites.
            </Text>
            <InterestSelector interests={detailedInterests} onChange={setDetailedInterests} />
          </View>
        )}
      </ScrollView>

      <View className="p-6 bg-white border-t border-gray-100">
        <View className="flex-row space-x-4">
          {step > 0 && (
            <TouchableOpacity
              onPress={prevStep}
              disabled={saving || applyingFriendCode}
              className="flex-1 bg-gray-100 py-4 rounded-2xl items-center border border-gray-200"
            >
              <Text className="text-gray-600 font-bold text-lg">Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={nextStep}
            disabled={saving || applyingFriendCode}
            className="flex-1 bg-black py-4 rounded-2xl items-center shadow-lg"
          >
            {saving || applyingFriendCode ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">{step === STEPS.length - 1 ? 'Finish' : 'Next'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardToolbar />
    </View>
  );
}

