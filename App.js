import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Image, Modal, ActivityIndicator, Linking, Switch } from 'react-native';
import { registerRootComponent } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider'; 
import DateTimePicker from '@react-native-community/datetimepicker'; 
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

  const [isBacklog, setIsBacklog] = useState(false);
  const [backlogDate, setBacklogDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    const getName = async () => {
      const storedName = await AsyncStorage.getItem('user_name');
      if (storedName) setCurrentHelper(storedName);
    };
    getName();
    return () => { if (playbackSound) playbackSound.unloadAsync(); };
  }, [playbackSound]);

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) setBacklogDate(selectedDate);
  };

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
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
    } catch (e) { Alert.alert("Audio Error", "Recording failed."); }
  }

  async function loadAudio(url) {
    if (playbackSound) await playbackSound.unloadAsync();
    const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (status) => {
      if (status.isLoaded) { setPosition(status.positionMillis); setDuration(status.durationMillis); setIsPlaying(status.isPlaying); }
    });
    setPlaybackSound(sound);
    setSelectedMedia({ type: 'audio', url });
  }

  const seekAudio = async (value) => { if (playbackSound) await playbackSound.setPositionAsync(value); };

  const removeMedia = (indexToRemove) => setLocalMedia(localMedia.filter((_, index) => index !== indexToRemove));

  const pickMedia = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsMultipleSelection: true, selectionLimit: 20, quality: 0.5 });
    if (!result.canceled) {
      const newItems = result.assets.map(asset => ({ uri: asset.uri, type: asset.type }));
      setLocalMedia([...localMedia, ...newItems]);
    }
  };

  const takePhoto = async () => {
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5 });
    if (!result.canceled) setLocalMedia([...localMedia, { uri: result.assets[0].uri, type: 'image' }]);
  };

  const recordVideo = async () => {
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 30, quality: 1 });
    if (!result.canceled) setLocalMedia([...localMedia, { uri: result.assets[0].uri, type: 'video' }]);
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
        const filename = `evidence/${Date.now()}.${ext}`;
        const storageRef = ref(storage, filename);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push({ url, type: item.type });
      }

      const logTimestamp = isBacklog ? backlogDate.toISOString() : new Date().toISOString();

      await setDoc(doc(db, "sessionLogs", `log_${Date.now()}`), {
        user: currentHelper,
        timestamp: logTimestamp,
        notes: sessionNotes,
        externalVideo: videoLink,
        mediaLinks: uploadedUrls,
        logType: isBacklog ? 'Hospital Backlog' : 'Live Evidence'
      });

      Alert.alert("Success", isBacklog ? "Historical notes secured." : "Evidence locked.");
      setLocalMedia([]); setSessionNotes(''); setVideoLink(''); setIsBacklog(false);
    } catch (e) { Alert.alert("Upload Error", "Connection weak."); }
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
        <View style={styles.header}><TouchableOpacity onPress={() => setView('dashboard')}><Text style={styles.backButton}>← Back</Text></TouchableOpacity><Text style={styles.title}>Vault History</Text></View>
        <ScrollView>
          {logs.map((log) => (
            <View key={log.id} style={[styles.historyCard, log.logType === 'Hospital Backlog' ? {borderLeftColor: '#e67e22'} : null]}>
              <Text style={styles.historyDate}>{new Date(log.timestamp).toLocaleString('en-CA')}</Text>
              <Text style={styles.historyNotes}>"{log.notes}"</Text>
              {log.externalVideo && <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(log.externalVideo)}><Text style={styles.linkBtnText}>🔗 External Video</Text></TouchableOpacity>}
              <ScrollView horizontal style={{ marginTop: 10 }}>
                {log.mediaLinks && log.mediaLinks.map((item, index) => (
                  <TouchableOpacity key={index} onPress={() => item.type === 'audio' ? loadAudio(item.url) : setSelectedMedia(item)} style={styles.miniPreviewContainer}>
                    {item.type === 'audio' ? <Text style={styles.audioIcon}>🎙️</Text> : <Image source={{ uri: item.url }} style={styles.miniPreview} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
        <Modal visible={selectedMedia !== null} transparent={true}>
          <View style={styles.modalView}>
            {selectedMedia?.type === 'audio' ? (
              <View style={styles.audioDashboard}>
                <Text style={styles.audioTitle}>🎙️ Playback</Text>
                <Slider style={{width: '100%', height: 40}} minimumValue={0} maximumValue={duration} value={position} onSlidingComplete={seekAudio} minimumTrackTintColor="#1a2a6c" maximumTrackTintColor="#dcdde1" />
                <View style={styles.playbackRow}>
                  <TouchableOpacity style={styles.playBtn} onPress={() => isPlaying ? playbackSound.pauseAsync() : playbackSound.playAsync()}><Text style={styles.playBtnText}>{isPlaying ? 'PAUSE' : 'PLAY'}</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.playBtn, {backgroundColor: '#e74c3c'}]} onPress={async () => { await playbackSound.stopAsync(); }}><Text style={styles.playBtnText}>STOP</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <Image source={{ uri: selectedMedia?.url }} style={styles.fullImage} resizeMode="contain" />
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setSelectedMedia(null); if (playbackSound) playbackSound.stopAsync(); }}><Text style={styles.closeText}>CLOSE</Text></TouchableOpacity>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Recovery Vault</Text><TouchableOpacity style={styles.historyBtn} onPress={fetchHistory}><Text style={styles.historyBtnText}>View Logs</Text></TouchableOpacity></View>

      <View style={styles.card}>
        <View style={styles.backlogRow}>
          <Text style={styles.cardTitle}>Hospital Backlog Mode</Text>
          <Switch value={isBacklog} onValueChange={setIsBacklog} trackColor={{ false: "#767577", true: "#e67e22" }} />
        </View>

        {isBacklog && (
          <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateText}>📅 Log Date: {backlogDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}
        {showDatePicker && <DateTimePicker value={backlogDate} mode="date" display="default" onChange={onDateChange} />}

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.smallBtn} onPress={takePhoto}><Text>📷 Photo</Text></TouchableOpacity>
          <TouchableOpacity style={styles.smallBtn} onPress={recordVideo}><Text>🎥 Video</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.smallBtn, recording ? {backgroundColor: '#e74c3c'} : null]} onPress={recording ? stopRecording : startRecording}><Text>{recording ? '🛑 Stop' : '🎙️ Audio'}</Text></TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.evidenceBtn, {marginTop: 10, backgroundColor: isBacklog ? '#fff3e0' : '#ecf0f1'}]} onPress={pickMedia}>
          <Text>{isBacklog ? '🖼️ Bulk Upload Handwritten Notes' : '🖼️ Gallery Dump'}</Text>
        </TouchableOpacity>

        <ScrollView horizontal style={{ marginVertical: 15 }}>
          {localMedia.map((item, index) => (
            <View key={index} style={styles.thumbnailContainer}>
              <View style={styles.miniPreview}><Text style={{textAlign: 'center', marginTop: 35}}>{item.type === 'audio' ? '🎙️' : item.type === 'video' ? '🎥' : '📷'}</Text></View>
              <TouchableOpacity style={styles.deleteButton} onPress={() => removeMedia(index)}><Text style={styles.deleteButtonText}>✕</Text></TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <Text style={styles.cardTitle}>External Video Link</Text>
        <TextInput style={styles.input} placeholder="Paste link..." value={videoLink} onChangeText={setVideoLink} />

        <Text style={[styles.cardTitle, {marginTop: 15}]}>Evidence Notes {isBacklog ? '(Use Mic to dictate)' : ''}</Text>
        <TextInput style={styles.notesInput} placeholder="Add specific details..." multiline value={sessionNotes} onChangeText={setSessionNotes} />
        
        {isUploading ? <ActivityIndicator size="large" color="#1a2a6c" /> : <TouchableOpacity style={[styles.saveBtn, isBacklog ? {backgroundColor: '#e67e22'} : null]} onPress={handleSave}><Text style={styles.saveBtnText}>{isBacklog ? 'SECURE BACKLOG ENTRY' : 'LOCK IN VAULT'}</Text></TouchableOpacity>}
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
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#34495e' },
  backlogRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dateSelector: { backgroundColor: '#f1f2f6', padding: 10, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#e67e22' },
  dateText: { color: '#e67e22', fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  smallBtn: { backgroundColor: '#ecf0f1', padding: 15, borderRadius: 10, width: '31%', alignItems: 'center' },
  evidenceBtn: { backgroundColor: '#ecf0f1', padding: 15, borderRadius: 10, alignItems: 'center' },
  input: { borderBottomWidth: 1, borderColor: '#dcdde1', paddingVertical: 8, fontSize: 14, marginBottom: 10 },
  thumbnailContainer: { position: 'relative', marginRight: 15 },
  miniPreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#eee', justifyContent: 'center' },
  deleteButton: { position: 'absolute', top: -5, right: -5, backgroundColor: '#e74c3c', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  deleteButtonText: { color: '#fff', fontSize: 10 },
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 10, height: 100, marginTop: 5 },
  saveBtn: { backgroundColor: '#1a2a6c', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, borderLeftWidth: 5, borderLeftColor: '#27ae60' },
  historyDate: { fontWeight: 'bold', fontSize: 12, marginBottom: 5 },
  linkBtn: { backgroundColor: '#f1f2f6', padding: 8, borderRadius: 5, marginTop: 5 },
  linkBtnText: { color: '#3498db', fontSize: 12, fontWeight: 'bold' },
  modalView: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  audioDashboard: { backgroundColor: '#fff', padding: 20, borderRadius: 15, width: '85%' },
  playbackRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 20 },
  playBtn: { backgroundColor: '#2ecc71', padding: 10, borderRadius: 8, width: '40%', alignItems: 'center' },
  playBtnText: { color: '#fff', fontWeight: 'bold' },
  fullImage: { width: '90%', height: '70%' },
  closeBtn: { marginTop: 20, backgroundColor: '#fff', padding: 10, borderRadius: 8 },
  historyBtn: { backgroundColor: '#34495e', padding: 8, borderRadius: 8 },
  historyBtnText: { color: '#fff', fontSize: 12 }
});

registerRootComponent(App);