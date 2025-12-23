import { IconSymbol } from '@/components/ui/icon-symbol';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { supabase } from '../../lib/supabase';

type Club = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  city: string;
  member_count?: number;
  is_member?: boolean;
  role?: 'owner' | 'admin' | 'member';
};

export default function ClubsScreen() {
  const { user } = useAuth();
  const { address } = useProxyLocation();
  const router = useRouter();
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [cityClubs, setCityClubs] = useState<Club[]>([]); // Discovery
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [tab, setTab] = useState<'my' | 'discover'>('my');

  // Create Form
  const [newClubName, setNewClubName] = useState('');
  const [newClubDesc, setNewClubDesc] = useState('');
  const [newClubImage, setNewClubImage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user && address?.city) {
        fetchClubs();
    }
  }, [user, address?.city, tab]);

  const fetchClubs = async () => {
    if (!user) return;
    setLoading(true);

    try {
        if (tab === 'my') {
            // Fetch my clubs
            const { data, error } = await supabase
                .from('club_members')
                .select(`
                    role,
                    club:clubs (
                        id, name, description, image_url, city
                    )
                `)
                .eq('user_id', user.id)
                .eq('status', 'accepted');
            
            if (error) throw error;
            
            const clubs = data.map((item: any) => ({
                ...item.club,
                role: item.role,
                is_member: true
            }));
            setMyClubs(clubs);
        } else {
            // Discover clubs in city
            if (!address?.city) {
                setCityClubs([]);
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('clubs')
                .select('*')
                .eq('city', address.city);

            if (error) throw error;

            // Check membership for these clubs
            // Ideally use a join or separate query, but for simple MVP:
            // We want to exclude clubs I'm already in? Or show them? 
            // "Hub for the city" -> maybe show all.
            // But let's check membership to tag them.
            
            // To properly filter or tag, we need to know which ones I'm in.
            // I'll reuse myClubs IDs if available, or fetch.
            
            const myClubIds = new Set(myClubs.map(c => c.id));
            
            const clubs = data.map((c: any) => ({
                ...c,
                is_member: myClubIds.has(c.id)
            }));
            
            setCityClubs(clubs);
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
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
                  image_url: imagePath
              })
              .select()
              .single();

          if (clubError) throw clubError;

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
      <TouchableOpacity 
        className="bg-white rounded-2xl mb-4 shadow-sm overflow-hidden border border-gray-100"
        onPress={() => router.push(`/clubs/${item.id}`)}
      >
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
                  <Text className="text-xl font-bold text-ink flex-1 mr-2" numberOfLines={1}>{item.name}</Text>
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
                      <IconSymbol name="lock.fill" size={12} color="#6B7280" />
                      <Text className="text-gray-500 font-bold text-xs ml-1">Invite Only</Text>
                  </View>
              )}
          </View>
      </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-gray-50 pt-12 px-4">
        <View className="flex-row justify-between items-center mb-4">
            <Text className="text-3xl font-bold text-ink">Clubs</Text>
            {/* Create Button - verify limit logic handled in backend or assume UI check needed? */}
            <TouchableOpacity 
                onPress={() => setCreateModalVisible(true)}
                className="bg-black w-10 h-10 rounded-full items-center justify-center shadow-md"
            >
                <IconSymbol name="plus" size={24} color="white" />
            </TouchableOpacity>
        </View>

        <View className="flex-row mb-6 bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
            <TouchableOpacity 
                onPress={() => setTab('my')}
                className={`flex-1 py-2 rounded-lg items-center ${tab === 'my' ? 'bg-gray-100' : ''}`}
            >
                <Text className={`font-bold ${tab === 'my' ? 'text-ink' : 'text-gray-400'}`}>My Clubs</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                onPress={() => setTab('discover')}
                className={`flex-1 py-2 rounded-lg items-center ${tab === 'discover' ? 'bg-gray-100' : ''}`}
            >
                <Text className={`font-bold ${tab === 'discover' ? 'text-ink' : 'text-gray-400'}`}>Discover {address?.city || 'Clubs'}</Text>
            </TouchableOpacity>
        </View>

        <FlatList
            data={tab === 'my' ? myClubs : cityClubs}
            renderItem={renderClubItem}
            keyExtractor={item => item.id}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchClubs} />}
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

        {/* Create Club Modal */}
        <Modal
            visible={createModalVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setCreateModalVisible(false)}
        >
            <View className="flex-1 bg-white p-6">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-2xl font-bold text-ink">Create Club</Text>
                    <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                        <Text className="text-gray-500 font-bold">Cancel</Text>
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
                />

                <Text className="font-bold text-gray-500 mb-2">Description</Text>
                <TextInput
                    value={newClubDesc}
                    onChangeText={setNewClubDesc}
                    placeholder="What's this club about?"
                    multiline
                    numberOfLines={4}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-base h-32"
                    style={{ textAlignVertical: 'top' }}
                />

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
                    Unverified users can create max 1 club.
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
        supabase.storage.from('avatars').getPublicUrl(path).then(({ data }) => {
            setUrl(data.publicUrl);
        });
    }, [path]);

    if (!url) return <View className="w-full h-full bg-gray-200" />;
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />;
}

