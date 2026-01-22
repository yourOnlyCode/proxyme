import { KeyboardDismissWrapper } from '@/components/KeyboardDismissButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OrbBackground } from '@/components/ui/OrbBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/profile/Avatar';
import { InterestSelector } from '../../components/profile/InterestSelector';
import ProfileGallery from '../../components/profile/ProfileGallery';
import { useAuth } from '../../lib/auth';
import { validateFullName, validateUsername } from '../../lib/nameValidation';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const RELATIONSHIP_OPTS = ['Romance', 'Friendship', 'Professional'];
const GENDER_OPTS = ['male', 'female', 'other'] as const;
const ROMANCE_PREF_OPTS = ['male', 'female', 'both', 'other'] as const;

const STEPS = [
  { title: 'Age', subtitle: 'Enter your date of birth. This determines the experience you’ll get.' },
  { title: 'Friend code', subtitle: 'Optional. Friend codes help people earn Trendsetter status (orange check).' },
  { title: 'Your Profile', subtitle: 'Add photos, your intent, and a short bio.' },
  { title: 'Interests', subtitle: 'Pick interests so Proxyme can match you with the right people.' },
];

export default function OnboardingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingFriendCode, setApplyingFriendCode] = useState(false);
  const [step, setStep] = useState(0);

  // Age gate
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [birthdatePickerOpen, setBirthdatePickerOpen] = useState(false);
  const [birthdateDraft, setBirthdateDraft] = useState<Date>(new Date(2000, 0, 1));

  // Referral
  const [friendCode, setFriendCode] = useState('');

  // Profile
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [relationshipGoals, setRelationshipGoals] = useState<string[]>([]);
  const [romanceMinAge, setRomanceMinAge] = useState(18);
  const [romanceMaxAge, setRomanceMaxAge] = useState(35);
  const [gender, setGender] = useState<(typeof GENDER_OPTS)[number] | null>(null);
  const [romancePreference, setRomancePreference] = useState<(typeof ROMANCE_PREF_OPTS)[number] | null>(null);
  const [professionalTitle, setProfessionalTitle] = useState('');

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
        // Note: birthdate is intentionally not selectable by client roles (privacy hardening).
        .select('username, full_name, bio, avatar_url, relationship_goals, detailed_interests, referred_by, romance_min_age, romance_max_age')
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
        setRomanceMinAge(Math.max(18, Number(data.romance_min_age ?? 18)));
        setRomanceMaxAge(Math.max(18, Number(data.romance_max_age ?? 35)));
        setGender(((data as any).gender as any) ?? null);
        setRomancePreference(((data as any).romance_preference as any) ?? null);
        setProfessionalTitle(((data as any).professional_title as string) ?? '');
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

  const ageYears = (() => {
    if (!birthdate) return null;
    const now = new Date();
    let age = now.getFullYear() - birthdate.getFullYear();
    const m = now.getMonth() - birthdate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthdate.getDate())) age -= 1;
    return age;
  })();
  const isMinor = ageYears !== null && ageYears >= 13 && ageYears < 18;
  const isUnder13 = ageYears !== null && ageYears < 13;

      // Minors are friendship-only and do not choose intent.
  useEffect(() => {
    if (isMinor) setRelationshipGoals([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMinor]);

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
    // Step 0: DOB (required)
    if (step === 0) {
      if (!birthdate) {
        Alert.alert('Required', 'Please enter your date of birth.');
        return;
      }
      if (ageYears !== null && ageYears < 13) {
        // The button is disabled for under-13, but keep a guard in case of future UI changes.
        Alert.alert('Not eligible', 'Users younger than 13 are not permitted.');
        return;
      }
    }

    // Step 1: friend code (optional)
    if (step === 1) {
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

    // Step 2: profile requirements
    if (step === 2) {
      if (!avatarUrl) {
        Alert.alert('Required', 'Please upload a profile picture.');
        return;
      }
      if (!username.trim() || !fullName.trim()) {
        Alert.alert('Required', 'Please enter your username and full name.');
        return;
      }
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
      if (!isMinor && relationshipGoals.length === 0) {
        Alert.alert('Required', 'Please select what you are looking for.');
        return;
      }
      if (!isMinor && relationshipGoals[0] === 'Professional') {
        if (!professionalTitle.trim()) {
          Alert.alert('Required', 'Please add your professional title.');
          return;
        }
      }
      if (!isMinor && relationshipGoals[0] === 'Romance') {
        if (!gender) {
          Alert.alert('Required', 'Please select your gender.');
          return;
        }
        if (!romancePreference) {
          Alert.alert('Required', 'Please select your romance preference.');
          return;
        }
        const min = Math.max(18, Math.floor(romanceMinAge));
        const max = Math.max(min, Math.floor(romanceMaxAge));
        if (min < 18) {
          Alert.alert('Romance age range', 'Minimum age must be 18 or higher.');
          return;
        }
        if (max < min) {
          Alert.alert('Romance age range', 'Please make sure your max age is not lower than your min age.');
          return;
        }
      }
    }

    // Step 3: interests
    if (step === 3) {
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
        birthdate: birthdate ? birthdate.toISOString().slice(0, 10) : null,
        username,
        full_name: fullName,
        bio,
        avatar_url: cleanAvatarPath,
        relationship_goals: isMinor ? ['Friendship'] : relationshipGoals,
        romance_min_age: !isMinor ? Math.max(18, Math.floor(romanceMinAge)) : 18,
        romance_max_age: !isMinor ? Math.max(Math.max(18, Math.floor(romanceMinAge)), Math.floor(romanceMaxAge)) : 99,
        gender: !isMinor && relationshipGoals[0] === 'Romance' ? gender : null,
        romance_preference: !isMinor && relationshipGoals[0] === 'Romance' ? romancePreference : null,
        professional_title: !isMinor && relationshipGoals[0] === 'Professional' ? professionalTitle.trim() : null,
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

      // Prevent the legacy global tutorial modal from showing now that we use per-tab coach marks.
      try {
        await AsyncStorage.setItem('hasSeenTutorial', 'true');
      } catch {
        // ignore
      }
      
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View className="flex-1 justify-center"><ActivityIndicator /></View>;

  const canGoNext = (() => {
    if (saving || applyingFriendCode) return false;
    if (step === 0) return !!birthdate && !isUnder13;
    if (step === 1) return true;
    if (step === 2) {
      if (!avatarUrl) return false;
      const u = validateUsername(username);
      const n = validateFullName(fullName);
      if (!u.ok || !n.ok) return false;
      if (!isMinor && relationshipGoals.length === 0) return false; // intent required for adults only
      if (!isMinor && relationshipGoals[0] === 'Professional' && !professionalTitle.trim()) return false;
      if (!isMinor && relationshipGoals[0] === 'Romance') {
        if (!gender || !romancePreference) return false;
        const min = Math.max(18, Math.floor(romanceMinAge));
        const max = Math.max(min, Math.floor(romanceMaxAge));
        if (min < 18) return false;
        if (max < min) return false;
      }
      return true;
    }
    if (step === 3) return Object.keys(detailedInterests).length > 0;
    return true;
  })();

  return (
    <KeyboardDismissWrapper>
    <View className="flex-1 bg-transparent">
      <OrbBackground opacity={0.42} />

      {/* Header */}
      <View
        className="px-6 pb-3 border-b border-gray-100"
        style={{ paddingTop: insets.top + 10, backgroundColor: 'rgba(255,255,255,0.85)' }}
      >
        <Text className="text-xl text-ink text-center" style={{ fontFamily: 'LibertinusSans-Regular' }}>
          onboarding
        </Text>
        <View className="mt-2">
          <Text className="text-[18px] font-bold text-ink">{STEPS[step].title}</Text>
          <Text className="text-gray-500 text-sm mt-1">{STEPS[step].subtitle}</Text>
        </View>

        <View className="flex-row items-center justify-between mt-3">
          <View className="h-1.5 bg-gray-100 rounded-full flex-1 overflow-hidden mr-3">
            <View className="h-full bg-black rounded-full" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </View>
          <Text className="text-gray-400 font-bold text-xs">{step + 1}/{STEPS.length}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View className="mt-6">
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-black items-center justify-center mr-3">
                  <IconSymbol name="person.crop.circle" size={18} color="white" />
                </View>
                <View className="flex-1">
                  <Text className="text-ink font-bold text-lg">Date of birth</Text>
                  <Text className="text-gray-500 text-sm mt-0.5">
                    This is used to keep experiences age-appropriate. We don’t show your age publicly right now.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setBirthdateDraft(birthdate ?? new Date(2000, 0, 1));
                  setBirthdatePickerOpen(true);
                }}
                className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 mt-3"
              >
                <Text className="text-gray-500 font-bold mb-1 ml-1">Birthday</Text>
                <Text className="text-ink text-xl font-extrabold">
                  {birthdate ? birthdate.toLocaleDateString() : 'Tap to select'}
                </Text>
                {ageYears !== null ? (
                  <Text className={`text-xs mt-2 ${isUnder13 ? 'text-red-600' : 'text-gray-400'}`}>
                    {isUnder13 ? 'Please check your DOB — users younger than 13 are not permitted.' : `Age: ${ageYears}`}
                  </Text>
                ) : (
                  <Text className="text-gray-400 text-xs mt-2">You must be 13+ to continue.</Text>
                )}
              </TouchableOpacity>

              <Modal
                transparent
                animationType="fade"
                visible={birthdatePickerOpen}
                onRequestClose={() => setBirthdatePickerOpen(false)}
              >
                <Pressable
                  style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
                  onPress={() => setBirthdatePickerOpen(false)}
                >
                  <Pressable
                    onPress={() => {}}
                    style={{
                      backgroundColor: 'white',
                      borderTopLeftRadius: 22,
                      borderTopRightRadius: 22,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.20)',
                    }}
                  >
                    <DateTimePicker
                      value={birthdateDraft}
                      mode="date"
                      maximumDate={new Date()}
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      // Fix iOS dark-mode spinner being invisible on light sheet.
                      themeVariant="light"
                      textColor="#111827"
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        // Android: the picker closes after select/cancel.
                        if (Platform.OS === 'android') {
                          setBirthdatePickerOpen(false);
                          if (event.type === 'set' && date) setBirthdate(date);
                          return;
                        }
                        // iOS: keep it open and update draft
                        if (date) setBirthdateDraft(date);
                      }}
                    />
                    {Platform.OS === 'ios' ? (
                      <View className="flex-row justify-between mt-3">
                        <TouchableOpacity onPress={() => setBirthdatePickerOpen(false)} className="px-4 py-3 rounded-xl bg-gray-100">
                          <Text className="text-gray-700 font-bold">Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setBirthdate(birthdateDraft);
                            setBirthdatePickerOpen(false);
                          }}
                          className="px-4 py-3 rounded-xl bg-black"
                        >
                          <Text className="text-white font-bold">Done</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </Pressable>
                </Pressable>
              </Modal>

              {isMinor ? (
                <View className="mt-4 px-4 py-3 rounded-2xl bg-friendship/10 border border-friendship/20">
                  <Text className="text-friendship font-bold text-sm">Friendship-only mode (13–17)</Text>
                  <Text className="text-gray-500 text-xs mt-1">
                    You’ll only see people in your age group, and romantic intent is disabled.
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {step === 1 && (
          <View className="mt-6">
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-black items-center justify-center mr-3">
                  <IconSymbol name="checkmark.seal.fill" size={18} color="white" />
                </View>
                <View className="flex-1">
                  <Text className="text-ink font-bold text-lg">Friend code (optional)</Text>
                  <Text className="text-gray-500 text-sm mt-0.5">
                    Friend codes are optional. If 3 friends sign up with your code, you unlock Trendsetter status (orange check).
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
                  setStep(2);
                }}
                className="mt-4 items-center"
              >
                <Text className="text-gray-500 font-bold">Skip for now</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 2 && user && (
          <View className="mt-4">
            <View className="items-center mt-2">
              <Avatar url={avatarUrl} size={150} onUpload={(url) => setAvatarUrl(url)} editable />
              <Text className="text-gray-400 text-xs mt-2">Tap to upload your main photo</Text>
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
                  className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-base text-ink"
                  placeholder="username"
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
                  className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-base text-ink"
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
                  className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-base h-28 text-ink"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={{ textAlignVertical: 'top' }}
                  placeholder="Tell people what you're about..."
                />
              </View>
            </View>

            <View className="mt-2">
              {!isMinor ? (
                <>
                  <Text className="text-gray-500 mb-2 ml-1 font-bold">What are you looking for?</Text>
                  {RELATIONSHIP_OPTS.map((opt) => {
                    const isSelected = relationshipGoals.includes(opt);
                    return (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => selectGoal(opt)}
                        className={`w-full py-3 rounded-xl border mb-3 items-center justify-center shadow-sm ${getGoalStyle(opt, isSelected)}`}
                      >
                        <Text className={`font-bold text-base ${getGoalTextStyle(opt, isSelected)}`}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {relationshipGoals.length === 0 ? (
                    <Text className="text-[11px] text-gray-400 mt-1 ml-1">
                      Required to continue.
                    </Text>
                  ) : null}

                  {relationshipGoals[0] === 'Romance' ? (
                    <View className="mt-3 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                      <Text className="text-gray-500 font-bold mb-2">Your gender</Text>
                      <View className="flex-row flex-wrap mb-4">
                        {GENDER_OPTS.map((g) => {
                          const selected = gender === g;
                          return (
                            <TouchableOpacity
                              key={g}
                              onPress={() => setGender(g)}
                              className={`px-4 py-2 rounded-full mr-2 mb-2 border ${selected ? 'bg-black border-black' : 'bg-white border-gray-200'}`}
                              activeOpacity={0.9}
                            >
                              <Text className={`font-bold ${selected ? 'text-white' : 'text-gray-700'}`}>{g}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <Text className="text-gray-500 font-bold mb-2">Preference</Text>
                      <View className="flex-row flex-wrap mb-4">
                        {ROMANCE_PREF_OPTS.map((p) => {
                          const selected = romancePreference === p;
                          return (
                            <TouchableOpacity
                              key={p}
                              onPress={() => setRomancePreference(p)}
                              className={`px-4 py-2 rounded-full mr-2 mb-2 border ${selected ? 'bg-black border-black' : 'bg-white border-gray-200'}`}
                              activeOpacity={0.9}
                            >
                              <Text className={`font-bold ${selected ? 'text-white' : 'text-gray-700'}`}>{p}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <Text className="text-gray-500 font-bold mb-2">Romance age range</Text>
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-ink font-extrabold">{Math.max(18, Math.floor(romanceMinAge))}</Text>
                        <Text className="text-gray-400 text-xs">to</Text>
                        <Text className="text-ink font-extrabold">{Math.max(Math.max(18, Math.floor(romanceMinAge)), Math.floor(romanceMaxAge))}</Text>
                      </View>
                      <Text className="text-gray-400 text-xs mb-2">Minimum (18+)</Text>
                      <Slider
                        minimumValue={18}
                        maximumValue={99}
                        step={1}
                        value={romanceMinAge}
                        onValueChange={(v) => {
                          setRomanceMinAge(v);
                          if (v > romanceMaxAge) setRomanceMaxAge(v);
                        }}
                        minimumTrackTintColor="#111827"
                        maximumTrackTintColor="#E5E7EB"
                      />
                      <Text className="text-gray-400 text-xs mt-3 mb-2">Maximum</Text>
                      <Slider
                        minimumValue={18}
                        maximumValue={99}
                        step={1}
                        value={romanceMaxAge}
                        onValueChange={(v) => setRomanceMaxAge(v)}
                        minimumTrackTintColor="#111827"
                        maximumTrackTintColor="#E5E7EB"
                      />
                    </View>
                  ) : relationshipGoals[0] === 'Professional' ? (
                    <View className="mt-3 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                      <Text className="text-gray-500 font-bold mb-2">Title</Text>
                      <TextInput
                        value={professionalTitle}
                        onChangeText={setProfessionalTitle}
                        placeholder="what do you do?"
                        placeholderTextColor="#9CA3AF"
                        className="bg-white border border-gray-200 rounded-xl p-3 text-base text-ink"
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={() => Keyboard.dismiss()}
                      />
                    </View>
                  ) : null}
                </>
              ) : (
                <View className="bg-friendship/10 border border-friendship/20 rounded-2xl p-4">
                  <Text className="text-friendship font-bold">Friendship-only mode</Text>
                  <Text className="text-gray-500 text-xs mt-1">
                    Intent is hidden for 13–17 accounts. You’ll only see people in your age group.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {step === 3 && (
          <View className="mt-2">
            <Text className="text-gray-500 mb-4 text-base leading-5">
              Select up to <Text className="font-bold text-black">3 categories</Text>, then add your top favorites.
            </Text>
            <InterestSelector interests={detailedInterests} onChange={setDetailedInterests} />
          </View>
        )}
      </ScrollView>

      <View className="px-6 py-4 bg-white border-t border-gray-100">
        <View className="flex-row space-x-4">
          {step > 0 && (
            <TouchableOpacity
              onPress={prevStep}
              disabled={saving || applyingFriendCode}
              className="flex-1 bg-gray-100 py-3 rounded-2xl items-center border border-gray-200"
            >
              <Text className="text-gray-600 font-bold text-sm">Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={nextStep}
            disabled={!canGoNext}
            className={`flex-1 py-3 rounded-2xl items-center shadow-lg ${canGoNext ? 'bg-black' : 'bg-gray-300'}`}
          >
            {saving || applyingFriendCode ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-sm">{step === STEPS.length - 1 ? 'Finish' : 'Next'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

    </View>
    </KeyboardDismissWrapper>
  );
}

