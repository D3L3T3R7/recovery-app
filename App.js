import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Image, Modal, ActivityIndicator } from 'react-native';
import { registerRootComponent } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Video } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from './firebaseConfig';
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

function App() {
  const [view, setView] = useState('dashboard');
  const [currentHelper, setCurrentHelper] = useState('Chris');
  const [sessionNotes, setSessionNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  const [localMedia, setLocalMedia] = useState([]); 
  const [selectedMedia, setSelectedMedia] = useState(null); 
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const getName = async () => {
      const storedName = await AsyncStorage.getItem('user_name');
      if (storedName) setCurrentHelper(storedName);
    };
    getName();
  }, []);

  const generateThumbnail = async (videoUri) => {
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 1000 });
      return uri;
    } catch (e) { console.warn(e); return null; }
  };

  const removeMedia = (indexToRemove) => {
    setLocalMedia(localMedia.filter((_, index) => index !== indexToRemove));
  };

  // NEW: Handle multiple selections
  const pickMedia = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true, // ENABLED MULTI-SELECT
      selectionLimit: 10, // Cap at 10 at a time for stability
      quality: 1,
    });

    if (!result.canceled) {
      const newItems = [];
      for (const asset of result.assets) {
        let thumbnail = null;
        if (asset.type === 'video') {
          thumbnail = await generateThumbnail(asset.uri);
        }
        newItems.push({ uri: asset.uri, type: asset.type, thumbnail });
      }
      setLocalMedia([...localMedia, ...newItems]);
    }
  };

  const takePhoto = async () => {
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (!result.canceled) {
      setLocalMedia([...localMedia, { uri: result.assets[0].uri, type: result.assets[0].type, thumbnail: null }]);
    }
  };

  const recordVideo = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 60,
      quality: 1,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const thumbnail = await generateThumbnail(asset.uri);
      setLocalMedia([...localMedia, { uri: asset.uri, type: asset.type, thumbnail }]);
    }
  };

  const handleSave = async () => {
    if (localMedia.length === 0 && !sessionNotes) return;
    setIsUploading(true);
    try {
      const uploadedUrls = [];
      for (const item of localMedia) {
        // REVERTED TO SIMPLER UPLOAD METHOD (More reliable on bad connections for smaller files)
        const response = await fetch(item.uri);
        const blob = await response.blob();

        const extension = item.type === 'video' ? 'mp4' : 'jpg';
        const filename = `evidence/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
        const storageRef = ref(storage, filename);
        
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push({ url, type: item.type });
      }

      const logId = `log_${Date.now()}`;
      await setDoc(doc(db, "sessionLogs", logId), {
        user: currentHelper,
        timestamp: new Date().toISOString(),
        notes: sessionNotes,
        mediaLinks: uploadedUrls,
        logType: 'Media Evidence'
      });

      Alert.alert("Vault Locked", "Evidence has been securely uploaded.");
      setLocalMedia([]);
      setSessionNotes('');
    } catch (e) { 
      Alert.alert("Upload Error", `Connection failed. Details: ${e.message}`); 
    }
    setIsUploading(false);
  };

  const fetchHistory = async () => {
    setView('history');
    const q = query(collection(db, "sessionLogs"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    const fetchedLogs = [];
    querySnapshot.forEach((doc) => fetchedLogs.push({ id: doc.id, ...doc.data() }));
    setLogs(fetchedLogs);
  };

  if (view === 'history') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setView('dashboard')}><Text style={styles.backButton}>← Back</Text></TouchableOpacity>
          <Text style={styles.title}>Evidence Vault</Text>
        </View>
        <ScrollView>
          {logs.map((log) => (
            <View key={log.id} style={styles.historyCard}>
              <Text style={styles.historyDate}>{new Date(log.timestamp).toLocaleDateString('en-CA')}</Text>
              <Text style={styles.historyNotes}>"{log.notes}"</Text>
              <ScrollView horizontal style={{ marginTop: 10 }}>
                {log.mediaLinks && log.mediaLinks.map((item, index) => (
                  <TouchableOpacity key={index} onPress={() => setSelectedMedia(item)}>
                    {item.type === 'video' ? (
                      <View style={styles.videoContainer}>
                        <Video source={{ uri: item.url }} style={styles.miniPreview} resizeMode="cover" shouldPlay={false} isMuted={true} />
                        <View style={styles.playIconOverlay}><Text style={styles.playIcon}>▶️</Text></View>
                      </View>
                    ) : (
                      <Image source={{ uri: item.url }} style={styles.miniPreview} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>

        <Modal visible={selectedMedia !== null} transparent={true}>
          <View style={styles.modalView}>
            {selectedMedia?.type === 'video' ? (
              <Video source={{ uri: selectedMedia.url }} useNativeControls shouldPlay style={styles.fullImage} resizeMode="contain" />
            ) : (
              <Image source={{ uri: selectedMedia?.url }} style={styles.fullImage} resizeMode="contain" />
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedMedia(null)}>
              <Text style={styles.closeText}>CLOSE MEDIA</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recovery Vault</Text>
        <TouchableOpacity style={styles.historyBtn} onPress={fetchHistory}><Text style={styles.historyBtnText}>View Logs</Text></TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attach Evidence</Text>
        <View style={styles.evidenceRow}>
          <TouchableOpacity style={styles.evidenceBtn} onPress={takePhoto}><Text>📷 Take Photo</Text></TouchableOpacity>
          <TouchableOpacity style={styles.evidenceBtn} onPress={recordVideo}><Text>🎥 Record Video</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.evidenceBtn, {width: '100%', marginTop: 10}]} onPress={pickMedia}><Text>🖼️ Open Gallery (Multi-Select)</Text></TouchableOpacity>

        <ScrollView horizontal style={{ marginVertical: 15 }}>
          {localMedia.map((item, index) => (
            <View key={index} style={styles.thumbnailContainer}>
              {item.type === 'video' ? (
                <View style={styles.videoContainer}>
                  <Image source={{ uri: item.thumbnail }} style={styles.miniPreview} />
                  <View style={styles.playIconOverlay}><Text style={styles.playIcon}>▶️</Text></View>
                </View>
              ) : (
                <Image source={{ uri: item.uri }} style={styles.miniPreview} />
              )}
              <TouchableOpacity style={styles.deleteButton} onPress={() => removeMedia(index)}>
                <Text style={styles.deleteButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <TextInput style={styles.notesInput} placeholder="Add details..." multiline value={sessionNotes} onChangeText={setSessionNotes} />
        
        {isUploading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1a2a6c" />
            <Text style={styles.loadingText}>Uploading evidence to secure vault...</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>UPLOAD TO CLOUD VAULT</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
  header: { marginTop: 60, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: 'bold' },
  backButton: { color: '#3498db', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#34495e', marginBottom: 10 },
  evidenceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  evidenceBtn: { backgroundColor: '#ecf0f1', padding: 15, borderRadius: 10, width: '48%', alignItems: 'center', justifyContent: 'center' },
  thumbnailContainer: { position: 'relative', marginRight: 15, marginTop: 5 },
  miniPreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#eee' },
  videoContainer: { position: 'relative', width: 100, height: 100 },
  deleteButton: { position: 'absolute', top: -8, right: -8, backgroundColor: '#e74c3c', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 1.5, borderColor: '#fff' },
  deleteButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 10 },
  playIconOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8 },
  playIcon: { fontSize: 30 },
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 10, height: 60, marginTop: 10 },
  saveBtn: { backgroundColor: '#1a2a6c', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  loadingContainer: { alignItems: 'center', marginTop: 15, height: 50, justifyContent: 'center' },
  loadingText: { marginTop: 10, color: '#7f8c8d', fontWeight: 'bold' },
  historyBtn: { backgroundColor: '#34495e', padding: 8, borderRadius: 8 },
  historyBtnText: { color: '#fff', fontSize: 12 },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, borderLeftWidth: 5, borderLeftColor: '#27ae60' },
  historyDate: { fontWeight: 'bold', marginBottom: 5 },
  historyNotes: { fontSize: 12, fontStyle: 'italic', color: '#7f8c8d' },
  modalView: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '95%', height: '80%' },
  closeBtn: { marginTop: 20, backgroundColor: '#fff', padding: 15, borderRadius: 10 },
  closeText: { fontWeight: 'bold', color: '#000' }
});

registerRootComponent(App);