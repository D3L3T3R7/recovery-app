import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Image, Modal, ActivityIndicator, Switch } from 'react-native';
import { registerRootComponent } from 'expo'; 
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'; 
import Slider from '@react-native-community/slider'; 
import DateTimePicker from '@react-native-community/datetimepicker'; 
import { Audio, Video } from 'expo-av';
import * as Print from 'expo-print'; 
import * as Sharing from 'expo-sharing'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from './firebaseConfig';
import { doc, setDoc, collection, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

function App() {
  const [view, setView] = useState('dashboard');
  const [currentHelper, setCurrentHelper] = useState('Chris');
  const [sessionNotes, setSessionNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [localMedia, setLocalMedia] = useState([]); 
  const [selectedMedia, setSelectedMedia] = useState(null); 
  const [logs, setLogs] = useState([]);
  
  // --- SECURITY PIN ---
  const MASTER_PIN = "2007"; 
  const [showSettings, setShowSettings] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');

  // VITALS 
  const [painLevel, setPainLevel] = useState(5);
  const [mobility, setMobility] = useState('Bedrest');
  const [mood, setMood] = useState('😐');

  // AUDIO/BACKLOG/CAMERA
  const [recording, setRecording] = useState(null);
  const [playbackSound, setPlaybackSound] = useState(null);
  const [isBacklog, setIsBacklog] = useState(false);
  const [backlogDate, setBacklogDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
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

  // --- PDF GENERATOR ---
  const generatePDF = async () => {
    setIsUploading(true);
    try {
      const logRows = logs.map(log => `
        <div style="margin-bottom: 15px; padding: 10px; border-left: 4px solid #1a2a6c; background: #f4f7f6;">
          <h3 style="margin: 0;">${new Date(log.timestamp).toLocaleDateString()}</h3>
          <p><b>Pain:</b> ${log.vitals?.pain}/10 | <b>Status:</b> ${log.vitals?.mobility} ${log.vitals?.mood}</p>
          <p><i>"${log.notes}"</i></p>
        </div>
      `).join('');

      const htmlContent = `<html><body style="font-family: Helvetica; padding: 30px;">
        <h1 style="color: #1a2a6c; border-bottom: 2px solid #1a2a6c;">Recovery Progress Report</h1>
        <p><b>Patient:</b> Christopher John Debski | <b>Generated:</b> ${new Date().toLocaleDateString()}</p>
        <div style="background: #1a2a6c; color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h2>Summary</h2><p>Formal medical & legal documentation of recovery events.</p>
        </div>
        ${logRows}
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) { Alert.alert("PDF Error", e.message); }
    setIsUploading(false);
  };

  // --- CORE FUNCTIONS ---
  const handleSave = async () => {
    if (localMedia.length === 0 && !sessionNotes) return;
    setIsUploading(true);
    try {
      const uploadedUrls = [];
      for (const item of localMedia) {
        const response = await fetch(item.uri);
        const blob = await response.blob();
        const ext = item.type === 'video' ? 'mp4' : item.type === 'audio' ? 'm4a' : 'jpg';
        const storageRef = ref(storage, `evidence/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push({ url, type: item.type });
      }
      await setDoc(doc(db, "sessionLogs", `log_${Date.now()}`), {
        user: currentHelper, timestamp: isBacklog ? backlogDate.toISOString() : new Date().toISOString(),
        notes: sessionNotes, mediaLinks: uploadedUrls, logType: isBacklog ? 'Backlog' : 'Live',
        vitals: { pain: painLevel, mobility, mood } 
      });
      Alert.alert("Locked", "Vault Updated.");
      setLocalMedia([]); setSessionNotes(''); setIsBacklog(false);
    } catch (e) { Alert.alert("Error", "Save failed."); }
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

  const executeWipe = async () => {
    if (confirmDeleteText !== "DELETE") return Alert.alert("Error", "Type DELETE to confirm.");
    setIsUploading(true);
    const q = query(collection(db, "sessionLogs"));
    const snap = await getDocs(q);
    for (const d of snap.docs) { await deleteDoc(doc(db, "sessionLogs", d.id)); }
    setLogs([]); setIsPinVerified(false); setShowSettings(false); setView('dashboard');
    setIsUploading(false);
  };

  if (view === 'history') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setView('dashboard')}><Text style={styles.backButton}>← Back</Text></TouchableOpacity>
          <Text style={styles.title}>Vault History</Text>
          <TouchableOpacity onPress={() => setShowSettings(true)}><Text style={{fontSize: 20}}>⚙️</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.pdfBtn} onPress={generatePDF}><Text style={styles.pdfBtnText}>📄 GENERATE LEGAL REPORT</Text></TouchableOpacity>
        <ScrollView>
          {logs.map((log) => (
            <View key={log.id} style={[styles.historyCard, log.logType === 'Backlog' ? {borderLeftColor: '#e67e22'} : null]}>
              <View style={styles.logHeader}>
                <Text style={styles.historyDate}>{new Date(log.timestamp).toLocaleDateString()}</Text>
                {log.vitals && <View style={styles.vitalsBadge}><Text style={styles.vitalsText}>{log.vitals.pain}/10 | {log.vitals.mood}</Text></View>}
              </View>
              <Text style={styles.historyNotes}>{log.notes}</Text>
              <ScrollView horizontal style={{ marginTop: 10 }}>
                {log.mediaLinks && log.mediaLinks.map((item, index) => (
                  <TouchableOpacity key={index} onPress={() => setSelectedMedia(item)} style={styles.miniPreviewContainer}>
                    {item.type === 'audio' ? <Text style={styles.audioIconSmall}>🎙️</Text> : 
                     item.type === 'video' ? <View style={[styles.miniPreviewThumb, {justifyContent: 'center', alignItems: 'center'}]}><Text style={{fontSize: 24}}>🎥</Text></View> :
                     <Image source={{ uri: item.url }} style={styles.miniPreviewThumb} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
        <Modal visible={showSettings} transparent={true} animationType="fade">
          <View style={styles.modalView}><View style={styles.settingsCard}>
            {!isPinVerified ? (
              <><Text style={styles.cardTitle}>VAULT PIN</Text>
              <TextInput style={styles.input} placeholder="****" secureTextEntry keyboardType="numeric" value={enteredPin} onChangeText={setEnteredPin} />
              <TouchableOpacity style={styles.saveBtn} onPress={() => enteredPin === MASTER_PIN ? setIsPinVerified(true) : Alert.alert("Denied")}><Text style={styles.saveBtnText}>VERIFY</Text></TouchableOpacity></>
            ) : (
              <><Text style={styles.cardTitle}>⚠️ DANGER ZONE</Text>
              <TextInput style={styles.input} placeholder='Type "DELETE"' value={confirmDeleteText} onChangeText={setConfirmDeleteText} />
              <TouchableOpacity style={[styles.saveBtn, {backgroundColor: '#e74c3c'}]} onPress={executeWipe}><Text style={styles.saveBtnText}>PURGE VAULT</Text></TouchableOpacity></>
            )}
            <TouchableOpacity onPress={() => setShowSettings(false)} style={{marginTop: 15}}><Text style={{textAlign: 'center', color: '#7f8c8d'}}>Cancel</Text></TouchableOpacity>
          </View></View>
        </Modal>
        <Modal visible={selectedMedia !== null} transparent={true}>
          <View style={styles.modalView}>
            {selectedMedia?.type === 'video' ? <Video source={{ uri: selectedMedia.url }} style={styles.fullImage} useNativeControls resizeMode="contain" /> : <Image source={{ uri: selectedMedia?.url }} style={styles.fullImage} resizeMode="contain" />}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedMedia(null)}><Text style={styles.closeText}>CLOSE</Text></TouchableOpacity>
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
              <TouchableOpacity style={styles.recordOuter} onPress={isRecordingVideo ? () => cameraRef.current.stopRecording() : async () => {
                setIsRecordingVideo(true); setSecondsLeft(15);
                timerRef.current = setInterval(() => setSecondsLeft(p => p <= 1 ? 0 : p - 1), 1000);
                const video = await cameraRef.current.recordAsync({ maxDuration: 15, quality: '480p' });
                setLocalMedia([...localMedia, { uri: video.uri, type: 'video' }]);
                setIsRecordingVideo(false); setShowCamera(false); clearInterval(timerRef.current);
              }}><View style={[styles.recordInner, isRecordingVideo ? {backgroundColor: 'red', borderRadius: 5} : null]} /></TouchableOpacity>
            </View>
          </CameraView>
        </View>
      </Modal>

      <View style={styles.card}>
        <View style={styles.backlogRow}><Text style={styles.cardTitle}>{isBacklog ? 'Backlog Mode' : 'Live Status'}</Text><Switch value={isBacklog} onValueChange={setIsBacklog} /></View>
        {isBacklog && <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}><Text style={styles.dateText}>📅 Set Date: {backlogDate.toLocaleDateString()}</Text></TouchableOpacity>}
        {showDatePicker && <DateTimePicker value={backlogDate} mode="date" display="spinner" onChange={(e,d) => { setShowDatePicker(false); if(d) setBacklogDate(d); }} />}
        <Text style={styles.label}>Pain: {painLevel}/10</Text>
        <Slider style={{width: '100%', height: 40}} minimumValue={1} maximumValue={10} step={1} value={painLevel} onValueChange={setPainLevel} minimumTrackTintColor="#e74c3c" />
        <View style={[styles.btnRow, {marginTop: 10}]}>{['😫', '😔', '😐', '🙂'].map((e) => (<TouchableOpacity key={e} style={[styles.vitalsBtn, mood === e ? styles.vitalsBtnActive : null]} onPress={() => setMood(e)}><Text style={{fontSize: 22}}>{e}</Text></TouchableOpacity>))}</View>
      </View>

      <View style={[styles.card, {marginTop: 15}]}>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.smallBtn} onPress={() => ImagePicker.launchCameraAsync({quality: 0.5}).then(r => !r.canceled && setLocalMedia([...localMedia, {uri: r.assets[0].uri, type: 'image'}]))}><Text>📷 Photo</Text></TouchableOpacity>
          <TouchableOpacity style={styles.smallBtn} onPress={() => {
            Alert.alert("Video Limit", "Capped at 15s.", [{text: "OK", onPress: async () => {
              if (!camPerm?.granted) await requestCam(); if (!micPerm?.granted) await requestMic();
              setSecondsLeft(15); setZoom(0); setShowCamera(true);
            }}]);
          }}><Text>🎥 Video</Text></TouchableOpacity>
          <TouchableOpacity style={styles.smallBtn} onPress={() => Alert.alert("Audio Ready")}><Text>🎙️ Audio</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.evidenceBtn, {marginTop: 10, backgroundColor: '#3498db'}]} onPress={() => {
            Alert.alert("Scanner Prep", "DARK surface + straight document.", [{text: "OK", onPress: async () => {
                let res = await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: true, aspect: [3, 4] });
                if (!res.canceled) setLocalMedia([...localMedia, { uri: res.assets[0].uri, type: 'image' }]);
            }}]);
        }}><Text style={{color: '#fff', fontWeight: 'bold'}}>📄 SCAN DOCUMENT</Text></TouchableOpacity>
        <ScrollView horizontal style={{ marginVertical: 10 }}>
          {localMedia.map((item, index) => (
            <View key={index} style={styles.thumbnailContainer}>
              {item.type === 'image' ? <Image source={{ uri: item.uri }} style={styles.miniPreviewThumb} /> : <View style={styles.miniPreviewThumb}><Text style={{textAlign: 'center', marginTop: 15}}>🎥</Text></View>}
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
  pdfBtn: { backgroundColor: '#27ae60', padding: 15, borderRadius: 12, marginBottom: 15, alignItems: 'center' },
  pdfBtnText: { color: '#fff', fontWeight: 'bold' },
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
  audioIconSmall: { fontSize: 24, textAlign: 'center', lineHeight: 60, width: 60 },
  historyBtn: { backgroundColor: '#34495e', padding: 10, borderRadius: 8 },
  historyBtnText: { color: '#fff', fontSize: 12 },
  backButton: { color: '#3498db', fontWeight: 'bold' },
  modalView: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  settingsCard: { backgroundColor: '#fff', width: '80%', padding: 25, borderRadius: 20 },
  input: { borderBottomWidth: 1, borderColor: '#dcdde1', paddingVertical: 10, fontSize: 16, marginBottom: 15, textAlign: 'center' },
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