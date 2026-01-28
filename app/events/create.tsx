import { IconSymbol } from '@/components/ui/icon-symbol';
import { DurationWheelPicker } from '@/components/ui/DurationWheelPicker';
import { useAuth } from '@/lib/auth';
import { getUserConnectionsList } from '@/lib/connections';
import { supabase } from '@/lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CreateUserEventScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [durationDays, setDurationDays] = useState(0);
  const [durationHours, setDurationHours] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [durationWheelKey, setDurationWheelKey] = useState(0);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [myCity, setMyCity] = useState<string | null>(null);
  const [myIsVerified, setMyIsVerified] = useState(false);

  // Invites (connections)
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [connections, setConnections] = useState<any[]>([]);
  const [inviteeIds, setInviteeIds] = useState<string[]>([]);

  // Convert days/hours/minutes to total minutes
  const durationMinutesTotal = useMemo(
    () => durationDays * 24 * 60 + durationHours * 60 + durationMinutes,
    [durationDays, durationHours, durationMinutes]
  );

  const canSubmit = useMemo(() => !!(title.trim() && user?.id), [title, user?.id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.id) return;
      const { data } = await supabase.from('profiles').select('city, is_verified').eq('id', user.id).maybeSingle();
      if (!mounted) return;
      setMyCity(((data as any)?.city as string) || null);
      setMyIsVerified(!!(data as any)?.is_verified);
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const uploadEventImageIfNeeded = async (): Promise<string | null> => {
    if (!imageUri || !user?.id) return null;
    try {
      const fileExt = imageUri.split('.').pop() || 'jpg';
      const path = `events/user/${user.id}/${Date.now()}.${fileExt}`;
      const arraybuffer = await fetch(imageUri).then((res) => res.arrayBuffer());
      const { error: uploadError } = await supabase.storage.from('event-images').upload(path, arraybuffer, {
        contentType: `image/${fileExt}`,
        upsert: true,
      });
      if (uploadError) throw uploadError;
      return path;
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Could not upload event image.');
      return null;
    }
  };

  const onCreate = async () => {
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in to create an event.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Title required', 'Please add an event title.');
      return;
    }
    if (isPublic && !myIsVerified) {
      Alert.alert('Verification required', 'Verify your account to create public events. You can still create a connections-only event.');
      return;
    }
    setSaving(true);
    try {
      const imagePath = await uploadEventImageIfNeeded();

      // User-owned event: stored in `public.user_events`, tied to auth.uid().
      // RPC is created by `supabase/user_events_table.sql`.
      const { data: rpcId, error: rpcError } = await supabase.rpc('create_user_event', {
        p_title: title.trim(),
        p_description: description.trim() || '',
        p_event_date: date.toISOString(),
        p_location: location.trim() || '',
        p_is_public: isPublic,
        p_image_url: imagePath,
        p_city: myCity ?? '',
        p_duration_minutes: durationMinutesTotal,
      });

      if (rpcError) {
        const code = String(rpcError.code || '');
        const msg = String(rpcError.message || '');
        if (code === '42883' || /function.*does not exist/i.test(msg)) {
          throw new Error('Setup required: run `supabase/user_events_table.sql` in Supabase SQL Editor.');
        }
        throw new Error(msg || 'Could not create event.');
      }

      const createdId = typeof rpcId === 'string' ? rpcId : null;
      if (!createdId) throw new Error('Event created but no id returned.');

      // Send invites (best-effort; schema may not be installed yet)
      if (inviteeIds.length > 0) {
        const rows = inviteeIds.map((rid) => ({
          source: 'user',
          event_id: createdId,
          sender_id: user.id,
          receiver_id: rid,
          status: 'pending',
        }));
        const { error: invErr } = await supabase.from('event_invites').upsert(rows as any, {
          onConflict: 'source,event_id,receiver_id',
        });
        if (invErr && (invErr as any).code !== '42P01') {
          // Don't block creation navigation; just inform.
          Alert.alert('Invites not sent', (invErr as any)?.message || 'Could not send invites.');
        }
      }

      router.replace(`/events/${createdId}`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      <View className="px-4 py-3 flex-row items-center border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <IconSymbol name="chevron.left" size={22} color="#111827" />
        </TouchableOpacity>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center', bottom: 10 }}
        >
          <Text className="text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular' }}>
            New event
          </Text>
        </View>
        <View className="w-10 ml-auto" />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}>
        <TouchableOpacity
          onPress={pickImage}
          className="h-40 bg-gray-100 rounded-2xl items-center justify-center mb-6 overflow-hidden border border-gray-200"
          activeOpacity={0.9}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <View className="items-center">
              <IconSymbol name="camera.fill" size={28} color="#9CA3AF" />
              <Text className="text-gray-400 font-bold mt-2">Add Event Photo (optional)</Text>
              <Text className="text-gray-400 text-xs mt-1">Used as the City tab backdrop</Text>
            </View>
          )}
        </TouchableOpacity>

        <View className="mb-4">
          <Text className="font-bold text-gray-500 mb-2">Event Title *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Coffee meetup"
            className="bg-gray-100 p-4 rounded-xl"
            returnKeyType="next"
          />
        </View>

        <View className="mb-4">
          <Text className="font-bold text-gray-500 mb-2">Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What's this event about?"
            multiline
            numberOfLines={4}
            className="bg-gray-100 p-4 rounded-xl h-32"
            style={{ textAlignVertical: 'top' }}
          />
        </View>

        <View className="mb-4">
          <Text className="font-bold text-gray-500 mb-2">Date & Time *</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                setShowDatePicker(true);
                setShowTimePicker(false);
              }}
              activeOpacity={0.7}
              style={{
                flex: 1,
                backgroundColor: '#F3F4F6',
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                minHeight: 70,
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date</Text>
              <Text style={{ fontSize: 16, color: '#111827', fontWeight: 'bold' }}>
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowTimePicker(true);
                setShowDatePicker(false);
              }}
              activeOpacity={0.7}
              style={{
                flex: 1,
                backgroundColor: '#F3F4F6',
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                minHeight: 70,
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Time</Text>
              <Text style={{ fontSize: 16, color: '#111827', fontWeight: 'bold' }}>
                {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-4">
          <Text className="font-bold text-gray-500 mb-2">Duration</Text>
          <TouchableOpacity
            onPress={() => setShowDurationModal(true)}
            activeOpacity={0.7}
            style={{
              backgroundColor: '#F3F4F6',
              padding: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              minHeight: 56,
              justifyContent: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Duration</Text>
                <Text style={{ fontSize: 16, color: '#111827', fontWeight: 'bold' }}>
                  {durationDays > 0 && `${durationDays}d `}
                  {durationHours > 0 && `${durationHours}h `}
                  {durationMinutes > 0 ? `${durationMinutes}m` : durationDays === 0 && durationHours === 0 ? '0m' : ''}
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={18} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
        </View>

        {Platform.OS === 'android' && showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (event.type === 'set' && selectedDate) {
                const updatedDate = new Date(selectedDate);
                updatedDate.setHours(date.getHours());
                updatedDate.setMinutes(date.getMinutes());
                setDate(updatedDate);
              }
            }}
          />
        )}

        {Platform.OS === 'android' && showTimePicker && (
          <DateTimePicker
            value={date}
            mode="time"
            display="default"
            onChange={(event, selectedDate) => {
              setShowTimePicker(false);
              if (event.type === 'set' && selectedDate) setDate(new Date(selectedDate));
            }}
          />
        )}

        {Platform.OS === 'ios' && (showDatePicker || showTimePicker) && (
          <DateTimePicker
            value={date}
            mode={showTimePicker ? 'time' : 'date'}
            display="spinner"
            textColor="#111827"
            onChange={(_, selectedDate) => {
              if (selectedDate) setDate(new Date(selectedDate));
              setShowDatePicker(false);
              setShowTimePicker(false);
            }}
          />
        )}

        {/* Duration Modal */}
        <Modal
          visible={showDurationModal}
          transparent
          animationType="slide"
          onShow={() => setDurationWheelKey((k) => k + 1)}
          onRequestClose={() => setShowDurationModal(false)}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' }}>
            <View
              style={{
                backgroundColor: 'white',
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                padding: 20,
                paddingBottom: insets.bottom + 20,
              }}
            >
              <View style={{ alignItems: 'center', marginBottom: 18 }}>
                <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>Set Duration</Text>
              </View>

              <DurationWheelPicker
                days={durationDays}
                hours={durationHours}
                minutes={durationMinutes}
                onDaysChange={setDurationDays}
                onHoursChange={setDurationHours}
                onMinutesChange={setDurationMinutes}
                scrollKey={durationWheelKey}
              />

              <TouchableOpacity
                onPress={() => setShowDurationModal(false)}
                style={{
                  backgroundColor: '#111827',
                  padding: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  marginTop: 18,
                }}
              >
                <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={inviteModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setInviteModalVisible(false)}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' }}>
            <View
              style={{
                backgroundColor: 'white',
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                padding: 20,
                paddingBottom: insets.bottom + 20,
                maxHeight: '80%',
              }}
            >
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>Invite connections</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
                  Selected: {inviteeIds.length}
                </Text>
              </View>

              <TextInput
                value={inviteSearch}
                onChangeText={setInviteSearch}
                placeholder="Search connections…"
                className="bg-gray-100 p-4 rounded-xl mb-3"
              />

              <ScrollView
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                {inviteLoading ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator />
                  </View>
                ) : (
                  (connections || [])
                    .filter((c: any) => {
                      const q = inviteSearch.trim().toLowerCase();
                      if (!q) return true;
                      const name = `${c.full_name || ''} ${c.username || ''}`.toLowerCase();
                      return name.includes(q);
                    })
                    .map((c: any) => {
                      const selected = inviteeIds.includes(String(c.id));
                      return (
                        <TouchableOpacity
                          key={String(c.id)}
                          activeOpacity={0.85}
                          onPress={() => {
                            const cid = String(c.id);
                            setInviteeIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));
                          }}
                          className="flex-row items-center justify-between py-3 border-b border-gray-100"
                        >
                          <View>
                            <Text className="text-ink font-semibold">
                              {c.full_name || c.username || 'Connection'}
                            </Text>
                            {c.username ? <Text className="text-gray-500 text-xs">@{c.username}</Text> : null}
                          </View>
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: selected ? '#111827' : '#D1D5DB',
                              backgroundColor: selected ? '#111827' : 'transparent',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {selected ? <Text style={{ color: 'white', fontWeight: '700' }}>✓</Text> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                )}
              </ScrollView>

              <TouchableOpacity
                onPress={() => setInviteModalVisible(false)}
                style={{
                  backgroundColor: '#111827',
                  padding: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  marginTop: 14,
                }}
              >
                <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View className="mb-4">
          <Text className="font-bold text-gray-500 mb-2">Location</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Where is it happening?"
            className="bg-gray-100 p-4 rounded-xl"
          />
        </View>

        <View className="mb-6">
          <Text className="font-bold text-gray-500 mb-2">Visibility</Text>
          <View className="flex-row">
            <TouchableOpacity
              onPress={() => setIsPublic(false)}
              className={`flex-1 py-3 rounded-xl items-center border mr-2 ${!isPublic ? 'bg-black border-black' : 'bg-gray-100 border-gray-200'}`}
            >
              <Text className={`${!isPublic ? 'text-white' : 'text-gray-700'} font-bold`}>Connections only</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!myIsVerified) {
                  Alert.alert('Verification required', 'Verify your account to create public events.');
                  return;
                }
                setIsPublic(true);
              }}
              className={`flex-1 py-3 rounded-xl items-center border ${isPublic ? 'bg-black border-black' : 'bg-gray-100 border-gray-200'}`}
            >
              <Text className={`${isPublic ? 'text-white' : 'text-gray-700'} font-bold`}>Public</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-6">
          <Text className="font-bold text-gray-500 mb-2">Invite connections</Text>
          <TouchableOpacity
            onPress={async () => {
              if (!user?.id) return;
              setInviteModalVisible(true);
              if (connections.length > 0) return;
              setInviteLoading(true);
              try {
                const list = await getUserConnectionsList({ targetUserId: user.id, filterIntent: null });
                setConnections(list || []);
              } catch {
                setConnections([]);
              } finally {
                setInviteLoading(false);
              }
            }}
            activeOpacity={0.85}
            className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-4"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-ink font-semibold">
                {inviteeIds.length > 0 ? `${inviteeIds.length} selected` : 'Select connections'}
              </Text>
              <IconSymbol name="chevron.right" size={16} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onCreate}
          disabled={!canSubmit || saving}
          className={`py-4 rounded-xl items-center ${!canSubmit || saving ? 'bg-gray-300' : 'bg-black'}`}
          activeOpacity={0.9}
        >
          {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-base">Create event</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}


