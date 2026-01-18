import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Image, Modal, ActivityIndicator, Linking } from 'react-native';
import { registerRootComponent } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from './firebaseConfig';
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

function App() {
  const [view, setView] = useState('dashboard');
  const [currentHelper, setCurrentHelper] = useState('Chris');
  const [sessionNotes, setSessionNotes] = useState('');
  const [videoLink, setVideoLink] = useState(''); // NEW: External Video Link state
  const [isUploading, setIsUploading] = useState(false);
  
  const [localMedia, setLocalMedia] = useState([]); 
  const [selectedMedia, setSelectedMedia] = useState(null); 
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const getName = async () => {
      const storedName = await AsyncStorage.getItem('user_name');
      if (storedName) setCurrentHelper(storedName);
    };
    getName();
  }, []);

  const removeMedia = (indexToRemove) => {
    setLocalMedia(localMedia.filter((_, index) => index !== indexToRemove));
  };

  const pickMedia = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, // Optimized for photos primarily
      allowsMultipleSelection: true,
      selectionLimit: 15,
      quality: 0.8, // Slightly lower for faster upload on shaky connections
    });

    if (!result.canceled) {
      const newItems = result.assets.map(asset => ({ uri: asset.uri, type: asset.type }));
      setLocalMedia([...localMedia, ...newItems]);
    }
  };

  const takePhoto = async () => {
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) {
      setLocalMedia([...localMedia, { uri: result.assets[0].uri, type: result.assets[0].type }]);
    }
  };

  const handleSave = async () => {
    if (localMedia.length === 0 && !sessionNotes && !videoLink) return;
    setIsUploading(true);
    try {
      const uploadedUrls = [];
      for (const item of localMedia) {
        const response = await fetch(item.uri);
        const blob = await response.blob();
        const filename = `evidence/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const storageRef = ref(storage, filename);
        
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push({ url, type: 'image' });
      }

      const logId = `log_${Date.now()}`;
      await setDoc(doc(db, "sessionLogs", logId), {
        user: currentHelper,
        timestamp: new Date().toISOString(),
        notes: sessionNotes,
        externalVideo: videoLink, // Save the Google Drive link
        mediaLinks: uploadedUrls,
        logType: 'Professional Evidence'
      });

      Alert.alert("Locked in Vault", "High-res photos and links secured.");
      setLocalMedia([]); setSessionNotes(''); setVideoLink('');
    } catch (e) { 
      Alert.alert("Upload Error", "Connection timed out. Try fewer photos at once."); 
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
              
              {log.externalVideo ? (
                <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(log.externalVideo)}>
                  <Text style={styles.linkBtnText}>🔗 Open Linked Video Evidence</Text>
                </TouchableOpacity>
              ) : null}

              <ScrollView horizontal style={{ marginTop: 10 }}>
                {log.mediaLinks && log.mediaLinks.map((item, index) => (
                  <TouchableOpacity key={index} onPress={() => setSelectedMedia(item)}>
                    <Image source={{ uri: item.url }} style={styles.miniPreview} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
          <View style={{height: 60}} />
        </ScrollView>

        <Modal visible={selectedMedia !== null} transparent={true}>
          <View style={styles.modalView}>
            <Image source={{ uri: selectedMedia?.url }} style={styles.fullImage} resizeMode="contain" />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedMedia(null)}>
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
        <Text style={styles.cardTitle}>Capture New Evidence</Text>
        <TouchableOpacity style={[styles.evidenceBtn, {width: '100%', marginBottom: 10}]} onPress={takePhoto}>
          <Text>📷 Take Evidence Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.evidenceBtn, {width: '100%'}]} onPress={pickMedia}>
          <Text>🖼️ Photo Dump (Multi-Select Gallery)</Text>
        </TouchableOpacity>

        <ScrollView horizontal style={{ marginVertical: 15 }}>
          {localMedia.map((item, index) => (
            <View key={index} style={styles.thumbnailContainer}>
              <Image source={{ uri: item.uri }} style={styles.miniPreview} />
              <TouchableOpacity style={styles.deleteButton} onPress={() => removeMedia(index)}>
                <Text style={styles.deleteButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <Text style={styles.cardTitle}>Large Video Link (Google Drive/OneDrive)</Text>
        <TextInput style={styles.input} placeholder="Paste shareable video link here..." value={videoLink} onChangeText={setVideoLink} />

        <Text style={[styles.cardTitle, {marginTop: 15}]}>Detailed Evidence Notes</Text>
        <TextInput style={styles.notesInput} placeholder="Add specific details for your lawyer..." multiline value={sessionNotes} onChangeText={setSessionNotes} />
        
        {isUploading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1a2a6c" />
            <Text style={styles.loadingText}>Uploading high-res evidence...</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>LOCK IN EVIDENCE VAULT</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{height: 60}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
  header: { marginTop: 60, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a2a6c' },
  backButton: { color: '#3498db', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#34495e', marginBottom: 5 },
  input: { borderBottomWidth: 1, borderColor: '#dcdde1', paddingVertical: 8, fontSize: 14, marginBottom: 10 },
  evidenceBtn: { backgroundColor: '#ecf0f1', padding: 15, borderRadius: 10, alignItems: 'center' },
  thumbnailContainer: { position: 'relative', marginRight: 15, marginTop: 5 },
  miniPreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#eee' },
  deleteButton: { position: 'absolute', top: -8, right: -8, backgroundColor: '#e74c3c', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 1.5, borderColor: '#fff' },
  deleteButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 10 },
  notesInput: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 10, height: 80, marginTop: 5 },
  saveBtn: { backgroundColor: '#1a2a6c', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  linkBtn: { backgroundColor: '#f1f2f6', padding: 10, borderRadius: 8, marginVertical: 10, borderWidth: 1, borderColor: '#3498db' },
  linkBtnText: { color: '#3498db', fontWeight: 'bold', fontSize: 13 },
  loadingContainer: { alignItems: 'center', marginTop: 15 },
  loadingText: { marginTop: 10, color: '#7f8c8d', fontWeight: 'bold' },
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