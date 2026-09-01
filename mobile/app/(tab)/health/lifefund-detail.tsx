import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useLifeFundStore } from 'stores/lifefund-store';
import { LIFEFUND_CATEGORY_LABELS } from 'types/lifefund-types';

function money(n: number | undefined | null): string {
  return `₦${(n ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ fontSize: 13, color: '#6b7280' }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{value}</Text>
    </View>
  );
}

export default function LifeFundDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeRequest, error, fetchRequest, acceptAgreement, payInstallment, clearError } = useLifeFundStore();
  const [accepting, setAccepting] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id) fetchRequest(id);
    }, [id, fetchRequest])
  );

  if (!activeRequest) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0f766e" />
      </SafeAreaView>
    );
  }

  const req = activeRequest;
  const terms = req.agreementTerms;

  const handleAccept = async () => {
    setAccepting(true);
    const ok = await acceptAgreement(req.id);
    setAccepting(false);
    if (ok) {
      Alert.alert('Terms accepted', 'Your LifeFund financing will be disbursed shortly.');
    }
  };

  const handlePay = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Enter an amount', 'Please enter how much you want to repay.');
      return;
    }
    setPaying(true);
    const ok = await payInstallment(req.id, amount);
    setPaying(false);
    if (ok) {
      setPayAmount('');
      setShowPayForm(false);
      Alert.alert('Repayment recorded', 'Thank you — your LifeFund balance has been updated.');
    }
  };

  const nextInstallment = req.schedule?.find((s) => s.status === 'PENDING' || s.status === 'OVERDUE' || s.status === 'PARTIAL');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <LinearGradient
        colors={['#0f766e', '#134e4a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 8, paddingBottom: 20, paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>
              {LIFEFUND_CATEGORY_LABELS[req.expenseCategory]}
            </Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{req.healthcareProviderName}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
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
            <Pressable onPress={clearError}>
              <Ionicons name="close" size={16} color="#dc2626" />
            </Pressable>
          </View>
        )}

        {/* Status + amounts */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' }}>
          <Row label="Status" value={req.status.replace(/_/g, ' ')} />
          <Row label="Requested amount" value={money(req.requestedAmount)} />
          {req.approvedAmount != null && <Row label="Approved amount" value={money(req.approvedAmount)} />}
          {req.totalRepayable != null && <Row label="Total repayable" value={money(req.totalRepayable)} />}
          <Row label="Outstanding balance" value={money(req.outstandingBalance)} />
          {req.billReference ? <Row label="Bill reference" value={req.billReference} /> : null}
        </View>

        {/* Agreement — shown when awaiting acceptance */}
        {req.status === 'AWAITING_ACCEPTANCE' && terms && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#bae6fd', gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 6 }}>
              Financing Agreement
            </Text>
            <Row label="Amount financed" value={money(terms.amountFinanced)} />
            <Row label="Financing charge" value={`${terms.financingChargePct}% (${money(terms.financingChargeAmount)})`} />
            {terms.feeAmount > 0 && <Row label="Fees" value={money(terms.feeAmount)} />}
            <Row label="Total repayment amount" value={money(terms.totalRepaymentAmount)} />
            <Row label="Installments" value={`${terms.installmentsCount} × every ${terms.repaymentFrequencyDays} days`} />
            <Row label="First repayment" value={formatDate(terms.firstRepaymentDate)} />
            <Row label="Final repayment" value={formatDate(terms.finalRepaymentDate)} />
            <Row label="Cooling-off period" value={`${terms.coolingOffHours} hours`} />
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>{terms.latePaymentConsequence}</Text>
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>{terms.termsAndConditions}</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
              Complaints: {terms.complaintProcess}
            </Text>

            <Pressable
              onPress={handleAccept}
              disabled={accepting}
              style={{
                marginTop: 14,
                borderRadius: 12,
                overflow: 'hidden',
                opacity: accepting ? 0.6 : 1,
              }}
            >
              <LinearGradient colors={['#0f766e', '#115e59']} style={{ paddingVertical: 14, alignItems: 'center' }}>
                {accepting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>
                    I accept these financing terms
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {/* Repayment schedule */}
        {req.schedule && req.schedule.length > 0 && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb', gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 4 }}>
              Repayment Schedule
            </Text>
            {req.schedule.map((s) => (
              <View
                key={s.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: '#f3f4f6',
                }}
              >
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                    Installment {s.installmentNo}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>Due {formatDate(s.dueDate)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{money(s.amountDue)}</Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: s.status === 'PAID' ? '#15803d' : s.status === 'OVERDUE' ? '#b91c1c' : '#b45309',
                    }}
                  >
                    {s.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Repayment action */}
        {(req.status === 'ACTIVE' || req.status === 'DISBURSED' || req.status === 'OVERDUE') && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb', gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>Make a repayment</Text>
            {nextInstallment && (
              <Text style={{ fontSize: 12, color: '#6b7280' }}>
                Next due: {money(nextInstallment.amountDue - nextInstallment.amountPaid)} on{' '}
                {formatDate(nextInstallment.dueDate)}
              </Text>
            )}
            {!showPayForm ? (
              <Pressable
                onPress={() => setShowPayForm(true)}
                style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: '#0f766e', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Repay now</Text>
              </Pressable>
            ) : (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={payAmount}
                  onChangeText={setPayAmount}
                  placeholder="Amount (₦)"
                  keyboardType="numeric"
                  placeholderTextColor="#9ca3af"
                  style={{
                    borderWidth: 1,
                    borderColor: '#e5e7eb',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: '#111827',
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => setShowPayForm(false)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handlePay}
                    disabled={paying}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#0f766e', alignItems: 'center', opacity: paying ? 0.6 : 1 }}
                  >
                    {paying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Confirm payment</Text>}
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        {req.adminNotes ? (
          <View style={{ backgroundColor: '#fffbeb', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#fde68a' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e', marginBottom: 4 }}>Note from LifeGate</Text>
            <Text style={{ fontSize: 13, color: '#92400e' }}>{req.adminNotes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
