import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDiagnosisStore } from 'stores/diagnosis-store';
import { DiagnosisService } from 'services/diagnosis-service';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

// ─── Urgency config ──────────────────────────────────────────────────────────
const URGENCY_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Low Risk',  icon: 'checkmark-circle'  },
  MEDIUM:   { color: '#d97706', bg: '#ffb968', border: '#fde68a', label: 'Moderate',   icon: 'warning'           },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'High Risk',  icon: 'alert-circle'      },
  CRITICAL: { color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe', label: 'Critical',   icon: 'pulse'             },
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  Pending:   { color: '#d97706', bg: '#fef3c7', icon: 'time-outline',             label: 'Pending Review'     },
  Active:    { color: '#2563eb', bg: '#dbeafe', icon: 'flash-outline',            label: 'Active – In Review' },
  Completed: { color: '#16a34a', bg: '#dcfce7', icon: 'checkmark-circle-outline', label: 'Completed'          },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  try {
    const date = new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    console.log('Formatted date:', date);
    return date.replace(',', ' at')
    ;
  } catch {
    return iso;
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const color =
    clamped >= 80 ? '#16a34a' : clamped >= 55 ? '#d97706' : '#dc2626';

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-xs text-gray-500 font-medium">Confidence Score</Text>
        <Text style={{ color }} className="text-sm font-bold">
          {clamped}%
        </Text>
      </View>
      <View className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <View
          style={{ width: `${clamped}%`, backgroundColor: color }}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mx-4 mb-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
        {title}
      </Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-2 border-b border-gray-50 last:border-0">
      <Text className="text-sm text-gray-500 flex-1">{label}</Text>
      <Text className="text-sm text-gray-900 font-medium flex-1 text-right">{value}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DiagnosisReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedDiagnosis, detailLoading, error, fetchDiagnosisDetail, clearSelectedDiagnosis } =
    useDiagnosisStore();
  const [submittingOutcome, setSubmittingOutcome] = useState(false);

  useEffect(() => {
    if (id) {
      // Clear stale data first so the screen doesn't briefly flash a previous
      // diagnosis, then fetch the requested one.
      clearSelectedDiagnosis();
      fetchDiagnosisDetail(id);
    }
    // No cleanup — clearing selectedDiagnosis on unmount triggers a re-render
    // that blanks the screen during the back-navigation exit animation.
  }, [id]);

  const d = selectedDiagnosis?.id === id ? selectedDiagnosis : null;
  console.log('Selected diagnosis:', d);

  const urgency = URGENCY_CONFIG[d?.urgency ?? ''] ?? URGENCY_CONFIG.MEDIUM;
  const statusCfg = STATUS_CONFIG[d?.status ?? 'Pending'] ?? STATUS_CONFIG.Pending;

  async function handleOutcome(outcome: 'improved' | 'same' | 'worse') {
    if (!id) return;
    setSubmittingOutcome(true);
    try {
      const result = await DiagnosisService.submitOutcome(id, outcome);
      const msg = result.escalated
        ? 'Your response has been recorded and the case has been escalated to a physician.'
        : 'Your response has been recorded. Thank you!';
      Alert.alert('Follow-up Recorded', msg);
      fetchDiagnosisDetail(id); // refresh to show outcomeChecked
    } catch {
      Alert.alert('Error', 'Failed to submit your response. Please try again.');
    } finally {
      setSubmittingOutcome(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <Pressable
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 mr-3"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>
        <Text className="flex-1 text-lg font-bold text-gray-900">Diagnosis Report</Text>
      </View>

      {/* Loading */}
      {detailLoading && !d && (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text className="text-sm text-gray-400">Loading report…</Text>
        </View>
      )}

      {/* Error */}
      {error && !detailLoading && !d && (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="alert-circle-outline" size={40} color="#dc2626" />
          <Text className="mt-3 text-base font-semibold text-gray-800">Failed to load</Text>
          <Text className="mt-1 text-sm text-gray-500 text-center">{error}</Text>
          <Pressable
            onPress={() => id && fetchDiagnosisDetail(id)}
            className="mt-5 px-6 py-2.5 rounded-xl bg-[#0AADA2]"
          >
            <Text className="text-white font-semibold text-sm">Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {d && (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
        >
          {/* ── Hero card ── */}
          <View
            className="mx-4 mb-4 rounded-2xl p-5"
            style={{ backgroundColor: urgency.bg, borderWidth: 1.5, borderColor: urgency.border }}
          >
            {/* Urgency badge */}
            <View className="flex-row items-center justify-between mb-3">
              <View
                className="flex-row items-center gap-1.5 px-3 py-1 rounded-full"
                style={{ backgroundColor: urgency.color + '22' }}
              >
                <Ionicons name={urgency.icon} size={13} color={urgency.color} />
                <Text style={{ color: urgency.color }} className="text-xs font-bold">
                  {urgency.label}
                </Text>
              </View>

              {/* Status badge */}
              <View
                className="flex-row items-center gap-1.5 px-3 py-1 rounded-full"
                style={{ backgroundColor: statusCfg.bg }}
              >
                <Ionicons name={statusCfg.icon} size={13} color={statusCfg.color} />
                <Text style={{ color: statusCfg.color }} className="text-xs font-bold">
                  {statusCfg.label}
                </Text>
              </View>
            </View>

            {/* Condition */}
            <Text className="text-xl font-bold text-gray-900 mb-1">{d.condition || 'Unknown Condition'}</Text>
            {d.title && d.title !== d.condition && (
              <Text className="text-sm text-gray-500 mb-3">{d.title}</Text>
            )}

            {/* Confidence bar */}
            {d.confidence > 0 && (
              <View className="mt-2">
                <ConfidenceBar value={d.confidence} />
              </View>
            )}

            {/* Escalation notice */}
            {d.escalated && (
              <View className="mt-3 flex-row items-center gap-2 bg-amber-50 rounded-xl px-3 py-2.5 border border-amber-200">
                <Ionicons name="arrow-up-circle-outline" size={16} color="#b45309" />
                <Text className="text-xs text-amber-800 flex-1">
                  This case was escalated to clinical review due to elevated urgency.
                </Text>
              </View>
            )}
          </View>

          {/* ── AI Assessment ── */}
          {d.description && (
            <SectionCard title="AI Assessment">
              <Text className="text-sm text-gray-700 leading-6">{d.description}</Text>
            </SectionCard>
          )}

          {/* ── Prescription ── */}
          {(d.hasPrescription || d.prescription) && (() => {
            const isApproved = d.status === 'Completed' && d.physicianDecision === 'Approved';
            if (!isApproved) {
              return (
                <SectionCard title="Recommended Treatment">
                  <View className="flex-row items-start gap-3 py-1">
                    <View className="w-8 h-8 rounded-full bg-amber-100 items-center justify-center mt-0.5 flex-shrink-0">
                      <Ionicons name="lock-closed-outline" size={15} color="#d97706" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-amber-800">
                        Pending physician approval
                      </Text>
                      <Text className="text-xs text-amber-600 mt-1 leading-5">
                        The AI has suggested a prescription for this case. It will be visible here
                        once a licensed physician reviews and approves it.
                      </Text>
                    </View>
                  </View>
                </SectionCard>
              );
            }
            if (!d.prescription) return null;
            return (
              <SectionCard title="Recommended Treatment">
                <View className="flex-row items-center gap-1.5 mb-3 px-2 py-1.5 bg-green-50 rounded-lg border border-green-200">
                  <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                  <Text className="text-xs font-semibold text-green-700">Approved by physician</Text>
                </View>
                <InfoRow label="Medicine"    value={d.prescription.medicine}    />
                <InfoRow label="Dosage"      value={d.prescription.dosage}      />
                <InfoRow label="Frequency"   value={d.prescription.frequency}   />
                <InfoRow label="Duration"    value={d.prescription.duration}    />
                {d.prescription.instructions ? (
                  <View className="pt-2">
                    <Text className="text-xs text-gray-400 mb-1">Instructions</Text>
                    <Text className="text-sm text-gray-700">{d.prescription.instructions}</Text>
                  </View>
                ) : null}
              </SectionCard>
            );
          })()}

          {/* ── Recommended Investigations ── */}
          {d.investigations && d.investigations.length > 0 && (() => {
            const isApproved = d.status === 'Completed' && d.physicianDecision === 'Approved';
            const URGENCY_STYLE: Record<string, { color: string; bg: string }> = {
              ROUTINE: { color: '#16a34a', bg: '#dcfce7' },
              URGENT:  { color: '#d97706', bg: '#fef9c3' },
              STAT:    { color: '#dc2626', bg: '#fee2e2' },
            };
            return (
              <SectionCard title="Recommended Investigations">
                {isApproved && (
                  <View className="flex-row items-center gap-1.5 mb-3 px-2 py-1.5 bg-green-50 rounded-lg border border-green-200">
                    <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                    <Text className="text-xs font-semibold text-green-700">Approved by physician</Text>
                  </View>
                )}
                {d.investigations!.map((inv, idx) => {
                  const style = URGENCY_STYLE[inv.urgency] ?? URGENCY_STYLE.ROUTINE;
                  return (
                    <View key={idx} className="mb-3 last:mb-0">
                      <View className="flex-row items-center justify-between mb-0.5">
                        <Text className="text-sm font-semibold text-gray-800 flex-1 mr-2">{inv.test}</Text>
                        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: style.bg }}>
                          <Text className="text-xs font-bold" style={{ color: style.color }}>{inv.urgency}</Text>
                        </View>
                      </View>
                      {inv.reason ? (
                        <Text className="text-xs text-gray-500 leading-4">{inv.reason}</Text>
                      ) : null}
                      {idx < d.investigations!.length - 1 && (
                        <View className="mt-2 border-b border-gray-100" />
                      )}
                    </View>
                  );
                })}
              </SectionCard>
            );
          })()}

          {/* ── Follow-Up Plan ── */}
          {d.followUpDate && (
            <SectionCard title="Follow-Up Plan">
              {/* Follow-up date */}
              <View className="flex-row items-center gap-2 mb-3">
                <View className="w-8 h-8 rounded-full bg-teal-50 items-center justify-center flex-shrink-0">
                  <Ionicons name="calendar-outline" size={16} color="#0AADA2" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-gray-400 mb-0.5">Scheduled Follow-Up</Text>
                  <Text className="text-sm font-semibold text-gray-800">
                    {formatDate(d.followUpDate)}
                  </Text>
                </View>
              </View>

              {/* Trigger symptoms */}
              {d.followUpInstructions && (
                <View className="mb-3 bg-blue-50 rounded-xl px-3 py-2.5 border border-blue-100">
                  <Text className="text-xs font-bold text-blue-700 mb-1">Watch for these symptoms</Text>
                  <Text className="text-xs text-blue-600 leading-5">{d.followUpInstructions}</Text>
                </View>
              )}

              {/* Outcome section */}
              {d.outcomeChecked ? (
                <View className="flex-row items-center gap-2 bg-green-50 rounded-xl px-3 py-2.5 border border-green-200">
                  <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                  <Text className="text-xs font-semibold text-green-700">
                    Follow-up outcome recorded
                  </Text>
                </View>
              ) : (
                <View>
                  <Text className="text-xs font-bold text-gray-600 mb-2">
                    How are you feeling since your diagnosis?
                  </Text>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => handleOutcome('improved')}
                      disabled={submittingOutcome}
                      className="flex-1 items-center py-2.5 rounded-xl bg-green-100 border border-green-300"
                    >
                      <Ionicons name="trending-down-outline" size={16} color="#16a34a" />
                      <Text className="text-xs font-semibold text-green-700 mt-1">Improved</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleOutcome('same')}
                      disabled={submittingOutcome}
                      className="flex-1 items-center py-2.5 rounded-xl bg-amber-50 border border-amber-200"
                    >
                      <Ionicons name="remove-outline" size={16} color="#d97706" />
                      <Text className="text-xs font-semibold text-amber-700 mt-1">Same</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleOutcome('worse')}
                      disabled={submittingOutcome}
                      className="flex-1 items-center py-2.5 rounded-xl bg-red-50 border border-red-200"
                    >
                      <Ionicons name="trending-up-outline" size={16} color="#dc2626" />
                      <Text className="text-xs font-semibold text-red-600 mt-1">Worse</Text>
                    </Pressable>
                  </View>
                  {submittingOutcome && (
                    <ActivityIndicator size="small" color="#0AADA2" className="mt-2" />
                  )}
                </View>
              )}
            </SectionCard>
          )}

          {/* ── Physician Notes ── */}
          {d.physicianNotes ? (
            <SectionCard title="Physician Notes">
              <Text className="text-sm text-gray-700 leading-6">{d.physicianNotes}</Text>
            </SectionCard>
          ) : (
            d.status === 'Pending' && (
              <SectionCard title="Physician Notes">
                <View className="flex-row items-center gap-2 py-1">
                  <Ionicons name="time-outline" size={16} color="#9ca3af" />
                  <Text className="text-sm text-gray-400">
                    Awaiting physician review…
                  </Text>
                </View>
              </SectionCard>
            )
          )}

          {/* ── Status Timeline ── */}
          <SectionCard title="Case Timeline">
            <View className="gap-3">
              <View className="flex-row items-start gap-3">
                <View className="w-7 h-7 rounded-full bg-[#0AADA2]/15 items-center justify-center mt-0.5">
                  <Ionicons name="create-outline" size={14} color="#0AADA2" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-800">Case Created</Text>
                  <Text className="text-xs text-gray-400 mt-0.5">{formatDate(d.createdAt)}</Text>

                </View>
              </View>

              {d.status !== 'Pending' && (
                <View className="flex-row items-start gap-3">
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center mt-0.5"
                    style={{ backgroundColor: statusCfg.bg }}
                  >
                    <Ionicons name={statusCfg.icon} size={14} color={statusCfg.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold" style={{ color: statusCfg.color }}>
                      {statusCfg.label}
                    </Text>
                    <Text className="text-xs text-gray-400 mt-0.5">{formatDate(d.updatedAt)}</Text>
                  </View>
                </View>
              )}
            </View>
          </SectionCard>

          {/* ── Disclaimer ── */}
          <View className="mx-4 mt-1 mb-2 flex-row items-start gap-2 bg-blue-50 rounded-xl px-3 py-3 border border-blue-100">
            <Ionicons name="information-circle-outline" size={16} color="#2563eb" />
            <Text className="text-xs text-blue-700 flex-1 leading-5">
              This report is AI-assisted. Always follow your physician's advice and seek professional
              medical attention for any health concerns.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
    <PatientBottomTabBar activeTab="health" />
    </View>
  );
}
