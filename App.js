import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Image, Modal, ActivityIndicator, Switch } from 'react-native';
import { registerRootComponent } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'; 
import Slider from '@react-native-community/slider'; 
import DateTimePicker from '@react-native-community/datetimepicker'; 
import { Audio, Video } from 'expo-av';
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
  
  // VITALS 
  const [painLevel, setPainLevel] = useState(5);
  const [mobility, setMobility] = useState('Bedrest');
  const [mood, setMood] = useState('😐');

  // AUDIO/BACKLOG
  const [recording, setRecording] = useState(null);
  const [playbackSound, setPlaybackSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBacklog, setIsBacklog] = useState(false);
  const [backlogDate, setBacklogDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // PRO CAMERA
  const [showCamera, setShowCamera] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(15);
  const [zoom, setZoom] = useState(0);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const cameraRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const getName = async () => {
      const storedName = await AsyncStorage.getItem('user_name');
      if (storedName) setCurrentHelper(storedName);
    };
    getName();
    return () => { if (playbackSound) playbackSound.unloadAsync(); clearInterval(timerRef.current); };
  }, [playbackSound]);

  // --- PROMPTS ---
  const handleScannerPress = () => {
    Alert.alert("Scanner Prep", "Place document on a DARK surface and align straight.", 
      [{ text: "OPEN SCANNER", onPress: scanDocument }]);
  };

  const handleVideoPress = () => {
    Alert.alert("Video Limit", "Recording is capped at 15 seconds for Vault stability.", 
      [{ text: "OPEN CAMERA", onPress: startVideoFlow }]);
  };

  // --- CAPTURE ---
  const scanDocument = async () => {
    let res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, allowsEditing: true, aspect: [3, 4] });
    if (!res.canceled) setLocalMedia([...localMedia, { uri: res.assets[0].uri, type: 'image' }]);
  };

  const startVideoFlow = async () => {
    if (!camPerm?.granted) await requestCam();
    if (!micPerm?.granted) await requestMic();
    setSecondsLeft(15); setZoom(0); setShowCamera(true);
  };

  const startVideoRecord = async () => {
    if (cameraRef.current) {
      setIsRecordingVideo(true);
      setSecondsLeft(15);
      timerRef.current = setInterval(() => {
        setSecondsLeft((p) => { if (p <= 1) { stopVideoRecord(); return 0; } return p - 1; });
      }, 1000);
      try {
        const video = await cameraRef.current.recordAsync({ maxDuration: 15, quality: '480p' });
        setLocalMedia([...localMedia, { uri: video.uri, type: 'video' }]);
      } catch (e) { console.log(e); }
      finally { setIsRecordingVideo(false); setShowCamera(false); clearInterval(timerRef.current); }
    }
  };

  const stopVideoRecord = async () => { if (cameraRef.current) { clearInterval(timerRef.current); await cameraRef.current.stopRecording(); } };

  // --- AUDIO ---
  async function startAudio() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (e) { Alert.alert('Mic Error', e.message); }
  }

  async function stopAudio() {
    await recording.stopAndUnloadAsync();
    setLocalMedia([...localMedia, { uri: recording.getURI(), type: 'audio' }]);
    setRecording(null);
  }

  async function loadAudio(url) {
    if (playbackSound) await playbackSound.unloadAsync();
    const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (s) => {
      if (s.isLoaded) { setPosition(s.positionMillis); setDuration(s.durationMillis); setIsPlaying(s.isPlaying); }
    });
    setPlaybackSound(sound);
    setSelectedMedia({ type: 'audio', url });
  }

  // --- DATA HANDLING ---
  const handleSave = async () => {
    if (localMedia.length === 0 && !sessionNotes) return;
    setIsUploading(true);
    try {
      const uploadedUrls = [];
      for (const item of localMedia) {
        const response = await fetch(item.uri);
        const blob = await response.blob();
        const ext = item.type === 'video' ? 'mp4' : item.type === 'audio' ? 'm4a' : 'jpg';
        const storageRef = ref(storage, `evidence/${Date.now()}.${ext}`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push({ url, type: item.type });
      }
      await setDoc(doc(db, "sessionLogs", `log_${Date.now()}`), {
        user: currentHelper, timestamp: isBacklog ? backlogDate.toISOString() : new Date().toISOString(),
        notes: sessionNotes, mediaLinks: uploadedUrls,
        logType: isBacklog ? 'Backlog' : 'Live',
        vitals: { pain: painLevel, mobility, mood } 
      });
      Alert.alert("Secured", "Vault Updated.");
      setLocalMedia([]); setSessionNotes(''); setIsBacklog(false);
    } catch (e) { Alert.alert("Error", "Check connection."); }
    setIsUploading(false);
  };

  const fetchHistory = async () => {
    setView('history');
    const q = query(collection(db, "sessionLogs"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    const fetched = [];
    querySnapshot.forEach((d) => fetched.push({ id: d.id, ...d.data() }));
    setLogs(fetched);
  };

  if (view === 'history') {
    return (
      <View style={styles.container}>
        <View style={styles.header}><TouchableOpacity onPress={() => setView('dashboard')}><Text style={styles.backButton}>← Back</Text></TouchableOpacity><Text style={styles.title}>Vault History</Text></View>
        <ScrollView>
          {logs.map((log) => (
            <View key={log.id} style={[styles.historyCard, log.logType === 'Backlog' ? {borderLeftColor: '#e67e22'} : null]}>
              <View style={styles.logHeader}>
                <Text style={styles.historyDate}>{new Date(log.timestamp).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                {log.vitals && <View style={styles.vitalsBadge}><Text style={styles.vitalsText}>{log.vitals.pain}/10 | {log.vitals.mood}</Text></View>}
              </View>
              <Text style={styles.historyNotes}>{log.notes}</Text>
              <ScrollView horizontal style={{ marginTop: 10 }}>
                {log.mediaLinks && log.mediaLinks.map((item, index) => (
                  <TouchableOpacity key={index} onPress={() => item.type === 'audio' ? loadAudio(item.url) : setSelectedMedia(item)} style={styles.miniPreviewContainer}>
                    {item.type === 'audio' ? <Text style={styles.audioIconSmall}>🎙️</Text> : <Image source={{ uri: item.url }} style={styles.miniPreviewThumb} />}
                    {item.type === 'video' && <View style={styles.playIconOverlay}><Text style={{fontSize: 10}}>▶️</Text></View>}
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
                <Slider style={{width: '100%', height: 40}} minimumValue={0} maximumValue={duration} value={position} onSlidingComplete={async (v) => await playbackSound.setPositionAsync(v)} />
                <View style={styles.playbackRow}>
                  <TouchableOpacity style={styles.playBtn} onPress={() => isPlaying ? playbackSound.pauseAsync() : playbackSound.playAsync()}><Text style={styles.playBtnText}>{isPlaying ? 'PAUSE' : 'PLAY'}</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.playBtn, {backgroundColor: '#e74c3c'}]} onPress={async () => { await playbackSound.stopAsync(); }}><Text style={styles.playBtnText}>STOP</Text></TouchableOpacity>
                </View>
              </View>
            ) : selectedMedia?.type === 'video' ? <Video source={{ uri: selectedMedia.url }} style={styles.fullImage} useNativeControls resizeMode="contain" /> : <Image source={{ uri: selectedMedia?.url }} style={styles.fullImage} resizeMode="contain" />}
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setSelectedMedia(null); if (playbackSound) playbackSound.stopAsync(); }}><Text style={styles.closeText}>CLOSE</Text></TouchableOpacity>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>Recovery Vault</Text><TouchableOpacity style={styles.historyBtn} onPress={fetchHistory}><Text style={styles.historyBtnText}>History</Text></TouchableOpacity></View>

      <Modal visible={showCamera} animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <CameraView ref={cameraRef} style={{ flex: 1 }} mode="video" zoom={zoom}>
            <View style={styles.cameraOverlay}>
              <View style={styles.cameraTop}>
                <TouchableOpacity onPress={() => setShowCamera(false)}><Text style={{color: 'white'}}>✕ CANCEL</Text></TouchableOpacity>
                {isRecordingVideo && <View style={styles.timerBadge}><Text style={styles.timerText}>LIMIT: {secondsLeft}s</Text></View>}
              </View>
              <Slider style={{width: 200, alignSelf: 'center'}} minimumValue={0} maximumValue={1} value={zoom} onValueChange={setZoom} />
              <TouchableOpacity style={styles.recordOuter} onPress={isRecordingVideo ? stopVideoRecord : startVideoRecord}><View style={[styles.recordInner, isRecordingVideo ? {backgroundColor: 'red', borderRadius: 5} : null]} /></TouchableOpacity>
            </View>
          </CameraView>
        </View>
      </Modal>

      <View style={styles.card}>
        <View style={styles.backlogRow}><Text style={styles.cardTitle}>{isBacklog ? 'Backlog' : 'Daily'}</Text><Switch value={isBacklog} onValueChange={setIsBacklog} /></View>
        {isBacklog && <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}><Text style={styles.dateText}>📅 Date: {backlogDate.toLocaleDateString()}</Text></TouchableOpacity>}
        {showDatePicker && <DateTimePicker value={backlogDate} mode="date" display="spinner" onChange={(e,d) => { setShowDatePicker(false); if(d) setBacklogDate(d); }} />}
        <Text style={styles.label}>Pain: {painLevel}/10</Text>
        <Slider style={{width: '100%', height: 40}} minimumValue={1} maximumValue={10} step={1} value={painLevel} onValueChange={setPainLevel} />
        <View style={styles.btnRow}>{['Bedrest', 'Sitting', 'Walking'].map((m) => (<TouchableOpacity key={m} style={[styles.vitalsBtn, mobility === m ? styles.vitalsBtnActive : null]} onPress={() => setMobility(m)}><Text style={mobility === m ? {color: '#fff'} : null}>{m}</Text></TouchableOpacity>))}</View>
        <View style={[styles.btnRow, {marginTop: 10}]}>{['😫', '😔', '😐', '🙂'].map((e) => (<TouchableOpacity key={e} style={[styles.vitalsBtn, mood === e ? styles.vitalsBtnActive : null]} onPress={() => setMood(e)}><Text style={{fontSize: 22}}>{e}</Text></TouchableOpacity>))}</View>
      </View>

      <View style={[styles.card, {marginTop: 15}]}>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.smallBtn} onPress={() => ImagePicker.launchCameraAsync({quality: 0.5}).then(r => !r.canceled && setLocalMedia([...localMedia, {uri: r.assets[0].uri, type: 'image'}]))}><Text>📷 Photo</Text></TouchableOpacity>
          <TouchableOpacity style={styles.smallBtn} onPress={handleVideoPress}><Text>🎥 Video</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.smallBtn, recording ? {backgroundColor: '#e74c3c'} : null]} onPress={recording ? stopAudio : startAudio}><Text>{recording ? '🛑' : '🎙️'}</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.evidenceBtn, {marginTop: 10, backgroundColor: '#3498db'}]} onPress={handleScannerPress}><Text style={{color: '#fff', fontWeight: 'bold'}}>📄 SCAN DOCUMENT</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.evidenceBtn, {marginTop: 10}]} onPress={() => ImagePicker.launchImageLibraryAsync({allowsMultipleSelection: true, quality: 0.5}).then(r => !r.canceled && setLocalMedia([...localMedia, ...r.assets.map(a=>({uri:a.uri, type:a.type==='video'?'video':'image'}))]))}><Text>🖼️ Gallery Upload</Text></TouchableOpacity>
        <ScrollView horizontal style={{ marginVertical: 10 }}>
          {localMedia.map((item, index) => (
            <View key={index} style={styles.thumbnailContainer}>
              {item.type === 'image' ? <Image source={{ uri: item.uri }} style={styles.miniPreviewThumb} /> : <View style={styles.miniPreviewThumb}><Text style={{textAlign: 'center', marginTop: 15}}>{item.type === 'audio' ? '🎙️' : '🎥'}</Text></View>}
              <TouchableOpacity onPress={() => setLocalMedia(localMedia.filter((_, i) => i !== index))} style={styles.deleteButtonThumb}><Text style={{color: '#fff', fontSize: 10}}>✕</Text></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        <TextInput style={styles.notesInput} placeholder="Notes..." multiline value={sessionNotes} onChangeText={setSessionNotes} />
        {isUploading ? <ActivityIndicator size="large" color="#1a2a6c" /> : <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveBtnText}>LOCK ENTRY</Text></TouchableOpacity>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6', padding: 20 },
  header: { marginTop: 60, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a2a6c' },
  card: { backgroundColor: '#fff', padding: 18, borderRadius: 15, elevation: 4 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#34495e', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#7f8c8d' },
  backlogRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateSelector: { backgroundColor: '#fff3e0', padding: 10, borderRadius: 8, marginVertical: 10, borderWidth: 1, borderColor: '#e67e22' },
  dateText: { color: '#e67e22', fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  vitalsBtn: { backgroundColor: '#f8f9fa', padding: 10, borderRadius: 10, width: '23%', alignItems: 'center', borderWidth: 1, borderColor: '#dee2e6' },
  vitalsBtnActive: { backgroundColor: '#1a2a6c' },
  smallBtn: { backgroundColor: '#f1f3f5', padding: 12, borderRadius: 10, width: '31%', alignItems: 'center' },
  evidenceBtn: { backgroundColor: '#f1f3f5', padding: 14, borderRadius: 10, alignItems: 'center' },
  thumbnailContainer: { position: 'relative', marginRight: 10 },
  miniPreviewThumb: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#f1f3f5', borderWidth: 1, borderColor: '#ddd' },
  deleteButtonThumb: { position: 'absolute', top: -5, right: -5, backgroundColor: '#e74c3c', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  notesInput: { backgroundColor: '#f8f9fa', borderRadius: 10, padding: 12, height: 80, marginTop: 12 },
  saveBtn: { backgroundColor: '#1a2a6c', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 12, borderLeftWidth: 6, borderLeftColor: '#27ae60' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  historyDate: { fontWeight: 'bold', fontSize: 12 },
  vitalsBadge: { backgroundColor: '#e9ecef', padding: 6, borderRadius: 6 },
  vitalsText: { fontSize: 10, fontWeight: 'bold', color: '#34495e' },
  historyNotes: { fontSize: 13, color: '#576574' },
  miniPreviewContainer: { marginRight: 10, position: 'relative' },
  playIconOverlay: { position: 'absolute', top: 20, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 4 },
  audioIconSmall: { fontSize: 24, textAlign: 'center', lineHeight: 60, width: 60 },
  historyBtn: { backgroundColor: '#34495e', padding: 10, borderRadius: 8 },
  historyBtnText: { color: '#fff', fontSize: 12 },
  backButton: { color: '#3498db', fontWeight: 'bold' },
  modalView: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  audioDashboard: { backgroundColor: '#fff', padding: 30, borderRadius: 20, width: '85%', alignItems: 'center' },
  playbackRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 20 },
  playBtn: { backgroundColor: '#2ecc71', padding: 12, borderRadius: 10, width: '40%', alignItems: 'center' },
  playBtnText: { color: '#fff', fontWeight: 'bold' },
  fullImage: { width: '90%', height: '70%' },
  closeBtn: { marginTop: 20, backgroundColor: '#fff', padding: 10, borderRadius: 8 },
  closeText: { fontWeight: 'bold' },
  cameraOverlay: { flex: 1, backgroundColor: 'transparent', padding: 20, justifyContent: 'space-between' },
  cameraTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 },
  timerBadge: { backgroundColor: 'red', padding: 8, borderRadius: 20 },
  timerText: { color: 'white', fontWeight: 'bold' },
  recordOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: '#fff', alignSelf: 'center', marginBottom: 40, justifyContent: 'center', alignItems: 'center' },
  recordInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' }
});

registerRootComponent(App);