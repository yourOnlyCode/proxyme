import { IconSymbol } from '@/components/ui/icon-symbol';
import { useStatus } from '@/components/StatusProvider';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { 
    Alert, 
    Animated, 
    Image, 
    Modal, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    TouchableWithoutFeedback, 
    View, 
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform
} from 'react-native';

export function StatusFloatingButton() {
  const { openModal, activeStatuses } = useStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [penpalModalVisible, setPenpalModalVisible] = useState(false);
  
  // Animation for menu
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Latest status for preview
  const latestStatus = activeStatuses.length > 0 ? activeStatuses[activeStatuses.length - 1] : null;

  useEffect(() => {
      if (menuOpen) {
          Animated.parallel([
              Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
              Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true })
          ]).start();
      } else {
          Animated.parallel([
              Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
              Animated.timing(slideAnim, { toValue: 20, duration: 150, useNativeDriver: true })
          ]).start();
      }
  }, [menuOpen]);

  const toggleMenu = () => setMenuOpen(!menuOpen);

  return (
    <>
      {/* Dim Background when menu open */}
      {menuOpen && (
          <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
              <View className="absolute inset-0 bg-black/40 z-40" />
          </TouchableWithoutFeedback>
      )}

      {/* Menu Items */}
      {menuOpen && (
          <View className="absolute bottom-40 right-4 items-end z-50">
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                  
                  {/* Penpal Button */}
                  <View className="flex-row items-center mb-4">
                      <View className="bg-white px-3 py-1 rounded-lg mr-2 shadow-sm">
                          <Text className="font-bold text-xs">Penpal Mode</Text>
                      </View>
                      <TouchableOpacity 
                          onPress={() => { setMenuOpen(false); setPenpalModalVisible(true); }}
                          className="w-12 h-12 bg-indigo-600 rounded-full items-center justify-center shadow-lg"
                      >
                          <IconSymbol name="paperplane.fill" size={20} color="white" />
                      </TouchableOpacity>
                  </View>

                  {/* Status Button */}
                  <View className="flex-row items-center">
                      <View className="bg-white px-3 py-1 rounded-lg mr-2 shadow-sm">
                          <Text className="font-bold text-xs">Update Status</Text>
                      </View>
                      <TouchableOpacity 
                          onPress={() => { setMenuOpen(false); openModal(); }}
                          className="w-12 h-12 bg-pink-500 rounded-full items-center justify-center shadow-lg"
                      >
                          <IconSymbol name="camera.fill" size={20} color="white" />
                      </TouchableOpacity>
                  </View>

              </Animated.View>
          </View>
      )}

      {/* Main FAB */}
      <TouchableOpacity 
        onPress={toggleMenu}
        activeOpacity={0.9}
        className={`absolute bottom-24 right-4 w-14 h-14 rounded-full items-center justify-center shadow-lg z-50 border border-gray-700 ${menuOpen ? 'bg-gray-800' : 'bg-black'}`}
        style={{ shadowColor: "#000", shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 }}
      >
          {latestStatus?.type === 'image' && latestStatus.content ? (
              <View className={`w-full h-full rounded-full overflow-hidden border-2 ${menuOpen ? 'border-gray-500' : 'border-white'}`}>
                  <PreviewImage path={latestStatus.content} />
              </View>
          ) : (
              <IconSymbol 
                  name={menuOpen ? "xmark" : "plus"} 
                  size={24} 
                  color="white" 
              />
          )}
          
          {/* Active indicator dot */}
          {activeStatuses.length > 0 && !menuOpen && (
              <View className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
          )}
      </TouchableOpacity>

      <PenpalModal visible={penpalModalVisible} onClose={() => setPenpalModalVisible(false)} />
    </>
  );
}

function PenpalModal({ visible, onClose }: { visible: boolean, onClose: () => void }) {
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const router = useRouter();

    const sendPenpal = async () => {
        if (!message.trim()) {
            Alert.alert('Message Required', 'Please write a message to send to your new penpal.');
            return;
        }

        setSending(true);
        try {
            const { data, error } = await supabase.rpc('send_penpal_message', { content: message });
            
            if (error) throw error;
            
            if (data.success) {
                onClose();
                setMessage('');
                router.push(`/chat/${data.connection_id}`);
            } else {
                if (data.error === 'limit_reached') {
                    Alert.alert('Limit Reached', 'You can only have one penpal at a time. Upgrade to verify your account for more!');
                } else if (data.error === 'no_users_found') {
                    Alert.alert('No Penpals Found', 'We couldn\'t find a match right now. Try again later!');
                } else {
                    Alert.alert('Error', 'Something went wrong.');
                }
            }
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1 justify-end bg-black/60"
            >
                <View className="bg-white rounded-t-3xl p-6 pb-12">
                    <View className="flex-row justify-between items-center mb-6">
                        <View className="flex-row items-center">
                            <View className="w-8 h-8 bg-indigo-100 rounded-full items-center justify-center mr-3">
                                <IconSymbol name="paperplane.fill" size={16} color="#4F46E5" />
                            </View>
                            <Text className="text-xl font-bold text-ink">Penpal Mode</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="p-2 bg-gray-100 rounded-full">
                            <IconSymbol name="xmark" size={20} color="#1A1A1A" />
                        </TouchableOpacity>
                    </View>

                    <Text className="text-gray-500 mb-6 leading-5">
                        Send a message to a random person in a different city. 
                        You can only have one active penpal at a time unless verified.
                    </Text>

                    <TextInput
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Say hello from your city..."
                        placeholderTextColor="#9CA3AF"
                        multiline
                        className="bg-gray-50 p-4 rounded-xl text-ink text-lg min-h-[120px] mb-6 text-top"
                        textAlignVertical="top"
                    />

                    <TouchableOpacity 
                        onPress={sendPenpal}
                        disabled={sending}
                        className="bg-indigo-600 w-full py-4 rounded-xl items-center shadow-lg active:bg-indigo-700"
                    >
                        {sending ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-white font-bold text-lg">Send to Random Penpal</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function PreviewImage({ path }: { path: string }) {
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
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />;
}
