import { IconSymbol } from '@/components/ui/icon-symbol';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Image, PanResponder, RefreshControl, Text, TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions } from 'react-native';
import { ProfileData, ProfileModal } from '../../components/ProfileModal';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { showSafetyOptions } from '../../lib/safety';
import { supabase } from '../../lib/supabase';

type StatusItem = {
    id: string;
    content: string | null;
    type: 'text' | 'image';
    caption?: string;
    created_at: string;
    expires_at: string;
};

type FeedProfile = ProfileData & {
  dist_meters: number;
  statuses?: StatusItem[];
};

const CITY_RANGE = 50000; // 50km for "City"

export default function CityFeedScreen() {
  const { width, height: windowHeight } = useWindowDimensions();
  let tabBarHeight = 0;
  try {
      tabBarHeight = useBottomTabBarHeight();
  } catch (e) {
      tabBarHeight = 80; // Fallback
  }

  const [listHeight, setListHeight] = useState(windowHeight - tabBarHeight);
  const { user } = useAuth();
  const { location, address } = useProxyLocation();
  const [feed, setFeed] = useState<FeedProfile[]>([]);
  const [loading, setLoading] = useState(true); // Start with true to show loading state
  
  // Modal State
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [myInterests, setMyInterests] = useState<Record<string, string[]> | null>(null);
  const [myGoals, setMyGoals] = useState<string[] | null>(null);

  const router = useRouter();

  // Track initial touch position for swipe detection
  const initialTouchX = useRef<number | null>(null);

  // Swipe gesture handler (swipe left for inbox)
  const cityFeedPanResponder = useRef(
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
        // Swipe left (dx < 0) to open inbox
        if (gestureState.dx < -100) {
          router.push('/inbox');
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

  useEffect(() => {
    if (user) {
        supabase.from('profiles').select('detailed_interests, relationship_goals').eq('id', user.id).single()
        .then(({ data }) => {
            if (data) {
                setMyInterests(data.detailed_interests);
                setMyGoals(data.relationship_goals);
            }
        });
    }
  }, [user]);

  const fetchFeed = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (!location) {
      setLoading(false);
      setFeed([]);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('get_city_users', {
        lat: location.coords.latitude,
        long: location.coords.longitude,
        range_meters: CITY_RANGE
      });

      if (error) {
        console.error('Error fetching city feed:', error);
        setFeed([]);
      } else if (data) {
        // 1. Filter: Only show users with active statuses
        let filtered = data.filter((u: FeedProfile) => u.statuses && u.statuses.length > 0);

        // 2. Sort: Top down based on Interest Match Score
        if (myInterests) {
            filtered.sort((a: FeedProfile, b: FeedProfile) => {
                const scoreA = calculateRawMatchScore(a.detailed_interests);
                const scoreB = calculateRawMatchScore(b.detailed_interests);
                return scoreB - scoreA; // Descending order
            });
        }

        // 3. Fetch pending requests for each user
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
      } else {
        setFeed([]);
      }
    } catch (err) {
      console.error('Error in fetchFeed:', err);
      setFeed([]);
    } finally {
      setLoading(false);
    }
  }, [user, location, myInterests]);

  const calculateRawMatchScore = (userInterests: any) => {
      if (!myInterests || !userInterests) return 0;
      let score = 0;
      Object.keys(myInterests).forEach(cat => {
          if (userInterests[cat]) {
              score += 1; // Category match
              const myTags = myInterests[cat].map((t: string) => t.toLowerCase().trim());
              userInterests[cat].forEach((t: string) => {
                  if (myTags.includes(t.toLowerCase().trim())) score += 5; // Tag match
              });
          }
      });
      return score;
  };

  // Find common interests between my interests and user's interests
  const getCommonInterests = (userInterests: Record<string, string[]> | null): string[] => {
      if (!myInterests || !userInterests) return [];
      const common: string[] = [];
      
      Object.keys(myInterests).forEach(cat => {
          if (userInterests[cat]) {
              // Check for matching sub-interests
              const myTags = myInterests[cat].map((t: string) => t.toLowerCase().trim());
              const userTags = userInterests[cat].map((t: string) => t.toLowerCase().trim());
              const matchingTags = userTags.filter(tag => myTags.includes(tag));
              
              if (matchingTags.length > 0) {
                  // Add category and matching tags
                  matchingTags.forEach(tag => {
                      const originalTag = userInterests[cat].find((t: string) => t.toLowerCase().trim() === tag);
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

  // Fetch feed when:
  // 1. Component mounts (opening tab)
  // 2. Tab comes into focus
  // 3. Manual refresh (pull-to-refresh)
  // 4. Interests change (for re-sorting)
  
  // Initial fetch on mount and when interests change
  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Refresh when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchFeed();
    }, [fetchFeed])
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
               Alert.alert('Already Connected', 'You have already sent an interest to this person.');
          } else {
               Alert.alert('Error', error.message);
          }
      } else {
          Alert.alert('Sent!', 'Interest sent successfully.');
          fetchFeed(); // Refresh feed
      }
  };

  const handleAcceptRequest = async (interestId: string) => {
      const { error } = await supabase
          .from('interests')
          .update({ status: 'accepted' })
          .eq('id', interestId);
      
      if (error) {
          Alert.alert('Error', error.message);
      } else {
          Alert.alert('Accepted!', 'Request accepted!');
          fetchFeed(); // Refresh feed
      }
  };

  const handleDeclineRequest = async (interestId: string) => {
      const { error } = await supabase
          .from('interests')
          .update({ status: 'declined' })
          .eq('id', interestId);
      
      if (error) {
          Alert.alert('Error', error.message);
      } else {
          Alert.alert('Declined', 'Request declined.');
          fetchFeed(); // Refresh feed
      }
  };

  const handleSafety = (targetUserId: string) => {
    if (user) {
        showSafetyOptions(user.id, targetUserId, () => {
            // Remove user from feed immediately
            setFeed(prev => prev.filter(p => p.id !== targetUserId));
        });
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

  return (
    <View className="flex-1 bg-ink" {...cityFeedPanResponder.panHandlers}>
      <FlatList
        data={feed}
        renderItem={({ item }) => (
            <CityFeedCard 
                item={item} 
                width={width} 
                listHeight={listHeight} 
                tabBarHeight={tabBarHeight} 
                router={router} 
                sendInterest={sendInterest} 
                handleSafety={handleSafety} 
                openProfile={openProfile}
                percentage={calculateMatchPercentage(item.detailed_interests)}
                getCommonInterests={getCommonInterests}
                handleAcceptRequest={handleAcceptRequest}
                handleDeclineRequest={handleDeclineRequest}
            />
        )}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFeed} tintColor="white" />}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        decelerationRate="fast"
        ListEmptyComponent={
            loading ? (
                <View style={{ height: listHeight }} className="items-center justify-center">
                    <ActivityIndicator size="large" color="white" />
                    <Text className="text-white mt-4 text-lg">Loading feed...</Text>
                </View>
            ) : (
                <View style={{ height: listHeight }} className="items-center justify-center px-10 opacity-70">
                    <IconSymbol name="moon.stars.fill" size={64} color="#A0AEC0" />
                    <Text className="text-gray-400 text-xl font-bold mt-6 text-center">It's quiet in {address?.city || 'the city'}...</Text>
                    <Text className="text-gray-600 text-base mt-2 text-center">Be the first to share your status!</Text>
                </View>
            )
        }
        ListFooterComponent={
            feed.length > 0 ? (
                <View style={{ height: listHeight, width: width }} className="bg-ink items-center justify-center px-8">
                    <IconSymbol name="checkmark.circle.fill" size={80} color="#4ade80" />
                    <Text className="text-white text-3xl font-extrabold mt-6 text-center">You're All Caught Up!</Text>
                    <Text className="text-gray-400 text-lg mt-4 text-center mb-8">
                        Start a conversation with your connections.
                    </Text>
                    <TouchableOpacity 
                        onPress={() => router.push(`/connections/${user?.id}`)}
                        className="bg-white px-8 py-4 rounded-full shadow-lg"
                    >
                        <Text className="text-ink font-bold text-lg uppercase tracking-wider">Go to Connections</Text>
                    </TouchableOpacity>
                </View>
            ) : null
        }
      />
      <ProfileModal 
         visible={modalVisible}
         profile={selectedProfile}
         onClose={() => setModalVisible(false)}
         myInterests={myInterests}
         myGoals={myGoals}
         onStateChange={() => {
             if (location) {
                 fetchFeed();
             }
         }}
      />
    </View>
  );
}

function CityFeedCard({ 
    item, 
    width, 
    listHeight, 
    tabBarHeight, 
    router, 
    sendInterest, 
    handleSafety, 
    openProfile,
    percentage,
    getCommonInterests,
    handleAcceptRequest,
    handleDeclineRequest
}: { 
    item: FeedProfile, 
    width: number, 
    listHeight: number, 
    tabBarHeight: number, 
    router: any, 
    sendInterest: (id: string) => void, 
    handleSafety: (id: string) => void,
    openProfile: (profile: FeedProfile) => void,
    percentage: number,
    getCommonInterests: (userInterests: Record<string, string[]> | null) => string[];
    handleAcceptRequest: (interestId: string) => void;
    handleDeclineRequest: (interestId: string) => void;
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [showProfilePrompt, setShowProfilePrompt] = useState(false);
    const statuses = item.statuses || [];
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    
    // Animated progress bars for each status
    const progressAnimsRef = useRef<Animated.Value[]>([]);
    
    // Initialize progress animations when statuses change
    useEffect(() => {
        if (statuses.length !== progressAnimsRef.current.length) {
            progressAnimsRef.current = statuses.map(() => new Animated.Value(0));
        }
    }, [statuses.length]);
    
    // Show profile prompt slide after last status
    const isShowingProfilePrompt = showProfilePrompt && activeIndex >= statuses.length;
    const currentStatus = isShowingProfilePrompt ? null : statuses[activeIndex];
    const lastImageStatus = statuses.filter(s => s.type === 'image').pop();

    // Animate progress bar for current status
    useEffect(() => {
        if (isPaused || isShowingProfilePrompt || activeIndex >= statuses.length || !progressAnimsRef.current[activeIndex]) {
            // Pause animation
            progressAnimsRef.current[activeIndex]?.stopAnimation();
            return;
        }

        // Reset and animate current progress bar
        progressAnimsRef.current[activeIndex].setValue(0);
        const anim = Animated.timing(progressAnimsRef.current[activeIndex], {
            toValue: 1,
            duration: 5000,
            useNativeDriver: false, // Width animation doesn't support native driver
        });

        anim.start(({ finished }) => {
            if (finished && !isPaused) {
                if (activeIndex < statuses.length - 1) {
                    setActiveIndex(activeIndex + 1);
                } else {
                    // After last status, show profile prompt
                    setShowProfilePrompt(true);
                    setActiveIndex(statuses.length);
                }
            }
        });

        return () => {
            anim.stop();
        };
    }, [activeIndex, isPaused, statuses.length, isShowingProfilePrompt]);

    // Reset when item changes
    useEffect(() => {
        setActiveIndex(0);
        setShowProfilePrompt(false);
        setIsPaused(false);
        // Reset all progress bars
        progressAnimsRef.current.forEach(anim => anim.setValue(0));
    }, [item.id]);

    const handleTap = (evt: any) => {
        if (isShowingProfilePrompt) {
            openProfile(item);
            return;
        }

        const x = evt.nativeEvent.locationX;
        if (x < width * 0.3) {
            // Previous
            if (activeIndex > 0) {
                setActiveIndex(activeIndex - 1);
                setShowProfilePrompt(false);
            }
        } else {
            // Next
            if (activeIndex < statuses.length - 1) {
                setActiveIndex(activeIndex + 1);
                setShowProfilePrompt(false);
            } else {
                // If last, show profile prompt
                setShowProfilePrompt(true);
                setActiveIndex(statuses.length);
            }
        }
    };

    const handlePressIn = () => {
        setIsPaused(true);
    };

    const handlePressOut = () => {
        setIsPaused(false);
    };

    // Slide down gesture to open profile
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                // Only trigger on downward swipes (dy > dx and dy > 50px)
                return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 50;
            },
            onPanResponderRelease: (evt, gestureState) => {
                // If swiped down more than 100px, open profile
                if (gestureState.dy > 100) {
                    openProfile(item);
                }
            },
        })
    ).current;

    const primaryGoal = item.relationship_goals?.[0];
    const theme = getTheme(primaryGoal);
    const isConnected = !!item.connection_id;
    
    // Get common interests
    const commonInterests = getCommonInterests ? getCommonInterests(item.detailed_interests) : [];

    if (!currentStatus && !isShowingProfilePrompt) return null;

    return (
      <View style={{ height: listHeight, width: width }} className="bg-black relative shadow-2xl overflow-hidden">
        
        {/* Status Progress Bars with Animation */}
        {!isShowingProfilePrompt && (
            <View className="absolute top-14 left-2 right-2 flex-row gap-1 z-50 h-1">
                {statuses.map((_, i) => {
                    const progressAnim = progressAnimsRef.current[i];
                    const progressWidth = progressAnim ? progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                    }) : '0%';
                    
                    return (
                        <View 
                            key={i} 
                            className="flex-1 h-full rounded-full bg-white/30 overflow-hidden"
                        >
                            {i === activeIndex && progressAnim ? (
                                <Animated.View
                                    style={{
                                        width: progressWidth,
                                        height: '100%',
                                        backgroundColor: 'white',
                                        borderRadius: 999,
                                    }}
                                />
                            ) : i < activeIndex ? (
                                <View className="w-full h-full bg-white rounded-full" />
                            ) : null}
                        </View>
                    );
                })}
            </View>
        )}

        {/* Content Area (Tap to Advance / Hold to Pause / Slide Down for Profile) */}
        <View 
            style={{ width, height: listHeight }}
            {...panResponder.panHandlers}
        >
            <TouchableWithoutFeedback 
                onPress={handleTap}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
            >
                <View style={{ width, height: listHeight }}>
                {isShowingProfilePrompt ? (
                    // Profile Prompt Slide - Blurred last photo
                    <View style={{ width, height: listHeight, position: 'relative' }}>
                        {lastImageStatus ? (
                            <>
                                <FeedImage path={lastImageStatus.content} containerHeight={listHeight} containerWidth={width} />
                                {/* Strong blur effect using multiple dark overlays */}
                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)' }} />
                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.3)' }} />
                            </>
                        ) : (
                            <View className="w-full h-full bg-ink" />
                        )}
                        <View 
                            style={{ 
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                justifyContent: 'center',
                                alignItems: 'center',
                                paddingHorizontal: 32,
                                paddingVertical: 32
                            }}
                        >
                            <View style={{ alignItems: 'center' }}>
                                <View className="w-32 h-32 rounded-full overflow-hidden mb-4 border-4 border-white/50" style={{ position: 'relative' }}>
                                    <FeedImage path={item.avatar_url} containerHeight={128} containerWidth={128} />
                                    {/* Verified badge on avatar */}
                                    {item.is_verified && (
                                        <View
                                            style={{
                                                position: 'absolute',
                                                bottom: 0,
                                                right: 0,
                                                backgroundColor: '#3B82F6',
                                                borderRadius: 14,
                                                width: 28,
                                                height: 28,
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                shadowColor: '#000',
                                                shadowOffset: { width: 0, height: 2 },
                                                shadowOpacity: 0.3,
                                                shadowRadius: 4,
                                                elevation: 5,
                                                borderWidth: 2.5,
                                                borderColor: '#fff',
                                            }}
                                        >
                                            <IconSymbol name="checkmark.seal.fill" size={16} color="#fff" />
                                        </View>
                                    )}
                                </View>
                                <Text className="text-white text-3xl font-bold mb-2 text-center shadow-lg">
                                    View {item.full_name}'s Profile
                                </Text>
                                <Text className="text-white/80 text-lg text-center mb-6 shadow-md">
                                    Tap to see more
                                </Text>
                                <TouchableOpacity
                                    onPress={() => openProfile(item)}
                                    className="bg-white px-8 py-4 rounded-full shadow-xl mb-4"
                                >
                                    <Text className="text-black font-bold text-lg">View Profile</Text>
                                </TouchableOpacity>
                                {/* Replay Button - Circular Arrow Icon */}
                                <TouchableOpacity
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        setActiveIndex(0);
                                        setShowProfilePrompt(false);
                                    }}
                                    className="w-14 h-14 bg-white/20 rounded-full items-center justify-center border-2 border-white/50 backdrop-blur-md shadow-xl"
                                >
                                    <IconSymbol name="arrow.counterclockwise" size={24} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ) : currentStatus ? (
                    <>
                        {currentStatus.type === 'image' ? (
                            <FeedImage path={currentStatus.content} containerHeight={listHeight} containerWidth={width} />
                        ) : (
                            <View className="w-full h-full items-center justify-center bg-ink p-8">
                                <Text className="text-white text-2xl font-bold italic text-center leading-9">
                                    "{currentStatus.content}"
                                </Text>
                            </View>
                        )}
                        {/* Gradient Overlay for Text Visibility if Image */}
                        {currentStatus.type === 'image' && (
                            <View className="absolute inset-0 bg-black/10" />
                        )}
                    </>
                ) : null}
            </View>
        </TouchableWithoutFeedback>
        </View>
            
        {/* Top Overlay: Compact Header */}
        {!isShowingProfilePrompt && (
            <View className="absolute top-0 left-0 right-0 pt-16 pb-4 px-4 pointer-events-none">
            <View className="flex-row items-center mt-4">
                 <TouchableOpacity onPress={() => openProfile(item)} className="flex-row items-center">
                    {/* Small Avatar next to name */}
                    <View className="w-8 h-8 rounded-full overflow-hidden mr-2 border border-white/50" style={{ position: 'relative' }}>
                        <FeedImage path={item.avatar_url} containerHeight={32} containerWidth={32} />
                        {/* Verified badge on small avatar */}
                        {item.is_verified && (
                            <View
                                style={{
                                    position: 'absolute',
                                    bottom: -2,
                                    right: -2,
                                    backgroundColor: '#3B82F6',
                                    borderRadius: 7,
                                    width: 14,
                                    height: 14,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 1 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 2,
                                    elevation: 4,
                                    borderWidth: 1.5,
                                    borderColor: '#fff',
                                }}
                            >
                                <IconSymbol name="checkmark.seal.fill" size={8} color="#fff" />
                            </View>
                        )}
                    </View>
                    <View>
                        <View className="flex-row items-center">
                            <Text className="text-white text-base font-bold mr-1 shadow-md">{item.full_name}</Text>
                            {item.is_verified && <IconSymbol name="checkmark.seal.fill" size={14} color="#3B82F6" />}
                        </View>
                        <View className="flex-row items-center">
                            <Text className="text-gray-300 text-[10px] font-semibold shadow-sm">@{item.username}</Text>
                            {currentStatus && (
                                <Text className="text-gray-400 text-[9px] ml-2 shadow-sm">
                                    • {formatTimeAgo(currentStatus.created_at)}
                                </Text>
                            )}
                        </View>
                    </View>
                 </TouchableOpacity>

                 <View className="ml-auto flex-row items-center bg-black/30 px-2 py-0.5 rounded border border-white/10 backdrop-blur-md">
                     <IconSymbol name="location.fill" size={10} color="#E5E7EB" style={{marginRight:3}}/>
                     <Text className="text-gray-200 text-[10px] font-bold uppercase shadow-sm">
                        {item.city ? item.city : Math.round(item.dist_meters / 1000) + 'km'}
                     </Text>
                 </View>
            </View>
            {percentage > 0 && (
                 <View className="self-start mt-2 bg-white/20 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">
                      <Text className="text-white text-xs font-bold">{percentage}% Match</Text>
                 </View>
            )}
        </View>
        )}

        {/* Bottom Overlay: Caption/Bio & Actions */}
        {!isShowingProfilePrompt && (
            <View className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pt-12" style={{ paddingBottom: tabBarHeight - 8 }}>
            <View className="flex-row items-end justify-between">
                {/* Left Column: Text Content */}
                <View className="flex-1 mr-4">
                    {/* If Image, show Caption or Text status - Big text at top */}
                    {currentStatus?.caption && (
                        <Text className="text-white text-2xl font-bold mb-3 leading-8 shadow-lg">
                            {currentStatus.caption}
                        </Text>
                    )}
                    
                    {/* Relationship Goals */}
                    {item.relationship_goals && item.relationship_goals.length > 0 && (
                        <View className="flex-row mb-2 flex-wrap">
                            {item.relationship_goals.map((goal, idx) => {
                                const goalTheme = getTheme(goal);
                                return (
                                    <View key={idx} className={`px-2 py-0.5 rounded mr-2 mb-1 border ${goalTheme.border} ${goalTheme.badge}`}>
                                        <Text className={`${goalTheme.text} text-[10px] font-bold uppercase tracking-wider`}>{goal}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {/* Common Interests */}
                    {commonInterests.length > 0 && (
                        <View className="flex-row items-center flex-wrap mb-2">
                            <IconSymbol name="star.fill" size={12} color="#FFD700" style={{ marginRight: 4 }} />
                            <Text className="text-white text-xs font-bold mr-1.5 shadow-sm">Common interests:</Text>
                            {commonInterests.map((interest, idx) => (
                                <Text key={idx} className="text-white/90 text-xs font-medium mr-1.5 shadow-sm">
                                    {interest.split(': ').pop()}{idx < commonInterests.length - 1 ? ',' : ''}
                                </Text>
                            ))}
                        </View>
                    )}

                    {/* Bio Teaser */}
                    <Text className="text-gray-200 text-xs leading-4 mb-2 font-medium shadow-sm opacity-80" numberOfLines={2}>
                        {item.bio}
                    </Text>

                    {/* Detailed Interests Preview */}
                    {item.detailed_interests && (
                        <View className="flex-row flex-wrap mb-1 opacity-70">
                            {Object.entries(item.detailed_interests).slice(0, 3).map(([cat, details], i) => (
                                <Text key={i} className="text-white text-[10px] mr-2">
                                    #{cat}
                                </Text>
                            ))}
                        </View>
                    )}
                </View>

                {/* Right Column: Actions */}
                <View className="items-center pb-1 gap-y-4 mb-6">
                     <TouchableOpacity 
                        className="w-10 h-10 bg-black/20 rounded-full items-center justify-center backdrop-blur-md border border-white/10"
                        onPress={(e) => {
                            e.stopPropagation(); 
                            handleSafety(item.id);
                        }}
                    >
                        <IconSymbol name="ellipsis" size={20} color="white" />
                    </TouchableOpacity>

                    {isConnected ? (
                        <TouchableOpacity 
                            className="w-10 h-10 rounded-full items-center justify-center shadow-xl bg-ink border border-white/10"
                            onPress={(e) => {
                                e.stopPropagation();
                                router.push(`/chat/${item.connection_id}`);
                            }}
                        >
                            <IconSymbol name="bubble.left.fill" size={18} color="white" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity 
                            className={`w-10 h-10 rounded-full items-center justify-center shadow-xl ${theme.button} border border-white/10 bg-opacity-80`}
                            onPress={(e) => {
                                e.stopPropagation(); 
                                openProfile(item);
                            }}
                        >
                            <IconSymbol name="eye.fill" size={18} color="white" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
        )}
      </View>
    );
}

const getTheme = (goal?: string) => {
    switch(goal) {
        case 'Romance': return { button: 'bg-romance', badge: 'bg-romance/20', text: 'text-romance', border: 'border-romance/50' };
        case 'Friendship': return { button: 'bg-friendship', badge: 'bg-friendship/20', text: 'text-friendship', border: 'border-friendship/50' };
        case 'Professional': return { button: 'bg-business', badge: 'bg-business/20', text: 'text-business', border: 'border-business/50' };
        default: return { button: 'bg-white', badge: 'bg-white/20', text: 'text-white', border: 'border-white/20' };
    }
};

function FeedImage({ path, containerHeight, containerWidth }: { path: string | null, containerHeight?: number, containerWidth?: number }) {
    const [url, setUrl] = useState<string | null>(null);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  
    useEffect(() => {
      if (!path) return;
      if (path.startsWith('http')) {
          setUrl(path);
          return;
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setUrl(data.publicUrl);
    }, [path]);

    // Get image dimensions when URL loads (only for main feed images, not avatars)
    useEffect(() => {
        if (!url || !containerHeight || !containerWidth || containerHeight < 100) return; // Skip for small avatars
        
        Image.getSize(url, (width, height) => {
            setImageDimensions({ width, height });
        }, () => {
            // If getSize fails, assume square
            setImageDimensions({ width: 1, height: 1 });
        });
    }, [url, containerHeight, containerWidth]);
  
    if (!url) return <View className="w-full h-full bg-ink" />;

    // For avatars (small containers), always use cover to fill the circle
    if (containerHeight && containerWidth && containerHeight < 100) {
        return (
            <Image 
                source={{ uri: url }} 
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
            />
        );
    }

    // For main feed images (not avatars), check orientation and apply appropriate display
    if (containerHeight && containerWidth && containerHeight > 100 && imageDimensions) {
        const imageAspect = imageDimensions.width / imageDimensions.height;
        
        // If image is landscape (width > height, aspect > 1), letterbox it with black bars
        // If image is vertical (height > width, aspect < 1), fill the screen
        if (imageAspect > 1) {
            // Image is landscape (wider than tall) - letterbox (black bars top/bottom)
            const imageDisplayHeight = containerWidth / imageAspect;
            
            return (
                <View className="w-full h-full bg-black items-center justify-center">
                    <Image 
                        source={{ uri: url }} 
                        style={{ width: containerWidth, height: imageDisplayHeight }}
                        resizeMode="contain"
                    />
                </View>
            );
        } else {
            // Image is vertical or square (height >= width) - fill the screen without cropping
            // Use contain to show full image, then center it
            const imageAspect = imageDimensions.width / imageDimensions.height;
            const containerAspect = containerWidth / containerHeight;
            
            if (imageAspect < containerAspect) {
                // Image is taller relative to container - fit height, center horizontally
                const imageDisplayWidth = containerHeight * imageAspect;
                return (
                    <View className="w-full h-full bg-black items-center justify-center">
                        <Image 
                            source={{ uri: url }} 
                            style={{ width: imageDisplayWidth, height: containerHeight }}
                            resizeMode="contain"
                        />
                    </View>
                );
            } else {
                // Image fits width - fill screen
                return (
                    <Image 
                        source={{ uri: url }} 
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                    />
                );
            }
        }
    }
  
    // Default: fill screen (for avatars or when dimensions aren't loaded yet)
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    );
}

function formatTimeAgo(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    // For older posts, show date
    return time.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
