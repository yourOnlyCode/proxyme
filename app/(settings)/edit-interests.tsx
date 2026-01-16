import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, LayoutAnimation, Platform, ScrollView, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native';
import { InterestSelector } from '../../components/profile/InterestSelector'; // Import component
import { KeyboardDismissWrapper } from '../../components/KeyboardDismissButton';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type DetailedInterests = Record<string, string[]>;

export default function EditInterestsScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [interestDetails, setInterestDetails] = useState<DetailedInterests>({});
  
  const router = useRouter();

  useEffect(() => {
    if (user) fetchInterests();
  }, [user]);

  async function fetchInterests() {
    try {
      setLoading(true);
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select(`detailed_interests`)
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setInterestDetails(data.detailed_interests || {});
      }
    } catch (error) {
       console.log('Error fetching interests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveInterests() {
    try {
      setSaving(true);
      if (!user) throw new Error('No user on the session!');

      // Clean up empty strings
      const cleanedInterests: DetailedInterests = {};
      Object.keys(interestDetails).forEach(key => {
          const validItems = interestDetails[key].filter(item => item.trim() !== '');
          cleanedInterests[key] = validItems;
      });

      const { error } = await supabase
        .from('profiles')
        .update({
            detailed_interests: cleanedInterests,
            updated_at: new Date(),
        })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert('Success', 'Interests updated!');
      router.back();
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View className="flex-1 justify-center"><ActivityIndicator /></View>;

  return (
    <KeyboardDismissWrapper>
      <View className="flex-1 bg-white" style={{ backgroundColor: isDark ? '#0B1220' : undefined }}>
        <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
          <View className="mb-6">
            <Text className="text-2xl font-bold mb-2" style={{ color: isDark ? '#E5E7EB' : undefined }}>Detailed Interests</Text>
            <Text className="text-gray-500 mb-6 text-base leading-5" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
                Select up to <Text className="font-bold text-black" style={{ color: isDark ? '#E5E7EB' : undefined }}>3 categories</Text>. 
                For each, list your top 3 specific favorites.
                {'\n\n'}
                <Text className="italic text-gray-400">
                    Example: For <Text className="font-bold text-gray-500">Coffee</Text>, list your favorite local cafe like "Blue Bottle" or "Joe's Coffee".
                </Text>
            </Text>
            
            <InterestSelector 
                interests={interestDetails}
                onChange={setInterestDetails}
            />

            <Button title={saving ? 'Saving...' : 'Save Interests'} onPress={saveInterests} disabled={saving} color="#000" />
            <View className="h-20" />
          </View>
        </ScrollView>
      </View>
    </KeyboardDismissWrapper>
  );
}
