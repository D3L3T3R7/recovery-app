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
  
  // NEW: Pain Level State
  const [painLevel, setPainLevel] = useState(5);

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
    Alert.alert("Saved", `Name set to: ${nameInput}`);
  };

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
      const finalTime = formatTime(seconds);
      
      try {
        const logRef = doc(db, "recoveryLogs", `session_${Date.now()}`);
        await setDoc(logRef, {
          user: currentHelper,
          assistant: assistant,
          notes: sessionNotes,
          painLevel: painLevel, // Saved to Firebase!
          duration: finalTime,
          durationSeconds: seconds,
          timestamp: new Date().toISOString(),
          type: "Mobility Exercise"
        });
        Alert.alert("Session Logged", `Time: ${finalTime}\nPain: ${painLevel}/10`);
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
        <Text style={styles.subtitle}>User: {currentHelper}</Text>
      </View>

      <View style={[styles.card, { alignItems: 'center' }]}>
        <Text style={styles.timerText}>{formatTime(seconds)}</Text>
        <TouchableOpacity 
          style={[styles.timerButton, isTracking ? styles.stopBtn : styles.startBtn]} 
          onPress={handleTimerAction}
        >
          <Text style={styles.buttonText}>{isTracking ? "STOP & SAVE" : "START EXERCISE"}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { marginTop: 20 }]}>
        {/* Pain Scale Selector */}
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
          placeholder="How was the movement today?"
          multiline
          value={sessionNotes}
          onChangeText={setSessionNotes}
        />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
  header: { marginTop: 60, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1a2a6c' },
  subtitle: { fontSize: 16, color: '#5d6d7e' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 4 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
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
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginTop: 10, height: 60, textAlignVertical: 'top', borderWidth: 1, borderColor: '#eee' }
});

registerRootComponent(App);