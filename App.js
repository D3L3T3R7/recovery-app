import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Switch, Image, Modal, ActivityIndicator } from 'react-native';
import { registerRootComponent } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from './firebaseConfig'; // Ensure storage is exported in your config!
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

function App() {
  const [view, setView] = useState('dashboard');
  const [currentHelper, setCurrentHelper] = useState('Chris');
  const [sessionNotes, setSessionNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // EVIDENCE STATES
  const [localImages, setLocalImages] = useState([]); 
  const [selectedImage, setSelectedImage] = useState(null); 
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const getName = async () => {
      const storedName = await AsyncStorage.getItem('user_name');
      if (storedName) setCurrentHelper(storedName);
    };
    getName();
  }, []);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (!result.canceled) setLocalImages([...localImages, result.assets[0].uri]);
  };

  const takePhoto = async () => {
    let result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled) setLocalImages([...localImages, result.assets[0].uri]);
  };

  const handleSave = async () => {
    if (localImages.length === 0 && !sessionNotes) return;
    
    setIsUploading(true);
    try {
      const uploadedUrls = [];
      
      // Upload each image to Firebase Storage
      for (const uri of localImages) {
        const response = await fetch(uri);
        const blob = await response.blob();
        const filename = `evidence/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const storageRef = ref(storage, filename);
        
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push(url);
      }

      // Save the log entry with the CLOUD links
      const logId = `log_${Date.now()}`;
      await setDoc(doc(db, "sessionLogs", logId), {
        user: currentHelper,
        timestamp: new Date().toISOString(),
        notes: sessionNotes,
        photoUrls: uploadedUrls,
        logType: 'High-Res Evidence'
      });

      Alert.alert("Locked in Vault", "High-resolution evidence uploaded to the cloud.");
      setLocalImages([]);
      setSessionNotes('');
    } catch (e) {
      Alert.alert("Upload Error", e.message);
    }
    setIsUploading(false);
  };

  const fetchHistory = async () => {
    setView('history');
    const q = query(collection(db, "sessionLogs"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    const fetchedLogs = [];
    querySnapshot.forEach((doc) => fetchedLogs.push({ id: doc.id, ...doc.data() }));
    setLogs(fetchedLogs);
  };

  if (view === 'history') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setView('dashboard')}><Text style={styles.backButton}>← Back</Text></TouchableOpacity>
          <Text style={styles.title}>Evidence Vault</Text>
        </View>
        <ScrollView>
          {logs.map((log) => (
            <View key={log.id} style={styles.historyCard}>
              <Text style={styles.historyDate}>{new Date(log.timestamp).toLocaleDateString('en-CA')}</Text>
              <Text style={styles.historyNotes}>"{log.notes}"</Text>
              <ScrollView horizontal style={{ marginTop: 10 }}>
                {log.photoUrls && log.photoUrls.map((url, index) => (
                  <TouchableOpacity key={index} onPress={() => setSelectedImage(url)}>
                    <Image source={{ uri: url }} style={styles.miniPreview} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>

        <Modal visible={selectedImage !== null} transparent={true}>
          <View style={styles.modalView}>
            <Image source={{ uri: selectedImage }} style={styles.fullImage} resizeMode="contain" />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedImage(null)}>
              <Text style={styles.closeText}>CLOSE PHOTO</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recovery Vault</Text>
        <TouchableOpacity style={styles.historyBtn} onPress={fetchHistory}><Text style={styles.historyBtnText}>View Logs</Text></TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attach High-Res Evidence</Text>
        <View style={styles.evidenceRow}>
          <TouchableOpacity style={styles.evidenceBtn} onPress={takePhoto}><Text>📷 Camera</Text></TouchableOpacity>
          <TouchableOpacity style={styles.evidenceBtn} onPress={pickImage}><Text>🖼️ Gallery</Text></TouchableOpacity>
        </View>

        <ScrollView horizontal style={{ marginVertical: 10 }}>
          {localImages.map((img, index) => (
            <Image key={index} source={{ uri: img }} style={styles.miniPreview} />
          ))}
        </ScrollView>

        <TextInput style={styles.notesInput} placeholder="Add details..." multiline value={sessionNotes} onChangeText={setSessionNotes} />
        
        {isUploading ? (
          <ActivityIndicator size="large" color="#1a2a6c" style={{ marginTop: 15 }} />
        ) : (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>UPLOAD TO CLOUD VAULT</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
  header: { marginTop: 60, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: 'bold' },
  backButton: { color: '#3498db', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#34495e', marginBottom: 10 },
  evidenceRow: { flexDirection: 'row', justifyContent: 'space-around' },
  evidenceBtn: { backgroundColor: '#ecf0f1', padding: 15, borderRadius: 10, width: '45%', alignItems: 'center' },
  miniPreview: { width: 100, height: 100, borderRadius: 8, marginRight: 10, backgroundColor: '#eee' },
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 10, height: 60, marginTop: 10 },
  saveBtn: { backgroundColor: '#1a2a6c', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  historyBtn: { backgroundColor: '#34495e', padding: 8, borderRadius: 8 },
  historyBtnText: { color: '#fff', fontSize: 12 },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, borderLeftWidth: 5, borderLeftColor: '#27ae60' },
  historyDate: { fontWeight: 'bold', marginBottom: 5 },
  historyNotes: { fontSize: 12, fontStyle: 'italic', color: '#7f8c8d' },
  modalView: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '95%', height: '80%' },
  closeBtn: { marginTop: 20, backgroundColor: '#fff', padding: 15, borderRadius: 10 },
  closeText: { fontWeight: 'bold', color: '#000' }
});

registerRootComponent(App);