import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useLifeFundStore } from 'stores/lifefund-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import {
  LIFEFUND_CATEGORY_LABELS,
  type LifeFundExpenseCategory,
  type LifeFundRequestStatus,
} from 'types/lifefund-types';

const CATEGORIES = Object.keys(LIFEFUND_CATEGORY_LABELS) as LifeFundExpenseCategory[];

const STATUS_CFG: Record<LifeFundRequestStatus, { label: string; color: string; bg: string }> = {
  PENDING_REVIEW: { label: 'Under review', color: '#b45309', bg: '#fffbeb' },
  MORE_INFO_REQUIRED: { label: 'More info needed', color: '#b45309', bg: '#fffbeb' },
  APPROVED: { label: 'Approved', color: '#0369a1', bg: '#f0f9ff' },
  REJECTED: { label: 'Declined', color: '#b91c1c', bg: '#fef2f2' },
  AWAITING_ACCEPTANCE: { label: 'Accept terms', color: '#0369a1', bg: '#f0f9ff' },
  ACCEPTED: { label: 'Accepted', color: '#0369a1', bg: '#f0f9ff' },
  DISBURSED: { label: 'Disbursed', color: '#0f766e', bg: '#f0fdfa' },
  ACTIVE: { label: 'Active', color: '#0f766e', bg: '#f0fdfa' },
  COMPLETED: { label: 'Fully repaid', color: '#15803d', bg: '#f0fdf4' },
  OVERDUE: { label: 'Overdue', color: '#b91c1c', bg: '#fef2f2' },
  DEFAULTED: { label: 'Defaulted', color: '#b91c1c', bg: '#fef2f2' },
  CANCELLED: { label: 'Cancelled', color: '#6b7280', bg: '#f9fafb' },
  ESCALATED: { label: 'Escalated', color: '#7c3aed', bg: '#f5f3ff' },
  RESTRUCTURED: { label: 'Restructured', color: '#7c3aed', bg: '#f5f3ff' },
};

function money(n: number | undefined | null): string {
  return `₦${(n ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function LifeFundScreen() {
  const { request } = useLocalSearchParams<{ request?: string }>();
  const user = useAuthStore((state) => state.user);
  const updateBasicProfile = useProfileStore((state) => state.updateBasicProfile);
  const updatingProfile = useProfileStore((state) => state.loading);
  const {
    account,
    eligibility,
    requests,
    loadingAccount,
    loadingRequests,
    submitting,
    error,
    fetchAccount,
    fetchRequests,
    submitRequest,
    clearError,
  } = useLifeFundStore();

  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<LifeFundExpenseCategory>('HOSPITAL_BILL');
  const [amount, setAmount] = useState('');
  const [providerName, setProviderName] = useState('');
  const [providerAccount, setProviderAccount] = useState('');
  const [billReference, setBillReference] = useState('');
  const [purpose, setPurpose] = useState('');
  const [phone, setPhone] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (request === 'true') setShowForm(true);
    }, [request]),
  );

  useFocusEffect(
    useCallback(() => {
      fetchAccount();
      fetchRequests();
    }, [fetchAccount, fetchRequests])
  );

  const resetForm = () => {
    setAmount('');
    setProviderName('');
    setProviderAccount('');
    setBillReference('');
    setPurpose('');
    setCategory('HOSPITAL_BILL');
  };

  const handleSubmit = async () => {
    const requestedAmount = Number(amount);
    if (!requestedAmount || requestedAmount <= 0) {
      Alert.alert('Enter an amount', 'Please enter how much you need financed.');
      return;
    }
    if (!providerName.trim()) {
      Alert.alert('Provider required', 'Please enter the hospital or pharmacy name.');
      return;
    }
    const result = await submitRequest({
      expenseCategory: category,
      purposeDescription: purpose,
      healthcareProviderName: providerName,
      healthcareProviderAccount: providerAccount,
      billReference,
      requestedAmount,
    });
    if (result) {
      resetForm();
      setShowForm(false);
      Alert.alert('Request submitted', 'Your LifeFund request has been sent for review.');
    }
  };

  const handlePhoneSubmit = async () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      Alert.alert('Phone number required', 'Enter your phone number to continue with LifeFund eligibility.');
      return;
    }

    const updated = await updateBasicProfile({ phone: trimmedPhone });
    if (updated) {
      setPhone('');
      await fetchAccount();
      Alert.alert('Phone number saved', 'Your LifeFund eligibility has been updated.');
    }
  };

  const eligible = account?.status === 'ELIGIBLE';
  const availableLimit = account?.availableLimit ?? 0;
  const needsPhone = !user?.phone?.trim();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <LinearGradient
        colors={['#0f766e', '#115e59', '#0f3d3b']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 8, paddingBottom: 24, paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>LifeFund</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
              Healthcare should not wait for payday
              Flexible support for essential healthcare
            </Text>
          </View>
          {loadingAccount && <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <View style={{ backgroundColor: '#5eead4', width: 8, height: 8, borderRadius: 4 }} />
          <Text style={{ color: '#ccfbf1', fontSize: 11, fontWeight: '800', letterSpacing: 0.9 }}>CARE FINANCING, MADE CLEAR</Text>
        </View>

        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.12)',
            borderRadius: 16,
            padding: 16,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>
              Available to finance
            </Text>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.18)',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
                {account?.status ?? '—'}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 30, fontWeight: '900', color: '#fff' }}>{money(availableLimit)}</Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 17 }}>
            Apply for eligible hospital, diagnostic and pharmacy bills. Review every term before you accept.
          </Text>
          {account && account.outstandingBalance > 0 && (
            <Text style={{ fontSize: 12, color: '#fecaca', fontWeight: '600' }}>
              Outstanding: {money(account.outstandingBalance)}
            </Text>
          )}
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { icon: 'document-text-outline' as const, title: 'Apply', copy: 'Tell us about your bill' },
            { icon: 'shield-checkmark-outline' as const, title: 'Review', copy: 'Clear, fair assessment' },
            { icon: 'heart-outline' as const, title: 'Care', copy: 'Pay your provider directly' },
          ].map((step, index) => (
            <View key={step.title} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 11, borderWidth: 1, borderColor: '#e5e7eb' }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#ccfbf1', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}>
                <Ionicons name={step.icon} size={14} color="#0f766e" />
              </View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#134e4a' }}>{index + 1}. {step.title}</Text>
              <Text style={{ fontSize: 10, lineHeight: 14, color: '#6b7280', marginTop: 2 }}>{step.copy}</Text>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#d1fae5', shadowColor: '#0f766e', shadowOpacity: 0.08, shadowRadius: 12, elevation: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#ccfbf1', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="medical-outline" size={20} color="#0f766e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#134e4a' }}>Focus on getting the care you need.</Text>
              <Text style={{ fontSize: 12, color: '#64748b', lineHeight: 18, marginTop: 3 }}>LifeFund helps eligible members request financing for verified health expenses—not cash advances.</Text>
            </View>
          </View>
        </View>

        {error && (
          <View
            style={{
              backgroundColor: '#fef2f2',
              borderRadius: 14,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderWidth: 1,
              borderColor: '#fecaca',
            }}
          >
            <Ionicons name="warning-outline" size={18} color="#dc2626" />
            <Text style={{ flex: 1, fontSize: 13, color: '#dc2626', fontWeight: '600' }}>{error}</Text>
            <Pressable onPress={clearError} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Ionicons name="close" size={16} color="#dc2626" />
            </Pressable>
          </View>
        )}

        {needsPhone ? (
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#fde68a', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="call-outline" size={20} color="#b45309" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400e' }}>Add a phone number to continue</Text>
                <Text style={{ fontSize: 12, color: '#92400e', lineHeight: 17, marginTop: 3 }}>LifeFund eligibility requires a phone number on your profile. Your email address is not required.</Text>
              </View>
            </View>
            <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="e.g. 08012345678" />
            <Pressable
              onPress={handlePhoneSubmit}
              disabled={updatingProfile}
              style={{ alignItems: 'center', borderRadius: 12, paddingVertical: 12, backgroundColor: '#0f766e', opacity: updatingProfile ? 0.6 : 1 }}
            >
              {updatingProfile ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Save phone number</Text>}
            </Pressable>
          </View>
        ) : eligibility && !eligible && (
          <View
            style={{
              backgroundColor: '#fffbeb',
              borderRadius: 14,
              padding: 14,
              flexDirection: 'row',
              gap: 10,
              borderWidth: 1,
              borderColor: '#fde68a',
            }}
          >
            <Ionicons name="information-circle-outline" size={20} color="#b45309" />
            <Text style={{ flex: 1, fontSize: 13, color: '#92400e', fontWeight: '600' }}>
              {eligibility.reason}
            </Text>
          </View>
        )}

        {eligible && (
          <View style={{ backgroundColor: '#ecfdf5', borderRadius: 14, padding: 13, flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: '#a7f3d0' }}>
            <Ionicons name="checkmark-circle" size={20} color="#047857" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#065f46' }}>You can request healthcare financing</Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: '#047857', marginTop: 2 }}>Use it for eligible hospital, pharmacy and diagnostic bills up to your available limit.</Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: '#047857', marginTop: 2 }}>LifeGate Official will contact you for an eligibility interview.</Text>
            </View>
          </View>
        )}

        {/* New request CTA / form */}
        {!needsPhone && !showForm ? (
          <Pressable
            disabled={!eligible}
            onPress={() => setShowForm(true)}
            style={({ pressed }) => ({
              opacity: !eligible ? 0.5 : pressed ? 0.85 : 1,
              borderRadius: 14,
              overflow: 'hidden',
            })}
          >
            <LinearGradient
              colors={['#0f766e', '#115e59']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Request LifeFund Financing</Text>
            </LinearGradient>
          </Pressable>
        ) : !needsPhone ? (
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>New LifeFund Request</Text>
            <Text style={{ fontSize: 12, color: '#64748b', lineHeight: 17 }}>Share the provider and bill details so we can review your request. Submitting does not guarantee approval.</Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>Expense category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      backgroundColor: category === cat ? '#0f766e' : '#f3f4f6',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: category === cat ? '#fff' : '#374151' }}>
                      {LIFEFUND_CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Field label="Amount needed (₦)" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="e.g. 12000" />
            <Field label="Healthcare provider name" value={providerName} onChangeText={setProviderName} placeholder="e.g. St. Mary's Hospital" />
            <Field label="Provider account no. (for disbursement)" value={providerAccount} onChangeText={setProviderAccount} placeholder="Optional" />
            <Field label="Bill / invoice reference" value={billReference} onChangeText={setBillReference} placeholder="Optional" />
            <Field label="What is this for?" value={purpose} onChangeText={setPurpose} placeholder="Short description" multiline />

            {availableLimit > 0 && (
              <Text style={{ fontSize: 11, color: '#6b7280' }}>
                Your current available limit is {money(availableLimit)}.
              </Text>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#f0fdfa', borderRadius: 10, padding: 10 }}>
              <Ionicons name="information-circle-outline" size={16} color="#0f766e" />
              <Text style={{ flex: 1, fontSize: 11, lineHeight: 16, color: '#115e59' }}>LifeFund is healthcare financing. If approved, repayment terms and any charges are shown for your review before you accept.</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => {
                  setShowForm(false);
                  resetForm();
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: '#f3f4f6',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: '#0f766e',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Submit request</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Request history */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>Your requests</Text>
          {loadingRequests && requests.length === 0 && <ActivityIndicator size="small" color="#0f766e" />}
          {!loadingRequests && requests.length === 0 && (
            <Text style={{ fontSize: 13, color: '#6b7280' }}>No LifeFund requests yet.</Text>
          )}
          {requests.map((r) => {
            const cfg = STATUS_CFG[r.status];
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: '/(tab)/health/lifefund-detail', params: { id: r.id } })}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  backgroundColor: '#fff',
                  borderRadius: 14,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  gap: 6,
                })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>
                    {LIFEFUND_CATEGORY_LABELS[r.expenseCategory]}
                  </Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: cfg.bg }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: '#6b7280' }}>{r.healthcareProviderName}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                    {money(r.approvedAmount ?? r.requestedAmount)}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(r.createdAt)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  multiline,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280' }}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#9ca3af"
        style={{
          borderWidth: 1,
          borderColor: '#e5e7eb',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 10,
          fontSize: 14,
          color: '#111827',
          minHeight: multiline ? 70 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}
