import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GlassCard } from '@/components/ui/GlassCard';
import { ClubEvent } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface EventCardProps {
    event: ClubEvent;
    isAdmin: boolean;
    currentUserId: string | undefined;
    onEdit: (event: ClubEvent) => void;
    onCancel: (eventId: string) => void;
    onRSVP: (eventId: string, status: 'going' | 'maybe' | 'cant') => void;
    onAddToCalendar: (event: ClubEvent) => void;
    onViewProfile: (userId: string) => void;
}

export default function EventCard({
    event,
    isAdmin,
    currentUserId,
    onEdit,
    onCancel,
    onRSVP,
    onAddToCalendar,
    onViewProfile
}: EventCardProps) {
    const menuButtonRef = useRef<TouchableOpacity | null>(null);
    const [menu, setMenu] = useState<{ visible: boolean; x: number; y: number }>({
        visible: false,
        x: 0,
        y: 0,
    });
    const [attendeesModalVisible, setAttendeesModalVisible] = useState(false);
    const eventDate = new Date(event.event_date);
    const isPast = eventDate < new Date();
    const MENU_WIDTH = 160;
    const attendees = (event.attendees || []).slice(0, 4);
    const attendeesCount = event.attendees_count ?? (event.attendees?.length ?? 0);

    const openMenu = () => {
        // Measure so we can render the menu in a Modal and dismiss on outside tap.
        // This prevents the menu from "floating" over other cards indefinitely.
        menuButtonRef.current?.measureInWindow?.((x, y, width, height) => {
            setMenu({ visible: true, x: x + width, y: y + height });
        });
    };

    const closeMenu = () => setMenu((m) => ({ ...m, visible: false }));

    return (
        <View className={`${isPast ? 'opacity-60' : ''}`}>
            <GlassCard className="mx-4 mt-3" contentClassName="p-4" tint="light" intensity={28}>
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
                                    ref={(r) => (menuButtonRef.current = r)}
                                    onPress={() => (menu.visible ? closeMenu() : openMenu())}
                                    className="p-1"
                                >
                                    <IconSymbol name="ellipsis" size={20} color="#6B7280" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
                {event.description && <Text className="text-gray-600 text-sm mb-3">{event.description}</Text>}
                <View className="flex-row items-center mb-2">
                    <IconSymbol name="calendar" size={16} color="#6B7280" />
                    <Text className="text-gray-600 text-sm ml-2">
                        {eventDate.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                        })}
                    </Text>
                </View>
                {event.location && (
                    <View className="flex-row items-center mb-2">
                        <IconSymbol name="location.fill" size={16} color="#6B7280" />
                        <Text className="text-gray-600 text-sm ml-2">{event.location}</Text>
                    </View>
                )}
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
                    <TouchableOpacity
                        onPress={() => {
                            setAttendeesModalVisible(true);
                        }}
                        className="flex-row items-center"
                        activeOpacity={0.85}
                    >
                        <View className="flex-row items-center mr-2">
                            {attendees.length > 0 ? (
                                attendees.map((a, idx) => (
                                    <View key={a.id} style={{ marginLeft: idx === 0 ? 0 : -8 }}>
                                        <MiniAvatar path={a.avatar_url} />
                                    </View>
                                ))
                            ) : (
                                <MiniAvatar path={event.creator.avatar_url || null} />
                            )}
                        </View>
                        <Text className="text-xs text-gray-500 font-semibold">
                            {attendeesCount > 0 ? `${attendeesCount} attending` : 'Host'}
                        </Text>
                        <IconSymbol name="chevron.right" size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>

                    <View className="flex-row items-center">
                        <TouchableOpacity onPress={() => onViewProfile(event.created_by)} className="flex-row items-center mr-3">
                            <Text className="text-xs text-gray-400">
                                {event.creator.full_name || event.creator.username}
                            </Text>
                            {event.creator.is_verified && (
                                <IconSymbol name="checkmark.seal.fill" size={10} color="#3B82F6" style={{ marginLeft: 4 }} />
                            )}
                        </TouchableOpacity>
                        {!isPast && (
                            <TouchableOpacity onPress={() => onAddToCalendar(event)} className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-full">
                                <IconSymbol name="calendar.badge.plus" size={14} color="#2563EB" />
                                <Text className="text-blue-600 text-xs font-semibold ml-1">Add</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </GlassCard>

            {isAdmin && menu.visible && (
                <Modal transparent animationType="fade" onRequestClose={closeMenu}>
                    <Pressable style={styles.backdrop} onPress={closeMenu}>
                        <Pressable
                            style={[
                                styles.menu,
                                {
                                    top: menu.y + 6,
                                    left: Math.max(12, menu.x - MENU_WIDTH),
                                    width: MENU_WIDTH,
                                },
                            ]}
                            onPress={() => {}}
                        >
                            <TouchableOpacity
                                onPress={() => {
                                    closeMenu();
                                    onEdit(event);
                                }}
                                className="flex-row items-center py-3 px-4 border-b border-gray-100"
                            >
                                <IconSymbol name="pencil" size={18} color="#1A1A1A" />
                                <Text className="text-ink font-medium ml-3">Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    closeMenu();
                                    onCancel(event.id);
                                }}
                                className="flex-row items-center py-3 px-4"
                            >
                                <IconSymbol name="xmark.circle.fill" size={18} color="#DC2626" />
                                <Text className="text-red-600 font-medium ml-3">Cancel</Text>
                            </TouchableOpacity>
                        </Pressable>
                    </Pressable>
                </Modal>
            )}

            <AttendeesModal
                visible={attendeesModalVisible}
                onClose={() => setAttendeesModalVisible(false)}
                title={attendeesCount > 0 ? `Attending (${attendeesCount})` : 'Host'}
                users={event.attendees && event.attendees.length > 0 ? event.attendees : [{
                    id: event.created_by,
                    username: event.creator.username,
                    full_name: event.creator.full_name,
                    avatar_url: event.creator.avatar_url || null,
                    is_verified: event.creator.is_verified,
                }]}
                onViewProfile={(id) => {
                    setAttendeesModalVisible(false);
                    onViewProfile(id);
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    menu: {
        position: 'absolute',
        backgroundColor: 'white',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 18,
        elevation: 18,
        overflow: 'hidden',
    },
});

function MiniAvatar({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!path) {
            setUrl(null);
            return;
        }
        if (path.startsWith('http')) {
            setUrl(path);
            return;
        }
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        setUrl(data.publicUrl);
    }, [path]);

    return (
        <View
            style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: '#E5E7EB',
                borderWidth: 2,
                borderColor: 'white',
                overflow: 'hidden',
            }}
        >
            {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} /> : null}
        </View>
    );
}

function AttendeesModal({
    visible,
    onClose,
    title,
    users,
    onViewProfile,
}: {
    visible: boolean;
    onClose: () => void;
    title: string;
    users: Array<{ id: string; username: string; full_name: string | null; avatar_url: string | null; is_verified?: boolean }>;
    onViewProfile: (id: string) => void;
}) {
    return (
        <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable
                    style={[
                        styles.menu,
                        { left: 16, right: 16, top: '20%', maxHeight: '60%', width: undefined },
                    ]}
                    onPress={() => {}}
                >
                    <View className="px-4 py-3 border-b border-gray-100 flex-row items-center justify-between">
                        <Text className="text-ink font-bold text-base">{title}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <IconSymbol name="xmark" size={18} color="#6B7280" />
                        </TouchableOpacity>
                    </View>
                    <View>
                        {users.map((u) => (
                            <TouchableOpacity
                                key={u.id}
                                className="px-4 py-3 flex-row items-center border-b border-gray-50"
                                onPress={() => onViewProfile(u.id)}
                                activeOpacity={0.85}
                            >
                                <View className="mr-3">
                                    <MiniAvatar path={u.avatar_url} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-ink font-semibold">{u.full_name || u.username}</Text>
                                    {u.full_name ? <Text className="text-gray-400 text-xs">@{u.username}</Text> : null}
                                </View>
                                {u.is_verified ? <IconSymbol name="checkmark.seal.fill" size={14} color="#3B82F6" /> : null}
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
