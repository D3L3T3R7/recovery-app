import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Image, Modal, ActivityIndicator, Switch, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { registerRootComponent } from 'expo'; 
import * as ImagePicker from 'expo-image-picker';
import { Audio, Video } from 'expo-av';
import * as Print from 'expo-print'; 
import * as Sharing from 'expo-sharing';
import * as VideoThumbnails from 'expo-video-thumbnails'; 
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
  // --- 1. CORE SYSTEM STATE ---
  const [view, setView] = useState('dashboard');
  const [userRole, setUserRole] = useState('Chris Debski (Patient)');
  const [sessionNotes, setSessionNotes] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [localMedia, setLocalMedia] = useState([]); 
  const [logs, setLogs] = useState([]);
  const [expandedDates, setExpandedDates] = useState({});
  const [notifDots, setNotifDots] = useState({});

  // --- 2. CARE TIMER & TRAVEL ---
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const timerRef = useRef(null);
  const [travelFrom, setTravelFrom] = useState('');
  const [travelTo, setTravelTo] = useState('');
  const [mileageKm, setMileageKm] = useState('');
  const [expenses, setExpenses] = useState('');

  // --- 3. ROLES & LEGAL PROFILE ---
  const ROLES = {
    'Chris Debski (Patient)': { pin: '1111', color: '#1a2a6c' },
    'Attorney': { pin: '2222', color: '#2c3e50' },
    'Bernice Debski (Mom)': { pin: '3333', color: '#e84393' },
    'Henry Debski (Dad)': { pin: '4444', color: '#27ae60' },
    'Ivan Debski (Son)': { pin: '5555', color: '#f1c40f' }
  };
  const [patientName, setPatientName] = useState('Christopher John Debski');
  const [attorneyFirm, setAttorneyFirm] = useState('TEST LAW FIRM');
  const [lawyerName, setLawyerName] = useState('Lead Counsel Name');
  const [caseNumber, setCaseNumber] = useState('REF: 1234567');
  const [showSettings, setShowSettings] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');

  // --- 4. LOGGING STATE ---
  const [isBacklog, setIsBacklog] = useState(false);
  const [backlogDate, setBacklogDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [category, setCategory] = useState('📝 General');
  const [painLevel, setPainLevel] = useState(5);
  const [mood, setMood] = useState('😐');
  const [recordingAudio, setRecordingAudio] = useState(null);

  useEffect(() => {
    (async () => {
        if (Location) { try { await Location.requestForegroundPermissionsAsync(); } catch (e) {} }
        const p = await AsyncStorage.getItem('patientName');
        const c = await AsyncStorage.getItem('caseNumber');
        if(p) setPatientName(p); if(c) setCaseNumber(c);
        fetchLogs();
    })();
    const unsub = onSnapshot(collection(db, "sessionLogs"), () => fetchLogs());
    return () => { unsub(); clearInterval(timerRef.current); };
  }, []);

  const toggleTimer = () => {
    if (isTimerActive) clearInterval(timerRef.current);
    else timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    setIsTimerActive(!isTimerActive);
  };

  const verifyRouteOnMaps = () => {
    if (!travelFrom || !travelTo) return Alert.alert("Required", "Enter Start and Destination Address");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(travelFrom)}&destination=${encodeURIComponent(travelTo)}&travelmode=driving`;
    Linking.openURL(url);
  };

  const fetchLogs = async () => {
    const q = query(collection(db, "sessionLogs"), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setLogs(fetched);
    const dots = {};
    fetched.forEach(log => {
      const d = new Date(log.timestamp).toISOString().split('T')[0];
      if (!dots[d]) dots[d] = new Set();
      dots[d].add(log.user);
    });
    setNotifDots(dots);
  };

  const handlePurge = () => {
    if (enteredPin === '2007') {
      Alert.alert(
        "PERMANENT WIPE",
        "Are you sure? Every entry will be deleted for a clean slate.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "ERASE ALL DATA", style: "destructive", onPress: async () => {
              const s = await getDocs(collection(db, "sessionLogs"));
              s.forEach(async d => await deleteDoc(doc(db, "sessionLogs", d.id)));
              setShowSettings(false);
              setEnteredPin('');
              Alert.alert("Purged", "Vault is now empty.");
          }}
        ]
      );
    } else { Alert.alert("Denied", "Security PIN Incorrect"); }
  };

  const handleSave = async () => {
    setIsUploading(true);
    try {
      await setDoc(doc(db, "sessionLogs", `log_${Date.now()}`), {
        user: userRole, timestamp: isBacklog ? backlogDate.toISOString() : new Date().toISOString(),
        notes: sessionNotes, category, vitals: { pain: painLevel, mood },
        care: { hours: (timerSeconds / 3600).toFixed(2), km: mileageKm, expenses },
        travel: { from: travelFrom, to: travelTo }, authorized: userRole.includes('Chris')
      });
      setSessionNotes(''); setTimerSeconds(0); setIsTimerActive(false); setView('dashboard');
      Alert.alert("Locked", "Vault synchronized.");
    } catch (e) { Alert.alert("Sync Error", e.message); }
    finally { setIsUploading(false); }
  };

  if (view === 'history') {
    return (
      <View style={styles.container}>
        <View style={styles.header}><TouchableOpacity onPress={() => setView('dashboard')}><Text style={styles.backButton}>← Back</Text></TouchableOpacity><Text style={styles.title}>Vault History</Text><TouchableOpacity onPress={() => setShowSettings(true)}><Text style={{fontSize: 24}}>⚙️</Text></TouchableOpacity></View>
        <ScrollView>
          {Object.keys(notifDots).map(date => (
            <View key={date}>
              <TouchableOpacity style={styles.dateHeader} onPress={() => setExpandedDates(p => ({...p, [date]: !p[date]}))}>
                <Text style={styles.dateHeaderText}>{date}</Text>
                <View style={{flexDirection:'row'}}>{Array.from(notifDots[date]).map(u => <View key={u} style={[styles.notifDot, {backgroundColor: ROLES[u]?.color || '#999'}]} />)}</View>
              </TouchableOpacity>
              {expandedDates[date] && logs.filter(l => l.timestamp.startsWith(date)).map(item => (
                <View key={item.id} style={[styles.historyCard, {borderLeftColor: ROLES[item.user]?.color}]}>
                  <Text style={{fontWeight:'bold', color:ROLES[item.user]?.color}}>{item.user}</Text>
                  <Text style={styles.historyNotes}>"{item.notes}"</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
        <Modal visible={showSettings} transparent><View style={styles.modalViewCentered}><View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>LEGAL VAULT PROFILE</Text>
          <TextInput style={styles.profileInput} value={patientName} placeholder="Patient Name" onChangeText={setPatientName} />
          <TextInput style={styles.profileInput} value={attorneyFirm} placeholder="Firm" onChangeText={setAttorneyFirm} />
          <TextInput style={styles.profileInput} value={lawyerName} placeholder="Lead Lawyer" onChangeText={setLawyerName} />
          <TextInput style={styles.profileInput} value={caseNumber} placeholder="File #" onChangeText={setCaseNumber} />
          <Text style={[styles.cardTitle, {color:'#e74c3c', marginTop:20}]}>WIPE VAULT (DANGER ZONE)</Text>
          <TextInput style={styles.input} secureTextEntry keyboardType="numeric" placeholder="Enter PIN to Reset" value={enteredPin} onChangeText={setEnteredPin} />
          <TouchableOpacity style={[styles.saveBtn, {backgroundColor: '#e74c3c'}]} onPress={handlePurge}><Text style={styles.saveBtnText}>EXECUTE PURGE</Text></TouchableOpacity>
          <TouchableOpacity onPress={()=>setShowSettings(false)} style={{marginTop:15}}><Text style={{textAlign:'center', color:'#999'}}>Close</Text></TouchableOpacity>
        </View></View></Modal>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
      <View style={styles.container}>
        <View style={styles.header}><Text style={styles.title}>Recovery Vault</Text><TouchableOpacity style={styles.historyBtn} onPress={() => setView('history')}><Text style={styles.historyBtnText}>History</Text></TouchableOpacity></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 60}}>
          <View style={styles.card}>
            <View style={styles.backlogRow}><Text style={styles.cardTitle}>{isBacklog ? 'Backlog Entry' : 'Live Capture'}</Text><Switch value={isBacklog} onValueChange={setIsBacklog} /></View>
            {isBacklog && <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}><Text style={styles.dateText}>📅 SELECT DATE: {backlogDate.toLocaleDateString('en-CA')}</Text></TouchableOpacity>}
            {showDatePicker && <DateTimePicker value={backlogDate} mode="date" display="calendar" onChange={(e,d)=>{setShowDatePicker(false); if(d) setBacklogDate(d);}} />}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginVertical:10}}>{['📝 General', '🏥 Doctor', '🏋️ PT Session', '💊 Meds/Pain'].map(cat => (<TouchableOpacity key={cat} style={[styles.catBtn, category===cat?styles.catBtnActive:null]} onPress={()=>setCategory(cat)}><Text style={{color: category===cat?'#fff':'#333', fontSize: 11}}>{cat}</Text></TouchableOpacity>))}</ScrollView>
            {userRole.includes('Chris') && (
              <View>
                <Text style={styles.label}>Pain Intensity: {painLevel}/10</Text>
                <Slider style={{width:'100%', height:40}} minimumValue={1} maximumValue={10} step={1} value={painLevel} onValueChange={setPainLevel} minimumTrackTintColor="#e74c3c" />
                <View style={styles.btnRow}>{['😫','😔','😐','🙂'].map(e => (<TouchableOpacity key={e} style={[styles.vitalsBtn, mood === e ? styles.vitalsBtnActive : null]} onPress={()=>setMood(e)}><Text style={{fontSize:22}}>{e}</Text></TouchableOpacity>))}</View>
              </View>
            )}
          </View>

          <View style={[styles.card, {marginTop:15}]}>
            <Text style={styles.cardTitle}>Attendant Care & Travel Logistics (km)</Text>
            <View style={styles.timerContainer}>
                <Text style={styles.timerText}>{Math.floor(timerSeconds/60)}:{(timerSeconds%60).toString().padStart(2,'0')}</Text>
                <TouchableOpacity style={[styles.timerBtn, isTimerActive && {backgroundColor:'#e74c3c'}]} onPress={toggleTimer}><Text style={styles.timerBtnText}>{isTimerActive ? 'STOP CLOCK' : 'START CLOCK'}</Text></TouchableOpacity>
            </View>
            <TextInput style={styles.profileInput} placeholder="Start Address (e.g. Home)" value={travelFrom} onChangeText={setTravelFrom} />
            <TextInput style={styles.profileInput} placeholder="Destination (e.g. PT Clinic)" value={travelTo} onChangeText={setTravelTo} />
            <TouchableOpacity style={styles.verifyBtn} onPress={verifyRouteOnMaps}><Text style={styles.verifyBtnText}>📍 VERIFY ROUTE ON GOOGLE MAPS</Text></TouchableOpacity>
            <View style={styles.btnRow}>
                <TextInput style={[styles.profileInput, {width:'48%'}]} placeholder="km Trip" keyboardType="numeric" value={mileageKm} onChangeText={setMileageKm} />
                <TextInput style={[styles.profileInput, {width:'48%'}]} placeholder="Expenses $" keyboardType="numeric" value={expenses} onChangeText={setExpenses} />
            </View>
          </View>

          <View style={[styles.card, {marginTop: 15}]}>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.smallBtn}><Text>📷 Photo</Text></TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn}><Text>🎥 Video</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, {backgroundColor:'#3498db'}]}><Text style={{color:'#fff'}}>📄 SCAN</Text></TouchableOpacity>
            </View>
            <View style={[styles.btnRow, {marginTop: 5}]}>
                <TouchableOpacity style={[styles.smallBtn, {width:'48%'}]}><Text>🎙️ Audio</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, {width:'48%'}]}><Text>🖼️ Gallery</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.notesInputPlaceholder} onPress={()=>setShowNoteModal(true)}><Text style={{color: sessionNotes?'#333':'#999'}}>{sessionNotes || "Tap to document narrative..."}</Text></TouchableOpacity>
            {isUploading ? <ActivityIndicator size="large" /> : <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveBtnText}>LOCK ENTRY AS {userRole.toUpperCase()}</Text></TouchableOpacity>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop: 20}}>{Object.keys(ROLES).map(r => (<TouchableOpacity key={r} onPress={()=>setUserRole(r)} style={[styles.debugBtn, {backgroundColor: ROLES[r].color}]}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 8}}>{r}</Text></TouchableOpacity>))}</ScrollView>
        </ScrollView>
        <Modal visible={showNoteModal} animationType="slide"><View style={styles.noteModalContainer}><Text style={styles.noteModalTitle}>Clinical Entry</Text><TextInput style={styles.noteModalInput} multiline autoFocus value={sessionNotes} onChangeText={setSessionNotes} /><TouchableOpacity style={styles.saveBtn} onPress={() => setShowNoteModal(false)}><Text style={styles.saveBtnText}>DONE</Text></TouchableOpacity></View></Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6', padding: 20, paddingTop: 60 },
  header: { marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a2a6c' },
  card: { backgroundColor: '#fff', padding: 18, borderRadius: 15, elevation: 4, marginBottom: 15 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#34495e', marginBottom: 10 },
  timerContainer: { alignItems: 'center', marginBottom: 15, padding: 10, backgroundColor: '#f8f9fa', borderRadius: 12 },
  timerText: { fontSize: 54, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },
  timerBtn: { backgroundColor: '#2ecc71', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 10 },
  timerBtnText: { color: '#fff', fontWeight: 'bold' },
  backlogRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  catBtn: { padding: 8, backgroundColor: '#f1f3f5', borderRadius: 8, marginRight: 10, borderWidth: 1, borderColor: '#dee2e6' },
  catBtnActive: { backgroundColor: '#3498db', borderColor: '#3498db' },
  smallBtn: { backgroundColor: '#f1f3f5', padding: 12, borderRadius: 10, width: '31%', alignItems: 'center' },
  vitalsBtn: { backgroundColor: '#f8f9fa', padding: 10, borderRadius: 10, width: '23%', alignItems: 'center' },
  vitalsBtnActive: { backgroundColor: '#1a2a6c' },
  label: { fontSize: 11, fontWeight: 'bold', color: '#7f8c8d', marginTop: 10 },
  saveBtn: { backgroundColor: '#1a2a6c', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 8, borderLeftWidth: 10 },
  modalViewCentered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' },
  settingsCard: { backgroundColor: '#fff', width: '85%', padding: 25, borderRadius: 20 },
  profileInput: { borderBottomWidth: 1, borderColor: '#3498db', paddingVertical: 8, fontSize: 14, marginBottom: 10 },
  notifDot: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
  debugBtn: { padding: 10, borderRadius: 10, marginRight: 10, width: 105, alignItems: 'center' },
  input: { borderBottomWidth: 1, borderColor: '#ccc', marginVertical: 10, textAlign: 'center', fontSize: 20 },
  historyBtn: { backgroundColor: '#1a2a6c', padding: 10, borderRadius: 10 },
  historyBtnText: { color: '#fff', fontWeight: 'bold' },
  backButton: { color: '#3498db', fontWeight: 'bold', fontSize: 16 },
  dateHeader: { backgroundColor: '#1a2a6c', padding: 15, marginTop: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 8, justifyContent: 'space-between' },
  dateHeaderText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  dateSelector: { backgroundColor: '#fff3e0', padding: 12, borderRadius: 10, marginVertical: 10, borderWidth: 1, borderColor: '#e67e22', alignItems: 'center' },
  dateText: { color: '#e67e22', fontWeight: 'bold' },
  notesInputPlaceholder: { backgroundColor: '#f8f9fa', borderRadius: 10, padding: 15, height: 80, marginTop: 12 },
  verifyBtn: { backgroundColor: '#e8f4fd', borderWidth: 1, borderColor: '#3498db', padding: 12, borderRadius: 10, marginVertical: 10, alignItems: 'center' },
  verifyBtnText: { color: '#3498db', fontWeight: 'bold', fontSize: 12 },
  noteModalContainer: { flex: 1, backgroundColor: '#fff', padding: 30, paddingTop: 60 },
  noteModalTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a2a6c', marginBottom: 20 },
  noteModalInput: { flex: 1, fontSize: 18, textAlignVertical: 'top' },
});

registerRootComponent(App);