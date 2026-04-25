import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useOffersStore, Offer, OfferType } from 'stores/offers-store';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function daysLeft(dateStr: string): number {
  if (!dateStr) return 0;
  const ms = new Date(dateStr).getTime();
  if (isNaN(ms)) return 0;
  return Math.max(0, Math.ceil((ms - Date.now()) / 86_400_000));
}

const TYPE_META: Record<OfferType, { label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; color: string }> = {
  app_download:    { label: 'App Download',    icon: 'download-outline',           bg: '#eff6ff', color: '#1d4ed8' },
  product_trial:   { label: 'Product Trial',   icon: 'gift-outline',               bg: '#fef3c7', color: '#b45309' },
  signup:          { label: 'Service Sign-up', icon: 'person-add-outline',         bg: '#f0fdf4', color: '#15803d' },
};

// ── OfferCard ────────────────────────────────────────────────────────────────

function OfferCard({
  offer,
  onStart,
  onComplete,
}: {
  offer: Offer;
  onStart: () => void;
  onComplete: () => void;
}) {
  const meta = TYPE_META[offer.type];
  const done = offer.status === 'completed';
  const pending = offer.status === 'pending';
  const expired = offer.status === 'expired';
  const left = daysLeft(offer.expiresAt);

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 16,
        borderWidth: 1.5,
        borderColor: done ? '#bbf7d0' : pending ? `${offer.sponsorColor}55` : expired ? '#e5e7eb' : offer.sponsorColor + '44',
        shadowColor: offer.sponsorColor,
        shadowOpacity: done || expired ? 0.03 : 0.1,
        shadowRadius: 8,
        elevation: done || expired ? 1 : 3,
        gap: 12,
        opacity: expired ? 0.6 : 1,
      }}
    >
      {/* Header row: sponsor chip + expiry */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: offer.sponsorColor + '18',
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Ionicons name={offer.sponsorLogo as keyof typeof Ionicons.glyphMap} size={13} color={offer.sponsorColor} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: offer.sponsorColor }}>{offer.sponsor}</Text>
        </View>
        {!done && !expired && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: left <= 3 ? '#fef2f2' : '#f9fafb',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Ionicons name="time-outline" size={11} color={left <= 3 ? '#dc2626' : '#9ca3af'} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: left <= 3 ? '#dc2626' : '#9ca3af' }}>
              {left === 0 ? 'Expires today' : `${left}d left`}
            </Text>
          </View>
        )}
        {expired && (
          <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af' }}>Expired</Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: done ? '#d1fae5' : meta.bg,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: done ? '#86efac' : offer.sponsorColor + '33',
          }}
        >
          <Ionicons
            name={done ? 'checkmark-circle' : meta.icon}
            size={24}
            color={done ? '#16a34a' : offer.sponsorColor}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: expired ? '#9ca3af' : '#111827' }}>
            {offer.title}
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280', lineHeight: 18 }}>{offer.description}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: meta.bg,
                borderRadius: 10,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Ionicons name={meta.icon} size={11} color={meta.color} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: meta.color }}>{meta.label}</Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#fef3c7',
                borderRadius: 10,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Ionicons name="logo-bitcoin" size={11} color="#d97706" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#d97706' }}>+{offer.coins} Lifecoins</Text>
            </View>
          </View>
        </View>
      </View>

      {/* CTA */}
      {!done && !expired && !pending && (
        <Pressable
          onPress={onStart}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, borderRadius: 13, overflow: 'hidden' })}
        >
          <LinearGradient
            colors={[offer.sponsorColor, darken(offer.sponsorColor)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              borderRadius: 13,
              paddingVertical: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Ionicons name="open-outline" size={17} color="#fff" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{offer.ctaLabel}</Text>
          </LinearGradient>
        </Pressable>
      )}

      {/* Pending: waiting for user to confirm they completed it */}
      {pending && (
        <View style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: offer.sponsorColor + '12',
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: offer.sponsorColor + '33',
            }}
          >
            <Ionicons name="hourglass-outline" size={15} color={offer.sponsorColor} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: offer.sponsorColor, flex: 1 }}>
              Waiting for you to complete the task in the app
            </Text>
          </View>
          <Pressable
            onPress={onComplete}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              borderRadius: 13,
              backgroundColor: '#f0fdf4',
              borderWidth: 1.5,
              borderColor: '#86efac',
              paddingVertical: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            })}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#16a34a" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#15803d' }}>I Completed the Task</Text>
          </Pressable>
        </View>
      )}

      {/* Completed */}
      {done && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#f0fdf4',
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: '#bbf7d0',
          }}
        >
          <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#15803d' }}>
            Completed · +{offer.coins} Lifecoins earned
          </Text>
        </View>
      )}
    </View>
  );
}

// ── darken util ───────────────────────────────────────────────────────────────

function darken(hex: string): string {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (n >> 16) - 35);
    const g = Math.max(0, ((n >> 8) & 0xff) - 35);
    const b = Math.max(0, (n & 0xff) - 35);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return hex;
  }
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function OffersScreen() {
  const { lifecoins, totalEarned, offers, initialized, initialize, startOffer, completeOffer } =
    useOffersStore();

  const [completing, setCompleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; coins: number } | null>(null);

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  const showToast = useCallback((message: string, coins: number) => {
    setToast({ message, coins });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const handleStart = useCallback(
    (offer: Offer) => {
      startOffer(offer.id);
      Linking.openURL(offer.actionUrl).catch(() => {
        Alert.alert('Could not open link', 'Please visit the sponsor website manually.');
      });
    },
    [startOffer],
  );

  const handleComplete = useCallback(
    async (offer: Offer) => {
      setCompleting(offer.id);
      const result = await completeOffer(offer.id);
      setCompleting(null);
      if (result.alreadyDone) {
        Alert.alert('Already completed', 'You have already earned Lifecoins for this offer.');
      } else {
        showToast(`+${result.coinsEarned} Lifecoins earned!`, result.coinsEarned);
      }
    },
    [completeOffer, showToast],
  );

  const available = offers.filter((o) => o.status === 'available' || o.status === 'pending');
  const completed = offers.filter((o) => o.status === 'completed');
  const expired = offers.filter((o) => o.status === 'expired');

  const totalAvailable = offers.filter((o) => o.status === 'available').length;

  if (!initialized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <LinearGradient
        colors={['#7c3aed', '#4c1d95']}
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
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>Offers</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
              Complete tasks — earn Lifecoins
            </Text>
          </View>
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="logo-bitcoin" size={16} color="#fbbf24" />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>{lifecoins}</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'Available', value: totalAvailable, icon: 'gift-outline' as const, color: '#a78bfa' },
            { label: 'Completed', value: completed.length, icon: 'checkmark-circle-outline' as const, color: '#6ee7b7' },
            { label: 'Total Earned', value: `${totalEarned} LC`, icon: 'logo-bitcoin' as const, color: '#fbbf24' },
          ].map((s) => (
            <View
              key={s.label}
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Ionicons name={s.icon} size={18} color={s.color} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>{s.value}</Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '600' }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Body */}
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* How it works */}
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827' }}>How Offers Work</Text>
          <View style={{ gap: 8 }}>
            {[
              { icon: 'open-outline' as const, color: '#7c3aed', text: 'Tap an offer to open the sponsor\'s app or website' },
              { icon: 'checkmark-done-outline' as const, color: '#0ea5e9', text: 'Complete the required task (download, sign up, trial)' },
              { icon: 'logo-bitcoin' as const, color: '#d97706', text: 'Return here and tap "I Completed the Task" to claim Lifecoins' },
            ].map((step, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: step.color + '15',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={step.icon} size={15} color={step.color} />
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: '#6b7280', fontWeight: '500' }}>{step.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Available & Pending */}
        {available.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Active Offers ({available.length})
            </Text>
            {available.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                onStart={() => handleStart(offer)}
                onComplete={() => {
                  if (completing) return;
                  handleComplete(offer);
                }}
              />
            ))}
          </View>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Completed
              </Text>
              <View
                style={{
                  backgroundColor: '#d1fae5',
                  borderRadius: 8,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803d' }}>{completed.length}</Text>
              </View>
            </View>
            {completed.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                onStart={() => {}}
                onComplete={() => {}}
              />
            ))}
          </View>
        )}

        {/* Expired */}
        {expired.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: '#d1d5db',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Expired
            </Text>
            {expired.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                onStart={() => {}}
                onComplete={() => {}}
              />
            ))}
          </View>
        )}

        {/* Disclaimer */}
        <View
          style={{
            backgroundColor: '#f9fafb',
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: '#e5e7eb',
          }}
        >
          <Text style={{ fontSize: 11, color: '#9ca3af', lineHeight: 16, textAlign: 'center' }}>
            Offer completions are self-reported. Lifecoins are awarded in good faith and may be reversed if fraud is detected. Offer availability and Lifecoin values may change without notice.
          </Text>
        </View>
      </ScrollView>

      {/* Toast */}
      {toast && (
        <View
          style={{
            position: 'absolute',
            bottom: 40,
            left: 24,
            right: 24,
            backgroundColor: '#111827',
            borderRadius: 16,
            paddingVertical: 14,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <Ionicons name="logo-bitcoin" size={22} color="#fbbf24" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 }}>{toast.message}</Text>
          <View
            style={{
              backgroundColor: '#fbbf2422',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#fbbf24' }}>+{toast.coins} LC</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
