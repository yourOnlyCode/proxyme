import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface AvatarProps {
  url: string | null;
  size?: number;
  onUpload: (url: string) => void;
  editable?: boolean;
}

export default function Avatar({ url, size = 150, onUpload, editable = false }: AvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (url) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(url);
        console.log('Avatar URL:', data.publicUrl); 
        setAvatarUrl(data.publicUrl);
    }
  }, [url]);

  async function uploadAvatar() {
    try {
      setUploading(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const image = result.assets[0];
      
      const fileExt = image.uri.split('.').pop()?.toLowerCase() ?? 'jpeg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      // Read file as ArrayBuffer for reliable upload
      const arraybuffer = await fetch(image.uri).then((res) => res.arrayBuffer());

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, arraybuffer, {
          contentType: image.mimeType || 'image/jpeg',
          upsert: true
      });

      if (uploadError) {
        throw uploadError;
      }

      onUpload(filePath);
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert('Upload Error', error.message);
      } else {
        throw error;
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <View>
      {avatarUrl ? (
        <Image
          source={avatarUrl}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          onError={(e) => console.log('Image Load Error:', e.error)}
        />
      ) : (
        <View 
            className="bg-gray-200 justify-center items-center" 
            style={{ width: size, height: size, borderRadius: size / 2 }}
        >
            <Text className="text-gray-400 font-bold text-2xl">?</Text>
        </View>
      )}
      
      {editable && (
          <View className="mt-4 items-center">
            <TouchableOpacity 
                className="bg-black py-2 px-4 rounded-full"
                onPress={uploadAvatar}
                disabled={uploading}
            >
                {uploading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">Change Photo</Text>}
            </TouchableOpacity>
          </View>
      )}
    </View>
  );
}
