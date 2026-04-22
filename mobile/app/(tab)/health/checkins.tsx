import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  useCheckinStore,
  HourlySlot,
  getSlotQuestions,
  CheckinQuestion,
  CheckinAnswer,
} from 'stores/checkin-store';
import { useDiagnosisStore } from 'stores/diagnosis-store';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatUnlockTime(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h = hour % 12 || 12;
  return `${h}:00 ${period}`;
}

function getSlotStatus(slot: HourlySlot): 'claimed' | 'available' | 'locked' {
  if (slot.claimedDate === todayStr()) return 'claimed';
  if (new Date().getHours() >= slot.unlockHour) return 'available';
  return 'locked';
}

const SLOT_ICONS: Record<number, string> = {
  1: 'sunny-outline',
  2: 'partly-sunny-outline',
  3: 'restaurant-outline',
  4: 'cafe-outline',
  5: 'moon-outline',
  6: 'bed-outline',
};

export default function CheckinsScreen() {
  const { lifecoins, streak, slots, initialized, initialize, claimSlot } = useCheckinStore();
  const { diagnoses, fetchDiagnoses } = useDiagnosisStore();

  const latestDiagnosis = diagnoses[0] ?? null;
  const condition = latestDiagnosis?.condition ?? null;
  const hasPrescription = latestDiagnosis?.hasPrescription ?? false;

  const [activeSlot, setActiveSlot] = useState<HourlySlot | null>(null);
  const [questions, setQuestions] = useState<CheckinQuestion[]>([]);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<CheckinAnswer[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [toast, setToast] = useState<{ message: string; coins: number } | null>(null);

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  // Always re-fetch so physician-edited condition/urgency are current.
  useEffect(() => {
    fetchDiagnoses();
  }, []);

  const showToastMsg = useCallback((message: string, coins: number) => {
    setToast({ message, coins });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleSlotTap = (slot: HourlySlot) => {
    const status = getSlotStatus(slot);
    if (status === 'claimed') return;
    if (status === 'locked') {
      showToastMsg(`Unlocks at ${formatUnlockTime(slot.unlockHour)}`, 0);
      return;
    }
    const qs = getSlotQuestions(slot.id, condition, hasPrescription);
    setQuestions(qs);
    setQuestionIdx(0);
    setAnswers([]);
    setActiveSlot(slot);
    setShowModal(true);
  };

  const handleAnswer = async (value: string | number) => {
    const newAnswers: CheckinAnswer[] = [
      ...answers,
      { questionId: questions[questionIdx].id, value },
    ];
    if (questionIdx + 1 < questions.length) {
      setAnswers(newAnswers);
      setQuestionIdx(questionIdx + 1);
    } else {
      if (!activeSlot) return;
      setClaiming(true);
      const result = await claimSlot(activeSlot.id);
      setClaiming(false);
      setShowModal(false);
      if (result.success) {
        showToastMsg(`${activeSlot.label} complete!`, result.coinsEarned);
      }
    }
  };

  const handleBack = () => {
    if (questionIdx > 0) {
      setAnswers(answers.slice(0, -1));
      setQuestionIdx(questionIdx - 1);
    } else {
      setShowModal(false);
    }
  };

  const totalClaimed = slots.filter((s) => s.claimedDate === todayStr()).length;
  const totalAvailable = slots.filter((s) => getSlotStatus(s) === 'available').length;
  const todayEarned = totalClaimed * 3;

  const currentQuestion = questions[questionIdx];

  if (!initialized) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#080d1a', alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator size="large" color="#0AADA2" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#080d1a' }} edges={['top']}>
      {/* Toast */}
      {toast && (
        <View
          style={{
            position: 'absolute',
            top: 60,
            alignSelf: 'center',
            zIndex: 99,
            backgroundColor: toast.coins > 0 ? '#065f46' : '#1e3a5f',
            borderRadius: 24,
            paddingHorizontal: 20,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Ionicons
            name={toast.coins > 0 ? 'checkmark-circle' : 'lock-closed'}
            size={18}
            color={toast.coins > 0 ? '#6ee7b7' : '#93c5fd'}
          />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
            {toast.message}
            {toast.coins > 0 ? `  +${toast.coins} LC` : ''}
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <LinearGradient
          colors={['#0e4b4b', '#080d1a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ paddingTop: 16, paddingBottom: 32, paddingHorizontal: 20 }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.7)" />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' }}>
              Back
            </Text>
          </Pressable>

          <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4 }}>
            Health Check-ins
          </Text>
          {condition ? (
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
              Tracking your recovery from {condition}
            </Text>
          ) : (
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
              Complete each slot to earn Lifecoins and track your health
            </Text>
          )}

          {/* Stats row */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.07)',
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.5)',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: 4,
                }}
              >
                Lifecoins
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="heart" size={18} color="#fbbf24" />
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#fbbf24' }}>{lifecoins}</Text>
              </View>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.07)',
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.5)',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: 4,
                }}
              >
                Streak
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="flame" size={18} color="#fb923c" />
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#fb923c' }}>{streak}</Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                  days
                </Text>
              </View>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.07)',
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.5)',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: 4,
                }}
              >
                Today
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="heart" size={14} color="#fbbf24" />
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff' }}>+{todayEarned}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          {/* Section heading */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#e5e7eb' }}>
              Today's Check-in Slots
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>
              {totalClaimed}/{slots.length}
              {totalAvailable > 0 ? ` - ${totalAvailable} ready` : ''}
            </Text>
          </View>

          {/* Slot cards */}
          {slots.map((slot) => {
            const status = getSlotStatus(slot);
            return (
              <Pressable
                key={slot.id}
                onPress={() => handleSlotTap(slot)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor:
                    status === 'claimed'
                      ? 'rgba(22,163,74,0.1)'
                      : status === 'available'
                        ? 'rgba(10,173,162,0.08)'
                        : 'rgba(255,255,255,0.04)',
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor:
                    status === 'claimed'
                      ? 'rgba(134,239,172,0.3)'
                      : status === 'available'
                        ? 'rgba(10,173,162,0.4)'
                        : 'rgba(255,255,255,0.06)',
                  opacity: pressed ? 0.8 : 1,
                  marginBottom: 8,
                })}
              >
                {/* Slot icon */}
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor:
                      status === 'claimed'
                        ? 'rgba(22,163,74,0.2)'
                        : status === 'available'
                          ? 'rgba(10,173,162,0.2)'
                          : 'rgba(255,255,255,0.06)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                  }}
                >
                  <Ionicons
                    name={
                      (status === 'claimed'
                        ? 'checkmark-circle'
                        : status === 'locked'
                          ? 'lock-closed-outline'
                          : (SLOT_ICONS[slot.id] ?? 'time-outline')) as any
                    }
                    size={22}
                    color={
                      status === 'claimed'
                        ? '#4ade80'
                        : status === 'available'
                          ? '#0AADA2'
                          : '#4b5563'
                    }
                  />
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: status === 'locked' ? '#4b5563' : '#e5e7eb',
                      marginBottom: 2,
                    }}
                  >
                    {slot.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    {status === 'claimed'
                      ? 'Completed today'
                      : status === 'available'
                        ? 'Ready - tap to start check-in'
                        : `Unlocks at ${formatUnlockTime(slot.unlockHour)}`}
                  </Text>
                </View>

                {/* Coins badge */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor:
                      status === 'claimed'
                        ? 'rgba(22,163,74,0.2)'
                        : status === 'available'
                          ? 'rgba(251,191,36,0.15)'
                          : 'rgba(255,255,255,0.05)',
                    borderRadius: 10,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                  }}
                >
                  <Ionicons
                    name="heart"
                    size={12}
                    color={
                      status === 'claimed'
                        ? '#4ade80'
                        : status === 'available'
                          ? '#fbbf24'
                          : '#374151'
                    }
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color:
                        status === 'claimed'
                          ? '#4ade80'
                          : status === 'available'
                            ? '#fbbf24'
                            : '#374151',
                    }}
                  >
                    +{slot.coins}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          {/* Info card */}
          <View
            style={{
              backgroundColor: 'rgba(59,130,246,0.08)',
              borderRadius: 14,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 10,
              borderWidth: 1,
              borderColor: 'rgba(59,130,246,0.2)',
              marginTop: 8,
            }}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#60a5fa"
              style={{ marginTop: 1 }}
            />
            <Text style={{ flex: 1, fontSize: 12, color: '#93c5fd', lineHeight: 18 }}>
              Each check-in slot asks 2-3 health questions tailored to your condition. Complete a slot
              to earn 1 Lifecoin. Slots reset daily at midnight.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Question Modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={handleBack}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: '#0f172a',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 12,
              paddingBottom: 44,
              paddingHorizontal: 20,
              minHeight: 400,
            }}
          >
            {/* Drag handle */}
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: '#334155',
                alignSelf: 'center',
                marginBottom: 20,
              }}
            />

            {/* Slot name */}
            <Text
              style={{
                fontSize: 13,
                color: '#64748b',
                fontWeight: '600',
                textAlign: 'center',
                marginBottom: 6,
              }}
            >
              {activeSlot?.label ?? ''}
            </Text>

            {/* Progress dots */}
            {questions.length > 0 && (
              <View
                style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 24 }}
              >
                {questions.map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i === questionIdx ? 18 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: i <= questionIdx ? '#0AADA2' : '#1e293b',
                    }}
                  />
                ))}
              </View>
            )}

            {claiming ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
                <ActivityIndicator size="large" color="#0AADA2" />
                <Text style={{ color: '#94a3b8', fontSize: 14 }}>Claiming your reward...</Text>
              </View>
            ) : currentQuestion ? (
              <>
                {/* Question text */}
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: '#f1f5f9',
                    textAlign: 'center',
                    lineHeight: 26,
                    marginBottom: 28,
                  }}
                >
                  {currentQuestion.text}
                </Text>

                {/* Scale */}
                {currentQuestion.type === 'scale' && (
                  <View>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                      {Array.from({
                        length:
                          (currentQuestion.scaleMax ?? 5) - (currentQuestion.scaleMin ?? 1) + 1,
                      }).map((_, i) => {
                        const val = (currentQuestion.scaleMin ?? 1) + i;
                        return (
                          <Pressable
                            key={val}
                            onPress={() => handleAnswer(val)}
                            style={({ pressed }) => ({
                              flex: 1,
                              height: 52,
                              borderRadius: 12,
                              backgroundColor: pressed ? '#0AADA2' : '#1e293b',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 1,
                              borderColor: '#334155',
                            })}
                          >
                            <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>
                              {val}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {currentQuestion.scaleLabels && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 11, color: '#64748b' }}>
                          {currentQuestion.scaleLabels[0]}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748b' }}>
                          {currentQuestion.scaleLabels[1]}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Choice */}
                {currentQuestion.type === 'choice' && (
                  <View style={{ gap: 8 }}>
                    {(currentQuestion.options ?? []).map((opt) => (
                      <Pressable
                        key={opt}
                        onPress={() => handleAnswer(opt)}
                        style={({ pressed }) => ({
                          padding: 15,
                          borderRadius: 12,
                          backgroundColor: pressed ? '#0AADA2' : '#1e293b',
                          borderWidth: 1,
                          borderColor: '#334155',
                        })}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: '#f1f5f9',
                            textAlign: 'center',
                          }}
                        >
                          {opt}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* YesNo */}
                {currentQuestion.type === 'yesno' && (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Pressable
                      onPress={() => handleAnswer('yes')}
                      style={({ pressed }) => ({
                        flex: 1,
                        padding: 18,
                        borderRadius: 16,
                        backgroundColor: pressed ? '#16a34a' : 'rgba(22,163,74,0.15)',
                        borderWidth: 1.5,
                        borderColor: 'rgba(74,222,128,0.3)',
                        alignItems: 'center',
                      })}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={28}
                        color="#4ade80"
                        style={{ marginBottom: 6 }}
                      />
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#4ade80' }}>Yes</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleAnswer('no')}
                      style={({ pressed }) => ({
                        flex: 1,
                        padding: 18,
                        borderRadius: 16,
                        backgroundColor: pressed ? '#dc2626' : 'rgba(239,68,68,0.12)',
                        borderWidth: 1.5,
                        borderColor: 'rgba(248,113,113,0.3)',
                        alignItems: 'center',
                      })}
                    >
                      <Ionicons
                        name="close-circle"
                        size={28}
                        color="#f87171"
                        style={{ marginBottom: 6 }}
                      />
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#f87171' }}>No</Text>
                    </Pressable>
                  </View>
                )}

                {/* Back / Cancel */}
                <Pressable onPress={handleBack} style={{ marginTop: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>
                    {questionIdx > 0 ? 'Back' : 'Cancel'}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
