/**
 * Admin — Physician Profile Detail
 *
 * Shows the full physician profile with:
 *  1. Account status + flag indicator
 *  2. MDCN verification status + admin override (confirm / reject)
 *  3. SLA breach count for the past 7 days
 *  4. Recent case history (last 20 cases)
 *  5. Admin actions: Suspend / Reinstate, Edit, Delete
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAdminStore } from '../../stores/admin-store';
import type { PhysicianCaseHistory, UpdatePhysicianInput } from '../../types/admin-types';

// ─── Colour helpers ───────────────────────────────────────────────────────────

const URGENCY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Pending:   { bg: '#f3e8ff', text: '#7e22ce' },
  Active:    { bg: '#dbeafe', text: '#1d4ed8' },
  Completed: { bg: '#dcfce7', text: '#166534' },
};

// ─── Micro-components ─────────────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <View className="flex-row items-start py-2 border-b border-gray-50">
      <Text className="text-xs text-gray-400 w-36 pt-0.5">{label}</Text>
      <Text
        className={`flex-1 text-sm text-gray-800 ${mono ? 'font-mono' : 'font-medium'}`}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function SectionHeader({ title, icon, color }: { title: string; icon: string; color: string }) {
  return (
    <View className="flex-row items-center mb-3 mt-5">
      <View className="w-7 h-7 rounded-lg items-center justify-center mr-2" style={{ backgroundColor: color + '20' }}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text className="text-base font-bold text-gray-800">{title}</Text>
    </View>
  );
}

function CaseHistoryRow({ item }: { item: PhysicianCaseHistory }) {
  const sc = STATUS_COLORS[item.status] ?? { bg: '#f3f4f6', text: '#374151' };
  return (
    <View className="flex-row items-center py-2.5 border-b border-gray-50">
      <View className="flex-1">
        <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
          {item.title || item.condition || 'Untitled case'}
        </Text>
        <View className="flex-row items-center mt-0.5 gap-2">
          <Text className="text-xs font-semibold" style={{ color: URGENCY_COLORS[item.urgency] || '#6b7280' }}>
            {item.urgency}
          </Text>
          {item.escalated && (
            <Text className="text-xs text-orange-500 font-semibold">ESCALATED</Text>
          )}
          <Text className="text-xs text-gray-400">{item.updatedAt?.slice(0, 10)}</Text>
        </View>
      </View>
      <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: sc.bg }}>
        <Text className="text-[10px] font-semibold" style={{ color: sc.text }}>
          {item.status.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

// ─── MDCN Override Panel ──────────────────────────────────────────────────────

function MDCNOverridePanel({
  physicianId,
  currentStatus,
  overrideStatus,
  overrideBy,
  overrideAt,
}: {
  physicianId: string;
  currentStatus: boolean;
  overrideStatus: string;
  overrideBy?: string;
  overrideAt?: string;
}) {
  const overrideMDCN = useAdminStore((s) => s.overrideMDCN);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<'confirmed' | 'rejected' | null>(null);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const executeOverride = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    setLoading(true);
    setResultMsg(null);
    try {
      await overrideMDCN(physicianId, action);
      setResultMsg({ type: 'success', text: `MDCN verification ${action}.` });
    } catch (e: any) {
      setResultMsg({ type: 'error', text: e?.response?.data?.message ?? 'Override failed' });
    } finally {
      setLoading(false);
    }
  };

  const badge = () => {
    if (overrideStatus === 'confirmed' || currentStatus) {
      return <View className="flex-row items-center px-3 py-1 rounded-full bg-blue-100">
        <Ionicons name="shield-checkmark" size={14} color="#1d4ed8" />
        <Text className="text-xs font-bold text-blue-700 ml-1">MDCN Verified</Text>
      </View>;
    }
    if (overrideStatus === 'rejected') {
      return <View className="flex-row items-center px-3 py-1 rounded-full bg-red-100">
        <Ionicons name="shield" size={14} color="#dc2626" />
        <Text className="text-xs font-bold text-red-700 ml-1">MDCN Rejected</Text>
      </View>;
    }
    return <View className="flex-row items-center px-3 py-1 rounded-full bg-amber-100">
      <Ionicons name="shield-outline" size={14} color="#92400e" />
      <Text className="text-xs font-bold text-amber-800 ml-1">MDCN Pending Review</Text>
    </View>;
  };

  return (
    <View className="bg-white rounded-2xl p-4 mb-3"
      style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>

      {/* Confirmation modal — replaces Alert.alert which doesn't work on web */}
      <Modal
        visible={pendingAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingAction(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
              {pendingAction === 'confirmed' ? 'Confirm MDCN Verification' : 'Reject MDCN Verification'}
            </Text>
            <Text style={{ fontSize: 14, color: '#4b5563', marginBottom: 24, lineHeight: 20 }}>
              {pendingAction === 'confirmed'
                ? "This will manually confirm the physician's MDCN certificate. Proceed?"
                : "This will reject the physician's MDCN certificate. Proceed?"}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setPendingAction(null)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={executeOverride}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: pendingAction === 'confirmed' ? '#3b82f6' : '#ef4444' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                  {pendingAction === 'confirmed' ? 'Confirm' : 'Reject'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SectionHeader title="MDCN Verification" icon="shield-checkmark-outline" color="#0AADA2" />

      <View className="flex-row items-center mb-3">
        {badge()}
      </View>

      {overrideBy && (
        <Text className="text-xs text-gray-400 mb-1">
          Override by <Text className="font-semibold text-gray-600">{overrideBy}</Text>
          {overrideAt ? ` on ${overrideAt.slice(0, 10)}` : ''}
        </Text>
      )}

      {/* Inline result message */}
      {resultMsg && (
        <View className="flex-row items-center px-3 py-2 rounded-xl mb-2"
          style={{ backgroundColor: resultMsg.type === 'success' ? '#dcfce7' : '#fee2e2' }}>
          <Ionicons
            name={resultMsg.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={14}
            color={resultMsg.type === 'success' ? '#166534' : '#dc2626'}
          />
          <Text className="text-xs font-semibold ml-1.5"
            style={{ color: resultMsg.type === 'success' ? '#166534' : '#dc2626' }}>
            {resultMsg.text}
          </Text>
        </View>
      )}

      {/* Override action buttons */}
      <Text className="text-xs font-semibold text-gray-500 mb-2 mt-2">Admin Override</Text>
      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() => { setResultMsg(null); setPendingAction('confirmed'); }}
          disabled={loading || overrideStatus === 'confirmed'}
          className="flex-1 flex-row items-center justify-center py-2.5 rounded-xl border"
          style={{
            borderColor: overrideStatus === 'confirmed' ? '#93c5fd' : '#3b82f6',
            backgroundColor: overrideStatus === 'confirmed' ? '#eff6ff' : '#fff',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={16} color="#3b82f6" />
              <Text className="text-sm font-semibold text-blue-600 ml-1.5">Confirm</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { setResultMsg(null); setPendingAction('rejected'); }}
          disabled={loading || overrideStatus === 'rejected'}
          className="flex-1 flex-row items-center justify-center py-2.5 rounded-xl border"
          style={{
            borderColor: overrideStatus === 'rejected' ? '#fca5a5' : '#ef4444',
            backgroundColor: overrideStatus === 'rejected' ? '#fef2f2' : '#fff',
            opacity: (loading || overrideStatus === 'rejected') ? 0.6 : 1,
          }}
        >
          <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
          <Text className="text-sm font-semibold text-red-600 ml-1.5">Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditPhysicianModal({
  visible,
  physicianId,
  initial,
  onClose,
}: {
  visible: boolean;
  physicianId: string;
  initial: UpdatePhysicianInput;
  onClose: () => void;
}) {
  const updatePhysician = useAdminStore((s) => s.updatePhysician);
  const [form, setForm] = useState<UpdatePhysicianInput>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(initial); }, [initial]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePhysician(physicianId, form);
      Alert.alert('Saved', 'Physician profile updated.');
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: keyof UpdatePhysicianInput; label: string; placeholder: string }[] = [
    { key: 'name',              label: 'Full Name',           placeholder: 'Dr. John Doe' },
    { key: 'email',             label: 'Email',               placeholder: 'physician@hospital.com' },
    { key: 'specialization',    label: 'Specialization',      placeholder: 'e.g. Cardiology' },
    { key: 'phone',             label: 'Phone',               placeholder: '+234 800 000 0000' },
    { key: 'yearsOfExperience', label: 'Years of Experience', placeholder: '5' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
            <TouchableOpacity onPress={onClose} className="mr-3">
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
            <Text className="text-lg font-bold text-gray-900 flex-1">Edit Physician</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{ backgroundColor: '#0AADA2', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 6 }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text className="text-white font-semibold text-sm">Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
            {fields.map((f) => (
              <View key={f.key} className="mb-4">
                <Text className="text-sm font-semibold text-gray-700 mb-1">{f.label}</Text>
                <TextInput
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50"
                  placeholder={f.placeholder}
                  placeholderTextColor="#9ca3af"
                  value={form[f.key] ?? ''}
                  onChangeText={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                  autoCapitalize={f.key === 'email' ? 'none' : 'words'}
                  keyboardType={f.key === 'email' ? 'email-address' : 'default'}
                />
              </View>
            ))}
            <View className="h-8" />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PhysicianDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    selectedPhysician: physician,
    physicianLoading: loading,
    fetchPhysicianDetail,
    suspendPhysician,
    unsuspendPhysician,
    deletePhysician,
  } = useAdminStore();

  const [showEdit, setShowEdit] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspendPrompt, setShowSuspendPrompt] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(() => {
    if (id) fetchPhysicianDetail(id);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading || !physician) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#0AADA2" />
      </SafeAreaView>
    );
  }

  const isSuspended = physician.accountStatus === 'suspended';

  const handleSuspend = async () => {
    setActionLoading(true);
    try {
      await suspendPhysician(physician.id, suspendReason);
      setShowSuspendPrompt(false);
      setSuspendReason('');
      Alert.alert('Suspended', 'Physician account has been suspended.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to suspend account');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsuspend = () => {
    Alert.alert(
      'Reinstate Account',
      `Reinstate ${physician.name}'s account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reinstate',
          onPress: async () => {
            setActionLoading(true);
            try {
              await unsuspendPhysician(physician.id);
              Alert.alert('Reinstated', 'Physician account is now active.');
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message ?? 'Failed');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Account',
      `Permanently delete ${physician.name}'s account? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await deletePhysician(physician.id);
              router.back();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message ?? 'Failed to delete');
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      {/* Header */}
      <LinearGradient
        colors={['#0AADA2', '#07827A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }} numberOfLines={1}>
              {physician.name}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 }}>
              {physician.specialization || 'Physician'} · {isSuspended ? 'Suspended' : 'Active'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowEdit(true)}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
          >
            <Ionicons name="pencil-outline" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(239,68,68,0.3)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Status hero card */}
        <View
          className="bg-white rounded-2xl p-4 mb-3"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}
        >
          {/* Flag banner */}
          {physician.flagged && (
            <View className="flex-row items-center bg-red-50 rounded-xl px-3 py-2 mb-3 border border-red-100">
              <Ionicons name="flag" size={16} color="#dc2626" />
              <Text className="text-sm font-semibold text-red-700 ml-2 flex-1">
                Account Flagged
              </Text>
              {physician.flaggedAt && (
                <Text className="text-xs text-red-400">{physician.flaggedAt.slice(0, 10)}</Text>
              )}
            </View>
          )}
          {physician.flaggedReason ? (
            <Text className="text-xs text-red-600 mb-3 -mt-1">{physician.flaggedReason}</Text>
          ) : null}

          {/* Name / email */}
          <View className="flex-row items-start">
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#e6f7f6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#0AADA2' }}>
                {physician.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-lg font-bold text-gray-900">{physician.name}</Text>
              <Text className="text-sm text-gray-500">{physician.email}</Text>
              {physician.specialization ? (
                <Text style={{ fontSize: 12, color: '#0AADA2', marginTop: 2 }}>{physician.specialization}</Text>
              ) : null}
            </View>
          </View>

          {/* Status badges */}
          <View className="flex-row flex-wrap gap-2 mt-3 pt-3 border-t border-gray-50">
            {/* Account status */}
            <View
              className="flex-row items-center px-3 py-1 rounded-full"
              style={{ backgroundColor: isSuspended ? '#fee2e2' : '#dcfce7' }}
            >
              <Ionicons
                name={isSuspended ? 'ban-outline' : 'checkmark-circle-outline'}
                size={13}
                color={isSuspended ? '#dc2626' : '#16a34a'}
              />
              <Text
                className="text-xs font-bold ml-1"
                style={{ color: isSuspended ? '#dc2626' : '#16a34a' }}
              >
                {isSuspended ? 'SUSPENDED' : 'ACTIVE'}
              </Text>
            </View>

            {/* SLA breach badge */}
            {physician.slaBreachCountWeek > 0 && (
              <View
                className="flex-row items-center px-3 py-1 rounded-full"
                style={{
                  backgroundColor: physician.slaBreachCountWeek >= 3 ? '#fef2f2' : '#fff7ed',
                }}
              >
                <Ionicons
                  name="warning-outline"
                  size={13}
                  color={physician.slaBreachCountWeek >= 3 ? '#dc2626' : '#ea580c'}
                />
                <Text
                  className="text-xs font-bold ml-1"
                  style={{ color: physician.slaBreachCountWeek >= 3 ? '#dc2626' : '#ea580c' }}
                >
                  {physician.slaBreachCountWeek} SLA breach{physician.slaBreachCountWeek !== 1 ? 'es' : ''} (7d)
                </Text>
              </View>
            )}
          </View>

          {/* Stats */}
          <View className="flex-row mt-3 pt-3 border-t border-gray-50">
            {[
              { label: 'Active Cases',  value: physician.activeCases,    icon: 'folder-open-outline', color: '#6366f1' },
              { label: 'Completed',     value: physician.totalCompleted, icon: 'checkmark-done',      color: '#22c55e' },
            ].map((stat) => (
              <View key={stat.label} className="flex-1 items-center">
                <Ionicons name={stat.icon as any} size={18} color={stat.color} />
                <Text className="text-lg font-bold text-gray-900 mt-1">{stat.value}</Text>
                <Text className="text-[10px] text-gray-400">{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* MDCN Override panel */}
        <MDCNOverridePanel
          physicianId={physician.id}
          currentStatus={physician.mdcnVerified}
          overrideStatus={physician.mdcnOverrideStatus}
          overrideBy={physician.mdcnOverrideBy}
          overrideAt={physician.mdcnOverrideAt}
        />

        {/* Account details */}
        <View className="bg-white rounded-2xl p-4 mb-3"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <SectionHeader title="Account Details" icon="person-outline" color="#0AADA2" />
          <InfoRow label="Phone"            value={physician.phone} />
          <InfoRow label="Date of Birth"    value={physician.dob} />
          <InfoRow label="Gender"           value={physician.gender} />
          <InfoRow label="Experience"       value={physician.yearsOfExperience ? `${physician.yearsOfExperience} years` : undefined} />
          <InfoRow label="Certificate"      value={physician.certificateName} />
          <InfoRow label="Certificate ID"   value={physician.certificateId} mono />
          <InfoRow label="Issue Date"       value={physician.certificateIssueDate} />
          <InfoRow label="Member Since"     value={physician.createdAt?.slice(0, 10)} />
        </View>

        {/* Suspend / Reinstate action */}
        <View className="bg-white rounded-2xl p-4 mb-3"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <SectionHeader title="Account Actions" icon="settings-outline" color="#0AADA2" />

          {isSuspended ? (
            <TouchableOpacity
              onPress={handleUnsuspend}
              disabled={actionLoading}
              className="flex-row items-center justify-center py-3 rounded-xl bg-green-600"
              style={{ opacity: actionLoading ? 0.6 : 1 }}
            >
              {actionLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="refresh-circle-outline" size={18} color="#fff" />
                    <Text className="text-white font-bold text-sm ml-2">Reinstate Account</Text>
                  </>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => setShowSuspendPrompt(true)}
              disabled={actionLoading}
              className="flex-row items-center justify-center py-3 rounded-xl bg-red-600"
              style={{ opacity: actionLoading ? 0.6 : 1 }}
            >
              <Ionicons name="ban-outline" size={18} color="#fff" />
              <Text className="text-white font-bold text-sm ml-2">Suspend Account</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Case history */}
        <View className="bg-white rounded-2xl p-4 mb-6"
          style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <SectionHeader title="Case History" icon="folder-open-outline" color="#0AADA2" />
          {physician.recentCases.length === 0 ? (
            <Text className="text-sm text-gray-400 text-center py-4">No cases yet</Text>
          ) : (
            physician.recentCases.map((c) => <CaseHistoryRow key={c.id} item={c} />)
          )}
        </View>
      </ScrollView>

      {/* Suspend prompt modal */}
      <Modal
        visible={showSuspendPrompt}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSuspendPrompt(false)}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-end"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 bg-black/40" />
          <View className="bg-white rounded-t-3xl px-4 pt-4 pb-8">
            <Text className="text-lg font-bold text-gray-900 mb-1">Suspend Account</Text>
            <Text className="text-sm text-gray-500 mb-4">
              Provide a reason for suspension (optional but recommended).
            </Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50 mb-4"
              placeholder="Reason for suspension…"
              placeholderTextColor="#9ca3af"
              value={suspendReason}
              onChangeText={setSuspendReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowSuspendPrompt(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200"
              >
                <Text className="text-center font-semibold text-gray-700">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSuspend}
                disabled={actionLoading}
                className="flex-1 py-3 rounded-xl bg-red-600"
                style={{ opacity: actionLoading ? 0.6 : 1 }}
              >
                {actionLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text className="text-center font-bold text-white">Suspend</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit modal */}
      <EditPhysicianModal
        visible={showEdit}
        physicianId={physician.id}
        initial={{
          name:              physician.name,
          email:             physician.email,
          specialization:    physician.specialization,
          phone:             physician.phone,
          yearsOfExperience: physician.yearsOfExperience,
        }}
        onClose={() => setShowEdit(false)}
      />
    </SafeAreaView>
  );
}
