/**
 * WorkspaceEditorModal
 *
 * Lets a human physician who has AI mode enabled edit the three Markdown
 * sections that personalise their AI persona:
 *
 *   Identity  — mirrors IDENTITY.md: personal profile, specialisation,
 *               languages, medical background, Nigerian clinical context
 *   Style     — mirrors USER.md: communication style, tone, patient
 *               interaction philosophy, language switching
 *   Persona   — mirrors PERSONA.md: clinical philosophy, sign-offs,
 *               conditions the physician is especially thorough about
 *
 * AGENT.md and SOUL.md safety rules are enforced by the platform and are NOT
 * shown here — they cannot be overridden regardless of what is saved.
 *
 * "Autofill from Profile" generates a complete first-draft of all three
 * sections from the physician's saved account data so they don't start
 * from a blank page.
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
import { useAuthStore } from '../stores/auth-store';
import type { User } from '../types/auth-types';

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
  hint: string;
}> = [
  {
    key: 'identity',
    label: 'Identity',
    icon: 'person-outline',
    limit: LIMIT_IDENTITY,
    hint: 'Mirrors IDENTITY.md — who you are, your specialisation, background, and Nigerian clinical context.',
  },
  {
    key: 'user',
    label: 'Style',
    icon: 'chatbubble-ellipses-outline',
    limit: LIMIT_USER,
    hint: 'Mirrors USER.md — how you speak with patients, your tone, language switching, and interaction flow.',
  },
  {
    key: 'persona',
    label: 'Persona',
    icon: 'sparkles-outline',
    limit: LIMIT_PERSONA,
    hint: 'Mirrors PERSONA.md — your clinical philosophy, thoroughness areas, and personal sign-off style.',
  },
];

// ─── Autofill generator ───────────────────────────────────────────────────────

/**
 * Derives the primary language(s) the physician speaks from their profile.
 * Falls back to English + the region's dominant language when not set.
 */
function resolveLanguages(user: User): string {
  const lang = (user.language ?? '').trim();
  const state = (user.state ?? '').toLowerCase();

  const base = lang || 'English';

  // Infer additional Nigerian languages from state of practice
  const northernStates = ['kano', 'kaduna', 'sokoto', 'katsina', 'zamfara', 'kebbi',
    'jigawa', 'yobe', 'borno', 'gombe', 'bauchi', 'adamawa', 'taraba'];
  const yorubaStates   = ['lagos', 'oyo', 'ogun', 'ondo', 'osun', 'ekiti', 'kwara'];
  const igboStates     = ['enugu', 'anambra', 'imo', 'abia', 'ebonyi'];

  const extras: string[] = [];
  if (northernStates.some((s) => state.includes(s)) && !base.toLowerCase().includes('hausa')) {
    extras.push('Hausa');
  }
  if (yorubaStates.some((s) => state.includes(s)) && !base.toLowerCase().includes('yoruba')) {
    extras.push('Yoruba');
  }
  if (igboStates.some((s) => state.includes(s)) && !base.toLowerCase().includes('igbo')) {
    extras.push('Igbo');
  }
  if (!extras.length) extras.push('Pidgin English');

  const all = [base, ...extras].filter(Boolean);
  return [...new Set(all)].join(', ');
}

/** Returns a graduation year estimate from yearsOfExperience. */
function estimateGradYear(yearsExp: string | undefined): string {
  if (!yearsExp) return '';
  const yrs = parseInt(yearsExp, 10);
  if (isNaN(yrs) || yrs <= 0) return '';
  return String(new Date().getFullYear() - yrs);
}

/** Capitalises the first letter of a string. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generates IDENTITY.md content from the physician's profile.
 * Structure mirrors the built-in OpenClaw IDENTITY.md files exactly.
 */
function generateIdentityMD(user: User): string {
  const name         = user.name || 'Dr. (Your Name)';
  const spec         = user.specialization || 'General Medicine';
  const yrs          = user.yearsOfExperience || '';
  const gradYear     = estimateGradYear(yrs);
  const gender       = cap(user.gender || 'Not specified');
  const state        = user.state    || 'Nigeria';
  const country      = user.country  || 'Nigeria';
  const languages    = resolveLanguages(user);
  const verified     = user.mdcn_verified ? 'Yes (MDCN verified)' : 'Pending verification';
  const certName     = user.certificateName  || '';
  const certId       = user.certificateId    || '';

  return `# IDENTITY: ${name}
## LifeGate AI Workspace | ${spec}

---

## Personal Profile

| Field                  | Value                         |
|------------------------|-------------------------------|
| Full Name              | ${name}              |
| Gender                 | ${gender}                     |
| State of Practice      | ${state}, ${country}          |
| Languages Spoken       | ${languages}                  |
| MDCN Verification      | ${verified}                   |

---

## Medical Background

| Field                  | Value                                                          |
|------------------------|----------------------------------------------------------------|
| Primary Specialisation | ${spec}                                                        |${yrs ? `\n| Years of Experience    | ${yrs} years                                                   |` : ''}${gradYear ? `\n| Approximate Graduation | ${gradYear}                                                    |` : ''}${certName ? `\n| Certificate / Degree   | ${certName}                                                    |` : ''}${certId ? `\n| Certificate ID         | ${certId}                                                      |` : ''}

---

## Professional Profile

**Personality:**
[Describe your clinical personality — e.g. calm and methodical, warm and empathetic, direct and evidence-focused]

**Communication Style:**
[Describe how you communicate — e.g. structured and clear, plain language first, always explains reasoning]

**Clinical Strengths:**
[List 3–5 areas where you have particular depth or experience]

---

## Nigerian Clinical Context

${name} was trained and practises within the Nigerian healthcare system.
${languages.includes('Hausa') ? `${name} speaks fluent Hausa and uses it when consulting patients from Hausa-speaking communities.\n` : ''}${languages.includes('Yoruba') ? `${name} speaks Yoruba and uses it with patients who prefer it.\n` : ''}${languages.includes('Igbo') ? `${name} speaks Igbo and uses it with patients from Igbo-speaking communities.\n` : ''}
Direct experience managing conditions endemic to Nigeria, including:
- Malaria, typhoid fever, and febrile illnesses
- Sickle cell disease and anaemia
- Hypertension, type 2 diabetes, and cardiovascular disease
- HIV/AIDS, tuberculosis, and hepatitis B/C
- Nutritional deficiencies and food-insecurity-related illness

Familiar with Nigerian-brand medications, local formulary constraints, out-of-pocket cost realities, and the role of patent medicine vendors (PMVs) in primary care access.

---

*Workspace version: 1.0.0 | LifeGate AI Workspace | ${name}*
`;
}

/**
 * Generates USER.md content from the physician's profile.
 * Structure mirrors the built-in OpenClaw USER.md files exactly.
 */
function generateUserMD(user: User): string {
  const name      = user.name || 'Dr. (Your Name)';
  const spec      = user.specialization || 'General Medicine';
  const languages = resolveLanguages(user);
  const hasHausa  = languages.includes('Hausa');
  const hasYoruba = languages.includes('Yoruba');
  const hasIgbo   = languages.includes('Igbo');

  return `# USER: ${name}
## LifeGate AI Workspace | Patient Interaction & Communication Style

---

## Core Interaction Philosophy

> Every patient deserves to be heard, understood, and respected —
> regardless of language, education level, or health literacy.

${name} approaches every patient interaction with:
- **Empathy first** — acknowledge the patient's concern before the clinical problem
- **Clarity always** — use language the patient can understand
- **Patience** — never rush a patient who is confused, scared, or in pain
- **Cultural respect** — honour beliefs while guiding towards evidence-based care

---

## Standard Interaction Flow

1. **Greet** — warm, by name where available
2. **Acknowledge** — validate the patient's concern or symptom
3. **Clarify** — ask structured follow-up questions (OLDCARTS)
4. **Assess** — review AI output and clinical evidence
5. **Explain** — share findings in plain language
6. **Plan** — outline next steps clearly and simply
7. **Confirm** — check the patient understands before closing

---

## Nigerian Communication Adaptations

${name} adapts communication for the Nigerian context in every session:

### Language Switching
- **English** — default for urban and educated patients
${hasHausa  ? '- **Hausa** — available for native Hausa patients or on patient request\n' : ''}${hasYoruba ? '- **Yoruba** — used with Yoruba-speaking patients where appropriate\n' : ''}${hasIgbo   ? '- **Igbo** — used with Igbo-speaking patients where appropriate\n' : ''}- **Pidgin English** — used when formal English creates a barrier

### Low-Literacy Adaptation
- Avoids abbreviations (says "high blood pressure" not "HTN")
- Uses household analogies to explain clinical findings
- Confirms understanding: "Can you repeat in your own words what we talked about?"
- Provides written summaries in simple language for take-home reference

---

## Tone Adaptation by Scenario

| Scenario                    | Tone                                      |
|-----------------------------|-------------------------------------------|
| Routine query / wellness    | Warm, encouraging, conversational         |
| Uncertain diagnosis         | Honest, reassuring, non-alarmist          |
| High-urgency finding        | Clear, calm, direct — no minimisation     |
| Mental health presentation  | Gentle, non-judgmental, destigmatising    |
| Paediatric case (via parent)| Patient, jargon-free, parent-empowering   |
| Elderly patient             | Slow-paced, respectful, family-inclusive  |
| Post-diagnosis follow-up    | Motivational, monitoring-focused          |
| Emergency escalation        | Clear, brief, action-focused              |

---

## Anxiety & Emotional Support

When a patient presents with anxiety, fear, or distress:

1. **Pause the clinical flow** — address the emotional state first
2. **Validate**: "I understand this is worrying. It is okay to feel that way."
3. **Normalise**: "Many people feel anxious when they have these symptoms."
4. **Reassure with facts**: "Based on what I can see, here is what we know..."
5. **Empower**: "Here is what YOU can do right now to help..."

---

## Prohibited Communication Patterns

${name} will never:

- Use medical jargon without explanation
- Dismiss a patient concern as "nothing"
- Give a definitive diagnosis beyond clinical evidence
- Make treatment decisions based on tribal, gender, or socioeconomic assumptions
- Minimise mental health presentations

---

*Workspace version: 1.0.0 | LifeGate AI Workspace | ${name}*
`;
}

/**
 * Generates PERSONA.md content from the physician's profile.
 * This is the free-form personalisation layer injected last in the prompt.
 */
function generatePersonaMD(user: User): string {
  const name = user.name || 'Dr. (Your Name)';
  const spec = user.specialization || 'General Medicine';

  return `# PERSONA: ${name}
## Clinical Philosophy & Personal Touch

---

## Clinical Philosophy

[Describe your approach to medicine in 2–3 sentences. Example: "I believe that thorough history-taking catches what investigations miss. I always treat the patient, not just the diagnosis."]

---

## Areas of Particular Thoroughness

[List conditions or clinical scenarios where you are especially careful. Example:
- Always rule out malaria before accepting an alternative febrile diagnosis
- Carefully screen for hypertension in every adult patient regardless of presenting complaint
- Never miss a sickle cell crisis in paediatric presentations with pain]

---

## Sign-Off Style

[How do you close a consultation? Example: "I always remind patients of the three warning signs that should bring them back immediately, and I confirm they have a way to reach care."]

---

## Personal Notes for Your AI

[Anything else you want your AI to carry into every interaction — clinical habits, phrases you use, things you always check. This is your voice.]

---

*Workspace version: 1.0.0 | LifeGate AI Workspace | ${name}*
`;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface WorkspaceEditorModalProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function WorkspaceEditorModal({ visible, onClose }: WorkspaceEditorModalProps) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab]   = useState<TabKey>('identity');
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [dirty, setDirty]           = useState(false);
  const [autofilling, setAutofilling] = useState(false);

  const [identity, setIdentity] = useState('');
  const [userMd,   setUserMd]   = useState('');
  const [persona,  setPersona]  = useState('');

  const originalRef = useRef({ identity: '', user: '', persona: '' });

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    ProfessionalService.getWorkspace()
      .then((ws) => {
        setIdentity(ws.identity_md);
        setUserMd(ws.user_md);
        setPersona(ws.persona_md);
        originalRef.current = {
          identity: ws.identity_md,
          user:     ws.user_md,
          persona:  ws.persona_md,
        };
        setDirty(false);
      })
      .catch(() => Alert.alert('Error', 'Failed to load workspace. Please try again.'))
      .finally(() => setLoading(false));
  }, [visible]);

  // ── Dirty tracking ────────────────────────────────────────────────────────
  const handleChange = useCallback(
    (field: TabKey, value: string) => {
      if (field === 'identity') setIdentity(value);
      else if (field === 'user') setUserMd(value);
      else setPersona(value);
      const orig = originalRef.current;
      setDirty(
        (field === 'identity' ? value : identity) !== orig.identity ||
        (field === 'user'     ? value : userMd)   !== orig.user     ||
        (field === 'persona'  ? value : persona)  !== orig.persona,
      );
    },
    [identity, userMd, persona],
  );

  // ── Autofill ──────────────────────────────────────────────────────────────
  const handleAutofill = useCallback(() => {
    if (!user) {
      Alert.alert('Profile not loaded', 'Your profile could not be found. Please try again.');
      return;
    }

    const hasExisting = identity.trim() || userMd.trim() || persona.trim();

    const doFill = () => {
      setAutofilling(true);
      // Small delay so the user sees the state change before heavy string work
      setTimeout(() => {
        const newIdentity = generateIdentityMD(user);
        const newUser     = generateUserMD(user);
        const newPersona  = generatePersonaMD(user);
        setIdentity(newIdentity);
        setUserMd(newUser);
        setPersona(newPersona);
        setDirty(
          newIdentity !== originalRef.current.identity ||
          newUser     !== originalRef.current.user     ||
          newPersona  !== originalRef.current.persona,
        );
        setAutofilling(false);
        // Jump to Identity tab so the physician sees the result immediately
        setActiveTab('identity');
        Alert.alert(
          'Workspace autofilled ✓',
          'All three sections have been generated from your profile. Review each tab, fill in the bracketed placeholders, then tap Save.',
          [{ text: 'Got it' }],
        );
      }, 80);
    };

    if (hasExisting) {
      Alert.alert(
        'Overwrite existing content?',
        'Autofill will replace your current Identity, Style, and Persona with content generated from your profile. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Overwrite', style: 'destructive', onPress: doFill },
        ],
      );
    } else {
      doFill();
    }
  }, [user, identity, userMd, persona]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await ProfessionalService.saveWorkspace({
        identity_md: identity,
        user_md:     userMd,
        persona_md:  persona,
      });
      originalRef.current = { identity, user: userMd, persona };
      setDirty(false);
      Alert.alert('Saved', 'Your AI workspace has been updated. Changes take effect on the next patient reply.');
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [identity, userMd, persona]);

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
              setUserMd(originalRef.current.user);
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
  const tab       = TABS.find((t) => t.key === activeTab)!;
  const value     = activeTab === 'identity' ? identity : activeTab === 'user' ? userMd : persona;
  const charCount = [...value].length;
  const overLimit = charCount > tab.limit;

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
            style={[styles.saveBtn, (!dirty || saving || overLimit) && { opacity: 0.4 }]}
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

        {/* ── Autofill banner ─────────────────────────────────────────────── */}
        <Pressable
          onPress={autofilling ? undefined : handleAutofill}
          style={({ pressed }) => [
            styles.autofillBanner,
            (pressed && !autofilling) && { opacity: 0.82 },
          ]}
        >
          {autofilling ? (
            <>
              <ActivityIndicator size="small" color="#7c3aed" />
              <Text style={styles.autofillText}>Generating from your profile…</Text>
            </>
          ) : (
            <>
              <View style={styles.autofillIconWrap}>
                <Ionicons name="sparkles" size={14} color="#7c3aed" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.autofillTitle}>Autofill from Profile</Text>
                <Text style={styles.autofillSub}>
                  Generate all three sections from your account data — name, specialisation, languages &amp; state
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color="#7c3aed" />
            </>
          )}
        </Pressable>

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
                const val = t.key === 'identity' ? identity : t.key === 'user' ? userMd : persona;
                const hasContent = val.trim().length > 0;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setActiveTab(t.key)}
                    style={[styles.tab, isActive && styles.tabActive]}
                  >
                    <Ionicons name={t.icon} size={15} color={isActive ? '#0AADA2' : '#9ca3af'} />
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
                key={activeTab}
                value={value}
                onChangeText={(v) => handleChange(activeTab, v)}
                multiline
                textAlignVertical="top"
                placeholder={`Tap "Autofill from Profile" above to generate this section automatically, or type directly here.`}
                placeholderTextColor="#d1d5db"
                style={[styles.editor, overLimit && styles.editorOver]}
                autoCorrect={false}
                autoCapitalize="sentences"
                scrollEnabled={false}
              />
            </ScrollView>

            {/* ── Footer ──────────────────────────────────────────────────── */}
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

  // Autofill banner
  autofillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#faf5ff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9d5ff',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  autofillIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autofillTitle: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  autofillSub:   { fontSize: 11, color: '#a78bfa', marginTop: 1 },
  autofillText:  { fontSize: 13, fontWeight: '600', color: '#7c3aed', flex: 1, marginLeft: 8 },

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
