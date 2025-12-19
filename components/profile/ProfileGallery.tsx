import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View, LayoutAnimation } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '../../lib/supabase';

type Photo = {
  id: string;
  image_url: string;
  display_order: number;
};

interface ProfileGalleryProps {
  userId: string;
  onSetAvatar: (path: string) => void;
}

export default function ProfileGallery({ userId, onSetAvatar }: ProfileGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

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

  const uploadPhotos = async (replaceAll: boolean = false) => {
    if (!replaceAll && photos.length >= 6) {
      Alert.alert('Limit Reached', 'You can only upload up to 6 photos.');
      return;
    }

    try {
      setUploading(true);
      const limit = replaceAll ? 6 : 6 - photos.length;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        allowsMultipleSelection: true,
        selectionLimit: limit,
        quality: 0.5,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      if (replaceAll) {
          // Delete existing photos first
          const paths = photos.map(p => p.image_url);
          if (paths.length > 0) {
              await supabase.storage.from('avatars').remove(paths);
          }
          await supabase.from('profile_photos').delete().eq('user_id', userId);
          setPhotos([]); 
      }

      const uploadPromises = result.assets.map(async (asset, index) => {
          const fileExt = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpeg';
          const fileName = `${userId}/${Date.now()}_${index}.${fileExt}`;
          
          const arraybuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());

          const { error: uploadError } = await supabase.storage
            .from('avatars') 
            .upload(fileName, arraybuffer, {
              contentType: asset.mimeType || 'image/jpeg',
              upsert: true
            });

          if (uploadError) throw uploadError;

          return {
              user_id: userId,
              image_url: fileName,
              display_order: (replaceAll ? 0 : photos.length) + index,
          };
      });

      const newPhotosData = await Promise.all(uploadPromises);

      const { error: dbError } = await supabase
        .from('profile_photos')
        .insert(newPhotosData);

      if (dbError) throw dbError;

      fetchPhotos();
      setSelectedPhoto(null);

    } catch (error) {
        if (error instanceof Error) {
            Alert.alert('Upload Failed', error.message);
        }
    } finally {
      setUploading(false);
    }
  };

  const makeCover = async () => {
      if (!selectedPhoto) return;
      const otherPhotos = photos.filter(p => p.id !== selectedPhoto.id);
      const reordered = [selectedPhoto, ...otherPhotos].map((p, index) => ({
          ...p,
          display_order: index
      }));

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPhotos(reordered);

      const updates = reordered.map(p => ({
          id: p.id,
          user_id: userId,
          image_url: p.image_url,
          display_order: p.display_order
      }));

      await supabase.from('profile_photos').upsert(updates);
      setSelectedPhoto(null);
  };

  const deletePhoto = async () => {
      if (!selectedPhoto) return;
      
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPhotos(prev => prev.filter(p => p.id !== selectedPhoto.id));
      setSelectedPhoto(null);

      await supabase.storage.from('avatars').remove([selectedPhoto.image_url]);
      await supabase.from('profile_photos').delete().eq('id', selectedPhoto.id);
      fetchPhotos();
  };

  const handleSetProfile = () => {
      if (!selectedPhoto) return;
      onSetAvatar(selectedPhoto.image_url);
      Alert.alert('Success', 'Profile picture updated!');
      setSelectedPhoto(null);
  };

  return (
    <View className="mt-6">
      <View className="flex-row justify-between items-center mb-3">
          <Text className="text-lg font-bold">Gallery ({photos.length}/6)</Text>
          {photos.length > 0 && (
              <TouchableOpacity onPress={() => uploadPhotos(true)}>
                  <Text className="text-red-500 font-bold text-xs">Replace All</Text>
              </TouchableOpacity>
          )}
      </View>

      <Text className="text-gray-400 text-xs mb-4">
          First photo is Cover. Tap photo to edit.
      </Text>
      
      <View className="flex-row flex-wrap gap-2">
        {photos.map((photo, index) => {
            const isSelected = selectedPhoto?.id === photo.id;
            return (
              <TouchableOpacity 
                key={photo.id} 
                className={`relative mb-2 ${isSelected ? 'z-50' : 'z-0'}`}
                onPress={() => setSelectedPhoto(isSelected ? null : photo)}
                activeOpacity={0.9}
              >
                <PhotoImage path={photo.image_url} />
                {index === 0 && (
                    <View className="absolute top-1 left-1 bg-black/60 px-2 py-0.5 rounded">
                        <Text className="text-white text-[10px] font-bold">COVER</Text>
                    </View>
                )}
                {isSelected && (
                    <View className="absolute inset-0 bg-black/20 rounded-xl" />
                )}
                
                {/* Floating Menu - Centered Above */}
                {isSelected && (
                    <View className="absolute bottom-full mb-2 self-center bg-white rounded-xl shadow-2xl border border-gray-100 py-1 px-1 z-50 min-w-[140px]">
                        <TouchableOpacity 
                            onPress={handleSetProfile}
                            className="flex-row items-center p-2 border-b border-gray-50"
                        >
                            <IconSymbol name="person.crop.circle" size={16} color="#4B5563" />
                            <Text className="ml-2 text-ink text-xs font-bold">Set Profile</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={makeCover}
                            className="flex-row items-center p-2 border-b border-gray-50"
                        >
                            <IconSymbol name="star.fill" size={16} color="#F59E0B" />
                            <Text className="ml-2 text-ink text-xs font-bold">Make Cover</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            onPress={deletePhoto}
                            className="flex-row items-center p-2"
                        >
                            <IconSymbol name="trash.fill" size={16} color="#EF4444" />
                            <Text className="ml-2 text-red-500 text-xs font-bold">Delete</Text>
                        </TouchableOpacity>
                    </View>
                )}
              </TouchableOpacity>
            );
        })}

        {photos.length < 6 && (
          <TouchableOpacity 
            className="w-[108px] h-[144px] bg-gray-100 rounded-xl items-center justify-center border border-dashed border-gray-300 mb-2"
            onPress={() => uploadPhotos(false)}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator />
            ) : (
              <IconSymbol name="plus" size={32} color="#9CA3AF" />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function PhotoImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (path) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        setUrl(data.publicUrl);
    }
  }, [path]);

  if (!url) return <View className="w-[108px] h-[144px] bg-gray-200 rounded-xl animate-pulse" />;

  return (
    <Image 
      source={url} 
      style={{ width: 108, height: 144, borderRadius: 12 }} 
      contentFit="cover"
      transition={200}
      cachePolicy="memory-disk"
    />
  );
}
