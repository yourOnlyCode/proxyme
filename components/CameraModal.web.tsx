import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Image, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';

export function CameraModal({ 
    visible, 
    onClose, 
    onPhotoTaken,
}: { 
    visible: boolean; 
    onClose: () => void; 
    onPhotoTaken: (uri: string) => void;
    slideFromRight?: boolean;
    source?: 'proxy' | 'status';
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setPreview(url);
        }
    };

    const handleConfirm = () => {
        if (preview) {
            onPhotoTaken(preview);
            setPreview(null);
            onClose();
        }
    };

    const handleRetake = () => {
        setPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.container}>
                <View style={styles.card}>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                         <IconSymbol name="xmark" size={24} color="black" />
                    </TouchableOpacity>

                    <Text style={styles.title}>Upload Photo</Text>
                    
                    {preview ? (
                        <View style={styles.previewContainer}>
                            <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="cover" />
                            <View style={styles.actions}>
                                <TouchableOpacity onPress={handleRetake} style={styles.buttonSecondary}>
                                    <Text style={styles.buttonTextSecondary}>Change</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleConfirm} style={styles.buttonPrimary}>
                                    <Text style={styles.buttonTextPrimary}>Use Photo</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.uploadContainer}>
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            <TouchableOpacity 
                                onPress={() => fileInputRef.current?.click()}
                                style={styles.uploadButton}
                            >
                                <IconSymbol name="camera.fill" size={48} color="white" />
                                <Text style={styles.uploadText}>Select from Device</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 20,
        width: '100%',
        maxWidth: 400,
        alignItems: 'center',
        position: 'relative',
    },
    closeButton: {
        position: 'absolute',
        top: 15,
        right: 15,
        zIndex: 10,
        padding: 5,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        marginTop: 10,
    },
    uploadContainer: {
        width: '100%',
        aspectRatio: 1,
        backgroundColor: '#f0f0f0',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#ddd',
        borderStyle: 'dashed',
    },
    uploadButton: {
        alignItems: 'center',
        backgroundColor: '#2563EB',
        padding: 20,
        borderRadius: 16,
    },
    uploadText: {
        color: 'white',
        marginTop: 10,
        fontWeight: 'bold',
    },
    previewContainer: {
        width: '100%',
        alignItems: 'center',
    },
    previewImage: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 12,
        marginBottom: 20,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    buttonPrimary: {
        flex: 1,
        backgroundColor: '#2563EB',
        padding: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    buttonSecondary: {
        flex: 1,
        backgroundColor: '#f0f0f0',
        padding: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    buttonTextPrimary: {
        color: 'white',
        fontWeight: 'bold',
    },
    buttonTextSecondary: {
        color: 'black',
        fontWeight: 'bold',
    },
});

