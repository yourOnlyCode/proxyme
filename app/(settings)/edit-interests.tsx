import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, LayoutAnimation, Platform, ScrollView, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AVAILABLE_INTERESTS = [
  'Coffee', 'Hiking', 'Tech', 'Music', 'Art', 
  'Travel', 'Foodie', 'Fitness', 'Gaming', 'Reading',
  'Photography', 'Nightlife', 'Business', 'Cinema'
];

type DetailedInterests = Record<string, string[]>;

export default function EditInterestsScreen() {
  const { user } = useAuth();
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

  const toggleCategory = (category: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setInterestDetails(prev => {
      const next = { ...prev };
      if (next[category]) {
        delete next[category]; // Remove
      } else {
        if (Object.keys(next).length >= 3) {
            Alert.alert('Limit Reached', 'You can select up to 3 categories.');
            return prev;
        }
        next[category] = ['', '', '']; // Initialize with 3 empty slots
      }
      return next;
    });
  };

  const updateSubInterest = (category: string, index: number, text: string) => {
      setInterestDetails(prev => {
          const next = { ...prev };
          if (!next[category]) return prev;
          
          const newItems = [...next[category]];
          newItems[index] = text;
          next[category] = newItems;
          return next;
      });
  };

  if (loading) return <View className="flex-1 justify-center"><ActivityIndicator /></View>;

  return (
    <ScrollView className="flex-1 bg-white p-4">
      <View className="mb-6">
        <Text className="text-2xl font-bold mb-2">Detailed Interests</Text>
        <Text className="text-gray-500 mb-6 text-base leading-5">
            Select up to <Text className="font-bold text-black">3 categories</Text>. 
            For each, list your top 3 specific favorites.
            {'\n\n'}
            <Text className="italic text-gray-400">
                Example: For <Text className="font-bold text-gray-500">Coffee</Text>, list your favorite local cafe like "Blue Bottle" or "Joe's Coffee".
            </Text>
        </Text>
        
        <View className="mb-8">
          {AVAILABLE_INTERESTS.map((category) => {
            const isSelected = !!interestDetails[category];
            
            return (
              <View key={category} className="mb-3">
                  <TouchableOpacity
                    onPress={() => toggleCategory(category)}
                    className={`px-4 py-3 rounded-lg border flex-row justify-between items-center ${
                      isSelected ? 'bg-black border-black' : 'bg-white border-gray-300'
                    }`}
                  >
                    <Text className={`font-bold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                      {category}
                    </Text>
                    {isSelected && <Text className="text-white text-xs">Selected</Text>}
                  </TouchableOpacity>

                  {/* Expanded Sub-Inputs */}
                  {isSelected && (
                      <View className="bg-gray-50 p-3 rounded-b-lg border-x border-b border-gray-200 -mt-1 pt-4">
                          {[0, 1, 2].map((idx) => (
                              <TextInput
                                  key={idx}
                                  placeholder={`Favorite ${category} item #${idx + 1}`}
                                  placeholderTextColor="#6b7280" 
                                  value={interestDetails[category][idx] || ''}
                                  onChangeText={(text) => updateSubInterest(category, idx, text)}
                                  className="bg-white border border-gray-300 rounded p-3 mb-2 text-base text-black"
                              />
                          ))}
                      </View>
                  )}
              </View>
            );
          })}
        </View>

        <Button title={saving ? 'Saving...' : 'Save Interests'} onPress={saveInterests} disabled={saving} color="#000" />
        <View className="h-20" />
      </View>
    </ScrollView>
  );
}
