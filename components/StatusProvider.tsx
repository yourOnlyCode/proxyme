import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/lib/auth';
import { isReviewUser } from '@/lib/reviewMode';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
    useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraModal } from './CameraModal';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const LAST_STATUS_TAB_KEY = 'last_status_tab';
const SEEN_STATUS_IDS_KEY = 'seen_status_ids_v1';

const getSeenStatusKey = (userId: string) => `${SEEN_STATUS_IDS_KEY}:${userId}`;

export type StatusItem = {
    id: string;
    content: string | null;
    type: 'text' | 'image';
    caption?: string;
    created_at: string;
    expires_at: string;
};

type StatusContextType = {
    openModal: () => void;
    openCamera: (fromSwipe?: boolean, source?: 'proxy' | 'status') => void;
    closeModal: () => void;
    activeStatuses: StatusItem[];
    seenStatusIds: string[];
    currentProfile: { avatar_url: string | null; full_name: string; username: string; city: string | null; is_verified: boolean } | null;
    openMyStatusViewer: (startIndex?: number) => void;
    openStatusViewer: (params: {
      statuses: StatusItem[];
      profile: { avatar_url: string | null; full_name: string; username: string; city: string | null; is_verified: boolean };
      startIndex?: number;
      allowDelete?: boolean;
    }) => void;
    fetchStatus: () => void;
    deleteStatus: (id: string) => Promise<void>;
};

const StatusContext = createContext<StatusContextType | undefined>(undefined);

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  
  const [modalVisible, setModalVisible] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [cameraFromSwipe, setCameraFromSwipe] = useState(false);
  const [cameraSource, setCameraSource] = useState<'proxy' | 'status'>('status');
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewStartIndex, setPreviewStartIndex] = useState(0);
  const [previewStatuses, setPreviewStatuses] = useState<StatusItem[]>([]);
  const [previewProfile, setPreviewProfile] = useState<{ avatar_url: string | null; full_name: string; username: string; city: string | null; is_verified: boolean } | null>(null);
  const [previewAllowDelete, setPreviewAllowDelete] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [userProfile, setUserProfile] = useState<{ avatar_url: string | null; full_name: string; username: string; city: string | null; is_verified: boolean } | null>(null);
  const [seenStatusIds, setSeenStatusIds] = useState<string[]>([]);
  const persistSeenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [relationshipGoal, setRelationshipGoal] = useState<string | null>(null);
  // Tab order: My Status (0), My Clubs (1) - Penpal hidden for beta
  const tabs = ['status', 'clubs'] as const;
  type TabType = typeof tabs[number];
  const [activeTab, setActiveTab] = useState<TabType>('status');
  const tabScrollX = useRef(new Animated.Value(0)).current;
  const tabIndexRef = useRef(0); // Start at index 0 (My Status)
  
  // Status Data
  const [statusText, setStatusText] = useState('');
  const [statusImage, setStatusImage] = useState<string | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<StatusItem[]>([]);
  const statusTabScrollRef = useRef<ScrollView | null>(null);
  
  // Clubs Data
  const [myClubs, setMyClubs] = useState<any[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [selectedClub, setSelectedClub] = useState<any | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [forumTitle, setForumTitle] = useState('');
  const [forumContent, setForumContent] = useState('');
  const [creatingPost, setCreatingPost] = useState(false);

  // Fetch clubs for the status modal (used by the "clubs" tab).
  useEffect(() => {
    if (!modalVisible || activeTab !== 'clubs' || !user) return;
    let cancelled = false;
    (async () => {
      setLoadingClubs(true);
      try {
        const { data, error } = await supabase
          .from('club_members')
          .select(
            `
              role,
              club:clubs (
                id, name, description, image_url, city
              )
            `,
          )
          .eq('user_id', user.id)
          .eq('status', 'accepted');
        if (error) throw error;
        const clubs = (data || []).map((item: any) => ({ ...item.club, role: item.role }));
        if (!cancelled) setMyClubs(clubs);
      } catch {
        if (!cancelled) toast.show('Failed to load clubs', 'error');
      } finally {
        if (!cancelled) setLoadingClubs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalVisible, activeTab, user?.id]);

  useEffect(() => {
    if (!selectedClub || !modalVisible || activeTab !== 'clubs') return;
    fetchUpcomingEvents(selectedClub.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClub, modalVisible, activeTab]);

  const fetchUpcomingEvents = async (clubId: string) => {
    if (!user) return;
    setLoadingEvents(true);
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('club_events')
        .select('id, club_id, title, description, event_date, location, created_by, created_at')
        .eq('club_id', clubId)
        .gte('event_date', now)
        .order('event_date', { ascending: true })
        .limit(5);
      
      if (error) throw error;
      setUpcomingEvents(data || []);
    } catch (e: any) {
      toast.show('Failed to load events', 'error');
    } finally {
      setLoadingEvents(false);
    }
  };

  const createForumPost = async () => {
    if (!selectedClub || !forumTitle.trim() || !forumContent.trim() || !user) {
      toast.show('Title and content are required', 'error');
      return;
    }

    setCreatingPost(true);
    try {
      const { error } = await supabase
        .from('club_forum_topics')
        .insert({
          club_id: selectedClub.id,
          created_by: user.id,
          title: forumTitle.trim(),
          content: forumContent.trim()
        });

      if (error) throw error;

      setForumTitle('');
      setForumContent('');
      toast.show('Forum post created!', 'success');
    } catch (e: any) {
      toast.show(e.message || 'Failed to create post', 'error');
    } finally {
      setCreatingPost(false);
    }
  };

  const modalTranslateY = useRef(new Animated.Value(0)).current;
  
  // Radiating animation for submit button
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  // Fetch status
  const fetchStatus = async () => {
      if (!user) return;
      
      // Fetch from new statuses table via RPC
      const { data, error } = await supabase.rpc('get_my_statuses');
      
      if (!error && data) {
          // Map DB columns to StatusItem
          const items: StatusItem[] = data.map((item: any) => ({
              id: item.id,
              content: item.content,
              type: item.type,
              caption: item.caption,
              created_at: item.created_at,
              expires_at: item.expires_at
          }));
          setActiveStatuses(items);
      }
  };

  useEffect(() => {
      if (user) {
          fetchStatus();
          fetchUserProfile();
      }
  }, [user]);

  // Load seen status ids from storage (per-device)
  useEffect(() => {
      if (!user) return;
      AsyncStorage.getItem(getSeenStatusKey(user.id)).then((raw) => {
          if (!raw) return;
          try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                  setSeenStatusIds(parsed.filter((x) => typeof x === 'string'));
              }
          } catch {
              // ignore
          }
      });
  }, [user?.id]);

  // Persist seen ids (debounced)
  useEffect(() => {
      if (!user) return;
      if (persistSeenTimer.current) clearTimeout(persistSeenTimer.current);
      persistSeenTimer.current = setTimeout(() => {
          AsyncStorage.setItem(getSeenStatusKey(user.id), JSON.stringify(seenStatusIds)).catch(() => {});
      }, 250);
      return () => {
          if (persistSeenTimer.current) clearTimeout(persistSeenTimer.current);
      };
  }, [seenStatusIds, user?.id]);

  const fetchUserProfile = async () => {
      if (!user) return;
      const { data } = await supabase
          .from('profiles')
          .select('avatar_url, full_name, username, city, is_verified, relationship_goals')
          .eq('id', user.id)
          .single();
      if (data) {
          setUserProfile({
              avatar_url: data.avatar_url,
              full_name: data.full_name || 'You',
              username: data.username || 'user',
              city: data.city || null,
              is_verified: data.is_verified || false
          });
          if (data.relationship_goals && data.relationship_goals.length > 0) {
              setRelationshipGoal(data.relationship_goals[0]);
          }
      }
  };

  // Get color based on relationship goal
  const getButtonColor = () => {
      switch(relationshipGoal) {
          case 'Romance': return '#E07A5F';
          case 'Friendship': return '#81B29A';
          case 'Professional': return '#3D405B';
          default: return '#000000';
      }
  };

  // Start radiating animation for submit button
  useEffect(() => {
      if (modalVisible && !updating) {
          const pulse = Animated.loop(
              Animated.sequence([
                  Animated.parallel([
                      Animated.timing(pulseAnim, {
                          toValue: 1.15,
                          duration: 1500,
                          useNativeDriver: true,
                      }),
                      Animated.timing(pulseScale, {
                          toValue: 1.1,
                          duration: 1500,
                          useNativeDriver: true,
                      }),
                  ]),
                  Animated.parallel([
                      Animated.timing(pulseAnim, {
                          toValue: 1,
                          duration: 1500,
                          useNativeDriver: true,
                      }),
                      Animated.timing(pulseScale, {
                          toValue: 1,
                          duration: 1500,
                          useNativeDriver: true,
                      }),
                  ]),
              ])
          );
          pulse.start();
          return () => pulse.stop();
      } else {
          pulseAnim.setValue(1);
          pulseScale.setValue(1);
      }
  }, [modalVisible, updating]);

  const deleteStatus = async (id: string) => {
      if (!user) return;
      
      // Optimistic Update
      const previousStatuses = [...activeStatuses];
      setActiveStatuses(prev => prev.filter(s => s.id !== id));
      
      toast.show('Removing status...', 'info');

      const { error } = await supabase.from('statuses').delete().eq('id', id);

      if (error) {
          toast.show('Failed to remove status', 'error');
          setActiveStatuses(previousStatuses); // Revert
      } else {
          toast.show('Status removed', 'success');
          // Also update profile status if it was the latest (legacy support)
          // Actually, let's just rely on the new table. 
          // If we want to keep profile.status_text in sync, we'd need a trigger or manual update.
          // For now, we assume the new feed reads from 'statuses' table.
      }
  };

  const markStatusSeen = (statusId: string) => {
      if (!statusId) return;
      setSeenStatusIds((prev) => (prev.includes(statusId) ? prev : [...prev, statusId]));
  };

  // Load last used tab
  useEffect(() => {
    if (modalVisible) {
      AsyncStorage.getItem(LAST_STATUS_TAB_KEY).then((lastTab) => {
        if (lastTab && tabs.includes(lastTab as TabType)) {
          const index = tabs.indexOf(lastTab as TabType);
          setActiveTab(lastTab as TabType);
          tabIndexRef.current = index;
          tabScrollX.setValue(-index * SCREEN_WIDTH);
        } else {
          // Default to My Status (index 0)
          setActiveTab('status');
          tabIndexRef.current = 0;
          tabScrollX.setValue(0);
        }
      });
    }
  }, [modalVisible]);

  // Handle tab change with animation and save
  const changeTab = (newTab: TabType, index: number) => {
    setActiveTab(newTab);
    tabIndexRef.current = index;
    AsyncStorage.setItem(LAST_STATUS_TAB_KEY, newTab);
    Animated.spring(tabScrollX, {
      toValue: -index * SCREEN_WIDTH,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  };

  // If a nested horizontal scroller (like Upcoming Events) is being interacted with,
  // we should NOT let the outer tab-swipe PanResponder steal the gesture.
  const blockTabSwipeRef = useRef(false);

  // PanResponder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (blockTabSwipeRef.current) return false;
        // Only respond to horizontal swipes that are more horizontal than vertical
        const isHorizontalSwipe = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasEnoughMovement = Math.abs(gestureState.dx) > 15;
        return isHorizontalSwipe && hasEnoughMovement;
      },
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        if (blockTabSwipeRef.current) return false;
        const isHorizontalSwipe = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasEnoughMovement = Math.abs(gestureState.dx) > 15;
        return isHorizontalSwipe && hasEnoughMovement;
      },
      onPanResponderGrant: () => {
        // Stop any ongoing animations
        tabScrollX.stopAnimation();
      },
      onPanResponderMove: (evt, gestureState) => {
        const currentOffset = -tabIndexRef.current * SCREEN_WIDTH;
        const newOffset = currentOffset + gestureState.dx;
        // Clamp between first and last tab
        const minOffset = -(tabs.length - 1) * SCREEN_WIDTH;
        const maxOffset = 0;
        const clampedOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));
        tabScrollX.setValue(clampedOffset);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const threshold = SCREEN_WIDTH * 0.25; // Lower threshold for easier swiping
        const velocity = Math.abs(gestureState.vx);
        
        // Consider both distance and velocity
        if (Math.abs(gestureState.dx) > threshold || velocity > 0.5) {
          // Swipe to next/prev tab
          if (gestureState.dx > 0 && tabIndexRef.current > 0) {
            // Swipe right - go to previous tab
            const newIndex = tabIndexRef.current - 1;
            changeTab(tabs[newIndex], newIndex);
          } else if (gestureState.dx < 0 && tabIndexRef.current < tabs.length - 1) {
            // Swipe left - go to next tab
            const newIndex = tabIndexRef.current + 1;
            changeTab(tabs[newIndex], newIndex);
          } else {
            // Snap back to current tab
            Animated.spring(tabScrollX, {
              toValue: -tabIndexRef.current * SCREEN_WIDTH,
              useNativeDriver: true,
              tension: 50,
              friction: 7,
            }).start();
          }
        } else {
          // Snap back to current tab
          Animated.spring(tabScrollX, {
            toValue: -tabIndexRef.current * SCREEN_WIDTH,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  const openModal = (preserveImage: boolean = false) => {
      modalTranslateY.setValue(0);
      setModalVisible(true);
      // Reset inputs, but preserve image if coming from camera
      setStatusText('');
      if (!preserveImage) {
          setStatusImage(null);
      }
  };

  const openCamera = (fromSwipe: boolean = false, source: 'proxy' | 'status' = 'status') => {
      setCameraFromSwipe(fromSwipe);
      setCameraSource(source);
      setCameraModalVisible(true);
  };

  const handleCameraPhoto = (uri: string) => {
      console.log('Camera photo received:', uri);
      setStatusImage(uri);
      setCameraModalVisible(false);
      // Open modal after taking photo, preserving the image
      openModal(true);
  };

  const closeModal = () => {
      setModalVisible(false);
  };

  const closeViewer = () => {
      setPreviewModalVisible(false);
  };

  const openMyStatusViewer = (startIndex: number = 0) => {
      if (!userProfile) return;
      const sorted = [...activeStatuses].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (sorted.length === 0) {
          toast.show('No active status yet.', 'info');
          return;
      }
      setPreviewStatuses(sorted);
      setPreviewProfile(userProfile);
      setPreviewAllowDelete(true);
      setPreviewStartIndex(Math.max(0, Math.min(startIndex, sorted.length - 1)));
      setPreviewModalVisible(true);
  };

  const openStatusViewer = (params: {
      statuses: StatusItem[];
      profile: { avatar_url: string | null; full_name: string; username: string; city: string | null; is_verified: boolean };
      startIndex?: number;
      allowDelete?: boolean;
  }) => {
      const sorted = [...(params.statuses || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (sorted.length === 0) return;
      setPreviewStatuses(sorted);
      setPreviewProfile(params.profile);
      setPreviewAllowDelete(!!params.allowDelete);
      const idx = params.startIndex ?? 0;
      setPreviewStartIndex(Math.max(0, Math.min(idx, sorted.length - 1)));
      setPreviewModalVisible(true);
  };

  const pickImage = async () => {
      try {
          const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: false, // Disable editing to preserve original photo
              quality: 0.5,
          });
          if (!result.canceled) {
              setStatusImage(result.assets[0].uri);
          }
      } catch (error) {
          toast.show('Failed to pick image', 'error');
      }
  };

  const showVerificationRequiredPopup = () => {
      Alert.alert(
          'Verification required',
          'To keep Proxyme built on trust and security, posting photo statuses is limited to verified accounts. This helps prevent bots, AI-generated spam, inappropriate content, and low-effort mass posting.\n\nGet verified to unlock photo statuses.',
          [
              { text: 'Not now', style: 'cancel' },
              {
                  text: 'Get verified',
                  onPress: () => {
                      setCameraModalVisible(false);
                      setModalVisible(false);
                      router.push('/(settings)/get-verified');
                  },
              },
          ],
      );
  };

  const ensureVerifiedForImageStatus = async (): Promise<boolean> => {
      if (!user) throw new Error('You must be signed in.');
      // App Store Review Mode: allow the review account to post statuses even if verification state isn't propagated yet.
      if (isReviewUser(user)) return true;
      const { data: me, error: meErr } = await supabase
          .from('profiles')
          .select('is_verified')
          .eq('id', user.id)
          .maybeSingle();
      if (meErr) throw meErr;
      if (!me?.is_verified) {
          showVerificationRequiredPopup();
          return false;
      }
      return true;
  };

  const uploadStatusImage = async (uri: string): Promise<string> => {
      if (!user) throw new Error('You must be signed in.');
      if (uri.startsWith('http') && !uri.startsWith('blob:')) {
          throw new Error('Unsupported image source.');
      }

      const path = `status/${user.id}/${Date.now()}.jpeg`;

      // Web (blob:) can be uploaded directly.
      if (uri.startsWith('blob:')) {
          const res = await fetch(uri);
          if (!res.ok) throw new Error('Failed to read selected image.');
          const arraybuffer = await res.arrayBuffer();
          const { error: uploadError } = await supabase.storage
              .from('avatars')
              .upload(path, arraybuffer, { contentType: `image/jpeg` });
          if (uploadError) throw uploadError;
          return path;
      }

      // Native: compress/resize, then upload.
      const uploadImage = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1080 } }],
          { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const uploadBase64 = uploadImage.base64 || '';
      if (!uploadBase64) throw new Error('Failed to prepare image for upload.');

      // Convert upload base64 to ArrayBuffer
      // eslint-disable-next-line no-undef
      const binaryString = atob(uploadBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      const arraybuffer = bytes.buffer;

      const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, arraybuffer, { contentType: `image/jpeg` });
      if (uploadError) throw uploadError;
      return path;
  };

  const sendStatusFromCamera = async (uri: string, caption: string) => {
      if (!user) throw new Error('You must be signed in.');
      setUpdating(true);
      try {
          const ok = await ensureVerifiedForImageStatus();
          if (!ok) return;
          toast.show('Posting status...', 'info');
          const contentPath = await uploadStatusImage(uri);

          const { error } = await supabase.from('statuses').insert({
              user_id: user.id,
              content: contentPath,
              type: 'image',
              caption: caption?.trim() ? caption.trim() : null,
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          });
          if (error) throw error;

          toast.show('Status posted!', 'success');
          fetchStatus();
      } catch (error: any) {
          toast.show(error.message || 'Failed to post status', 'error');
          throw error;
      } finally {
          setUpdating(false);
      }
  };

  const submitStatus = async () => {
      if (!user) return;
      // Snapshot draft state so we can clear the UI immediately,
      // but still upload the intended content (and restore on error).
      const draftImage = statusImage;
      const draftText = statusText;

      console.log('Submitting status - Image:', draftImage, 'Text:', draftText);
      setUpdating(true);
      // Don't close modal immediately, wait for upload so we can show result in the list
      // Or close it? The user might want to add multiple. Let's keep it open or close it?
      // Usually "Post" closes the modal.
      setModalVisible(false); 
      // Clear the composer immediately so reopening Status Manager doesn't keep the last photo in the upload block.
      setStatusText('');
      setStatusImage(null);

      try {
          modalTranslateY.setValue(0);

          let content = null;
          let type = 'text';

          if (draftImage) {
              type = 'image';

              const ok = await ensureVerifiedForImageStatus();
              if (!ok) {
                  // Restore draft and keep modal open.
                  setStatusText(draftText);
                  setStatusImage(draftImage);
                  setModalVisible(true);
                  return;
              }

              toast.show('Posting status...', 'info');
              content = await uploadStatusImage(draftImage);
          } else if (draftText.trim()) {
              type = 'text';
              toast.show('Posting status...', 'info');
              content = draftText;
          } else {
              toast.show('Status cannot be empty.', 'error');
              setUpdating(false);
              return;
          }

          const { error } = await supabase.from('statuses').insert({
              user_id: user.id,
              content: content,
              type: type,
              caption: type === 'image' ? draftText : null,
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          });

          if (error) throw error;

          toast.show('Status added!', 'success');
          fetchStatus(); 
      } catch (error: any) {
          // Restore the draft so the user can retry without losing their work.
          setStatusText(draftText);
          setStatusImage(draftImage);
          toast.show(error.message || 'Failed to update status', 'error');
          setModalVisible(true); // Re-open on error
      } finally {
          setUpdating(false);
      }
  };

  // Render Status Tab Content
  const renderStatusTab = () => {
    return (
      <ScrollView ref={statusTabScrollRef} showsVerticalScrollIndicator={false}>
                        {/* Active Statuses List */}
                        {activeStatuses.length > 0 && (
                            <View className="mb-6" style={{ width: '100%' }}>
                                <Text className="text-xs font-bold text-slate-400 uppercase mb-2">Active Updates</Text>
                                <ScrollView 
                                    horizontal 
                                    showsHorizontalScrollIndicator={true}
                                    nestedScrollEnabled={true}
                                    bounces={true}
                                    alwaysBounceHorizontal={true}
                                    contentContainerStyle={{ 
                                        paddingTop: 8, 
                                        paddingRight: 16,
                                        paddingLeft: 4,
                                        alignItems: 'center'
                                    }}
                                    style={{ 
                                        width: '100%',
                                        height: 160
                                    }}
                                    scrollEventThrottle={16}
                                    directionalLockEnabled={true}
                                    scrollEnabled={true}
                                >
                                    {activeStatuses.map((item, index) => (
                                        <TouchableOpacity 
                                            key={item.id} 
                                            className="mr-3 w-24 relative" 
                                            style={{ zIndex: 1 }}
                                            onPress={() => {
                                                setPreviewStartIndex(index);
                                                setPreviewModalVisible(true);
                                            }}
                                            activeOpacity={0.8}
                                        >
                                            <View className="h-32 w-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                                                {item.type === 'image' ? (
                                                    <PreviewImage path={item.content || ''} />
                                                ) : (
                                                    <View className="flex-1 items-center justify-center p-2 bg-blue-50">
                                                        {item.content && item.content.trim() ? (
                                                            <Text numberOfLines={4} className="text-[10px] text-center font-medium italic">“{item.content}”</Text>
                                                        ) : (
                                                            <Text className="text-[10px] text-center font-medium italic text-slate-400">No content</Text>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                            <TouchableOpacity 
                                                onPress={(e) => {
                                                    e.stopPropagation();
                                                    deleteStatus(item.id);
                                                }}
                                                className="absolute -top-2 -right-2 bg-red-500 rounded-full w-6 h-6 items-center justify-center border-2 border-white"
                                                style={{ zIndex: 10 }}
                                            >
                                                <IconSymbol name="xmark" size={12} color="white" />
                                            </TouchableOpacity>
                                            <Text className="text-[10px] text-slate-400 mt-1 text-center">
                                                {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                        
                        {/* New Status Input */}
                        <Text className="text-sm font-bold text-slate-500 mb-3 ml-1">Add to Status</Text>
                        
                        {/* Photo/Camera Buttons */}
                        <View className="mb-4">
                            {statusImage ? (
                                <TouchableOpacity onPress={pickImage} className="w-full">
                                    <View className="w-full rounded-2xl overflow-hidden border border-slate-200 relative" style={{ maxHeight: 400 }}>
                                        <Image 
                                            source={{ uri: statusImage }} 
                                            style={{ width: '100%', height: undefined, aspectRatio: 3/4, maxHeight: 400 }} 
                                            resizeMode="contain" 
                                        />
                                        <View className="absolute top-2 right-2 bg-black/60 p-2 rounded-full">
                                            <IconSymbol name="pencil" size={18} color="white" />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <View className="flex-row">
                                    <TouchableOpacity 
                                        onPress={pickImage} 
                                        className="flex-1 h-16 rounded-2xl bg-slate-100 items-center justify-center border border-slate-200"
                                        style={{ marginRight: 8 }}
                                    >
                                        <IconSymbol name="photo.fill" size={22} color="#9CA3AF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        onPress={() => {
                                            console.log('Camera button pressed');
                                            openCamera(false, 'status');
                                        }} 
                                        className="flex-1 h-16 rounded-2xl bg-slate-100 items-center justify-center border border-slate-200"
                                        style={{ marginLeft: 8 }}
                                    >
                                        <IconSymbol name="camera.fill" size={22} color="#9CA3AF" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                        
                        {/* Text Input - Below buttons */}
                        <TextInput 
                            value={statusText}
                            onChangeText={setStatusText}
                            placeholder="What're you up to?"
                            placeholderTextColor="#9CA3AF"
                            multiline
                            className="bg-slate-50 p-4 rounded-xl text-slate-900 text-lg min-h-[64px] mb-6"
                            returnKeyType="done"
                            blurOnSubmit={true}
                            onSubmitEditing={() => Keyboard.dismiss()}
                            onFocus={() => {
                                // Ensure the input is visible (scroll to bottom) when the keyboard opens
                                requestAnimationFrame(() => {
                                    statusTabScrollRef.current?.scrollToEnd({ animated: true });
                                });
                            }}
                        />

                        <Text className="text-slate-400 text-xs text-center mb-6">
                            Updates last 24 hours. Use the + button to add more.
                        </Text>
      </ScrollView>
    );
  };

  // Render Clubs Tab Content
  const renderClubsTab = () => {

    const formatEventDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
      });
    };

    const formatEventTime = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    };

    if (selectedClub) {
      return (
        <ScrollView 
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          {/* Header with back button */}
          <View className="flex-row items-center mb-6">
            <TouchableOpacity
              onPress={() => setSelectedClub(null)}
              className="mr-3"
            >
              <IconSymbol name="chevron.left" size={24} color="#2962FF" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-lg font-bold text-slate-900">{selectedClub.name}</Text>
              {selectedClub.city && (
                <Text className="text-slate-500 text-sm">{selectedClub.city}</Text>
              )}
            </View>
          </View>

          {/* Upcoming Events Section */}
          <View className="mb-6">
            <Text className="text-base font-bold text-slate-900 mb-3">Upcoming Events</Text>
            {loadingEvents ? (
              <View className="items-center py-4">
                <ActivityIndicator size="small" color="#2962FF" />
              </View>
            ) : upcomingEvents.length === 0 ? (
              <View className="bg-slate-50 rounded-xl p-4">
                <Text className="text-slate-500 text-sm text-center">No upcoming events</Text>
              </View>
            ) : (
              // Profile-style horizontal card carousel (reliable side-to-side scrolling)
              <View className="bg-white py-3 border-y border-slate-200/70" style={{ marginHorizontal: -24 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingLeft: 24, paddingRight: 24 }}
                  nestedScrollEnabled
                >
                  {upcomingEvents.map((event) => (
                    <View
                      key={event.id}
                      className="bg-white/80 rounded-2xl p-4 mr-4 border border-slate-200/70"
                      style={{
                        width: 280,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 10 },
                        shadowOpacity: 0.10,
                        shadowRadius: 18,
                        elevation: 8,
                      }}
                    >
                      <Text className="text-slate-900 font-bold text-base mb-1" numberOfLines={1}>
                        {event.title}
                      </Text>
                      {event.description && (
                        <Text className="text-slate-600 text-sm mb-2" numberOfLines={2}>
                          {event.description}
                        </Text>
                      )}
                      <View className="flex-row items-center mt-2">
                        <IconSymbol name="calendar" size={16} color="#6B7280" />
                        <Text className="text-slate-600 text-sm ml-2 flex-1" numberOfLines={1}>
                          {formatEventDate(event.event_date)} at {formatEventTime(event.event_date)}
                        </Text>
                      </View>
                      {event.location && (
                        <View className="flex-row items-center mt-1">
                          <IconSymbol name="location.fill" size={16} color="#6B7280" />
                          <Text className="text-slate-600 text-sm ml-2 flex-1" numberOfLines={1}>
                            {event.location}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Create Forum Post Section */}
          <View className="mb-6">
            <Text className="text-base font-bold text-slate-900 mb-3">Create Forum Post</Text>
            <View className="bg-slate-50 rounded-xl p-4">
              <TextInput
                placeholder="Post title"
                value={forumTitle}
                onChangeText={setForumTitle}
                className="bg-white rounded-lg p-3 mb-3 text-slate-900"
                placeholderTextColor="#9CA3AF"
              />
              <TextInput
                placeholder="What's on your mind?"
                value={forumContent}
                onChangeText={setForumContent}
                multiline
                numberOfLines={4}
                className="bg-white rounded-lg p-3 text-slate-900"
                placeholderTextColor="#9CA3AF"
                textAlignVertical="top"
              />
            </View>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-lg font-bold text-slate-900">My Clubs</Text>
            <TouchableOpacity
              onPress={() => {
                router.push('/(tabs)/clubs');
                closeModal();
              }}
              className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
            >
              <IconSymbol name="arrow.right.circle.fill" size={16} color="white" />
              <Text className="text-white font-semibold ml-2">Go to Clubs</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-slate-500 text-sm mb-4">
            Select a club to view events and create forum posts.
          </Text>
        </View>

        {loadingClubs ? (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color="#2962FF" />
          </View>
        ) : myClubs.length === 0 ? (
          <View className="items-center py-8">
            <IconSymbol name="person.3.fill" size={48} color="#9CA3AF" />
            <Text className="text-slate-500 mt-4 text-center">You’re not a member of any clubs yet.</Text>
            <TouchableOpacity
              onPress={() => {
                router.push('/(tabs)/clubs');
                closeModal();
              }}
              className="mt-4 bg-blue-600 px-6 py-3 rounded-xl"
            >
              <Text className="text-white font-bold">Discover Clubs</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            {myClubs.map((club) => (
              <TouchableOpacity
                key={club.id}
                onPress={() => setSelectedClub(club)}
                className="bg-slate-50 rounded-xl p-4 mb-3"
              >
                <View className="flex-row items-center">
                  <View
                    className="mr-4 overflow-hidden bg-slate-200 border border-slate-200"
                    style={{ width: 56, height: 56, borderRadius: 12 }}
                  >
                    <ClubCoverImage path={club.image_url} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-slate-900 text-lg">{club.name}</Text>
                    {club.description && <Text className="text-slate-500 text-sm mt-1" numberOfLines={2}>{club.description}</Text>}
                    {club.city && <Text className="text-slate-400 text-xs mt-1">{club.city}</Text>}
                  </View>
                  <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <StatusContext.Provider
      value={{
        openModal,
        openCamera,
        closeModal,
        activeStatuses,
        seenStatusIds,
        currentProfile: userProfile,
        openMyStatusViewer,
        openStatusViewer,
        fetchStatus,
        deleteStatus,
      }}
    >
      {children}
      
      {/* Status Modal */}
      <Modal 
        visible={modalVisible && !cameraModalVisible} 
        transparent 
        animationType="fade"
      >
          <Animated.View style={{ flex: 1, transform: [{ translateY: modalTranslateY }] }}>
              <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1 justify-end bg-black/60"
              >
                      {/* Backdrop: tap to dismiss keyboard without stealing scroll gestures inside the sheet */}
                      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
                      </TouchableWithoutFeedback>

                      <View className="bg-white rounded-t-3xl max-h-[90%] flex-1">
                        {/* Header */}
                        <View className="flex-row justify-between items-center p-6 pb-4">
                            <View style={{ flex: 1 }} />
                            <Text className="text-2xl text-slate-900 text-center" style={{ fontFamily: 'LibertinusSans-Regular' }}>Status Manager</Text>
                            <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                <TouchableOpacity onPress={closeModal} className="p-2 bg-slate-100 rounded-full">
                                    <IconSymbol name="xmark" size={20} color="#1A1A1A" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Tab Content Carousel - Swipeable */}
                        <View style={{ flex: 1, overflow: 'hidden', width: SCREEN_WIDTH }}>
                            <Animated.View 
                                style={{
                                    flexDirection: 'row',
                                    width: SCREEN_WIDTH * tabs.length,
                                    height: '100%',
                                    transform: [{ translateX: tabScrollX }],
                                }}
                            >
                                {/* Tab order: My Status (0), My Clubs (1) - Penpal hidden */}
                                <View style={{ width: SCREEN_WIDTH, paddingHorizontal: 24 }}>
                                    {renderStatusTab()}
                                </View>
                                <View style={{ width: SCREEN_WIDTH, paddingHorizontal: 24 }}>
                                    {renderClubsTab()}
                                </View>
                            </Animated.View>
                        </View>

                        {/* Send Buttons - Above Tabs */}
                        {activeTab === 'status' && (
                            <View className="mx-6 mb-4 items-center">
                                {/* Radiating ring animation */}
                                {!updating && (
                                    <Animated.View
                                        style={{
                                            position: 'absolute',
                                            width: 64,
                                            height: 64,
                                            borderRadius: 32,
                                            borderWidth: 2,
                                            borderColor: getButtonColor(),
                                            opacity: pulseAnim.interpolate({
                                                inputRange: [1, 1.15],
                                                outputRange: [0.3, 0],
                                            }),
                                            transform: [{ scale: pulseAnim }],
                                        }}
                                    />
                                )}
                                
                                <TouchableOpacity 
                                    onPress={submitStatus}
                                    disabled={updating}
                                    className="w-16 h-16 rounded-full items-center justify-center shadow-lg active:scale-95"
                                    style={{
                                        backgroundColor: getButtonColor(),
                                        transform: [{ scale: pulseScale }],
                                    }}
                                >
                                    <IconSymbol name="arrow.up" size={28} color="white" />
                                </TouchableOpacity>
                            </View>
                        )}
                        
                        {activeTab === 'clubs' && selectedClub && (
                            <View className="mx-6 mb-4">
                                <TouchableOpacity
                                    onPress={createForumPost}
                                    disabled={creatingPost || !forumTitle.trim() || !forumContent.trim()}
                                    className="bg-blue-600 w-full py-4 rounded-xl items-center shadow-lg"
                                    style={{
                                        opacity: (!forumTitle.trim() || !forumContent.trim()) ? 0.5 : 1
                                    }}
                                >
                                    {creatingPost ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : (
                                        <Text className="text-white font-bold text-base">Post to Forum</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Tab Selector - Glassy Slider at Bottom */}
                        <View 
                            className="mx-6 mb-6 rounded-2xl overflow-hidden"
                            style={{
                                backgroundColor: '#F8FAFC', // Slate-50
                                borderWidth: 1,
                                borderColor: '#E2E8F0', // Slate-200
                                shadowColor: '#64748B', // Slate-500
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.05,
                                shadowRadius: 8,
                                elevation: 2,
                            }}
                            // Only allow swipe-to-change-tabs from the tab bar area.
                            // This prevents nested horizontal carousels (Upcoming Events) from being blocked.
                            {...panResponder.panHandlers}
                        >
                            <View className="flex-row relative" style={{ padding: 4 }}>
                                {/* Glassy sliding indicator */}
                                <Animated.View
                                    style={{
                                        position: 'absolute',
                                        top: 4,
                                        bottom: 4,
                                        width: (SCREEN_WIDTH - 48 - 8) / tabs.length,
                                        backgroundColor: '#FFFFFF',
                                        borderRadius: 14, // Slightly rounded
                                        borderWidth: 1,
                                        borderColor: '#E2E8F0', // Slate-200
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 1 },
                                        shadowOpacity: 0.05,
                                        shadowRadius: 2,
                                        elevation: 1,
                                        transform: [{
                                            translateX: tabScrollX.interpolate({
                                                // inputRange must be ascending: from last tab to first tab
                                                inputRange: [
                                                    -(tabs.length - 1) * SCREEN_WIDTH, // clubs
                                                    0 // status
                                                ],
                                                // outputRange: indicator position for each tab
                                                outputRange: [
                                                    1 * ((SCREEN_WIDTH - 48 - 8) / tabs.length) + 4, // clubs position
                                                    4 // status position
                                                ],
                                                extrapolate: 'clamp',
                                            })
                                        }],
                                    }}
                                />
                                
                                {/* Tab buttons */}
                                {tabs.map((tab, index) => {
                                    const isActive = activeTab === tab;
                                    const tabNames = {
                                        status: 'My Status',
                                        clubs: 'My Clubs'
                                    };
                                    return (
                                        <TouchableOpacity
                                            key={tab}
                                            onPress={() => changeTab(tab, index)}
                                            className="flex-1 py-3 items-center"
                                            activeOpacity={0.7}
                                            style={{ zIndex: 1 }}
                                        >
                                            <Text className={`text-sm ${
                                                isActive ? 'font-bold text-slate-900' : 'font-medium text-slate-600'
                                            }`}>
                                                {tabNames[tab]}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                      </View>
              </KeyboardAvoidingView>
          </Animated.View>
      </Modal>
      
      {/* Custom Camera Modal - Rendered after status modal to ensure it's on top */}
      <CameraModal
        visible={cameraModalVisible}
        onClose={() => {
          setCameraModalVisible(false);
          setCameraFromSwipe(false);
        }}
        onSendStatus={sendStatusFromCamera}
        slideFromRight={cameraFromSwipe}
        source={cameraSource}
      />

      {/* Status Preview Modal - Shows how others see your status */}
      <StatusPreviewModal
        visible={previewModalVisible}
        statuses={previewStatuses}
        profile={previewProfile}
        startIndex={previewStartIndex}
        onClose={closeViewer}
        allowDelete={previewAllowDelete}
        onDelete={previewAllowDelete ? deleteStatus : undefined}
        onViewed={(statusId) => markStatusSeen(statusId)}
      />
    </StatusContext.Provider>
  );
}

export function useStatus() {
  const context = useContext(StatusContext);
  if (context === undefined) {
    throw new Error('useStatus must be used within a StatusProvider');
  }
  return context;
}

function PreviewImage({ path, resizeMode = 'cover' }: { path: string, resizeMode?: any }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!path) return;
        if (path.startsWith('http')) {
            setUrl(path);
            return;
        }
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        setUrl(data.publicUrl);
    }, [path]);
    
    if (!url) return <View className="w-full h-full bg-gray-200" />;
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode={resizeMode} />;
}

function StatusPreviewModal({ 
    visible, 
    statuses, 
    profile, 
    startIndex = 0,
    onClose, 
    allowDelete = false,
    onDelete,
    onViewed,
}: { 
    visible: boolean; 
    statuses: StatusItem[]; 
    profile: { avatar_url: string | null; full_name: string; username: string; city: string | null; is_verified: boolean } | null;
    startIndex?: number;
    onClose: () => void;
    allowDelete?: boolean;
    onDelete?: (id: string) => Promise<void>;
    onViewed?: (id: string) => void;
}) {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const [activeIndex, setActiveIndex] = useState(startIndex);
    const swipeStartYRef = useRef<number | null>(null);
    
    // Reset index when statuses change
    useEffect(() => {
        if (statuses.length === 0) {
            onClose();
        } else if (activeIndex >= statuses.length) {
            setActiveIndex(Math.max(0, statuses.length - 1));
        }
    }, [statuses.length]);

    // Reset index when modal opens
    useEffect(() => {
        if (visible) {
            setActiveIndex(startIndex);
        }
    }, [visible, startIndex]);

    console.log('StatusPreviewModal render:', { visible, statusesLength: statuses.length, profile: !!profile });
    
    // If profile is not loaded yet, show a loading state or use defaults
    const displayProfile = profile || {
        avatar_url: null,
        full_name: 'You',
        username: 'user',
        city: null,
        is_verified: false
    };
 
    // Derive current status *before* any early returns so hooks never change order.
    const currentStatus = statuses[activeIndex];
    const currentStatusId = currentStatus?.id ?? null;

    // Mark current status as viewed (for story carousel hiding)
    useEffect(() => {
        if (!visible) return;
        if (!currentStatusId) return;
        onViewed?.(currentStatusId);
    }, [visible, currentStatusId, onViewed]);

    // Swipe down to close (Instagram-style)
    const swipeDownResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onStartShouldSetPanResponderCapture: () => false,
            onMoveShouldSetPanResponder: (_evt, gestureState) => {
                const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
                const isDown = gestureState.dy > 10;
                return visible && isVertical && isDown;
            },
            onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
                const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
                const isDown = gestureState.dy > 10;
                return visible && isVertical && isDown;
            },
            onPanResponderGrant: (evt) => {
                swipeStartYRef.current = evt.nativeEvent.pageY;
            },
            onPanResponderRelease: (_evt, gestureState) => {
                swipeStartYRef.current = null;
                const shouldClose = gestureState.dy > 90 || (gestureState.vy > 0.85 && gestureState.dy > 40);
                if (shouldClose) onClose();
            },
            onPanResponderTerminate: () => {
                swipeStartYRef.current = null;
            },
        })
    ).current;

    // Always render Modal, but control visibility
    if (statuses.length === 0) {
        return null;
    }
    
    if (!currentStatus) {
        // If current status is invalid but we have statuses, don't render.
        return null;
    }
    
    console.log('StatusPreviewModal: Rendering modal with', statuses.length, 'statuses, visible:', visible);

    const handleTap = (evt: any) => {
        const x = evt.nativeEvent.locationX;
        if (x < width * 0.3) {
            // Tap left third for previous
            if (activeIndex > 0) setActiveIndex(activeIndex - 1);
        } else {
            // Tap right two-thirds for next
            if (activeIndex < statuses.length - 1) setActiveIndex(activeIndex + 1);
        }
    };

    const formatTimeAgo = (timestamp: string): string => {
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
        return time.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    return (
        <Modal
            visible={visible && statuses.length > 0 && !!currentStatus}
            animationType="slide"
            transparent={false}
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black" {...swipeDownResponder.panHandlers}>
                {/* Status Progress Bars */}
                <View
                    className="absolute left-2 right-2 flex-row gap-1 z-50 h-1"
                    style={{ top: insets.top + 10 }}
                >
                    {statuses.map((_, i) => (
                        <View 
                            key={i} 
                            className={`flex-1 h-full rounded-full ${i <= activeIndex ? 'bg-white' : 'bg-white/30'}`} 
                        />
                    ))}
                </View>

                {/* Content Area (Tap to Advance) */}
                <TouchableWithoutFeedback onPress={handleTap}>
                    <View style={{ width, height }}>
                        {currentStatus.type === 'image' ? (
                            <PreviewFeedImage path={currentStatus.content || ''} containerHeight={height} containerWidth={width} />
                        ) : (
                            <View className="w-full h-full items-center justify-center bg-ink p-8">
                                {currentStatus.content && currentStatus.content.trim() ? (
                                    <Text className="text-white text-2xl font-bold italic text-center leading-9">
                                        “{currentStatus.content}”
                                    </Text>
                                ) : (
                                    <Text className="text-white text-2xl font-bold italic text-center leading-9">
                                        No content
                                    </Text>
                                )}
                            </View>
                        )}
                        {currentStatus.type === 'image' && (
                            <View className="absolute inset-0 bg-black/10" />
                        )}
                    </View>
                </TouchableWithoutFeedback>

                {/* Top Overlay: Compact Header */}
                <View
                    className="absolute left-0 right-0 pb-4 px-4 pointer-events-none"
                    style={{ top: insets.top + 10, paddingTop: 26 }}
                >
                    <View className="flex-row items-center mt-4">
                        <View className="flex-row items-center">
                            <View className="w-8 h-8 rounded-full overflow-hidden mr-2 border border-white/50">
                                <PreviewImage path={displayProfile.avatar_url || ''} />
                            </View>
                            <View>
                                <View className="flex-row items-center">
                                    <Text className="text-white text-base font-bold mr-1 shadow-md">{displayProfile.full_name}</Text>
                                    {displayProfile.is_verified && <IconSymbol name="checkmark.seal.fill" size={14} color="#3B82F6" />}
                                </View>
                                <View className="flex-row items-center">
                                    <Text className="text-gray-300 text-[10px] font-semibold shadow-sm">@{displayProfile.username}</Text>
                                    {currentStatus && (
                                        <Text className="text-slate-400 text-[9px] ml-2 shadow-sm">
                                            • {formatTimeAgo(currentStatus.created_at)}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        </View>

                        <View className="ml-auto flex-row items-center bg-black/30 px-2 py-0.5 rounded border border-white/10 backdrop-blur-md">
                            <IconSymbol name="location.fill" size={10} color="#E5E7EB" style={{marginRight:3}}/>
                            <Text className="text-gray-200 text-[10px] font-bold uppercase shadow-sm">
                                {displayProfile.city || 'Nearby'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Bottom Overlay: Caption & Delete */}
                <View className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pt-12 pb-20">
                    {currentStatus.caption && currentStatus.caption.trim() ? (
                        <Text className="text-white text-sm font-medium mb-2 shadow-lg">
                            {currentStatus.caption}
                        </Text>
                    ) : null}
                    <View className="flex-row items-center justify-between">
                        <Text className="text-gray-300 text-xs italic">Tap left/right • Swipe down to close</Text>
                        {allowDelete && onDelete && (
                            <TouchableOpacity
                                onPress={async () => {
                                    const deletingIndex = activeIndex;
                                    await onDelete(currentStatus.id);
                                    // Adjust index after deletion
                                    if (statuses.length === 1) {
                                        onClose();
                                    } else if (deletingIndex >= statuses.length - 1 && deletingIndex > 0) {
                                        setActiveIndex(deletingIndex - 1);
                                    }
                                }}
                                className="bg-black/30 border border-white/10 p-3 rounded-full"
                            >
                                <IconSymbol name="trash" size={18} color="white" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Close Button */}
                <TouchableOpacity
                    onPress={onClose}
                    className="absolute right-4 bg-black/50 p-3 rounded-full z-50"
                    style={{ top: insets.top + 6 }}
                >
                    <IconSymbol name="xmark" size={20} color="white" />
                </TouchableOpacity>
            </View>
        </Modal>
    );
}

function PreviewFeedImage({ path, containerHeight, containerWidth }: { path: string | null, containerHeight: number, containerWidth: number }) {
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

    useEffect(() => {
        if (!url || !containerHeight || !containerWidth || containerHeight < 100) return;
        
        Image.getSize(url, (width, height) => {
            setImageDimensions({ width, height });
        }, () => {
            setImageDimensions({ width: 1, height: 1 });
        });
    }, [url, containerHeight, containerWidth]);

    if (!url) return <View className="w-full h-full bg-ink" />;

    if (containerHeight && containerWidth && containerHeight > 100 && imageDimensions) {
        const imageAspect = imageDimensions.width / imageDimensions.height;
        
        if (imageAspect > 1) {
            // Landscape - letterbox
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
            // Vertical or square
            const imageAspect = imageDimensions.width / imageDimensions.height;
            const containerAspect = containerWidth / containerHeight;
            
            if (imageAspect < containerAspect) {
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

    return (
        <Image 
            source={{ uri: url }} 
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
        />
    );
}

function ClubCoverImage({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!path) {
            setUrl(null);
            return;
        }
        if (path.startsWith('http')) {
            setUrl(path);
            return;
        }
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        setUrl(data.publicUrl);
    }, [path]);

    if (!url) {
        return (
            <View className="flex-1 items-center justify-center">
                <IconSymbol name="person.3.fill" size={22} color="#94A3B8" />
            </View>
        );
    }

    return <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />;
}
