import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import Avatar from '@/components/profile/Avatar';
import { ClubMember } from '@/lib/types';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ClubMembersTabProps {
    members: ClubMember[];
    isAdmin: boolean;
    onSetInviteModalVisible: (visible: boolean) => void;
    onViewUserProfile: (userId: string) => void;
}

export default function ClubMembersTab({
    members,
    isAdmin,
    onSetInviteModalVisible,
    onViewUserProfile
}: ClubMembersTabProps) {
    const scheme = useColorScheme() ?? 'light';
    const isDark = scheme === 'dark';
    return (
        <View className="flex-1">
            <View
              className="p-4 flex-row justify-between items-center border-b border-gray-100 bg-white"
              style={{
                backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
                borderBottomColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
              }}
            >
                <Text className="font-bold text-gray-500" style={{ color: isDark ? '#E5E7EB' : undefined }}>{members.length} Members</Text>
                {isAdmin && (
                    <TouchableOpacity 
                        onPress={() => onSetInviteModalVisible(true)}
                        className="bg-black px-4 py-2 rounded-full"
                    >
                        <Text className="text-white text-xs font-bold">Invite Member</Text>
                    </TouchableOpacity>
                )}
            </View>
            <FlatList
                data={members}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <View
                      className="flex-row items-center p-4 bg-white border-b border-gray-50"
                      style={{
                        backgroundColor: isDark ? 'rgba(2,6,23,0.40)' : undefined,
                        borderBottomColor: isDark ? 'rgba(148,163,184,0.12)' : undefined,
                      }}
                    >
                        <View className="mr-3">
                            <Avatar url={item.profile.avatar_url} size={40} onUpload={() => {}} editable={false} />
                        </View>
                        <View className="flex-1">
                            <Text className="font-bold text-ink" style={{ color: isDark ? '#E5E7EB' : undefined }}>{item.profile.full_name || item.profile.username}</Text>
                            <Text className="text-gray-500 text-xs" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>@{item.profile.username}</Text>
                        </View>
                        <View className={`px-2 py-1 rounded text-xs ${
                            item.role === 'owner' ? 'bg-purple-100' : item.role === 'admin' ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                            <Text className={`text-[10px] font-bold uppercase ${
                                item.role === 'owner' ? 'text-purple-700' : item.role === 'admin' ? 'text-blue-700' : 'text-gray-500'
                            }`}>{item.role}</Text>
                        </View>
                    </View>
                )}
            />
        </View>
    );
}
