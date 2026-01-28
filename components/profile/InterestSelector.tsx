import { LayoutAnimation, Text, TextInput, TouchableOpacity, View, Alert } from 'react-native';
import React, { useState } from 'react';
import { AVAILABLE_INTERESTS } from '../../constants/interests';
import { IconSymbol } from '../ui/icon-symbol';

type DetailedInterests = Record<string, string[]>;

type Props = {
    interests: DetailedInterests;
    onChange: (interests: DetailedInterests) => void;
};

const INITIAL_SHOW_COUNT = 25;

export function InterestSelector({ interests, onChange }: Props) {
    const [showAll, setShowAll] = useState(false);
    const [addingCustom, setAddingCustom] = useState(false);
    const [customCategoryName, setCustomCategoryName] = useState('');
    const [draftByCategory, setDraftByCategory] = useState<Record<string, string>>({});
    
    const displayedInterests = showAll 
        ? AVAILABLE_INTERESTS 
        : AVAILABLE_INTERESTS.slice(0, INITIAL_SHOW_COUNT);

    const toggleCategory = (category: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const next = { ...interests };
        if (next[category]) {
            delete next[category];
            setDraftByCategory((prev) => {
              const copy = { ...prev };
              delete copy[category];
              return copy;
            });
        } else {
            if (Object.keys(next).length >= 3) {
                Alert.alert('Limit Reached', 'You can select up to 3 categories.');
                return;
            }
            next[category] = [];
        }
        onChange(next);
    };

    const handleCustomCategory = () => {
        if (Object.keys(interests).length >= 3) {
            Alert.alert('Limit Reached', 'You can select up to 3 categories.');
            return;
        }
        setAddingCustom(true);
    };

    const confirmCustomCategory = () => {
        const trimmed = customCategoryName.trim();
        if (!trimmed) {
            Alert.alert('Required', 'Please enter a category name.');
            return;
        }
        if (interests[trimmed]) {
            Alert.alert('Already Added', 'This category is already in your interests.');
            return;
        }
        
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const next = { ...interests };
        next[trimmed] = [];
        onChange(next);
        setCustomCategoryName('');
        setAddingCustom(false);
    };

    const cancelCustomCategory = () => {
        setCustomCategoryName('');
        setAddingCustom(false);
    };

    const addDetail = (category: string) => {
        const raw = (draftByCategory[category] || '').trim();
        if (!raw) return;
        const next = { ...interests };
        const current = Array.isArray(next[category]) ? [...next[category]] : [];
        const normalized = raw.toLowerCase();
        if (current.some((v) => String(v).toLowerCase().trim() === normalized)) {
            Alert.alert('Already added', 'That detail is already in your list.');
            return;
        }
        if (current.length >= 10) {
            Alert.alert('Limit reached', 'Keep it to 10 specifics per category for now.');
            return;
        }
        current.push(raw);
        next[category] = current;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onChange(next);
        setDraftByCategory((prev) => ({ ...prev, [category]: '' }));
    };

    const removeDetail = (category: string, value: string) => {
        const next = { ...interests };
        if (!next[category]) return;
        const current = Array.isArray(next[category]) ? next[category] : [];
        next[category] = current.filter((v) => String(v) !== String(value));
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onChange(next);
    };

    const selectedCategories = Object.keys(interests);

    return (
        <View className="mb-6">
            {/* Selected Categories with Inputs */}
            {selectedCategories.length > 0 && (
                <View className="mb-6">
                    {selectedCategories.map((category) => (
                        <View key={category} className="mb-4 bg-gray-50 rounded-2xl p-4 border border-gray-200">
                            <View className="flex-row justify-between items-center mb-3">
                                <Text className="font-bold text-lg text-ink">{category}</Text>
                                <TouchableOpacity
                                    onPress={() => toggleCategory(category)}
                                    className="bg-red-50 rounded-full p-1.5"
                                >
                                    <IconSymbol name="xmark" size={14} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                            <View className="flex-row flex-wrap">
                              {(interests[category] || [])
                                .map((v) => String(v).trim())
                                .filter(Boolean)
                                .map((v) => (
                                  <View
                                    key={v}
                                    className="flex-row items-center bg-white border border-gray-200 rounded-full px-3 py-2 mr-2 mb-2"
                                  >
                                    <Text className="text-ink font-semibold text-xs">{v}</Text>
                                    <TouchableOpacity onPress={() => removeDetail(category, v)} className="ml-2">
                                      <IconSymbol name="xmark.circle.fill" size={16} color="#9CA3AF" />
                                    </TouchableOpacity>
                                  </View>
                                ))}
                            </View>

                            <View className="flex-row items-center mt-1">
                              <TextInput
                                placeholder={`Add a ${category} favorite…`}
                                placeholderTextColor="#9CA3AF"
                                value={draftByCategory[category] || ''}
                                onChangeText={(t) => setDraftByCategory((prev) => ({ ...prev, [category]: t }))}
                                className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-ink"
                                returnKeyType="done"
                                blurOnSubmit={false}
                                onSubmitEditing={() => addDetail(category)}
                              />
                              <TouchableOpacity
                                onPress={() => addDetail(category)}
                                className="ml-2 bg-black rounded-xl px-4 py-3 items-center justify-center"
                                activeOpacity={0.85}
                              >
                                <Text className="text-white font-bold">Add</Text>
                              </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* Category Selection Capsules */}
            {selectedCategories.length < 3 && (
                <>
                    <Text className="text-gray-500 font-bold mb-3 ml-1">
                        {selectedCategories.length === 0 
                            ? 'Select up to 3 categories' 
                            : `Select ${3 - selectedCategories.length} more categor${3 - selectedCategories.length === 1 ? 'y' : 'ies'}`}
                    </Text>

                    {/* Custom Category Input */}
                    {addingCustom && (
                        <View className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 mb-4">
                            <Text className="text-ink font-bold mb-2">Create Custom Category</Text>
                            <TextInput
                                value={customCategoryName}
                                onChangeText={setCustomCategoryName}
                                placeholder="e.g. Sailing, Knitting, Poker..."
                                placeholderTextColor="#9CA3AF"
                                className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-3 text-base text-ink"
                                returnKeyType="done"
                                autoFocus
                                maxLength={30}
                            />
                            <View className="flex-row gap-2">
                                <TouchableOpacity
                                    onPress={confirmCustomCategory}
                                    className="flex-1 bg-black rounded-xl py-3 items-center"
                                >
                                    <Text className="text-white font-bold">Add Category</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={cancelCustomCategory}
                                    className="px-4 bg-gray-200 rounded-xl py-3 items-center"
                                >
                                    <Text className="text-gray-700 font-bold">Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <View className="flex-row flex-wrap gap-2 mb-4">
                        {displayedInterests.map((category) => {
                            const isSelected = !!interests[category];
                            if (isSelected) return null; // Don't show selected ones in the capsule area
                            
                            return (
                                <TouchableOpacity
                                    key={category}
                                    onPress={() => toggleCategory(category)}
                                    className="px-4 py-2.5 rounded-full border-2 border-gray-200 bg-white"
                                    activeOpacity={0.7}
                                >
                                    <Text className="text-gray-700 font-medium text-sm">
                                        {category}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                        {/* Custom Category Button */}
                        {!addingCustom && (
                            <TouchableOpacity
                                onPress={handleCustomCategory}
                                className="px-4 py-2.5 rounded-full border-2 border-dashed border-blue-300 bg-blue-50"
                                activeOpacity={0.7}
                            >
                                <Text className="text-blue-600 font-bold text-sm">
                                    + Custom
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Show More/Less Button */}
                    {AVAILABLE_INTERESTS.length > INITIAL_SHOW_COUNT && (
                        <TouchableOpacity
                            onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setShowAll(!showAll);
                            }}
                            className="flex-row items-center justify-center py-3 px-4 bg-gray-100 rounded-xl"
                        >
                            <Text className="text-gray-600 font-bold mr-2">
                                {showAll ? 'Show Less' : `Show ${AVAILABLE_INTERESTS.length - INITIAL_SHOW_COUNT} More`}
                            </Text>
                            <IconSymbol 
                                name={showAll ? "chevron.up" : "chevron.down"} 
                                size={16} 
                                color="#6B7280" 
                            />
                        </TouchableOpacity>
                    )}
                </>
            )}
        </View>
    );
}

