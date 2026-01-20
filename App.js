import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Image, Modal, ActivityIndicator, Switch, Linking, KeyboardAvoidingView, Platform, SectionList } from 'react-native';
import { registerRootComponent } from 'expo'; 
import * as ImagePicker from 'expo-image-picker';
import { Audio, Video } from 'expo-av';
import * as Print from 'expo-print'; 
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from './firebaseConfig';
import { doc, setDoc, collection, getDocs, query, orderBy, onSnapshot, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import DateTimePicker from '@react-native-community/datetimepicker'; 
import Slider from '@react-native-community/slider';

// --- CRITICAL BUNDLE SHIELD ---
let Location;
try { Location = require('expo-location'); } catch (e) { Location = null; }

function App() {
  // --- 1. CORE SYSTEM & VAULT MODE ---
  const [view, setView] = useState('dashboard');
  const [vaultMode, setVaultMode] = useState('Sandbox'); 
  const [userRole, setUserRole] = useState('Chris Debski (Patient)');
  const [isUploading, setIsUploading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [groupedLogs, setGroupedLogs] = useState([]);
  const [expandedDates, setExpandedDates] = useState({});

  // --- 2. LOGGING & CLINICAL STATUS ---
  const [isBacklog, setIsBacklog] = useState(false);
  const [backlogDate, setBacklogDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sessionNotes, setSessionNotes] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const categories = ['📝 General', '🏥 Doctor', '🏋️ PT Session', '💊 Meds/Pain'];
  const [category, setCategory] = useState('📝 General');
  const [painLevel, setPainLevel] = useState(5);
  const [mood, setMood] = useState('😐');
  const [clinicalStatus, setClinicalStatus] = useState('Stable');
  const statuses = ['Stable', 'Improving', 'Flare-up', 'Fatigued', 'High Stress'];

  // --- 3. TRAVEL & CARE TIMER ---
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const timerRef = useRef(null);
  const [travelFrom, setTravelFrom] = useState('');
  const [travelTo, setTravelTo] = useState('');
  const [mileageKm, setMileageKm] = useState('');
  const [expenses, setExpenses] = useState('');

  // --- 4. SECURITY & LEGAL PROFILE ---
  const ROLES = {
    'Chris Debski (Patient)': { pin: '1111', color: '#1a2a6c' },
    'Attorney': { pin: '2222', color: '#2c3e50' },
    'Bernice Debski (Mom)': { pin: '3333', color: '#e84393' },
    'Henry Debski (Dad)': { pin: '4444', color: '#27ae60' },
    'Ivan Debski (Son)': { pin: '5555', color: '#f1c40f' }
  };
  const [patientName, setPatientName] = useState('Christopher John Debski');
  const [lawyerName, setLawyerName] = useState('Lead Counsel');
  const [caseNumber, setCaseNumber] = useState('REF: 1234567');
  const [showSettings, setShowSettings] = useState(false);

  // --- 5. MEDIA ---
  const [localMedia, setLocalMedia] = useState([]);
  const [recordingAudio, setRecordingAudio] = useState(null);

  useEffect(() => {
    (async () => {
        const p = await AsyncStorage.getItem('patientName');
        const c = await AsyncStorage.getItem('caseNumber');
        if(p) setPatientName(p); if(c) setCaseNumber(c);
        fetchLogs();
    })();
    const unsub = onSnapshot(collection(db, "sessionLogs"), () => fetchLogs());
    return () => { unsub(); if(timerRef.current) clearInterval(timerRef.current); };
  }, [vaultMode]);

  const toggleTimer = () => {
    if (isTimerActive) clearInterval(timerRef.current);
    else timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    setIsTimerActive(!isTimerActive);
  };

  const useCurrentLocation = async () => {
    if(!Location) return Alert.alert("Module Error", "Location library missing.");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Permission Required");
    const loc = await Location.getCurrentPositionAsync({});
    const geo = await Location.reverseGeocodeAsync(loc.coords);
    if (geo.length > 0) setTravelFrom(`${geo[0].streetNumber || ''} ${geo[0].street || ''}, ${geo[0].city}`);
  };

  const openMapsSearch = () => Linking.openURL('https://www.google.com/maps/search/?api=1&query=');

  const verifyRoute = () => {
    if (!travelFrom || !travelTo) return Alert.alert("Required", "Enter Addresses");
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(travelFrom)}&destination=${encodeURIComponent(travelTo)}&travelmode=driving`);
  };

  const fetchLogs = async () => {
    const q = query(collection(db, "sessionLogs"), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                     .filter(l => l.vaultMode === vaultMode);
    setLogs(fetched);
    const groups = {};
    fetched.forEach(log => {
      const d = new Date(log.timestamp).toISOString().split('T')[0];
      if (!groups[d]) groups[d] = [];
      groups[d].push(log);
    });
    setGroupedLogs(Object.keys(groups).map(d => ({ title: d, data: groups[d] })));
  };

  const handleAudioToggle = async () => {
    try {
      if (recordingAudio) {
        await recordingAudio.stopAndUnloadAsync();
        setLocalMedia([...localMedia, { uri: recordingAudio.getURI(), type: 'audio', time: new Date().toLocaleTimeString() }]);
        setRecordingAudio(null);
      } else {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        setRecordingAudio(recording);
      }
    } catch (e) { setRecordingAudio(null); }
  };

  const handleSave = async () => {
    setIsUploading(true);
    try {
      const mediaVault = [];
      for (const m of localMedia) {
        const resp = await fetch(m.uri);
        const blob = await resp.blob();
        const fileRef = ref(storage, `vault/${Date.now()}_${Math.random()}`);
        await uploadBytes(fileRef, blob);
        mediaVault.push({ url: await getDownloadURL(fileRef), type: m.type });
      }

      await setDoc(doc(db, "sessionLogs", `log_${Date.now()}`), {
        vaultMode, user: userRole, 
        timestamp: isBacklog ? backlogDate.toISOString() : new Date().toISOString(),
        notes: sessionNotes, category, clinicalStatus,
        vitals: { pain: painLevel, mood },
        care: { hours: (timerSeconds / 3600).toFixed(2), km: parseFloat(mileageKm) || 0, expenses: parseFloat(expenses) || 0 },
        travel: { from: travelFrom, to: travelTo },
        mediaVault
      });

      setSessionNotes(''); setTimerSeconds(0); setIsTimerActive(false); setLocalMedia([]); setView('dashboard');
      Alert.alert("Locked", "Entry successfully saved.");
    } catch (e) { Alert.alert("Sync Error", e.message); }
    finally { setIsUploading(false); }
  };

  const generatePDF = async () => {
    const html = `<html><body style="font-family:Arial;padding:40px;"><h1>Ledger: ${patientName}</h1>${logs.map(l => `<div style="margin-bottom:20px;padding:10px;border-left:5px solid #1a2a6c;"><b>${new Date(l.timestamp).toLocaleString()}</b><p>${l.notes}</p></div>`).join('')}</body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
      <View style={styles.container}>
        <View style={styles.header}>
            <View>
                <Text style={styles.title}>Recovery Vault</Text>
                <TouchableOpacity onPress={() => setVaultMode(vaultMode === 'Sandbox' ? 'Forensic' : 'Sandbox')}>
                    <Text style={[styles.modeBadge, {backgroundColor: vaultMode === 'Forensic' ? '#e74c3c' : '#2ecc71'}]}>MODE: {vaultMode.toUpperCase()}</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.historyBtn} onPress={() => setView(view === 'history' ? 'dashboard' : 'history')}><Text style={styles.historyBtnText}>{view === 'history' ? 'Dashboard' : 'History'}</Text></TouchableOpacity>
        </View>

        {view === 'dashboard' ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 60}}>
            <View style={styles.card}>
              <View style={styles.backlogRow}><Text style={styles.cardTitle}>{isBacklog ? 'Backlog Entry' : 'Live Capture'}</Text><Switch value={isBacklog} onValueChange={setIsBacklog} /></View>
              {isBacklog && <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}><Text style={styles.dateText}>📅 SELECT DATE: {backlogDate.toLocaleDateString('en-CA')}</Text></TouchableOpacity>}
              {showDatePicker && <DateTimePicker value={backlogDate} mode="date" display="calendar" onChange={(e,d)=>{setShowDatePicker(false); if(d) setBacklogDate(d);}} />}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}}>{categories.map(cat => (<TouchableOpacity key={cat} style={[styles.catBtn, category===cat?styles.catBtnActive:null]} onPress={()=>setCategory(cat)}><Text style={{color: category===cat?'#fff':'#333', fontSize: 11}}>{cat}</Text></TouchableOpacity>))}</ScrollView>
              <View style={styles.statusRow}>{statuses.map(s => (<TouchableOpacity key={s} style={[styles.statusBtn, clinicalStatus === s && styles.statusBtnActive]} onPress={() => setClinicalStatus(s)}><Text style={{fontSize: 10, color: clinicalStatus === s ? '#fff' : '#333'}}>{s}</Text></TouchableOpacity>))}</View>
              <Text style={styles.label}>Pain Intensity: {painLevel}/10  {mood}</Text>
              <Slider style={{width:'100%', height:40}} minimumValue={1} maximumValue={10} step={1} value={painLevel} onValueChange={setPainLevel} minimumTrackTintColor="#e74c3c" />
              <View style={styles.btnRow}>{['😫','😔','😐','🙂'].map(e => (<TouchableOpacity key={e} onPress={()=>setMood(e)}><Text style={{fontSize:24}}>{e}</Text></TouchableOpacity>))}</View>
            </View>

            <View style={[styles.card, {marginTop:15}]}>
              <Text style={styles.cardTitle}>Care Clock & Travel Logistics</Text>
              <View style={styles.timerContainer}>
                  <Text style={styles.timerText}>{Math.floor(timerSeconds/60)}:{(timerSeconds%60).toString().padStart(2,'0')}</Text>
                  <TouchableOpacity style={[styles.timerBtn, isTimerActive && {backgroundColor:'#e74c3c'}]} onPress={toggleTimer}><Text style={styles.timerBtnText}>{isTimerActive ? 'STOP' : 'START CLOCK'}</Text></TouchableOpacity>
              </View>
              <View style={styles.mapInputRow}><TextInput style={[styles.profileInput, {flex: 1}]} placeholder="Start Address" value={travelFrom} onChangeText={setTravelFrom} /><TouchableOpacity style={styles.searchIcon} onPress={useCurrentLocation}><Text style={{fontSize: 20}}>📍</Text></TouchableOpacity><TouchableOpacity style={styles.searchIcon} onPress={openMapsSearch}><Text style={{fontSize: 20}}>🔍</Text></TouchableOpacity></View>
              <View style={styles.mapInputRow}><TextInput style={[styles.profileInput, {flex: 1}]} placeholder="Destination" value={travelTo} onChangeText={setTravelTo} /><TouchableOpacity style={styles.searchIcon} onPress={openMapsSearch}><Text style={{fontSize: 20}}>🔍</Text></TouchableOpacity></View>
              <TouchableOpacity style={styles.verifyBtn} onPress={verifyRoute}><Text style={styles.verifyBtnText}>📍 VERIFY & SCREENSHOT ROUTE</Text></TouchableOpacity>
              <View style={styles.btnRow}><TextInput style={[styles.profileInput, {width:'48%'}]} placeholder="km Trip" keyboardType="numeric" value={mileageKm} onChangeText={setMileageKm} /><TextInput style={[styles.profileInput, {width:'48%'}]} placeholder="Expenses $" keyboardType="numeric" value={expenses} onChangeText={setExpenses} /></View>
            </View>

            <View style={[styles.card, {marginTop: 15}]}>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => ImagePicker.launchCameraAsync({quality:0.5}).then(r=>!r.canceled && setLocalMedia([...localMedia, {uri:r.assets[0].uri, type:'image'}]))}><Text>📷 Photo</Text></TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => ImagePicker.launchCameraAsync({mediaTypes:ImagePicker.MediaTypeOptions.Videos, videoMaxDuration:15}).then(r=>!r.canceled && setLocalMedia([...localMedia, {uri:r.assets[0].uri, type:'video'}]))}><Text>🎥 Video</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, {backgroundColor:'#3498db'}]} onPress={() => ImagePicker.launchCameraAsync({allowsEditing:true}).then(r=>!r.canceled && setLocalMedia([...localMedia, {uri:r.assets[0].uri, type:'image'}]))}><Text style={{color:'#fff'}}>📄 SCAN</Text></TouchableOpacity>
              </View>
              <View style={[styles.btnRow, {marginTop: 5}]}><TouchableOpacity style={[styles.smallBtn, {width:'48%', backgroundColor: recordingAudio ? '#e74c3c' : '#f1f3f5'}]} onPress={handleAudioToggle}><Text>{recordingAudio ? '🛑 STOP' : '🎙️ AUDIO'}</Text></TouchableOpacity><TouchableOpacity style={[styles.smallBtn, {width:'48%'}]} onPress={() => ImagePicker.launchImageLibraryAsync({mediaTypes:ImagePicker.MediaTypeAll, allowsMultipleSelection:true}).then(r=>!r.canceled && setLocalMedia([...localMedia, ...r.assets.map(a=>({uri:a.uri, type:a.type==='video'?'video':'image'}))]))}><Text>🖼️ GALLERY</Text></TouchableOpacity></View>
              
              {localMedia.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaTray}>
                  {localMedia.map((m, i) => (
                    <TouchableOpacity key={i} onLongPress={() => { const u = [...localMedia]; u.splice(i, 1); setLocalMedia(u); }}>
                      <View style={styles.thumbWrapper}>
                          {m.type === 'audio' ? <View style={[styles.miniThumb, {backgroundColor:'#eee', justifyContent:'center', alignItems:'center'}]}><Text style={{fontSize:10}}>🎙️ {m.time}</Text></View> : <Image source={{uri: m.uri}} style={styles.miniThumb} />}
                          <View style={styles.deleteBadge}><Text style={{color:'#fff', fontSize:8}}>×</Text></View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity style={styles.notesInputPlaceholder} onPress={()=>setShowNoteModal(true)}><Text style={{color: sessionNotes?'#333':'#999'}}>{sessionNotes || "Tap to document narrative..."}</Text></TouchableOpacity>
              {isUploading ? <ActivityIndicator size="large" /> : <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveBtnText}>LOCK {vaultMode.toUpperCase()} ENTRY</Text></TouchableOpacity>}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop: 20}}>{Object.keys(ROLES).map(r => (<TouchableOpacity key={r} onPress={()=>setUserRole(r)} style={[styles.debugBtn, {backgroundColor: ROLES[r].color}]}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 8}}>{r}</Text></TouchableOpacity>))}</ScrollView>
          </ScrollView>
        ) : (
          <View style={{flex: 1}}>
            <View style={styles.historySubHeader}><TouchableOpacity style={styles.reportBtn} onPress={generatePDF}><Text style={styles.reportBtnText}>📄 EXPORT LEGAL PDF</Text></TouchableOpacity><TouchableOpacity onPress={() => setShowSettings(true)}><Text style={{fontSize: 24}}>⚙️</Text></TouchableOpacity></View>
            <SectionList sections={groupedLogs} keyExtractor={(item) => item.id} renderSectionHeader={({ section: { title } }) => (<TouchableOpacity style={styles.dateHeader} onPress={() => setExpandedDates(p => ({...p, [title]: !p[title]}))}><Text style={styles.dateHeaderText}>{title}</Text></TouchableOpacity>)} renderItem={({ item, section }) => expandedDates[section.title] ? (<View style={[styles.historyCard, {borderLeftColor: ROLES[item.user]?.color}]}><Text style={styles.timeLabel}>{new Date(item.timestamp).toLocaleTimeString()}</Text><Text style={{fontWeight:'bold', color:ROLES[item.user]?.color}}>{item.user}</Text><Text style={styles.historyNotes}>[{item.category}] {item.clinicalStatus} | Pain: {item.vitals?.pain}/10</Text><Text style={styles.historyNotes}>"{item.notes}"</Text>{item.care?.hours > 0 && <Text style={styles.careNote}>Care Tracked: {item.care.hours}h | {item.care.km}km</Text>}</View>) : null } />
          </View>
        )}

        {/* MODALS */}
        <Modal visible={showNoteModal} animationType="slide"><View style={styles.noteModalContainer}><Text style={styles.noteModalTitle}>Narrative</Text><TextInput style={styles.noteModalInput} multiline autoFocus value={sessionNotes} onChangeText={setSessionNotes} /><TouchableOpacity style={styles.saveBtn} onPress={() => setShowNoteModal(false)}><Text style={styles.saveBtnText}>DONE</Text></TouchableOpacity></View></Modal>
        <Modal visible={showSettings} transparent animationType="slide"><View style={styles.modalViewCentered}><View style={styles.settingsCard}><Text style={styles.cardTitle}>LEGAL PROFILE</Text><TextInput style={styles.profileInput} value={patientName} placeholder="Patient" onChangeText={setPatientName} /><TextInput style={styles.profileInput} value={lawyerName} placeholder="Lawyer" onChangeText={setLawyerName} /><TextInput style={styles.profileInput} value={caseNumber} placeholder="Case #" onChangeText={setCaseNumber} /><Text style={[styles.cardTitle, {color:'#e74c3c', marginTop:20}]}>WIPE ALL DATA (PIN: 2007)</Text><TextInput style={styles.input} secureTextEntry keyboardType="numeric" onChangeText={async (v) => { if(v==='2007'){ Alert.alert("Confirm", "Purge all records?", [{text:"Delete", onPress: async () => { const s = await getDocs(collection(db, "sessionLogs")); s.forEach(async d => await deleteDoc(doc(db, "sessionLogs", d.id))); setShowSettings(false); }}]); }}} /><TouchableOpacity onPress={()=>setShowSettings(false)} style={{marginTop:15}}><Text style={{textAlign:'center', color:'#999'}}>Close</Text></TouchableOpacity></View></View></Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6', padding: 20, paddingTop: 60 },
  header: { marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a2a6c' },
  modeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5, marginTop: 5, color: '#fff', fontSize: 10, fontWeight: 'bold', alignSelf: 'flex-start' },
  card: { backgroundColor: '#fff', padding: 18, borderRadius: 15, elevation: 4, marginBottom: 15 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#34495e', marginBottom: 10 },
  catBtn: { padding: 8, backgroundColor: '#f1f3f5', borderRadius: 8, marginRight: 10, borderWidth: 1, borderColor: '#dee2e6' },
  catBtnActive: { backgroundColor: '#3498db', borderColor: '#3498db' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 10 },
  statusBtn: { padding: 6, backgroundColor: '#f1f3f5', borderRadius: 5, marginRight: 5, marginBottom: 5 },
  statusBtnActive: { backgroundColor: '#3498db' },
  timerContainer: { alignItems: 'center', marginBottom: 15, padding: 10, backgroundColor: '#f8f9fa', borderRadius: 12 },
  timerText: { fontSize: 54, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },
  timerBtn: { backgroundColor: '#2ecc71', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 10 },
  timerBtnText: { color: '#fff', fontWeight: 'bold' },
  mapInputRow: { flexDirection: 'row', alignItems: 'center' },
  searchIcon: { padding: 10, marginLeft: 5, backgroundColor: '#f1f3f5', borderRadius: 10 },
  verifyBtn: { backgroundColor: '#e8f4fd', borderWidth: 1, borderColor: '#3498db', padding: 12, borderRadius: 10, marginVertical: 10, alignItems: 'center' },
  verifyBtnText: { color: '#3498db', fontWeight: 'bold', fontSize: 12 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  smallBtn: { backgroundColor: '#f1f3f5', padding: 12, borderRadius: 10, width: '31%', alignItems: 'center' },
  saveBtn: { backgroundColor: '#1a2a6c', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  historyBtn: { backgroundColor: '#1a2a6c', padding: 10, borderRadius: 10 },
  historyBtnText: { color: '#fff', fontWeight: 'bold' },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 8, borderLeftWidth: 10 },
  historyNotes: { fontSize: 13, color: '#576574', fontStyle: 'italic', marginVertical: 5 },
  dateHeader: { backgroundColor: '#1a2a6c', padding: 15, marginTop: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 8, justifyContent: 'space-between' },
  dateHeaderText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  modalViewCentered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' },
  settingsCard: { backgroundColor: '#fff', width: '85%', padding: 25, borderRadius: 20 },
  profileInput: { borderBottomWidth: 1, borderColor: '#3498db', paddingVertical: 8, fontSize: 14, marginBottom: 10 },
  noteModalContainer: { flex: 1, backgroundColor: '#fff', padding: 30, paddingTop: 60 },
  noteModalTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a2a6c', marginBottom: 20 },
  noteModalInput: { flex: 1, fontSize: 18, textAlignVertical: 'top' },
  notesInputPlaceholder: { backgroundColor: '#f8f9fa', borderRadius: 10, padding: 15, height: 80, marginTop: 12 },
  debugBtn: { padding: 10, borderRadius: 10, marginRight: 10, width: 105, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: 'bold', color: '#7f8c8d', marginTop: 10 },
  input: { borderBottomWidth: 1, borderColor: '#ccc', marginVertical: 10, textAlign: 'center', fontSize: 20 },
  mediaTray: { marginVertical: 10, flexDirection: 'row' },
  thumbWrapper: { position: 'relative', marginRight: 10 },
  miniThumb: { width: 60, height: 60, borderRadius: 10 },
  deleteBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: 'red', width: 15, height: 15, borderRadius: 7.5, justifyContent: 'center', alignItems: 'center' },
  backlogRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dateSelector: { backgroundColor: '#fff3e0', padding: 12, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#e67e22', alignItems: 'center' },
  dateText: { color: '#e67e22', fontWeight: 'bold' },
  timeLabel: { fontSize: 10, color: '#999', marginBottom: 2 },
  careNote: { fontSize: 10, color: '#666', marginTop: 5, fontWeight: 'bold' },
  historySubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  reportBtn: { backgroundColor: '#27ae60', padding: 12, borderRadius: 10, alignItems: 'center' },
  reportBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 11, textAlign: 'center' },
});

registerRootComponent(App);