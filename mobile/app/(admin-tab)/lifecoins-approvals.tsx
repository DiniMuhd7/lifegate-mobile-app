/**
 * Admin — Lifecoins Redemption Approval Queue
 *
 * Lists all patient Lifecoin redemption requests awaiting admin review.
 * Admins can approve (fires Flutterwave transfer) or reject (with an optional
 * reason note) each request. Both actions push a notification to the patient.
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
import { useAdminStore } from '../../stores/admin-store';
import type { LifecoinRedemptionRequest } from '../../types/admin-types';

function formatNaira(n: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

// ── Redemption Card ───────────────────────────────────────────────────────────

function RedemptionCard({
  item,
  onApprove,
  onReject,
  busy,
}: {
  item: LifecoinRedemptionRequest;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
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
      {/* Patient info */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#fef3c7',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Ionicons name="person-outline" size={20} color="#d97706" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
            {item.patientName || 'Unknown Patient'}
          </Text>
          <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{item.patientEmail}</Text>
        </View>
        <View
          style={{
            backgroundColor: '#fef3c7',
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#d97706' }}>
            {item.coins} LC
          </Text>
        </View>
      </View>

      {/* Payout info */}
      <View
        style={{
          backgroundColor: '#f8fafc',
          borderRadius: 10,
          padding: 10,
          gap: 4,
          marginBottom: 12,
        }}
      >
        <Row label="Naira Equivalent" value={formatNaira(item.nairaAmount)} />
        <Row label="Health Firm" value={item.healthFirmName} />
        <Row label="Account" value={item.accountNumber} />
        <Row label="Bank" value={item.bankName} />
        <Row label="Submitted" value={formatDate(item.createdAt)} />
      </View>

      {/* Actions */}
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
    </View>
  );
}

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

// ── Reject Reason Modal ───────────────────────────────────────────────────────

function RejectModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');

  function handleConfirm() {
    onConfirm(note.trim());
    setNote('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
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
              Reject Redemption
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              Optionally provide a reason. The patient will be notified.
            </Text>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Reason (optional)"
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

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function LifecoinsApprovalsScreen() {
  const { pendingRedemptions, redemptionsLoading, fetchPendingRedemptions, approveRedemption, rejectRedemption } =
    useAdminStore();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPendingRedemptions();
  }, [fetchPendingRedemptions]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(id: string) {
    Alert.alert(
      'Approve Redemption',
      'This will deduct the patient\u2019s Lifecoins and initiate the Flutterwave transfer. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            setBusyId(id);
            try {
              await approveRedemption(id);
              Alert.alert('Approved', 'Transfer initiated and patient notified.');
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to approve redemption.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  async function handleRejectConfirm(note: string) {
    if (!rejectTarget) return;
    const id = rejectTarget;
    setRejectTarget(null);
    setBusyId(id);
    try {
      await rejectRedemption(id, note);
      Alert.alert('Rejected', 'Redemption rejected and patient notified.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to reject redemption.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <LinearGradient
        colors={['#d97706', '#b45309']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>
              Lifecoins Approvals
            </Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 }}>
              {pendingRedemptions.length} request{pendingRedemptions.length !== 1 ? 's' : ''} pending
            </Text>
          </View>
          <TouchableOpacity
            onPress={load}
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

      {/* Body */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={redemptionsLoading} onRefresh={load} />
        }
      >
        {redemptionsLoading && pendingRedemptions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <ActivityIndicator size="large" color="#d97706" />
            <Text style={{ fontSize: 13, color: '#6b7280' }}>Loading redemptions…</Text>
          </View>
        ) : pendingRedemptions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: '#dcfce7',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="checkmark-done-outline" size={30} color="#16a34a" />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151' }}>All clear!</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
              No pending redemption requests at this time.
            </Text>
          </View>
        ) : (
          pendingRedemptions.map((item) => (
            <RedemptionCard
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
