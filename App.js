import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Image, Modal, ActivityIndicator, Linking } from 'react-native';
import { registerRootComponent } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider'; 
import { Video, Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from './firebaseConfig';
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

function App() {
  const [view, setView] = useState('dashboard');
  const [currentHelper, setCurrentHelper] = useState('Chris');
  const [sessionNotes, setSessionNotes] = useState('');
  const [videoLink, setVideoLink] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [localMedia, setLocalMedia] = useState([]); 
  const [selectedMedia, setSelectedMedia] = useState(null); 
  const [logs, setLogs] = useState([]);
  
  const [recording, setRecording] = useState(null);
  const [playbackSound, setPlaybackSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const getName = async () => {
      const storedName = await AsyncStorage.getItem('user_name');
      if (storedName) setCurrentHelper(storedName);
    };
    getName();
    return () => { if (playbackSound) playbackSound.unloadAsync(); };
  }, [playbackSound]);

  // --- AUDIO RECORDING ---
  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return Alert.alert("Mic Denied", "Enable Mic in settings.");
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) { Alert.alert('Mic Error', err.message); }
  }

  async function stopRecording() {
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setLocalMedia([...localMedia, { uri, type: 'audio' }]);
    } catch (e) { Alert.alert("Audio Error", "Recording stopped."); }
  }

  // --- AUDIO PLAYBACK & SCRUBBING ---
  async function loadAudio(url) {
    if (playbackSound) await playbackSound.unloadAsync();
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true },
      onPlaybackStatusUpdate
    );
    setPlaybackSound(sound);
    setSelectedMedia({ type: 'audio', url });
    setIsPlaying(true);
  }

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis);
      setIsPlaying(status.isPlaying);
    }
  };

  const seekAudio = async (value) => {
    if (playbackSound) {
      await playbackSound.setPositionAsync(value);
    }
  };

  async function togglePlayback() {
    if (isPlaying) await playbackSound.pauseAsync();
    else await playbackSound.playAsync();
  }

  const removeMedia = (indexToRemove) => setLocalMedia(localMedia.filter((_, index) => index !== indexToRemove));

  // --- CAMERA & GALLERY FUNCTIONS ---
  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Permission Error", "Enable 'Photos and videos' in Pixel settings.");
    let result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.All, 
      allowsMultipleSelection: true, 
      selectionLimit: 15, 
      quality: 0.5 
    });
    if (!result.canceled) {
      const newItems = result.assets.map(asset => ({ uri: asset.uri, type: asset.type }));
      setLocalMedia([...localMedia, ...newItems]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Permission Error", "Enable Camera in Pixel settings.");
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5 });
    if (!result.canceled) setLocalMedia([...localMedia, { uri: result.assets[0].uri, type: 'image' }]);
  };

  const recordVideo = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return Alert.alert("Permission Error", "Camera access is blocked.");
      let result = await ImagePicker.launchCameraAsync({ 
        mediaTypes: ImagePicker.MediaTypeOptions.Videos, 
        videoMaxDuration: 45,
        quality: 1 
      });
      if (!result.canceled) setLocalMedia([...localMedia, { uri: result.assets[0].uri, type: 'video' }]);
    } catch (e) { Alert.alert("Camera Error", "Check permissions in settings."); }
  };

  const handleSave = async () => {
    if (localMedia.length === 0 && !sessionNotes && !videoLink) return;
    setIsUploading(true);
    try {
      const uploadedUrls = [];
      for (const item of localMedia) {
        const response = await fetch(item.uri);
        const blob = await response.blob();
        const ext = item.type === 'video' ? 'mp4' : item.type === 'audio' ? 'm4a' : 'jpg';
        const filename = `evidence/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const storageRef = ref(storage, filename);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push({ url, type: item.type });
      }
      await setDoc(doc(db, "sessionLogs", `log_${Date.now()}`), {
        user: currentHelper, timestamp: new Date().toISOString(), notes: sessionNotes, externalVideo: videoLink, mediaLinks: uploadedUrls, logType: 'Media Evidence'
      });
      Alert.alert("Locked in Vault", "Media secured.");
      setLocalMedia([]); setSessionNotes(''); setVideoLink('');
    } catch (e) { Alert.alert("Upload Error", "Check connection."); }
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
        <View style={styles.header}><TouchableOpacity onPress={() => setView('dashboard')}><Text style={styles.backButton}>← Back</Text></TouchableOpacity><Text style={styles.title}>Evidence Vault</Text></View>
        <ScrollView>
          {logs.map((log) => (
            <View key={log.id} style={styles.historyCard}>
              <Text style={styles.historyDate}>{new Date(log.timestamp).toLocaleDateString('en-CA')}</Text>
              <Text style={styles.historyNotes}>"{log.notes}"</Text>
              {log.externalVideo && <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(log.externalVideo)}><Text style={styles.linkBtnText}>🔗 Open External Video</Text></TouchableOpacity>}
              <ScrollView horizontal style={{ marginTop: 10 }}>
                {log.mediaLinks && log.mediaLinks.map((item, index) => (
                  <TouchableOpacity key={index} onPress={() => item.type === 'audio' ? loadAudio(item.url) : setSelectedMedia(item)} style={styles.miniPreviewContainer}>
                    {item.type === 'audio' ? <Text style={styles.audioIcon}>🎙️ Audio</Text> : <Image source={{ uri: item.url }} style={styles.miniPreview} />}
                    {item.type === 'video' && <View style={styles.playOverlay}><Text>▶️</Text></View>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
          <View style={{height: 60}} />
        </ScrollView>
        <Modal visible={selectedMedia !== null} transparent={true}>
          <View style={styles.modalView}>
            {selectedMedia?.type === 'audio' ? (
              <View style={styles.audioDashboard}>
                <Text style={styles.audioTitle}>🎙️ PT Recording</Text>
                <Slider style={{width: '100%', height: 40}} minimumValue={0} maximumValue={duration} value={position} onSlidingComplete={seekAudio} minimumTrackTintColor="#1a2a6c" maximumTrackTintColor="#dcdde1" />
                <View style={styles.playbackRow}>
                  <TouchableOpacity style={styles.playBtn} onPress={togglePlayback}><Text style={styles.playBtnText}>{isPlaying ? 'PAUSE' : 'PLAY'}</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.playBtn, {backgroundColor: '#e74c3c'}]} onPress={async () => { if(playbackSound) await playbackSound.stopAsync(); setIsPlaying(false); }}><Text style={styles.playBtnText}>STOP</Text></TouchableOpacity>
                </View>
              </View>
            ) : selectedMedia?.type === 'video' ? (
              <Video source={{ uri: selectedMedia.url }} useNativeControls shouldPlay style={styles.fullImage} resizeMode="contain" />
            ) : (
              <Image source={{ uri: selectedMedia?.url }} style={styles.fullImage} resizeMode="contain" />
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setSelectedMedia(null); if (playbackSound) playbackSound.stopAsync(); }}><Text style={styles.closeText}>CLOSE VAULT</Text></TouchableOpacity>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Recovery Vault</Text><TouchableOpacity style={styles.historyBtn} onPress={fetchHistory}><Text style={styles.historyBtnText}>View Logs</Text></TouchableOpacity></View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Capture Media Evidence</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.smallBtn} onPress={takePhoto}><Text>📷 Photo</Text></TouchableOpacity>
          <TouchableOpacity style={styles.smallBtn} onPress={recordVideo}><Text>🎥 Video</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.smallBtn, recording ? styles.recording : null]} onPress={recording ? stopRecording : startRecording}><Text>{recording ? '🛑 Stop' : '🎙️ Audio'}</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.evidenceBtn, {marginTop: 10}]} onPress={pickMedia}><Text>🖼️ Gallery Dump (Multi-Select)</Text></TouchableOpacity>
        <ScrollView horizontal style={{ marginVertical: 15 }}>
          {localMedia.map((item, index) => (
            <View key={index} style={styles.thumbnailContainer}>
              {item.type === 'audio' ? <View style={styles.miniPreview}><Text style={{textAlign: 'center', marginTop: 35, fontWeight: 'bold'}}>🎙️ Audio</Text></View> : <Image source={{ uri: item.uri }} style={styles.miniPreview} />}
              <TouchableOpacity style={styles.deleteButton} onPress={() => removeMedia(index)}><Text style={styles.deleteButtonText}>✕</Text></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        <Text style={styles.cardTitle}>Large Video Link (Drive)</Text>
        <TextInput style={styles.input} placeholder="Paste link..." value={videoLink} onChangeText={setVideoLink} />
        <Text style={[styles.cardTitle, {marginTop: 15}]}>Evidence Notes</Text>
        <TextInput style={styles.notesInput} placeholder="Details for your lawyer..." multiline value={sessionNotes} onChangeText={setSessionNotes} />
        {isUploading ? <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#1a2a6c" /><Text style={styles.loadingText}>Uploading evidence...</Text></View> : <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveBtnText}>LOCK IN EVIDENCE VAULT</Text></TouchableOpacity>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
  header: { marginTop: 60, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a2a6c' },
  backButton: { color: '#3498db', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#34495e', marginBottom: 5 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  smallBtn: { backgroundColor: '#ecf0f1', padding: 15, borderRadius: 10, width: '31%', alignItems: 'center' },
  recording: { backgroundColor: '#e74c3c' },
  evidenceBtn: { backgroundColor: '#ecf0f1', padding: 15, borderRadius: 10, alignItems: 'center' },
  input: { borderBottomWidth: 1, borderColor: '#dcdde1', paddingVertical: 8, fontSize: 14, marginBottom: 10 },
  thumbnailContainer: { position: 'relative', marginRight: 15, marginTop: 5 },
  miniPreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#eee', justifyContent: 'center' },
  miniPreviewContainer: { marginRight: 10, position: 'relative' },
  audioIcon: { fontSize: 11, width: 100, height: 100, textAlign: 'center', backgroundColor: '#ecf0f1', borderRadius: 8, lineHeight: 100, fontWeight: 'bold', color: '#1a2a6c' },
  playOverlay: { position: 'absolute', top: 35, left: 35 },
  deleteButton: { position: 'absolute', top: -8, right: -8, backgroundColor: '#e74c3c', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  deleteButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 10 },
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 10, height: 80, marginTop: 5 },
  saveBtn: { backgroundColor: '#1a2a6c', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  linkBtn: { backgroundColor: '#f1f2f6', padding: 10, borderRadius: 8, marginVertical: 10, borderWidth: 1, borderColor: '#3498db' },
  linkBtnText: { color: '#3498db', fontWeight: 'bold', fontSize: 13 },
  loadingContainer: { alignItems: 'center', marginTop: 15 },
  loadingText: { marginTop: 10, color: '#7f8c8d', fontWeight: 'bold' },
  historyBtn: { backgroundColor: '#34495e', padding: 8, borderRadius: 8 },
  historyBtnText: { color: '#fff', fontSize: 12 },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, borderLeftWidth: 5, borderLeftColor: '#27ae60' },
  historyDate: { fontWeight: 'bold', marginBottom: 5 },
  historyNotes: { fontSize: 12, fontStyle: 'italic', color: '#7f8c8d' },
  modalView: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  audioDashboard: { backgroundColor: '#fff', padding: 30, borderRadius: 20, width: '90%', alignItems: 'center' },
  audioTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#1a2a6c' },
  playbackRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 10 },
  playBtn: { backgroundColor: '#2ecc71', padding: 15, borderRadius: 10, width: '45%', alignItems: 'center' },
  playBtnText: { color: '#fff', fontWeight: 'bold' },
  fullImage: { width: '95%', height: '80%' },
  closeBtn: { marginTop: 20, backgroundColor: '#fff', padding: 15, borderRadius: 10 },
  closeText: { fontWeight: 'bold', color: '#000' }
});

registerRootComponent(App);