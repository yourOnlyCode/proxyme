import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import Avatar from '@/components/profile/Avatar';
import { ForumReply } from '@/lib/types';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ReplyItemProps {
    reply: ForumReply;
    user: any;
    onReply: (replyId: string) => void;
    onEdit: (reply: ForumReply) => void;
    onDelete: (replyId: string) => void;
    onToggleReaction: (replyId: string, type: 'support' | 'oppose') => void;
    onViewProfile: (userId: string) => void;
    depth: number;
}

export default function ReplyItem({ 
    reply, 
    user, 
    onReply, 
    onEdit, 
    onDelete,
    onToggleReaction,
    onViewProfile,
    depth 
}: ReplyItemProps) {
    const scheme = useColorScheme() ?? 'light';
    const isDark = scheme === 'dark';
    const maxDepth = 5;
    const indent = Math.min(depth, maxDepth) * 16;
    
    return (
        <View
          className="mb-4 pb-4 border-b border-gray-100"
          style={{ marginLeft: indent, borderBottomColor: isDark ? 'rgba(148,163,184,0.12)' : undefined }}
        >
            <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center flex-1">
                    <TouchableOpacity 
                        onPress={() => onViewProfile(reply.created_by)}
                        className="w-8 h-8 rounded-full overflow-hidden mr-2"
                    >
                        <Avatar url={reply.creator.avatar_url} size={32} onUpload={() => {}} editable={false} />
                    </TouchableOpacity>
                    <View className="flex-1">
                        <TouchableOpacity onPress={() => onViewProfile(reply.created_by)} className="flex-row items-center">
                            <Text className="text-sm font-semibold text-ink" style={{ color: isDark ? '#E5E7EB' : undefined }}>
                                {reply.creator.full_name || reply.creator.username}
                            </Text>
                            {/* Verification is not a social badge (no checkmark here). */}
                        </TouchableOpacity>
                        <Text className="text-xs text-gray-500" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
                            {new Date(reply.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                            })}
                            {reply.is_edited && (
                                <Text className="text-gray-400 italic"> • edited</Text>
                            )}
                        </Text>
                    </View>
                </View>
                {reply.created_by === user?.id && (
                    <View className="flex-row gap-2">
                        <TouchableOpacity 
                            onPress={() => onEdit(reply)}
                            className="px-2 py-1 bg-gray-100 rounded"
                            style={{ backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : undefined }}
                        >
                            <Text className="text-xs text-gray-600">Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={() => onDelete(reply.id)}
                            className="px-2 py-1 bg-red-100 rounded"
                        >
                            <IconSymbol name="trash.fill" size={12} color="#EF4444" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
            <Text className="text-ink leading-6 mb-2" style={{ color: isDark ? 'rgba(226,232,240,0.92)' : undefined }}>{reply.content}</Text>
            
            {/* Support/Oppose and Reply Buttons */}
            <View className="flex-row items-center gap-4 mt-2">
                <TouchableOpacity 
                    onPress={() => onToggleReaction(reply.id, 'support')}
                    className={`flex-row items-center px-2 py-1 rounded-full ${
                        reply.user_reaction === 'support' ? 'bg-green-100' : 'bg-gray-100'
                    }`}
                >
                    <IconSymbol name="hand.thumbsup.fill" size={14} color={reply.user_reaction === 'support' ? '#10B981' : '#6B7280'} />
                    <Text className={`text-xs ml-1 ${reply.user_reaction === 'support' ? 'text-green-600 font-semibold' : 'text-gray-600'}`}>
                        {reply.support_count || 0}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => onToggleReaction(reply.id, 'oppose')}
                    className={`flex-row items-center px-2 py-1 rounded-full ${
                        reply.user_reaction === 'oppose' ? 'bg-red-100' : 'bg-gray-100'
                    }`}
                >
                    <IconSymbol name="hand.thumbsdown.fill" size={14} color={reply.user_reaction === 'oppose' ? '#EF4444' : '#6B7280'} />
                    <Text className={`text-xs ml-1 ${reply.user_reaction === 'oppose' ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                        {reply.oppose_count || 0}
                    </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                    onPress={() => onReply(reply.id)}
                    className="flex-row items-center px-2 py-1 bg-gray-100 rounded-full"
                >
                    <IconSymbol name="arrowshape.turn.up.left.fill" size={14} color="#6B7280" />
                    <Text className="text-xs text-gray-600 ml-1">Reply</Text>
                </TouchableOpacity>
            </View>

            {/* Nested Replies */}
            {reply.replies && reply.replies.length > 0 && (
                <View className="mt-4 border-l-2 border-gray-100">
                    {reply.replies.map(nestedReply => (
                        <ReplyItem 
                            key={nestedReply.id}
                            reply={nestedReply}
                            user={user}
                            onReply={onReply}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onToggleReaction={onToggleReaction}
                            onViewProfile={onViewProfile}
                            depth={depth + 1}
                        />
                    ))}
                </View>
            )}
        </View>
    );
}
