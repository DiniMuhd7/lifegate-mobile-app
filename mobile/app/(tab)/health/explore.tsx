import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import {
  useExploreStore,
  ExploreVideo,
  VideoCategory,
  DAILY_VIDEO_CAP,
  getDailyShuffledVideos,
  CATEGORY_META,
  ALL_CATEGORIES,
  deriveUserCategories,
} from 'stores/explore-store';
import { useAuthStore } from 'stores/auth-store';
import { usePatientHealthStore } from 'stores/health-store';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const VideoCard = React.memo(function VideoCard({
  video,
  rewarded,
  onWatch,
}: {
  video: ExploreVideo;
  rewarded: boolean;
  onWatch: () => void;
}) {
  const meta = CATEGORY_META[video.category];
  const requiredWatch = Math.ceil(video.durationSeconds / 2);
  const watchLabel = requiredWatch >= 60
    ? `Watch ${Math.ceil(requiredWatch / 60)}m to unlock`
    : `Watch ${requiredWatch}s to unlock`;

  return (
    <Pressable
      onPress={rewarded ? undefined : onWatch}
      style={({ pressed }) => ({
        opacity: pressed ? 0.93 : 1,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: rewarded ? '#0c1a12' : '#1e2535',
        borderWidth: 1,
        borderColor: rewarded ? '#166534' : 'rgba(255,255,255,0.08)',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: rewarded ? 1 : 4,
      })}
    >
      {/* Thumbnail */}
      <View style={{ height: 152, position: 'relative', overflow: 'hidden' }}>
        <LinearGradient
          colors={[video.thumbnailColor + 'dd', darken(darken(video.thumbnailColor))]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: '100%', height: '100%' }}
        >
          {/* Large icon watermark */}
          <View style={[
            StyleSheet.absoluteFill,
            { alignItems: 'flex-end', justifyContent: 'flex-end', padding: 12, opacity: 0.2 }
          ]}>
            <Ionicons
              name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap}
              size={72}
              color="#fff"
            />
          </View>
        </LinearGradient>

        {/* Dark overlay */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: rewarded ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)' }]} />

        {/* Category badge — top left */}
        <View
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: 'rgba(0,0,0,0.55)',
            borderRadius: 20,
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
          }}
        >
          <Ionicons name={(meta?.icon ?? 'play-circle-outline') as keyof typeof Ionicons.glyphMap} size={11} color={meta?.color ?? '#059669'} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{video.category}</Text>
        </View>

        {/* Duration — top right */}
        <View
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            backgroundColor: 'rgba(0,0,0,0.55)',
            borderRadius: 20,
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>{formatDuration(video.durationSeconds)}</Text>
        </View>

        {/* Earned badge — bottom left */}
        {rewarded && (
          <View
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: 'rgba(22,163,74,0.92)',
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Ionicons name="checkmark-circle" size={12} color="#fff" />
            <Text style={{ fontSize: 11, color: '#fff', fontWeight: '800' }}>Earned</Text>
          </View>
        )}

        {/* Play button — centered */}
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: rewarded ? 'rgba(22,163,74,0.9)' : 'rgba(255,255,255,0.18)',
              borderWidth: 2,
              borderColor: rewarded ? '#4ade80' : 'rgba(255,255,255,0.55)',
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
      </View>

      {/* Info */}
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 6 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '800',
            color: rewarded ? '#6b7280' : '#f1f5f9',
            lineHeight: 20,
          }}
          numberOfLines={2}
        >
          {video.title}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '500' }}>
            {video.instructor}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="heart" size={12} color={rewarded ? '#6b7280' : '#fbbf24'} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: rewarded ? '#6b7280' : '#fbbf24' }}>
              +{video.coins} LC
            </Text>
          </View>
        </View>

        {!rewarded && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              marginTop: 2,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.06)',
              paddingTop: 8,
            }}
          >
            <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.3)" />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>
              {watchLabel}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

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
  const { width: screenWidth } = useWindowDimensions();
  const videoHeight = Math.round((screenWidth * 9) / 16);

  const videoRef = useRef<WebView>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [embedError, setEmbedError] = useState<number | null>(null);
  const [canClaim, setCanClaim] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const requiredSeconds = Math.ceil(video.durationSeconds * 0.7);
  const [secondsLeft, setSecondsLeft] = useState(requiredSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(requiredSeconds);

  // HTML page using the YouTube IFrame API — works in both WebView (native) and srcdoc iframe (web).
  // Sends ready/state/error events via postMessage so we can handle them in React.
  const playerHtml = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
  <style>*{margin:0;padding:0;box-sizing:border-box;background:#000}html,body{width:100%;height:100%;overflow:hidden}#player{width:100%;height:100%}</style>
</head><body>
  <div id="player"></div>
  <script>
    function send(obj){var m=JSON.stringify(obj);try{window.ReactNativeWebView.postMessage(m)}catch(e){}try{window.parent.postMessage(m,'*')}catch(e){}}
    var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
    function onYouTubeIframeAPIReady(){
      new YT.Player('player',{
        videoId:'${video.youtubeId}',
        playerVars:{autoplay:1,playsinline:1,rel:0,modestbranding:1,origin:'https://www.youtube.com'},
        events:{
          onReady:function(e){e.target.playVideo();send({type:'ready'})},
          onError:function(e){send({type:'error',code:e.data})},
          onStateChange:function(e){send({type:'state',state:e.data})}
        }
      });
    }
  <\/script>
</body></html>`;

  const startTimer = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      remainingRef.current -= 1;
      setSecondsLeft(remainingRef.current);
      if (remainingRef.current <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setCanClaim(true);
      }
    }, 1000);
  }, []);

  const pauseTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Mark ready and start timer when player iframe/webview has loaded
  const handleMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data) as { type: string; code?: number; state?: number };
      if (msg.type === 'ready') {
        setPlayerReady(true);
      } else if (msg.type === 'error') {
        setEmbedError(msg.code ?? -1);
      } else if (msg.type === 'state') {
        // YT.PlayerState: 1=playing, 2=paused, 0=ended, 3=buffering
        if (msg.state === 1 || msg.state === 3) setPlayerReady(true);
        if (msg.state === 1) startTimer();
        else if (msg.state === 2) pauseTimer();
      }
    } catch {}
  }, [startTimer, pauseTimer]);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    [],
  );

  // Fallback: start timer as soon as the player reports ready (WebView onLoad).
  // This ensures countdown runs even if the IFrame API postMessage bridge is silent.
  useEffect(() => {
    if (playerReady) startTimer();
  }, [playerReady, startTimer]);

  // On web the YT IFrame API posts to window.parent — listen here.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (e: MessageEvent) => {
      if (typeof e.data === 'string') handleMessage(e.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handleMessage]);

  const handleClaim = async () => {
    setClaiming(true);
    await onClaim();
    setClaiming(false);
  };

  const circleSize = 44;
  const strokeWidth = 3;
  const progress = canClaim ? 1 : (requiredSeconds - secondsLeft) / requiredSeconds;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* ── Video area ── */}
        <View style={{ width: screenWidth, height: videoHeight, backgroundColor: '#000' }}>
          {embedError !== null ? (
            /* Error fallback — shown when YouTube blocks the embed (e.g. error 153) */
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
              <Ionicons name="logo-youtube" size={48} color="#ff0000" />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' }}>
                This video can't be embedded
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center' }}>
                The video owner has disabled in-app playback.{`\n`}Watch it directly on YouTube.
              </Text>
              <Pressable
                onPress={() => {
                  const url = `https://www.youtube.com/watch?v=${video.youtubeId}`;
                  if (Platform.OS === 'web') {
                    // @ts-ignore
                    window.open(url, '_blank');
                  } else {
                    import('expo-linking').then(({ default: Linking }) => Linking.openURL(url));
                  }
                }}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: '#ff0000',
                  borderRadius: 24,
                  paddingHorizontal: 28,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                })}
              >
                <Ionicons name="logo-youtube" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Watch on YouTube</Text>
              </Pressable>
            </View>
          ) : Platform.OS === 'web' ? (
            // @ts-ignore
            React.createElement('iframe', {
              srcDoc: playerHtml,
              style: { width: screenWidth, height: videoHeight, border: 'none', display: 'block' },
              allow: 'autoplay; fullscreen; picture-in-picture',
              allowFullScreen: true,
              sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
              onLoad: () => setPlayerReady(true),
            })
          ) : (
            <WebView
              ref={videoRef}
              source={{ html: playerHtml, baseUrl: 'https://www.youtube.com' }}
              style={{ width: screenWidth, height: videoHeight, backgroundColor: '#000' }}
              javaScriptEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo
              onLoad={() => setPlayerReady(true)}
              onMessage={(e) => handleMessage(e.nativeEvent.data)}
              onShouldStartLoadWithRequest={(req) => {
                const url = req.url;
                if (
                  url.startsWith('vnd.youtube') ||
                  url.startsWith('youtube://') ||
                  url.startsWith('intent://') ||
                  url.startsWith('market://')
                ) return false;
                return true;
              }}
            />
          )}

          {/* Loading spinner — only while waiting for player to signal ready */}
          {!playerReady && embedError === null && (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }]}>
              <ActivityIndicator size="large" color="#ff0000" />
              <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 12, fontSize: 13 }}>Loading video…</Text>
            </View>
          )}

          {/* Top bar overlaid on video — WhatsApp style */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingTop: 48,
              paddingBottom: 14,
            }}
            pointerEvents="box-none"
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.75)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginRight: 10, zIndex: 10 })}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </Pressable>
            {!playerReady && (
              <View style={{ flex: 1 }} pointerEvents="none">
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }} numberOfLines={1}>
                  {video.title}
                </Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>
                  {video.instructor}
                </Text>
              </View>
            )}
            {/* YouTube has its own fullscreen button — no PiP overlay needed */}
          </View>
        </View>

        {/* ── Bottom info panel ── */}
        <View
          style={{
            flex: 1,
            backgroundColor: '#0f172a',
            paddingHorizontal: 20,
            paddingTop: 18,
            paddingBottom: 32,
          }}
        >
          {/* Title + coins */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#f1f5f9', lineHeight: 22 }}>{video.title}</Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
                {video.instructor} · {formatDuration(video.durationSeconds)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(251,191,36,0.1)',
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: 'rgba(251,191,36,0.2)',
              }}
            >
              <Ionicons name="heart" size={15} color="#fbbf24" />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fbbf24' }}>+{video.coins}</Text>
            </View>
          </View>

          {/* Watch progress bar */}
          <View style={{ marginTop: 16, marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: canClaim ? '#4ade80' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {canClaim ? 'Ready to claim' : playerReady ? 'Watching…' : 'Loading…'}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: canClaim ? '#4ade80' : 'rgba(255,255,255,0.35)' }}>
                {canClaim ? '✓ Done' : playerReady
                  ? (secondsLeft > 60 ? `${Math.ceil(secondsLeft / 60)}m left` : `${secondsLeft}s left`)
                  : ''}
              </Text>
            </View>
            {/* Track */}
            <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <View
                style={{
                  height: '100%',
                  width: `${Math.round(progress * 100)}%`,
                  backgroundColor: canClaim ? '#4ade80' : playerReady ? '#059669' : '#374151',
                  borderRadius: 2,
                }}
              />
            </View>
          </View>

          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 19, marginTop: 12, marginBottom: 20 }}>
            {video.description}
          </Text>

          {/* Claim pill */}
          <Pressable
            onPress={canClaim && !claiming ? handleClaim : undefined}
            style={({ pressed }) => ({
              alignSelf: 'stretch',
              opacity: !canClaim || claiming ? 0.45 : pressed ? 0.8 : 1,
            })}
          >
            <LinearGradient
              colors={canClaim ? ['#16a34a', '#15803d'] : ['#1e2535', '#1e2535']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                paddingVertical: 16,
                paddingHorizontal: 32,
                borderRadius: 16,
                borderWidth: canClaim ? 0 : 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              {claiming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={canClaim ? 'heart' : 'lock-closed-outline'}
                    size={20}
                    color={canClaim ? '#fbbf24' : 'rgba(255,255,255,0.3)'}
                  />
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '800',
                      color: canClaim ? '#fff' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {canClaim ? `Claim +${video.coins} Lifecoins` : `Keep watching to unlock`}
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}


// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { lifecoins, totalEarned, initialized, initialize, claimReward, isRewarded, getDailyRemaining, refreshVideos, videos, dailyCap, lastVideoRefreshDate } =
    useExploreStore();

  const user = useAuthStore((s) => s.user);
  const patientTimeline = usePatientHealthStore((s) => s.patientTimeline);

  // Derive personalised category order from user profile + diagnosed conditions.
  // Memoised so it only recalculates when the user profile or timeline changes.
  const categories = useMemo<string[]>(() => {
    const diagnosedConditions = patientTimeline.map((e) => e.condition).filter(Boolean);
    return ['All', ...deriveUserCategories(user, diagnosedConditions)];
  }, [user, patientTimeline]);

  const [activeVideo, setActiveVideo] = useState<ExploreVideo | null>(null);
  const [toast, setToast] = useState<{ message: string; coins: number } | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  // Re-fetch videos whenever the screen gains focus on a new calendar day.
  useFocusEffect(
    useCallback(() => {
      if (!initialized) return;
      const today = new Date().toISOString().slice(0, 10);
      if (lastVideoRefreshDate !== today) {
        setIsFetching(true);
        refreshVideos().finally(() => setIsFetching(false));
      }
    }, [initialized, lastVideoRefreshDate, refreshVideos]),
  );

  // Daily-shuffled video order — recalculated when the catalogue changes
  const shuffledVideos = useMemo(() => getDailyShuffledVideos(videos), [videos]);

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
      showToast(`Daily limit reached — ${dailyCap} videos max`, 0);
    } else if (result.alreadyDone) {
      showToast('Already claimed today', 0);
    } else {
      showToast(`+${result.coinsEarned} Lifecoins earned!`, result.coinsEarned);
      // Sync server state (updated rewards) in the background
      refreshVideos();
    }
    setActiveVideo(null);
  }, [activeVideo, claimReward, showToast, dailyCap, refreshVideos]);

  // Sorted video list: fresh first → session-viewed → already rewarded.
  // Memoized so FlatList receives a stable reference and avoids unnecessary re-renders.
  const filteredVideos = useMemo(() =>
    shuffledVideos
      .filter((v) => activeCategory === 'All' || v.category === activeCategory)
      .sort((a, b) => {
        // Sort order: fresh → session-viewed → rewarded
        const aR = isRewarded(a.id);
        const bR = isRewarded(b.id);
        if (aR !== bR) return aR ? 1 : -1;
        const aV = viewedIds.has(a.id);
        const bV = viewedIds.has(b.id);
        if (aV !== bV) return aV ? 1 : -1;
        return 0;
      }),
  [shuffledVideos, activeCategory, isRewarded, viewedIds]);

  const renderVideoCard = useCallback(({ item: video }: { item: ExploreVideo }) => (
    <View style={{ flex: 1, marginBottom: 12 }}>
      <VideoCard
        video={video}
        rewarded={isRewarded(video.id)}
        onWatch={() => handleWatch(video)}
      />
    </View>
  ), [isRewarded, handleWatch]);

  const dailyRemaining = getDailyRemaining();
  const todayClaimedCount = videos.filter((v) => isRewarded(v.id)).length;
  const availableUnclaimed = videos.length > 0
    ? videos.filter((v) => !isRewarded(v.id)).length
    : null;

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
            onPress={() => router.replace('/(tab)/health')}
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
            <Ionicons name="heart" size={16} color="#fbbf24" />
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>{lifecoins}</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            {
              label: 'Watched Today',
              value: todayClaimedCount,
              icon: 'play-circle-outline' as const,
              color: '#6ee7b7',
            },
            {
              label: 'Available',
              value: availableUnclaimed ?? '…',
              icon: 'time-outline' as const,
              color: '#93c5fd',
            },
            {
              label: 'Earned',
              value: `${totalEarned} LC`,
              icon: 'heart' as const,
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

      {/* Category pills */}
      <View style={{ height: 56, flexShrink: 0 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
        style={{ flex: 1 }}
      >
        {categories.map((cat) => {
          const isActive = activeCategory === cat;
          const meta = cat !== 'All' ? CATEGORY_META[cat] : null;
          return (
            <Pressable
              key={cat}
              onPress={() => setActiveCategory(cat)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.75 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: isActive
                  ? (meta ? meta.color : '#059669')
                  : 'rgba(255,255,255,0.07)',
                borderWidth: 1,
                borderColor: isActive ? 'transparent' : 'rgba(255,255,255,0.12)',
              })}
            >
              <Ionicons
                name={(meta ? meta.icon : 'grid-outline') as keyof typeof Ionicons.glyphMap}
                size={14}
                color={isActive ? '#fff' : (meta ? meta.color : '#6ee7b7')}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                }}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      </View>

      {/* Video list — virtualized 2-column grid; only visible cards are mounted */}
      <FlatList
        style={{ flex: 1 }}
        data={filteredVideos}
        keyExtractor={(v) => v.id}
        renderItem={renderVideoCard}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        ListHeaderComponent={
          activeCategory !== 'All' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4, paddingBottom: 10, paddingHorizontal: 16 }}>
              <Ionicons
                name={(CATEGORY_META[activeCategory]?.icon ?? 'grid-outline') as keyof typeof Ionicons.glyphMap}
                size={16}
                color={CATEGORY_META[activeCategory]?.color ?? '#059669'}
              />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#f1f5f9' }}>{activeCategory}</Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>
                · {filteredVideos.length} video{filteredVideos.length !== 1 ? 's' : ''}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isFetching && videos.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12, paddingHorizontal: 16 }}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={{ fontSize: 13, color: '#6b7280' }}>Loading today’s health videos…</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12, paddingHorizontal: 16 }}>
              <Ionicons name="logo-youtube" size={36} color="#374151" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#e2e8f0', textAlign: 'center' }}>
                {activeCategory === 'All'
                  ? "Fetching today’s health videos…"
                  : `No ${activeCategory} videos available yet`}
              </Text>
              <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', paddingHorizontal: 24 }}>
                {activeCategory === 'All'
                  ? 'Fresh videos are sourced from YouTube daily. Pull to refresh or check back shortly.'
                  : 'Try a different category or check back after the daily refresh.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          filteredVideos.length > 0 ? (
            <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
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
            </View>
          ) : null
        }
      />

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
          <Ionicons name="heart" size={22} color="#4ade80" />
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
