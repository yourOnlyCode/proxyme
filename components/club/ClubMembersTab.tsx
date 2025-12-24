import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import Avatar from '@/components/profile/Avatar';
import { ClubMember } from '@/lib/types';

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
    return (
        <View className="flex-1">
            <View className="p-4 flex-row justify-between items-center border-b border-gray-100 bg-white">
                <Text className="font-bold text-gray-500">{members.length} Members</Text>
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
                    <View className="flex-row items-center p-4 bg-white border-b border-gray-50">
                        <View className="mr-3">
                            <Avatar url={item.profile.avatar_url} size={40} onUpload={() => {}} editable={false} />
                        </View>
                        <View className="flex-1">
                            <Text className="font-bold text-ink">{item.profile.full_name || item.profile.username}</Text>
                            <Text className="text-gray-500 text-xs">@{item.profile.username}</Text>
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
