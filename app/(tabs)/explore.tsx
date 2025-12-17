import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Image, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;

type Photo = {
  url: string;
  order: number;
};

type ProfileData = {
    username: string;
    full_name: string;
    bio: string;
    avatar_url: string | null;
    interests: string[] | null;
    photos: Photo[] | null;
};

export default function ProfileScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);

    // Get Profile
    const { data, error } = await supabase
        .from('profiles')
        .select(`username, full_name, bio, avatar_url, interests`)
        .eq('id', user.id)
        .single();

    if (error) {
        console.error(error);
        setLoading(false);
        return;
    }

    // Get Photos
    const { data: photosData } = await supabase
        .from('profile_photos')
        .select('image_url, display_order')
        .eq('user_id', user.id)
        .order('display_order');

    setProfile({
        ...data,
        photos: (photosData || []).map(p => ({ url: p.image_url, order: p.display_order }))
    });
    setLoading(false);
  };

  useFocusEffect(
      useCallback(() => {
          fetchProfile();
      }, [user])
  );

  if (!profile && loading) return <View className="flex-1 bg-white" />;

  return (
    <View className="flex-1 bg-white">
        <ScrollView 
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchProfile} />}
            contentContainerStyle={{ paddingBottom: 40 }}
        >
            {/* Header / Cover Area */}
            <View className="h-64 bg-gray-200 relative">
                {profile?.photos && profile.photos.length > 0 ? (
                    <ProfileImage path={profile.photos[0].url} style={{ width: '100%', height: '100%' }} />
                ) : (
                    <View className="w-full h-full items-center justify-center">
                        <Text className="text-gray-400">No Cover Photo</Text>
                    </View>
                )}
                
                {/* Settings Button */}
                <TouchableOpacity 
                    className="absolute top-12 right-4 bg-white/80 p-2 rounded-full backdrop-blur-md"
                    onPress={() => router.push('/(settings)/edit-profile')}
                >
                     <IconSymbol name="gear" size={24} color="black" />
                </TouchableOpacity>
            </View>

            {/* Profile Info */}
            <View className="px-4 -mt-12">
                <View className="border-4 border-white rounded-full w-24 h-24 overflow-hidden bg-gray-100 shadow-sm">
                     <ProfileImage path={profile?.avatar_url || null} style={{ width: '100%', height: '100%' }} />
                </View>
                
                <View className="mt-3">
                    <Text className="text-2xl font-bold">{profile?.full_name || 'No Name'}</Text>
                    <Text className="text-gray-500 text-base">@{profile?.username || 'username'}</Text>
                </View>

                {/* Bio */}
                <Text className="mt-4 text-gray-800 text-base leading-6">
                    {profile?.bio || 'No bio yet.'}
                </Text>

                {/* Interests */}
                <View className="flex-row flex-wrap mt-6">
                    {profile?.interests?.map(interest => (
                        <View key={interest} className="bg-gray-100 px-3 py-1.5 rounded-full mr-2 mb-2">
                            <Text className="text-gray-700 font-medium">{interest}</Text>
                        </View>
                    ))}
                </View>

                {/* Gallery Grid */}
                <Text className="text-lg font-bold mt-8 mb-4">Photos</Text>
                <View className="flex-row flex-wrap">
                    {profile?.photos?.map((photo, index) => (
                        <View key={index} className="w-1/3 aspect-[4/5] p-1">
                             <View className="w-full h-full rounded-lg overflow-hidden bg-gray-100">
                                 <ProfileImage path={photo.url} style={{ width: '100%', height: '100%' }} />
                             </View>
                        </View>
                    ))}
                    {(!profile?.photos || profile.photos.length === 0) && (
                        <Text className="text-gray-400 italic">No gallery photos added.</Text>
                    )}
                </View>
            </View>
        </ScrollView>
    </View>
  );
}

function ProfileImage({ path, style }: { path: string | null, style: any }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) return;
      supabase.storage.from('avatars').download(path).then(({ data }) => {
        if (data) {
          const fr = new FileReader();
          fr.readAsDataURL(data);
          fr.onload = () => setUrl(fr.result as string);
        }
      });
    }, [path]);
  
    if (!url) return <View style={style} className="bg-gray-200 animate-pulse" />;
  
    return (
      <Image source={{ uri: url }} style={style} resizeMode="cover" />
    );
  }
