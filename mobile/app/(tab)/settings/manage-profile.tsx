import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

const TEAL = '#0EA5A4';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENOTYPES = ['AA', 'AS', 'SS', 'SC', 'AC', 'CC'];
const COMMON_ALLERGIES = ['Penicillin', 'Sulfa drugs', 'NSAIDs', 'Seafood', 'Peanuts'];
const COMMON_MEDICATIONS = ['Metformin', 'Lisinopril', 'Amlodipine', 'Atorvastatin'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View className="flex-row items-center gap-2 mb-3">
      <Ionicons name={icon} size={18} color={TEAL} />
      <Text className="text-base font-bold text-gray-900">{title}</Text>
    </View>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View className="mb-1">
      <Text className="text-sm font-semibold text-gray-700">{label}</Text>
      {hint ? <Text className="text-xs text-gray-400 mt-0.5">{hint}</Text> : null}
    </View>
  );
}

function FocusableInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  numberOfLines,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  accessibilityLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical={multiline ? 'top' : 'center'}
      accessibilityLabel={accessibilityLabel}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        borderWidth: focused ? 1.5 : 1,
        borderColor: focused ? TEAL : '#e5e7eb',
        borderRadius: 10,
        paddingHorizontal: 13,
        paddingVertical: 11,
        fontSize: 14,
        color: '#111827',
        backgroundColor: focused ? '#f0fffe' : '#f9fafb',
        marginTop: 6,
        marginBottom: 16,
        minHeight: multiline ? (numberOfLines ?? 3) * 24 + 22 : undefined,
      }}
    />
  );
}

function QuickFillRow({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: string[];
  onSelect: (value: string) => void;
}) {
  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</Text>
      <View className="flex-row flex-wrap gap-2">
        {items.map((item) => (
          <Pressable
            key={item}
            onPress={() => onSelect(item)}
            className="px-3 py-1.5 rounded-full border border-[#D1F2EF] bg-[#F0FFFE] active:opacity-80"
          >
            <Text className="text-xs font-semibold text-[#0B8E8D]">{item}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Progress bar showing how complete the health profile is ─────────────────

function ProfileCompleteness({
  bloodType,
  genotype,
  allergies,
  medicalHistory,
  medications,
  emergency,
}: {
  bloodType: string;
  genotype: string;
  allergies: string;
  medicalHistory: string;
  medications: string;
  emergency: string;
}) {
  const fields = [bloodType, genotype, allergies, medicalHistory, medications, emergency];
  const filled = fields.filter((f) => f.trim().length > 0).length;
  const pct = Math.round((filled / fields.length) * 100);

  const color = pct === 100 ? '#16a34a' : pct >= 60 ? TEAL : '#f59e0b';
  const label = pct === 100 ? 'Complete' : pct >= 60 ? 'Good' : 'Incomplete';

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Ionicons name="pulse-outline" size={16} color={color} />
          <Text className="text-sm font-bold text-gray-900">Profile Completeness</Text>
        </View>
        <View style={{ backgroundColor: color + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label} · {pct}%</Text>
        </View>
      </View>
      <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 99 }} />
      </View>
      {pct < 100 ? (
        <Text className="text-xs text-gray-400 mt-2">
          A complete profile helps the AI give you safer, more personalised care.
        </Text>
      ) : (
        <Text className="text-xs text-green-600 mt-2 font-medium">
          Your health profile is complete. The AI is fully context-aware.
        </Text>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ManageProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const { loading, error, updateHealthProfile, getProfile, clearError } = useProfileStore();

  const [bloodType, setBloodType] = useState(user?.blood_type ?? '');
  const [genotype, setGenotype] = useState(user?.genotype ?? '');
  const [allergies, setAllergies] = useState(user?.allergies ?? '');
  const [medicalHistory, setMedicalHistory] = useState(user?.medical_history ?? '');
  const [currentMedications, setCurrentMedications] = useState(user?.current_medications ?? '');
  const [emergencyContact, setEmergencyContact] = useState(user?.emergency_contact ?? '');
  const [refreshing, setRefreshing] = useState(false);

  // Track whether the user has made any changes
  const isDirty =
    (bloodType ?? '') !== (user?.blood_type ?? '') ||
    (genotype ?? '') !== (user?.genotype ?? '') ||
    (allergies ?? '') !== (user?.allergies ?? '') ||
    (medicalHistory ?? '') !== (user?.medical_history ?? '') ||
    (currentMedications ?? '') !== (user?.current_medications ?? '') ||
    (emergencyContact ?? '') !== (user?.emergency_contact ?? '');

  // Sync form whenever the auth store user updates (e.g. after save)
  useEffect(() => {
    setBloodType(user?.blood_type ?? '');
    setGenotype(user?.genotype ?? '');
    setAllergies(user?.allergies ?? '');
    setMedicalHistory(user?.medical_history ?? '');
    setCurrentMedications(user?.current_medications ?? '');
    setEmergencyContact(user?.emergency_contact ?? '');
  }, [user]);

  useEffect(() => {
    getProfile();
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await getProfile();
    setRefreshing(false);
  }, [getProfile]);

  const handleSave = async () => {
    clearError();
    const ok = await updateHealthProfile({
      blood_type: bloodType.trim() || null,
      genotype: genotype.trim() || null,
      allergies: allergies.trim() || null,
      medical_history: medicalHistory.trim() || null,
      current_medications: currentMedications.trim() || null,
      emergency_contact: emergencyContact.trim() || null,
    });
    if (ok) {
      Alert.alert('Saved', 'Your health profile has been updated.');
    }
  };

  const summaryFields = [
    { label: 'Blood Type', value: bloodType.trim() },
    { label: 'Genotype', value: genotype.trim() },
    { label: 'Allergies', value: allergies.trim() },
    { label: 'Medical History', value: medicalHistory.trim() },
    { label: 'Current Medications', value: currentMedications.trim() },
    { label: 'Emergency Contact', value: emergencyContact.trim() },
  ];
  const missingSummary = summaryFields.filter((item) => !item.value).map((item) => item.label);

  const appendWithComma = (current: string, next: string) => {
    const normalized = current
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    if (normalized.includes(next.toLowerCase())) return current;
    return current.trim() ? `${current.trim()}, ${next}` : next;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F0F8F8' }}>
    <SafeAreaView className="flex-1 bg-[#F0F8F8]" edges={['top']}>
      {/* ── Header ── */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-3 bg-[#F0F8F8]">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color="#1A1A2E" />
        </Pressable>
        <Text className="flex-1 text-center text-xl font-bold text-gray-900">Health Profile</Text>
        <View style={{ width: 30 }} />
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1 px-4 pt-2"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={TEAL} />}
          keyboardShouldPersistTaps="handled"
        >
          <View className="rounded-2xl mb-4 px-4 py-4 bg-white border border-[#D7ECEB]">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-2">
                <Ionicons name="shield-checkmark-outline" size={16} color={TEAL} />
                <Text className="text-sm font-bold text-gray-900">Health Readiness</Text>
              </View>
              <View className={`px-2.5 py-1 rounded-full ${isDirty ? 'bg-[#FEF3C7]' : 'bg-[#DCFCE7]'}`}>
                <Text className={`text-xs font-bold ${isDirty ? 'text-[#92400E]' : 'text-[#166534]'}`}>
                  {isDirty ? 'Unsaved changes' : 'Synced'}
                </Text>
              </View>
            </View>
            <Text className="text-sm text-gray-600 leading-5">
              {missingSummary.length === 0
                ? 'Your health profile is complete and ready for safer AI-assisted consultations.'
                : `${missingSummary.length} key section${missingSummary.length > 1 ? 's are' : ' is'} still missing: ${missingSummary.slice(0, 2).join(', ')}${missingSummary.length > 2 ? '...' : ''}.`}
            </Text>
          </View>

          {/* AI context banner */}
          <View className="rounded-2xl mb-4 px-4 py-3 flex-row items-center gap-3" style={{ backgroundColor: '#f0fffe', borderWidth: 1, borderColor: '#99f6e4' }}>
            <Ionicons name="sparkles" size={18} color={TEAL} />
            <Text className="flex-1 text-xs text-gray-600 leading-5">
              This information is securely passed to the AI before every consultation — enabling safer prescriptions and more accurate diagnoses.
            </Text>
          </View>

          {/* Completeness indicator */}
          <ProfileCompleteness
            bloodType={bloodType}
            genotype={genotype}
            allergies={allergies}
            medicalHistory={medicalHistory}
            medications={currentMedications}
            emergency={emergencyContact}
          />

          {/* ── Blood Type & Genotype ── */}
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <SectionHeader icon="water-outline" title="Blood Type & Genotype" />

            <FieldLabel label="Blood Type" hint="Used by the AI for transfusion flags and drug risk assessments." />
            <View className="flex-row flex-wrap gap-2 mt-2 mb-4">
              {BLOOD_TYPES.map((bt) => {
                const active = bloodType === bt;
                return (
                  <Pressable
                    key={bt}
                    onPress={() => setBloodType(active ? '' : bt)}
                    accessibilityLabel={`Blood type ${bt}${active ? ', selected' : ''}`}
                    accessibilityRole="radio"
                    style={{
                      paddingHorizontal: 18,
                      paddingVertical: 9,
                      borderRadius: 99,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? TEAL : '#e5e7eb',
                      backgroundColor: active ? '#f0fffe' : '#f9fafb',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: active ? TEAL : '#374151' }}>{bt}</Text>
                  </Pressable>
                );
              })}
            </View>
            {bloodType === '' && (
              <Text className="text-xs text-amber-500 mb-3 font-medium">⚠ No blood type selected</Text>
            )}

            <FieldLabel label="Genotype" hint="Critical for sickle-cell risk assessment and compatibility checks." />
            <View className="flex-row flex-wrap gap-2 mt-2">
              {GENOTYPES.map((gt) => {
                const active = genotype === gt;
                const isSickle = gt === 'SS' || gt === 'SC' || gt === 'CC';
                const activeColor = isSickle ? '#dc2626' : TEAL;
                return (
                  <Pressable
                    key={gt}
                    onPress={() => setGenotype(active ? '' : gt)}
                    accessibilityLabel={`Genotype ${gt}${active ? ', selected' : ''}`}
                    accessibilityRole="radio"
                    style={{
                      paddingHorizontal: 18,
                      paddingVertical: 9,
                      borderRadius: 99,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? activeColor : '#e5e7eb',
                      backgroundColor: active ? (isSickle ? '#fef2f2' : '#f0fffe') : '#f9fafb',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: active ? activeColor : '#374151' }}>{gt}</Text>
                  </Pressable>
                );
              })}
            </View>
            {(genotype === 'SS' || genotype === 'SC' || genotype === 'CC') && (
              <View className="flex-row items-center gap-1.5 mt-3 bg-red-50 rounded-xl px-3 py-2">
                <Ionicons name="warning-outline" size={14} color="#dc2626" />
                <Text className="text-xs text-red-600 font-medium flex-1">
                  Sickle-cell genotype detected — the AI will always factor this into risk assessments and urgency.
                </Text>
              </View>
            )}
            {genotype === '' && (
              <Text className="text-xs text-amber-500 mt-3 font-medium">⚠ No genotype selected</Text>
            )}
          </View>

          {/* ── Health Details ── */}
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <SectionHeader icon="medkit-outline" title="Health Details" />

            <FieldLabel
              label="Known Allergies"
              hint="The AI will never prescribe anything you are allergic to."
            />
            <FocusableInput
              value={allergies}
              onChangeText={setAllergies}
              placeholder="e.g. Penicillin, sulfa drugs, peanuts…"
              multiline
              numberOfLines={2}
              accessibilityLabel="Known allergies"
            />
            <QuickFillRow
              title="Quick add"
              items={COMMON_ALLERGIES}
              onSelect={(value) => setAllergies((prev) => appendWithComma(prev, value))}
            />

            <FieldLabel
              label="Medical History"
              hint="Past & current conditions — helps sharpen diagnosis accuracy."
            />
            <FocusableInput
              value={medicalHistory}
              onChangeText={setMedicalHistory}
              placeholder="e.g. Hypertension, Type 2 Diabetes, Asthma…"
              multiline
              numberOfLines={3}
              accessibilityLabel="Medical history"
            />

            <FieldLabel
              label="Current Medications"
              hint="The AI checks for drug interactions before making any suggestions."
            />
            <FocusableInput
              value={currentMedications}
              onChangeText={setCurrentMedications}
              placeholder="e.g. Metformin 500mg BD, Lisinopril 10mg OD…"
              multiline
              numberOfLines={2}
              accessibilityLabel="Current medications"
            />
            <QuickFillRow
              title="Common medications"
              items={COMMON_MEDICATIONS}
              onSelect={(value) => setCurrentMedications((prev) => appendWithComma(prev, value))}
            />
          </View>

          {/* ── Emergency Contact ── */}
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <SectionHeader icon="call-outline" title="Emergency Contact" />
            <FieldLabel label="Name & Phone Number" hint="Surfaced to the physician if your case is escalated to CRITICAL." />
            <FocusableInput
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              placeholder="e.g. Jane Doe · 08012345678"
              accessibilityLabel="Emergency contact"
            />
          </View>

          {/* ── Error banner ── */}
          {error ? (
            <View className="mx-0 mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 flex-row items-center gap-2">
              <Ionicons name="warning-outline" size={16} color="#dc2626" />
              <Text className="text-sm text-red-700 flex-1">{error}</Text>
              <Pressable onPress={clearError}>
                <Ionicons name="close" size={16} color="#dc2626" />
              </Pressable>
            </View>
          ) : null}

          {/* ── Save button ── */}
          <Pressable
            onPress={handleSave}
            disabled={loading || !isDirty}
            accessibilityLabel="Save health profile"
            accessibilityRole="button"
            className={`rounded-2xl py-4 flex-row items-center justify-center gap-2 ${
              loading || !isDirty ? 'opacity-50' : ''
            }`}
            style={{ backgroundColor: TEAL }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
            )}
            <Text className="text-base font-bold text-white">
              {loading ? 'Saving…' : isDirty ? 'Save Changes' : 'No Changes'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}
