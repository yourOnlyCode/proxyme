import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import EventCard from './EventCard';
import { ClubEvent } from '@/lib/types';

interface ClubEventsTabProps {
    events: ClubEvent[];
    isAdmin: boolean;
    user: any;
    onSetEventModalVisible: (visible: boolean) => void;
    onOpenEditEvent: (event: ClubEvent) => void;
    onDeleteEvent: (eventId: string) => void;
    onUpdateRSVP: (eventId: string, status: 'going' | 'maybe' | 'cant') => void;
    onAddToCalendar: (event: ClubEvent) => void;
    onViewUserProfile: (userId: string) => void;
}

export default function ClubEventsTab({
    events,
    isAdmin,
    user,
    onSetEventModalVisible,
    onOpenEditEvent,
    onDeleteEvent,
    onUpdateRSVP,
    onAddToCalendar,
    onViewUserProfile
}: ClubEventsTabProps) {
    return (
        <View className="flex-1">
            <View className="p-4 flex-row justify-between items-center border-b border-gray-100 bg-white">
                <Text className="font-bold text-gray-500">{events.length} Events</Text>
                {isAdmin && (
                    <TouchableOpacity 
                        onPress={() => onSetEventModalVisible(true)}
                        className="bg-black px-4 py-2 rounded-full"
                    >
                        <Text className="text-white text-xs font-bold">Create Event</Text>
                    </TouchableOpacity>
                )}
            </View>
            <FlatList
                data={events}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <EventCard
                        event={item}
                        isAdmin={isAdmin}
                        currentUserId={user?.id}
                        onEdit={onOpenEditEvent}
                        onDelete={onDeleteEvent}
                        onRSVP={onUpdateRSVP}
                        onAddToCalendar={onAddToCalendar}
                        onViewProfile={onViewUserProfile}
                    />
                )}
                ListEmptyComponent={
                    <View className="items-center mt-20 opacity-50">
                        <IconSymbol name="calendar" size={48} color="#CBD5E0" />
                        <Text className="text-gray-500 mt-4 font-medium">No events scheduled</Text>
                    </View>
                }
            />
        </View>
    );
}
