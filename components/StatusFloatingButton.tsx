import { IconSymbol } from '@/components/ui/icon-symbol';
import { useStatus } from '@/components/StatusProvider';
import { supabase } from '@/lib/supabase';
import React, { useEffect, useState } from 'react';
import { Image, TouchableOpacity, View } from 'react-native';

export function StatusFloatingButton() {
  const { openModal, currentStatus } = useStatus();

  return (
      <TouchableOpacity 
        onPress={openModal}
        className="absolute bottom-24 right-4 w-14 h-14 bg-black rounded-full items-center justify-center shadow-lg z-50 border border-gray-700"
        style={{ shadowColor: "#000", shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 }}
      >
          {currentStatus?.image ? (
              <View className="w-full h-full rounded-full overflow-hidden border-2 border-white">
                  <PreviewImage path={currentStatus.image} />
              </View>
          ) : (
              <IconSymbol name="plus" size={24} color="white" />
          )}
          {/* Active indicator dot */}
          {currentStatus && (
              <View className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
          )}
      </TouchableOpacity>
  );
}

function PreviewImage({ path }: { path: string }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!path) return;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        setUrl(data.publicUrl);
    }, [path]);
    
    if (!url) return <View className="w-full h-full bg-gray-200" />;
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />;
}