import { ProfileActionButtons } from '@/components/ProfileActionButtons';
import { useStatus } from '@/components/StatusProvider';
import { CoachMarks } from '@/components/ui/CoachMarks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatAddressLabel, recordVisit } from '@/lib/crossedPaths';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Image, LayoutAnimation, Modal, PanResponder, Platform, RefreshControl, Share, Switch, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { ProfileData, ProfileModal } from '../../components/ProfileModal';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { getReferralShareContent } from '../../lib/referral';
import { showSafetyOptions } from '../../lib/safety';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Use ProfileData type or ensure compatibility
type FeedProfile = ProfileData;

const MICRO_RANGE = 92; // 300 feet

export default function HomeScreen() {
  const { signOut, user } = useAuth();
  const { isProxyActive, toggleProxy, location, address } = useProxyLocation();
  const { openModal, activeStatuses, deleteStatus } = useStatus();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const cardSurfaceStyle = {
    backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
    borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
  } as const;
  const textPrimaryStyle = { color: isDark ? '#E5E7EB' : undefined } as const;
  const textSecondaryStyle = { color: isDark ? 'rgba(226,232,240,0.65)' : undefined } as const;
  const currentStatus = activeStatuses && activeStatuses.length > 0 ? activeStatuses[0] : null;
  // StatusItem has: id, content, type, caption, created_at, expires_at
  const currentStatusImage = currentStatus && currentStatus.type === 'image' ? currentStatus.content : null;
  const currentStatusText = currentStatus?.caption || (currentStatus && currentStatus.type === 'text' ? currentStatus.content : null);
  const [feed, setFeed] = useState<FeedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const [focused, setFocused] = useState(true);

  // Scroll Animation
  const scrollY = useRef(new Animated.Value(0)).current;
  const STICKY_HEADER_HEIGHT = Platform.OS === 'ios' ? 86 : 56; // Height of fixed sticky header (reduced paddingBottom)
  const ANIMATED_HEADER_HEIGHT = 80; // Height of scrollable animated header section (proxy toggle only)
  const HEADER_HEIGHT = STICKY_HEADER_HEIGHT + ANIMATED_HEADER_HEIGHT; // Total header height
  
  // Fix for bounce: clamp scrollY to non-negative
  const clampedScrollY = scrollY.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolateLeft: 'clamp',
  });

  // @ts-ignore - diffClamp is available but TypeScript types may not include it
  const diffClamp = Animated.diffClamp(clampedScrollY, 0, ANIMATED_HEADER_HEIGHT);
  const translateY = diffClamp.interpolate({
    inputRange: [0, ANIMATED_HEADER_HEIGHT],
    outputRange: [0, -ANIMATED_HEADER_HEIGHT],
  });

  // Status Preview State
  const [myStatus, setMyStatus] = useState<{ text: string | null; image: string | null } | null>(null);
  const [statusExpanded, setStatusExpanded] = useState(false);

  // Modal State (Profile)
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [previewStatusProfile, setPreviewStatusProfile] = useState<FeedProfile | null>(null);
  const [myInterests, setMyInterests] = useState<Record<string, string[]> | null>(null);
  const [myGoals, setMyGoals] = useState<string[] | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState<number>(0);
  const [saveCrossedPaths, setSaveCrossedPaths] = useState(true);
  const [crossedPathsBadgeCount, setCrossedPathsBadgeCount] = useState(0);
  const [showFriendCodeToast, setShowFriendCodeToast] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const proxyToggleRef = useRef<View | null>(null);
  const crossedPathsIconRef = useRef<View | null>(null);
  const firstCardRef = useRef<View | null>(null);

  const refreshCrossedPathsBadge = useCallback(async () => {
    if (!user || !saveCrossedPaths || !isProxyActive) {
      setCrossedPathsBadgeCount(0);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_my_crossed_paths_badge_status', {});
      if (error) {
        setCrossedPathsBadgeCount(0);
        return;
      }

      const row = Array.isArray(data) ? (data[0] as any) : (data as any);
      const nRaw = row?.badge_count;
      const n = typeof nRaw === 'number' ? nRaw : Number(nRaw);
      const latest = row?.latest_seen_at ? new Date(String(row.latest_seen_at)).getTime() : 0;

      const seenRaw = await AsyncStorage.getItem('crossedPaths:badgeSeenAt:v1');
      const seenAt = seenRaw ? new Date(String(seenRaw)).getTime() : 0;

      const shouldShow = Number.isFinite(n) && n > 0 && latest > seenAt;
      setCrossedPathsBadgeCount(shouldShow ? n : 0);
    } catch {
      // ignore
    }
  }, [user?.id, saveCrossedPaths, isProxyActive]);

  // Check if user has opted out of seeing the referral popup
  const checkDontShowAgain = async () => {
    try {
      const value = await AsyncStorage.getItem('dont_show_referral_popup');
      return value === 'true';
    } catch (e) {
      console.error('Error reading preference:', e);
      return false;
    }
  };

  const fetchUserProfile = async () => {
    if (!user) return;
    
    // Fetch detailed interests & goals
    const { data } = await supabase
      .from('profiles')
      .select('detailed_interests, relationship_goals, friend_code, city, referral_count, save_crossed_paths')
      .eq('id', user.id)
      .single();
    
    if (data) {
      setMyInterests(data.detailed_interests);
      setMyGoals(data.relationship_goals);
      setFriendCode(data.friend_code);
      setUserCity(data.city);
      setReferralCount(data.referral_count || 0);
      setSaveCrossedPaths(data.save_crossed_paths ?? true);
      // Show friend code toast if user has a friend code and hasn't opted out
      if (data.friend_code) {
        const shouldNotShow = await checkDontShowAgain();
        if (!shouldNotShow) {
          setShowFriendCodeToast(true);
        }
      }
    }
  };

  const handleCloseReferralPopup = async () => {
    setShowFriendCodeToast(false);
    // Save preference if checkbox is checked
    if (dontShowAgain) {
      try {
        await AsyncStorage.setItem('dont_show_referral_popup', 'true');
      } catch (e) {
        console.error('Error saving preference:', e);
      }
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      // Fetch My Status
      fetchMyStatus();
      // Fetch pending requests
      fetchPendingRequests();
    }
  }, [user]);

  const fetchPendingRequests = async () => {
    if (!user) return;
    const { count } = await supabase
      .from('interests')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .eq('status', 'pending');
    
    setPendingRequestsCount(count || 0);
  };

  useEffect(() => {
    if (!user) return;

    // Subscribe to profile changes (for referral_count updates)
    const profileSubscription = supabase
      .channel('profile-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, (payload) => {
        // Update referral_count if it changed
        if (payload.new.referral_count !== undefined) {
          setReferralCount(payload.new.referral_count || 0);
        }
      })
      .subscribe();

    // Subscribe to changes (incoming + outgoing) so buttons update when someone accepts/declines.
    const incomingSub = supabase
      .channel('pending-requests-proxy-incoming')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interests',
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          fetchPendingRequests();
          if (isProxyActive && location) fetchProxyFeed();
        },
      )
      .subscribe();

    const outgoingSub = supabase
      .channel('pending-requests-proxy-outgoing')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interests',
          filter: `sender_id=eq.${user.id}`,
        },
        () => {
          if (isProxyActive && location) fetchProxyFeed();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileSubscription);
      supabase.removeChannel(incomingSub);
      supabase.removeChannel(outgoingSub);
    };
  }, [user, isProxyActive, location]);

  const fetchMyStatus = async () => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('status_text, status_image_url, status_created_at').eq('id', user.id).single();
      if (data && data.status_created_at) {
          const created = new Date(data.status_created_at);
          const now = new Date();
          const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
          if (diffHours < 1) {
              setMyStatus({ text: data.status_text, image: data.status_image_url });
          } else {
              setMyStatus(null);
          }
      }
  };

  const fetchProxyFeed = async () => {
    if (!user || !location || !isProxyActive) return;

    setLoading(true);
    // fetchMyStatus(); // Refresh status too - handled globally now

    const { data, error } = await supabase.rpc('get_feed_users', {
      lat: location.coords.latitude,
      long: location.coords.longitude,
      range_meters: MICRO_RANGE
    });

    console.log(`Fetching proxy feed. Lat: ${location.coords.latitude}, Long: ${location.coords.longitude}, Range: ${MICRO_RANGE}m`);

    if (error) {
      console.error('Error fetching proxy:', error);
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      // Double check filter on client side to handle cached server logic
      const filtered = (data || []).filter((u: FeedProfile) => (u.dist_meters || 0) <= MICRO_RANGE);
      if (filtered.length !== (data || []).length) {
          console.warn(`Filtered ${data.length - filtered.length} users who were out of range.`);
      }

      // Best-effort: record Crossed Paths for this address/day so the user can find people later.
      try {
        const addressLabel = formatAddressLabel(address);
        if (saveCrossedPaths) {
          // v2: write a single "visit" (cheap) instead of per-user crossed path rows.
          await recordVisit({
            viewerId: user.id,
            addressLabel,
            address,
            location: location ? { lat: location.coords.latitude, long: location.coords.longitude } : null,
          });
          // Update the small badge on the Crossed Paths icon.
          void refreshCrossedPathsBadge();
        }
      } catch {
        // ignore
      }
      
      // Fetch connection/interest state for each user (pending/accepted/declined)
      const userIds = filtered.map((u: FeedProfile) => u.id);
      if (userIds.length > 0 && user) {
          const { data: interestRows } = await supabase
              .from('interests')
              .select('id, sender_id, receiver_id, status')
              .in('status', ['pending', 'accepted', 'declined'])
              .or(
                `and(sender_id.eq.${user.id},receiver_id.in.(${userIds.join(',')})),and(receiver_id.eq.${user.id},sender_id.in.(${userIds.join(',')}))`,
              );
          
          // Map for pending incoming/outgoing + track if they previously declined my interest
          const pendingMap = new Map<string, { id: string; isReceived: boolean }>();
          const declinedByThem = new Set<string>();
          const acceptedMap = new Map<string, string>(); // partnerId -> interestId (conversation)

          (interestRows || []).forEach((interest: any) => {
              const isOutgoing = interest.sender_id === user.id;
              const partnerId = isOutgoing ? interest.receiver_id : interest.sender_id;
              if (!partnerId) return;

              if (interest.status === 'pending') {
                pendingMap.set(partnerId, { id: interest.id, isReceived: !isOutgoing });
              } else if (interest.status === 'declined' && isOutgoing) {
                declinedByThem.add(partnerId);
              } else if (interest.status === 'accepted') {
                acceptedMap.set(partnerId, interest.id);
              }
          });
          
          // Add pending request info to each user
          const enrichedFeed = filtered.map((u: FeedProfile) => {
              const pending = pendingMap.get(u.id);
              return {
                  ...u,
                  pending_request: pending ? { id: pending.id, is_received: pending.isReceived } : null
                  ,
                  // Used for "Previously declined your interest" label + resend button styling.
                  previously_declined: declinedByThem.has(u.id),
                  // Ensure Message button can appear quickly even if RPC didn't compute connection_id yet.
                  connection_id: (u as any).connection_id || acceptedMap.get(u.id) || null,
              } as FeedProfile & { pending_request?: { id: string; is_received: boolean } | null };
          });
          
          setFeed(enrichedFeed);
      } else {
          setFeed(filtered);
      }
    }
    setLoading(false);
  };

  // Fetch feed when:
  // 1. Component mounts (opening app)
  // 2. Proxy is toggled
  // 3. Tab comes into focus
  // 4. Manual refresh (pull-to-refresh)
  
  // Initial fetch when proxy is enabled
  useEffect(() => {
    if (isProxyActive && location) {
      fetchProxyFeed();
    } else {
      setFeed([]);
    }
  }, [isProxyActive]); // Only fetch when proxy is toggled

  // Refresh when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      // Refresh user profile to get updated referral_count
      fetchUserProfile();
      
      if (isProxyActive && location) {
        fetchProxyFeed();
      }
      void refreshCrossedPathsBadge();
    }, [isProxyActive, location, user])
  );

  // Only show coach marks when this tab is focused (prevents background tabs from popping a tour).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const sendInterest = async (targetUserId: string) => {
      // Legacy helper; ProfileActionButtons now drives this flow.
      // Keep for safety and remove success toast (UI should update via button state).
      const { error } = await supabase
        .from('interests')
        .upsert({
            sender_id: user?.id,
            receiver_id: targetUserId,
            status: 'pending'
        } as any, { onConflict: 'sender_id,receiver_id' });
      
      if (error) {
          if (error.code === '23505') {
              toast.show('Already Connected', 'info');
          } else {
              toast.show(error.message, 'error');
          }
      } else {
          fetchProxyFeed(); // Refresh feed to update UI
      }
  };

  const handleAcceptRequest = async (interestId: string) => {
      const { error } = await supabase
          .from('interests')
          .update({ status: 'accepted' })
          .eq('id', interestId);
      
      if (error) {
          toast.show(error.message, 'error');
      } else {
          toast.show('Request accepted!', 'success');
          fetchProxyFeed(); // Refresh feed
      }
  };

  const handleDeclineRequest = async (interestId: string) => {
      const { error } = await supabase
          .from('interests')
          .update({ status: 'declined' })
          .eq('id', interestId);
      
      if (error) {
          toast.show(error.message, 'error');
      } else {
          toast.show('Request declined', 'info');
          fetchProxyFeed(); // Refresh feed
      }
  };

  const handleSafety = (targetUserId: string) => {
      if (user) {
          showSafetyOptions(user.id, targetUserId, () => {
              setFeed(prev => prev.filter(p => p.id !== targetUserId));
          });
      }
  };

  const getGoalColors = (goal?: string) => {
    switch(goal) {
        case 'Romance': return { bg: 'bg-romance/5', border: 'border-romance/30', text: 'text-romance', badgeBg: 'bg-romance/10' };
        case 'Friendship': return { bg: 'bg-friendship/5', border: 'border-friendship/30', text: 'text-friendship', badgeBg: 'bg-friendship/10' };
        case 'Professional': return { bg: 'bg-business/5', border: 'border-business/30', text: 'text-business', badgeBg: 'bg-business/10' };
        default: return { bg: 'bg-white', border: 'border-gray-200', text: 'text-ink', badgeBg: 'bg-gray-100' };
    }
  };

  const openProfile = (profile: FeedProfile) => {
      setSelectedProfile(profile);
      setModalVisible(true);
  };

  const calculateMatchPercentage = (userInterests: Record<string, string[]> | null) => {
    if (!myInterests || !userInterests) return 0;
    
    // Count the actual number of matching interests/tags
    const commonInterests = getCommonInterests(userInterests);
    const matchCount = commonInterests.length;
    
    // Map match count to percentage
    if (matchCount >= 4) {
      return 98; // 4+ things in common: 98%+ match
    } else if (matchCount === 3) {
      return 95; // 3 things in common: 95% match
    } else if (matchCount === 2) {
      return 80; // 2 things in common: 80% match
    } else if (matchCount === 1) {
      return 60; // 1 thing in common: 60% match
    } else {
      return 0; // No matches: 0% match
    }
  };

  // Find common interests between my interests and user's interests
  const getCommonInterests = (userInterests: Record<string, string[]> | null): string[] => {
    if (!myInterests || !userInterests) return [];
    const common: string[] = [];
    
    Object.keys(myInterests).forEach(cat => {
      if (userInterests[cat]) {
        // Check for matching sub-interests
        const myTags = myInterests[cat].map(t => t.toLowerCase().trim());
        const userTags = userInterests[cat].map(t => t.toLowerCase().trim());
        const matchingTags = userTags.filter(tag => myTags.includes(tag));
        
        if (matchingTags.length > 0) {
          // Add category and matching tags
          matchingTags.forEach(tag => {
            const originalTag = userInterests[cat].find(t => t.toLowerCase().trim() === tag);
            if (originalTag) {
              common.push(`${cat}: ${originalTag}`);
            }
          });
        } else {
          // Just category match
          common.push(cat);
        }
      }
    });
    
    return common;
  };

  // Track initial touch position for swipe detection
  const initialTouchX = useRef<number | null>(null);

  // Swipe gesture handler (swipe right for Crossed Paths)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onPanResponderGrant: (evt) => {
        // Capture start position immediately so edge detection is accurate.
        initialTouchX.current = evt.nativeEvent.pageX;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Store initial touch position
        if (initialTouchX.current === null) {
          initialTouchX.current = evt.nativeEvent.pageX;
        }
        
        // Only respond to horizontal swipes
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasEnoughMovement = Math.abs(gestureState.dx) > 30;
        
        return isHorizontal && hasEnoughMovement;
      },
      onPanResponderRelease: (evt, gestureState) => {
        const startX = initialTouchX.current ?? evt.nativeEvent.pageX;
        const screenWidth = Dimensions.get('window').width || 0;
        const edgeZone = Math.min(140, screenWidth * 0.25); // easier to trigger (bigger edge zone)
        const isFromLeftEdge = startX < edgeZone;
        
        // Swipe right from left edge (dx > 0) to open Crossed Paths
        const shouldOpen =
          isFromLeftEdge &&
          (gestureState.dx > 70 || (gestureState.vx > 0.65 && gestureState.dx > 30)); // allow quick flicks

        if (shouldOpen) {
          router.push('/crossed-paths');
        }
        
        // Reset initial touch position
        initialTouchX.current = null;
      },
      onPanResponderTerminate: () => {
        // Reset on cancel
        initialTouchX.current = null;
      },
    })
  ).current;

  const renderCard = ({ item, index }: { item: FeedProfile; index: number }) => {
    const primaryGoal = item.relationship_goals?.[0];
    const colors = getGoalColors(primaryGoal);
    const isConnected = !!item.connection_id;
    const { width } = Dimensions.get('window');
    const CARD_WIDTH = width - 32; // px-4 padding

    // Construct images array
    const images: string[] = [];
    if (item.avatar_url) images.push(item.avatar_url);
    if (item.status_image_url) images.push(item.status_image_url);
    const displayImages = images.length > 0 ? images : [null];

    const topInterests: string[] = [];
    if (item.detailed_interests) {
        Object.entries(item.detailed_interests).forEach(([cat, details]) => {
            if (details.length > 0) {
                topInterests.push(`${cat}: ${details[0]}`); 
            } else {
                topInterests.push(cat);
            }
        });
    }

    // Get common interests
    const commonInterests = getCommonInterests(item.detailed_interests);

    return (
      <View 
        ref={index === 0 ? firstCardRef : undefined}
        className={`mb-6 rounded-3xl overflow-hidden ${isConnected ? 'bg-gray-50' : 'bg-white'} shadow-sm`}
        style={{
          borderWidth: 1,
          borderColor: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148, 163, 184, 0.2)', // Slate-400 with low opacity for glass effect
          backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.18 : 0.06,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {/* Header: Name, Intent, Status */}
        <View 
          className="px-4 py-3 flex-row items-center justify-between bg-white/50"
          style={{
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148, 163, 184, 0.15)', // Glass morphism border
            backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : undefined,
          }}
        >
            <View className="flex-1 pr-2 justify-center">
                <View className="flex-row items-center mb-1">
                    <TouchableOpacity onPress={() => openProfile(item)}>
                        <Text className="text-lg font-bold text-ink mr-1" numberOfLines={1} style={textPrimaryStyle}>{item.full_name || item.username}</Text>
                    </TouchableOpacity>
                    {item.is_verified && <IconSymbol name="checkmark.seal.fill" size={14} color="#3B82F6" />}
                    {(!(item as any).connection_id && (item as any).previously_declined) ? (
                      <View className="ml-2 px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200">
                        <Text className="text-[10px] font-bold text-orange-700">Previously declined your interest</Text>
                      </View>
                    ) : null}
                </View>
                
                {primaryGoal && (
                    <View className="flex-row">
                        <View className={`px-2 py-0.5 rounded-full border ${colors.badgeBg} ${colors.border}`}>
                            <Text className={`text-[10px] font-bold uppercase ${colors.text}`}>{primaryGoal}</Text>
                        </View>
                    </View>
                )}
            </View>
            
            {/* Status Bubble */}
            {(item.status_text || item.status_image_url) && (
                <TouchableOpacity 
                    onPress={() => setPreviewStatusProfile(item)}
                    activeOpacity={0.8}
                    className="flex-row items-center bg-white px-2 py-1 rounded-full border border-green-400 ml-2"
                    style={{ 
                        maxWidth: '35%',
                        shadowColor: '#4ade80',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.5,
                        shadowRadius: 6,
                        elevation: 4
                    }}
                >
                    {item.status_image_url ? (
                        <View className="w-5 h-5 rounded-full overflow-hidden mr-1.5 border border-green-100">
                            <FeedImage path={item.status_image_url} resizeMode="cover" />
                        </View>
                    ) : (
                        <IconSymbol name="bubble.left.fill" size={12} color="#10B981" style={{ marginRight: 4 }} />
                    )}
                    {item.status_text && (
                        <Text numberOfLines={1} className="text-[10px] text-green-800 italic flex-1 font-medium" style={{ color: isDark ? 'rgba(187,247,208,0.95)' : undefined }}>
                          “{item.status_text}”
                        </Text>
                    )}
                </TouchableOpacity>
            )}
        </View>

        {/* Full Width Image Block */}
        <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#f3f4f6' }}>
            <FlatList 
                data={displayImages}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(img, idx) => `feed-${item.id}-${idx}`}
                renderItem={({ item: imgPath, index }) => {
                    const isAvatar = index === 0 && imgPath === item.avatar_url;
                    return (
                        <TouchableOpacity 
                            activeOpacity={0.95} 
                            onPress={() => openProfile(item)}
                            style={{ width: CARD_WIDTH - 2, height: CARD_WIDTH - 2 }}
                        >
                            <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                                <FeedImage path={imgPath} resizeMode="cover" />
                                {/* Show verified badge only on avatar (first image) */}
                                {isAvatar && item.is_verified && (
                                    <View
                                        style={{
                                            position: 'absolute',
                                            bottom: 12,
                                            right: 12,
                                            backgroundColor: '#3B82F6',
                                            borderRadius: 12,
                                            width: 24,
                                            height: 24,
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            shadowColor: '#000',
                                            shadowOffset: { width: 0, height: 2 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 4,
                                            elevation: 5,
                                            borderWidth: 2,
                                            borderColor: '#fff',
                                        }}
                                    >
                                        <IconSymbol name="checkmark.seal.fill" size={14} color="#fff" />
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                }}
            />
            {/* Dots */}
            {displayImages.length > 1 && (
                <View className="absolute bottom-3 left-0 right-0 flex-row justify-center space-x-1.5">
                    {displayImages.map((_, i) => (
                        <View key={i} className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-sm backdrop-blur-sm" />
                    ))}
                </View>
            )}
        </View>

        {/* Footer: Interests & Actions */}
        <View className="p-4 pt-3">
            {/* Common Interests */}
            {commonInterests.length > 0 && (
                <View className="flex-row items-center flex-wrap mb-3">
                    <IconSymbol name="star.fill" size={14} color="#FFD700" style={{ marginRight: 6 }} />
                    <Text className="text-gray-700 text-xs font-bold mr-2">Common interests:</Text>
                    {commonInterests.map((interest, idx) => (
                        <Text key={idx} className="text-gray-600 text-xs font-medium mr-2">
                            {interest.split(': ').pop()}{idx < commonInterests.length - 1 ? ',' : ''}
                        </Text>
                    ))}
                </View>
            )}

            {/* Interests */}
            {topInterests.length > 0 && (
                <View className="flex-row flex-wrap mb-4">
                    {topInterests.slice(0, 3).map((tag, idx) => (
                        <View 
                          key={idx} 
                          className="bg-white px-2 py-1 rounded-md mr-2 mb-1"
                          style={{
                            borderWidth: 1,
                            borderColor: 'rgba(148, 163, 184, 0.2)', // Glass morphism border
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.05,
                            shadowRadius: 3,
                            elevation: 1,
                          }}
                        >
                            <Text className="text-gray-600 text-xs font-medium">#{tag.split(': ').pop()}</Text>
                        </View>
                    ))}
                    {topInterests.length > 3 && (
                        <Text className="text-gray-400 text-xs mt-1.5">+{topInterests.length - 3} more</Text>
                    )}
                </View>
            )}

            {/* Buttons */}
            <ProfileActionButtons
                profile={item}
                variant="card"
                myGoals={myGoals}
                onStateChange={() => {
                    // Refresh feed when state changes
                    if (isProxyActive && location) {
                        fetchProxyFeed();
                    }
                }}
            />
        </View>
      </View>
    );
  };

  const getDisplayText = (addr: any) => {
      const label = formatAddressLabel(addr as any);
      return label || 'this area';
  };

  return (
    <View className="flex-1 bg-transparent" {...panResponder.panHandlers}>
      {/* Fixed Sticky Header - Always Visible */}
      <View 
        style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            zIndex: 200,
            paddingTop: Platform.OS === 'ios' ? 50 : 20,
            paddingBottom: 8,
            paddingHorizontal: 16,
            backgroundColor: isDark ? 'rgba(11, 18, 32, 0.76)' : 'rgba(248, 250, 252, 0.78)', // translucent so orbs show through
            overflow: 'hidden',
            borderBottomWidth: 0,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
        }}
      >
          {/* Clean Modern Gradient Backdrop - Subtle Overlay */}
          <LinearGradient
            colors={[
              isDark ? 'rgba(11,18,32,0.88)' : '#FFFFFF',
              isDark ? 'rgba(15,23,42,0.86)' : '#F1F5F9',
              isDark ? 'rgba(2,6,23,0.88)' : '#E2E8F0',
              isDark ? 'rgba(15,23,42,0.86)' : '#F1F5F9',
              isDark ? 'rgba(11,18,32,0.88)' : '#FFFFFF',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            locations={[0, 0.3, 0.5, 0.7, 1]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />

          <View className="flex-row items-center" style={{ position: 'relative', minHeight: 40, zIndex: 1 }}>
            {/* History Icon (Left) - Fixed width */}
            <TouchableOpacity 
              onPress={() => router.push('/crossed-paths')}
              className="w-10 h-10 items-center justify-center"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <View ref={crossedPathsIconRef} collapsable={false}>
                  <IconSymbol name="point.topleft.down.curvedto.point.bottomright.up" size={26} color={isDark ? '#E5E7EB' : '#2D3748'} />
                </View>
                {saveCrossedPaths && isProxyActive && crossedPathsBadgeCount > 0 ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      minWidth: 16,
                      height: 16,
                      paddingHorizontal: 4,
                      borderRadius: 999,
                      backgroundColor: '#EF4444',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: isDark ? 'rgba(11,18,32,0.95)' : 'rgba(248, 250, 252, 0.95)',
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: '800', lineHeight: 12 }}>
                      {crossedPathsBadgeCount > 99 ? '99+' : String(crossedPathsBadgeCount)}
                    </Text>
                  </View>
                ) : null}
            </TouchableOpacity>
            
            {/* Proxme Title (Center) - Absolutely positioned for perfect centering */}
            <View 
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                alignItems: 'center',
                justifyContent: 'center',
                height: 40,
              }}
            >
              <ProxymeLogo />
            </View>
            
            {/* Empty space for balance (Inbox moved to nav bar) */}
            <View className="w-10 h-10 ml-auto" />
          </View>
      </View>

      {/* Animated Header - Scrolls with content */}
      <Animated.View 
        style={{ 
            position: 'absolute', 
            top: STICKY_HEADER_HEIGHT, 
            left: 0, 
            right: 0, 
            zIndex: 100, 
            height: ANIMATED_HEADER_HEIGHT,
            backgroundColor: isDark ? 'rgba(11,18,32,0.78)' : '#F9FAFB',
            transform: [{ translateY }],
        }}
        className="px-4 pt-4 shadow-sm"
      >
          {/* Proxy Toggle - Full Width */}
          <TouchableOpacity 
            onPress={() => toggleProxy(!isProxyActive)}
            activeOpacity={0.9}
            className="bg-white rounded-3xl p-3 shadow-sm"
            style={{
              borderWidth: 1,
              backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
              borderColor: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148, 163, 184, 0.2)', // Glass morphism border
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
              <View ref={proxyToggleRef} collapsable={false}>
              <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center flex-1">
                      <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${isProxyActive ? 'bg-green-50' : 'bg-gray-50'}`}>
                          <IconSymbol name={isProxyActive ? "location.fill" : "location.slash"} size={18} color={isProxyActive ? "#10B981" : "#9CA3AF"} />
                      </View>
                      <View className="flex-1">
                          <Text className="text-[10px] font-bold text-gray-400 uppercase mb-0.5" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
                            Proxy Mode
                          </Text>
                          <Text className="text-ink font-bold text-xs leading-4" numberOfLines={1} style={{ color: isDark ? '#E5E7EB' : undefined }}>
                              {isProxyActive ? `Visible at ${getDisplayText(address)}.` : "Hidden from others."}
                          </Text>
                      </View>
                  </View>
                  <Switch 
                      value={isProxyActive} 
                      onValueChange={toggleProxy}
                      trackColor={{ false: '#e2e8f0', true: '#1A1A1A' }}
                      thumbColor={'#fff'}
                      style={{ transform: [{ scaleX: 0.6 }, { scaleY: 0.6 }] }} 
                  />
              </View>
              </View>
          </TouchableOpacity>
      </Animated.View>

      <Animated.FlatList
          data={isProxyActive ? feed : []}
          keyExtractor={(item) => item.id}
          // Prevent iOS inset adjustment jitter on tab switch (can show "past the top" until first scroll)
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustsScrollIndicatorInsets={false}
          bounces={false}
          alwaysBounceVertical={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: STICKY_HEADER_HEIGHT + ANIMATED_HEADER_HEIGHT + 8, paddingBottom: 100, paddingHorizontal: 16 }}
          refreshControl={
              <RefreshControl 
                refreshing={loading} 
                onRefresh={fetchProxyFeed} 
                tintColor="#2D3748" 
                progressViewOffset={STICKY_HEADER_HEIGHT + ANIMATED_HEADER_HEIGHT + 8}
              />
          }
          ListEmptyComponent={
              !isProxyActive ? (
                <View className="items-center justify-center opacity-30 py-12">
                    <IconSymbol name="location.slash.fill" size={64} color={isDark ? '#94A3B8' : '#2D3748'} />
                    <Text className="text-center font-bold text-ink text-xl mt-4" style={textPrimaryStyle}>Proxy is Off</Text>
                    <Text className="text-center text-gray-500 text-sm mt-2" style={textSecondaryStyle}>Flip the switch to connect.</Text>
                </View>
              ) : (
                <View className="items-center mt-12 opacity-60">
                     <Text className="text-ink text-lg font-medium" style={textPrimaryStyle}>No one else is here yet.</Text>
                     <Text className="text-gray-500 text-sm mt-2 text-center px-8" style={textSecondaryStyle}>Help grow the community - Tell your friends to turn on Proxy!</Text>
                </View>
              )
          }
          renderItem={({ item, index }) => renderCard({ item, index })}
          showsVerticalScrollIndicator={false}
      />

      <CoachMarks
        enabled={focused}
        storageKey="tutorial:tab:proxy:v1"
        steps={[
          {
            key: 'toggle',
            title: 'Proxy Mode',
            body: 'Flip this switch to be visible to people right here, right now.',
            targetRef: proxyToggleRef as any,
            anchor: 'top',
          },
          {
            key: 'cards',
            title: 'Nearby people',
            body: 'Users that populate here are at the same place as you.',
            targetRef: firstCardRef as any,
            anchor: 'center',
          },
          {
            key: 'history',
            title: 'Crossed Paths',
            body: 'Tap here to view people you crossed paths with over the last week.',
            targetRef: crossedPathsIconRef as any,
            anchor: 'topLeft',
          },
        ]}
      />

      <StatusPreviewModal 
          visible={!!previewStatusProfile} 
          profile={previewStatusProfile} 
          onClose={() => setPreviewStatusProfile(null)} 
      />

      <ProfileModal 
         visible={modalVisible}
         profile={selectedProfile}
         onClose={() => setModalVisible(false)}
         myInterests={myInterests}
         myGoals={myGoals}
         onStateChange={() => {
             // Refresh feed when state changes
             if (isProxyActive && location) {
                 fetchProxyFeed();
             }
         }}
      />

      {/* Friend Code Toast - Hovering at Top */}
      {showFriendCodeToast && friendCode && (
        <View 
          className="absolute left-0 right-0 px-4 pb-4"
          style={{
            top: STICKY_HEADER_HEIGHT + 20,
            zIndex: 9999,
            elevation: 9999,
          }}
        >
          <View
            className="rounded-3xl p-4 overflow-hidden"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderWidth: 1.5,
              borderColor: 'rgba(255, 255, 255, 0.8)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.15,
              shadowRadius: 40,
              elevation: 20,
            }}
          >
            {/* Outer glow effect */}
            <View
              style={{
                position: 'absolute',
                top: -2,
                left: -2,
                right: -2,
                bottom: -2,
                borderRadius: 30,
                backgroundColor: 'rgba(255, 255, 255, 0.5)',
                zIndex: -1,
              }}
            />
            <LinearGradient
              colors={[
                '#FFFFFF',
                '#F1F5F9',
                '#E2E8F0',
                '#F1F5F9',
                '#FFFFFF',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              locations={[0, 0.3, 0.5, 0.7, 1]}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 24,
                opacity: 0.95,
              }}
            />
            {/* Close Button - Overlay that doesn't take space */}
            <TouchableOpacity
              onPress={handleCloseReferralPopup}
              className="absolute top-3 right-3 z-10 p-1.5"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 20,
              }}
            >
              <IconSymbol name="xmark" size={18} color="#6B7280" />
            </TouchableOpacity>

            <View className="items-center" style={{ position: 'relative', zIndex: 1 }}>
              <View className="items-center flex-1 w-full">
                <Text className="text-[14px] font-bold text-gray-600 uppercase mb-2 italic">Share the Love,</Text>
                <Text className="text-[14px] font-bold text-gray-600 uppercase mb-2 italic">Free Verification</Text>
                <View className="flex-row items-center justify-center w-full mb-2">
                  <View 
                    className="px-4 py-2 rounded-full mr-3"
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.9)',
                      borderWidth: 1,
                      borderColor: 'rgba(59, 130, 246, 1)',
                    }}
                  >
                    <Text className="text-white font-bold text-sm">
                      {referralCount}/3 referrals
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        const shareContent = getReferralShareContent(friendCode);
                        if (!shareContent) return;
                        await Share.share({
                          message: shareContent.shareText,
                          title: 'Join me on Proxyme!',
                        });
                        // Popup stays open - only X button closes it
                      } catch (error) {
                        console.error('Error sharing:', error);
                      }
                    }}
                    className="px-3 py-2 rounded-lg flex-row items-center justify-center"
                    style={{
                      backgroundColor: '#1A1A1A',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: 5,
                    }}
                  >
                    <IconSymbol name="paperplane.fill" size={16} color="white" />
                  </TouchableOpacity>
                </View>
                <Text className="text-xs text-gray-600 text-center mb-2" style={{ fontWeight: '500' }}>
                  Proxyme is powered by its users! Share to expand {userCity || 'your city'}. {referralCount >= 3 ? '🎉 You\'re verified!' : `Get ${3 - referralCount} more ${referralCount === 2 ? 'referral' : 'referrals'} to unlock verification.`}
                </Text>
                {/* Don't show again checkbox */}
                <TouchableOpacity
                  onPress={() => setDontShowAgain(!dontShowAgain)}
                  className="flex-row items-center justify-center mt-2"
                  activeOpacity={0.7}
                >
                  <View
                    className={`w-4 h-4 rounded border-2 mr-2 items-center justify-center ${
                      dontShowAgain ? 'bg-blue-600 border-blue-600' : 'border-gray-400 bg-white'
                    }`}
                  >
                    {dontShowAgain && (
                      <IconSymbol name="checkmark" size={10} color="white" />
                    )}
                  </View>
                  <Text className="text-xs text-gray-600" style={{ fontWeight: '400' }}>
                    Don’t show this again
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// Proxyme Logo Component with Gradient Text
function ProxymeLogo() {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', paddingHorizontal: 8, paddingVertical: 4 }}>
      {/* Gradient Text - Light slate to dark slate gradient for better readability */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Text 
          className="text-lg font-bold" 
          style={{ 
            fontFamily: 'LibertinusSans-Bold',
            color: '#475569', // Slate-600 (light slate start)
            letterSpacing: 0.3,
          }}
        >
          p
        </Text>
        <Text 
          className="text-lg font-bold" 
          style={{ 
            fontFamily: 'LibertinusSans-Bold',
            color: '#334155', // Slate-700
            letterSpacing: 0.3,
          }}
        >
          r
        </Text>
        <Text 
          className="text-lg font-bold" 
          style={{ 
            fontFamily: 'LibertinusSans-Bold',
            color: '#1E293B', // Slate-800
            letterSpacing: 0.3,
          }}
        >
          o
        </Text>
        <Text 
          className="text-lg font-bold" 
          style={{ 
            fontFamily: 'LibertinusSans-Bold',
            color: '#0F172A', // Slate-900 (dark slate)
            letterSpacing: 0.3,
          }}
        >
          x
        </Text>
        <Text 
          className="text-lg font-bold" 
          style={{ 
            fontFamily: 'LibertinusSans-Bold',
            color: '#0F172A', // Slate-900
            letterSpacing: 0.3,
          }}
        >
          y
        </Text>
        <Text 
          className="text-lg font-bold" 
          style={{ 
            fontFamily: 'LibertinusSans-Bold',
            color: '#0F172A', // Slate-900
            letterSpacing: 0.3,
          }}
        >
          m
        </Text>
        <Text 
          className="text-lg font-bold" 
          style={{ 
            fontFamily: 'LibertinusSans-Bold',
            color: '#0F172A', // Slate-900
            letterSpacing: 0.3,
          }}
        >
          e
        </Text>
      </View>
    </View>
  );
}

function FeedImage({ path, resizeMode = 'cover' }: { path: string | null, resizeMode?: any }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) return;
      if (path.startsWith('file://')) {
          setUrl(path);
      } else {
          const { data } = supabase.storage.from('avatars').getPublicUrl(path);
          setUrl(data.publicUrl);
      }
    }, [path]);
  
    if (!url) return <View className="w-full h-full bg-gray-100 animate-pulse" />;
  
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode={resizeMode}
      />
    );
}

function StatusPreviewModal({ visible, profile, onClose }: { visible: boolean, profile: FeedProfile | null, onClose: () => void }) {
    if (!visible || !profile) return null;
    
    let expiryText = '';
    if (profile.status_created_at) {
        const created = new Date(profile.status_created_at);
        const expires = new Date(created.getTime() + 60 * 60 * 1000); // 1 hour
        if (expires > new Date()) {
            expiryText = `Expires at ${expires.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        } else {
            expiryText = 'Expired';
        }
    }
    
    return (
        <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
             <TouchableOpacity style={{flex:1, backgroundColor:'rgba(0,0,0,0.8)', justifyContent:'center', padding: 24}} activeOpacity={1} onPress={onClose}>
                  <TouchableOpacity activeOpacity={1} className="bg-paper rounded-3xl overflow-hidden shadow-2xl w-full">
                       {profile.status_image_url && (
                           <View className="w-full aspect-square bg-gray-100">
                               <FeedImage path={profile.status_image_url} resizeMode="cover" />
                           </View>
                       )}
                       {profile.status_text && (
                           <View className="p-8 items-center justify-center">
                               <Text className="text-2xl font-medium text-center text-ink italic leading-8">“{profile.status_text}”</Text>
                           </View>
                       )}
                       <View className="p-4 bg-gray-50 border-t border-gray-100 items-center">
                           <View className="flex-row items-center justify-center mb-1">
                               <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest">Posted by {profile.full_name || profile.username}</Text>
                               {profile.is_verified && <IconSymbol name="checkmark.seal.fill" size={12} color="#3B82F6" style={{ marginLeft: 4 }} />}
                           </View>
                           {expiryText ? <Text className="text-[10px] text-gray-400 font-medium">{expiryText}</Text> : null}
                       </View>
                  </TouchableOpacity>
             </TouchableOpacity>
        </Modal>
    );
}
