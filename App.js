import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

function App() {
  const [currentHelper, setCurrentHelper] = useState('Volunteer');

  useEffect(() => {
    const getName = async () => {
      try {
        const storedName = await AsyncStorage.getItem('user_name');
        if (storedName) setCurrentHelper(storedName);
      } catch (e) {
        console.log("Error loading name", e);
      }
    };
    getName();
  }, []);

  const claimTask = async (taskId) => {
    try {
      const taskRef = doc(db, "recoveryLogs", taskId);
      // setDoc with { merge: true } creates the document if it's missing!
      await setDoc(taskRef, {
        status: "In Progress",
        claimedBy: currentHelper,
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      Alert.alert("Success", "Task claimed by " + currentHelper);
    } catch (e) {
      Alert.alert("Error", "Could not claim task: " + e.message);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recovery Command Center</Text>
        <Text style={styles.subtitle}>Current User: {currentHelper}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Morning Recovery Exercises</Text>
        <Text style={styles.cardDetail}>Goal: 15 mins of mobility stretching</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => claimTask('morning_ex_001')}
        >
          <Text style={styles.buttonText}>Claim Task</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 20 },
  header: { marginTop: 60, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2c3e50' },
  subtitle: { fontSize: 16, color: '#7f8c8d', marginTop: 5 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, elevation: 4, shadowColor: '#000' },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  cardDetail: { fontSize: 14, color: '#666', marginVertical: 10 },
  button: { backgroundColor: '#3498db', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});

registerRootComponent(App);