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
    social_links: SocialLinks | null; 
    is_verified: boolean; 
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

  const getSocialIcon = (platform: string) => {
      switch (platform) {
          case 'instagram': return { name: 'camera.fill', color: '#E1306C' };
          case 'tiktok': return { name: 'music.note', color: '#000000' };
          case 'facebook': return { name: 'hand.thumbsup.fill', color: '#1877F2' };
          case 'linkedin': return { name: 'briefcase.fill', color: '#0077B5' };
          case 'x': return { name: 'bubble.left.fill', color: '#1DA1F2' }; // Using generic bubble for X if logo unavailable
          default: return { name: 'link', color: '#718096' };
      }
  };

  const getTheme = (goal?: string) => {
      switch(goal) {
          case 'Romance': return { bg: 'bg-romance/10', text: 'text-romance', border: 'border-romance/30', badge: 'bg-romance/20', icon: '#E07A5F' };
          case 'Friendship': return { bg: 'bg-friendship/10', text: 'text-friendship', border: 'border-friendship/30', badge: 'bg-friendship/20', icon: '#81B29A' };
          case 'Business': return { bg: 'bg-business/10', text: 'text-business', border: 'border-business/30', badge: 'bg-business/20', icon: '#3D405B' };
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
            {/* Header / Cover Area */}
            <View className={`h-64 relative ${theme.bg}`}>
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
            <View className="px-5 -mt-12">
                <View className="border-4 border-paper rounded-full w-28 h-28 overflow-hidden bg-white shadow-md">
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
                
                {/* Relationship Goals */}
                {profile?.relationship_goals && profile.relationship_goals.length > 0 && (
                    <View className="flex-row flex-wrap mt-4">
                        {profile.relationship_goals.map((goal, idx) => {
                             const goalTheme = getTheme(goal);
                             return (
                                <View key={idx} className={`px-3 py-1 rounded-full mr-2 mb-2 border ${goalTheme.border} ${goalTheme.badge}`}>
                                    <Text className={`text-xs font-bold uppercase tracking-wide ${goalTheme.text}`}>{goal}</Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Social Links (Icons) */}
                {profile?.social_links && Object.keys(profile.social_links).length > 0 && (
                    <View className="flex-row mt-5 space-x-4">
                        {Object.entries(profile.social_links).map(([platform, handle]) => {
                            if (!handle) return null;
                            const iconConfig = getSocialIcon(platform);
                            return (
                                <TouchableOpacity 
                                    key={platform} 
                                    onPress={() => openLink(getSocialUrl(platform, handle))}
                                    className="bg-white p-3 rounded-full shadow-sm border border-gray-100 items-center justify-center"
                                    style={{ width: 44, height: 44 }}
                                >
                                    <IconSymbol name={iconConfig.name as any} size={20} color={iconConfig.color} />
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {/* Bio */}
                <Text className="mt-6 text-ink text-lg leading-7 font-medium opacity-90">
                    {profile?.bio || 'Add a bio to introduce yourself.'}
                </Text>

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

                {/* Gallery Grid */}
                <Text className="text-xl font-bold mt-6 mb-4 text-ink">Photos</Text>
                <View className="flex-row flex-wrap">
                    {profile?.photos?.map((photo, index) => (
                        <View key={index} className="w-1/3 aspect-[4/5] p-1">
                             <View className="w-full h-full rounded-xl overflow-hidden bg-gray-100 shadow-sm">
                                 <ProfileImage path={photo.url} style={{ width: '100%', height: '100%' }} />
                             </View>
                        </View>
                    ))}
                    {(!profile?.photos || profile.photos.length === 0) && (
                        <View className="w-full bg-gray-50 p-6 rounded-2xl items-center border border-dashed border-gray-300">
                             <Text className="text-gray-400 italic">No gallery photos added.</Text>
                        </View>
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
