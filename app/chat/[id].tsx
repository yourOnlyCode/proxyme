import { KeyboardDismissWrapper } from '@/components/KeyboardDismissButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ProfileData, ProfileModal } from '../../components/ProfileModal';
import { useAuth } from '../../lib/auth';
import { getUserConnectionsList } from '../../lib/connections';
import { supabase } from '../../lib/supabase';

type Message = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read?: boolean;
  read_at?: string | null;
};

type ShareMode = 'root' | 'social' | 'club' | 'connection' | 'event';

type ShareClub = { id: string; name: string; city: string; image_url: string | null; join_policy: 'invite_only' | 'request_to_join' };
type ShareConnection = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; is_verified: boolean | null };
type ShareEvent = { id: string; title: string; event_date: string; club_id: string; club_name: string; is_public: boolean; image_url: string | null };

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<ProfileData | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [userSocialLinks, setUserSocialLinks] = useState<Record<string, string>>({});
  const [shareMode, setShareMode] = useState<ShareMode>('root');
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareClubs, setShareClubs] = useState<ShareClub[]>([]);
  const [shareConnections, setShareConnections] = useState<ShareConnection[]>([]);
  const [shareEvents, setShareEvents] = useState<ShareEvent[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (id && user) {
        fetchMessages();
        fetchPartnerInfo();
        fetchUserSocialLinks();
        markMessagesAsRead(); // Mark messages as read when chat opens

        const channel = supabase
            .channel(`chat:${id}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages',
                filter: `conversation_id=eq.${id}`
            }, (payload) => {
                const newMessage = payload.new as Message;
                setMessages(prev => [...prev, newMessage]);
                setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
                // Mark new message as read if it's from the other person
                if (newMessage.sender_id !== user.id) {
                    markMessageAsRead(newMessage.id);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
  }, [id, user]);

  // Animate popup slide
  useEffect(() => {
    if (shareSheetVisible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [shareSheetVisible]);

  // Mark all unread messages in this conversation as read
  async function markMessagesAsRead() {
    if (!id || !user) return;
    
    const { error } = await supabase
      .from('messages')
      .update({ 
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('conversation_id', id)
      .eq('read', false)
      .neq('sender_id', user.id); // Only mark messages from the other person as read

    if (error) {
      console.error('Error marking messages as read:', error);
    } else {
      // Update local state to reflect read status
      setMessages(prev => prev.map(msg => 
        msg.sender_id !== user.id && !msg.read 
          ? { ...msg, read: true, read_at: new Date().toISOString() }
          : msg
      ));
    }
  }

  // Mark a single message as read
  async function markMessageAsRead(messageId: string) {
    if (!user) return;
    
    const { error } = await supabase
      .from('messages')
      .update({ 
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', messageId)
      .neq('sender_id', user.id);

    if (!error) {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, read: true, read_at: new Date().toISOString() }
          : msg
      ));
    }
  }

  async function fetchPartnerInfo() {
      const { data: interest } = await supabase
        .from('interests')
        .select('sender_id, receiver_id')
        .eq('id', id)
        .single();
      
      if (interest) {
          const partnerId = interest.sender_id === user?.id ? interest.receiver_id : interest.sender_id;
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, full_name, bio, avatar_url, detailed_interests, relationship_goals, is_verified, city, state, social_links, status_text, status_image_url, status_created_at')
            .eq('id', partnerId)
            .single();
          
          if (profile) {
              setPartner({
                  ...profile,
                  has_sent_interest: true, // We are chatting, so we must be connected
                  has_received_interest: true
              } as ProfileData);
          }
      }
  }

  async function fetchUserSocialLinks() {
    if (!user) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('social_links')
      .eq('id', user.id)
      .single();
    
    if (data && data.social_links) {
      setUserSocialLinks(data.social_links as Record<string, string>);
    }
  }

  async function fetchMessages() {
    setLoading(true);
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, content, created_at, read, read_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (data) setMessages(data);
    setLoading(false);
  }

  async function sendMessage() {
    if (!newMessage.trim() || !user) return;

    const { error } = await supabase
      .from('messages')
      .insert({
          conversation_id: id,
          sender_id: user.id,
          content: newMessage.trim()
      });

    if (error) {
        Alert.alert('Error', error.message);
    } else {
        setNewMessage('');
    }
  }

  const safePart = (v: any) => String(v ?? '').replaceAll('|', ' ').replaceAll('\n', ' ').trim();

  async function sendRawMessage(content: string) {
    if (!user) return;
    const { error } = await supabase.from('messages').insert({
      conversation_id: id,
      sender_id: user.id,
      content,
    });
    if (error) Alert.alert('Error', error.message);
  }

  async function fetchShareClubs() {
    if (!user) return;
    setShareLoading(true);
    try {
      const { data, error } = await supabase
        .from('club_members')
        .select('club:clubs(id, name, city, image_url, join_policy), status')
        .eq('user_id', user.id)
        .eq('status', 'accepted');
      if (error) throw error;

      const clubs: ShareClub[] = ((data as any[]) || [])
        .map((row) => row.club)
        .filter(Boolean)
        .filter((c: any) => c.join_policy !== 'invite_only')
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          city: c.city,
          image_url: c.image_url ?? null,
          join_policy: c.join_policy,
        }));
      setShareClubs(clubs);
    } catch {
      setShareClubs([]);
    } finally {
      setShareLoading(false);
    }
  }

  async function fetchShareConnections() {
    if (!user) return;
    setShareLoading(true);
    try {
      const connections = await getUserConnectionsList({ targetUserId: user.id });
      setShareConnections(
        (connections || []).map((c) => ({
          id: c.id,
          username: c.username,
          full_name: c.full_name,
          avatar_url: c.avatar_url,
          is_verified: c.is_verified,
        })),
      );
    } catch {
      setShareConnections([]);
    } finally {
      setShareLoading(false);
    }
  }

  async function fetchShareEvents() {
    if (!user) return;
    setShareLoading(true);
    try {
      const { data: memberships, error: memErr } = await supabase
        .from('club_members')
        .select('club_id, status')
        .eq('user_id', user.id)
        .eq('status', 'accepted');
      if (memErr) throw memErr;

      const clubIds = Array.from(new Set(((memberships as any[]) || []).map((m: any) => m.club_id).filter(Boolean)));
      if (clubIds.length === 0) {
        setShareEvents([]);
        return;
      }

      const nowIso = new Date().toISOString();
      const { data: events, error: evErr } = await supabase
        .from('club_events')
        .select('id, title, event_date, club_id, is_public, image_url, club:clubs(id, name, join_policy), is_cancelled')
        .in('club_id', clubIds)
        .eq('is_cancelled', false as any)
        .gt('event_date', nowIso)
        .order('event_date', { ascending: true })
        .limit(50);
      if (evErr) throw evErr;

      const list: ShareEvent[] = ((events as any[]) || [])
        .filter((e) => !!e.club)
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          event_date: e.event_date,
          club_id: e.club_id,
          club_name: e.club?.name || 'Club',
          is_public: !!e.is_public,
          image_url: e.image_url ?? null,
        }));
      setShareEvents(list);
    } catch {
      setShareEvents([]);
    } finally {
      setShareLoading(false);
    }
  }

  async function shareClubToChat(club: ShareClub) {
    await sendRawMessage(`SHARE_CLUB|${safePart(club.id)}|${safePart(club.name)}|${safePart(club.city)}|${safePart(club.image_url)}`);
    setShareSheetVisible(false);
    setShareMode('root');
  }

  async function shareConnectionToChat(c: ShareConnection) {
    await sendRawMessage(`SHARE_CONNECTION|${safePart(c.id)}|${safePart(c.full_name)}|${safePart(c.username)}|${safePart(c.avatar_url)}|${safePart(c.is_verified)}`);
    setShareSheetVisible(false);
    setShareMode('root');
  }

  async function shareEventToChat(e: ShareEvent) {
    await sendRawMessage(
      `SHARE_EVENT|${safePart(e.id)}|${safePart(e.title)}|${safePart(e.event_date)}|${safePart(e.club_id)}|${safePart(e.club_name)}|${safePart(e.is_public)}|${safePart(e.image_url)}`,
    );
    setShareSheetVisible(false);
    setShareMode('root');
  }

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
          case 'instagram': return { lib: FontAwesome, icon: 'instagram', color: '#E1306C' };
          case 'tiktok': return { lib: FontAwesome5, icon: 'tiktok', color: '#000000' };
          case 'facebook': return { lib: FontAwesome, icon: 'facebook-square', color: '#1877F2' };
          case 'linkedin': return { lib: FontAwesome, icon: 'linkedin-square', color: '#0077B5' };
          case 'x': return { lib: FontAwesome, icon: 'twitter', color: '#1DA1F2' };
          default: return { lib: IconSymbol, icon: 'link', color: '#718096' };
      }
  };

  const getSocialPlatformName = (platform: string) => {
    switch (platform) {
      case 'instagram': return 'Instagram';
      case 'tiktok': return 'TikTok';
      case 'facebook': return 'Facebook';
      case 'linkedin': return 'LinkedIn';
      case 'x': return 'X (Twitter)';
      default: return platform;
    }
  };

  const handleShareSocialLink = async (platform: string, handle: string) => {
    if (!user || !id) return;
    
    const url = getSocialUrl(platform, handle);
    const platformName = getSocialPlatformName(platform);
    const iconConfig = getSocialIcon(platform);
    
    // Send a special formatted message for social links
    // Format: SOCIAL_LINK|platform|url|platformName|iconName|iconLib
    // Using | as separator since URLs can contain colons
    const iconLibName = iconConfig.lib === FontAwesome ? 'FontAwesome' : iconConfig.lib === FontAwesome5 ? 'FontAwesome5' : 'IconSymbol';
    const socialLinkMessage = `SOCIAL_LINK|${platform}|${url}|${platformName}|${iconConfig.icon}|${iconLibName}`;
    
    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: id,
        sender_id: user.id,
        content: socialLinkMessage
      });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setShareSheetVisible(false);
      setShareMode('root');
    }
  };

  return (
    <KeyboardDismissWrapper>
      <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 bg-white"
      >
      <ProfileModal 
         visible={modalVisible}
         profile={selectedProfile}
         onClose={() => {
           setModalVisible(false);
           setSelectedProfile(null);
         }}
         onStateChange={() => {
             // Refresh if needed
         }}
      />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 border-b border-gray-100 flex-row items-center bg-white shadow-sm z-10">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
              <IconSymbol name="chevron.left" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          
          {partner && (
             <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedProfile(partner);
                  setModalVisible(true);
                }}
                className="flex-1 flex-row justify-between items-center"
             >
                 <View className="flex-row items-center">
                    <View className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden mr-3">
                        <ChatAvatar path={partner.avatar_url} />
                    </View>
                    <View>
                        <Text className="font-bold text-lg text-ink">{partner.full_name}</Text>
                        
                        {/* Social Links Mini-Bar with Icons */}
                        {partner.social_links && Object.keys(partner.social_links).length > 0 && (
                            <View className="flex-row mt-1 space-x-2">
                                {Object.entries(partner.social_links).map(([platform, handle]) => {
                                    if (!handle) return null;
                                    const iconConfig = getSocialIcon(platform);
                                    const IconComponent = iconConfig.lib;
                                    return (
                                        <TouchableOpacity 
                                            key={platform} 
                                            onPress={() => openLink(getSocialUrl(platform, handle as string))}
                                            className="bg-gray-50 p-1.5 rounded-full border border-gray-100"
                                        >
                                            {IconComponent === IconSymbol ? (
                                                <IconSymbol name={iconConfig.icon as any} size={12} color={iconConfig.color} />
                                            ) : (
                                                <IconComponent name={iconConfig.icon as any} size={12} color={iconConfig.color} />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                 </View>
             </TouchableOpacity>
          )}
      </View>

      <ScrollView 
        ref={scrollViewRef}
        className="flex-1 px-4 bg-white"
        contentContainerStyle={{ paddingVertical: 20 }}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            const isSocialLink = msg.content.startsWith('SOCIAL_LINK|');
            const isShareClub = msg.content.startsWith('SHARE_CLUB|');
            const isShareConnection = msg.content.startsWith('SHARE_CONNECTION|');
            const isShareEvent = msg.content.startsWith('SHARE_EVENT|');
            
            if (isSocialLink) {
              // Parse social link message
              // Format: SOCIAL_LINK|platform|url|platformName|iconName|iconLib
              const parts = msg.content.split('|');
              if (parts.length >= 6) {
                const [, platform, url, platformName, iconName, iconLibName] = parts;
                const iconConfig = getSocialIcon(platform);
                
                // Determine which icon library to use
                let IconComponent;
                if (iconLibName === 'FontAwesome') {
                  IconComponent = FontAwesome;
                } else if (iconLibName === 'FontAwesome5') {
                  IconComponent = FontAwesome5;
                } else {
                  IconComponent = IconSymbol;
                }
                
                // Platform-specific gradient colors and styling
                const getPlatformGradient = (platform: string) => {
                  switch (platform) {
                    case 'instagram':
                      // Instagram: purple/pink to orange gradient (diagonal)
                      return { 
                        colors: ['#833AB4', '#FD1D1D', '#FCB045'],
                        start: { x: 0, y: 0 },
                        end: { x: 1, y: 1 }
                      };
                    case 'tiktok':
                      // TikTok: cyan to pink gradient
                      return { 
                        colors: ['#25F4EE', '#FE2C55'],
                        start: { x: 0, y: 0 },
                        end: { x: 1, y: 1 }
                      };
                    case 'facebook':
                      return { 
                        colors: ['#1877F2', '#1877F2'],
                        start: { x: 0, y: 0 },
                        end: { x: 1, y: 0 }
                      };
                    case 'linkedin':
                      return { 
                        colors: ['#0077B5', '#0077B5'],
                        start: { x: 0, y: 0 },
                        end: { x: 1, y: 0 }
                      };
                    case 'x':
                      return { 
                        colors: ['#000000', '#000000'],
                        start: { x: 0, y: 0 },
                        end: { x: 1, y: 0 }
                      };
                    default:
                      return { 
                        colors: [iconConfig.color, iconConfig.color],
                        start: { x: 0, y: 0 },
                        end: { x: 1, y: 0 }
                      };
                  }
                };
                
                const gradientConfig = getPlatformGradient(platform);
                const isGradient = gradientConfig.colors.length > 2 || (gradientConfig.colors.length === 2 && gradientConfig.colors[0] !== gradientConfig.colors[1]);
                
                return (
                  <View 
                    key={msg.id} 
                    className={`mb-4 max-w-[80%] ${isMe ? 'self-end' : 'self-start'}`}
                  >
                    <TouchableOpacity
                      onPress={() => Linking.openURL(url).catch(err => console.error("Couldn't open link", err))}
                      activeOpacity={0.8}
                      style={{
                        borderRadius: 16,
                        overflow: 'hidden',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 8,
                        elevation: 4,
                      }}
                    >
                      {isGradient ? (
                        <LinearGradient
                          colors={gradientConfig.colors as any}
                          start={gradientConfig.start}
                          end={gradientConfig.end}
                          style={{
                            padding: 16,
                          }}
                        >
                          <View className="flex-row items-center">
                            <View
                              className="w-10 h-10 rounded-full items-center justify-center mr-3"
                              style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)' }}
                            >
                              {IconComponent === IconSymbol ? (
                                <IconSymbol 
                                  name={iconName as any} 
                                  size={20} 
                                  color="white"
                                />
                              ) : (
                                <IconComponent 
                                  name={iconName as any} 
                                  size={20} 
                                  color="white"
                                />
                              )}
                            </View>
                            <View className="flex-1">
                              <Text className="font-semibold text-white">
                                {platformName}
                              </Text>
                              <Text className="text-sm mt-0.5 text-white/90" numberOfLines={1}>
                                Tap to open profile
                              </Text>
                            </View>
                            <IconSymbol 
                              name="arrow.up.right" 
                              size={16} 
                              color="white"
                            />
                          </View>
                        </LinearGradient>
                      ) : (
                        <View
                          style={{
                            backgroundColor: gradientConfig.colors[0],
                            padding: 16,
                          }}
                        >
                          <View className="flex-row items-center">
                            <View
                              className="w-10 h-10 rounded-full items-center justify-center mr-3"
                              style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)' }}
                            >
                              {IconComponent === IconSymbol ? (
                                <IconSymbol 
                                  name={iconName as any} 
                                  size={20} 
                                  color="white"
                                />
                              ) : (
                                <IconComponent 
                                  name={iconName as any} 
                                  size={20} 
                                  color="white"
                                />
                              )}
                            </View>
                            <View className="flex-1">
                              <Text className="font-semibold text-white">
                                {platformName}
                              </Text>
                              <Text className="text-sm mt-0.5 text-white/90" numberOfLines={1}>
                                Tap to open profile
                              </Text>
                            </View>
                            <IconSymbol 
                              name="arrow.up.right" 
                              size={16} 
                              color="white"
                            />
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }
            }

            if (isShareClub) {
              // Format: SHARE_CLUB|clubId|clubName|city|imageUrl
              const parts = msg.content.split('|');
              const [, clubId, clubName, city] = parts;
              return (
                <View
                  key={msg.id}
                  className={`mb-4 ${isMe ? 'self-end' : 'self-start'}`}
                  style={{ width: '86%', maxWidth: 280, minWidth: 200 }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => router.push(`/clubs/${clubId}`)}
                    style={{
                      borderRadius: 16,
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.25)',
                      backgroundColor: isMe ? '#2962FF' : '#FFFFFF',
                    }}
                  >
                    <View style={{ padding: 14 }}>
                      <View className="flex-row items-center">
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center mr-3"
                          style={{ backgroundColor: isMe ? 'rgba(255,255,255,0.20)' : 'rgba(37,99,235,0.10)' }}
                        >
                          <IconSymbol name="person.3.fill" size={18} color={isMe ? 'white' : '#2563EB'} />
                        </View>
                        <View className="flex-1">
                          <Text className={`font-bold ${isMe ? 'text-white' : 'text-ink'}`} numberOfLines={2}>
                            {clubName || 'Club'}
                          </Text>
                          <Text className={`text-xs mt-0.5 ${isMe ? 'text-white/90' : 'text-gray-500'}`} numberOfLines={2}>
                            {city ? `${city} • Tap to view` : 'Tap to view'}
                          </Text>
                        </View>
                        <IconSymbol name="chevron.right" size={18} color={isMe ? 'white' : '#94A3B8'} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }

            if (isShareEvent) {
              // Format: SHARE_EVENT|eventId|title|eventDate|clubId|clubName|isPublic|imageUrl
              const parts = msg.content.split('|');
              const [, eventId, title, eventDate, _clubId, clubName] = parts;
              const when = eventDate ? new Date(eventDate).toLocaleString() : '';
              return (
                <View
                  key={msg.id}
                  className={`mb-4 ${isMe ? 'self-end' : 'self-start'}`}
                  style={{ width: '86%', maxWidth: 280, minWidth: 200 }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => router.push(`/events/${eventId}`)}
                    style={{
                      borderRadius: 16,
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.25)',
                      backgroundColor: isMe ? '#0F172A' : '#FFFFFF',
                    }}
                  >
                    <View style={{ padding: 14 }}>
                      <View className="flex-row items-center">
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center mr-3"
                          style={{ backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)' }}
                        >
                          <IconSymbol name="calendar" size={18} color={isMe ? 'white' : '#0F172A'} />
                        </View>
                        <View className="flex-1">
                          <Text className={`font-bold ${isMe ? 'text-white' : 'text-ink'}`} numberOfLines={2}>
                            {title || 'Event'}
                          </Text>
                          <Text className={`text-xs mt-0.5 ${isMe ? 'text-white/90' : 'text-gray-500'}`} numberOfLines={2}>
                            {clubName ? `${clubName} • ${when}` : when}
                          </Text>
                        </View>
                        <IconSymbol name="chevron.right" size={18} color={isMe ? 'white' : '#94A3B8'} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }

            if (isShareConnection) {
              // Format: SHARE_CONNECTION|userId|fullName|username|avatarUrl|isVerified
              const parts = msg.content.split('|');
              const [, sharedUserId, fullName, username, avatarUrl, isVerified] = parts;
              const label = fullName || (username ? `@${username}` : 'Connection');
              const verified = isVerified === 'true';
              return (
                <View
                  key={msg.id}
                  className={`mb-4 ${isMe ? 'self-end' : 'self-start'}`}
                  style={{ width: '86%', maxWidth: 280, minWidth: 200 }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={async () => {
                      try {
                        const { data } = await supabase
                          .from('profiles')
                          .select('id, username, full_name, bio, avatar_url, detailed_interests, relationship_goals, is_verified, city, state, social_links, status_text, status_image_url, status_created_at')
                          .eq('id', sharedUserId)
                          .maybeSingle();
                        if (data) {
                          // Show the shared profile in the ProfileModal
                          setSelectedProfile(data as any);
                          setModalVisible(true);
                        }
                      } catch {
                        // ignore
                      }
                    }}
                    style={{
                      borderRadius: 16,
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.25)',
                      backgroundColor: isMe ? '#111827' : '#FFFFFF',
                    }}
                  >
                    <View style={{ padding: 14 }}>
                      <View className="flex-row items-center">
                        <View className="w-10 h-10 rounded-full overflow-hidden mr-3 bg-gray-200">
                          {avatarUrl ? (
                            <ChatAvatar path={avatarUrl} />
                          ) : (
                            <View className="w-full h-full items-center justify-center">
                              <IconSymbol name="person.fill" size={18} color="#9CA3AF" />
                            </View>
                          )}
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center">
                            <Text className={`font-bold ${isMe ? 'text-white' : 'text-ink'}`} numberOfLines={2}>
                              {label}
                            </Text>
                            {verified && <IconSymbol name="checkmark.seal.fill" size={14} color={isMe ? '#93C5FD' : '#3B82F6'} style={{ marginLeft: 6 }} />}
                          </View>
                          <Text className={`text-xs mt-0.5 ${isMe ? 'text-white/90' : 'text-gray-500'}`} numberOfLines={2}>
                            Tap to view profile
                          </Text>
                        </View>
                        <IconSymbol name="chevron.right" size={18} color={isMe ? 'white' : '#94A3B8'} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }
            
            return (
                <View 
                    key={msg.id} 
                    className={`mb-4 max-w-[80%] p-3 rounded-2xl ${
                        isMe ? 'bg-business self-end rounded-br-none shadow-sm' : 'bg-gray-100 self-start rounded-bl-none'
                    }`}
                >
                    <Text className={isMe ? 'text-white font-medium' : 'text-ink'}>{msg.content}</Text>
                </View>
            );
        })}
      </ScrollView>

      <View className="p-4 border-t border-gray-100 pb-8 bg-white">
          <View className="flex-row items-center bg-gray-50 rounded-full px-4 border border-gray-200">
              <TouchableOpacity 
                onPress={() => {
                  setShareMode('root');
                  setShareSheetVisible(true);
                }}
                className="mr-2"
              >
                  <IconSymbol 
                    name="plus.circle.fill" 
                    size={24} 
                    color="#2962FF"
                  />
              </TouchableOpacity>
              <TextInput
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder="Type a message..."
                  placeholderTextColor="#6b7280"
                  className="flex-1 py-3 text-base text-ink"
                  returnKeyType="send"
                  onSubmitEditing={sendMessage}
                  blurOnSubmit={false}
                  onFocus={(e) => {
                    if (Platform.OS === 'web') {
                      e.stopPropagation();
                    }
                  }}
              />
              <TouchableOpacity onPress={sendMessage} disabled={!newMessage.trim()}>
                  <Text className={`font-bold ${newMessage.trim() ? 'text-business' : 'text-gray-400'}`}>Send</Text>
              </TouchableOpacity>
          </View>
      </View>

      {/* Share Sheet (+) */}
      <Modal
        visible={shareSheetVisible}
        transparent
        animationType="none"
        onRequestClose={() => {
          setShareSheetVisible(false);
          setShareMode('root');
        }}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50"
          activeOpacity={1}
          onPress={() => {
            setShareSheetVisible(false);
            setShareMode('root');
          }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'white',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: Platform.OS === 'ios' ? 40 : 20,
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [300, 0],
                  }),
                },
              ],
            }}
          >
            <TouchableOpacity activeOpacity={1}>
              {/* Handle bar */}
              <View className="items-center pt-3 pb-2">
                <View className="w-12 h-1.5 bg-gray-300 rounded-full" />
              </View>

              {/* Header */}
              <View className="px-4 pb-4 border-b border-gray-100 flex-row items-center">
                {shareMode !== 'root' && (
                  <TouchableOpacity onPress={() => setShareMode('root')} className="mr-3 p-2 -ml-2">
                    <IconSymbol name="chevron.left" size={18} color="#111827" />
                  </TouchableOpacity>
                )}
                <View className="flex-1">
                  <Text className="text-lg font-bold text-ink">
                    {shareMode === 'root'
                      ? 'Share'
                      : shareMode === 'social'
                        ? 'Share Social Media'
                        : shareMode === 'club'
                          ? 'Share a Club'
                          : shareMode === 'connection'
                            ? 'Share a Connection'
                            : 'Share an Event'}
                  </Text>
                  <Text className="text-sm text-gray-500 mt-1">
                    {shareMode === 'root'
                      ? 'Choose what you want to share'
                      : shareMode === 'social'
                        ? 'Tap to add your profile link'
                        : shareMode === 'club'
                          ? 'Invite-only clubs can’t be shared'
                          : shareMode === 'connection'
                            ? 'Introduce a connection'
                            : 'Events from clubs you’re in'}
                  </Text>
                </View>
              </View>

              <ScrollView className="max-h-96">
                {shareMode === 'root' && (
                  <View className="py-2">
                    <TouchableOpacity
                      onPress={() => setShareMode('social')}
                      className="flex-row items-center px-4 py-4 border-b border-gray-100"
                      activeOpacity={0.85}
                    >
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-blue-50">
                        <IconSymbol name="link" size={18} color="#2563EB" />
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-ink">Share social media</Text>
                        <Text className="text-sm text-gray-500">Instagram, TikTok, etc.</Text>
                      </View>
                      <IconSymbol name="chevron.right" size={18} color="#9CA3AF" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setShareMode('club');
                        void fetchShareClubs();
                      }}
                      className="flex-row items-center px-4 py-4 border-b border-gray-100"
                      activeOpacity={0.85}
                    >
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-business/10">
                        <IconSymbol name="person.3.fill" size={18} color="#2563EB" />
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-ink">Share club</Text>
                        <Text className="text-sm text-gray-500">Send a club to join</Text>
                      </View>
                      <IconSymbol name="chevron.right" size={18} color="#9CA3AF" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setShareMode('connection');
                        void fetchShareConnections();
                      }}
                      className="flex-row items-center px-4 py-4 border-b border-gray-100"
                      activeOpacity={0.85}
                    >
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-gray-100">
                        <IconSymbol name="person.crop.circle" size={18} color="#111827" />
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-ink">Share connection</Text>
                        <Text className="text-sm text-gray-500">Introduce someone</Text>
                      </View>
                      <IconSymbol name="chevron.right" size={18} color="#9CA3AF" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setShareMode('event');
                        void fetchShareEvents();
                      }}
                      className="flex-row items-center px-4 py-4"
                      activeOpacity={0.85}
                    >
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-slate-100">
                        <IconSymbol name="calendar" size={18} color="#0F172A" />
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-ink">Share event</Text>
                        <Text className="text-sm text-gray-500">From your clubs</Text>
                      </View>
                      <IconSymbol name="chevron.right" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                )}

                {shareLoading && shareMode !== 'root' && (
                  <View className="px-4 py-10 items-center">
                    <ActivityIndicator />
                    <Text className="text-gray-500 mt-3">Loading…</Text>
                  </View>
                )}

                {!shareLoading && shareMode === 'social' && (
                  <View className="py-2">
                    {Object.keys(userSocialLinks).length === 0 ? (
                      <View className="px-4 py-8 items-center">
                        <IconSymbol name="link.circle" size={48} color="#9CA3AF" />
                        <Text className="text-gray-500 mt-4 text-center">
                          No social media links added.{'\n'}
                          Add them in your profile settings.
                        </Text>
                      </View>
                    ) : (
                      <View>
                        {Object.entries(userSocialLinks).map(([platform, handle]) => {
                          if (!handle) return null;
                          const iconConfig = getSocialIcon(platform);
                          const IconComponent = iconConfig.lib;
                          const url = getSocialUrl(platform, handle);
                          return (
                            <TouchableOpacity
                              key={platform}
                              onPress={() => handleShareSocialLink(platform, handle)}
                              className="flex-row items-center px-4 py-4 border-b border-gray-50 active:bg-gray-50"
                              activeOpacity={0.85}
                            >
                              <View
                                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                                style={{ backgroundColor: `${iconConfig.color}15` }}
                              >
                                {IconComponent === IconSymbol ? (
                                  <IconSymbol name={iconConfig.icon as any} size={20} color={iconConfig.color} />
                                ) : (
                                  <IconComponent name={iconConfig.icon as any} size={20} color={iconConfig.color} />
                                )}
                              </View>
                              <View className="flex-1">
                                <Text className="font-semibold text-ink">{getSocialPlatformName(platform)}</Text>
                                <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                                  {url}
                                </Text>
                              </View>
                              <IconSymbol name="paperplane.fill" size={16} color="#9CA3AF" />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}

                {!shareLoading && shareMode === 'club' && (
                  <View className="py-2">
                    {shareClubs.length === 0 ? (
                      <View className="px-4 py-8 items-center">
                        <IconSymbol name="person.3" size={42} color="#9CA3AF" />
                        <Text className="text-gray-500 mt-4 text-center">No shareable clubs yet.</Text>
                      </View>
                    ) : (
                      <View>
                        {shareClubs.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => void shareClubToChat(c)}
                            className="flex-row items-center px-4 py-4 border-b border-gray-50 active:bg-gray-50"
                            activeOpacity={0.85}
                          >
                            <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-business/10">
                              <IconSymbol name="person.3.fill" size={18} color="#2563EB" />
                            </View>
                            <View className="flex-1">
                              <Text className="font-semibold text-ink" numberOfLines={1}>{c.name}</Text>
                              <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>{c.city}</Text>
                            </View>
                            <IconSymbol name="paperplane.fill" size={16} color="#9CA3AF" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {!shareLoading && shareMode === 'connection' && (
                  <View className="py-2">
                    {shareConnections.length === 0 ? (
                      <View className="px-4 py-8 items-center">
                        <IconSymbol name="person.crop.circle.badge.plus" size={42} color="#9CA3AF" />
                        <Text className="text-gray-500 mt-4 text-center">No connections to share yet.</Text>
                      </View>
                    ) : (
                      <View>
                        {shareConnections.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => void shareConnectionToChat(c)}
                            className="flex-row items-center px-4 py-4 border-b border-gray-50 active:bg-gray-50"
                            activeOpacity={0.85}
                          >
                            <View className="w-10 h-10 rounded-full overflow-hidden mr-3 bg-gray-200">
                              <ChatAvatar path={c.avatar_url} />
                            </View>
                            <View className="flex-1">
                              <Text className="font-semibold text-ink" numberOfLines={1}>{c.full_name || c.username || 'Connection'}</Text>
                              <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>{c.username ? `@${c.username}` : ''}</Text>
                            </View>
                            <IconSymbol name="paperplane.fill" size={16} color="#9CA3AF" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {!shareLoading && shareMode === 'event' && (
                  <View className="py-2">
                    {shareEvents.length === 0 ? (
                      <View className="px-4 py-8 items-center">
                        <IconSymbol name="calendar.badge.exclamationmark" size={42} color="#9CA3AF" />
                        <Text className="text-gray-500 mt-4 text-center">No upcoming events found.</Text>
                      </View>
                    ) : (
                      <View>
                        {shareEvents.map((e) => (
                          <TouchableOpacity
                            key={e.id}
                            onPress={() => void shareEventToChat(e)}
                            className="flex-row items-center px-4 py-4 border-b border-gray-50 active:bg-gray-50"
                            activeOpacity={0.85}
                          >
                            <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-slate-100">
                              <IconSymbol name="calendar" size={18} color="#0F172A" />
                            </View>
                            <View className="flex-1">
                              <Text className="font-semibold text-ink" numberOfLines={1}>{e.title}</Text>
                              <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                                {e.club_name} • {new Date(e.event_date).toLocaleString()}
                              </Text>
                            </View>
                            <IconSymbol name="paperplane.fill" size={16} color="#9CA3AF" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
      </KeyboardAvoidingView>
    </KeyboardDismissWrapper>
  );
}

function ChatAvatar({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) return;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setUrl(data.publicUrl);
    }, [path]);
  
    if (!url) return <View className="w-full h-full bg-gray-200" />;
  
    return (
      <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
    );
}
