import { ProfileActionButtons } from '@/components/ProfileActionButtons';
import { useStatus } from '@/components/StatusProvider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Image, LayoutAnimation, Modal, PanResponder, Platform, RefreshControl, Switch, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { ProfileData, ProfileModal } from '../../components/ProfileModal';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
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
  const { openModal, openCamera, activeStatuses, deleteStatus } = useStatus();
  const currentStatus = activeStatuses && activeStatuses.length > 0 ? activeStatuses[0] : null;
  // StatusItem has: id, content, type, caption, created_at, expires_at
  const currentStatusImage = currentStatus && currentStatus.type === 'image' ? currentStatus.content : null;
  const currentStatusText = currentStatus?.caption || (currentStatus && currentStatus.type === 'text' ? currentStatus.content : null);
  const [feed, setFeed] = useState<FeedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  // Scroll Animation
  const scrollY = useRef(new Animated.Value(0)).current;
  const STICKY_HEADER_HEIGHT = Platform.OS === 'ios' ? 86 : 56; // Height of fixed sticky header (reduced paddingBottom)
  const ANIMATED_HEADER_HEIGHT = 140; // Height of scrollable animated header section (reduced from 220)
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

  useEffect(() => {
    if (user) {
        // Fetch detailed interests & goals
        supabase.from('profiles').select('detailed_interests, relationship_goals').eq('id', user.id).single()
        .then(({ data }) => {
            if (data) {
                setMyInterests(data.detailed_interests);
                setMyGoals(data.relationship_goals);
            }
        });

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

    // Subscribe to changes
    const subscription = supabase
      .channel('pending-requests-proxy')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'interests',
        filter: `receiver_id=eq.${user.id}`
      }, () => {
        fetchPendingRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user]);

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
      
      // Fetch pending requests for each user
      const userIds = filtered.map((u: FeedProfile) => u.id);
      if (userIds.length > 0 && user) {
          const { data: pendingData } = await supabase
              .from('interests')
              .select('id, sender_id, receiver_id, status')
              .in('sender_id', [user.id, ...userIds])
              .in('receiver_id', [user.id, ...userIds])
              .in('status', ['pending']);
          
          // Create a map of user_id -> pending interest
          const pendingMap = new Map<string, { id: string; isReceived: boolean }>();
          pendingData?.forEach((interest: any) => {
              if (interest.sender_id === user.id) {
                  // User sent request to this person
                  pendingMap.set(interest.receiver_id, { id: interest.id, isReceived: false });
              } else if (interest.receiver_id === user.id) {
                  // User received request from this person
                  pendingMap.set(interest.sender_id, { id: interest.id, isReceived: true });
              }
          });
          
          // Add pending request info to each user
          const enrichedFeed = filtered.map((u: FeedProfile) => {
              const pending = pendingMap.get(u.id);
              return {
                  ...u,
                  pending_request: pending ? { id: pending.id, is_received: pending.isReceived } : null
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
      if (isProxyActive && location) {
        fetchProxyFeed();
      }
    }, [isProxyActive, location])
  );

  const sendInterest = async (targetUserId: string) => {
      const { error } = await supabase
        .from('interests')
        .insert({
            sender_id: user?.id,
            receiver_id: targetUserId,
            status: 'pending'
        });
      
      if (error) {
          if (error.code === '23505') {
              toast.show('Already Connected', 'info');
          } else {
              toast.show(error.message, 'error');
          }
      } else {
          toast.show('Interest sent successfully', 'success');
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

  const calculateMatchPercentage = (score: number) => {
    if (!myInterests) return 0;
    const myCatCount = Object.keys(myInterests).length;
    if (myCatCount === 0) return 0;
    const maxScore = myCatCount * 16; // 1 for cat + 3*5 for items
    return Math.round((score / maxScore) * 100);
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

  // Swipe gesture handler (swipe left for inbox, swipe right for camera)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
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
        const isFromLeftEdge = startX < 100;
        
        // Swipe left (dx < 0) to open inbox
        if (gestureState.dx < -100) {
          router.push('/inbox');
        }
        // Swipe right from left edge (dx > 0) to open camera
        else if (gestureState.dx > 100 && isFromLeftEdge) {
          openCamera(true, 'proxy'); // Pass true to indicate it's from swipe, and 'proxy' as source
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

  const renderCard = ({ item }: { item: FeedProfile }) => {
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
        className={`mb-6 rounded-3xl overflow-hidden ${isConnected ? 'bg-gray-50' : 'bg-white'} shadow-sm`}
        style={{
          borderWidth: 1,
          borderColor: 'rgba(148, 163, 184, 0.2)', // Slate-400 with low opacity for glass effect
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {/* Header: Name, Intent, Status */}
        <View 
          className="px-4 py-3 flex-row items-center justify-between bg-white/50"
          style={{
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(148, 163, 184, 0.15)', // Glass morphism border
          }}
        >
            <View className="flex-1 pr-2 justify-center">
                <View className="flex-row items-center mb-1">
                    <TouchableOpacity onPress={() => openProfile(item)}>
                        <Text className="text-lg font-bold text-ink mr-1" numberOfLines={1}>{item.full_name || item.username}</Text>
                    </TouchableOpacity>
                    {item.is_verified && <IconSymbol name="checkmark.seal.fill" size={14} color="#3B82F6" />}
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
                        <Text numberOfLines={1} className="text-[10px] text-green-800 italic flex-1 font-medium">"{item.status_text}"</Text>
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
                renderItem={({ item: imgPath }) => (
                    <TouchableOpacity 
                        activeOpacity={0.95} 
                        onPress={() => openProfile(item)}
                        style={{ width: CARD_WIDTH - 2, height: CARD_WIDTH - 2 }}
                    >
                        <FeedImage path={imgPath} resizeMode="cover" />
                    </TouchableOpacity>
                )}
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
      if (!addr) return 'this location';
      
      const isStreetNumber = addr.streetNumber && addr.name === addr.streetNumber;
      const isStreetName = addr.street && addr.name === addr.street;
      const isFullAddress = addr.street && addr.streetNumber && addr.name === `${addr.streetNumber} ${addr.street}`;
      
      if (addr.name && !isStreetNumber && !isStreetName && !isFullAddress) {
          const isNumeric = /^\d+$/.test(addr.name);
          if (!isNumeric) return addr.name;
      }

      return "your address";
  };

  return (
    <View className="flex-1 bg-white" {...panResponder.panHandlers}>
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
            backgroundColor: '#F8FAFC', // Slate-50 background
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
            }}
          />

          <View className="flex-row items-center" style={{ position: 'relative', minHeight: 40, zIndex: 1 }}>
            {/* Camera Icon (Left) - Fixed width */}
            <TouchableOpacity 
              onPress={() => openCamera(true, 'proxy')}
              className="w-10 h-10 items-center justify-center"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <IconSymbol name="camera.fill" size={24} color="#2D3748" />
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
            
            {/* Inbox Icon (Right) - Fixed width */}
            <TouchableOpacity 
              onPress={() => router.push('/requests')}
              className="w-10 h-10 items-center justify-center ml-auto"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <View>
                    <IconSymbol name="tray.fill" size={24} color="#2D3748" />
                    {pendingRequestsCount > 0 && (
                        <View className="absolute -top-1 -right-1 bg-red-500 rounded-full w-5 h-5 items-center justify-center border-2 border-white">
                            <Text className="text-white text-[10px] font-bold">{pendingRequestsCount > 9 ? '9+' : String(pendingRequestsCount)}</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
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
            backgroundColor: '#F9FAFB',
            transform: [{ translateY }],
        }}
        className="px-4 pt-4 shadow-sm"
      >
          <View className="flex-row gap-3">
              <TouchableOpacity 
                onPress={openModal}
                activeOpacity={0.9}
                className="flex-1 bg-white rounded-3xl p-3 shadow-sm h-28 justify-between"
                style={{
                  borderWidth: 1,
                  borderColor: 'rgba(148, 163, 184, 0.2)', // Glass morphism border
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                  <View className="flex-row justify-between items-start">
                      <View className={`w-10 h-10 rounded-full items-center justify-center border ${currentStatus ? 'border-green-400 bg-gray-100' : 'border-gray-200 border-dashed bg-gray-50'}`}>
                          {currentStatusImage ? (
                              <View className="w-full h-full rounded-full overflow-hidden">
                                  <FeedImage path={currentStatusImage} resizeMode="cover" />
                              </View>
                          ) : (
                              <IconSymbol name="plus" size={20} color="#9CA3AF" />
                          )}
                      </View>
                      {currentStatus && (
                          <View className="bg-green-100 px-2 py-0.5 rounded-full">
                              <Text className="text-[10px] font-bold text-green-700">ON</Text>
                          </View>
                      )}
                  </View>
                  
                  <View>
                      <Text className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">My Status</Text>
                      <Text className={`font-bold text-xs leading-4 ${currentStatus ? 'text-ink' : 'text-gray-400 italic'}`} numberOfLines={2}>
                          {currentStatusText ? `"${currentStatusText}"` : "What're you up to?"}
                      </Text>
                  </View>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => toggleProxy(!isProxyActive)}
                activeOpacity={0.9}
                className="flex-1 bg-white rounded-3xl p-3 shadow-sm h-28 justify-between"
                style={{
                  borderWidth: 1,
                  borderColor: 'rgba(148, 163, 184, 0.2)', // Glass morphism border
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                  <View className="flex-row justify-between items-start">
                      <View className={`w-10 h-10 rounded-full items-center justify-center ${isProxyActive ? 'bg-green-50' : 'bg-gray-50'}`}>
                          <IconSymbol name={isProxyActive ? "location.fill" : "location.slash"} size={20} color={isProxyActive ? "#10B981" : "#9CA3AF"} />
                      </View>
                      <Switch 
                          value={isProxyActive} 
                          onValueChange={toggleProxy}
                          trackColor={{ false: '#e2e8f0', true: '#1A1A1A' }}
                          thumbColor={'#fff'}
                          style={{ transform: [{ scaleX: 0.6 }, { scaleY: 0.6 }] }} 
                      />
                  </View>

                  <View>
                      <Text className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Proxy Mode</Text>
                      <Text className="text-ink font-bold text-xs leading-4" numberOfLines={2}>
                          {isProxyActive ? `Visible at ${getDisplayText(address)}.` : "Hidden from others."}
                      </Text>
                  </View>
              </TouchableOpacity>
          </View>
      </Animated.View>

      <Animated.FlatList
          data={isProxyActive ? feed : []}
          keyExtractor={(item) => item.id}
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
                    <IconSymbol name="location.slash.fill" size={64} color="#2D3748" />
                    <Text className="text-center font-bold text-ink text-xl mt-4">Proxy is Off</Text>
                    <Text className="text-center text-gray-500 text-sm mt-2">Flip the switch to connect.</Text>
                </View>
              ) : (
                <View className="items-center mt-12 opacity-60">
                     <Text className="text-ink text-lg font-medium">No one else is here yet.</Text>
                     <Text className="text-gray-500 text-sm mt-2 text-center px-8">Help grow the community - Tell your friends to turn on Proxy!</Text>
                </View>
              )
          }
          renderItem={renderCard}
          showsVerticalScrollIndicator={false}
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
                               <Text className="text-2xl font-medium text-center text-ink italic leading-8">"{profile.status_text}"</Text>
                           </View>
                       )}
                       <View className="p-4 bg-gray-50 border-t border-gray-100 items-center">
                           <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Posted by {profile.full_name || profile.username}</Text>
                           {expiryText ? <Text className="text-[10px] text-gray-400 font-medium">{expiryText}</Text> : null}
                       </View>
                  </TouchableOpacity>
             </TouchableOpacity>
        </Modal>
    );
}
