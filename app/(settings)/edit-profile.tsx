import { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, Text, TextInput, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Avatar from '../../components/profile/Avatar';
import ProfileGallery from '../../components/profile/ProfileGallery';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

const AVAILABLE_INTERESTS = [
  'Coffee', 'Hiking', 'Tech', 'Music', 'Art', 
  'Travel', 'Foodie', 'Fitness', 'Gaming', 'Reading',
  'Photography', 'Nightlife', 'Business', 'Cinema'
];

export default function EditProfileScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
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
        .select(`username, full_name, bio, avatar_url, interests`)
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
        setSelectedInterests(data.interests || []);
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

      const updates = {
        id: user.id,
        username,
        full_name: fullName,
        bio,
        avatar_url: avatarUrl,
        interests: selectedInterests,
        updated_at: new Date(),
      };

      console.log('Saving profile updates:', updates); // Debug Log

      const { error } = await supabase.from('profiles').upsert(updates);

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

  const toggleInterest = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(prev => prev.filter(i => i !== interest));
    } else {
      if (selectedInterests.length >= 5) {
        Alert.alert('Limit Reached', 'You can select up to 5 interests.');
        return;
      }
      setSelectedInterests(prev => [...prev, interest]);
    }
  };

  if (loading) return <View className="flex-1 justify-center"><ActivityIndicator /></View>;

  return (
    <ScrollView className="flex-1 bg-white p-4">
      <View className="items-center mb-8">
        <Avatar
          url={avatarUrl}
          size={120}
          onUpload={(url) => {
            setAvatarUrl(url);
          }}
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
        <Text className="text-gray-500 mb-2 ml-1">Interests (Select up to 5)</Text>
        <View className="flex-row flex-wrap">
          {AVAILABLE_INTERESTS.map((interest) => {
            const isSelected = selectedInterests.includes(interest);
            return (
              <TouchableOpacity
                key={interest}
                onPress={() => toggleInterest(interest)}
                className={`px-4 py-2 rounded-full mr-2 mb-2 border ${
                  isSelected ? 'bg-black border-black' : 'bg-white border-gray-300'
                }`}
              >
                <Text className={`${isSelected ? 'text-white' : 'text-gray-700'}`}>
                  {interest}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      
      {user && <ProfileGallery userId={user.id} />}

      <View className="h-8" />

      <Button title={saving ? 'Saving...' : 'Save Profile'} onPress={updateProfile} disabled={saving} color="#000" />
      
      <View className="h-20" />
    </ScrollView>
  );
}

