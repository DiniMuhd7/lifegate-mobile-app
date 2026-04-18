import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCheckinStore, HourlySlot } from 'stores/checkin-store';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatUnlockTime(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h = hour % 12 || 12;
  return `${h}:00 ${period}`;
}

function getSlotStatus(slot: HourlySlot): 'claimed' | 'available' | 'locked' {
  const today = todayStr();
  if (slot.claimedDate === today) return 'claimed';
  if (new Date().getHours() >= slot.unlockHour) return 'available';
  return 'locked';
}

export default function CheckinsScreen() {
  const { lifecoins, streak, lastDailyCheckinDate, slots, initialized, initialize, dailyCheckin, claimSlot } =
    useCheckinStore();

  const [claiming, setClaiming] = useState<number | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [toast, setToast] = useState<{ message: string; coins: number } | null>(null);

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  const showToast = useCallback((message: string, coins: number) => {
    setToast({ message, coins });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleDailyCheckin = async () => {
    setCheckingIn(true);
    const result = await dailyCheckin();
    setCheckingIn(false);
    if (result.alreadyDone) {
      Alert.alert('Already checked in', 'Come back tomorrow for your next daily Lifecoin!');
    } else {
      showToast(`Daily check-in complete!`, result.coinsEarned);
    }
  };

  const handleClaimSlot = async (slot: HourlySlot) => {
    const status = getSlotStatus(slot);
    if (status === 'claimed') return;
    if (status === 'locked') {
      Alert.alert('Locked', `This reward unlocks at ${formatUnlockTime(slot.unlockHour)}.`);
      return;
    }
    setClaiming(slot.id);
    const result = await claimSlot(slot.id);
    setClaiming(null);
    if (result.success) {
      showToast(`${slot.label} claimed!`, result.coinsEarned);
    }
  };

  const dailyDone = lastDailyCheckinDate === todayStr();
  const totalTodayClaimed = slots.filter((s) => s.claimedDate === todayStr()).length;
  const totalAvailable = slots.filter((s) => getSlotStatus(s) === 'available').length;

  if (!initialized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0AADA2" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      {/* Toast */}
      {toast && (
        <View
          style={{
            position: 'absolute',
            top: 60,
            alignSelf: 'center',
            zIndex: 99,
            backgroundColor: '#065f46',
            borderRadius: 24,
            paddingHorizontal: 20,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Ionicons name="checkmark-circle" size={18} color="#6ee7b7" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
            {toast.message} +{toast.coins} Lifecoin{toast.coins !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header */}
        <LinearGradient
          colors={['#0AADA2', '#043B3C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: 16, paddingBottom: 28, paddingHorizontal: 20 }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.85)" />
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' }}>Back</Text>
          </Pressable>

          <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 }}>Check-ins</Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 20 }}>
            Check in daily &amp; claim hourly rewards to earn Lifecoins.
          </Text>

          {/* Lifecoin balance */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 18,
              padding: 16,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="logo-bitcoin" size={26} color="#fbbf24" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Total Lifecoins
              </Text>
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#fbbf24' }}>{lifecoins}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Streak
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="flame" size={16} color="#fb923c" />
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff' }}>{streak}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 20 }}>
          {/* Daily Check-in Card */}
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: dailyDone ? '#bbf7d0' : '#e5e7eb',
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 6,
              elevation: 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: dailyDone ? '#dcfce7' : '#f0fdfa',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={dailyDone ? 'checkmark-circle' : 'calendar-outline'} size={22} color={dailyDone ? '#16a34a' : '#0AADA2'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>Daily Check-in</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                  {dailyDone ? 'You\'ve checked in today' : 'Open the app daily to earn Lifecoins'}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#fef3c7',
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Ionicons name="logo-bitcoin" size={13} color="#d97706" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#d97706' }}>+1</Text>
              </View>
            </View>

            {/* Streak row */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <View
                  key={day}
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: day <= streak % 7 || (streak > 0 && streak % 7 === 0) ? '#0AADA2' : '#e5e7eb',
                  }}
                />
              ))}
            </View>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 14 }}>
              {streak > 0 ? `${streak}-day streak — keep it up!` : 'Start your streak today!'}
            </Text>

            <Pressable
              onPress={handleDailyCheckin}
              disabled={dailyDone || checkingIn}
              style={({ pressed }) => ({
                borderRadius: 14,
                overflow: 'hidden',
                opacity: dailyDone ? 0.6 : pressed ? 0.85 : 1,
              })}
            >
              <LinearGradient
                colors={dailyDone ? ['#d1fae5', '#d1fae5'] : ['#0AADA2', '#0369a1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
              >
                {checkingIn ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name={dailyDone ? 'checkmark-circle' : 'checkmark-circle-outline'}
                      size={18}
                      color={dailyDone ? '#16a34a' : '#fff'}
                    />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: dailyDone ? '#16a34a' : '#fff' }}>
                      {dailyDone ? 'Checked In' : 'Check In Now'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          {/* Hourly Rewards */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>Today's Rewards</Text>
              <Text style={{ fontSize: 12, color: '#6b7280' }}>
                {totalTodayClaimed}/{slots.length} claimed
                {totalAvailable > 0 ? ` · ${totalAvailable} ready` : ''}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {slots.map((slot) => {
                const status = getSlotStatus(slot);
                const isClaiming = claiming === slot.id;
                return (
                  <Pressable
                    key={slot.id}
                    onPress={() => handleClaimSlot(slot)}
                    disabled={isClaiming}
                    style={({ pressed }) => ({
                      width: '47%',
                      opacity: pressed ? 0.85 : 1,
                      backgroundColor:
                        status === 'claimed' ? '#f0fdf4' :
                        status === 'available' ? '#fff' : '#f9fafb',
                      borderRadius: 16,
                      padding: 14,
                      borderWidth: 1.5,
                      borderColor:
                        status === 'claimed' ? '#86efac' :
                        status === 'available' ? '#0AADA2' : '#e5e7eb',
                      shadowColor: status === 'available' ? '#0AADA2' : '#000',
                      shadowOpacity: status === 'available' ? 0.12 : 0.04,
                      shadowRadius: 6,
                      elevation: status === 'available' ? 3 : 1,
                    })}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor:
                            status === 'claimed' ? '#dcfce7' :
                            status === 'available' ? '#f0fdfa' : '#f3f4f6',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isClaiming ? (
                          <ActivityIndicator size="small" color="#0AADA2" />
                        ) : (
                          <Ionicons
                            name={
                              status === 'claimed' ? 'checkmark-circle' :
                              status === 'available' ? 'gift-outline' : 'lock-closed-outline'
                            }
                            size={18}
                            color={
                              status === 'claimed' ? '#16a34a' :
                              status === 'available' ? '#0AADA2' : '#9ca3af'
                            }
                          />
                        )}
                      </View>
                      <View
                        style={{
                          backgroundColor:
                            status === 'claimed' ? '#dcfce7' :
                            status === 'available' ? '#fef3c7' : '#f3f4f6',
                          borderRadius: 10,
                          paddingHorizontal: 7,
                          paddingVertical: 3,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <Ionicons name="logo-bitcoin" size={11} color={status === 'claimed' ? '#16a34a' : status === 'available' ? '#d97706' : '#9ca3af'} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: status === 'claimed' ? '#16a34a' : status === 'available' ? '#d97706' : '#9ca3af' }}>
                          +{slot.coins}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: status === 'locked' ? '#9ca3af' : '#111827',
                        marginBottom: 3,
                      }}
                    >
                      {slot.label}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>
                      {status === 'claimed'
                        ? 'Claimed today'
                        : status === 'available'
                          ? 'Tap to claim'
                          : `Unlocks at ${formatUnlockTime(slot.unlockHour)}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Info Footer */}
          <View
            style={{
              backgroundColor: '#eff6ff',
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 10,
              borderWidth: 1,
              borderColor: '#bfdbfe',
            }}
          >
            <Ionicons name="information-circle-outline" size={18} color="#3b82f6" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, color: '#1e40af', lineHeight: 18 }}>
              Rewards reset daily at midnight. Maintain your streak for bonus Lifecoins every 7 days. Lifecoins can be redeemed for health benefits and offers.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
