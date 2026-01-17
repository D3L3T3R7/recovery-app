import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, ActivityIndicator } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebaseConfig';
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';

function App() {
  const [view, setView] = useState('dashboard');
  const [currentHelper, setCurrentHelper] = useState('Volunteer');
  const [nameInput, setNameInput] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sessionNotes, setSessionNotes] = useState('');
  const [assistant, setAssistant] = useState('Self');
  const [painLevel, setPainLevel] = useState(5);
  const [activeTaskName, setActiveTaskName] = useState('General Exercise');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const getName = async () => {
      try {
        const storedName = await AsyncStorage.getItem('user_name');
        if (storedName) {
          setCurrentHelper(storedName);
          setNameInput(storedName);
        }
      } catch (e) { console.log("Error loading name", e); }
    };
    getName();
  }, []);

  useEffect(() => {
    let interval = null;
    if (isTracking) {
      interval = setInterval(() => { setSeconds((prev) => prev + 1); }, 1000);
    } else { clearInterval(interval); }
    return () => clearInterval(interval);
  }, [isTracking]);

  const saveName = async () => {
    await AsyncStorage.setItem('user_name', nameInput);
    setCurrentHelper(nameInput);
    Alert.alert("Saved", `Identity updated to: ${nameInput}`);
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const fetchHistory = async () => {
    setLoading(true);
    setView('history');
    try {
      const q = query(collection(db, "sessionLogs"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedLogs = [];
      querySnapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() });
      });
      setLogs(fetchedLogs);
    } catch (e) {
      Alert.alert("Error", "Could not load history: " + e.message);
    }
    setLoading(false);
  };

  const handleTimerAction = async () => {
    if (!isTracking) {
      setIsTracking(true);
    } else {
      setIsTracking(false);
      const finalTime = formatTime(seconds);
      try {
        const logRef = doc(db, "sessionLogs", `session_${Date.now()}`);
        await setDoc(logRef, {
          user: currentHelper,
          taskName: activeTaskName,
          assistant: assistant,
          notes: sessionNotes,
          painLevel: painLevel,
          duration: finalTime,
          durationSeconds: seconds,
          timestamp: new Date().toISOString(),
        });
        Alert.alert("Success!", "Session saved to history.");
        setSeconds(0);
        setSessionNotes('');
      } catch (e) { Alert.alert("Error", e.message); }
    }
  };

  if (view === 'history') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setView('dashboard')}>
            <Text style={styles.backButton}>← Back to Dashboard</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Recovery History</Text>
        </View>
        {loading ? (
          <ActivityIndicator size="large" color="#3498db" style={{ marginTop: 50 }} />
        ) : (
          <ScrollView>
            {logs.map((log) => (
              <View key={log.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTask}>{log.taskName}</Text>
                  <Text style={styles.historyDate}>{new Date(log.timestamp).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.historyDetail}>⏱ Duration: {log.duration}</Text>
                <Text style={styles.historyDetail}>👤 Helper: {log.assistant}</Text>
                <Text style={styles.historyDetail}>🔥 Pain: {log.painLevel}/10</Text>
                {log.notes ? <Text style={styles.historyNotes}>" {log.notes} "</Text> : null}
              </View>
            ))}
            <View style={{ height: 50 }} />
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.title}>Command Center</Text>
          <TouchableOpacity style={styles.historyBtn} onPress={fetchHistory}>
            <Text style={styles.historyBtnText}>View Logs</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>User: {currentHelper}</Text>
      </View>

      <Text style={styles.sectionHeader}>Active Session: {activeTaskName}</Text>
      <View style={[styles.card, { alignItems: 'center' }]}>
        <Text style={styles.timerText}>{formatTime(seconds)}</Text>
        <TouchableOpacity style={[styles.timerButton, isTracking ? styles.stopBtn : styles.startBtn]} onPress={handleTimerAction}>
          <Text style={styles.buttonText}>{isTracking ? "STOP & SAVE" : "START TIMER"}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>Pain Level (1-10)</Text>
        <View style={styles.painRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <TouchableOpacity key={num} style={[styles.painCircle, painLevel === num && styles.painActive]} onPress={() => setPainLevel(num)}>
              <Text style={[styles.painText, painLevel === num && styles.painActiveText]}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.cardTitle}>Who is helping?</Text>
        <View style={styles.helperRow}>
          {['Ivan', 'Mom', 'Dad', 'Self'].map((p) => (
            <TouchableOpacity key={p} style={[styles.helperChip, assistant === p && styles.helperActive]} onPress={() => setAssistant(p)}>
              <Text style={[styles.helperText, assistant === p && styles.helperActiveText]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.notesInput} placeholder="Session notes..." multiline value={sessionNotes} onChangeText={setSessionNotes} />
      </View>

      <View style={[styles.card, { marginTop: 20, marginBottom: 50 }]}>
        <Text style={styles.cardTitle}>Settings</Text>
        <TextInput style={styles.input} value={nameInput} onChangeText={setNameInput} />
        <TouchableOpacity style={styles.saveButton} onPress={saveName}><Text style={styles.buttonText}>Update Name</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
  header: { marginTop: 60, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1a2a6c' },
  subtitle: { fontSize: 16, color: '#5d6d7e' },
  backButton: { color: '#3498db', fontWeight: 'bold', marginBottom: 10 },
  historyBtn: { backgroundColor: '#34495e', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  historyBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  sectionHeader: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginTop: 20, marginBottom: 10 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 4 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', marginTop: 15 },
  timerText: { fontSize: 50, fontWeight: 'bold', color: '#2c3e50' },
  timerButton: { width: '100%', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  startBtn: { backgroundColor: '#2ecc71' },
  stopBtn: { backgroundColor: '#e74c3c' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  painRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  painCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },
  painActive: { backgroundColor: '#e67e22' },
  painText: { fontSize: 12, fontWeight: 'bold', color: '#7f8c8d' },
  painActiveText: { color: '#fff' },
  helperRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  helperChip: { backgroundColor: '#ecf0f1', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  helperActive: { backgroundColor: '#3498db' },
  helperText: { color: '#7f8c8d', fontWeight: 'bold' },
  helperActiveText: { color: '#fff' },
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginTop: 15, height: 60, borderWidth: 1, borderColor: '#eee' },
  input: { borderWidth: 1, borderColor: '#dcdde1', borderRadius: 8, padding: 10, marginTop: 10, marginBottom: 10 },
  saveButton: { backgroundColor: '#95a5a6', padding: 10, borderRadius: 8, alignItems: 'center' },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 5, borderLeftColor: '#3498db', elevation: 2 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  historyTask: { fontWeight: 'bold', fontSize: 16, color: '#2c3e50' },
  historyDate: { fontSize: 12, color: '#95a5a6' },
  historyDetail: { fontSize: 14, color: '#7f8c8d', marginTop: 2 },
  historyNotes: { fontStyle: 'italic', color: '#34495e', marginTop: 8, backgroundColor: '#f9f9f9', padding: 5, borderRadius: 5 }
});

registerRootComponent(App);