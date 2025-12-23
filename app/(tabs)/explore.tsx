import { IconSymbol } from '@/components/ui/icon-symbol';
import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Image, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;

const SOCIAL_PLATFORMS_MAP: Record<string, { lib: any, icon: string, color: string }> = {
    'instagram': { lib: FontAwesome, icon: 'instagram', color: '#E1306C' },
    'tiktok': { lib: FontAwesome5, icon: 'tiktok', color: '#000000' },
    'facebook': { lib: FontAwesome, icon: 'facebook-square', color: '#1877F2' },
    'linkedin': { lib: FontAwesome, icon: 'linkedin-square', color: '#0077B5' },
    'x': { lib: FontAwesome, icon: 'twitter', color: '#1DA1F2' },
};

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
    social_links: SocialLinks | null; 
    is_verified: boolean; 
    photos: Photo[] | null;
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<{ total: number, romance: number, friendship: number, business: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
        .from('profiles')
        .select(`username, full_name, bio, avatar_url, detailed_interests, relationship_goals, social_links, is_verified`)
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

    const { data: statsData } = await supabase.rpc('get_user_connection_stats', { target_user_id: user.id });
    if (statsData) setStats(statsData);

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

  const getTheme = (goal?: string) => {
      switch(goal) {
          case 'Romance': return { bg: 'bg-romance/10', text: 'text-romance', border: 'border-romance/30', badge: 'bg-romance/20', icon: '#E07A5F' };
          case 'Friendship': return { bg: 'bg-friendship/10', text: 'text-friendship', border: 'border-friendship/30', badge: 'bg-friendship/20', icon: '#81B29A' };
          case 'Professional': return { bg: 'bg-business/10', text: 'text-business', border: 'border-business/30', badge: 'bg-business/20', icon: '#3D405B' };
          default: return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-200', icon: '#718096' };
      }
  };

  if (!profile && loading) return <View className="flex-1 bg-paper" />;

  const primaryGoal = profile?.relationship_goals?.[0];
  const theme = getTheme(primaryGoal);

  return (
    <View className="flex-1 bg-paper">
        <ScrollView 
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchProfile} />}
            contentContainerStyle={{ paddingBottom: 40 }}
        >
            {/* Header / Cover Area - Taller */}
            <View className={`h-80 relative ${theme.bg}`}>
                {profile?.photos && profile.photos.length > 0 ? (
                    <ProfileImage path={profile.photos[0].url} style={{ width: '100%', height: '100%' }} />
                ) : (
                    <View className="w-full h-full items-center justify-center">
                        <IconSymbol name="camera.fill" size={48} color={theme.icon} />
                    </View>
                )}
                
                {/* Settings Button */}
                <TouchableOpacity 
                    className="absolute top-12 right-4 bg-white/90 p-2 rounded-full shadow-sm backdrop-blur-md"
                    onPress={() => router.push('/(settings)/edit-profile')}
                >
                     <IconSymbol name="gear" size={24} color="#2D3748" />
                </TouchableOpacity>
            </View>

            {/* Profile Info */}
            <View className="px-5 -mt-16">
                <View className="border-4 border-paper rounded-full w-36 h-36 overflow-hidden bg-white shadow-md">
                     <ProfileImage path={profile?.avatar_url || null} style={{ width: '100%', height: '100%' }} />
                </View>
                
                <View className="mt-4">
                    <View className="flex-row items-center">
                        <Text className="text-3xl font-extrabold text-ink mr-2">{profile?.full_name || 'No Name'}</Text>
                        {profile?.is_verified && (
                            <IconSymbol name="checkmark.seal.fill" size={24} color="#3B82F6" />
                        )}
                    </View>
                    <Text className={`text-base font-semibold ${theme.text} mt-1 opacity-80`}>@{profile?.username || 'username'}</Text>
                </View>
                
                {/* Connection Stats (Clickable) */}
                {stats && stats.total > 0 && (
                    <TouchableOpacity 
                        onPress={() => router.push(`/connections/${user?.id}`)}
                        className="flex-row mt-6 bg-white p-3 rounded-xl justify-between border border-gray-100 shadow-sm"
                    >
                        <View className="items-center flex-1 justify-center">
                            <Text className="text-xl font-bold text-ink mb-1">{stats.total}</Text>
                            <IconSymbol name="person.2.fill" size={16} color="#9CA3AF" />
                        </View>
                        <View className="w-[1px] bg-gray-200" />
                        <View className="items-center flex-1 justify-center">
                            <Text className="text-lg font-bold text-romance mb-1">{stats.romance || 0}</Text>
                            <IconSymbol name="heart.fill" size={14} color="#E07A5F" />
                        </View>
                        <View className="items-center flex-1 justify-center">
                            <Text className="text-lg font-bold text-friendship mb-1">{stats.friendship || 0}</Text>
                            <IconSymbol name="person.2.fill" size={14} color="#81B29A" />
                        </View>
                        <View className="items-center flex-1 justify-center">
                            <Text className="text-lg font-bold text-business mb-1">{stats.business || 0}</Text>
                            <IconSymbol name="briefcase.fill" size={14} color="#3D405B" />
                        </View>
                    </TouchableOpacity>
                )}

                {/* Bio */}
                <Text className="mt-6 text-ink text-lg leading-7 font-medium opacity-90">
                    {profile?.bio || 'Add a bio to introduce yourself.'}
                </Text>

                {/* Photos Gallery */}
                {profile?.photos && profile.photos.length > 0 && (
                    <View className="mt-6">
                        <Text className="text-xl font-bold mb-3 text-ink">Photos</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {profile.photos.map((p, i) => (
                                <View key={i} className="mr-3 w-32 h-40 rounded-xl overflow-hidden shadow-sm bg-gray-100 border border-gray-200">
                                    <ProfileImage path={p.url} style={{ width: '100%', height: '100%' }} />
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Detailed Interests */}
                <View className="mt-8">
                    <Text className="text-xl font-bold mb-4 text-ink">Interests</Text>
                    {profile?.detailed_interests && Object.keys(profile.detailed_interests).length > 0 ? (
                        Object.entries(profile.detailed_interests).map(([category, items]) => (
                            <View key={category} className="mb-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                <Text className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">{category}</Text>
                                <View className="flex-row flex-wrap">
                                    {items && items.length > 0 ? (
                                        items.map((item, idx) => (
                                            <View key={idx} className={`px-3 py-1.5 rounded-lg mr-2 mb-2 border border-gray-100 ${theme.bg}`}>
                                                <Text className={`font-semibold text-sm ${theme.text}`}>{item}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <Text className="text-gray-400 italic text-sm">General Interest</Text>
                                    )}
                                </View>
                            </View>
                        ))
                    ) : (
                        <View className="bg-gray-50 p-6 rounded-2xl items-center border border-dashed border-gray-300">
                             <Text className="text-gray-400 italic">No interests added yet.</Text>
                        </View>
                    )}
                </View>

                {/* Sign Out Button */}
                <TouchableOpacity 
                    onPress={() => signOut()} 
                    className="mt-8 mb-8 bg-gray-100 py-4 rounded-2xl items-center border border-gray-200"
                >
                    <Text className="text-red-500 font-bold text-lg">Sign Out</Text>
                </TouchableOpacity>
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
