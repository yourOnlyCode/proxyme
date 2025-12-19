import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type StatusData = {
    text: string | null;
    image: string | null;
    createdAt: string | null;
};

type StatusContextType = {
    openModal: () => void;
    closeModal: () => void;
    currentStatus: StatusData | null;
    fetchStatus: () => void;
    deleteStatus: () => Promise<void>;
};

const StatusContext = createContext<StatusContextType | undefined>(undefined);

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  
  const [modalVisible, setModalVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  
  // Status Data
  const [statusText, setStatusText] = useState('');
  const [statusImage, setStatusImage] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<StatusData | null>(null);

  const modalTranslateY = useRef(new Animated.Value(0)).current;

  // Fetch status
  const fetchStatus = async () => {
      if (!user) return;
      const { data } = await supabase
          .from('profiles')
          .select('status_text, status_image_url, status_created_at')
          .eq('id', user.id)
          .single();
      
      if (data) {
          // Check expiry
          let isActive = false;
          if (data.status_created_at) {
              const created = new Date(data.status_created_at);
              const now = new Date();
              const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
              if (diffHours < 1) isActive = true;
          }

          if (isActive) {
              setCurrentStatus({
                  text: data.status_text,
                  image: data.status_image_url,
                  createdAt: data.status_created_at
              });
          } else {
              setCurrentStatus(null);
          }
      }
  };

  useEffect(() => {
      if (user) fetchStatus();
  }, [user]);

  const deleteStatus = async () => {
      if (!user) return;
      // Optimistic Update
      setCurrentStatus(null);
      if (modalVisible) closeModal();
      toast.show('Removing status...', 'info');

      const { error } = await supabase.from('profiles').update({
          status_text: null,
          status_image_url: null,
          status_created_at: null,
          updated_at: new Date()
      }).eq('id', user.id);

      if (error) {
          toast.show('Failed to remove status', 'error');
          fetchStatus(); // Revert
      } else {
          toast.show('Status removed', 'success');
      }
  };

  const openModal = () => {
      modalTranslateY.setValue(0);
      setModalVisible(true);
      // Reset inputs
      setStatusText('');
      setStatusImage(null);
  };

  const closeModal = () => {
      setModalVisible(false);
  };

  const pickImage = async () => {
      try {
          const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.5,
          });
          if (!result.canceled) {
              setStatusImage(result.assets[0].uri);
          }
      } catch (error) {
          toast.show('Failed to pick image', 'error');
      }
  };

  const submitStatus = async (isProlong: boolean = false) => {
      if (!user) return;
      setUpdating(true);
      setModalVisible(false); // Optimistic close

      try {
          modalTranslateY.setValue(0);
          toast.show('Updating status...', 'info');

          const updates: any = {
              updated_at: new Date(),
              status_created_at: new Date().toISOString(),
          };

          if (isProlong && currentStatus) {
              updates.status_text = currentStatus.text;
              updates.status_image_url = currentStatus.image;
          } else {
              if (!statusText.trim() && !statusImage) {
                  toast.show('Status cannot be empty.', 'error');
                  setUpdating(false);
                  return;
              }

              updates.status_text = statusText;
              
              if (statusImage && !statusImage.startsWith('http') && !statusImage.startsWith('public/')) {
                   const arraybuffer = await fetch(statusImage).then((res) => res.arrayBuffer());
                   const fileExt = statusImage.split('.').pop()?.toLowerCase() ?? 'jpeg';
                   const path = `${Date.now()}.${fileExt}`;
                   
                   const { error: uploadError } = await supabase.storage
                    .from('avatars') 
                    .upload(path, arraybuffer, { contentType: `image/${fileExt}` });

                   if (uploadError) throw uploadError;
                   updates.status_image_url = path; 
              } else if (statusImage) {
                  updates.status_image_url = statusImage;
              } else {
                  updates.status_image_url = null;
              }
          }

          const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
          if (error) throw error;

          toast.show(isProlong ? 'Status prolonged!' : 'Status updated!', 'success');
          fetchStatus(); 
      } catch (error: any) {
          toast.show(error.message || 'Failed to update status', 'error');
      } finally {
          setUpdating(false);
      }
  };

  const prolongTime = new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <StatusContext.Provider value={{ openModal, closeModal, currentStatus, fetchStatus, deleteStatus }}>
      {children}
      
      {/* Modal */}
      <Modal 
        visible={modalVisible} 
        transparent 
        animationType="fade"
      >
          <Animated.View style={{ flex: 1, transform: [{ translateY: modalTranslateY }] }}>
              <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1 justify-end bg-black/60"
              >
                  <View className="bg-white rounded-t-3xl p-6 pb-10">
                        {/* Header */}
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-ink">My Status</Text>
                            <TouchableOpacity onPress={closeModal} className="p-2 bg-gray-100 rounded-full">
                                <IconSymbol name="xmark" size={20} color="#1A1A1A" />
                            </TouchableOpacity>
                        </View>

                        {/* Current Status Preview / Prolong */}
                        {currentStatus && (
                            <View className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                                <View className="flex-row items-center justify-between mb-3">
                                    <View>
                                        <Text className="text-xs text-gray-400 font-bold uppercase">Active Now</Text>
                                        {currentStatus.createdAt && (
                                            <Text className="text-[10px] text-gray-400 font-medium">
                                                Expires {new Date(new Date(currentStatus.createdAt).getTime() + 60 * 60 * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                            </Text>
                                        )}
                                    </View>
                                    <View className="flex-row items-center">
                                        <TouchableOpacity 
                                            onPress={() => submitStatus(true)}
                                            disabled={updating}
                                            className="bg-green-100 px-3 py-2 rounded-lg mr-2"
                                        >
                                            <Text className="text-green-700 font-bold text-xs">Prolong until {prolongTime}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            onPress={deleteStatus}
                                            className="bg-red-50 p-2 rounded-lg"
                                        >
                                            <IconSymbol name="trash" size={16} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                
                                {currentStatus.image && (
                                    <View className="h-40 w-full mb-3 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                                        <PreviewImage path={currentStatus.image} resizeMode="contain" />
                                    </View>
                                )}

                                {currentStatus.text && (
                                    <Text className="text-ink font-medium italic text-lg text-center">"{currentStatus.text}"</Text>
                                )}
                            </View>
                        )}
                        
                        {/* New Status Input */}
                        <Text className="text-sm font-bold text-gray-500 mb-2 ml-1">Update Status</Text>
                        <View className="flex-row items-center mb-6">
                             <TouchableOpacity onPress={pickImage} className="mr-4">
                                {statusImage ? (
                                     <View className="w-16 h-16 rounded-2xl overflow-hidden border border-gray-200 relative">
                                         <Image source={{ uri: statusImage }} className="w-full h-full" resizeMode="cover" />
                                         <View className="absolute inset-0 bg-black/20 items-center justify-center">
                                             <IconSymbol name="pencil" size={16} color="white" />
                                         </View>
                                     </View>
                                ) : (
                                     <View className="w-16 h-16 rounded-2xl bg-gray-100 items-center justify-center border border-gray-200 border-dashed">
                                         <IconSymbol name="camera.fill" size={24} color="#9CA3AF" />
                                     </View>
                                )}
                             </TouchableOpacity>
                             
                             <TextInput 
                                value={statusText}
                                onChangeText={setStatusText}
                                placeholder="What's happening?"
                                placeholderTextColor="#9CA3AF"
                                multiline
                                className="flex-1 bg-gray-50 p-4 rounded-xl text-ink text-lg min-h-[64px]"
                             />
                        </View>

                        <Text className="text-gray-400 text-xs text-center mb-6">
                            Status lasts for 1 hour. Updating replaces current status.
                        </Text>

                        <TouchableOpacity 
                            onPress={() => submitStatus(false)}
                            disabled={updating}
                            className="bg-black w-16 h-16 rounded-full self-center items-center justify-center shadow-lg active:scale-95"
                        >
                             <IconSymbol name="arrow.up" size={28} color="white" />
                        </TouchableOpacity>
                  </View>
              </KeyboardAvoidingView>
          </Animated.View>
      </Modal>
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
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        setUrl(data.publicUrl);
    }, [path]);
    
    if (!url) return <View className="w-full h-full bg-gray-200" />;
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode={resizeMode} />;
}
