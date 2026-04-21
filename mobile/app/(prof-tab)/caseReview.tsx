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
import { CaseUrgency } from '../../types/professional-types';

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

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CaseReviewScreen() {
  const router = useRouter();
  const { caseId } = useLocalSearchParams<{ caseId: string }>();

  const {
    currentCase,
    currentPatient,
    isCaseLoading,
    loadCaseDetail,
    updateLocalAIOutput,
    clearCurrentCase,
    updateCaseStatus,
  } = useProfessionalStore();

  // Review mode state
  const [mode, setMode] = useState<ReviewMode>('view');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit mode state
  const [editCondition, setEditCondition] = useState('');
  const [editUrgency, setEditUrgency] = useState<CaseUrgency>('LOW');
  const [editConfidence, setEditConfidence] = useState(0);

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
  }, [currentCase]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSaveEdit = useCallback(async () => {
    if (!caseId || !editCondition.trim()) {
      Alert.alert('Validation', 'Condition name cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    try {
      await ProfessionalService.updateAIOutput(caseId, editCondition.trim(), editUrgency, editConfidence);
      updateLocalAIOutput(editCondition.trim(), editUrgency, editConfidence);
      setMode('view');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save changes.');
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, editCondition, editUrgency, editConfidence, updateLocalAIOutput]);

  const handleApprove = useCallback(async () => {
    if (!caseId) return;
    setIsSubmitting(true);
    try {
      await ProfessionalService.approveCase(caseId, notes);
      updateCaseStatus(caseId, 'Completed');
      Alert.alert('Case Approved', 'The case has been successfully approved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to approve case.');
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
      Alert.alert('Error', err?.message ?? 'Failed to reject case.');
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, rejectionReason, notes, updateCaseStatus, router]);

  // ── Loading / error states ──────────────────────────────────────────────

  if (isCaseLoading || !currentCase) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-500 mt-3 text-sm">Loading case…</Text>
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

          {/* ── Prescription ────────────────────────────────────────── */}
          {prescription && (
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

            {/* Physician notes (read-only on Completed cases) */}
            {currentCase.physicianNotes ? (
              <View className="mt-3 bg-green-50 rounded-xl p-3">
                <Text className="text-xs font-semibold text-green-700 mb-1">Physician Notes</Text>
                <Text className="text-xs text-green-700 leading-5">{currentCase.physicianNotes}</Text>
              </View>
            ) : null}
          </SectionCard>

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
        {!isCompleted && (
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
                  className="flex-2 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-blue-600"
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
