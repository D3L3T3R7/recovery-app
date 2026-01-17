import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, ActivityIndicator, Share, Switch } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebaseConfig';
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';

function App() {
  const [view, setView] = useState('dashboard');
  const [currentHelper, setCurrentHelper] = useState('Chris');
  const [isTracking, setIsTracking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [painLevel, setPainLevel] = useState(5);
  const [sessionNotes, setSessionNotes] = useState('');

  // NEW: Clinical Safety Checklist States
  const [hardwareClicking, setHardwareClicking] = useState(false);
  const [numbness, setNumbness] = useState(false);
  const [wedgeIrritation, setWedgeIrritation] = useState(false);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const getName = async () => {
      const storedName = await AsyncStorage.getItem('user_name');
      if (storedName) setCurrentHelper(storedName);
    };
    getName();
  }, []);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleTimerAction = async () => {
    if (!isTracking) {
      setIsTracking(true);
    } else {
      setIsTracking(false);
      try {
        const logRef = doc(db, "sessionLogs", `session_${Date.now()}`);
        await setDoc(logRef, {
          user: currentHelper,
          timestamp: new Date().toISOString(),
          duration: formatTime(seconds),
          durationSeconds: seconds,
          painLevel: painLevel,
          notes: sessionNotes,
          // Safety Data
          hardwareClicking,
          numbness,
          wedgeIrritation,
          taskName: "Safety & Sensation Check"
        });
        Alert.alert("Daily Log Saved", "Safety data recorded.");
        setSeconds(0);
        setSessionNotes('');
        // Reset toggles for next log
        setHardwareClicking(false);
        setNumbness(false);
        setWedgeIrritation(false);
      } catch (e) { Alert.alert("Error", e.message); }
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    setView('history');
    try {
      const q = query(collection(db, "sessionLogs"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedLogs = [];
      querySnapshot.forEach((doc) => fetchedLogs.push({ id: doc.id, ...doc.data() }));
      setLogs(fetchedLogs);
    } catch (e) { Alert.alert("Error", e.message); }
    setLoading(false);
  };

  const shareReport = async () => {
    let reportText = `SURGICAL RECOVERY REPORT: ${currentHelper}\n\n`;
    logs.forEach(log => {
      reportText += `${new Date(log.timestamp).toLocaleDateString()} Log:\n`;
      reportText += `- Pain: ${log.painLevel}/10\n`;
      reportText += `- Hardware Clicking: ${log.hardwareClicking ? 'YES' : 'No'}\n`;
      reportText += `- Numbness/Tingling: ${log.numbness ? 'YES' : 'No'}\n`;
      reportText += `- Note: ${log.notes || 'None'}\n\n`;
    });
    await Share.share({ message: reportText });
  };

  if (view === 'history') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setView('dashboard')}><Text style={styles.backButton}>← Back</Text></TouchableOpacity>
          <Text style={styles.title}>Recovery Logs</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={shareReport}><Text style={styles.shareBtnText}>Export</Text></TouchableOpacity>
        </View>
        <ScrollView>
          {logs.map((log) => (
            <View key={log.id} style={styles.historyCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.historyDate}>{new Date(log.timestamp).toLocaleDateString()}</Text>
                <Text style={styles.historyPain}>Pain: {log.painLevel}/10</Text>
              </View>
              {log.hardwareClicking && <Text style={styles.warningText}>⚠️ Hardware Sensation Reported</Text>}
              {log.numbness && <Text style={styles.warningText}>⚠️ Numbness Reported</Text>}
              <Text style={styles.historyNotes}>{log.notes || "No notes added."}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Surgical Monitor</Text>
        <TouchableOpacity style={styles.historyBtn} onPress={fetchHistory}><Text style={styles.historyBtnText}>History</Text></TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Status Check</Text>
        <Text style={styles.timerSub}>Log your daily safety status below.</Text>
        
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Hardware Clicking/Popping?</Text>
          <Switch value={hardwareClicking} onValueChange={setHardwareClicking} trackColor={{ true: '#e74c3c' }} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Numbness or Tingling?</Text>
          <Switch value={numbness} onValueChange={setNumbness} trackColor={{ true: '#e74c3c' }} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Wedge/Sling Irritation?</Text>
          <Switch value={wedgeIrritation} onValueChange={setWedgeIrritation} trackColor={{ true: '#f39c12' }} />
        </View>
      </View>

      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>Pain Level: {painLevel}/10</Text>
        <View style={styles.painRow}>
          {[1,2,3,4,5,6,7,8,9,10].map((n) => (
            <TouchableOpacity key={n} style={[styles.painCircle, painLevel === n && styles.painActive]} onPress={() => setPainLevel(n)}>
              <Text style={[styles.painText, painLevel === n && styles.painActiveText]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput 
          style={styles.notesInput} 
          placeholder="Describe any new sensations..." 
          multiline 
          value={sessionNotes} 
          onChangeText={setSessionNotes} 
        />

        <TouchableOpacity style={[styles.timerButton, isTracking ? styles.stopBtn : styles.startBtn]} onPress={handleTimerAction}>
          <Text style={styles.buttonText}>{isTracking ? "SAVE DAILY LOG" : "START SESSION LOG"}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6', padding: 20 },
  header: { marginTop: 60, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50' },
  backButton: { color: '#3498db', fontSize: 16 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#34495e', marginBottom: 10 },
  timerSub: { fontSize: 12, color: '#95a5a6', marginBottom: 15 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  switchLabel: { fontSize: 14, color: '#2c3e50' },
  painRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 },
  painCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },
  painActive: { backgroundColor: '#e67e22' },
  painText: { fontSize: 11, fontWeight: 'bold' },
  painActiveText: { color: '#fff' },
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, height: 80, borderWidth: 1, borderColor: '#eee', marginBottom: 20 },
  timerButton: { padding: 15, borderRadius: 10, alignItems: 'center' },
  startBtn: { backgroundColor: '#3498db' },
  stopBtn: { backgroundColor: '#2ecc71' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  historyBtn: { backgroundColor: '#34495e', padding: 8, borderRadius: 8 },
  historyBtnText: { color: '#fff', fontSize: 12 },
  shareBtn: { backgroundColor: '#27ae60', padding: 8, borderRadius: 8 },
  shareBtnText: { color: '#fff', fontSize: 12 },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, borderLeftWidth: 5, borderLeftColor: '#3498db' },
  historyDate: { fontSize: 14, fontWeight: 'bold' },
  historyPain: { fontSize: 14, color: '#e67e22', fontWeight: 'bold' },
  historyNotes: { fontSize: 13, color: '#7f8c8d', marginTop: 10 },
  warningText: { fontSize: 12, color: '#e74c3c', fontWeight: 'bold', marginTop: 5 }
});

registerRootComponent(App);