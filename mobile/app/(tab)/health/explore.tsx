import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
  BackHandler,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd } from 'components/BannerAd';
import { RewardedAdButton } from 'components/RewardedAdButton';
import { InterstitialAdSlot, InterstitialAdSlotHandle } from 'components/InterstitialAdSlot';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import {
  useExploreStore,
  ExploreVideo,
  DAILY_VIDEO_CAP,
  getDailyShuffledVideos,
  deriveUserCategories,
  getRecommendedVideos,
  getMergedCategoryMeta,
  getMergedAllCategories,
} from 'stores/explore-store';
import { useAuthStore } from 'stores/auth-store';
import { usePatientHealthStore } from 'stores/health-store';
import { useLifecoinsWalletStore } from 'stores/lifecoins-wallet-store';
import { usePaymentStore } from 'stores/payment-store';
import { openExternalUrl } from '@/utils/external-link';

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

// ── ReelCard — full-screen portrait card ─────────────────────────────────────

const ReelCard = React.memo(function ReelCard({
  video,
  rewarded,
  cardHeight,
  onWatch,
}: {
  video: ExploreVideo;
  rewarded: boolean;
  cardHeight: number;
  onWatch: () => void;
}) {
  return (
    <Pressable
      onPress={rewarded ? undefined : onWatch}
      style={{ width: '100%', height: cardHeight, overflow: 'hidden' }}
    >
      {/* Full-bleed gradient background */}
      <LinearGradient
        colors={[video.thumbnailColor + 'ff', darken(darken(darken(video.thumbnailColor)))]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Large watermark icon */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { alignItems: 'flex-end', justifyContent: 'center', paddingRight: 20, opacity: 0.12 },
        ]}
        pointerEvents="none"
      >
        <Ionicons
          name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap}
          size={220}
          color="#fff"
        />
      </View>

      {/* Rewarded dim overlay */}
      {rewarded && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} pointerEvents="none" />
      )}

      {/* Bottom gradient scrim for text legibility */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.35, 0.65, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: cardHeight * 0.55 }}
        pointerEvents="none"
      />

      {/* Center play / checkmark */}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: rewarded ? 'rgba(22,163,74,0.88)' : 'rgba(255,255,255,0.18)',
            borderWidth: 2.5,
            borderColor: rewarded ? '#4ade80' : 'rgba(255,255,255,0.6)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={rewarded ? 'checkmark' : 'play'}
            size={30}
            color="#fff"
            style={rewarded ? undefined : { marginLeft: 4 }}
          />
        </View>
        {rewarded && (
          <View
            style={{
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: 'rgba(22,163,74,0.85)',
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 5,
            }}
          >
            <Ionicons name="checkmark-circle" size={13} color="#fff" />
            <Text style={{ fontSize: 13, color: '#fff', fontWeight: '800' }}>Earned today</Text>
          </View>
        )}
      </View>

      {/* Bottom info overlay */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 18,
          paddingBottom: 28,
          paddingTop: 16,
          gap: 8,
        }}
        pointerEvents="none"
      >
        {/* Category + duration row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.2)',
            }}
          >
            <Ionicons
              name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap}
              size={11}
              color={video.thumbnailColor}
            />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{video.category}</Text>
          </View>

          <View
            style={{
              backgroundColor: 'rgba(0,0,0,0.4)',
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>
              {formatDuration(video.durationSeconds)}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: 20,
            fontWeight: '800',
            color: rewarded ? 'rgba(255,255,255,0.5)' : '#fff',
            lineHeight: 26,
          }}
          numberOfLines={3}
        >
          {video.title}
        </Text>

        {/* Instructor + coins row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 12 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: video.thumbnailColor + '55',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Ionicons name="person" size={13} color="#fff" />
            </View>
            <Text
              style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500', flex: 1 }}
              numberOfLines={1}
            >
              {video.instructor}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: rewarded ? 'rgba(22,163,74,0.2)' : 'rgba(251,191,36,0.15)',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: rewarded ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)',
            }}
          >
            <Ionicons name="heart" size={14} color={rewarded ? '#4ade80' : '#fbbf24'} />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '800',
                color: rewarded ? '#4ade80' : '#fbbf24',
              }}
            >
              {rewarded ? 'Earned' : `+${video.coins} LC`}
            </Text>
          </View>
        </View>

        {/* Swipe hint — only on non-rewarded cards */}
        {!rewarded && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 4 }}>
            <Ionicons name="chevron-up" size={13} color="rgba(255,255,255,0.35)" />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: '600' }}>
              Swipe to browse
            </Text>
            <Ionicons name="chevron-up" size={13} color="rgba(255,255,255,0.35)" />
          </View>
        )}
      </View>
    </Pressable>
  );
});

// ── ShortsLane — horizontal strip of short video cards ───────────────────────

const ShortCard = React.memo(function ShortCard({
  video,
  rewarded,
  onWatch,
}: {
  video: ExploreVideo;
  rewarded: boolean;
  onWatch: () => void;
}) {
  return (
    <Pressable
      onPress={rewarded ? undefined : onWatch}
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        width: 108,
        borderRadius: 14,
        overflow: 'hidden',
        marginRight: 10,
      })}
    >
      {/* Portrait thumbnail */}
      <LinearGradient
        colors={[video.thumbnailColor + 'ee', darken(darken(video.thumbnailColor))]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{ width: 108, height: 160, alignItems: 'center', justifyContent: 'center', position: 'relative' }}
      >
        {/* Watermark icon */}
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: 0.18 }]} pointerEvents="none">
          <Ionicons name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap} size={72} color="#fff" />
        </View>

        {/* Rewarded overlay */}
        {rewarded && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
        )}

        {/* Play / checkmark */}
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: rewarded ? 'rgba(22,163,74,0.85)' : 'rgba(255,255,255,0.22)',
            borderWidth: 1.5,
            borderColor: rewarded ? '#4ade80' : 'rgba(255,255,255,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={rewarded ? 'checkmark' : 'play'}
            size={18}
            color="#fff"
            style={rewarded ? undefined : { marginLeft: 2 }}
          />
        </View>

        {/* Duration badge */}
        <View
          style={{
            position: 'absolute',
            bottom: 7,
            left: 7,
            backgroundColor: 'rgba(0,0,0,0.65)',
            borderRadius: 8,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>
            {video.durationSeconds}s
          </Text>
        </View>

        {/* Shorts badge */}
        <View
          style={{
            position: 'absolute',
            top: 7,
            right: 7,
            backgroundColor: '#ff0033',
            borderRadius: 6,
            paddingHorizontal: 5,
            paddingVertical: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Ionicons name="logo-youtube" size={9} color="#fff" />
          <Text style={{ fontSize: 9, color: '#fff', fontWeight: '800' }}>Short</Text>
        </View>
      </LinearGradient>

      {/* Title */}
      <View style={{ paddingHorizontal: 6, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.72)' }}>
        <Text
          style={{ fontSize: 11, fontWeight: '700', color: rewarded ? '#6b7280' : '#f1f5f9', lineHeight: 15 }}
          numberOfLines={2}
        >
          {video.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
          <Ionicons name="heart" size={10} color={rewarded ? '#6b7280' : '#fbbf24'} />
          <Text style={{ fontSize: 10, fontWeight: '800', color: rewarded ? '#6b7280' : '#fbbf24' }}>
            {rewarded ? 'Earned' : '+1 LC'}
          </Text>
        </View>
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

  const [preRollDone, setPreRollDone] = useState(false);
  const [skipCountdown, setSkipCountdown] = useState(5);
  const skipRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adRef = useRef<InterstitialAdSlotHandle>(null);

  const [adReady, setAdReady] = useState(false);
  const [adFailed, setAdFailed] = useState(false);
  const [claimPending, setClaimPending] = useState(false);
  const [noAdModalVisible, setNoAdModalVisible] = useState(false);
  const adFailTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    adFailTimeoutRef.current = setTimeout(() => {
      setAdFailed((prev) => { if (!prev) return true; return prev; });
    }, 8000);
    return () => {
      if (adFailTimeoutRef.current) clearTimeout(adFailTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (claimTimeoutRef.current) clearTimeout(claimTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (preRollDone) return;
    skipRef.current = setInterval(() => {
      setSkipCountdown((c) => {
        if (c <= 1) {
          clearInterval(skipRef.current!);
          skipRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (skipRef.current) clearInterval(skipRef.current);
    };
  }, [preRollDone]);

  const dismissPreRoll = useCallback(() => {
    if (skipRef.current) clearInterval(skipRef.current);
    setPreRollDone(true);
  }, []);

  const videoRef = useRef<WebView>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [embedError, setEmbedError] = useState<number | null>(null);
  const [canClaim, setCanClaim] = useState(false);

  useEffect(() => {
    if (adFailed && canClaim) setNoAdModalVisible(true);
  }, [adFailed, canClaim]);
  const [claiming, setClaiming] = useState(false);
  const requiredSeconds = Math.ceil(video.durationSeconds * 0.7);
  const [secondsLeft, setSecondsLeft] = useState(requiredSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(requiredSeconds);

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

  const handleMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data) as { type: string; code?: number; state?: number };
      if (msg.type === 'ready') {
        setPlayerReady(true);
      } else if (msg.type === 'error') {
        setEmbedError(msg.code ?? -1);
      } else if (msg.type === 'state') {
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

  useEffect(() => {
    if (playerReady) startTimer();
  }, [playerReady, startTimer]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (e: MessageEvent) => {
      if (typeof e.data === 'string') handleMessage(e.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handleMessage]);

  const handleClaim = async () => {
    if (!adReady) {
      setNoAdModalVisible(true);
      return;
    }
    if (adReady) {
      setClaimPending(true);
      setClaiming(true);
      claimTimeoutRef.current = setTimeout(() => {
        setClaiming(false);
        setClaimPending(false);
        setNoAdModalVisible(true);
      }, 20000);
      adRef.current?.show();
    }
  };

  const handleAdDismissed = useCallback(async () => {
    if (!claimPending) return;
    if (claimTimeoutRef.current) {
      clearTimeout(claimTimeoutRef.current);
      claimTimeoutRef.current = null;
    }
    setClaimPending(false);
    await onClaim();
    setClaiming(false);
  }, [claimPending, onClaim]);

  const progress = canClaim ? 1 : (requiredSeconds - secondsLeft) / requiredSeconds;

  const handleClose = useCallback(() => {
    pauseTimer();
    if (videoRef.current) {
      try { videoRef.current.stopLoading(); } catch (_) {}
    }
    onClose();
  }, [onClose, pauseTimer]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>

        {!preRollDone && (
          <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
            <LinearGradient
              colors={[video.thumbnailColor + '33', '#0f172a']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.6 }}
            />
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              style={{ position: 'absolute', top: 52, left: 20 }}
            >
              <Ionicons name="arrow-back" size={24} color="rgba(255,255,255,0.6)" />
            </Pressable>
            <View style={{ alignItems: 'center', gap: 6, marginBottom: 32 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                Up next
              </Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#f1f5f9', textAlign: 'center', lineHeight: 24 }} numberOfLines={2}>
                {video.title}
              </Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
                {video.instructor} · {formatDuration(video.durationSeconds)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4,
                backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: 12,
                paddingHorizontal: 12, paddingVertical: 5,
                borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)' }}>
                <Ionicons name="heart" size={13} color="#fbbf24" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#fbbf24' }}>+{video.coins} LC on completion</Text>
              </View>
            </View>
            <View style={{ width: '100%', marginBottom: 16 }}>
              <RewardedAdButton
                onRewarded={() => {
                  useLifecoinsWalletStore.getState().addCoins('ad_reward', 3, 'Explore pre-roll ad');
                  dismissPreRoll();
                }}
                onDismissed={dismissPreRoll}
                label="Watch a short ad to support LifeGate"
                sublabel="Takes ~30 seconds · earns you +3 bonus LC"
                coinsLabel="+3 LC"
              />
            </View>
            <Pressable
              onPress={skipCountdown === 0 ? dismissPreRoll : undefined}
              style={({ pressed }) => ({
                opacity: skipCountdown > 0 ? 0.4 : pressed ? 0.7 : 1,
                paddingVertical: 10,
                paddingHorizontal: 24,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                {skipCountdown > 0 ? `Skip in ${skipCountdown}s` : 'Skip →'}
              </Text>
            </Pressable>
          </View>
        )}

        {preRollDone && (
          <View style={{ flex: 1 }}>
            <View style={{ width: screenWidth, height: videoHeight, backgroundColor: '#000' }}>
              {embedError !== null ? (
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
                      void openExternalUrl(url);
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

              {!playerReady && embedError === null && (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }]}>
                  <ActivityIndicator size="large" color="#ff0000" />
                  <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 12, fontSize: 13 }}>Loading video…</Text>
                </View>
              )}

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
                  onPress={handleClose}
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
              </View>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: '#0f172a',
                paddingHorizontal: 20,
                paddingTop: 18,
                paddingBottom: 32,
              }}
            >
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

              <Pressable
                onPress={canClaim && !claiming && adReady ? handleClaim : undefined}
                style={({ pressed }) => ({
                  alignSelf: 'stretch',
                  opacity: !canClaim || claiming || !adReady ? 0.45 : pressed ? 0.8 : 1,
                })}
              >
                <LinearGradient
                  colors={canClaim && adReady ? ['#16a34a', '#15803d'] : ['#1e2535', '#1e2535']}
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
                    borderWidth: canClaim && adReady ? 0 : 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                >
                  {claiming ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : canClaim && !adReady ? (
                    <>
                      <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.5)' }}>
                        Loading ad…
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons
                        name={canClaim ? 'play-circle' : 'lock-closed-outline'}
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
                        {canClaim
                          ? `Watch ad → Claim +${video.coins} LC`
                          : 'Keep watching to unlock'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              <InterstitialAdSlot
                ref={adRef}
                onLoaded={() => setAdReady(true)}
                onFailed={() => {
                  setAdReady(false);
                  setAdFailed(true);
                }}
                onDismissed={handleAdDismissed}
              />
            </View>

            {noAdModalVisible && (
              <View
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.72)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 24,
                }}
              >
                <View
                  style={{
                    backgroundColor: '#1e2535',
                    borderRadius: 24,
                    padding: 28,
                    width: '100%',
                    maxWidth: 380,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 64, height: 64, borderRadius: 32,
                      backgroundColor: 'rgba(251,191,36,0.1)',
                      borderWidth: 1.5, borderColor: 'rgba(251,191,36,0.25)',
                      alignItems: 'center', justifyContent: 'center',
                      marginBottom: 18,
                    }}
                  >
                    <Ionicons name="tv-outline" size={30} color="#fbbf24" />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#f1f5f9', textAlign: 'center', marginBottom: 8 }}>
                    Ads Inventory Empty
                  </Text>
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
                    Ads inventory is empty right now. Please try again later.
                  </Text>
                  <Pressable
                    onPress={() => setNoAdModalVisible(false)}
                    style={({ pressed }) => ({
                      backgroundColor: 'transparent',
                      borderRadius: 14,
                      paddingVertical: 12,
                      alignItems: 'center',
                      width: '100%',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.12)',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.45)' }}>
                      Try Again Later
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const balance = usePaymentStore((s) => s.balance);
  const {
    lifecoins,
    totalEarned,
    initialized,
    initialize,
    claimReward,
    isRewarded,
    getDailyRemaining,
    refreshVideos,
    videos,
    dailyCap,
    lastVideoFetchDate,
    trendingCategories,
  } = useExploreStore();

  const categoryMeta = useMemo(() => getMergedCategoryMeta(trendingCategories), [trendingCategories]);
  const allCategories = useMemo(() => getMergedAllCategories(trendingCategories), [trendingCategories]);

  const user = useAuthStore((s) => s.user);
  const patientTimeline = usePatientHealthStore((s) => s.patientTimeline);

  const categories = useMemo<string[]>(() => {
    const diagnosedConditions = patientTimeline.map((e) => e.condition).filter(Boolean);
    return ['All', ...deriveUserCategories(user, diagnosedConditions, allCategories)];
  }, [user, patientTimeline, allCategories]);

  const [activeVideo, setActiveVideo] = useState<ExploreVideo | null>(null);
  const [toast, setToast] = useState<{ message: string; coins: number } | null>(null);
  const [adRewarded, setAdRewarded] = useState(false);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isFetching, setIsFetching] = useState(false);

  // Height of a single reel card (full screen minus safe area top, keeps bottom inset inside card)
  const CARD_HEIGHT = screenHeight - insets.top;

  const AD_BONUS_COINS = 5;

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  useFocusEffect(
    useCallback(() => {
      if (!initialized) return;
      const today = new Date().toISOString().slice(0, 10);
      if (lastVideoFetchDate !== today) {
        setIsFetching(true);
        refreshVideos().finally(() => setIsFetching(false));
      }
    }, [initialized, lastVideoFetchDate, refreshVideos]),
  );

  const shuffledVideos = useMemo(() => getDailyShuffledVideos(videos), [videos]);

  const showToast = useCallback((message: string, coins: number) => {
    setToast({ message, coins });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const handleAdRewarded = useCallback(() => {
    useLifecoinsWalletStore.getState().addCoins('ad_reward', AD_BONUS_COINS, 'Rewarded ad bonus');
    setAdRewarded(true);
    showToast(`+${AD_BONUS_COINS} bonus Lifecoins earned!`, AD_BONUS_COINS);
  }, [showToast]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeVideo) {
        setActiveVideo(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [activeVideo]);

  const handleWatch = useCallback((video: ExploreVideo) => {
    setViewedIds((prev) => {
      const next = new Set(prev);
      next.add(video.id);
      return next;
    });
    setActiveVideo(video);
  }, []);

  const handleClaim = useCallback(async () => {
    if (!activeVideo) return;
    const result = await claimReward(activeVideo.id);
    if (result.capReached) {
      showToast(`Daily limit reached — ${dailyCap} videos max`, 0);
    } else if (result.alreadyDone) {
      showToast('Already claimed today', 0);
    } else {
      showToast(`+${result.coinsEarned} Lifecoins earned!`, result.coinsEarned);
      refreshVideos();
    }
    setActiveVideo(null);
  }, [activeVideo, claimReward, showToast, dailyCap, refreshVideos]);

  const allFiltered = useMemo(() =>
    shuffledVideos
      .filter((v) => activeCategory === 'All' || v.category === activeCategory)
      .sort((a, b) => {
        const aR = isRewarded(a.id);
        const bR = isRewarded(b.id);
        if (aR !== bR) return aR ? 1 : -1;
        const aV = viewedIds.has(a.id);
        const bV = viewedIds.has(b.id);
        if (aV !== bV) return aV ? 1 : -1;
        return 0;
      }),
  [shuffledVideos, activeCategory, isRewarded, viewedIds]);

  // Split into Shorts lane and main reel feed
  const shortsVideos  = useMemo(() => allFiltered.filter((v) => v.isShort),  [allFiltered]);
  const filteredVideos = useMemo(() => allFiltered.filter((v) => !v.isShort), [allFiltered]);

  const renderReelCard = useCallback(
    ({ item: video }: { item: ExploreVideo }) => (
      <ReelCard
        video={video}
        rewarded={isRewarded(video.id)}
        cardHeight={CARD_HEIGHT}
        onWatch={() => handleWatch(video)}
      />
    ),
    [isRewarded, handleWatch, CARD_HEIGHT],
  );

  const dailyRemaining = getDailyRemaining();
  const todayClaimedCount = videos.filter((v) => isRewarded(v.id)).length;
  const availableUnclaimed = videos.length > 0
    ? videos.filter((v) => !isRewarded(v.id)).length
    : null;

  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Reel feed */}
      <FlatList
        data={filteredVideos}
        keyExtractor={(v) => v.id}
        renderItem={renderReelCard}
        snapToInterval={CARD_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        contentContainerStyle={{ paddingTop: insets.top }}
        ListHeaderComponent={
          shortsVideos.length > 0 ? (
            <View style={{ backgroundColor: 'rgba(0,0,0,0.82)', paddingTop: 8, paddingBottom: 12 }}>
              {/* Section header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 10 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#ff0033', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="logo-youtube" size={13} color="#fff" />
                </View>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Shorts</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '600' }}>
                  · quick health tips · +1 LC each
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
              >
                {shortsVideos.map((v) => (
                  <ShortCard
                    key={v.id}
                    video={v}
                    rewarded={isRewarded(v.id)}
                    onWatch={() => handleWatch(v)}
                  />
                ))}
              </ScrollView>
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16, marginTop: 14 }} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View
            style={{
              height: CARD_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              paddingHorizontal: 32,
            }}
          >
            {videos.length === 0 ? (
              <>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
                  Loading today's health videos…
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="logo-youtube" size={42} color="#374151" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#e2e8f0', textAlign: 'center' }}>
                  {`No ${activeCategory} videos available yet`}
                </Text>
                <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                  Try a different category or check back after the daily refresh.
                </Text>
                <Pressable
                  onPress={() => setActiveCategory('All')}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    marginTop: 4,
                    backgroundColor: '#059669',
                    borderRadius: 20,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Show All</Text>
                </Pressable>
              </>
            )}
          </View>
        }
      />

      {/* ── Floating top bar (overlaid on feed) ── */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
        }}
        pointerEvents="box-none"
      >
        {/* Top gradient scrim */}
        <LinearGradient
          colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.28)', 'transparent']}
          locations={[0, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 110 }}
          pointerEvents="none"
        />

        {/* Header row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: insets.top + 10,
            paddingHorizontal: 16,
            paddingBottom: 8,
            gap: 10,
          }}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => router.replace('/(tab)/health')}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.45)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.2 }}>
              Explore
            </Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
              Watch health videos · earn Lifecoins
            </Text>
          </View>

          {/* Stats pills */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.15)',
              }}
            >
              <Ionicons name="play-circle-outline" size={13} color="#6ee7b7" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{todayClaimedCount}</Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: 'rgba(251,191,36,0.3)',
              }}
            >
              <Ionicons name="heart" size={13} color="#fbbf24" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fbbf24' }}>{lifecoins}</Text>
            </View>
          </View>
        </View>

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 7 }}
          pointerEvents="box-none"
        >
          {categories.map((cat) => {
            const isActive = activeCategory === cat;
            const meta = cat !== 'All' ? categoryMeta[cat] : null;
            return (
              <Pressable
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.75 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 13,
                  paddingVertical: 7,
                  borderRadius: 20,
                  backgroundColor: isActive
                    ? (meta ? meta.color : '#059669')
                    : 'rgba(0,0,0,0.5)',
                  borderWidth: 1,
                  borderColor: isActive
                    ? 'transparent'
                    : 'rgba(255,255,255,0.2)',
                })}
              >
                <Ionicons
                  name={(meta ? meta.icon : 'grid-outline') as keyof typeof Ionicons.glyphMap}
                  size={13}
                  color={isActive ? '#fff' : (meta ? meta.color : '#6ee7b7')}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
                  }}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

      </View>

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
            bottom: insets.bottom + 24,
            left: 24,
            right: 24,
            backgroundColor: 'rgba(17,24,39,0.96)',
            borderRadius: 16,
            paddingVertical: 14,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 16,
            elevation: 12,
            zIndex: 20,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
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

      {/* Bonus rewarded ad when daily cap is hit */}
      {dailyRemaining === 0 && (
        <View
          style={{
            position: 'absolute',
            bottom: insets.bottom + 80,
            left: 20,
            right: 20,
            zIndex: 15,
          }}
        >
          <RewardedAdButton
            onRewarded={handleAdRewarded}
            label="Watch an ad for bonus coins"
            sublabel="Daily video limit reached · earn extra Lifecoins"
            coinsLabel={adRewarded ? '✓ Claimed' : `+${AD_BONUS_COINS} LC`}
            disabled={adRewarded}
          />
        </View>
      )}

      {!balance?.isPremium && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5 }}>
          <BannerAd />
        </View>
      )}
    </View>
  );
}
