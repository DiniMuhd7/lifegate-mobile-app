/**
 * Admin — Physician Payout Approval Queue
 *
 * Lists physician payout requests awaiting admin review. Admins can approve
 * (moves to processing) or reject (with a reason) each request.
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
import { AdminService } from '../../services/admin-service';
import type { AdminPayoutView } from '../../types/admin-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNaira(n: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:    { bg: '#fef9c3', text: '#854d0e', label: 'Pending' },
  requested:  { bg: '#ede9fe', text: '#5b21b6', label: 'Requested' },
  processing: { bg: '#dbeafe', text: '#1e40af', label: 'Processing' },
  paid:       { bg: '#dcfce7', text: '#166534', label: 'Paid' },
  rejected:   { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
};

// ── Info Row ─────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 11, color: '#6b7280' }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', maxWidth: '60%', textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

// ── Payout Card ───────────────────────────────────────────────────────────────

function PayoutCard({
  item,
  onApprove,
  onReject,
  busy,
}: {
  item: AdminPayoutView;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const statusStyle = STATUS_STYLE[item.status] ?? STATUS_STYLE.requested;
  const isPending = item.status === 'requested';

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Physician info */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#ede9fe',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Ionicons name="medkit-outline" size={20} color="#7c3aed" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
            Dr. {item.physicianName}
          </Text>
          <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{item.physicianEmail}</Text>
        </View>
        <View
          style={{
            backgroundColor: statusStyle.bg,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: statusStyle.text }}>
            {statusStyle.label}
          </Text>
        </View>
      </View>

      {/* Payout details */}
      <View
        style={{
          backgroundColor: '#f8fafc',
          borderRadius: 10,
          padding: 10,
          gap: 4,
          marginBottom: 12,
        }}
      >
        <Row label="Amount" value={formatNaira(item.totalAmount)} />
        <Row label="Cases" value={`${item.caseCount} approved ${item.caseCount === 1 ? 'case' : 'cases'}`} />
        <Row label="Period" value={`${formatDate(item.periodStart)} → ${formatDate(item.periodEnd)}`} />
        <Row label="Requested" value={formatDate(item.requestedAt)} />
        {item.rejectionReason ? (
          <Row label="Rejection reason" value={item.rejectionReason} />
        ) : null}
      </View>

      {/* Actions — only show for requested status */}
      {isPending && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={onApprove}
            disabled={busy}
            style={{
              flex: 1,
              backgroundColor: busy ? '#d1fae5' : '#16a34a',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#16a34a" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Approve</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onReject}
            disabled={busy}
            style={{
              flex: 1,
              backgroundColor: busy ? '#fee2e2' : '#ef4444',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="close-circle-outline" size={16} color={busy ? '#dc2626' : '#fff'} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: busy ? '#dc2626' : '#fff' }}>
              Reject
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Reject Reason Modal ───────────────────────────────────────────────────────

function RejectModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  function handleConfirm() {
    onConfirm(reason.trim());
    setReason('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 20,
              padding: 24,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 4 }}>
              Reject Payout Request
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              Provide a reason for rejection. The physician will be notified.
            </Text>

            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Reason for rejection"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              style={{
                borderWidth: 1,
                borderColor: '#e5e7eb',
                borderRadius: 10,
                padding: 10,
                fontSize: 13,
                color: '#111827',
                minHeight: 72,
                textAlignVertical: 'top',
                marginBottom: 16,
              }}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={onCancel}
                style={{
                  flex: 1,
                  backgroundColor: '#f3f4f6',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                style={{
                  flex: 1,
                  backgroundColor: '#ef4444',
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Status Filter Tabs ────────────────────────────────────────────────────────

const FILTER_TABS: { key: string; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'processing', label: 'Processing' },
  { key: 'paid', label: 'Paid' },
  { key: 'rejected', label: 'Rejected' },
];

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function PhysicianPayoutsScreen() {
  const [payouts, setPayouts] = useState<AdminPayoutView[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('requested');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  const load = useCallback(async (filter: string) => {
    setLoading(true);
    try {
      const data = await AdminService.getPhysicianPayouts(filter);
      setPayouts(data);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'Failed to load payouts';
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(activeFilter);
  }, [activeFilter, load]);

  async function handleApprove(id: string) {
    const confirm = async () => {
      setBusyId(id);
      try {
        await AdminService.approvePhysicianPayout(id);
        setPayouts((prev) => prev.filter((p) => p.id !== id));
        if (Platform.OS === 'web') {
          // eslint-disable-next-line no-alert
          window.alert('Payout approved and moved to processing.');
        } else {
          Alert.alert('Approved', 'Payout approved and moved to processing.');
        }
      } catch (e: any) {
        const msg = e?.response?.data?.error ?? e?.message ?? 'Failed to approve';
        if (Platform.OS === 'web') {
          // eslint-disable-next-line no-alert
          window.alert(msg);
        } else {
          Alert.alert('Error', msg);
        }
      } finally {
        setBusyId(null);
      }
    };

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm('Approve this payout request?')) confirm();
    } else {
      Alert.alert('Approve Payout', 'Approve this payout request and move it to processing?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: confirm },
      ]);
    }
  }

  async function handleRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const id = rejectTarget;
    setRejectTarget(null);
    setBusyId(id);
    try {
      await AdminService.rejectPhysicianPayout(id, reason);
      setPayouts((prev) => prev.filter((p) => p.id !== id));
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        window.alert('Payout request rejected.');
      } else {
        Alert.alert('Rejected', 'Payout request rejected and physician notified.');
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'Failed to reject';
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = payouts.filter((p) => p.status === 'requested').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <LinearGradient
        colors={['#5b21b6', '#4c1d95']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>
              Physician Payouts
            </Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
              {pendingCount} request{pendingCount !== 1 ? 's' : ''} awaiting review
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => load(activeFilter)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Filter tabs */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 8,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
        }}
      >
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveFilter(tab.key)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: activeFilter === tab.key ? '#5b21b6' : '#f3f4f6',
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: activeFilter === tab.key ? '#fff' : '#6b7280',
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Body */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(activeFilter)} />}
      >
        {loading && payouts.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <ActivityIndicator size="large" color="#7c3aed" />
            <Text style={{ fontSize: 13, color: '#6b7280' }}>Loading payout requests…</Text>
          </View>
        ) : payouts.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: '#ede9fe',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="checkmark-done-outline" size={28} color="#7c3aed" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>All clear</Text>
            <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
              No {activeFilter} payout requests at the moment.
            </Text>
          </View>
        ) : (
          payouts.map((item) => (
            <PayoutCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onApprove={() => handleApprove(item.id)}
              onReject={() => setRejectTarget(item.id)}
            />
          ))
        )}
      </ScrollView>

      <RejectModal
        visible={rejectTarget !== null}
        onCancel={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
      />
    </SafeAreaView>
  );
}
