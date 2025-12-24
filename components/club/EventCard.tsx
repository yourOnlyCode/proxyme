import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubEvent } from '@/lib/types';

interface EventCardProps {
    event: ClubEvent;
    isAdmin: boolean;
    currentUserId: string | undefined;
    onEdit: (event: ClubEvent) => void;
    onDelete: (eventId: string) => void;
    onRSVP: (eventId: string, status: 'going' | 'maybe' | 'cant') => void;
    onAddToCalendar: (event: ClubEvent) => void;
    onViewProfile: (userId: string) => void;
}

export default function EventCard({
    event,
    isAdmin,
    currentUserId,
    onEdit,
    onDelete,
    onRSVP,
    onAddToCalendar,
    onViewProfile
}: EventCardProps) {
    const [menuVisible, setMenuVisible] = useState(false);
    const eventDate = new Date(event.event_date);
    const isPast = eventDate < new Date();

    return (
        <View className={`p-4 bg-white border-b border-gray-50 ${isPast ? 'opacity-60' : ''}`}>
            <View className="flex-row justify-between items-start mb-2">
                <Text className="font-bold text-lg text-ink flex-1">{event.title}</Text>
                <View className="flex-row items-center gap-2">
                    {isPast && (
                        <View className="bg-gray-200 px-2 py-1 rounded">
                            <Text className="text-xs text-gray-600 font-bold">Past</Text>
                        </View>
                    )}
                    {isAdmin && (
                        <View className="relative">
                            <TouchableOpacity 
                                onPress={() => setMenuVisible(!menuVisible)}
                                className="p-1"
                            >
                                <IconSymbol name="ellipsis" size={20} color="#6B7280" />
                            </TouchableOpacity>
                            {menuVisible && (
                                <View className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-gray-200 z-50" style={{ width: 150 }}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setMenuVisible(false);
                                            onEdit(event);
                                        }}
                                        className="flex-row items-center py-3 px-4 border-b border-gray-100"
                                    >
                                        <IconSymbol name="pencil" size={18} color="#1A1A1A" />
                                        <Text className="text-ink font-medium ml-3">Edit</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setMenuVisible(false);
                                            onDelete(event.id);
                                        }}
                                        className="flex-row items-center py-3 px-4"
                                    >
                                        <IconSymbol name="trash.fill" size={18} color="#DC2626" />
                                        <Text className="text-red-600 font-medium ml-3">Delete</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </View>
            {event.description && (
                <Text className="text-gray-600 text-sm mb-3">{event.description}</Text>
            )}
            <View className="flex-row items-center mb-2">
                <IconSymbol name="calendar" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">
                    {eventDate.toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                    })}
                </Text>
            </View>
            {event.location && (
                <View className="flex-row items-center mb-2">
                    <IconSymbol name="location.fill" size={16} color="#6B7280" />
                    <Text className="text-gray-600 text-sm ml-2">{event.location}</Text>
                </View>
            )}
            {/* RSVP Section */}
            {!isPast && (
                <View className="mt-4 pt-3 border-t border-gray-100">
                    <View className="flex-row gap-2 mb-2">
                        <TouchableOpacity
                            onPress={() => onRSVP(event.id, 'going')}
                            className={`flex-1 flex-row items-center justify-center py-2 px-3 rounded-lg ${
                                event.user_rsvp === 'going' ? 'bg-green-100 border-2 border-green-500' : 'bg-gray-100'
                            }`}
                        >
                            <IconSymbol name="checkmark.circle.fill" size={16} color={event.user_rsvp === 'going' ? '#10B981' : '#6B7280'} />
                            <Text className={`text-xs font-semibold ml-1 ${event.user_rsvp === 'going' ? 'text-green-700' : 'text-gray-600'}`}>
                                Going ({event.rsvp_counts?.going || 0})
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => onRSVP(event.id, 'maybe')}
                            className={`flex-1 flex-row items-center justify-center py-2 px-3 rounded-lg ${
                                event.user_rsvp === 'maybe' ? 'bg-yellow-100 border-2 border-yellow-500' : 'bg-gray-100'
                            }`}
                        >
                            <IconSymbol name="questionmark.circle.fill" size={16} color={event.user_rsvp === 'maybe' ? '#F59E0B' : '#6B7280'} />
                            <Text className={`text-xs font-semibold ml-1 ${event.user_rsvp === 'maybe' ? 'text-yellow-700' : 'text-gray-600'}`}>
                                Maybe ({event.rsvp_counts?.maybe || 0})
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => onRSVP(event.id, 'cant')}
                            className={`flex-1 flex-row items-center justify-center py-2 px-3 rounded-lg ${
                                event.user_rsvp === 'cant' ? 'bg-red-100 border-2 border-red-500' : 'bg-gray-100'
                            }`}
                        >
                            <IconSymbol name="xmark.circle.fill" size={16} color={event.user_rsvp === 'cant' ? '#EF4444' : '#6B7280'} />
                            <Text className={`text-xs font-semibold ml-1 ${event.user_rsvp === 'cant' ? 'text-red-700' : 'text-gray-600'}`}>
                                Can't ({event.rsvp_counts?.cant || 0})
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
            
            <View className="flex-row justify-between items-center mt-3">
                <TouchableOpacity onPress={() => onViewProfile(event.created_by)}>
                    <Text className="text-xs text-gray-400">
                        Created by {event.creator.full_name || event.creator.username}
                    </Text>
                </TouchableOpacity>
                {!isPast && (
                    <TouchableOpacity 
                        onPress={() => onAddToCalendar(event)}
                        className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-full"
                    >
                        <IconSymbol name="calendar.badge.plus" size={14} color="#2563EB" />
                        <Text className="text-blue-600 text-xs font-semibold ml-1">Add to Calendar</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}
