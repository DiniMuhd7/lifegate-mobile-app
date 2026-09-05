/**
 * Admin — LifeFund Review & Disbursement
 *
 * Dashboard of LifeFund healthcare-financing requests: new/pending/overdue/
 * defaulted counts and total outstanding, a filterable request queue, and
 * an action sheet for approving, rejecting, adjusting, escalating,
 * restructuring, or disbursing each request. Every action is logged to the
 * shared audit trail server-side.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useLifeFundAdminStore } from '../../stores/lifefund-admin-store';
import { LIFEFUND_CATEGORY_LABELS, type LifeFundAdminAction, type LifeFundRequest } from '../../types/lifefund-types';

function money(n: number | undefined | null): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n ?? 0);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDateTime(iso?: string): string {
  if (!iso) return 'Not available';
  try {
    return new Date(iso).toLocaleString('en-NG', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'PENDING_REVIEW' },
  { label: 'More info', value: 'MORE_INFO_REQUIRED' },
  { label: 'Awaiting accept', value: 'AWAITING_ACCEPTANCE' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Defaulted', value: 'DEFAULTED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Escalated', value: 'ESCALATED' },
];

const ACTIONS: { action: LifeFundAdminAction; label: string; color: string; needsNotes?: boolean; needsAmount?: boolean }[] = [
  { action: 'APPROVE', label: 'Approve', color: '#16a34a' },
  { action: 'REJECT', label: 'Reject', color: '#dc2626', needsNotes: true },
  { action: 'REQUEST_MORE_INFORMATION', label: 'Request info', color: '#d97706', needsNotes: true },
  { action: 'REDUCE_AMOUNT', label: 'Reduce amount', color: '#d97706', needsAmount: true, needsNotes: true },
  { action: 'MARK_FOR_PROVIDER_REVIEW', label: 'Provider review', color: '#7c3aed' },
  { action: 'ESCALATE', label: 'Escalate', color: '#7c3aed' },
  { action: 'RESTRUCTURE', label: 'Restructure', color: '#0284c7', needsNotes: true },
  { action: 'SUSPEND', label: 'Suspend account', color: '#dc2626', needsNotes: true },
  { action: 'DISBURSE', label: 'Disburse funds', color: '#0f766e' },
];

// ── Summary strip ────────────────────────────────────────────────────────

function SummaryTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 90,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: 10,
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

// ── Request card ─────────────────────────────────────────────────────────

function RequestCard({ item, onPress }: { item: LifeFundRequest; onPress: () => void }) {
  const flagged = item.fraudFlags && item.fraudFlags.length > 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: flagged ? '#fecaca' : '#e5e7eb',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>{item.patientName || 'Patient'}</Text>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>{item.patientEmail}</Text>
        </View>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#f3f4f6' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#374151' }}>{item.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <Text style={{ fontSize: 13, color: '#374151' }}>{LIFEFUND_CATEGORY_LABELS[item.expenseCategory]}</Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827' }}>
          {money(item.approvedAmount ?? item.requestedAmount)}
        </Text>
      </View>
      <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{item.healthcareProviderName}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="speedometer-outline" size={13} color="#6b7280" />
          <Text style={{ fontSize: 11, color: '#6b7280' }}>Risk {item.riskScore.toFixed(0)}</Text>
        </View>
        {flagged && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="warning" size={13} color="#dc2626" />
            <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700' }}>
              {item.fraudFlags.length} flag{item.fraudFlags.length > 1 ? 's' : ''}
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{formatDate(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Action modal ─────────────────────────────────────────────────────────

function ActionModal({
  visible,
  request,
  onCancel,
  onConfirm,
  onRecordRepayment,
  busy,
}: {
  visible: boolean;
  request: LifeFundRequest | null;
  onCancel: () => void;
  onConfirm: (action: LifeFundAdminAction, notes: string, reducedAmount?: number) => void;
  onRecordRepayment: (amount: number) => void;
  busy: boolean;
}) {
  const [notes, setNotes] = useState('');
  const [reducedAmount, setReducedAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [pendingAction, setPendingAction] = useState<LifeFundAdminAction | null>(null);

  if (!request) return null;

  function pick(action: LifeFundAdminAction) {
    const cfg = ACTIONS.find((a) => a.action === action)!;
    if (cfg.needsNotes || cfg.needsAmount) {
      setPendingAction(action);
      return;
    }
    onConfirm(action, '');
  }

  function submitPending() {
    if (!pendingAction) return;
    const cfg = ACTIONS.find((a) => a.action === pendingAction)!;
    if (cfg.needsAmount) {
      const amt = Number(reducedAmount);
      if (!amt || amt <= 0) {
        Alert.alert('Enter an amount', 'Please enter the reduced amount.');
        return;
      }
      onConfirm(pendingAction, notes, amt);
    } else {
      onConfirm(pendingAction, notes);
    }
    setPendingAction(null);
    setNotes('');
    setReducedAmount('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, maxHeight: '85%' }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>{request.patientName || 'Patient'}</Text>
              <Text style={{ fontSize: 12, color: '#6b7280' }}>{request.patientEmail || 'Email not provided'}</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>{request.patientPhone || 'Phone number not provided'}</Text>

              <View style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 12, gap: 4 }}>
                <Text style={{ fontSize: 11, color: '#6b7280' }}>Request ID: {request.id}</Text>
                <Text style={{ fontSize: 11, color: '#6b7280' }}>Submitted: {formatDateTime(request.createdAt)}</Text>
                <Text style={{ fontSize: 11, color: '#6b7280' }}>Last updated: {formatDateTime(request.updatedAt)}</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                  {LIFEFUND_CATEGORY_LABELS[request.expenseCategory]} · {request.healthcareProviderName}
                </Text>
                {request.healthcareProviderAccount ? (
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>Acct: {request.healthcareProviderAccount}</Text>
                ) : null}
                {request.billReference ? (
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>Bill reference: {request.billReference}</Text>
                ) : null}
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                  Requested {money(request.requestedAmount)}
                  {request.approvedAmount != null ? ` · Approved ${money(request.approvedAmount)}` : ''}
                </Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                  Outstanding {money(request.outstandingBalance)} · Risk {request.riskScore.toFixed(0)}
                </Text>
                {request.purposeDescription ? (
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>“{request.purposeDescription}”</Text>
                ) : null}
                <Text style={{ fontSize: 11, color: '#6b7280' }}>
                  Financing charge {request.interestRatePct}% · Fee {money(request.feeAmount)} · {request.installmentsCount} installments every {request.repaymentFrequencyDays} days
                </Text>
                {request.totalRepayable != null ? (
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>Total repayable: {money(request.totalRepayable)}</Text>
                ) : null}
                {request.reviewedAt ? (
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>Last reviewed: {formatDateTime(request.reviewedAt)}</Text>
                ) : null}
                {request.supportingDocuments.length > 0 ? (
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>Supporting documents: {request.supportingDocuments.map((d) => d.name).join(', ')}</Text>
                ) : null}
                {request.fraudFlags.length > 0 && (
                  <View style={{ marginTop: 4, gap: 2 }}>
                    {request.fraudFlags.map((f, i) => (
                      <Text key={i} style={{ fontSize: 11, color: '#dc2626' }}>
                        ⚠ {f.detail}
                      </Text>
                    ))}
                  </View>
                )}
              </View>

              {(request.schedule?.length || request.repayments?.length) ? (
                <View style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 12, gap: 4 }}>
                  {request.schedule?.length ? (
                    <>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>Repayment schedule</Text>
                      {request.schedule.map((installment) => (
                        <Text key={installment.id} style={{ fontSize: 11, color: '#6b7280' }}>
                          {installment.installmentNo}. {money(installment.amountDue)} due {installment.dueDate} · {installment.status}
                        </Text>
                      ))}
                    </>
                  ) : null}
                  {request.repayments?.length ? (
                    <Text style={{ fontSize: 11, color: '#6b7280' }}>Repayments recorded: {request.repayments.length}</Text>
                  ) : null}
                </View>
              ) : null}

              {pendingAction ? (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                    {ACTIONS.find((a) => a.action === pendingAction)?.label}
                  </Text>
                  {ACTIONS.find((a) => a.action === pendingAction)?.needsAmount && (
                    <TextInput
                      value={reducedAmount}
                      onChangeText={setReducedAmount}
                      placeholder="Reduced amount (₦)"
                      keyboardType="numeric"
                      placeholderTextColor="#9ca3af"
                      style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, fontSize: 13, color: '#111827' }}
                    />
                  )}
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Notes for the patient / audit trail"
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={3}
                    style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, fontSize: 13, color: '#111827', minHeight: 72, textAlignVertical: 'top' }}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setPendingAction(null)}
                      style={{ flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={submitPending}
                      disabled={busy}
                      style={{ flex: 1, backgroundColor: '#0f766e', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
                    >
                      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Confirm</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {ACTIONS.map((a) => (
                      <TouchableOpacity
                        key={a.action}
                        onPress={() => pick(a.action)}
                        disabled={busy}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          borderRadius: 10,
                          backgroundColor: a.color + '15',
                          borderWidth: 1,
                          borderColor: a.color + '55',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: a.color }}>{a.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 14, gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>Record offline repayment</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        value={repayAmount}
                        onChangeText={setRepayAmount}
                        placeholder="Amount (₦)"
                        keyboardType="numeric"
                        placeholderTextColor="#9ca3af"
                        style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, fontSize: 13, color: '#111827' }}
                      />
                      <TouchableOpacity
                        onPress={() => {
                          const amt = Number(repayAmount);
                          if (!amt || amt <= 0) {
                            Alert.alert('Enter an amount', 'Please enter a repayment amount.');
                            return;
                          }
                          onRecordRepayment(amt);
                          setRepayAmount('');
                        }}
                        disabled={busy}
                        style={{ paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#0f766e', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Record</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TouchableOpacity onPress={onCancel} style={{ marginTop: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280' }}>Close</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────

export default function LifeFundApprovalsScreen() {
  const {
    summary,
    requests,
    statusFilter,
    loadingSummary,
    loadingRequests,
    applyingAction,
    error,
    fetchSummary,
    fetchRequests,
    fetchRequestDetail,
    selectedRequest,
    setStatusFilter,
    applyAction,
    recordRepayment,
    clearSelectedRequest,
    clearError,
  } = useLifeFundAdminStore();

  const load = useCallback(() => {
    fetchSummary();
    fetchRequests();
  }, [fetchSummary, fetchRequests]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (error) Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
  }, [error, clearError]);

  async function handleAction(action: LifeFundAdminAction, notes: string, reducedAmount?: number) {
    if (!selectedRequest) return;
    const ok = await applyAction(selectedRequest.id, { action, notes, reducedAmount });
    if (ok) {
      clearSelectedRequest();
      Alert.alert('Done', 'Action applied and patient notified where applicable.');
    }
  }

  async function handleRepayment(amount: number) {
    if (!selectedRequest) return;
    const ok = await recordRepayment(selectedRequest.id, amount);
    if (ok) {
      clearSelectedRequest();
      Alert.alert('Recorded', 'Repayment recorded.');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <LinearGradient colors={['#0f766e', '#134e4a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>LifeFund</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Review & disbursement</Text>
          </View>
          {loadingSummary && <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />}
        </View>

        {summary && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <SummaryTile label="New (24h)" value={String(summary.newRequests)} color="#fff" />
            <SummaryTile label="Pending" value={String(summary.pendingReview)} color="#fde68a" />
            <SummaryTile label="Overdue" value={String(summary.overdue)} color="#fca5a5" />
            <SummaryTile label="Defaulted" value={String(summary.defaulted)} color="#fca5a5" />
            <SummaryTile label="Fraud flags" value={String(summary.fraudFlagged)} color="#fca5a5" />
            <SummaryTile label="Outstanding" value={money(summary.totalOutstanding)} color="#fff" />
          </View>
        )}
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setStatusFilter(f.value)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
              backgroundColor: statusFilter === f.value ? '#0f766e' : '#f3f4f6',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: statusFilter === f.value ? '#fff' : '#374151' }}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loadingRequests} onRefresh={load} />}
      >
        {loadingRequests && requests.length === 0 && <ActivityIndicator size="large" color="#0f766e" style={{ marginTop: 40 }} />}
        {!loadingRequests && requests.length === 0 && (
          <Text style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>No requests in this view.</Text>
        )}
        {requests.map((r) => (
          <RequestCard key={r.id} item={r} onPress={() => fetchRequestDetail(r.id)} />
        ))}
      </ScrollView>

      <ActionModal
        visible={!!selectedRequest}
        request={selectedRequest}
        onCancel={clearSelectedRequest}
        onConfirm={handleAction}
        onRecordRepayment={handleRepayment}
        busy={applyingAction}
      />
    </SafeAreaView>
  );
}
