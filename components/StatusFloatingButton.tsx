import { KeyboardAwareLayout } from '@/components/KeyboardAwareLayout';
import { useStatus } from '@/components/StatusProvider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';

export function StatusFloatingButton() {
  const { openCamera, activeStatuses } = useStatus();
  const { user } = useAuth();
  const [relationshipGoal, setRelationshipGoal] = useState<string | null>(null);

  // Latest status for preview
  const latestStatus = activeStatuses.length > 0 ? activeStatuses[activeStatuses.length - 1] : null;

  // Fetch user's relationship goal
  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('relationship_goals')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.relationship_goals && data.relationship_goals.length > 0) {
            setRelationshipGoal(data.relationship_goals[0]);
          }
        });
    }
  }, [user]);

  // Get color based on relationship goal
  const getButtonColor = () => {
    switch(relationshipGoal) {
      case 'Romance': return '#E07A5F';
      case 'Friendship': return '#81B29A';
      case 'Professional': return '#3D405B';
      default: return '#000000';
    }
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'box-none' }}>
      {/* Main FAB */}
      <View className="absolute bottom-24 right-4 items-center justify-center" style={{ zIndex: 50 }}>
          <TouchableOpacity 
            onPress={() => openCamera(false, 'status')}
            activeOpacity={0.9}
            className="w-14 h-14 rounded-full items-center justify-center shadow-lg"
            style={{ 
                backgroundColor: getButtonColor(),
                shadowColor: "#000", 
                shadowOffset: {width: 0, height: 4}, 
                shadowOpacity: 0.3, 
                shadowRadius: 4.65, 
                elevation: 8,
            }}
          >
              {latestStatus?.type === 'image' && latestStatus.content ? (
                  <View className="w-full h-full rounded-full overflow-hidden border-2 border-white">
                      <PreviewImage path={latestStatus.content} />
                  </View>
              ) : (
                  <IconSymbol 
                      name="plus" 
                      size={24} 
                      color="white" 
                  />
              )}

              {/* Plus badge (so "add status" is still obvious even when previewing latest photo) */}
              {latestStatus?.type === 'image' && latestStatus.content ? (
                <View
                  className="absolute items-center justify-center"
                  style={{
                    right: -2,
                    bottom: -2,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    borderWidth: 2,
                    borderColor: getButtonColor(),
                  }}
                >
                  <IconSymbol name="plus" size={12} color={getButtonColor()} />
                </View>
              ) : null}
              
              {/* Active indicator dot */}
              {activeStatuses.length > 0 && (
                  <View className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
              )}
          </TouchableOpacity>
      </View>
    </View>
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
            <KeyboardAwareLayout 
                noDismissWrapper 
                headerOffset={0} 
                style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
            >
                <View className="bg-white rounded-t-3xl p-6 pb-12">
                    <View className="flex-row justify-between items-center mb-6">
                        <View className="flex-row items-center">
                            <View className="w-8 h-8 bg-indigo-100 rounded-full items-center justify-center mr-3">
                                <IconSymbol name="pencil.and.outline" size={16} color="#4F46E5" />
                            </View>
                            <Text className="text-xl font-bold text-ink">My Penpals</Text>
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
            </KeyboardAwareLayout>
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
