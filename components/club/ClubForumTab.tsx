import React from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView, TextInput, Keyboard, ActivityIndicator } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import Avatar from '@/components/profile/Avatar';
import ReplyItem from './ReplyItem';
import { ForumTopic, ForumReply } from '@/lib/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ClubForumTabProps {
    topics: ForumTopic[];
    selectedTopic: ForumTopic | null;
    replies: ForumReply[];
    user: any;
    onViewTopic: (topic: ForumTopic) => void;
    onBackToTopics: () => void;
    onViewUserProfile: (userId: string) => void;
    onToggleReaction: (topicId: string | null, replyId: string | null, type: 'support' | 'oppose') => void;
    onDeleteReply: (replyId: string) => void;
    onCreateReply: (parentReplyId: string | null) => void;
    onSetTopicModalVisible: (visible: boolean) => void;
    onEditTopic: (topic: ForumTopic) => void;
    
    // Reply State
    replyingToReplyId: string | null;
    onSetReplyingToReplyId: (id: string | null) => void;
    newReply: string;
    onSetNewReply: (text: string) => void;
    editReplyContent: string;
    onSetEditReplyContent: (text: string) => void;
    onSetEditingReply: (reply: ForumReply | null) => void;
    replying: boolean;
}

export default function ClubForumTab({
    topics,
    selectedTopic,
    replies,
    user,
    onViewTopic,
    onBackToTopics,
    onViewUserProfile,
    onToggleReaction,
    onDeleteReply,
    onCreateReply,
    onSetTopicModalVisible,
    onEditTopic,
    replyingToReplyId,
    onSetReplyingToReplyId,
    newReply,
    onSetNewReply,
    editReplyContent,
    onSetEditReplyContent,
    onSetEditingReply,
    replying
}: ClubForumTabProps) {
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme() ?? 'light';
    const isDark = scheme === 'dark';
    const cardStyle = { backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined, borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined } as const;
    const textPrimary = { color: isDark ? '#E5E7EB' : undefined } as const;
    const textSecondary = { color: isDark ? 'rgba(226,232,240,0.65)' : undefined } as const;

    if (selectedTopic) {
        // Topic Detail View
        return (
            <>
                <View className="p-4 bg-white border-b border-gray-200 flex-row items-center" style={{ backgroundColor: isDark ? '#0B1220' : undefined, borderBottomColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}>
                    <TouchableOpacity onPress={onBackToTopics} className="mr-4">
                        <IconSymbol name="chevron.left" size={24} color={isDark ? '#E5E7EB' : '#1A1A1A'} />
                    </TouchableOpacity>
                    <Text className="text-lg font-bold text-ink flex-1" numberOfLines={1} style={textPrimary}>{selectedTopic.title}</Text>
                </View>
                <ScrollView 
                    className="flex-1 px-4" 
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 20 }}
                    showsVerticalScrollIndicator={true}
                    keyboardDismissMode="interactive"
                    style={{ backgroundColor: isDark ? '#0B1220' : undefined }}
                >
                    {/* Topic Header */}
                    <View className="py-4 border-b border-gray-200" style={{ borderBottomColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}>
                        <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-row items-center">
                                {selectedTopic.is_pinned && (
                                    <IconSymbol name="pin.fill" size={16} color="#2563EB" style={{ marginRight: 4 }} />
                                )}
                                {selectedTopic.is_locked && (
                                    <IconSymbol name="lock.fill" size={16} color="#EF4444" style={{ marginRight: 4 }} />
                                )}
                            </View>
                            {selectedTopic.created_by === user?.id && (
                                <TouchableOpacity 
                                    onPress={() => onEditTopic(selectedTopic)}
                                    className="px-3 py-1 bg-gray-100 rounded-full"
                                    style={{ backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : undefined }}
                                >
                                    <Text className="text-xs text-gray-600" style={textSecondary}>Edit</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <View className="flex-row items-center mb-3">
                            <TouchableOpacity 
                                onPress={() => onViewUserProfile(selectedTopic.created_by)}
                                className="mr-2"
                            >
                                <Avatar url={selectedTopic.creator.avatar_url} size={32} onUpload={() => {}} editable={false} />
                            </TouchableOpacity>
                            <View className="flex-1">
                                <TouchableOpacity onPress={() => onViewUserProfile(selectedTopic.created_by)}>
                                    <Text className="text-sm font-semibold text-ink" style={textPrimary}>
                                        {selectedTopic.creator.full_name || selectedTopic.creator.username}
                                    </Text>
                                </TouchableOpacity>
                                <Text className="text-xs text-gray-500" style={textSecondary}>
                                    {new Date(selectedTopic.created_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit'
                                    })}
                                    {selectedTopic.is_edited && (
                                        <Text className="text-gray-400 italic"> • edited</Text>
                                    )}
                                </Text>
                            </View>
                        </View>
                        <Text className="text-ink leading-6 mb-3" style={{ color: isDark ? 'rgba(226,232,240,0.92)' : undefined }}>{selectedTopic.content}</Text>
                        
                        {/* Support/Oppose Buttons */}
                        <View className="flex-row items-center gap-4 mt-2">
                            <TouchableOpacity 
                                onPress={() => onToggleReaction(selectedTopic.id, null, 'support')}
                                className={`flex-row items-center px-3 py-1.5 rounded-full ${
                                    selectedTopic.user_reaction === 'support' ? 'bg-green-100' : 'bg-gray-100'
                                }`}
                            >
                                <IconSymbol name="hand.thumbsup.fill" size={16} color={selectedTopic.user_reaction === 'support' ? '#10B981' : '#6B7280'} />
                                <Text className={`text-xs ml-1 ${selectedTopic.user_reaction === 'support' ? 'text-green-600 font-semibold' : 'text-gray-600'}`}>
                                    {selectedTopic.support_count || 0}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={() => onToggleReaction(selectedTopic.id, null, 'oppose')}
                                className={`flex-row items-center px-3 py-1.5 rounded-full ${
                                    selectedTopic.user_reaction === 'oppose' ? 'bg-red-100' : 'bg-gray-100'
                                }`}
                            >
                                <IconSymbol name="hand.thumbsdown.fill" size={16} color={selectedTopic.user_reaction === 'oppose' ? '#EF4444' : '#6B7280'} />
                                <Text className={`text-xs ml-1 ${selectedTopic.user_reaction === 'oppose' ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                    {selectedTopic.oppose_count || 0}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Replies */}
                    <View className="py-4">
                        <Text className="font-bold text-lg text-ink mb-3" style={textPrimary}>
                            {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
                        </Text>
                        {replies.map((reply) => (
                            <ReplyItem
                                key={reply.id}
                                reply={reply}
                                user={user}
                                onReply={(replyId) => {
                                    onSetReplyingToReplyId(replyId);
                                    onSetEditReplyContent('');
                                }}
                                onEdit={(reply) => {
                                    onSetEditingReply(reply);
                                    onSetEditReplyContent(reply.content);
                                }}
                                onDelete={onDeleteReply}
                                onToggleReaction={(replyId, type) => onToggleReaction(null, replyId, type)}
                                onViewProfile={onViewUserProfile}
                                depth={0}
                            />
                        ))}
                    </View>
                </ScrollView>
                {!selectedTopic.is_locked && (
                    <View className="bg-white border-t border-gray-100" style={{ paddingBottom: insets.bottom, backgroundColor: isDark ? '#0B1220' : undefined, borderTopColor: isDark ? 'rgba(148,163,184,0.18)' : undefined }}>
                        {replyingToReplyId && (
                            <View className="px-4 pt-3 pb-2 bg-blue-50 flex-row items-center justify-between">
                                <Text className="text-xs text-blue-700 font-medium">Replying to a comment</Text>
                                <TouchableOpacity 
                                    onPress={() => {
                                        onSetReplyingToReplyId(null);
                                        onSetEditReplyContent('');
                                        Keyboard.dismiss();
                                    }}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <IconSymbol name="xmark" size={16} color="#2563EB" />
                                </TouchableOpacity>
                            </View>
                        )}
                        <View className="px-4 py-3">
                            <View className="flex-row items-end bg-gray-50 rounded-2xl px-4 py-3 border border-gray-200" style={cardStyle}>
                                <TextInput
                                    value={replyingToReplyId ? editReplyContent : newReply}
                                    onChangeText={replyingToReplyId ? onSetEditReplyContent : onSetNewReply}
                                    placeholder="Write a reply..."
                                    placeholderTextColor="#9CA3AF"
                                    className="flex-1 text-ink"
                                    style={{ 
                                        maxHeight: 120, 
                                        minHeight: 40,
                                        fontSize: 16,
                                        lineHeight: 22,
                                        color: isDark ? '#E5E7EB' : '#1A1A1A'
                                    }}
                                    multiline
                                    returnKeyType="send"
                                    blurOnSubmit={false}
                                    onSubmitEditing={() => {
                                        const content = replyingToReplyId ? editReplyContent : newReply;
                                        if (content.trim() && !replying) {
                                            onCreateReply(replyingToReplyId || null);
                                        }
                                    }}
                                    textAlignVertical="top"
                                    editable={!replying}
                                />
                                <TouchableOpacity 
                                    onPress={() => {
                                        if (!replying) {
                                            onCreateReply(replyingToReplyId || null);
                                        }
                                    }} 
                                    disabled={(replyingToReplyId ? !editReplyContent.trim() : !newReply.trim()) || replying}
                                    className="ml-3 p-2"
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    {replying ? (
                                        <ActivityIndicator size="small" color="#2563EB" />
                                    ) : (
                                        <IconSymbol 
                                            name="paperplane.fill" 
                                            size={22} 
                                            color={(replyingToReplyId ? editReplyContent.trim() : newReply.trim()) ? '#2563EB' : '#9CA3AF'} 
                                        />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </>
        );
    }

    // Topics List View
    return (
        <>
            <View className="p-4 flex-row justify-between items-center border-b border-gray-100 bg-white">
                <Text className="font-bold text-gray-500">{topics.length} {topics.length === 1 ? 'Topic' : 'Topics'}</Text>
                <TouchableOpacity 
                    onPress={() => onSetTopicModalVisible(true)}
                    className="bg-black px-4 py-2 rounded-full"
                >
                    <Text className="text-white text-xs font-bold">New Topic</Text>
                </TouchableOpacity>
            </View>
            <FlatList
                data={topics}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <TouchableOpacity 
                        onPress={() => onViewTopic(item)}
                        className="p-4 bg-white border-b border-gray-50 active:bg-gray-50"
                    >
                        <View className="flex-row items-start mb-2">
                            {item.is_pinned && (
                                <IconSymbol name="pin.fill" size={14} color="#2563EB" style={{ marginRight: 4, marginTop: 2 }} />
                            )}
                            {item.is_locked && (
                                <IconSymbol name="lock.fill" size={14} color="#EF4444" style={{ marginRight: 4, marginTop: 2 }} />
                            )}
                            <Text className="font-bold text-ink flex-1" numberOfLines={2}>{item.title}</Text>
                        </View>
                        <View className="flex-row items-center justify-between mt-2">
                            <TouchableOpacity 
                                onPress={() => onViewUserProfile(item.created_by)}
                                className="flex-row items-center"
                            >
                                <View className="mr-2">
                                    <Avatar url={item.creator.avatar_url} size={24} onUpload={() => {}} editable={false} />
                                </View>
                                <Text className="text-xs text-gray-500">
                                    {item.creator.full_name || item.creator.username}
                                </Text>
                            </TouchableOpacity>
                            <View className="flex-row items-center">
                                <IconSymbol name="bubble.left.and.bubble.right" size={14} color="#6B7280" />
                                <Text className="text-xs text-gray-500 ml-1">{item.reply_count}</Text>
                                {item.last_reply_at && (
                                    <Text className="text-xs text-gray-400 ml-3">
                                        {new Date(item.last_reply_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric'
                                        })}
                                    </Text>
                                )}
                            </View>
                        </View>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View className="p-8 items-center">
                        <Text className="text-gray-400 text-center">No topics yet. Start a discussion!</Text>
                    </View>
                }
            />
        </>
    );
}
