import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Image,
  TextInput,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import WebView from 'react-native-webview';
import {
  useExploreStore,
  ExploreVideo,
  VideoCategory,
  SEED_VIDEOS,
  DAILY_VIDEO_CAP,
  getDailyShuffledVideos,
} from 'stores/explore-store';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: Array<VideoCategory | 'All'> = [
  'All',
  'Prevention',
  'Nutrition',
  'Fitness',
  'Mental Health',
  'Medication',
];

const CAT_META: Record<VideoCategory, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  Prevention:      { icon: 'shield-checkmark-outline', color: '#0284c7', bg: '#eff6ff' },
  Nutrition:       { icon: 'nutrition-outline',         color: '#b45309', bg: '#fef3c7' },
  Fitness:         { icon: 'barbell-outline',            color: '#15803d', bg: '#f0fdf4' },
  'Mental Health': { icon: 'happy-outline',              color: '#7c3aed', bg: '#fdf4ff' },
  Medication:      { icon: 'medkit-outline',             color: '#059669', bg: '#ecfdf5' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract 11-char YouTube video ID from watch / embed / shorts URLs. */
function getYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

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
  const [thumbReady, setThumbReady] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const meta = CAT_META[video.category];
  const youtubeId = getYouTubeId(video.youtubeUrl);
  const thumbUri = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    : null;

  return (
    <Pressable
      onPress={rewarded ? undefined : onWatch}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
        backgroundColor: '#fff',
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: rewarded ? '#bbf7d0' : '#e5e7eb',
        shadowColor: video.thumbnailColor,
        shadowOpacity: rewarded ? 0.03 : 0.1,
        shadowRadius: 10,
        elevation: rewarded ? 1 : 3,
      })}
    >
      {/* Thumbnail */}
      <View style={{ height: 130, position: 'relative' }}>
        {thumbUri && !thumbFailed ? (
          <>
            <Image
              source={{ uri: thumbUri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              onLoad={() => setThumbReady(true)}
              onError={() => setThumbFailed(true)}
            />
            {!thumbReady && (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: video.thumbnailColor, alignItems: 'center', justifyContent: 'center' },
                ]}
              >
                <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
              </View>
            )}
          </>
        ) : (
          <LinearGradient
            colors={[video.thumbnailColor, darken(video.thumbnailColor)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons
              name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap}
              size={36}
              color="rgba(255,255,255,0.6)"
            />
          </LinearGradient>
        )}

        {/* Play / check overlay */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: rewarded ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.18)',
            },
          ]}
        >
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: rewarded ? 'rgba(22,163,74,0.92)' : 'rgba(255,0,0,0.88)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={rewarded ? 'checkmark' : 'play'}
              size={24}
              color="#fff"
              style={rewarded ? undefined : { marginLeft: 3 }}
            />
          </View>
        </View>

        {/* Earned badge */}
        {rewarded ? (
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 10,
              backgroundColor: 'rgba(22,163,74,0.9)',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="checkmark" size={11} color="#fff" />
            <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>Earned</Text>
          </View>
        ) : (
          <View
            style={{
              position: 'absolute',
              bottom: 8,
              right: 10,
              backgroundColor: 'rgba(0,0,0,0.65)',
              borderRadius: 6,
              paddingHorizontal: 7,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
              {formatDuration(video.durationSeconds)}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ padding: 14, gap: 8 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '800',
            color: rewarded ? '#6b7280' : '#111827',
            lineHeight: 20,
          }}
        >
          {video.title}
        </Text>
        <Text style={{ fontSize: 12, color: '#9ca3af', lineHeight: 17 }} numberOfLines={2}>
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

// ── VideoPlayerModal ──────────────────────────────────────────────────────────

function VideoPlayerModal({
  video,
  onClose,
  onClaim,
}: {
  video: ExploreVideo;
  onClose: () => void;
  onClaim: () => Promise<void>;
}) {
  const [webViewReady, setWebViewReady] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(15);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const youtubeId = getYouTubeId(video.youtubeUrl);

  // Serve the player as a local HTML document so Android/iOS never fire the
  // YouTube app intent (source={{ html }} has no origin URL to deep-link from).
  const playerHtml = youtubeId
    ? `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;background:#000}
    html,body{width:100%;height:100%;overflow:hidden}
    iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none}
  </style>
</head>
<body>
  <iframe
    src="https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&playsinline=1&modestbranding=1&showinfo=0&controls=1"
    allow="autoplay; encrypted-media; fullscreen"
    allowfullscreen
    frameborder="0"
  ></iframe>
</body>
</html>`
    : null;

  const startTimer = useCallback(() => {
    if (intervalRef.current) return; // already running
    let remaining = 15;
    intervalRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setCanClaim(true);
      }
    }, 1000);
  }, []);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    [],
  );

  const handleClaim = async () => {
    setClaiming(true);
    await onClaim();
    setClaiming(false);
  };

  // On web, react-native-webview is not supported — fall back to external link
  const isWeb = Platform.OS === 'web';

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
        {/* Header */}
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
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: '700',
              color: '#fff',
              textAlign: 'center',
              marginHorizontal: 12,
            }}
            numberOfLines={1}
          >
            {video.title}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Ionicons name="logo-bitcoin" size={13} color="#fbbf24" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fbbf24' }}>+{video.coins} LC</Text>
          </View>
        </View>

        {/* 16:9 player */}
        <View style={{ width: '100%', height: 210, backgroundColor: '#000' }}>
          {isWeb || !playerHtml ? (
            /* Web / no-ID fallback: gradient placeholder */
            <LinearGradient
              colors={[video.thumbnailColor, darken(video.thumbnailColor)]}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}
            >
              <Ionicons
                name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap}
                size={40}
                color="#fff"
              />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                Preview not available on web
              </Text>
            </LinearGradient>
          ) : (
            <WebView
              // Local HTML source — prevents YouTube deep-link app intent
              source={{ html: playerHtml, baseUrl: '' }}
              style={{ flex: 1 }}
              javaScriptEnabled
              allowsInlineMediaPlayback
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              // Block any navigation that tries to leave the WebView (YouTube app, etc.)
              onShouldStartLoadWithRequest={(req) => {
                const url = req.url;
                // Allow initial blank + youtube iframe + data URLs only
                if (
                  url === 'about:blank' ||
                  url.startsWith('https://www.youtube.com/embed') ||
                  url.startsWith('data:')
                ) {
                  return true;
                }
                // Any other navigation (vnd.youtube://, etc.) — block it
                return false;
              }}
              onLoad={() => {
                setWebViewReady(true);
                startTimer();
              }}
            />
          )}
          {!isWeb && !webViewReady && playerHtml && (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <ActivityIndicator size="large" color="#ff0000" />
              <Text style={{ color: 'rgba(255,255,255,0.45)', marginTop: 12, fontSize: 13 }}>
                Loading…
              </Text>
            </View>
          )}
        </View>

        {/* Details + reward */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
        >
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>{video.title}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              {video.instructor} · {formatDuration(video.durationSeconds)}
            </Text>
            <Text
              style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 20, marginTop: 4 }}
            >
              {video.description}
            </Text>
          </View>

          {/* Reward status */}
          <View
            style={{
              backgroundColor: canClaim ? '#052e16' : 'rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: canClaim ? '#16a34a' : 'rgba(255,255,255,0.1)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: canClaim ? '#14532d' : 'rgba(255,255,255,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name="logo-bitcoin"
                size={20}
                color={canClaim ? '#4ade80' : 'rgba(255,255,255,0.3)'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: canClaim ? '#4ade80' : 'rgba(255,255,255,0.45)',
                }}
              >
                +{video.coins} Lifecoins
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                {canClaim
                  ? 'Reward ready — tap below to claim!'
                  : isWeb
                    ? 'Watch the video then claim your reward'
                    : webViewReady
                      ? `Watch ${secondsLeft}s more to unlock…`
                      : 'Start watching to unlock your reward'}
              </Text>
            </View>
          </View>

          {/* Claim / countdown CTA */}
          <Pressable
            onPress={(isWeb || canClaim) && !claiming ? handleClaim : undefined}
            style={({ pressed }) => ({
              opacity: (!isWeb && !canClaim) || claiming ? 0.45 : pressed ? 0.85 : 1,
              borderRadius: 14,
              overflow: 'hidden',
            })}
          >
            <LinearGradient
              colors={(isWeb || canClaim) ? ['#16a34a', '#14532d'] : ['#374151', '#1f2937']}
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
              ) : isWeb || canClaim ? (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#4ade80" />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                    Claim +{video.coins} Lifecoins
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.4)" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.4)' }}>
                    {webViewReady ? `Unlocks in ${secondsLeft}s` : 'Loading video…'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
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
  const [searchText, setSearchText] = useState('');
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [availableIds, setAvailableIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  // Check availability via YouTube oEmbed (returns 404 for removed/private videos)
  useEffect(() => {
    if (!initialized || Platform.OS === 'web') return;
    (async () => {
      try {
        const checks = await Promise.allSettled(
          SEED_VIDEOS.map(async (v) => {
            const ytId = getYouTubeId(v.youtubeUrl);
            if (!ytId) return null;
            const res = await fetch(
              `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`,
              { method: 'HEAD' },
            );
            return res.ok ? v.id : null;
          }),
        );
        const ids = new Set<string>(
          checks
            .map((r) => (r.status === 'fulfilled' ? r.value : null))
            .filter((id): id is string => id !== null),
        );
        // Only apply filter if at least half resolved (guards against network failure)
        if (ids.size >= Math.ceil(SEED_VIDEOS.length / 2)) {
          setAvailableIds(ids);
        }
      } catch {
        // Network error — show all videos
      }
    })();
  }, [initialized]);

  // Daily-shuffled video order — recalculated once per mount (changes each day)
  const shuffledVideos = useMemo(() => getDailyShuffledVideos(), []);

  const showToast = useCallback((message: string, coins: number) => {
    setToast({ message, coins });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const handleWatch = useCallback(
    (video: ExploreVideo) => {
      // Mark as viewed this session so it sorts below fresh videos
      setViewedIds((prev) => {
        const next = new Set(prev);
        next.add(video.id);
        return next;
      });
      setActiveVideo(video);
    },
    [],
  );

  const handleClaim = useCallback(async () => {
    if (!activeVideo) return;
    const result = await claimReward(activeVideo.id);
    if (result.capReached) {
      showToast(`Daily limit reached — ${DAILY_VIDEO_CAP} videos max`, 0);
    } else if (result.alreadyDone) {
      showToast('Already claimed today', 0);
    } else {
      showToast(`+${result.coinsEarned} Lifecoins earned!`, result.coinsEarned);
    }
    setActiveVideo(null);
  }, [activeVideo, claimReward, showToast]);

  // Filtered, availability-checked, search-matched, sorted video list
  const filteredVideos = shuffledVideos
    .filter((v) => {
      if (availableIds && !availableIds.has(v.id)) return false;
      if (selectedCategory !== 'All' && v.category !== selectedCategory) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        return (
          v.title.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.instructor.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Sort order: fresh → session-viewed → rewarded
      const aR = isRewarded(a.id);
      const bR = isRewarded(b.id);
      if (aR !== bR) return aR ? 1 : -1;
      const aV = viewedIds.has(a.id);
      const bV = viewedIds.has(b.id);
      if (aV !== bV) return aV ? 1 : -1;
      return 0; // preserve daily shuffle order otherwise
    });

  const dailyRemaining = getDailyRemaining();

  if (!initialized) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center' }}
      >
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

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            {
              label: 'Today',
              value: DAILY_VIDEO_CAP - dailyRemaining,
              icon: 'play-circle-outline' as const,
              color: '#6ee7b7',
            },
            { label: 'Daily Left', value: dailyRemaining, icon: 'time-outline' as const, color: '#93c5fd' },
            {
              label: 'Earned',
              value: `${totalEarned} LC`,
              icon: 'logo-bitcoin' as const,
              color: '#fbbf24',
            },
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
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600' }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Search bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.07)',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            gap: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
          }}
        >
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            placeholder="Search videos, topics, instructors…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchText}
            onChangeText={setSearchText}
            style={{ flex: 1, fontSize: 14, color: '#fff', padding: 0 }}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
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
              {meta ? (
                <Ionicons name={meta.icon} size={13} color={active ? '#fff' : meta.color} />
              ) : (
                <Ionicons name="grid-outline" size={13} color={active ? '#fff' : '#9ca3af'} />
              )}
              <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : '#9ca3af' }}>
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
            <Text style={{ fontSize: 14, color: '#6b7280' }}>
              {searchText.trim()
                ? `No results for "${searchText}"`
                : 'No videos in this category'}
            </Text>
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

        {filteredVideos.length > 0 && (
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.3)',
                lineHeight: 16,
                textAlign: 'center',
              }}
            >
              Earn Lifecoins for every video you watch. Up to {DAILY_VIDEO_CAP} rewards per day. Feed
              refreshes daily. Health videos are for educational purposes only.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Active video modal */}
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
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 }}>
            {toast.message}
          </Text>
          {toast.coins > 0 && (
            <View
              style={{
                backgroundColor: '#052e16',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#4ade80' }}>
                +{toast.coins} LC
              </Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
