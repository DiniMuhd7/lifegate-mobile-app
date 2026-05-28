import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useIMStore } from '../stores/im-store';
import { useAuthStore } from '../stores/auth-store';
import { useCallStore } from '../stores/call-store';
import { IMMessage, CallTranscriptMeta } from '../types/im-types';
import wsService from '../services/websocket-service';

// ... (rest of unchanged code above)

// ─── Props ────────────────────────────────────────────────────────────────
interface InstantMessageModalProps {
  diagnosisId: string;
  counterpartName: string;
  perspective: 'patient' | 'physician';
  onClose: () => void;
  demoMode?: boolean;
  callDisplayName?: string;
}

export function InstantMessageModal({
  diagnosisId,
  counterpartName,
  perspective,
  onClose,
  demoMode = false,
  callDisplayName,
}: InstantMessageModalProps) {
  // Demo feature state
  const [demoHistory, setDemoHistory] = useState([
    { id: '1', sender: 'LifeGate', message: '👋 Welcome! This is a chat demo. Voice & image messages are disabled.' },
    { id: '2', sender: 'You', message: 'Hi! Can I try messaging here?' },
    { id: '3', sender: 'LifeGate', message: 'You can send text. Sign up for full access!' },
  ]);
  const [demoText, setDemoText] = useState('');

  const handleDemoSend = () => {
    const trimmed = demoText.trim();
    if (!trimmed) return;
    setDemoHistory(prev => [
      ...prev,
      { id: String(Date.now()), sender: 'You', message: trimmed }
    ]);
    setTimeout(() => {
      setDemoHistory(prev => [
        ...prev,
        { id: String(Date.now()) + 'b', sender: 'LifeGate', message: '🤖 This is a demo. Sign up to chat for real!' }
      ]);
    }, 900);
    setDemoText('');
  };

  if (demoMode) {
    return (
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.33)', justifyContent: 'center', alignItems: 'center'
      }}>
        <View style={{
          backgroundColor: 'white', borderRadius: 18, padding: 18, width: 340, maxWidth: '95%',
          shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Ionicons name="chatbubbles-outline" size={22} color="#0AADA2" />
            <Text style={{ marginLeft: 11, fontWeight: 'bold', fontSize: 16 }}>Demo Chat</Text>
            <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={onClose}>
              <Ionicons name="close" size={18} color="#334155" />
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: '#f0fdfa', borderRadius: 7, padding: 8, marginBottom: 10 }}>
            <Text style={{ color: '#0AADA2', fontWeight: 'bold' }}>
              Demo: voice & image messages disabled.
            </Text>
            <Text style={{ color: '#0AADA2', fontSize: 12 }}>
              Sign up to unlock all chat features.
            </Text>
          </View>
          <View style={{ height: 210, marginBottom: 10 }}>
            {demoHistory.map((m) => (
              <View key={m.id} style={{ marginBottom: 5, flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text style={{ fontWeight: m.sender === 'You' ? 'bold' : 'normal', color: m.sender === 'You' ? '#0AADA2' : '#555', marginRight: 6 }}>
                  {m.sender}:
                </Text>
                <Text style={{ flex: 1 }}>{m.message}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              style={{
                flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8,
                paddingVertical: 7, paddingHorizontal: 12,
              }}
              value={demoText}
              onChangeText={setDemoText}
              editable={true}
              placeholder="Type a message…"
              maxLength={200}
            />
            <TouchableOpacity
              onPress={handleDemoSend}
              disabled={!demoText.trim()}
              style={{
                marginLeft: 8, backgroundColor: '#0AADA2', borderRadius: 8, padding: 8,
                opacity: demoText.trim() ? 1 : 0.35
              }}
            >
              <Ionicons name="send" size={17} color="#fff" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 10, alignSelf: 'center' }}>
            <Text style={{ color: '#0AADA2', textDecorationLine: 'underline', fontWeight: 'bold' }}>
              Sign up for full access
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

// ... original full-feature chat modal body follows, unchanged ...
}

// (styles and helper component code unchanged)
