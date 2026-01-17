import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

function App() {
  const [currentHelper, setCurrentHelper] = useState('Volunteer');
  const [nameInput, setNameInput] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sessionNotes, setSessionNotes] = useState('');
  const [assistant, setAssistant] = useState('Self');
  const [painLevel, setPainLevel] = useState(5);
  const [activeTaskName, setActiveTaskName] = useState('General Exercise');

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

  // Logic to "Claim" a task and set it as the active timer target
  const claimTask = async (taskId, taskTitle) => {
    try {
      const taskRef = doc(db, "recoveryLogs", taskId);
      await setDoc(taskRef, {
        status: "In Progress",
        claimedBy: currentHelper,
        lastClaimed: new Date().toISOString()
      }, { merge: true });
      
      setActiveTaskName(taskTitle);
      Alert.alert("Task Claimed", `Ready to start: ${taskTitle}`);
    } catch (e) {
      Alert.alert("Error", "Could not claim task: " + e.message);
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
          taskName: activeTaskName,
          assistant: assistant,
          notes: sessionNotes,
          painLevel: painLevel,
          duration: finalTime,
          durationSeconds: seconds,
          timestamp: new Date().toISOString(),
        });
        Alert.alert("Success!", `Logged ${finalTime} for ${activeTaskName}`);
        setSeconds(0);
        setSessionNotes('');
      } catch (e) {
        Alert.alert("Error", "Could not save: " + e.message);
      }
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recovery Command Center</Text>
        <Text style={styles.subtitle}>Current User: {currentHelper}</Text>
      </View>

      {/* SECTION 1: Claimable Tasks */}
      <Text style={styles.sectionHeader}>Tasks to Complete</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Morning Mobility Exercises</Text>
        <Text style={styles.cardDetail}>Goal: 15 mins of arm/wrist work</Text>
        <TouchableOpacity 
          style={styles.claimButton} 
          onPress={() => claimTask('morning_mobility_001', 'Morning Mobility')}
        >
          <Text style={styles.buttonText}>CLAIM TASK</Text>
        </TouchableOpacity>
      </View>

      {/* SECTION 2: Active Timer */}
      <Text style={styles.sectionHeader}>Active Session: {activeTaskName}</Text>
      <View style={[styles.card, { alignItems: 'center' }]}>
        <Text style={styles.timerText}>{formatTime(seconds)}</Text>
        <TouchableOpacity 
          style={[styles.timerButton, isTracking ? styles.stopBtn : styles.startBtn]} 
          onPress={handleTimerAction}
        >
          <Text style={styles.buttonText}>{isTracking ? "STOP & SAVE" : "START TIMER"}</Text>
        </TouchableOpacity>
      </View>

      {/* SECTION 3: Details */}
      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>Pain Level (1-10)</Text>
        <View style={styles.painRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <TouchableOpacity 
              key={num}
              style={[styles.painCircle, painLevel === num && styles.painActive]}
              onPress={() => setPainLevel(num)}
            >
              <Text style={[styles.painText, painLevel === num && styles.painActiveText]}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.cardTitle, { marginTop: 20 }]}>Who is helping?</Text>
        <View style={styles.helperRow}>
          {['Ivan', 'Mom', 'Dad', 'Self'].map((person) => (
            <TouchableOpacity 
              key={person}
              style={[styles.helperChip, assistant === person && styles.helperActive]}
              onPress={() => setAssistant(person)}
            >
              <Text style={[styles.helperText, assistant === person && styles.helperActiveText]}>{person}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.cardTitle, { marginTop: 20 }]}>Session Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Notes for the therapist..."
          multiline
          value={sessionNotes}
          onChangeText={setSessionNotes}
        />
      </View>

      {/* Identity Settings */}
      <View style={[styles.card, { marginTop: 20, marginBottom: 50 }]}>
        <Text style={styles.cardTitle}>Settings</Text>
        <TextInput style={styles.input} value={nameInput} onChangeText={setNameInput} placeholder="Your name..." />
        <TouchableOpacity style={styles.saveButton} onPress={saveName}>
          <Text style={styles.buttonText}>Update Identity</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
  header: { marginTop: 60, marginBottom: 10 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1a2a6c' },
  subtitle: { fontSize: 16, color: '#5d6d7e' },
  sectionHeader: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginTop: 25, marginBottom: 10 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 4 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
  cardDetail: { fontSize: 14, color: '#7f8c8d', marginBottom: 15 },
  claimButton: { backgroundColor: '#3498db', padding: 12, borderRadius: 8, alignItems: 'center' },
  timerText: { fontSize: 50, fontWeight: 'bold', marginVertical: 10, color: '#2c3e50' },
  timerButton: { width: '100%', padding: 15, borderRadius: 10, alignItems: 'center' },
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
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginTop: 10, height: 60, textAlignVertical: 'top', borderWidth: 1, borderColor: '#eee' },
  input: { borderWidth: 1, borderColor: '#dcdde1', borderRadius: 8, padding: 10, marginTop: 10, marginBottom: 10 },
  saveButton: { backgroundColor: '#95a5a6', padding: 10, borderRadius: 8, alignItems: 'center' }
});

registerRootComponent(App);