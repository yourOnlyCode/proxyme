import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { CameraModal } from './CameraModal';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

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
    openCamera: () => void;
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
  const [updating, setUpdating] = useState(false);
  
  // Status Data
  const [statusText, setStatusText] = useState('');
  const [statusImage, setStatusImage] = useState<string | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<StatusItem[]>([]);

  const modalTranslateY = useRef(new Animated.Value(0)).current;

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
      if (user) fetchStatus();
  }, [user]);

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

  const openCamera = () => {
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
              <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1 justify-end bg-black/60"
              >
                  <View className="bg-white rounded-t-3xl p-6 pb-10 max-h-[90%]">
                        {/* Header */}
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-ink">My Status</Text>
                            <TouchableOpacity onPress={closeModal} className="p-2 bg-gray-100 rounded-full">
                                <IconSymbol name="xmark" size={20} color="#1A1A1A" />
                            </TouchableOpacity>
                        </View>

                        {/* Active Statuses List */}
                        {activeStatuses.length > 0 && (
                            <View className="mb-6">
                                <Text className="text-xs font-bold text-gray-400 uppercase mb-2">Active Updates</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                                    {activeStatuses.map((item) => (
                                        <View key={item.id} className="mr-3 w-24 relative">
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
                                                onPress={() => deleteStatus(item.id)}
                                                className="absolute -top-2 -right-2 bg-red-500 rounded-full w-6 h-6 items-center justify-center border-2 border-white"
                                            >
                                                <IconSymbol name="xmark" size={12} color="white" />
                                            </TouchableOpacity>
                                            <Text className="text-[10px] text-gray-400 mt-1 text-center">
                                                {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                            </Text>
                                        </View>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                        
                        {/* New Status Input */}
                        <Text className="text-sm font-bold text-gray-500 mb-2 ml-1">Add to Status</Text>
                        <View className="flex-row items-center mb-6">
                            {statusImage ? (
                                <TouchableOpacity onPress={pickImage} className="mr-4">
                                    <View className="w-16 h-16 rounded-2xl overflow-hidden border border-gray-200 relative">
                                        <Image source={{ uri: statusImage }} className="w-full h-full" resizeMode="cover" />
                                        <View className="absolute inset-0 bg-black/20 items-center justify-center">
                                            <IconSymbol name="pencil" size={16} color="white" />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <View className="flex-row gap-2 mr-4">
                                    <TouchableOpacity onPress={pickImage} className="w-16 h-16 rounded-2xl bg-gray-100 items-center justify-center border border-gray-200">
                                        <IconSymbol name="photo.fill" size={20} color="#9CA3AF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        onPress={() => {
                                            console.log('Camera button pressed');
                                            setCameraModalVisible(true);
                                        }} 
                                        className="w-16 h-16 rounded-2xl bg-gray-100 items-center justify-center border border-gray-200"
                                    >
                                        <IconSymbol name="camera.fill" size={20} color="#9CA3AF" />
                                    </TouchableOpacity>
                                </View>
                            )}
                            
                            <TextInput 
                                value={statusText}
                                onChangeText={setStatusText}
                                placeholder="Type a status..."
                                placeholderTextColor="#9CA3AF"
                                multiline
                                className="flex-1 bg-gray-50 p-4 rounded-xl text-ink text-lg min-h-[64px]"
                            />
                        </View>

                        <Text className="text-gray-400 text-xs text-center mb-6">
                            Updates last 24 hours. Use the + button to add more.
                        </Text>

                        <TouchableOpacity 
                            onPress={submitStatus}
                            disabled={updating}
                            className="bg-black w-16 h-16 rounded-full self-center items-center justify-center shadow-lg active:scale-95"
                        >
                             <IconSymbol name="plus" size={28} color="white" />
                        </TouchableOpacity>
                  </View>
              </KeyboardAvoidingView>
          </Animated.View>
      </Modal>
      
      {/* Custom Camera Modal - Rendered after status modal to ensure it's on top */}
      <CameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onPhotoTaken={handleCameraPhoto}
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
