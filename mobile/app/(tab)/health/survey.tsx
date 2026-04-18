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
import { useSurveyStore, Survey, SurveyQuestion } from 'stores/survey-store';

// ── Provider badge colour map ─────────────────────────────────────────────────

const PROVIDER_STYLE: Record<string, { bg: string; color: string }> = {
  Pollfish:   { bg: '#fef3c7', color: '#d97706' },
  InBrain:    { bg: '#e0f2fe', color: '#0369a1' },
  BitLabs:    { bg: '#d1fae5', color: '#065f46' },
  TapResearch:{ bg: '#ede9fe', color: '#6d28d9' },
};

// ── Category colour map ───────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { color: string; bg: string }> = {
  'Health & Wellness': { color: '#0891b2', bg: '#e0f2fe' },
  'Mental Health':     { color: '#7c3aed', bg: '#ede9fe' },
  Research:            { color: '#d97706', bg: '#fef3c7' },
  Product:             { color: '#059669', bg: '#d1fae5' },
};
function catStyle(cat: string) {
  return CATEGORY_STYLE[cat] ?? { color: '#6b7280', bg: '#f3f4f6' };
}

// ── Survey List ───────────────────────────────────────────────────────────────

function SurveyList({
  surveys,
  onStart,
}: {
  surveys: Survey[];
  onStart: (survey: Survey) => void;
}) {
  const totalCoinsEarned = useSurveyStore((s) => s.totalCoinsEarned);
  const sponsored = surveys.filter((s) => s.sponsored);
  const organic = surveys.filter((s) => !s.sponsored);
  const availableSponsored = sponsored.filter((s) => !s.completedDate);
  const completedSponsored = sponsored.filter((s) => s.completedDate);
  const availableOrganic = organic.filter((s) => !s.completedDate);
  const completedOrganic = organic.filter((s) => s.completedDate);
  const totalAvailable = availableSponsored.length + availableOrganic.length;
  const totalCompleted = completedSponsored.length + completedOrganic.length;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <LinearGradient
        colors={['#7c3aed', '#4c1d95']}
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

        <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 }}>Surveys</Text>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 20 }}>
          Participate in market research and earn Lifecoins for your time.
        </Text>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: 14,
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="logo-bitcoin" size={20} color="#fbbf24" />
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fbbf24' }}>{totalCoinsEarned}</Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' }}>Earned</Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: 14,
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#a78bfa" />
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff' }}>{totalCompleted}</Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' }}>Completed</Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: 14,
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="clipboard-outline" size={20} color="#c4b5fd" />
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff' }}>{totalAvailable}</Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' }}>Available</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
        {/* Sponsored surveys */}
        {availableSponsored.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Ionicons name="star" size={11} color="#d97706" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#d97706', textTransform: 'uppercase', letterSpacing: 0.8 }}>Sponsored</Text>
              </View>
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>Higher rewards · Brand research</Text>
            </View>
            {availableSponsored.map((survey) => (
              <SurveyCard key={survey.id} survey={survey} onStart={() => onStart(survey)} />
            ))}
          </>
        )}

        {/* Organic available */}
        {availableOrganic.length > 0 && (
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: availableSponsored.length > 0 ? 8 : 0, marginBottom: 4 }}>
              Community Surveys
            </Text>
            {availableOrganic.map((survey) => (
              <SurveyCard key={survey.id} survey={survey} onStart={() => onStart(survey)} />
            ))}
          </>
        )}

        {/* Completed */}
        {(completedSponsored.length > 0 || completedOrganic.length > 0) && (
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8, marginBottom: 4 }}>
              Completed
            </Text>
            {[...completedSponsored, ...completedOrganic].map((survey) => (
              <SurveyCard key={survey.id} survey={survey} />
            ))}
          </>
        )}

        {totalAvailable === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
            <Ionicons name="checkmark-circle" size={48} color="#a78bfa" />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>All done!</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
              You've completed all available surveys. Check back later for new ones.
            </Text>
          </View>
        )}

        {/* Provider disclaimer */}
        <View style={{ backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Ionicons name="shield-checkmark-outline" size={15} color="#64748b" style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 11, color: '#64748b', lineHeight: 17 }}>
            Sponsored surveys are served by verified research partners — Pollfish, InBrain, BitLabs, and Tap Research. Your responses are anonymised and used solely for market research.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function SurveyCard({ survey, onStart }: { survey: Survey; onStart?: () => void }) {
  const done = !!survey.completedDate;
  const cat = catStyle(survey.category);
  const providerStyle = survey.provider ? (PROVIDER_STYLE[survey.provider] ?? { bg: '#f3f4f6', color: '#6b7280' }) : null;
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 16,
        borderWidth: survey.sponsored ? 1.5 : 1,
        borderColor: done ? '#d1fae5' : survey.sponsored ? (survey.sponsorAccentColor ?? '#e5e7eb') : '#e5e7eb',
        shadowColor: survey.sponsored ? (survey.sponsorAccentColor ?? '#000') : '#000',
        shadowOpacity: survey.sponsored ? 0.08 : 0.04,
        shadowRadius: 6,
        elevation: survey.sponsored ? 3 : 2,
        gap: 12,
      }}
    >
      {/* Sponsored header row */}
      {survey.sponsored && !done && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Ionicons name="star" size={11} color="#d97706" />
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#d97706' }}>SPONSORED</Text>
          </View>
          {providerStyle && survey.providerLabel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: providerStyle.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: providerStyle.color }}>{survey.providerLabel}</Text>
            </View>
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: done ? '#d1fae5' : survey.sponsored ? `${survey.sponsorAccentColor}22` : cat.bg,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: survey.sponsored && !done ? 1.5 : 0,
            borderColor: survey.sponsored && !done ? (survey.sponsorAccentColor ?? 'transparent') : 'transparent',
          }}
        >
          <Ionicons
            name={done ? 'checkmark-circle' : survey.sponsored ? 'star-outline' : 'clipboard-outline'}
            size={22}
            color={done ? '#16a34a' : survey.sponsored ? (survey.sponsorAccentColor ?? cat.color) : cat.color}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          {survey.sponsorName && !done && (
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af' }}>by {survey.sponsorName}</Text>
          )}
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>{survey.title}</Text>
          <Text style={{ fontSize: 12, color: '#6b7280', lineHeight: 17 }}>{survey.description}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: cat.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Ionicons name="pricetag-outline" size={11} color={cat.color} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: cat.color }}>{survey.category}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Ionicons name="logo-bitcoin" size={11} color="#d97706" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#d97706' }}>+{survey.coins} Lifecoins</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Ionicons name="time-outline" size={11} color="#6b7280" />
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280' }}>{survey.estimatedMinutes} min</Text>
            </View>
          </View>
        </View>
      </View>

      {!done && onStart && (
        <Pressable
          onPress={onStart}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, borderRadius: 12, overflow: 'hidden' })}
        >
          <LinearGradient
            colors={survey.sponsored && survey.sponsorAccentColor
              ? [survey.sponsorAccentColor, adjustColor(survey.sponsorAccentColor)]
              : ['#7c3aed', '#4c1d95']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
          >
            <Ionicons name="play-circle-outline" size={18} color="#fff" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Start Survey</Text>
          </LinearGradient>
        </Pressable>
      )}

      {done && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#bbf7d0' }}>
          <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#15803d' }}>Completed · +{survey.coins} Lifecoins earned</Text>
        </View>
      )}
    </View>
  );
}

/** Darkens a hex colour slightly for gradient end stop */
function adjustColor(hex: string): string {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (n >> 16) - 30);
    const g = Math.max(0, ((n >> 8) & 0xff) - 30);
    const b = Math.max(0, (n & 0xff) - 30);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return hex;
  }
}

// ── Survey Flow ───────────────────────────────────────────────────────────────

function SurveyFlow({
  survey,
  onComplete,
  onCancel,
}: {
  survey: Survey;
  onComplete: (coins: number) => void;
  onCancel: () => void;
}) {
  const completeSurvey = useSurveyStore((s) => s.completeSurvey);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [submitting, setSubmitting] = useState(false);

  const question = survey.questions[currentIndex];
  const isLast = currentIndex === survey.questions.length - 1;
  const progress = (currentIndex + 1) / survey.questions.length;

  const answer = answers[question.id];
  const hasAnswer =
    question.type === 'scale'
      ? answer !== undefined
      : question.type === 'multi'
        ? Array.isArray(answer) && (answer as string[]).length > 0
        : !!answer;

  const toggleMulti = (opt: string) => {
    const current = (answers[question.id] as string[]) ?? [];
    const next = current.includes(opt)
      ? current.filter((x) => x !== opt)
      : [...current, opt];
    setAnswers((a) => ({ ...a, [question.id]: next }));
  };

  const handleNext = async () => {
    if (isLast) {
      setSubmitting(true);
      const result = await completeSurvey(survey.id);
      setSubmitting(false);
      onComplete(result.coinsEarned);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <LinearGradient
        colors={['#7c3aed', '#4c1d95']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Pressable onPress={onCancel} hitSlop={10}>
            <Ionicons name="close" size={24} color="rgba(255,255,255,0.85)" />
          </Pressable>
          <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' }}>
            {currentIndex + 1} / {survey.questions.length}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Ionicons name="logo-bitcoin" size={13} color="#fbbf24" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fbbf24' }}>+{survey.coins}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>{survey.title}</Text>

        {/* Progress bar */}
        <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 }}>
          <View style={{ height: 4, width: `${progress * 100}%`, backgroundColor: '#a78bfa', borderRadius: 2 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', lineHeight: 26, marginBottom: 24 }}>
          {question.text}
        </Text>

        {/* Single choice */}
        {question.type === 'single' && question.options?.map((opt) => (
          <Pressable
            key={opt}
            onPress={() => setAnswers((a) => ({ ...a, [question.id]: opt }))}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: answers[question.id] === opt ? '#ede9fe' : '#fff',
              borderRadius: 14,
              padding: 14,
              marginBottom: 10,
              borderWidth: 1.5,
              borderColor: answers[question.id] === opt ? '#7c3aed' : '#e5e7eb',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: answers[question.id] === opt ? '#7c3aed' : '#d1d5db',
                backgroundColor: answers[question.id] === opt ? '#7c3aed' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {answers[question.id] === opt && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: answers[question.id] === opt ? '#4c1d95' : '#374151', flex: 1 }}>
              {opt}
            </Text>
          </Pressable>
        ))}

        {/* Multi select */}
        {question.type === 'multi' && question.options?.map((opt) => {
          const selected = ((answers[question.id] as string[]) ?? []).includes(opt);
          return (
            <Pressable
              key={opt}
              onPress={() => toggleMulti(opt)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: selected ? '#ede9fe' : '#fff',
                borderRadius: 14,
                padding: 14,
                marginBottom: 10,
                borderWidth: 1.5,
                borderColor: selected ? '#7c3aed' : '#e5e7eb',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  borderWidth: 2,
                  borderColor: selected ? '#7c3aed' : '#d1d5db',
                  backgroundColor: selected ? '#7c3aed' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: selected ? '#4c1d95' : '#374151', flex: 1 }}>
                {opt}
              </Text>
            </Pressable>
          );
        })}

        {/* Scale */}
        {question.type === 'scale' && (() => {
          const min = question.min ?? 1;
          const max = question.max ?? 5;
          const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
          const selected = answers[question.id] as number | undefined;
          return (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {steps.map((val) => (
                  <Pressable
                    key={val}
                    onPress={() => setAnswers((a) => ({ ...a, [question.id]: val }))}
                    style={({ pressed }) => ({
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      borderWidth: 2,
                      borderColor: selected === val ? '#7c3aed' : '#e5e7eb',
                      backgroundColor: selected === val ? '#7c3aed' : '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '800', color: selected === val ? '#fff' : '#374151' }}>{val}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>Low</Text>
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>High</Text>
              </View>
            </View>
          );
        })()}
      </ScrollView>

      {/* Next / Submit */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 }}>
        <Pressable
          onPress={handleNext}
          disabled={!hasAnswer || submitting}
          style={({ pressed }) => ({ opacity: !hasAnswer || submitting ? 0.5 : pressed ? 0.85 : 1, borderRadius: 14, overflow: 'hidden' })}
        >
          <LinearGradient
            colors={['#7c3aed', '#4c1d95']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                  {isLast ? 'Submit & Earn' : 'Next'}
                </Text>
                <Ionicons name={isLast ? 'checkmark-circle-outline' : 'arrow-forward'} size={18} color="#fff" />
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ── Completion Screen ─────────────────────────────────────────────────────────

function CompletionScreen({ coins, onDone }: { coins: number; onDone: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: '#ede9fe',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        <Ionicons name="trophy" size={44} color="#7c3aed" />
      </View>
      <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 8 }}>Survey Complete!</Text>
      <Text style={{ fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 28 }}>
        Thank you for your time. Your responses help improve healthcare for everyone.
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: '#fef3c7',
          borderRadius: 18,
          paddingHorizontal: 24,
          paddingVertical: 14,
          marginBottom: 32,
          borderWidth: 1,
          borderColor: '#fde68a',
        }}
      >
        <Ionicons name="logo-bitcoin" size={28} color="#d97706" />
        <Text style={{ fontSize: 28, fontWeight: '900', color: '#d97706' }}>+{coins}</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#92400e' }}>Lifecoins</Text>
      </View>
      <Pressable
        onPress={onDone}
        style={({ pressed }) => ({ width: '100%', opacity: pressed ? 0.85 : 1, borderRadius: 14, overflow: 'hidden' })}
      >
        <LinearGradient
          colors={['#7c3aed', '#4c1d95']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Back to Surveys</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ── Root Screen ───────────────────────────────────────────────────────────────

export default function SurveyScreen() {
  const { surveys, initialized, initialize } = useSurveyStore();
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [completedCoins, setCompletedCoins] = useState<number | null>(null);

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  const handleComplete = useCallback((coins: number) => {
    setActiveSurvey(null);
    setCompletedCoins(coins);
  }, []);

  if (!initialized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      {/* Survey flow modal */}
      <Modal visible={!!activeSurvey} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActiveSurvey(null)}>
        {activeSurvey && (
          <SurveyFlow
            survey={activeSurvey}
            onComplete={handleComplete}
            onCancel={() => setActiveSurvey(null)}
          />
        )}
      </Modal>

      {completedCoins !== null ? (
        <CompletionScreen coins={completedCoins} onDone={() => setCompletedCoins(null)} />
      ) : (
        <SurveyList surveys={surveys} onStart={(s) => setActiveSurvey(s)} />
      )}
    </SafeAreaView>
  );
}
