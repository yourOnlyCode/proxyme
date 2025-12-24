import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
    useWindowDimensions
} from 'react-native';
import { CameraModal } from './CameraModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
    openCamera: (fromSwipe?: boolean) => void;
    closeModal: () => void;
    activeStatuses: StatusItem[];
    fetchStatus: () => void;
    deleteStatus: (id: string) => Promise<void>;
};

const StatusContext = createContext<StatusContextType | undefined>(undefined);

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  
  const [modalVisible, setModalVisible] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [cameraFromSwipe, setCameraFromSwipe] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewStartIndex, setPreviewStartIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [userProfile, setUserProfile] = useState<{ avatar_url: string | null; full_name: string; username: string; city: string | null; is_verified: boolean } | null>(null);
  const [relationshipGoal, setRelationshipGoal] = useState<string | null>(null);
  
  // Status Data
  const [statusText, setStatusText] = useState('');
  const [statusImage, setStatusImage] = useState<string | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<StatusItem[]>([]);

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

  const openModal = (preserveImage: boolean = false) => {
      modalTranslateY.setValue(0);
      setModalVisible(true);
      // Reset inputs, but preserve image if coming from camera
      setStatusText('');
      if (!preserveImage) {
          setStatusImage(null);
      }
  };

  const openCamera = (fromSwipe: boolean = false) => {
      setCameraFromSwipe(fromSwipe);
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

  const submitStatus = async () => {
      if (!user) return;
      console.log('Submitting status - Image:', statusImage, 'Text:', statusText);
      setUpdating(true);
      // Don't close modal immediately, wait for upload so we can show result in the list
      // Or close it? The user might want to add multiple. Let's keep it open or close it?
      // Usually "Post" closes the modal.
      setModalVisible(false); 

      try {
          modalTranslateY.setValue(0);
          toast.show('Posting status...', 'info');

          let content = null;
          let type = 'text';

          if (statusImage) {
               type = 'image';
               if (!statusImage.startsWith('http')) {
                   try {
                       console.log('Uploading image from:', statusImage);
                       
                       // Use expo-file-system for reliable local file reading
                       // Note: EncodingType might not be available, use string literal instead
                       const base64 = await FileSystem.readAsStringAsync(statusImage, {
                           encoding: 'base64' as any,
                       });
                       
                       console.log('File read successfully, length:', base64.length);
                       
                       // Content Moderation: Check image before uploading
                       console.log('Checking content moderation...');
                       const { data: moderationResult, error: moderationError } = await supabase.functions.invoke('moderate-content', {
                           body: {
                               base64Image: base64,
                               userId: user.id,
                               contentType: 'status_image'
                           }
                       });

                       if (moderationError) {
                           console.error('Moderation check error:', moderationError);
                           toast.show('Content check failed. Please try again.', 'error');
                           setUpdating(false);
                           return;
                       }

                       if (moderationResult?.blocked) {
                           // Content is inappropriate - block upload and show error
                           console.log('Content blocked:', moderationResult);
                           toast.show(moderationResult.message || 'Content violates community guidelines', 'error');
                           setUpdating(false);
                           return;
                       }

                       if (!moderationResult?.safe) {
                           // If moderation check failed or returned unsafe, block by default
                           console.log('Content moderation check failed or returned unsafe');
                           toast.show('Content could not be verified. Please try a different image.', 'error');
                           setUpdating(false);
                           return;
                       }

                       console.log('Content moderation passed, proceeding with upload...');
                       
                       // Convert base64 to ArrayBuffer
                       const binaryString = atob(base64);
                       const bytes = new Uint8Array(binaryString.length);
                       for (let i = 0; i < binaryString.length; i++) {
                           bytes[i] = binaryString.charCodeAt(i);
                       }
                       const arraybuffer = bytes.buffer;
                       
                       const fileExt = statusImage.split('.').pop()?.toLowerCase() ?? 'jpeg';
                       const path = `status/${user.id}/${Date.now()}.${fileExt}`;
                       
                       console.log('Uploading to path:', path);
                       
                       const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('avatars') // Using avatars bucket for now
                        .upload(path, arraybuffer, { contentType: `image/${fileExt}` });

                       if (uploadError) {
                           console.error('Upload error:', uploadError);
                           throw uploadError;
                       }
                       
                       console.log('Upload successful:', uploadData);
                       content = path; 
                   } catch (fileError: any) {
                       console.error('File upload error:', fileError);
                       toast.show(`Upload failed: ${fileError.message}`, 'error');
                       throw fileError;
                   }
               } else {
                   content = statusImage;
               }
          } else if (statusText.trim()) {
               type = 'text';
               content = statusText;
          } else {
              toast.show('Status cannot be empty.', 'error');
              setUpdating(false);
              return;
          }

          const { error } = await supabase.from('statuses').insert({
              user_id: user.id,
              content: content,
              type: type,
              caption: type === 'image' ? statusText : null, // If image, text becomes caption
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours default
          });

          if (error) throw error;

          toast.show('Status added!', 'success');
          fetchStatus(); 
      } catch (error: any) {
          toast.show(error.message || 'Failed to update status', 'error');
          setModalVisible(true); // Re-open on error
      } finally {
          setUpdating(false);
      }
  };

  return (
    <StatusContext.Provider value={{ openModal, openCamera, closeModal, activeStatuses, fetchStatus, deleteStatus }}>
      {children}
      
      {/* Status Modal */}
      <Modal 
        visible={modalVisible && !cameraModalVisible} 
        transparent 
        animationType="fade"
      >
          <Animated.View style={{ flex: 1, transform: [{ translateY: modalTranslateY }] }}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    className="flex-1 justify-end bg-black/60"
                  >
                      <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
                          <View className="bg-white rounded-t-3xl p-6 pb-10 max-h-[90%]">
                        {/* Header */}
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-ink">My Status</Text>
                            <View className="flex-row gap-2">
                                {activeStatuses.length > 0 && (
                                    <TouchableOpacity 
                                        onPress={async () => {
                                            console.log('Eye icon clicked, activeStatuses:', activeStatuses.length, 'userProfile:', userProfile);
                                            // Ensure profile is loaded before opening preview
                                            if (!userProfile) {
                                                console.log('Fetching user profile...');
                                                await fetchUserProfile();
                                            }
                                            // Close status modal and open preview
                                            closeModal();
                                            console.log('Opening preview modal');
                                            setPreviewModalVisible(true);
                                        }} 
                                        className="p-2 bg-gray-100 rounded-full"
                                    >
                                        <IconSymbol name="eye.fill" size={20} color="#1A1A1A" />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={closeModal} className="p-2 bg-gray-100 rounded-full">
                                    <IconSymbol name="xmark" size={20} color="#1A1A1A" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Active Statuses List */}
                        {activeStatuses.length > 0 && (
                            <View className="mb-6" style={{ width: '100%' }}>
                                <Text className="text-xs font-bold text-gray-400 uppercase mb-2">Active Updates</Text>
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
                                            <View className="h-32 w-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                                                {item.type === 'image' ? (
                                                    <PreviewImage path={item.content || ''} />
                                                ) : (
                                                    <View className="flex-1 items-center justify-center p-2 bg-blue-50">
                                                        <Text numberOfLines={4} className="text-[10px] text-center font-medium italic">"{item.content}"</Text>
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
                                            <Text className="text-[10px] text-gray-400 mt-1 text-center">
                                                {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                        
                        {/* New Status Input */}
                        <Text className="text-sm font-bold text-gray-500 mb-3 ml-1">Add to Status</Text>
                        
                        {/* Photo/Camera Buttons */}
                        <View className="flex-row mb-4">
                            {statusImage ? (
                                <TouchableOpacity onPress={pickImage} className="flex-1">
                                    <View className="w-full h-16 rounded-2xl overflow-hidden border border-gray-200 relative">
                                        <Image source={{ uri: statusImage }} className="w-full h-full" resizeMode="cover" />
                                        <View className="absolute inset-0 bg-black/20 items-center justify-center">
                                            <IconSymbol name="pencil" size={18} color="white" />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <>
                                    <TouchableOpacity 
                                        onPress={pickImage} 
                                        className="flex-1 h-16 rounded-2xl bg-gray-100 items-center justify-center border border-gray-200"
                                        style={{ marginRight: 8 }}
                                    >
                                        <IconSymbol name="photo.fill" size={22} color="#9CA3AF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        onPress={() => {
                                            console.log('Camera button pressed');
                                            setCameraModalVisible(true);
                                        }} 
                                        className="flex-1 h-16 rounded-2xl bg-gray-100 items-center justify-center border border-gray-200"
                                        style={{ marginLeft: 8 }}
                                    >
                                        <IconSymbol name="camera.fill" size={22} color="#9CA3AF" />
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                        
                        {/* Text Input - Below buttons */}
                        <TextInput 
                            value={statusText}
                            onChangeText={setStatusText}
                            placeholder="What're you up to?"
                            placeholderTextColor="#9CA3AF"
                            multiline
                            className="bg-gray-50 p-4 rounded-xl text-ink text-lg min-h-[64px] mb-6"
                            returnKeyType="done"
                            blurOnSubmit={true}
                            onSubmitEditing={() => Keyboard.dismiss()}
                        />

                        <Text className="text-gray-400 text-xs text-center mb-6">
                            Updates last 24 hours. Use the + button to add more.
                        </Text>

                        <View className="self-center items-center justify-center">
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
                      </View>
                  </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
              </TouchableWithoutFeedback>
          </Animated.View>
      </Modal>
      
      {/* Custom Camera Modal - Rendered after status modal to ensure it's on top */}
      <CameraModal
        visible={cameraModalVisible}
        onClose={() => {
          setCameraModalVisible(false);
          setCameraFromSwipe(false);
        }}
        onPhotoTaken={handleCameraPhoto}
        slideFromRight={cameraFromSwipe}
      />

      {/* Status Preview Modal - Shows how others see your status */}
      <StatusPreviewModal
        visible={previewModalVisible}
        statuses={activeStatuses}
        profile={userProfile}
        startIndex={previewStartIndex}
        onClose={() => setPreviewModalVisible(false)}
        onDelete={deleteStatus}
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
    onDelete 
}: { 
    visible: boolean; 
    statuses: StatusItem[]; 
    profile: { avatar_url: string | null; full_name: string; username: string; city: string | null; is_verified: boolean } | null;
    startIndex?: number;
    onClose: () => void;
    onDelete: (id: string) => Promise<void>;
}) {
    const { width, height } = useWindowDimensions();
    const [activeIndex, setActiveIndex] = useState(startIndex);
    
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
    
    // Always render Modal, but control visibility
    if (statuses.length === 0) {
        return null;
    }
    
    const currentStatus = statuses[activeIndex];
    if (!currentStatus && statuses.length > 0) {
        // If current status is invalid but we have statuses, reset to first
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
            <View className="flex-1 bg-black">
                {/* Status Progress Bars */}
                <View className="absolute top-14 left-2 right-2 flex-row gap-1 z-50 h-1">
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
                                <Text className="text-white text-2xl font-bold italic text-center leading-9">
                                    "{currentStatus.content}"
                                </Text>
                            </View>
                        )}
                        {currentStatus.type === 'image' && (
                            <View className="absolute inset-0 bg-black/10" />
                        )}
                    </View>
                </TouchableWithoutFeedback>

                {/* Top Overlay: Compact Header */}
                <View className="absolute top-0 left-0 right-0 pt-16 pb-4 px-4 pointer-events-none">
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
                                        <Text className="text-gray-400 text-[9px] ml-2 shadow-sm">
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
                    {currentStatus.caption && (
                        <Text className="text-white text-sm font-medium mb-2 shadow-lg">
                            {currentStatus.caption}
                        </Text>
                    )}
                    <View className="flex-row items-center justify-between">
                        <Text className="text-gray-300 text-xs italic">Tap left/right to navigate</Text>
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
                            className="bg-red-500/80 px-4 py-2 rounded-full"
                        >
                            <Text className="text-white text-xs font-bold">Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Close Button */}
                <TouchableOpacity
                    onPress={onClose}
                    className="absolute top-12 right-4 bg-black/50 p-3 rounded-full z-50"
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
