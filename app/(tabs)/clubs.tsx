import { CoachMarks } from '@/components/ui/CoachMarks';
import { GlassCard } from '@/components/ui/GlassCard';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, Modal, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { supabase } from '../../lib/supabase';
import { getUiCache, loadUiCache, setUiCache } from '../../lib/uiCache';

type Club = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  city: string;
  join_policy?: 'invite_only' | 'request_to_join';
  member_count?: number;
  is_member?: boolean;
  role?: 'owner' | 'admin' | 'member';
};

export default function ClubsScreen() {
  const { user } = useAuth();
  const { address } = useProxyLocation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const [focused, setFocused] = useState(true);
  const createRef = useRef<View | null>(null);
  const tabsRef = useRef<View | null>(null);
  const listRef = useRef<View | null>(null);
  const [myClubs, setMyClubs] = useState<Club[]>(() => getUiCache<Club[]>('clubs.my') ?? []);
  const [cityClubs, setCityClubs] = useState<Club[]>(() => getUiCache<Club[]>('clubs.city') ?? []); // Discovery
  const [loading, setLoading] = useState(myClubs.length === 0 && cityClubs.length === 0); // initial-only loader
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [tab, setTab] = useState<'my' | 'discover'>('my');

  // Only show coach marks when this tab is focused (prevents background tabs from popping a tour).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Create Form
  const [newClubName, setNewClubName] = useState('');
  const [newClubDesc, setNewClubDesc] = useState('');
  const [newClubImage, setNewClubImage] = useState<string | null>(null);
  const [newClubJoinPolicy, setNewClubJoinPolicy] = useState<'invite_only' | 'request_to_join'>('request_to_join');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user && address?.city) {
        fetchClubs();
    }
  }, [user, address?.city, tab]);

  // If we mounted with empty memory-cache (e.g., app cold start), try local storage hydrate.
  useEffect(() => {
    if (myClubs.length === 0) {
      loadUiCache<Club[]>('clubs.my').then((cached) => {
        if (cached && cached.length > 0) {
          setMyClubs(cached);
          setLoading(false);
        }
      });
    }
    if (cityClubs.length === 0) {
      loadUiCache<Club[]>('clubs.city').then((cached) => {
        if (cached && cached.length > 0) {
          setCityClubs(cached);
          setLoading(false);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchClubs = async () => {
    if (!user) return;
    if ((tab === 'my' && myClubs.length > 0) || (tab === 'discover' && cityClubs.length > 0)) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
        if (tab === 'my') {
            // Fetch my clubs
            let data: any[] | null = null;
            let error: any = null;

            // join_policy is a newer column; if the DB hasn't been migrated yet we fall back.
            const primary = await supabase
              .from('club_members')
              .select(`
                  role,
                  club:clubs (
                      id, name, description, image_url, city, join_policy
                  )
              `)
              .eq('user_id', user.id)
              .eq('status', 'accepted');

            data = primary.data as any[] | null;
            error = primary.error as any;

            if (error?.code === '42703') {
              const fallback = await supabase
                .from('club_members')
                .select(`
                    role,
                    club:clubs (
                        id, name, description, image_url, city
                    )
                `)
                .eq('user_id', user.id)
                .eq('status', 'accepted');
              data = fallback.data as any[] | null;
              error = fallback.error as any;
            }
            
            if (error) throw error;
            
            const clubs = (data ?? []).map((item: any) => ({
                ...item.club,
                role: item.role,
                is_member: true
            }));
            setMyClubs(clubs);
            setUiCache('clubs.my', clubs);
        } else {
            // Discover clubs in city
            if (!address?.city) {
                setCityClubs([]);
                setLoading(false);
                return;
            }

            // First, fetch user's club memberships to exclude them
            const { data: myMemberships, error: membershipError } = await supabase
                .from('club_members')
                .select('club_id')
                .eq('user_id', user.id)
                .eq('status', 'accepted');

            if (membershipError) throw membershipError;

            const myClubIds = new Set((myMemberships || []).map((m: any) => m.club_id));

            // Fetch all clubs in city
            let data: any[] | null = null;
            let error: any = null;

            const primary = await supabase
              .from('clubs')
              .select('id, name, description, image_url, city, join_policy')
              .eq('city', address.city);

            data = primary.data as any[] | null;
            error = primary.error as any;

            if (error?.code === '42703') {
              const fallback = await supabase
                .from('clubs')
                .select('id, name, description, image_url, city')
                .eq('city', address.city);
              data = fallback.data as any[] | null;
              error = fallback.error as any;
            }

            if (error) throw error;

            // Filter out clubs user is already a member of
            const clubs = (data || []).filter((c: any) => !myClubIds.has(c.id));
            
            setCityClubs(clubs);
            setUiCache('clubs.city', clubs);
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
        setRefreshing(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.5,
    });

    if (!result.canceled) {
        setNewClubImage(result.assets[0].uri);
    }
  };

  const handleCreateClub = async () => {
      if (!user || !address?.city) return;
      if (!newClubName.trim()) {
          Alert.alert('Error', 'Club name is required');
          return;
      }

      // Check if user is verified
      const { data: profile } = await supabase
          .from('profiles')
          .select('is_verified')
          .eq('id', user.id)
          .single();

      if (!profile?.is_verified) {
          Alert.alert(
              'Verification Required',
              'You need to be verified to create clubs. Get verified to unlock this feature and more!',
              [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                      text: 'Get Verified', 
                      onPress: () => router.push('/(settings)/get-verified')
                  }
              ]
          );
          return;
      }

      // Enforce: users can only create one club
      const { data: existingClub, error: existingClubError } = await supabase
          .from('clubs')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle();

      if (existingClubError) {
          Alert.alert('Error', existingClubError.message);
          return;
      }

      if (existingClub?.id) {
          Alert.alert('Limit reached', 'You can only create one club. You can still join as many clubs as you want.');
          return;
      }

      setCreating(true);
      try {
          let imagePath = null;
          if (newClubImage) {
              const fileExt = newClubImage.split('.').pop()?.toLowerCase() ?? 'jpeg';
              const path = `clubs/${Date.now()}.${fileExt}`;
              const arraybuffer = await fetch(newClubImage).then((res) => res.arrayBuffer());
              
              const { error: uploadError } = await supabase.storage
                  .from('avatars') // Reuse avatars bucket or create 'clubs' bucket? Assuming 'avatars' for now or general usage
                  .upload(path, arraybuffer, { contentType: `image/${fileExt}` });
              
              if (uploadError) throw uploadError;
              imagePath = path;
          }

          // Insert Club
          const { data: clubData, error: clubError } = await supabase
              .from('clubs')
              .insert({
                  name: newClubName,
                  description: newClubDesc,
                  city: address.city,
                  owner_id: user.id,
                  image_url: imagePath,
                  join_policy: newClubJoinPolicy,
              })
              .select()
              .single();

          if (clubError?.code === '42703') {
              // DB hasn't been migrated to include join_policy yet. Retry without it.
              const retry = await supabase
                .from('clubs')
                .insert({
                  name: newClubName,
                  description: newClubDesc,
                  city: address.city,
                  owner_id: user.id,
                  image_url: imagePath,
                })
                .select()
                .single();

              if (retry.error) throw retry.error;
              // overwrite for later usage
              (clubData as any) = retry.data as any;
          } else if (clubError) {
              // DB-enforced unique index on owner_id will throw 23505
              if (clubError.code === '23505') {
                  Alert.alert('Limit reached', 'You can only create one club. You can still join as many clubs as you want.');
                  return;
              }
              throw clubError;
          }

          // Insert Owner Member
          const { error: memberError } = await supabase
              .from('club_members')
              .insert({
                  club_id: clubData.id,
                  user_id: user.id,
                  role: 'owner',
                  status: 'accepted'
              });

          if (memberError) {
              // Rollback club creation?
              console.error('Failed to add owner member', memberError);
              // For MVP, just alert.
          }

          setCreateModalVisible(false);
          setNewClubName('');
          setNewClubDesc('');
          setNewClubImage(null);
          setNewClubJoinPolicy('request_to_join');
          setTab('my');
          fetchClubs();
          Alert.alert('Success', 'Club created!');

      } catch (error: any) {
          Alert.alert('Error', error.message);
      } finally {
          setCreating(false);
      }
  };

  const renderClubItem = ({ item }: { item: Club }) => (
      <TouchableOpacity onPress={() => router.push(`/clubs/${item.id}`)} activeOpacity={0.92}>
          <GlassCard className="mb-4" contentClassName="overflow-hidden" tint={isDark ? 'dark' : 'light'} intensity={35}>
              <View className="h-32 bg-gray-200">
                  {item.image_url ? (
                      <ClubImage path={item.image_url} />
                  ) : (
                      <View className="w-full h-full items-center justify-center bg-gray-300">
                          <IconSymbol name="person.3.fill" size={40} color="#9CA3AF" />
                      </View>
                  )}
                  <View className="absolute top-2 right-2 bg-black/50 px-2 py-1 rounded-md">
                      <Text className="text-white text-xs font-bold uppercase">{item.city || ''}</Text>
                  </View>
              </View>
              <View className="p-4">
                  <View className="flex-row justify-between items-center mb-1">
                      <Text className="text-xl font-bold text-ink flex-1 mr-2" numberOfLines={1} style={{ color: isDark ? '#E5E7EB' : undefined }}>
                        {item.name}
                      </Text>
                      {item.role && (
                          <View className="bg-blue-100 px-2 py-0.5 rounded text-xs">
                              <Text className="text-blue-700 font-bold text-[10px] uppercase">{String(item.role)}</Text>
                          </View>
                      )}
                  </View>
                  <Text className="text-gray-500 text-sm mb-3" numberOfLines={2}>{item.description || 'No description'}</Text>
                  
                  {item.is_member ? (
                      <View className="flex-row items-center">
                          <IconSymbol name="checkmark.circle.fill" size={16} color="#10B981" />
                          <Text className="text-emerald-600 font-bold text-xs ml-1">Member</Text>
                      </View>
                  ) : (
                      <View className="flex-row items-center">
                          {(item as any)?.join_policy === 'request_to_join' ? (
                            <>
                              <IconSymbol name="person.crop.circle.badge.plus" size={14} color="#2563EB" />
                              <Text className="text-business font-bold text-xs ml-1">Request to join</Text>
                            </>
                          ) : (
                            <>
                              <IconSymbol name="lock.fill" size={12} color="#6B7280" />
                              <Text className="text-gray-500 font-bold text-xs ml-1">Invite Only</Text>
                            </>
                          )}
                      </View>
                  )}
              </View>
          </GlassCard>
      </TouchableOpacity>
  );

  return (
    <View
      className="flex-1 bg-transparent px-4"
      style={{ paddingTop: insets.top + 12, backgroundColor: isDark ? '#0B1220' : undefined }}
    >
        <View className="flex-row justify-between items-center mb-4">
            <View className="w-10" />
            <Text className="text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular', color: isDark ? '#E5E7EB' : undefined }}>Social Clubs</Text>
            {/* Create Button - verify limit logic handled in backend or assume UI check needed? */}
            <View ref={createRef} collapsable={false}>
              <TouchableOpacity 
                  onPress={() => setCreateModalVisible(true)}
                  className="bg-black w-10 h-10 rounded-full items-center justify-center shadow-md"
              >
                  <IconSymbol name="plus" size={24} color="white" />
              </TouchableOpacity>
            </View>
        </View>

        <View ref={tabsRef} collapsable={false}>
          <GlassCard className="mb-6" contentClassName="p-1" tint={isDark ? 'dark' : 'light'} intensity={25}>
              <View className="flex-row">
                  <TouchableOpacity 
                      onPress={() => setTab('my')}
                      className={`flex-1 py-2 rounded-lg items-center ${tab === 'my' ? 'bg-white/80' : ''}`}
                      style={{ backgroundColor: tab === 'my' ? (isDark ? 'rgba(15,23,42,0.85)' : undefined) : undefined }}
                  >
                      <Text className={`font-bold ${tab === 'my' ? 'text-ink' : 'text-gray-400'}`} style={{ color: tab === 'my' ? (isDark ? '#E5E7EB' : undefined) : (isDark ? 'rgba(226,232,240,0.55)' : undefined) }}>
                        My Clubs
                      </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                      onPress={() => setTab('discover')}
                      className={`flex-1 py-2 rounded-lg items-center ${tab === 'discover' ? 'bg-white/80' : ''}`}
                      style={{ backgroundColor: tab === 'discover' ? (isDark ? 'rgba(15,23,42,0.85)' : undefined) : undefined }}
                  >
                      <Text className={`font-bold ${tab === 'discover' ? 'text-ink' : 'text-gray-400'}`} style={{ color: tab === 'discover' ? (isDark ? '#E5E7EB' : undefined) : (isDark ? 'rgba(226,232,240,0.55)' : undefined) }}>
                        Discover {address?.city || 'Clubs'}
                      </Text>
                  </TouchableOpacity>
              </View>
          </GlassCard>
        </View>

        <View ref={listRef} collapsable={false} style={{ flex: 1 }}>
          <FlatList
              data={tab === 'my' ? myClubs : cityClubs}
              renderItem={renderClubItem}
              keyExtractor={item => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchClubs} />}
              ListEmptyComponent={
                  <View className="items-center mt-20 opacity-50">
                      <IconSymbol name="person.3.fill" size={48} color="#CBD5E0" />
                      <Text className="text-gray-500 mt-4 font-medium">
                          {tab === 'my' ? "You haven't joined any clubs yet." : `No clubs found in ${address?.city || 'your city'}.`}
                      </Text>
                  </View>
              }
              contentContainerStyle={{ paddingBottom: 100 }}
          />
        </View>

        <CoachMarks
          enabled={focused}
          storageKey="tutorial:tab:clubs:v1"
          steps={[
            {
              key: 'tabs',
              title: 'Your clubs vs discover',
              body: 'Switch between clubs you’re in and clubs you can discover in your city.',
              targetRef: tabsRef,
            },
            {
              key: 'create',
              title: 'Create a club',
              body: 'Tap + to start a new club and invite people in.',
              targetRef: createRef,
            },
            {
              key: 'list',
              title: 'Browse clubs',
              body: 'Tap a club to view its forum, events, members, and settings.',
              targetRef: listRef,
            },
          ]}
        />

        {/* Create Club Modal */}
        <Modal
            visible={createModalVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setCreateModalVisible(false)}
        >
            <View className="flex-1 bg-white p-6" style={{ backgroundColor: isDark ? '#0B1220' : undefined }}>
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-2xl font-bold text-ink" style={{ color: isDark ? '#E5E7EB' : undefined }}>Create Club</Text>
                    <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                        <Text className="text-gray-500 font-bold" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>Cancel</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    onPress={pickImage}
                    className="h-48 bg-gray-100 rounded-2xl items-center justify-center mb-6 overflow-hidden border border-gray-200"
                >
                    {newClubImage ? (
                        <Image source={{ uri: newClubImage }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                        <View className="items-center">
                            <IconSymbol name="camera.fill" size={32} color="#9CA3AF" />
                            <Text className="text-gray-400 font-bold mt-2">Add Cover Photo</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <Text className="font-bold text-gray-500 mb-2">Club Name</Text>
                <TextInput
                    value={newClubName}
                    onChangeText={setNewClubName}
                    placeholder="e.g. Downtown Runners"
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 font-semibold text-lg"
                    style={{
                      color: isDark ? '#E5E7EB' : undefined,
                      backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
                      borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
                    }}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => Keyboard.dismiss()}
                />

                <Text className="font-bold text-gray-500 mb-2">Description</Text>
                <TextInput
                    value={newClubDesc}
                    onChangeText={setNewClubDesc}
                    placeholder="What's this club about?"
                    multiline
                    numberOfLines={4}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-base h-32"
                    style={{
                      textAlignVertical: 'top',
                      color: isDark ? '#E5E7EB' : undefined,
                      backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
                      borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
                    }}
                    returnKeyType="done"
                    blurOnSubmit={true}
                    onSubmitEditing={() => Keyboard.dismiss()}
                />

                <Text className="font-bold text-gray-500 mb-2">Who can join?</Text>
                <View className="flex-row mb-6">
                    <TouchableOpacity
                        onPress={() => setNewClubJoinPolicy('request_to_join')}
                        className={`flex-1 py-3 rounded-xl items-center border mr-2 ${
                            newClubJoinPolicy === 'request_to_join' ? 'bg-black border-black' : 'bg-gray-50 border-gray-200'
                        }`}
                        activeOpacity={0.9}
                    >
                        <Text className={`font-bold ${newClubJoinPolicy === 'request_to_join' ? 'text-white' : 'text-gray-700'}`}>
                            Request to join
                        </Text>
                        <Text className={`text-[11px] mt-0.5 ${newClubJoinPolicy === 'request_to_join' ? 'text-white/80' : 'text-gray-500'}`}>
                            Owner approves requests
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setNewClubJoinPolicy('invite_only')}
                        className={`flex-1 py-3 rounded-xl items-center border ${
                            newClubJoinPolicy === 'invite_only' ? 'bg-black border-black' : 'bg-gray-50 border-gray-200'
                        }`}
                        activeOpacity={0.9}
                    >
                        <Text className={`font-bold ${newClubJoinPolicy === 'invite_only' ? 'text-white' : 'text-gray-700'}`}>
                            Invite only
                        </Text>
                        <Text className={`text-[11px] mt-0.5 ${newClubJoinPolicy === 'invite_only' ? 'text-white/80' : 'text-gray-500'}`}>
                            Admins send invites
                        </Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    onPress={handleCreateClub}
                    disabled={creating}
                    className="bg-black py-4 rounded-xl items-center shadow-lg"
                >
                    {creating ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-bold text-lg">Create Club</Text>
                    )}
                </TouchableOpacity>
                
                <Text className="text-center text-gray-400 text-xs mt-4">
                    Verification required to create clubs.
                </Text>
            </View>
        </Modal>
    </View>
  );
}

function ClubImage({ path }: { path: string }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!path) return;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        if (data) {
            setUrl(data.publicUrl);
        }
    }, [path]);

    if (!url) return <View className="w-full h-full bg-gray-200" />;
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />;
}

