import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

type Photo = {
  id: string;
  image_url: string;
  display_order: number;
};

interface ProfileGalleryProps {
  userId: string;
}

export default function ProfileGallery({ userId }: ProfileGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchPhotos();
  }, [userId]);

  const fetchPhotos = async () => {
    const { data } = await supabase
      .from('profile_photos')
      .select('*')
      .eq('user_id', userId)
      .order('display_order', { ascending: true });
    
    if (data) setPhotos(data);
  };

  const uploadPhoto = async () => {
    if (photos.length >= 5) {
      Alert.alert('Limit Reached', 'You can only upload up to 5 photos.');
      return;
    }

    try {
      setUploading(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.5,
      });

      if (result.canceled || !result.assets[0].uri) return;

      const image = result.assets[0];
      const fileName = `${userId}/${Date.now()}.jpg`;
      
      const formData = new FormData();
      formData.append('file', {
        uri: image.uri,
        name: fileName,
        type: image.mimeType || 'image/jpeg',
      } as any);

      const { error: uploadError } = await supabase.storage
        .from('avatars') 
        .upload(fileName, formData, {
          contentType: image.mimeType || 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Insert into DB
      const { error: dbError } = await supabase
        .from('profile_photos')
        .insert({
          user_id: userId,
          image_url: fileName,
          display_order: photos.length, // Append to end
        });

      if (dbError) throw dbError;

      fetchPhotos();

    } catch (error) {
        if (error instanceof Error) {
            Alert.alert('Upload Failed', error.message);
        }
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (photoId: string, path: string) => {
    Alert.alert('Delete Photo', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          await supabase.storage.from('avatars').remove([path]);
          await supabase.from('profile_photos').delete().eq('id', photoId);
          fetchPhotos();
        }
      }
    ]);
  };

  return (
    <View className="mt-6">
      <Text className="text-lg font-bold mb-3">Your Photos ({photos.length}/5)</Text>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
        {photos.map((photo) => (
          <View key={photo.id} className="mr-3 relative">
            <PhotoImage path={photo.image_url} />
            <TouchableOpacity 
              className="absolute top-1 right-1 bg-red-500 w-6 h-6 rounded-full items-center justify-center z-10"
              onPress={() => deletePhoto(photo.id, photo.image_url)}
            >
              <Text className="text-white font-bold">X</Text>
            </TouchableOpacity>
          </View>
        ))}

        {photos.length < 5 && (
          <TouchableOpacity 
            className="w-32 h-40 bg-gray-200 rounded-lg items-center justify-center border-2 border-dashed border-gray-400"
            onPress={uploadPhoto}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-gray-500 font-bold text-3xl">+</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function PhotoImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (path) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        console.log('Gallery Image URL:', data.publicUrl); 
        setUrl(data.publicUrl);
    }
  }, [path]);

  if (!url) return <View className="w-32 h-40 bg-gray-300 rounded-lg animate-pulse" />;

  return (
    <Image 
      source={url} 
      style={{ width: 128, height: 160, borderRadius: 8, backgroundColor: '#d1d5db' }}
      contentFit="cover"
      transition={200}
      cachePolicy="memory-disk"
      onError={(e) => console.log('Gallery Image Error:', e.error)}
    />
  );
}
