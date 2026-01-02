import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Image, Linking, Modal, RefreshControl, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { getReferralShareContent } from '../../lib/referral';
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
    friend_code?: string | null;
    referral_count?: number | null;
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<{ total: number, romance: number, friendship: number, business: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const router = useRouter();

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
        .from('profiles')
        .select(`username, full_name, bio, avatar_url, detailed_interests, relationship_goals, social_links, is_verified, friend_code, referral_count`)
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


  // Get share content with clickable links - using centralized function
  const getShareContent = () => {
    return getReferralShareContent(profile?.friend_code || null);
  };

  const handleCopyFriendCode = async () => {
    if (!profile?.friend_code) return;
    
    try {
      await Clipboard.setStringAsync(profile.friend_code);
      toast.show(`Friend code ${profile.friend_code} copied to clipboard!`, 'success');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast.show('Failed to copy friend code', 'error');
    }
  };

  const handleShareFriendCode = async () => {
    const content = getShareContent();
    if (!content) return;
    
    try {
      await Share.share({
        message: content.shareText,
        title: 'Join me on Proxyme!',
        url: content.appStoreLink, // iOS will use this for better sharing
      });
      setShowShareOptions(false);
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };


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
          default: return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', badge: 'bg-slate-200', icon: '#718096' };
      }
  };

  if (!profile && loading) return <View className="flex-1 bg-slate-50" />;

  const primaryGoal = profile?.relationship_goals?.[0];
  const theme = getTheme(primaryGoal);

  return (
    <View className="flex-1 bg-slate-50">
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
                    className="absolute top-12 right-4 bg-paper/90 p-2 rounded-full shadow-sm backdrop-blur-md"
                    onPress={() => router.push('/(settings)/edit-profile')}
                >
                     <IconSymbol name="gear" size={24} color="#2D3748" />
                </TouchableOpacity>
            </View>

            {/* Profile Info */}
            <View className="px-5 -mt-16">
                <View 
                  className="rounded-full w-36 h-36 overflow-hidden bg-white shadow-md"
                  style={{
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                >
                     <ProfileImage path={profile?.avatar_url || null} style={{ width: '100%', height: '100%' }} />
                </View>
                
                <View className="mt-4">
                    <View className="flex-row items-center flex-wrap">
                        <Text className="text-3xl font-extrabold text-slate-900 mr-2">{profile?.full_name || 'No Name'}</Text>
                        {profile?.is_verified && (
                            <IconSymbol name="checkmark.seal.fill" size={24} color="#3B82F6" />
                        )}
                    </View>
                    <View className="flex-row items-center mt-1 flex-wrap">
                        <Text className={`text-base font-semibold ${theme.text} opacity-80`}>@{profile?.username || 'username'}</Text>
                        {stats && stats.total > 0 && (
                            <>
                                <Text className={`text-base font-semibold ${theme.text} opacity-60 mx-2`}>•</Text>
                                <Text className={`text-base font-semibold ${theme.text} opacity-80`}>
                                    {stats.total} {stats.total === 1 ? 'connection' : 'connections'}
                                </Text>
                            </>
                        )}
                    </View>
                </View>

                {/* Friend Code Section - Only show if not verified */}
                {!profile?.is_verified && profile?.friend_code && (
                    <View 
                      className="mt-4 bg-slate-50 p-2 rounded-lg flex-row items-center justify-between"
                      style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.04,
                        shadowRadius: 3,
                        elevation: 1,
                      }}
                    >
                        <View className="flex-row items-center flex-1">
                            <IconSymbol name="gift.fill" size={14} color="#3B82F6" />
                            <Text className="text-slate-700 font-semibold text-xs ml-2">Friend Code: {profile.friend_code}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setShowShareOptions(true)}
                            className="bg-ink px-2 py-1 rounded"
                        >
                            <IconSymbol name="paperplane.fill" size={12} color="white" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Relationship Goals with Intent Label */}
                {profile?.relationship_goals && profile.relationship_goals.length > 0 && (
                    <View className="mt-6">
                        <View className="flex-row items-center mb-2">
                            <Text className="text-sm font-bold text-gray-400 uppercase tracking-wider mr-2">Intent</Text>
                        </View>
                        <View className="flex-row flex-wrap">
                            {profile.relationship_goals.map((goal, idx) => {
                                const badgeColors = getTheme(goal);
                                return (
                                    <View key={idx} className={`px-4 py-2 rounded-full mr-2 mb-2 ${badgeColors.badge}`}>
                                        <Text className={`${badgeColors.text} font-bold`}>{goal}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Bio */}
                {profile?.bio && (
                    <Text className="mt-6 text-slate-900 text-lg leading-7 font-medium opacity-90">
                        {profile.bio}
                    </Text>
                )}

                {/* Detailed Interests - Now More Prominent */}
                <View className="mt-8">
                    <Text className="text-2xl font-bold mb-4 text-slate-900">Interests</Text>
                    {profile?.detailed_interests && Object.keys(profile.detailed_interests).length > 0 ? (
                        Object.entries(profile.detailed_interests).map(([category, items]) => (
                            <View 
                              key={category} 
                              className="mb-4 bg-white p-4 rounded-2xl shadow-sm"
                              style={{
                                borderWidth: 1,
                                borderColor: 'rgba(148, 163, 184, 0.2)', // Glass morphism border
                              }}
                            >
                                <Text className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">{category}</Text>
                                <View className="flex-row flex-wrap">
                                    {items && items.length > 0 ? (
                                        items.map((item, idx) => (
                                            <View 
                                              key={idx} 
                                              className={`px-3 py-1.5 rounded-lg mr-2 mb-2 ${theme.bg}`}
                                              style={{
                                                shadowColor: '#000',
                                                shadowOffset: { width: 0, height: 1 },
                                                shadowOpacity: 0.03,
                                                shadowRadius: 2,
                                                elevation: 1,
                                              }}
                                            >
                                                <Text className={`font-semibold text-sm ${theme.text}`}>{item}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <Text className="text-slate-400 italic text-sm">General Interest</Text>
                                    )}
                                </View>
                            </View>
                        ))
                    ) : (
                        <View 
                          className="bg-slate-50 p-6 rounded-2xl items-center"
                          style={{
                            borderWidth: 1,
                            borderStyle: 'dashed',
                            borderColor: 'rgba(148, 163, 184, 0.3)',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.03,
                            shadowRadius: 2,
                            elevation: 1,
                          }}
                        >
                             <Text className="text-slate-400 italic">No interests added yet.</Text>
                        </View>
                    )}
                </View>

                {/* Photos Gallery - Moved to Bottom with Larger Thumbnails */}
                {profile?.photos && profile.photos.length > 0 && (
                    <View className="mt-8">
                        <Text className="text-2xl font-bold mb-4 text-slate-900">Photos</Text>
                        <ScrollView 
                            horizontal 
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingRight: 20 }}
                        >
                            {profile.photos.map((p, i) => (
                                <View 
                                  key={i} 
                                  className="mr-4 rounded-2xl overflow-hidden shadow-md bg-slate-100"
                                  style={{
                                    width: 200,
                                    height: 250,
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 8,
                                    elevation: 4,
                                  }}
                                >
                                    <ProfileImage path={p.url} style={{ width: '100%', height: '100%' }} />
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Sign Out Button */}
                <TouchableOpacity 
                    onPress={() => signOut()} 
                    className="mt-8 mb-8 bg-slate-100 py-4 rounded-2xl items-center"
                >
                    <Text className="text-red-500 font-bold text-lg">Sign Out</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>

        {/* Share Options Modal */}
        <Modal
            visible={showShareOptions}
            transparent
            animationType="slide"
            onRequestClose={() => setShowShareOptions(false)}
        >
            <View className="flex-1 bg-black/60 items-end justify-end">
                <View className="bg-white rounded-t-3xl w-full p-6 pb-8">
                    <View className="items-center mb-6">
                        <View className="w-12 h-1 bg-gray-300 rounded-full mb-4" />
                        <Text className="text-2xl font-bold text-slate-900">Share Friend Code</Text>
                    </View>

                    <TouchableOpacity
                        onPress={handleShareFriendCode}
                        className="bg-blue-600 py-4 rounded-xl flex-row items-center justify-center mb-4"
                    >
                        <IconSymbol name="square.and.arrow.up.fill" size={20} color="white" />
                        <Text className="text-white font-semibold ml-2 text-lg">Share</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setShowShareOptions(false)}
                        className="mt-4 py-3 rounded-xl items-center"
                    >
                        <Text className="text-slate-700 font-semibold">Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
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
  
    if (!url) return <View style={style} className="bg-slate-200 animate-pulse" />;
  
    return (
      <Image source={{ uri: url }} style={style} resizeMode="cover" />
    );
}
