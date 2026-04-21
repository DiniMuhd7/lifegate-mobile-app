import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfessionalStore } from '../../stores/professional-store';
import { ProfessionalService } from '../../services/professional-service';
import { ConfidenceBar } from '../../components/ConfidenceBar';
import { CaseUrgency, InvestigationInfo, ConditionScore, RiskFlag, HPIInfo } from '../../types/professional-types';
import { extractErrorMessage } from '../../utils/error-utils';

// ─── Constants ───────────────────────────────────────────────────────────────

type ReviewMode = 'view' | 'edit' | 'approve' | 'reject';

const URGENCY_COLORS: Record<CaseUrgency, string> = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

const URGENCY_BG: Record<CaseUrgency, string> = {
  LOW: '#dcfce7',
  MEDIUM: '#fef9c3',
  HIGH: '#ffedd5',
  CRITICAL: '#fee2e2',
};

const URGENCY_OPTIONS: CaseUrgency[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const INV_URGENCY_COLORS: Record<string, string> = {
  ROUTINE: '#10b981',
  URGENT: '#f59e0b',
  STAT: '#ef4444',
};

const INV_URGENCY_BG: Record<string, string> = {
  ROUTINE: '#d1fae5',
  URGENT: '#fef3c7',
  STAT: '#fee2e2',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl mx-4 mb-3 p-4" style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 }}>
      <Text className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View className="flex-row mb-2">
      <Text className="text-xs text-gray-500 w-32 flex-shrink-0">{label}</Text>
      <Text className="text-xs text-gray-800 flex-1" numberOfLines={4}>{value}</Text>
    </View>
  );
}

function UrgencyBadge({ urgency }: { urgency: CaseUrgency }) {
  return (
    <View
      className="px-3 py-1 rounded-full self-start"
      style={{ backgroundColor: URGENCY_BG[urgency] }}
    >
      <Text className="text-xs font-bold" style={{ color: URGENCY_COLORS[urgency] }}>
        {urgency}
      </Text>
    </View>
  );
}

const RISK_SEVERITY_COLOR: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444',
};
const RISK_SEVERITY_BG: Record<string, string> = {
  LOW: '#dcfce7', MEDIUM: '#fef9c3', HIGH: '#ffedd5', CRITICAL: '#fee2e2',
};

function ConditionsSection({ conditions }: { conditions: ConditionScore[] }) {
  if (!conditions || conditions.length === 0) return null;
  return (
    <SectionCard title="Differential Diagnosis">
      {conditions.map((c, i) => (
        <View key={i} className="mb-3 last:mb-0">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-sm font-semibold text-gray-800 flex-1 mr-2" numberOfLines={1}>
              {c.condition}
            </Text>
            <Text className="text-xs font-bold text-teal-700">{c.confidence}%</Text>
          </View>
          <ConfidenceBar confidence={c.confidence} />
          {c.description ? (
            <Text className="text-xs text-gray-500 mt-1 leading-4">{c.description}</Text>
          ) : null}
        </View>
      ))}
    </SectionCard>
  );
}

function RiskFlagsSection({ flags }: { flags: RiskFlag[] }) {
  if (!flags || flags.length === 0) return null;
  return (
    <SectionCard title="Risk Flags">
      {flags.map((f, i) => (
        <View
          key={i}
          className="flex-row items-start gap-2 mb-2 p-2.5 rounded-xl"
          style={{ backgroundColor: RISK_SEVERITY_BG[f.severity] ?? '#f3f4f6' }}
        >
          <Ionicons name="warning" size={14} color={RISK_SEVERITY_COLOR[f.severity] ?? '#374151'} style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text className="text-xs font-bold" style={{ color: RISK_SEVERITY_COLOR[f.severity] ?? '#374151' }}>
              {f.flag.replace(/_/g, ' ')}
            </Text>
            {f.description ? (
              <Text className="text-xs text-gray-600 mt-0.5 leading-4">{f.description}</Text>
            ) : null}
          </View>
          <View
            className="px-2 py-0.5 rounded-full self-start"
            style={{ backgroundColor: RISK_SEVERITY_COLOR[f.severity] ?? '#6b7280' }}
          >
            <Text className="text-xs font-bold text-white">{f.severity}</Text>
          </View>
        </View>
      ))}
    </SectionCard>
  );
}

function HPISection({ hpi }: { hpi: HPIInfo }) {
  const rows: { label: string; value?: string | number }[] = [
    { label: 'Onset', value: hpi.onset },
    { label: 'Duration', value: hpi.duration },
    { label: 'Severity (0-10)', value: hpi.severityScore !== undefined ? String(hpi.severityScore) : undefined },
    { label: 'Location', value: hpi.location },
    { label: 'Character', value: hpi.character },
  ].filter(r => r.value !== undefined && r.value !== '' && r.value !== null);
  if (rows.length === 0) return null;
  return (
    <SectionCard title="History of Present Illness">
      {rows.map((r, i) => (
        <InfoRow key={i} label={r.label} value={String(r.value)} />
      ))}
    </SectionCard>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CaseReviewScreen() {
  const router = useRouter();
  const { caseId } = useLocalSearchParams<{ caseId: string }>();

  const {
    currentCase,
    currentPatient,
    isCaseLoading,
    caseLoadError,
    loadCaseDetail,
    updateLocalAIOutput,
    clearCurrentCase,
    updateCaseStatus,
    takeCase,
  } = useProfessionalStore();

  // Review mode state
  const [mode, setMode] = useState<ReviewMode>('view');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit mode state
  const [editCondition, setEditCondition] = useState('');
  const [editUrgency, setEditUrgency] = useState<CaseUrgency>('LOW');
  const [editConfidence, setEditConfidence] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editMedicine, setEditMedicine] = useState('');
  const [editDosage, setEditDosage] = useState('');
  const [editFrequency, setEditFrequency] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editMedInstructions, setEditMedInstructions] = useState('');
  const [editInvestigations, setEditInvestigations] = useState<InvestigationInfo[]>([]);

  // Approve / Reject state
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Load data on mount
  useEffect(() => {
    if (!caseId) return;
    loadCaseDetail(caseId);
    return () => clearCurrentCase();
  }, [caseId]);

  // Sync edit state when case is loaded
  useEffect(() => {
    if (!currentCase) return;
    setEditCondition(currentCase.condition || currentCase.aiResponse?.diagnosis?.condition || '');
    setEditUrgency((currentCase.urgency as CaseUrgency) || 'LOW');
    setEditConfidence(currentCase.aiResponse?.diagnosis?.confidence ?? 0);
    setEditNotes(currentCase.physicianNotes || '');
    const rx = currentCase.physicianOutput?.prescription ?? currentCase.aiResponse?.prescription;
    setEditMedicine(rx?.medicine || '');
    setEditDosage(rx?.dosage || '');
    setEditFrequency(rx?.frequency || '');
    setEditDuration(rx?.duration || '');
    setEditMedInstructions(rx?.instructions || '');
    setEditInvestigations(
      currentCase.physicianOutput?.investigations ??
      currentCase.aiResponse?.investigations ??
      []
    );
  }, [currentCase]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSaveEdit = useCallback(async () => {
    if (!caseId || !editCondition.trim()) {
      Alert.alert('Validation', 'Condition name cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    try {
      const prescription = editMedicine.trim()
        ? {
            medicine: editMedicine.trim(),
            dosage: editDosage.trim(),
            frequency: editFrequency.trim(),
            duration: editDuration.trim(),
            instructions: editMedInstructions.trim(),
          }
        : undefined;
      const investigations = editInvestigations.filter(i => i.test.trim());
      await ProfessionalService.updateAIOutput(
        caseId,
        editCondition.trim(),
        editUrgency,
        editConfidence,
        editNotes.trim(),
        prescription,
        investigations.length > 0 ? investigations : undefined,
      );
      updateLocalAIOutput(
        editCondition.trim(),
        editUrgency,
        editConfidence,
        editNotes.trim(),
        prescription,
        investigations,
      );
      setMode('view');
      Alert.alert('Saved', 'Your changes have been saved successfully.');
    } catch (err: any) {
      Alert.alert('Error', extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, editCondition, editUrgency, editConfidence, editNotes, editMedicine, editDosage, editFrequency, editDuration, editMedInstructions, editInvestigations, updateLocalAIOutput]);

  const addInvestigation = useCallback(() => {
    setEditInvestigations(prev => [...prev, { test: '', reason: '', urgency: 'ROUTINE' }]);
  }, []);

  const removeInvestigation = useCallback((idx: number) => {
    setEditInvestigations(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateInvestigation = useCallback((idx: number, field: keyof InvestigationInfo, value: string) => {
    setEditInvestigations(prev =>
      prev.map((inv, i) => (i === idx ? { ...inv, [field]: value } : inv))
    );
  }, []);

  const handleTakeCase = useCallback(async () => {
    if (!caseId) return;
    setIsSubmitting(true);
    try {
      await takeCase(caseId);
      updateCaseStatus(caseId, 'Active');
      Alert.alert('Case Assigned', 'You have taken this case. You can now review and submit a decision.');
    } catch (err: any) {
      Alert.alert('Error', extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, takeCase, updateCaseStatus]);

  const handleApprove = useCallback(async () => {    if (!caseId) return;
    setIsSubmitting(true);
    try {
      await ProfessionalService.approveCase(caseId, notes);
      updateCaseStatus(caseId, 'Completed');
      Alert.alert('Case Approved', 'The case has been successfully approved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, notes, updateCaseStatus, router]);

  const handleReject = useCallback(async () => {
    if (!caseId) return;
    if (!rejectionReason.trim()) {
      Alert.alert('Required', 'A rejection reason is required before submitting.');
      return;
    }
    setIsSubmitting(true);
    try {
      await ProfessionalService.rejectCase(caseId, rejectionReason.trim(), notes);
      updateCaseStatus(caseId, 'Completed');
      Alert.alert('Case Rejected', 'The case has been rejected with your notes.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, rejectionReason, notes, updateCaseStatus, router]);

  // ── Loading / error states ──────────────────────────────────────────────

  if (isCaseLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-500 mt-3 text-sm">Loading case…</Text>
      </SafeAreaView>
    );
  }

  if (!currentCase) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text className="text-gray-800 font-bold text-base mt-4 text-center">
          {caseLoadError ?? 'Case not found'}
        </Text>
        <Text className="text-gray-500 text-sm mt-2 text-center">
          The case may have been reassigned or is no longer available.
        </Text>
        <TouchableOpacity
          onPress={() => caseId && loadCaseDetail(caseId)}
          className="mt-6 px-6 py-3 rounded-xl bg-blue-600"
        >
          <Text className="text-white font-semibold text-sm">Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} className="mt-3">
          <Text className="text-gray-500 text-sm">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const ai = currentCase.aiResponse;
  const diagnosis = ai?.diagnosis;
  const prescription = ai?.prescription;
  const urgency = (currentCase.urgency as CaseUrgency) || 'LOW';
  const isCompleted = currentCase.status === 'Completed';

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView className="flex-1 bg-gray-50">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <LinearGradient
          colors={['#1e3a5f', '#0f2440']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="px-4 pt-3 pb-4"
        >
          <View className="flex-row items-center mb-3">
            <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 mr-2">
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-white text-lg font-bold" numberOfLines={1}>
                {currentCase.title || 'Case Review'}
              </Text>
              <Text className="text-white/60 text-xs mt-0.5">
                {currentCase.patientName} · {currentCase.id.slice(0, 8).toUpperCase()}
              </Text>
            </View>
            <UrgencyBadge urgency={urgency} />
          </View>

          {/* Status row */}
          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center bg-white/10 rounded-full px-3 py-1">
              <View
                className="w-2 h-2 rounded-full mr-2"
                style={{
                  backgroundColor:
                    currentCase.status === 'Active'
                      ? '#60a5fa'
                      : currentCase.status === 'Pending'
                      ? '#a78bfa'
                      : '#4ade80',
                }}
              />
              <Text className="text-white text-xs font-semibold">{currentCase.status}</Text>
            </View>
            {currentCase.escalated && (
              <View className="flex-row items-center bg-red-500/20 rounded-full px-3 py-1">
                <Ionicons name="alert-circle" size={12} color="#fca5a5" />
                <Text className="text-red-300 text-xs font-semibold ml-1">Escalated</Text>
              </View>
            )}
            {currentCase.physicianDecision && (
              <View
                className="flex-row items-center rounded-full px-3 py-1"
                style={{
                  backgroundColor:
                    currentCase.physicianDecision === 'Approved'
                      ? 'rgba(34,197,94,0.2)'
                      : 'rgba(239,68,68,0.2)',
                }}
              >
                <Ionicons
                  name={currentCase.physicianDecision === 'Approved' ? 'checkmark-circle' : 'close-circle'}
                  size={12}
                  color={currentCase.physicianDecision === 'Approved' ? '#4ade80' : '#f87171'}
                />
                <Text
                  className="text-xs font-semibold ml-1"
                  style={{ color: currentCase.physicianDecision === 'Approved' ? '#4ade80' : '#f87171' }}
                >
                  {currentCase.physicianDecision}
                </Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* ── Scrollable content ─────────────────────────────────────── */}
        <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 12, paddingBottom: 20 }}>

          {/* ── AI Analysis ─────────────────────────────────────────── */}
          <SectionCard title="AI Analysis">
            {mode === 'edit' ? (
              /* Edit mode — inline fields */
              <View>
                <Text className="text-xs text-gray-500 mb-1">Condition</Text>
                <TextInput
                  className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 mb-3 bg-blue-50"
                  value={editCondition}
                  onChangeText={setEditCondition}
                  placeholder="Condition name"
                />

                <Text className="text-xs text-gray-500 mb-1.5">Urgency</Text>
                <View className="flex-row flex-wrap gap-2 mb-3">
                  {URGENCY_OPTIONS.map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setEditUrgency(u)}
                      className="px-4 py-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          editUrgency === u ? URGENCY_COLORS[u] : URGENCY_BG[u],
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: editUrgency === u ? '#fff' : URGENCY_COLORS[u] }}
                      >
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text className="text-xs text-gray-500 mb-1">
                  Confidence score (0–100)
                </Text>
                <View className="flex-row items-center gap-3 mb-1">
                  <TextInput
                    className="border border-blue-300 rounded-xl px-3 py-2 text-center text-lg font-bold w-20 bg-blue-50"
                    value={String(editConfidence)}
                    onChangeText={(t) =>
                      setEditConfidence(Math.min(100, Math.max(0, parseInt(t) || 0)))
                    }
                    keyboardType="numeric"
                    maxLength={3}
                  />
                  <View className="flex-1">
                    <ConfidenceBar confidence={editConfidence} />
                  </View>
                </View>

                {diagnosis?.description ? (
                  <>
                    <Text className="text-xs text-gray-500 mb-1 mt-2">AI Description</Text>
                    <Text className="text-xs text-gray-700 leading-5">{diagnosis.description}</Text>
                  </>
                ) : null}
              </View>
            ) : (
              /* View mode */
              <View>
                <View className="flex-row items-start justify-between mb-3">
                  <View className="flex-1 mr-3">
                    <Text className="text-base font-bold text-gray-900 mb-1">
                      {currentCase.condition || diagnosis?.condition || '—'}
                    </Text>
                    <UrgencyBadge urgency={urgency} />
                  </View>
                </View>

                {/* Confidence bar */}
                <View className="mb-3">
                  <ConfidenceBar confidence={diagnosis?.confidence ?? 0} />
                </View>

                {/* AI text description */}
                {diagnosis?.description ? (
                  <View className="bg-gray-50 rounded-xl p-3">
                    <Text className="text-xs text-gray-600 leading-5">{diagnosis.description}</Text>
                  </View>
                ) : null}

                {/* AI narrative text */}
                {ai?.text ? (
                  <View className="mt-3 bg-blue-50 rounded-xl p-3">
                    <Text className="text-xs text-blue-800 leading-5 font-medium mb-1">
                      AI Narrative
                    </Text>
                    <Text className="text-xs text-blue-700 leading-5">{ai.text}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </SectionCard>

          {/* ── Edit-mode: Clinical Notes ────────────────────────── */}
          {mode === 'edit' && (
            <SectionCard title="Clinical Notes">
              <TextInput
                className="border border-blue-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-blue-50"
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Enter clinical notes, observations, or recommendations…"
                placeholderTextColor="#93c5fd"
                multiline
                numberOfLines={4}
                style={{ minHeight: 88, textAlignVertical: 'top' }}
              />
            </SectionCard>
          )}

          {/* ── Edit-mode: Recommended Medication ───────────────────── */}
          {mode === 'edit' && (
            <SectionCard title="Recommended Medication">
              <Text className="text-xs text-gray-400 mb-3">Leave blank if no medication is needed.</Text>
              <Text className="text-xs text-gray-500 mb-1">Medicine / Drug name</Text>
              <TextInput
                className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 mb-3 bg-blue-50"
                value={editMedicine}
                onChangeText={setEditMedicine}
                placeholder="e.g. Amoxicillin 500mg"
                placeholderTextColor="#93c5fd"
              />
              <View className="flex-row gap-2 mb-3">
                <View className="flex-1">
                  <Text className="text-xs text-gray-500 mb-1">Dosage</Text>
                  <TextInput
                    className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 bg-blue-50"
                    value={editDosage}
                    onChangeText={setEditDosage}
                    placeholder="e.g. 1 tablet"
                    placeholderTextColor="#93c5fd"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-gray-500 mb-1">Frequency</Text>
                  <TextInput
                    className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 bg-blue-50"
                    value={editFrequency}
                    onChangeText={setEditFrequency}
                    placeholder="e.g. 3× daily"
                    placeholderTextColor="#93c5fd"
                  />
                </View>
              </View>
              <Text className="text-xs text-gray-500 mb-1">Duration</Text>
              <TextInput
                className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 mb-3 bg-blue-50"
                value={editDuration}
                onChangeText={setEditDuration}
                placeholder="e.g. 7 days"
                placeholderTextColor="#93c5fd"
              />
              <Text className="text-xs text-gray-500 mb-1">Instructions (optional)</Text>
              <TextInput
                className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 bg-blue-50"
                value={editMedInstructions}
                onChangeText={setEditMedInstructions}
                placeholder="e.g. Take after meals"
                placeholderTextColor="#93c5fd"
                multiline
                numberOfLines={2}
                style={{ minHeight: 56, textAlignVertical: 'top' }}
              />
            </SectionCard>
          )}

          {/* ── Edit-mode: Recommended Tests ────────────────────────── */}
          {mode === 'edit' && (
            <SectionCard title="Recommended Tests">
              <Text className="text-xs text-gray-400 mb-3">Add any investigations or lab tests to recommend.</Text>
              {editInvestigations.map((inv, idx) => (
                <View key={idx} className="border border-blue-100 rounded-xl p-3 mb-3 bg-blue-50">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-xs font-semibold text-gray-600">Test {idx + 1}</Text>
                    <TouchableOpacity onPress={() => removeInvestigation(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                  <Text className="text-xs text-gray-500 mb-1">Test / Investigation name</Text>
                  <TextInput
                    className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 mb-2 bg-white"
                    value={inv.test}
                    onChangeText={v => updateInvestigation(idx, 'test', v)}
                    placeholder="e.g. Complete Blood Count"
                    placeholderTextColor="#93c5fd"
                  />
                  <Text className="text-xs text-gray-500 mb-1">Reason (optional)</Text>
                  <TextInput
                    className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 mb-2 bg-white"
                    value={inv.reason}
                    onChangeText={v => updateInvestigation(idx, 'reason', v)}
                    placeholder="e.g. To rule out infection"
                    placeholderTextColor="#93c5fd"
                  />
                  <Text className="text-xs text-gray-500 mb-1.5">Priority</Text>
                  <View className="flex-row gap-2">
                    {(['ROUTINE', 'URGENT', 'STAT'] as const).map(u => (
                      <TouchableOpacity
                        key={u}
                        onPress={() => updateInvestigation(idx, 'urgency', u)}
                        className="flex-1 py-1.5 rounded-full items-center"
                        style={{
                          backgroundColor: inv.urgency === u ? INV_URGENCY_COLORS[u] : INV_URGENCY_BG[u],
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: inv.urgency === u ? '#fff' : INV_URGENCY_COLORS[u] }}
                        >
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
              <TouchableOpacity
                onPress={addInvestigation}
                className="flex-row items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-blue-300"
              >
                <Ionicons name="add-circle-outline" size={16} color="#3b82f6" />
                <Text className="text-blue-600 text-sm font-medium">Add Test</Text>
              </TouchableOpacity>
            </SectionCard>
          )}

          {/* ── Prescription (view mode only) ────────────────────────── */}
          {mode !== 'edit' && prescription && (
            <SectionCard title="AI Prescription">
              <InfoRow label="Medicine" value={prescription.medicine} />
              <InfoRow label="Dosage" value={prescription.dosage} />
              <InfoRow label="Frequency" value={prescription.frequency} />
              <InfoRow label="Duration" value={prescription.duration} />
              {prescription.instructions && (
                <InfoRow label="Instructions" value={prescription.instructions} />
              )}
            </SectionCard>
          )}

          {/* ── AI Investigations (view mode) ───────────────────────── */}
          {mode !== 'edit' && ai?.investigations && ai.investigations.length > 0 && (
            <SectionCard title="AI Recommended Tests">
              {ai.investigations.map((inv, idx) => (
                <View key={idx} className="flex-row items-start justify-between mb-2 p-2.5 bg-gray-50 rounded-xl">
                  <View className="flex-1 mr-2">
                    <Text className="text-xs font-semibold text-gray-800">{inv.test}</Text>
                    {inv.reason ? <Text className="text-xs text-gray-500 mt-0.5">{inv.reason}</Text> : null}
                  </View>
                  <View
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: INV_URGENCY_BG[inv.urgency] ?? '#f3f4f6' }}
                  >
                    <Text className="text-xs font-bold" style={{ color: INV_URGENCY_COLORS[inv.urgency] ?? '#374151' }}>
                      {inv.urgency}
                    </Text>
                  </View>
                </View>
              ))}
            </SectionCard>
          )}

          {/* ── Differential Diagnosis ──────────────────────────────── */}
          {mode !== 'edit' && <ConditionsSection conditions={ai?.conditions ?? []} />}

          {/* ── Risk Flags ──────────────────────────────────────────── */}
          {mode !== 'edit' && <RiskFlagsSection flags={ai?.riskFlags ?? []} />}

          {/* ── HPI ─────────────────────────────────────────────────── */}
          {mode !== 'edit' && ai?.hpi && <HPISection hpi={ai.hpi} />}

          {/* ── Case Timeline ────────────────────────────────────────── */}
          <SectionCard title="Case Timeline">
            <View className="bg-gray-50 rounded-xl p-3 mb-2">
              <Text className="text-xs font-semibold text-gray-500 mb-1">Patient-Reported Symptoms</Text>
              <Text className="text-xs text-gray-700 leading-5">
                {currentCase.description || 'No symptom description provided.'}
              </Text>
            </View>
            <View className="flex-row gap-4">
              <View>
                <Text className="text-xs text-gray-400">Created</Text>
                <Text className="text-xs text-gray-700 font-medium">
                  {new Date(currentCase.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </Text>
              </View>
              <View>
                <Text className="text-xs text-gray-400">Last updated</Text>
                <Text className="text-xs text-gray-700 font-medium">
                  {new Date(currentCase.updatedAt).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </Text>
              </View>
            </View>

            {/* Rejection reason (read-only on Completed cases) */}
            {currentCase.rejectionReason ? (
              <View className="mt-3 bg-red-50 rounded-xl p-3">
                <Text className="text-xs font-semibold text-red-700 mb-1">Rejection Reason</Text>
                <Text className="text-xs text-red-600 leading-5">{currentCase.rejectionReason}</Text>
              </View>
            ) : null}
          </SectionCard>

          {/* ── Physician Recommendations (view mode) ────────────────── */}
          {mode !== 'edit' && (currentCase.physicianNotes || currentCase.physicianOutput) && (
            <SectionCard title="Physician Recommendations">
              {currentCase.physicianNotes ? (
                <View className="bg-green-50 rounded-xl p-3 mb-3">
                  <Text className="text-xs font-semibold text-green-700 mb-1">Clinical Notes</Text>
                  <Text className="text-xs text-green-800 leading-5">{currentCase.physicianNotes}</Text>
                </View>
              ) : null}
              {currentCase.physicianOutput?.prescription ? (
                <View className="mb-3">
                  <Text className="text-xs font-semibold text-gray-600 mb-2">Recommended Medication</Text>
                  <InfoRow label="Medicine" value={currentCase.physicianOutput.prescription.medicine} />
                  <InfoRow label="Dosage" value={currentCase.physicianOutput.prescription.dosage} />
                  <InfoRow label="Frequency" value={currentCase.physicianOutput.prescription.frequency} />
                  <InfoRow label="Duration" value={currentCase.physicianOutput.prescription.duration} />
                  {currentCase.physicianOutput.prescription.instructions ? (
                    <InfoRow label="Instructions" value={currentCase.physicianOutput.prescription.instructions} />
                  ) : null}
                </View>
              ) : null}
              {currentCase.physicianOutput?.investigations && currentCase.physicianOutput.investigations.length > 0 ? (
                <View>
                  <Text className="text-xs font-semibold text-gray-600 mb-2">Recommended Tests</Text>
                  {currentCase.physicianOutput.investigations.map((inv, idx) => (
                    <View key={idx} className="flex-row items-start justify-between mb-2 p-2.5 bg-gray-50 rounded-xl">
                      <View className="flex-1 mr-2">
                        <Text className="text-xs font-semibold text-gray-800">{inv.test}</Text>
                        {inv.reason ? (
                          <Text className="text-xs text-gray-500 mt-0.5">{inv.reason}</Text>
                        ) : null}
                      </View>
                      <View
                        className="px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: INV_URGENCY_BG[inv.urgency] ?? '#f3f4f6' }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: INV_URGENCY_COLORS[inv.urgency] ?? '#374151' }}
                        >
                          {inv.urgency}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </SectionCard>
          )}

          {/* ── Patient History ──────────────────────────────────────── */}
          {currentPatient && (
            <SectionCard title="Patient Profile">
              <View className="flex-row flex-wrap gap-2 mb-3">
                {currentPatient.bloodType ? (
                  <View className="bg-red-50 rounded-full px-3 py-1">
                    <Text className="text-xs font-bold text-red-700">
                      🩸 {currentPatient.bloodType}
                    </Text>
                  </View>
                ) : null}
                {currentPatient.gender ? (
                  <View className="bg-purple-50 rounded-full px-3 py-1">
                    <Text className="text-xs font-bold text-purple-700">
                      {currentPatient.gender}
                    </Text>
                  </View>
                ) : null}
                {currentPatient.dob ? (
                  <View className="bg-gray-100 rounded-full px-3 py-1">
                    <Text className="text-xs text-gray-600">
                      DOB: {currentPatient.dob}
                    </Text>
                  </View>
                ) : null}
              </View>
              <InfoRow label="Allergies" value={currentPatient.allergies} />
              <InfoRow label="Medications" value={currentPatient.currentMedications} />
              <InfoRow label="Medical History" value={currentPatient.medicalHistory} />
              <InfoRow label="Health History" value={currentPatient.healthHistory} />
              <InfoRow label="Emergency Contact" value={currentPatient.emergencyContact} />
              <InfoRow label="Phone" value={currentPatient.phone} />
            </SectionCard>
          )}

          {/* spacing for action panel */}
          <View style={{ height: 16 }} />
        </ScrollView>

        {/* ── Action Panel ──────────────────────────────────────────── */}
        {currentCase.status === 'Pending' && (
          <View
            className="bg-white border-t border-gray-100 px-4 pt-3 pb-5"
            style={{ elevation: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8 }}
          >
            <View className="bg-amber-50 rounded-xl p-3 flex-row items-center gap-2 mb-3">
              <Ionicons name="information-circle-outline" size={18} color="#b45309" />
              <Text className="text-amber-800 text-xs flex-1">
                This case is unassigned. Take it to begin your review.
              </Text>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => router.replace('/(prof-tab)/caseQueue' as any)}
                className="flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-100"
              >
                <Ionicons name="list-outline" size={16} color="#4b5563" />
                <Text className="text-gray-700 font-semibold text-sm">Back to Queue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleTakeCase}
                disabled={isSubmitting}
                className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-teal-600"
                style={{ flex: 2 }}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="hand-right-outline" size={16} color="#fff" />
                    <Text className="text-white font-semibold text-sm">Take Case</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
        {!isCompleted && currentCase.status === 'Active' && (
          <View
            className="bg-white border-t border-gray-100 px-4 pt-3 pb-5"
            style={{ elevation: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8 }}
          >
            {/* VIEW mode */}
            {mode === 'view' && (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setMode('edit')}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-100"
                >
                  <Ionicons name="pencil-outline" size={16} color="#4b5563" />
                  <Text className="text-gray-700 font-semibold text-sm">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode('reject')}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl bg-red-50"
                >
                  <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
                  <Text className="text-red-600 font-semibold text-sm">Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode('approve')}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl bg-green-600"
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text className="text-white font-semibold text-sm">Approve</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* EDIT mode */}
            {mode === 'edit' && (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setMode('view')}
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-gray-100 items-center"
                >
                  <Text className="text-gray-700 font-semibold text-sm">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveEdit}
                  disabled={isSubmitting}
                  className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-blue-600"
                  style={{ flex: 2 }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={16} color="#fff" />
                      <Text className="text-white font-semibold text-sm">Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* APPROVE mode */}
            {mode === 'approve' && (
              <View>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3 text-sm text-gray-800"
                  placeholder="Physician notes (optional)"
                  placeholderTextColor="#9ca3af"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => { setMode('view'); setNotes(''); }}
                    disabled={isSubmitting}
                    className="flex-1 py-3 rounded-xl bg-gray-100 items-center"
                  >
                    <Text className="text-gray-700 font-semibold text-sm">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleApprove}
                    disabled={isSubmitting}
                    className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-green-600"
                    style={{ flex: 2 }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text className="text-white font-semibold text-sm">Confirm Approve</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* REJECT mode */}
            {mode === 'reject' && (
              <View>
                <TextInput
                  className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-2 text-sm text-gray-800"
                  placeholder="Rejection reason (required) *"
                  placeholderTextColor="#f87171"
                  value={rejectionReason}
                  onChangeText={setRejectionReason}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3 text-sm text-gray-800"
                  placeholder="Additional notes (optional)"
                  placeholderTextColor="#9ca3af"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={2}
                  style={{ minHeight: 56, textAlignVertical: 'top' }}
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => { setMode('view'); setRejectionReason(''); setNotes(''); }}
                    disabled={isSubmitting}
                    className="flex-1 py-3 rounded-xl bg-gray-100 items-center"
                  >
                    <Text className="text-gray-700 font-semibold text-sm">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleReject}
                    disabled={isSubmitting || !rejectionReason.trim()}
                    className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
                    style={{
                      flex: 2,
                      backgroundColor:
                        !rejectionReason.trim() ? '#fca5a5' : '#dc2626',
                    }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={16} color="#fff" />
                        <Text className="text-white font-semibold text-sm">Confirm Reject</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Read-only banner for completed cases */}
        {isCompleted && (
          <View className="bg-gray-50 border-t border-gray-100 px-4 py-3 items-center">
            <Text className="text-gray-400 text-xs">
              This case is completed — no further actions are available.
            </Text>
          </View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
