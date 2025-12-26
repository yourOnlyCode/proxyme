import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Linking, Modal, RefreshControl, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
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
    friend_code?: string | null;
    referral_count?: number | null;
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<{ total: number, romance: number, friendship: number, business: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFriendCode, setShowFriendCode] = useState(false);
  const [highlightFriendCode, setHighlightFriendCode] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const router = useRouter();
  const highlightAnim = useRef(new Animated.Value(0)).current;

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
          // Check if we should highlight friend code (coming from referral popup)
          const checkHighlight = async () => {
            const shouldHighlight = await AsyncStorage.getItem('highlight_friend_code');
            if (shouldHighlight === 'true') {
              setShowFriendCode(true);
              setHighlightFriendCode(true);
              await AsyncStorage.removeItem('highlight_friend_code');
              // Stop highlighting after 3 seconds
              setTimeout(() => {
                setHighlightFriendCode(false);
              }, 3000);
            }
          };
          checkHighlight();
      }, [user])
  );

  // Animation for highlighting friend code
  useEffect(() => {
    if (highlightFriendCode) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(highlightAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(highlightAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [highlightFriendCode]);

  const handleViewFriendCode = () => {
    setShowFriendCode(true);
    setHighlightFriendCode(true);
    // Stop highlighting after 3 seconds
    setTimeout(() => {
      setHighlightFriendCode(false);
    }, 3000);
  };

  // Get share content with clickable links
  const getShareContent = () => {
    if (!profile?.friend_code) return null;
    
    // Proxyme app link - update with your actual app store links
    const appStoreLink = 'https://proxyme.app'; // Replace with actual app store link
    const appStoreLinkPlaceholder = 'www.proxyme.app'; // Placeholder link for messaging
    const deepLink = `proxybusiness://referral?code=${profile.friend_code}`; // Deep link using app scheme
    
    // Messaging-specific text with paragraph break and app store link
    const messagingText = `Find me and new friends on Proxyme! The proximity based app for connecting through common interests.\n\nRegister with my friend code: ${profile.friend_code} to get closer to verification!\n\n${appStoreLink}`;
    
    return {
      friendCode: profile.friend_code,
      appStoreLink,
      appStoreLinkPlaceholder,
      deepLink,
      shareText: `Join me on Proxyme! Use my friend code ${profile.friend_code} to unlock verification when you sign up.\n\nDownload: ${appStoreLink}\n\nOr open in app: ${deepLink}`,
      messagingText,
    };
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

  const handleShareToInstagramStory = async () => {
    const content = getShareContent();
    if (!content) return;
    
    try {
      // Copy friend code to clipboard
      await Clipboard.setStringAsync(content.friendCode);
      
      // Try Instagram Stories deep link with link sticker
      // Instagram Stories API allows adding link stickers via URL scheme
      // Format: instagram://story-camera?mediaType=PHOTO&stickerMediaId=...
      // However, for link stickers, we need to use the Creative Kit or try a different approach
      
      // Open Instagram Stories camera
      // Note: Instagram Stories link stickers require the Creative Kit API (needs Facebook App ID)
      // For now, we'll open the camera and copy the code - user can add link sticker manually
      const canOpen = await Linking.canOpenURL('instagram://story-camera');
      if (canOpen) {
        await Linking.openURL('instagram://story-camera');
        setShowShareOptions(false);
        // Show toast with instructions
        toast.show(`Friend code ${content.friendCode} copied! Paste it in your story, then tap the link sticker icon and add: ${content.appStoreLink}`, 'success');
      } else {
        // Instagram not installed, fallback to native share
        await Share.share({
          message: content.shareText,
          title: 'Join me on Proxyme!',
          url: content.appStoreLink,
        });
        setShowShareOptions(false);
        toast.show(`Friend code ${content.friendCode} copied to clipboard!`, 'success');
      }
    } catch (error) {
      console.error('Error sharing to Instagram Story:', error);
      // Still copy to clipboard even if Instagram fails
      try {
        await Clipboard.setStringAsync(content.friendCode);
        toast.show(`Friend code ${content.friendCode} copied to clipboard!`, 'success');
      } catch (clipError) {
        console.error('Error copying to clipboard:', clipError);
      }
      
      // Fallback to native share
      await Share.share({
        message: content.shareText,
        title: 'Join me on Proxyme!',
        url: content.appStoreLink,
      });
      setShowShareOptions(false);
    }
  };

  const handleShareToTikTokStory = async () => {
    const content = getShareContent();
    if (!content) return;
    
    try {
      // Try TikTok deep link
      const canOpen = await Linking.canOpenURL('tiktok://');
      if (canOpen) {
        // Open TikTok app
        await Linking.openURL('tiktok://');
        setShowShareOptions(false);
        // Show share dialog with content
        setTimeout(() => {
          Share.share({
            message: `My Proxyme friend code: ${content.friendCode}\n${content.appStoreLink}\n${content.deepLink}`,
            title: 'Proxyme Friend Code',
          });
        }, 1000);
      } else {
        // Fallback to native share
        await Share.share({
          message: content.shareText,
          title: 'Join me on Proxyme!',
          url: content.appStoreLink,
        });
        setShowShareOptions(false);
      }
    } catch (error) {
      console.error('Error sharing to TikTok:', error);
      await Share.share({
        message: content.shareText,
        title: 'Join me on Proxyme!',
        url: content.appStoreLink,
      });
      setShowShareOptions(false);
    }
  };

  const handleShareToMessaging = useCallback(async () => {
    const content = getShareContent();
    if (!content) return;
    
    try {
      // Use native share with messaging-specific text
      await Share.share({
        message: content.messagingText,
        title: 'Join me on Proxyme!',
        url: content.appStoreLink,
      });
      setShowShareOptions(false);
    } catch (error) {
      console.error('Error sharing to messaging:', error);
      setShowShareOptions(false);
    }
  }, [profile?.friend_code]);

  const handleShareToInstagramDM = async () => {
    const content = getShareContent();
    if (!content) return;
    
    try {
      // Try Instagram DM deep link
      const canOpen = await Linking.canOpenURL('instagram://direct-inbox');
      if (canOpen) {
        await Linking.openURL('instagram://direct-inbox');
        setShowShareOptions(false);
        // After opening, share the messaging text
        setTimeout(() => {
          Share.share({
            message: content.messagingText,
            title: 'Proxyme Friend Code',
            url: content.appStoreLink,
          });
        }, 1000);
      } else {
        // Fallback to native share with messaging text
        await Share.share({
          message: content.messagingText,
          title: 'Join me on Proxyme!',
          url: content.appStoreLink,
        });
        setShowShareOptions(false);
      }
    } catch (error) {
      console.error('Error sharing to Instagram DM:', error);
      await Share.share({
        message: content.messagingText,
        title: 'Join me on Proxyme!',
        url: content.appStoreLink,
      });
      setShowShareOptions(false);
    }
  };

  const handleShareToTikTokDM = async () => {
    const content = getShareContent();
    if (!content) return;
    
    try {
      // TikTok doesn't have a direct DM deep link, use native share with messaging text
      await Share.share({
        message: content.messagingText,
        title: 'Join me on Proxyme!',
        url: content.appStoreLink,
      });
      setShowShareOptions(false);
    } catch (error) {
      console.error('Error sharing to TikTok DM:', error);
      setShowShareOptions(false);
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

                {/* Friend Code Section - Only show if not verified */}
                {!profile?.is_verified && profile?.friend_code && (
                    <View className="mt-4">
                        {!showFriendCode ? (
                            <TouchableOpacity
                                onPress={handleViewFriendCode}
                                className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex-row items-center justify-between"
                            >
                                <View className="flex-row items-center flex-1">
                                    <IconSymbol name="gift.fill" size={18} color="#3B82F6" />
                                    <View className="ml-3">
                                        <Text className="text-gray-700 font-semibold text-sm">Friend Code: {profile.friend_code}</Text>
                                        <Text className="text-gray-500 text-xs mt-0.5">{profile.referral_count || 0}/10 referrals - unlock free verification!</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    onPress={() => setShowShareOptions(true)}
                                    className="bg-ink px-3 py-1.5 rounded-lg"
                                >
                                    <IconSymbol name="paperplane.fill" size={14} color="white" />
                                </TouchableOpacity>
                            </TouchableOpacity>
                        ) : (
                            <Animated.View
                                style={{
                                    transform: [
                                        {
                                            scale: highlightAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 1.02],
                                            }),
                                        },
                                    ],
                                    borderWidth: highlightAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [2, 4],
                                    }),
                                    borderColor: highlightAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['#3B82F6', '#10B981'],
                                    }),
                                }}
                                className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-xl border-2 border-blue-500 items-center shadow-lg"
                            >
                                <Text className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">Your Friend Code</Text>
                                <Text className="text-3xl font-bold text-ink tracking-wider mb-3">
                                    {profile.friend_code}
                                </Text>
                                <View className="flex-row gap-2 w-full">
                                    <TouchableOpacity
                                        onPress={handleCopyFriendCode}
                                        className="flex-1 bg-gray-200 py-2.5 rounded-xl items-center flex-row justify-center"
                                    >
                                        <IconSymbol name="square.and.arrow.up.fill" size={16} color="#6B7280" />
                                        <Text className="text-gray-700 font-bold ml-1.5 text-sm">Copy</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setShowShareOptions(true)}
                                        className="flex-1 bg-ink py-2.5 rounded-xl items-center flex-row justify-center"
                                    >
                                        <IconSymbol name="paperplane.fill" size={16} color="white" />
                                        <Text className="text-white font-bold ml-1.5 text-sm">Share</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setShowFriendCode(false)}
                                        className="px-3 py-2.5 bg-gray-100 rounded-xl items-center justify-center"
                                    >
                                        <IconSymbol name="eye.slash.fill" size={16} color="#6B7280" />
                                    </TouchableOpacity>
                                </View>
                                <Text className="text-xs text-gray-500 mt-2 text-center">
                                    {profile.referral_count || 0}/10 referrals - verification unlocks at 10
                                </Text>
                            </Animated.View>
                        )}
                    </View>
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
                        <Text className="text-2xl font-bold text-ink">Share Friend Code</Text>
                        <Text className="text-sm text-gray-500 mt-1">Choose how you'd like to share</Text>
                    </View>

                    <View className="gap-3">
                        {/* Messaging */}
                        <TouchableOpacity
                            onPress={handleShareToMessaging}
                            className="bg-blue-500 py-4 rounded-xl flex-row items-center justify-center"
                        >
                            <IconSymbol name="message.fill" size={20} color="white" />
                            <Text className="text-white font-semibold ml-2">Messaging</Text>
                        </TouchableOpacity>

                        {/* Instagram Story */}
                        <TouchableOpacity
                            onPress={handleShareToInstagramStory}
                            className="bg-gradient-to-r from-pink-500 to-purple-500 py-4 rounded-xl flex-row items-center justify-center"
                        >
                            <IconSymbol name="photo.fill" size={20} color="white" />
                            <Text className="text-white font-semibold ml-2">Instagram Story</Text>
                        </TouchableOpacity>

                        {/* TikTok Story */}
                        <TouchableOpacity
                            onPress={handleShareToTikTokStory}
                            className="bg-black py-4 rounded-xl flex-row items-center justify-center"
                        >
                            <IconSymbol name="photo.fill" size={20} color="white" />
                            <Text className="text-white font-semibold ml-2">TikTok Story</Text>
                        </TouchableOpacity>

                        {/* Instagram DM */}
                        <TouchableOpacity
                            onPress={handleShareToInstagramDM}
                            className="bg-pink-500 py-4 rounded-xl flex-row items-center justify-center"
                        >
                            <IconSymbol name="message.fill" size={20} color="white" />
                            <Text className="text-white font-semibold ml-2">Instagram DM</Text>
                        </TouchableOpacity>

                        {/* TikTok DM */}
                        <TouchableOpacity
                            onPress={handleShareToTikTokDM}
                            className="bg-gray-800 py-4 rounded-xl flex-row items-center justify-center"
                        >
                            <IconSymbol name="message.fill" size={20} color="white" />
                            <Text className="text-white font-semibold ml-2">TikTok DM</Text>
                        </TouchableOpacity>

                        {/* General Share */}
                        <TouchableOpacity
                            onPress={handleShareFriendCode}
                            className="bg-ink py-4 rounded-xl flex-row items-center justify-center"
                        >
                            <IconSymbol name="square.and.arrow.up.fill" size={20} color="white" />
                            <Text className="text-white font-semibold ml-2">Other Apps</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        onPress={() => setShowShareOptions(false)}
                        className="mt-4 py-3 rounded-xl border border-gray-300 items-center"
                    >
                        <Text className="text-gray-700 font-semibold">Cancel</Text>
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
  
    if (!url) return <View style={style} className="bg-gray-200 animate-pulse" />;
  
    return (
      <Image source={{ uri: url }} style={style} resizeMode="cover" />
    );
}
