import React from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Keyboard, ActivityIndicator, Alert } from 'react-native';
import { ClubDetail } from '@/lib/types';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ClubSettingsTabProps {
    club: ClubDetail | null;
    settingsName: string;
    onSetSettingsName: (name: string) => void;
    settingsDescription: string;
    onSetSettingsDescription: (desc: string) => void;
    settingsMaxMembers: string;
    onSetSettingsMaxMembers: (count: string) => void;
    onUpdateClubSettings: () => void;
    savingSettings: boolean;
    role: string | null;
    currentMemberCount: number;
    onDeleteClub: () => void;
}

export default function ClubSettingsTab({
    club,
    settingsName,
    onSetSettingsName,
    settingsDescription,
    onSetSettingsDescription,
    settingsMaxMembers,
    onSetSettingsMaxMembers,
    onUpdateClubSettings,
    savingSettings,
    role,
    currentMemberCount,
    onDeleteClub
}: ClubSettingsTabProps) {
    const scheme = useColorScheme() ?? 'light';
    const isDark = scheme === 'dark';
    return (
        <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }} style={{ backgroundColor: isDark ? '#0B1220' : undefined }}>
            <View className="bg-white rounded-2xl p-6 mb-4 shadow-sm" style={{ backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderWidth: isDark ? 1 : 0, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}>
                <Text className="text-2xl font-bold text-ink mb-6" style={{ color: isDark ? '#E5E7EB' : undefined }}>Club Settings</Text>
                
                {/* Club Name */}
                <View className="mb-4">
                    <Text className="font-bold text-gray-500 mb-2">Club Name *</Text>
                    <TextInput
                        value={settingsName}
                        onChangeText={onSetSettingsName}
                        placeholder="Enter club name"
                        className="bg-gray-100 p-4 rounded-xl text-lg"
                        style={{ color: isDark ? '#E5E7EB' : undefined, backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : undefined }}
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => Keyboard.dismiss()}
                    />
                </View>

                {/* Description */}
                <View className="mb-4">
                    <Text className="font-bold text-gray-500 mb-2">Description</Text>
                    <TextInput
                        value={settingsDescription}
                        onChangeText={onSetSettingsDescription}
                        placeholder="What's this club about?"
                        multiline
                        numberOfLines={4}
                        className="bg-gray-100 p-4 rounded-xl text-base h-32"
                        style={{ textAlignVertical: 'top', color: isDark ? '#E5E7EB' : undefined, backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : undefined }}
                        returnKeyType="done"
                        blurOnSubmit={true}
                        onSubmitEditing={() => Keyboard.dismiss()}
                    />
                </View>

                {/* Max Member Count */}
                <View className="mb-6">
                    <Text className="font-bold text-gray-500 mb-2">Maximum Members</Text>
                    <TextInput
                        value={settingsMaxMembers}
                        onChangeText={onSetSettingsMaxMembers}
                        placeholder="Leave empty for unlimited"
                        keyboardType="numeric"
                        className="bg-gray-100 p-4 rounded-xl text-lg"
                        style={{ color: isDark ? '#E5E7EB' : undefined, backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : undefined }}
                        returnKeyType="done"
                        blurOnSubmit={true}
                        onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    <Text className="text-xs text-gray-400 mt-2">
                        Current members: {currentMemberCount}
                        {club?.max_member_count && ` / ${club.max_member_count}`}
                    </Text>
                    <Text className="text-xs text-gray-400 mt-1">
                        Leave empty to allow unlimited members
                    </Text>
                </View>

                {/* Save Button */}
                <TouchableOpacity
                    onPress={onUpdateClubSettings}
                    disabled={savingSettings || !settingsName.trim()}
                    className={`py-4 rounded-xl items-center ${savingSettings || !settingsName.trim() ? 'bg-gray-300' : 'bg-black'}`}
                >
                    {savingSettings ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-bold text-lg">Save Changes</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Danger Zone */}
            {role === 'owner' && (
                <View className="bg-white rounded-2xl p-6 shadow-sm" style={{ backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderWidth: isDark ? 1 : 0, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}>
                    <Text className="text-xl font-bold text-red-600 mb-4">Danger Zone</Text>
                    <TouchableOpacity
                        onPress={onDeleteClub}
                        className="bg-red-50 border border-red-200 py-4 rounded-xl items-center"
                    >
                        <Text className="text-red-600 font-bold">Delete Club</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
    );
}
