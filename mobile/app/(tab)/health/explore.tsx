import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  useExploreStore,
  ExploreVideo,
  VideoCategory,
  SEED_VIDEOS,
  DAILY_VIDEO_CAP,
} from 'stores/explore-store';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Progress bar advances in 200 ms ticks at this multiplier over real duration. */
const SPEED_MULTIPLIER = 10;
/** Watching 80% qualifies for the reward. */
const REWARD_THRESHOLD = 80;

const CATEGORIES: Array<VideoCategory | 'All'> = [
  'All',
  'Prevention',
  'Nutrition',
  'Fitness',
  'Mental Health',
  'Medication',
];

const CAT_META: Record<VideoCategory, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  Prevention:     { icon: 'shield-checkmark-outline', color: '#0284c7', bg: '#eff6ff' },
  Nutrition:      { icon: 'nutrition-outline',         color: '#b45309', bg: '#fef3c7' },
  Fitness:        { icon: 'barbell-outline',            color: '#15803d', bg: '#f0fdf4' },
  'Mental Health':{ icon: 'happy-outline',              color: '#7c3aed', bg: '#fdf4ff' },
  Medication:     { icon: 'medkit-outline',             color: '#059669', bg: '#ecfdf5' },
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

function darken(hex: string): string {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (n >> 16) - 40);
    const g = Math.max(0, ((n >> 8) & 0xff) - 40);
    const b = Math.max(0, (n & 0xff) - 40);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return hex;
  }
}

// ── VideoCard ─────────────────────────────────────────────────────────────────

function VideoCard({
  video,
  rewarded,
  onWatch,
}: {
  video: ExploreVideo;
  rewarded: boolean;
  onWatch: () => void;
}) {
  const meta = CAT_META[video.category];
  return (
    <Pressable
      onPress={rewarded ? undefined : onWatch}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        backgroundColor: '#fff',
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: rewarded ? '#bbf7d0' : '#e5e7eb',
        shadowColor: video.thumbnailColor,
        shadowOpacity: rewarded ? 0.03 : 0.08,
        shadowRadius: 8,
        elevation: rewarded ? 1 : 3,
      })}
    >
      {/* Thumbnail */}
      <LinearGradient
        colors={[video.thumbnailColor, darken(video.thumbnailColor)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          height: 110,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={rewarded ? 'checkmark-circle' : (video.thumbnailIcon as keyof typeof Ionicons.glyphMap)}
            size={30}
            color="#fff"
          />
        </View>
        {/* Play overlay */}
        {!rewarded && (
          <View
            style={{
              position: 'absolute',
              bottom: 10,
              right: 12,
              backgroundColor: 'rgba(0,0,0,0.4)',
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 4,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="play" size={11} color="#fff" />
            <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>
              {formatDuration(video.durationSeconds)}
            </Text>
          </View>
        )}
        {rewarded && (
          <View
            style={{
              position: 'absolute',
              bottom: 10,
              right: 12,
              backgroundColor: 'rgba(22,163,74,0.85)',
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 4,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="checkmark" size={11} color="#fff" />
            <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>Earned</Text>
          </View>
        )}
      </LinearGradient>

      {/* Info */}
      <View style={{ padding: 14, gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: rewarded ? '#6b7280' : '#111827', lineHeight: 20 }}>
          {video.title}
        </Text>
        <Text style={{ fontSize: 12, color: '#9ca3af', numberOfLines: 2, lineHeight: 17 } as never} numberOfLines={2}>
          {video.description}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: meta.bg,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Ionicons name={meta.icon} size={11} color={meta.color} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: meta.color }}>{video.category}</Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#fef3c7',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Ionicons name="logo-bitcoin" size={11} color="#d97706" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#d97706' }}>+{video.coins} LC</Text>
            </View>
          </View>
          <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '500' }}>{video.instructor}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── VideoPlayer Modal ─────────────────────────────────────────────────────────

function VideoPlayerModal({
  video,
  onClose,
  onClaim,
}: {
  video: ExploreVideo;
  onClose: () => void;
  onClaim: () => Promise<void>;
}) {
  const [progress, setProgress] = useState(0);       // 0–100
  const [playing, setPlaying] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Total simulated ms = real duration / SPEED_MULTIPLIER * 1000
  const totalSimMs = (video.durationSeconds / SPEED_MULTIPLIER) * 1000;
  const tickMs = 200;
  const increment = (100 * tickMs) / totalSimMs;

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setProgress((p) => {
          const next = Math.min(p + increment, 100);
          if (next >= 100 && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return next;
        });
      }, tickMs);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, increment]);

  const canClaim = progress >= REWARD_THRESHOLD;

  const timeRemaining = Math.max(
    0,
    Math.ceil(((100 - progress) / 100) * (totalSimMs / 1000)),
  );

  const handleClaim = async () => {
    setClaiming(true);
    await onClaim();
    setClaiming(false);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
        {/* Top bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 12,
          }}
        >
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }} numberOfLines={1}>
              {video.title}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Simulated video screen */}
        <LinearGradient
          colors={[video.thumbnailColor, darken(video.thumbnailColor), '#0f0f0f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ height: 220, alignItems: 'center', justifyContent: 'center', gap: 12 }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap}
              size={40}
              color="#fff"
            />
          </View>
          <Pressable
            onPress={() => setPlaying((p) => !p)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={24} color="#fff" />
          </Pressable>
        </LinearGradient>

        {/* Progress bar */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              {Math.round(progress)}% watched
            </Text>
            {progress < 100 && (
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                ~{timeRemaining}s remaining
              </Text>
            )}
            {progress >= 100 && (
              <Text style={{ fontSize: 12, color: '#6ee7b7', fontWeight: '600' }}>Complete!</Text>
            )}
          </View>
          <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3 }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: progress >= REWARD_THRESHOLD ? '#22c55e' : video.thumbnailColor,
                width: `${progress}%`,
              }}
            />
            {/* Reward threshold marker */}
            <View
              style={{
                position: 'absolute',
                left: `${REWARD_THRESHOLD}%` as never,
                top: -3,
                width: 2,
                height: 12,
                backgroundColor: '#fbbf24',
                borderRadius: 1,
              }}
            />
          </View>
          <Text style={{ fontSize: 10, color: '#fbbf24', fontWeight: '600', textAlign: 'right' }}>
            ★ Reward unlocks at {REWARD_THRESHOLD}%
          </Text>
        </View>

        {/* Video details */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>{video.title}</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: '500' }}>
              {video.instructor} · {formatDuration(video.durationSeconds)}
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20, marginTop: 4 }}>
              {video.description}
            </Text>
          </View>

          {/* Reward card */}
          <View
            style={{
              backgroundColor: canClaim ? '#052e16' : 'rgba(255,255,255,0.06)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: canClaim ? '#16a34a' : 'rgba(255,255,255,0.1)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: canClaim ? '#14532d' : 'rgba(255,255,255,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name="logo-bitcoin"
                size={22}
                color={canClaim ? '#4ade80' : 'rgba(255,255,255,0.3)'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '800',
                  color: canClaim ? '#4ade80' : 'rgba(255,255,255,0.5)',
                }}
              >
                +{video.coins} Lifecoins
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {canClaim ? 'Watch complete — ready to claim!' : `Watch ${REWARD_THRESHOLD}% to unlock the reward`}
              </Text>
            </View>
          </View>

          {/* Claim button */}
          {canClaim && (
            <Pressable
              onPress={claiming ? undefined : handleClaim}
              style={({ pressed }) => ({ opacity: pressed || claiming ? 0.8 : 1, borderRadius: 14, overflow: 'hidden' })}
            >
              <LinearGradient
                colors={['#16a34a', '#14532d']}
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
                {claiming ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="logo-bitcoin" size={20} color="#4ade80" />
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                      Claim {video.coins} Lifecoins
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}

          {!canClaim && !playing && (
            <Pressable
              onPress={() => setPlaying(true)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                borderRadius: 14,
                backgroundColor: video.thumbnailColor + '22',
                borderWidth: 1.5,
                borderColor: video.thumbnailColor + '66',
                paddingVertical: 14,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              })}
            >
              <Ionicons name="play-circle-outline" size={20} color={video.thumbnailColor} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: video.thumbnailColor }}>
                Resume Video
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { lifecoins, totalEarned, initialized, initialize, claimReward, isRewarded, getDailyRemaining } =
    useExploreStore();

  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | 'All'>('All');
  const [activeVideo, setActiveVideo] = useState<ExploreVideo | null>(null);
  const [toast, setToast] = useState<{ message: string; coins: number } | null>(null);

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  const showToast = useCallback((message: string, coins: number) => {
    setToast({ message, coins });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const handleWatch = useCallback(
    (video: ExploreVideo) => {
      if (getDailyRemaining() === 0) {
        Alert.alert(
          'Daily limit reached',
          `You can watch up to ${DAILY_VIDEO_CAP} reward videos per day. Come back tomorrow!`,
        );
        return;
      }
      setActiveVideo(video);
    },
    [getDailyRemaining],
  );

  const handleClaim = useCallback(async () => {
    if (!activeVideo) return;
    const result = await claimReward(activeVideo.id);
    if (result.capReached) {
      Alert.alert('Daily limit reached', `You can earn from up to ${DAILY_VIDEO_CAP} videos per day.`);
    } else if (result.alreadyDone) {
      Alert.alert('Already claimed', 'You already earned Lifecoins for this video today.');
    } else {
      showToast(`+${result.coinsEarned} Lifecoins earned!`, result.coinsEarned);
      setActiveVideo(null);
    }
  }, [activeVideo, claimReward, showToast]);

  const filteredVideos =
    selectedCategory === 'All'
      ? SEED_VIDEOS
      : SEED_VIDEOS.filter((v) => v.category === selectedCategory);

  const totalRewarded = SEED_VIDEOS.filter((v) => isRewarded(v.id)).length;
  const dailyRemaining = getDailyRemaining();

  if (!initialized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#059669" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      {/* Header */}
      <LinearGradient
        colors={['#064e3b', '#065f46', '#0f172a']}
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
              backgroundColor: 'rgba(255,255,255,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>Explore</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
              Watch health videos · earn Lifecoins
            </Text>
          </View>
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
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

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'Videos Today', value: DAILY_VIDEO_CAP - dailyRemaining, icon: 'play-circle-outline' as const, color: '#6ee7b7' },
            { label: 'Daily Left', value: dailyRemaining, icon: 'time-outline' as const, color: '#93c5fd' },
            { label: 'Total Earned', value: `${totalEarned} LC`, icon: 'logo-bitcoin' as const, color: '#fbbf24' },
          ].map((s) => (
            <View
              key={s.label}
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Ionicons name={s.icon} size={18} color={s.color} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>{s.value}</Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600' }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Daily cap warning */}
      {dailyRemaining === 0 && (
        <View
          style={{
            margin: 16,
            marginBottom: 0,
            backgroundColor: '#1c1917',
            borderRadius: 14,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderWidth: 1,
            borderColor: '#f59e0b44',
          }}
        >
          <Ionicons name="time-outline" size={18} color="#f59e0b" />
          <Text style={{ flex: 1, fontSize: 13, color: '#fbbf24', fontWeight: '600' }}>
            Daily limit reached — {DAILY_VIDEO_CAP} videos watched. More tomorrow!
          </Text>
        </View>
      )}

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8 }}
      >
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          const meta = cat === 'All' ? null : CAT_META[cat as VideoCategory];
          return (
            <Pressable
              key={cat}
              onPress={() => setSelectedCategory(cat)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: active ? '#059669' : 'rgba(255,255,255,0.07)',
                borderWidth: 1,
                borderColor: active ? '#059669' : 'rgba(255,255,255,0.12)',
              })}
            >
              {meta && (
                <Ionicons name={meta.icon} size={13} color={active ? '#fff' : meta.color} />
              )}
              {cat === 'All' && (
                <Ionicons name="grid-outline" size={13} color={active ? '#fff' : '#9ca3af'} />
              )}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: active ? '#fff' : '#9ca3af',
                }}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Video list */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, gap: 14, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {filteredVideos.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
            <Ionicons name="videocam-off-outline" size={36} color="#374151" />
            <Text style={{ fontSize: 14, color: '#6b7280' }}>No videos in this category yet</Text>
          </View>
        )}
        {filteredVideos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            rewarded={isRewarded(video.id)}
            onWatch={() => handleWatch(video)}
          />
        ))}

        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 16, textAlign: 'center' }}>
            Watch {REWARD_THRESHOLD}% of a video to earn Lifecoins. Max {DAILY_VIDEO_CAP} videos per day. Videos are health education content for informational purposes only.
          </Text>
        </View>
      </ScrollView>

      {/* Video player modal */}
      {activeVideo && (
        <VideoPlayerModal
          video={activeVideo}
          onClose={() => setActiveVideo(null)}
          onClaim={handleClaim}
        />
      )}

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
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 10,
          }}
        >
          <Ionicons name="logo-bitcoin" size={22} color="#4ade80" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 }}>{toast.message}</Text>
          <View style={{ backgroundColor: '#052e16', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#4ade80' }}>+{toast.coins} LC</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
