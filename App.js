import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, ActivityIndicator, Share } from 'react-native';
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
  const [activeTask, setActiveTask] = useState('Wrist Rotations');
  const exercises = ['Wrist Rotations', 'Grip Training', 'Arm Stretches', 'Shoulder Mobility'];

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ avgPain: 0, totalMins: 0 });

  useEffect(() => {
    const getName = async () => {
      try {
        const storedName = await AsyncStorage.getItem('user_name');
        if (storedName) { setCurrentHelper(storedName); setNameInput(storedName); }
      } catch (e) { console.log(e); }
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
    Alert.alert("Saved", "Identity updated.");
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
      let totalPain = 0;
      let totalSecs = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedLogs.push({ id: doc.id, ...data });
        totalPain += data.painLevel || 0;
        totalSecs += data.durationSeconds || 0;
      });

      setLogs(fetchedLogs);
      if (fetchedLogs.length > 0) {
        setStats({
          avgPain: (totalPain / fetchedLogs.length).toFixed(1),
          totalMins: Math.floor(totalSecs / 60)
        });
      }
    } catch (e) { Alert.alert("Error", e.message); }
    setLoading(false);
  };

  // NEW: THE SHARING LOGIC
  const shareReport = async () => {
    let reportText = `RECOVERY LOG: ${currentHelper}\n`;
    reportText += `Generated on: ${new Date().toLocaleDateString()}\n`;
    reportText += `--------------------------\n`;
    reportText += `Avg Pain: ${stats.avgPain}/10\n`;
    reportText += `Total Work: ${stats.totalMins} minutes\n`;
    reportText += `--------------------------\n\n`;

    logs.forEach(log => {
      reportText += `${new Date(log.timestamp).toLocaleDateString()} - ${log.taskName}\n`;
      reportText += `Time: ${log.duration} | Pain: ${log.painLevel}/10\n`;
      if (log.notes) reportText += `Note: "${log.notes}"\n`;
      reportText += `\n`;
    });

    try {
      await Share.share({ message: reportText });
    } catch (error) {
      Alert.alert("Error sharing", error.message);
    }
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
          taskName: activeTask,
          assistant: assistant,
          notes: sessionNotes,
          painLevel: painLevel,
          duration: finalTime,
          durationSeconds: seconds,
          timestamp: new Date().toISOString(),
        });
        Alert.alert("Success!", "Logged to your recovery trends.");
        setSeconds(0);
        setSessionNotes('');
      } catch (e) { Alert.alert("Error", e.message); }
    }
  };

  if (view === 'history') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setView('dashboard')}><Text style={styles.backButton}>← Dashboard</Text></TouchableOpacity>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.title}>Recovery Trends</Text>
            <TouchableOpacity style={styles.shareBtn} onPress={shareReport}>
              <Text style={styles.shareBtnText}>Share Report</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? <ActivityIndicator size="large" color="#3498db" /> : (
          <ScrollView>
            <View style={styles.statsCard}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Avg Pain</Text>
                <Text style={styles.statValue}>{stats.avgPain}/10</Text>
              </View>
              <View style={[styles.statBox, { borderLeftWidth: 1, borderColor: '#eee' }]}>
                <Text style={styles.statLabel}>Total Time</Text>
                <Text style={styles.statValue}>{stats.totalMins}m</Text>
              </View>
            </View>

            {logs.map((log) => (
              <View key={log.id} style={styles.historyCard}>
                <Text style={styles.historyTask}>{log.taskName}</Text>
                <Text style={styles.historyDetail}>⏱ {log.duration}  |  🔥 Pain: {log.painLevel}/10</Text>
                {log.notes ? <Text style={styles.historyNotes}>"{log.notes}"</Text> : null}
                <Text style={styles.historyDate}>{new Date(log.timestamp).toLocaleDateString()}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.title}>Command Center</Text>
          <TouchableOpacity style={styles.historyBtn} onPress={fetchHistory}><Text style={styles.historyBtnText}>Trends</Text></TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionHeader}>1. Select Exercise</Text>
      <View style={styles.helperRow}>
        {exercises.map((ex) => (
          <TouchableOpacity key={ex} style={[styles.helperChip, activeTask === ex && styles.activeExercise]} onPress={() => setActiveTask(ex)}>
            <Text style={[styles.helperText, activeTask === ex && styles.helperActiveText]}>{ex}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.card, { marginTop: 15, alignItems: 'center' }]}>
        <Text style={styles.activeTaskLabel}>Doing: {activeTask}</Text>
        <Text style={styles.timerText}>{formatTime(seconds)}</Text>
        <TouchableOpacity style={[styles.timerButton, isTracking ? styles.stopBtn : styles.startBtn]} onPress={handleTimerAction}>
          <Text style={styles.buttonText}>{isTracking ? "STOP & SAVE" : "START SESSION"}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>Pain Level & Assistant</Text>
        <View style={styles.painRow}>
          {[1,2,3,4,5,6,7,8,9,10].map((n) => (
            <TouchableOpacity key={n} style={[styles.painCircle, painLevel === n && styles.painActive]} onPress={() => setPainLevel(n)}>
              <Text style={[styles.painText, painLevel === n && styles.painActiveText]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.helperRow}>
          {['Ivan', 'Mom', 'Dad', 'Self'].map((p) => (
            <TouchableOpacity key={p} style={[styles.helperChip, assistant === p && styles.helperActive]} onPress={() => setAssistant(p)}>
              <Text style={styles.helperText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.notesInput} placeholder="How did it feel?" multiline value={sessionNotes} onChangeText={setSessionNotes} />
      </View>

      <View style={[styles.card, { marginTop: 20, marginBottom: 50 }]}>
        <Text style={styles.cardTitle}>Update Settings</Text>
        <TextInput style={styles.input} value={nameInput} onChangeText={setNameInput} placeholder="Your name..." />
        <TouchableOpacity style={styles.saveButton} onPress={saveName}><Text style={styles.buttonText}>Save Identity</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
  header: { marginTop: 60, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1a2a6c' },
  backButton: { color: '#3498db', fontWeight: 'bold', marginBottom: 5 },
  historyBtn: { backgroundColor: '#34495e', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  historyBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  shareBtn: { backgroundColor: '#27ae60', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  shareBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#7f8c8d', marginTop: 15 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 4 },
  activeTaskLabel: { fontSize: 14, color: '#3498db', fontWeight: 'bold' },
  timerText: { fontSize: 50, fontWeight: 'bold', color: '#2c3e50' },
  timerButton: { width: '100%', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  startBtn: { backgroundColor: '#2ecc71' },
  stopBtn: { backgroundColor: '#e74c3c' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  painRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 15 },
  painCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center' },
  painActive: { backgroundColor: '#e67e22' },
  painText: { fontSize: 12, fontWeight: 'bold' },
  painActiveText: { color: '#fff' },
  helperRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  helperChip: { backgroundColor: '#ecf0f1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, marginRight: 8, marginBottom: 8 },
  activeExercise: { backgroundColor: '#3498db' },
  helperActive: { backgroundColor: '#95a5a6' },
  helperActiveText: { color: '#fff' },
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 10, marginTop: 10, height: 50, borderWidth: 1, borderColor: '#eee' },
  input: { borderWidth: 1, borderColor: '#dcdde1', borderRadius: 8, padding: 10, marginVertical: 10 },
  saveButton: { backgroundColor: '#95a5a6', padding: 10, borderRadius: 8, alignItems: 'center' },
  statsCard: { backgroundColor: '#fff', borderRadius: 15, padding: 20, flexDirection: 'row', marginBottom: 20, elevation: 4 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: '#7f8c8d', textTransform: 'uppercase' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50' },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 5, borderLeftColor: '#3498db' },
  historyTask: { fontWeight: 'bold', fontSize: 16 },
  historyDetail: { color: '#7f8c8d', marginTop: 4 },
  historyNotes: { fontStyle: 'italic', marginTop: 5, color: '#555', backgroundColor: '#f9f9f9', padding: 5 },
  historyDate: { fontSize: 10, color: '#bdc3c7', marginTop: 8, textAlign: 'right' }
});

registerRootComponent(App);