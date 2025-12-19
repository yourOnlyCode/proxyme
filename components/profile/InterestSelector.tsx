import { LayoutAnimation, Text, TextInput, TouchableOpacity, View, Alert } from 'react-native';
import React from 'react';

const AVAILABLE_INTERESTS = [
  'Coffee', 'Hiking', 'Tech', 'Music', 'Art', 
  'Travel', 'Foodie', 'Fitness', 'Gaming', 'Reading',
  'Photography', 'Nightlife', 'Business', 'Cinema'
];

type DetailedInterests = Record<string, string[]>;

type Props = {
    interests: DetailedInterests;
    onChange: (interests: DetailedInterests) => void;
};

export function InterestSelector({ interests, onChange }: Props) {
    const toggleCategory = (category: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const next = { ...interests };
        if (next[category]) {
            delete next[category];
        } else {
            if (Object.keys(next).length >= 3) {
                Alert.alert('Limit Reached', 'You can select up to 3 categories.');
                return;
            }
            next[category] = ['', '', ''];
        }
        onChange(next);
    };

    const updateSubInterest = (category: string, index: number, text: string) => {
        const next = { ...interests };
        if (!next[category]) return;
        
        const newItems = [...next[category]];
        newItems[index] = text;
        next[category] = newItems;
        onChange(next);
    };

    return (
        <View className="mb-8">
            {AVAILABLE_INTERESTS.map((category) => {
            const isSelected = !!interests[category];
            
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
                                    value={interests[category][idx] || ''}
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
    );
}

