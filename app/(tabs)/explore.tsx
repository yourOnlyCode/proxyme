import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Image, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;

type Photo = {
  url: string;
  order: number;
};

type SocialLinks = {
    instagram?: string;
    tiktok?: string;
    facebook?: string;
    linkedin?: string;
    x?: string;
};

type ProfileData = {
    username: string;
    full_name: string;
    bio: string;
    avatar_url: string | null;
    detailed_interests: Record<string, string[]> | null; 
    relationship_goals: string[] | null; 
    social_links: SocialLinks | null; // NEW FIELD
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

    const { data, error } = await supabase
        .from('profiles')
        .select(`username, full_name, bio, avatar_url, detailed_interests, relationship_goals, social_links`)
        .eq('id', user.id)
        .single();

    if (error) {
        console.error(error);
        setLoading(false);
        return;
    }

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

  const openLink = (url: string) => {
      Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  const getSocialUrl = (platform: string, handle: string) => {
      if (handle.startsWith('http')) return handle;
      switch (platform) {
          case 'instagram': return `https://instagram.com/${handle.replace('@', '')}`;
          case 'tiktok': return `https://tiktok.com/@${handle.replace('@', '')}`;
          case 'x': return `https://x.com/${handle.replace('@', '')}`;
          default: return handle;
      }
  };

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
                
                {/* Relationship Goals */}
                {profile?.relationship_goals && profile.relationship_goals.length > 0 && (
                    <View className="flex-row flex-wrap mt-3">
                        {profile.relationship_goals.map((goal, idx) => (
                            <View key={idx} className="bg-black/5 px-3 py-1 rounded-full mr-2 mb-2 border border-black/10">
                                <Text className="text-xs font-bold uppercase tracking-wide text-gray-800">{goal}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Social Links (Displayed for Owner) */}
                {profile?.social_links && Object.keys(profile.social_links).length > 0 && (
                    <View className="flex-row mt-4 space-x-4">
                        {Object.entries(profile.social_links).map(([platform, handle]) => {
                            if (!handle) return null;
                            return (
                                <TouchableOpacity 
                                    key={platform} 
                                    onPress={() => openLink(getSocialUrl(platform, handle))}
                                    className="bg-gray-100 p-2 rounded-full"
                                >
                                    {/* Simple Text Fallback for Icons */}
                                    <Text className="text-xs font-bold uppercase text-gray-700">{platform.substring(0, 2)}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {/* Bio */}
                <Text className="mt-4 text-gray-800 text-base leading-6">
                    {profile?.bio || 'No bio yet.'}
                </Text>

                {/* Detailed Interests */}
                <View className="mt-6">
                    <Text className="text-lg font-bold mb-3">Interests</Text>
                    {profile?.detailed_interests && Object.keys(profile.detailed_interests).length > 0 ? (
                        Object.entries(profile.detailed_interests).map(([category, items]) => (
                            <View key={category} className="mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <Text className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">{category}</Text>
                                <View className="flex-row flex-wrap">
                                    {items && items.length > 0 ? (
                                        items.map((item, idx) => (
                                            <View key={idx} className="bg-white px-3 py-1 rounded-full mr-2 mb-2 border border-gray-200">
                                                <Text className="text-gray-700 font-medium text-sm">{item}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <Text className="text-gray-400 italic text-sm">General Interest</Text>
                                    )}
                                </View>
                            </View>
                        ))
                    ) : (
                        <Text className="text-gray-400 italic">No interests added yet.</Text>
                    )}
                </View>

                {/* Gallery Grid */}
                <Text className="text-lg font-bold mt-4 mb-4">Photos</Text>
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
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setUrl(data.publicUrl);
    }, [path]);
  
    if (!url) return <View style={style} className="bg-gray-200 animate-pulse" />;
  
    return (
      <Image source={{ uri: url }} style={style} resizeMode="cover" />
    );
}
