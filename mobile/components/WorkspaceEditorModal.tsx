/**
 * WorkspaceEditorModal
 *
 * Lets a human physician who has AI mode enabled edit the three Markdown
 * sections that personalise their AI persona:
 *
 *   Identity  — who you are (specialisation, background, languages)
 *   Style     — how you communicate with patients
 *   Persona   — free-form layer (clinical focus, tone, personal notes)
 *
 * AGENT.md / SOUL.md safety rules are enforced by the platform and are NOT
 * shown here — they cannot be overridden regardless of what is saved.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ProfessionalService } from '../services/professional-service';

// ─── Limits (must mirror workspace.go constants) ────────────────────────────
const LIMIT_IDENTITY = 4000;
const LIMIT_USER     = 4000;
const LIMIT_PERSONA  = 2000;

// ─── Tab definitions ─────────────────────────────────────────────────────────
type TabKey = 'identity' | 'user' | 'persona';

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  limit: number;
  placeholder: string;
  hint: string;
}> = [
  {
    key: 'identity',
    label: 'Identity',
    icon: 'person-outline',
    limit: LIMIT_IDENTITY,
    placeholder:
      '# My Identity\n\nDescribe yourself as your AI will present you:\n\n- Full name and title\n- Specialisation(s)\n- Years of experience\n- Medical school and year\n- Languages spoken\n- State / region of practice\n- Clinical strengths',
    hint: 'This shapes how your AI introduces itself and contextualises its clinical background.',
  },
  {
    key: 'user',
    label: 'Style',
    icon: 'chatbubble-ellipses-outline',
    limit: LIMIT_USER,
    placeholder:
      '# Communication Style\n\nDescribe how you interact with patients:\n\n- Tone (formal / warm / conversational)\n- Language switching (English, Hausa, Yoruba, Pidgin…)\n- How you handle anxious patients\n- How you explain complex findings\n- Preferred greeting format',
    hint: 'This tells the AI how to speak in your voice. Be specific — the more detail, the more it sounds like you.',
  },
  {
    key: 'persona',
    label: 'Persona',
    icon: 'sparkles-outline',
    limit: LIMIT_PERSONA,
    placeholder:
      '# My Persona\n\nAny additional context you want the AI to carry:\n\n- Specific clinical philosophy\n- Areas you are especially thorough about\n- Things you always mention for certain conditions\n- Closing lines or sign-offs you use',
    hint: 'A short free-form layer injected last — use it for anything that doesn\'t fit Identity or Style.',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface WorkspaceEditorModalProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function WorkspaceEditorModal({ visible, onClose }: WorkspaceEditorModalProps) {
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab]   = useState<TabKey>('identity');
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [dirty, setDirty]           = useState(false);

  const [identity, setIdentity] = useState('');
  const [user,     setUser]     = useState('');
  const [persona,  setPersona]  = useState('');

  const originalRef = useRef({ identity: '', user: '', persona: '' });

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    ProfessionalService.getWorkspace()
      .then((ws) => {
        setIdentity(ws.identity_md);
        setUser(ws.user_md);
        setPersona(ws.persona_md);
        originalRef.current = {
          identity: ws.identity_md,
          user:     ws.user_md,
          persona:  ws.persona_md,
        };
        setDirty(false);
      })
      .catch(() => {
        Alert.alert('Error', 'Failed to load workspace. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [visible]);

  // ── Dirty tracking ────────────────────────────────────────────────────────
  const handleChange = useCallback(
    (field: TabKey, value: string) => {
      if (field === 'identity') setIdentity(value);
      else if (field === 'user') setUser(value);
      else setPersona(value);
      const orig = originalRef.current;
      setDirty(
        (field === 'identity' ? value : identity) !== orig.identity ||
        (field === 'user'     ? value : user)     !== orig.user     ||
        (field === 'persona'  ? value : persona)  !== orig.persona,
      );
    },
    [identity, user, persona],
  );

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await ProfessionalService.saveWorkspace({
        identity_md: identity,
        user_md:     user,
        persona_md:  persona,
      });
      originalRef.current = { identity, user, persona };
      setDirty(false);
      Alert.alert('Saved', 'Your AI workspace has been updated. Changes take effect on the next patient reply.');
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [identity, user, persona]);

  // ── Dismiss guard ─────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (dirty) {
      Alert.alert(
        'Unsaved changes',
        'You have unsaved changes. Discard them and close?',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setIdentity(originalRef.current.identity);
              setUser(originalRef.current.user);
              setPersona(originalRef.current.persona);
              setDirty(false);
              onClose();
            },
          },
        ],
      );
    } else {
      onClose();
    }
  }, [dirty, onClose]);

  // ── Current tab data ──────────────────────────────────────────────────────
  const tab        = TABS.find((t) => t.key === activeTab)!;
  const value      = activeTab === 'identity' ? identity : activeTab === 'user' ? user : persona;
  const charCount  = [...value].length; // rune-accurate like the backend
  const overLimit  = charCount > tab.limit;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#fff' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#374151" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>AI Workspace</Text>
            <Text style={styles.headerSub}>Personalise your AI persona</Text>
          </View>

          <Pressable
            onPress={handleSave}
            disabled={!dirty || saving || overLimit}
            style={[
              styles.saveBtn,
              (!dirty || saving || overLimit) && { opacity: 0.4 },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>
        </View>

        {/* ── Safety notice ───────────────────────────────────────────────── */}
        <View style={styles.noticeBanner}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#0f766e" />
          <Text style={styles.noticeText}>
            Platform safety rules (MDCN ethics, emergency escalation, anti-hallucination) are always enforced and cannot be overridden here.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#0AADA2" />
            <Text style={styles.loaderText}>Loading workspace…</Text>
          </View>
        ) : (
          <>
            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <View style={styles.tabBar}>
              {TABS.map((t) => {
                const isActive = t.key === activeTab;
                const val = t.key === 'identity' ? identity : t.key === 'user' ? user : persona;
                const hasContent = val.trim().length > 0;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setActiveTab(t.key)}
                    style={[styles.tab, isActive && styles.tabActive]}
                  >
                    <Ionicons
                      name={t.icon}
                      size={15}
                      color={isActive ? '#0AADA2' : '#9ca3af'}
                    />
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                      {t.label}
                    </Text>
                    {hasContent && (
                      <View style={[styles.tabDot, isActive && styles.tabDotActive]} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* ── Hint ────────────────────────────────────────────────────── */}
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={13} color="#6b7280" />
              <Text style={styles.hintText}>{tab.hint}</Text>
            </View>

            {/* ── Editor ──────────────────────────────────────────────────── */}
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1 }}
            >
              <TextInput
                key={activeTab} // remount on tab switch to reset scroll position
                value={value}
                onChangeText={(v) => handleChange(activeTab, v)}
                multiline
                textAlignVertical="top"
                placeholder={tab.placeholder}
                placeholderTextColor="#d1d5db"
                style={[styles.editor, overLimit && styles.editorOver]}
                autoCorrect={false}
                autoCapitalize="sentences"
                scrollEnabled={false} // let the outer ScrollView handle it
              />
            </ScrollView>

            {/* ── Footer: char counter ────────────────────────────────────── */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
              <Text style={[styles.charCount, overLimit && styles.charCountOver]}>
                {charCount.toLocaleString()} / {tab.limit.toLocaleString()}
                {overLimit ? '  ⚠ Over limit' : ''}
              </Text>
              {dirty && !overLimit && (
                <Text style={styles.unsavedBadge}>Unsaved changes</Text>
              )}
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 10,
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub:   { fontSize: 12, color: '#6b7280', marginTop: 1 },
  saveBtn: {
    backgroundColor: '#0AADA2',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: '#f0fdfa',
    borderBottomWidth: 1,
    borderBottomColor: '#ccfbf1',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  noticeText: { flex: 1, fontSize: 11.5, color: '#0f766e', lineHeight: 17 },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loaderText: { fontSize: 13, color: '#6b7280' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    position: 'relative',
  },
  tabActive: { borderBottomColor: '#0AADA2' },
  tabLabel:      { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  tabLabelActive: { color: '#0AADA2' },
  tabDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#d1d5db',
  },
  tabDotActive: { backgroundColor: '#0AADA2' },

  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  hintText: { flex: 1, fontSize: 11.5, color: '#6b7280', lineHeight: 16 },

  editor: {
    flex: 1,
    minHeight: 340,
    padding: 16,
    fontSize: 14,
    color: '#111827',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  editorOver: { backgroundColor: '#fff5f5' },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  charCount:     { fontSize: 12, color: '#9ca3af' },
  charCountOver: { color: '#dc2626', fontWeight: '700' },
  unsavedBadge:  { fontSize: 11, color: '#d97706', fontWeight: '600' },
});
