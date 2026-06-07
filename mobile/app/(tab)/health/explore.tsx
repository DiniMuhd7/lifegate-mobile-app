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
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
  StyleSheet,
  useWindowDimensions,
  BackHandler,
  ScrollView,
  ViewToken,
  RefreshControl,
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

// Deterministic Fisher–Yates shuffle seeded by `seed`. Used by pull-to-refresh
// so each pull reorders the feed in a fresh but stable-per-pull arrangement.
function shuffleWithSeed<T>(arr: readonly T[], seed: number): T[] {
  const a = [...arr];
  let s = (seed * 9301 + 49297) % 233280 || 1;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── ReelCard — full-screen portrait card ─────────────────────────────────────

// ── Inline reel card — auto-plays when isActive, shows thumbnail otherwise ───
const ReelCard = React.memo(function ReelCard({
  video,
  isActive,
  rewarded,
  cardHeight,
  onClaim,
  onWatchEvent,
}: {
  video: ExploreVideo;
  isActive: boolean;
  rewarded: boolean;
  cardHeight: number;
  onClaim: (videoId: string) => Promise<void>;
  onWatchEvent: (videoId: string, category: string, watchSeconds: number, completed: boolean, isShort: boolean) => void;
}) {
  const { bottom: bottomInset } = useSafeAreaInsets();

  // ── Player state (all local — each card owns its own lifecycle) ────────────
  const videoRef    = useRef<WebView>(null);
  const adRef       = useRef<InterstitialAdSlotHandle>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(0);
  const claimTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playerReady,     setPlayerReady]     = useState(false);
  const [embedError,      setEmbedError]      = useState<number | null>(null);
  const [canClaim,        setCanClaim]        = useState(false);
  const [secondsLeft,     setSecondsLeft]     = useState(0);
  const [adReady,         setAdReady]         = useState(false);
  const [adFailed,        setAdFailed]        = useState(false);
  const [claiming,        setClaiming]        = useState(false);
  const [claimPending,    setClaimPending]    = useState(false);
  const [noAdVisible,     setNoAdVisible]     = useState(false);

  const requiredSeconds = Math.ceil(video.durationSeconds * 0.7);

  // Reset everything when this card leaves / enters the viewport
  useEffect(() => {
    if (!isActive) {
      // Stop timer
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (claimTimeoutRef.current) { clearTimeout(claimTimeoutRef.current); claimTimeoutRef.current = null; }
      try { videoRef.current?.stopLoading(); } catch (_) {}
      // Report how much the user watched before swiping away
      const watched = requiredSeconds - Math.max(remainingRef.current, 0);
      if (watched > 0) {
        onWatchEvent(video.id, video.category, watched, canClaim, false);
      }
      // Reset state so it starts fresh next time the card comes back into view
      setPlayerReady(false);
      setEmbedError(null);
      setCanClaim(false);
      setSecondsLeft(requiredSeconds);
      setAdReady(false);
      setAdFailed(false);
      setClaiming(false);
      setClaimPending(false);
      setNoAdVisible(false);
      remainingRef.current = requiredSeconds;
    } else {
      remainingRef.current = requiredSeconds;
      setSecondsLeft(requiredSeconds);
    }
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (claimTimeoutRef.current) { clearTimeout(claimTimeoutRef.current); claimTimeoutRef.current = null; }
    };
  }, [isActive, requiredSeconds, onWatchEvent, video.id, video.category, canClaim]);

  // Show no-ad overlay when ad has failed and the user just earned the right to claim
  useEffect(() => {
    if (adFailed && canClaim) setNoAdVisible(true);
  }, [adFailed, canClaim]);

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
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
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

  useEffect(() => {
    if (Platform.OS !== 'web' || !isActive) return;
    const listener = (e: MessageEvent) => { if (typeof e.data === 'string') handleMessage(e.data); };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handleMessage, isActive]);

  useEffect(() => {
    if (playerReady && isActive) startTimer();
  }, [playerReady, startTimer, isActive]);

  const handleClaim = useCallback(async () => {
    if (!adReady) { setNoAdVisible(true); return; }
    setClaimPending(true);
    setClaiming(true);
    claimTimeoutRef.current = setTimeout(() => {
      setClaiming(false);
      setClaimPending(false);
      setNoAdVisible(true);
    }, 20000);
    adRef.current?.show();
  }, [adReady]);

  const handleAdDismissed = useCallback(async () => {
    if (!claimPending) return;
    if (claimTimeoutRef.current) { clearTimeout(claimTimeoutRef.current); claimTimeoutRef.current = null; }
    setClaimPending(false);
    await onClaim(video.id);
    setClaiming(false);
  }, [claimPending, onClaim, video.id]);

  const progress = canClaim ? 1 : (requiredSeconds - secondsLeft) / Math.max(requiredSeconds, 1);

  // YouTube IFrame HTML — same as the removed VideoPlayerModal
  const playerHtml = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;background:#000}
    html,body{width:100%;height:100%;overflow:hidden}
    #player{width:100%;height:100%}
    iframe{width:100%!important;height:100%!important;border:none!important}
  </style>
</head><body>
  <div id="player"></div>
  <script>
    function send(obj){var m=JSON.stringify(obj);try{window.ReactNativeWebView.postMessage(m)}catch(e){}try{window.parent.postMessage(m,'*')}catch(e){}}
    var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
    function onYouTubeIframeAPIReady(){
      new YT.Player('player',{
        videoId:'${video.youtubeId}',
        playerVars:{autoplay:1,playsinline:1,rel:0,modestbranding:1,controls:1,origin:'https://www.youtube.com'},
        events:{
          onReady:function(e){e.target.playVideo();send({type:'ready'})},
          onError:function(e){send({type:'error',code:e.data})},
          onStateChange:function(e){send({type:'state',state:e.data})}
        }
      });
    }
  <\/script>
</body></html>`;

  return (
    <View style={{ width: '100%', height: cardHeight, overflow: 'hidden', backgroundColor: '#000' }}>

      {/* ── Background: WebView when active, gradient thumbnail otherwise ── */}
      {isActive && embedError === null ? (
        Platform.OS === 'web' ? (
          // @ts-ignore
          React.createElement('iframe', {
            srcDoc: playerHtml,
            style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' },
            allow: 'autoplay; fullscreen; picture-in-picture',
            allowFullScreen: true,
            sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
            onLoad: () => setPlayerReady(true),
          })
        ) : (
          <WebView
            ref={videoRef}
            source={{ html: playerHtml, baseUrl: 'https://www.youtube.com' }}
            style={StyleSheet.absoluteFill}
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            onLoad={() => setPlayerReady(true)}
            onMessage={(e) => handleMessage(e.nativeEvent.data)}
            onShouldStartLoadWithRequest={(req) => {
              const url = req.url;
              if (url.startsWith('vnd.youtube') || url.startsWith('youtube://') ||
                  url.startsWith('intent://') || url.startsWith('market://')) return false;
              return true;
            }}
          />
        )
      ) : (
        /* Thumbnail when not active or embed error */
        <LinearGradient
          colors={[video.thumbnailColor + 'ff', darken(darken(darken(video.thumbnailColor)))]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Watermark icon (always, on thumbnail) */}
      {!isActive && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'flex-end', justifyContent: 'center', paddingRight: 20, opacity: 0.12 }]} pointerEvents="none">
          <Ionicons name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap} size={220} color="#fff" />
        </View>
      )}

      {/* Loading spinner (active, not ready, no error) */}
      {isActive && !playerReady && embedError === null && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }]} pointerEvents="none">
          <ActivityIndicator size="large" color="#ff0000" />
          <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 10, fontSize: 13 }}>Loading…</Text>
        </View>
      )}

      {/* Embed error fallback */}
      {isActive && embedError !== null && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 }]}>
          <LinearGradient colors={[video.thumbnailColor + '22', '#000']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.7 }} />
          <Ionicons name="logo-youtube" size={48} color="#ff0000" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' }}>Video can't play in-app</Text>
          <Pressable
            onPress={() => void openExternalUrl(`https://www.youtube.com/watch?v=${video.youtubeId}`)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ff0000', borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12 })}
          >
            <Ionicons name="logo-youtube" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Open on YouTube</Text>
          </Pressable>
        </View>
      )}

      {/* Rewarded dim overlay */}
      {rewarded && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} pointerEvents="none" />}

      {/* Bottom gradient scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.3, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: cardHeight * 0.6 }}
        pointerEvents="none"
      />

      {/* Rewarded badge (not active) */}
      {rewarded && !isActive && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(22,163,74,0.88)', borderWidth: 2.5, borderColor: '#4ade80', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={30} color="#fff" />
          </View>
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(22,163,74,0.85)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 }}>
            <Ionicons name="checkmark-circle" size={13} color="#fff" />
            <Text style={{ fontSize: 13, color: '#fff', fontWeight: '800' }}>Earned today</Text>
          </View>
        </View>
      )}

      {/* ── BOTTOM OVERLAY: info + progress + claim ── */}
      <View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          paddingHorizontal: 18,
          paddingBottom: bottomInset + (isActive ? 12 : 24),
          paddingTop: 16, gap: 6,
        }}
        pointerEvents={isActive ? 'box-none' : 'none'}
      >
        {/* Category + duration */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} pointerEvents="none">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
            <Ionicons name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap} size={11} color={video.thumbnailColor} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{video.category}</Text>
          </View>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>{formatDuration(video.durationSeconds)}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={{ fontSize: 19, fontWeight: '800', color: rewarded ? 'rgba(255,255,255,0.5)' : '#fff', lineHeight: 25 }} numberOfLines={2} pointerEvents="none">
          {video.title}
        </Text>

        {/* Instructor + coins */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} pointerEvents="none">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 12 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: video.thumbnailColor + '55', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
              <Ionicons name="person" size={12} color="#fff" />
            </View>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '500', flex: 1 }} numberOfLines={1}>{video.instructor}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: rewarded ? 'rgba(22,163,74,0.2)' : 'rgba(251,191,36,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: rewarded ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)' }}>
            <Ionicons name="heart" size={13} color={rewarded ? '#4ade80' : '#fbbf24'} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: rewarded ? '#4ade80' : '#fbbf24' }}>{rewarded ? 'Earned' : `+${video.coins} LC`}</Text>
          </View>
        </View>

        {/* Progress bar + status (only when active and not rewarded) */}
        {isActive && !rewarded && (
          <View pointerEvents="none" style={{ gap: 5, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: canClaim ? '#4ade80' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {canClaim ? '✓ Ready to claim' : playerReady ? 'Watching…' : 'Loading…'}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: canClaim ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
                {canClaim ? 'Done!' : playerReady ? (secondsLeft > 60 ? `${Math.ceil(secondsLeft / 60)}m left` : `${secondsLeft}s left`) : ''}
              </Text>
            </View>
            <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round(progress * 100)}%` as any, backgroundColor: canClaim ? '#4ade80' : '#0AADA2', borderRadius: 2 }} />
            </View>
          </View>
        )}

        {/* Claim button (only when active and can claim) */}
        {isActive && !rewarded && (
          <Pressable
            onPress={canClaim && !claiming && adReady ? handleClaim : undefined}
            style={({ pressed }) => ({ opacity: !canClaim || claiming || !adReady ? 0.42 : pressed ? 0.82 : 1, marginTop: 4 })}
          >
            <LinearGradient
              colors={canClaim && adReady ? ['#16a34a', '#15803d'] : ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.04)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 14, borderRadius: 16, borderWidth: canClaim && adReady ? 0 : 1, borderColor: 'rgba(255,255,255,0.12)' }}
            >
              {claiming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : canClaim && !adReady ? (
                <>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.5)' }}>Loading ad…</Text>
                </>
              ) : (
                <>
                  <Ionicons name={canClaim ? 'play-circle' : 'lock-closed-outline'} size={18} color={canClaim ? '#fbbf24' : 'rgba(255,255,255,0.3)'} />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: canClaim ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                    {canClaim ? `Watch ad · Claim +${video.coins} LC` : 'Keep watching to unlock'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        )}

        {/* Swipe hint (thumbnail only) */}
        {!isActive && !rewarded && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 2 }} pointerEvents="none">
            <Ionicons name="chevron-up" size={12} color="rgba(255,255,255,0.35)" />
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '600' }}>Swipe to browse</Text>
            <Ionicons name="chevron-up" size={12} color="rgba(255,255,255,0.35)" />
          </View>
        )}
      </View>

      {/* No-ad overlay */}
      {noAdVisible && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end', padding: 24, zIndex: 20 }]}>
          <View style={{ backgroundColor: '#111827', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(251,191,36,0.1)', borderWidth: 1.5, borderColor: 'rgba(251,191,36,0.3)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="tv-outline" size={26} color="#fbbf24" />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#f1f5f9', textAlign: 'center' }}>Ads Inventory Empty</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20 }}>No ads available right now. Please try again later.</Text>
            <Pressable onPress={() => setNoAdVisible(false)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, width: '100%', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', marginTop: 4 })}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>Try Again Later</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Ad slot — only mounted when this card is active */}
      {isActive && (
        <InterstitialAdSlot
          ref={adRef}
          onLoaded={() => setAdReady(true)}
          onFailed={() => { setAdReady(false); setAdFailed(true); }}
          onDismissed={handleAdDismissed}
        />
      )}
    </View>
  );
});

// ── ShortItem — one short inside the swipeable FlatList ──────────────────────
// Mirrors ReelCard's isActive pattern: WebView only mounts when this item
// is the visible page, so only one YouTube player is active at a time.

const ShortItem = React.memo(function ShortItem({
  video,
  isActive,
  itemHeight,
  onClaim,
  onClose,
  onWatchEvent,
}: {
  video: ExploreVideo;
  isActive: boolean;
  itemHeight: number;
  onClaim: (videoId: string) => Promise<void>;
  onClose: () => void;
  onWatchEvent: (videoId: string, category: string, watchSeconds: number, completed: boolean, isShort: boolean) => void;
}) {
  const { bottom: bottomInset } = useSafeAreaInsets();

  const videoRef    = useRef<WebView>(null);
  const adRef       = useRef<InterstitialAdSlotHandle>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(0);
  const claimTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adFailTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requiredSeconds = Math.max(Math.ceil(video.durationSeconds * 0.8), video.durationSeconds);

  const [playerReady,  setPlayerReady]  = useState(false);
  const [embedError,   setEmbedError]   = useState<number | null>(null);
  const [canClaim,     setCanClaim]     = useState(false);
  const [secondsLeft,  setSecondsLeft]  = useState(requiredSeconds);
  const [adReady,      setAdReady]      = useState(false);
  const [adFailed,     setAdFailed]     = useState(false);
  const [claiming,     setClaiming]     = useState(false);
  const [claimPending, setClaimPending] = useState(false);
  const [noAdVisible,  setNoAdVisible]  = useState(false);

  // Reset all state when this item leaves the viewport; re-arm when it returns
  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current)  { clearInterval(intervalRef.current);  intervalRef.current  = null; }
      if (claimTimeoutRef.current)  { clearTimeout(claimTimeoutRef.current);  claimTimeoutRef.current  = null; }
      if (adFailTimeoutRef.current) { clearTimeout(adFailTimeoutRef.current); adFailTimeoutRef.current = null; }
      try { videoRef.current?.stopLoading(); } catch (_) {}
      // Report watch event before resetting
      const watched = requiredSeconds - Math.max(remainingRef.current, 0);
      if (watched > 0) {
        onWatchEvent(video.id, video.category, watched, canClaim, true);
      }
      setPlayerReady(false); setEmbedError(null); setCanClaim(false);
      setSecondsLeft(requiredSeconds); setAdReady(false); setAdFailed(false);
      setClaiming(false); setClaimPending(false); setNoAdVisible(false);
      remainingRef.current = requiredSeconds;
    } else {
      remainingRef.current = requiredSeconds;
      setSecondsLeft(requiredSeconds);
      // 8-second ad-load failsafe
      adFailTimeoutRef.current = setTimeout(() => setAdFailed(true), 8000);
    }
    return () => {
      if (intervalRef.current)      clearInterval(intervalRef.current);
      if (claimTimeoutRef.current)  clearTimeout(claimTimeoutRef.current);
      if (adFailTimeoutRef.current) clearTimeout(adFailTimeoutRef.current);
    };
  }, [isActive, requiredSeconds, onWatchEvent, video.id, video.category, canClaim]);

  useEffect(() => {
    if (adFailed && canClaim) setNoAdVisible(true);
  }, [adFailed, canClaim]);

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
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
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

  useEffect(() => {
    if (playerReady) startTimer();
  }, [playerReady, startTimer]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (e: MessageEvent) => { if (typeof e.data === 'string') handleMessage(e.data); };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handleMessage]);

  const handleClaimPress = useCallback(async () => {
    if (!adReady) { setNoAdVisible(true); return; }
    setClaimPending(true);
    setClaiming(true);
    claimTimeoutRef.current = setTimeout(() => {
      setClaiming(false); setClaimPending(false); setNoAdVisible(true);
    }, 20000);
    adRef.current?.show();
  }, [adReady]);

  const handleAdDismissed = useCallback(async () => {
    if (!claimPending) return;
    if (claimTimeoutRef.current) { clearTimeout(claimTimeoutRef.current); claimTimeoutRef.current = null; }
    setClaimPending(false);
    await onClaim(video.id);
    setClaiming(false);
    // Claimed — close the whole shorts player so the user returns to the feed
    onClose();
  }, [claimPending, onClaim, video.id, onClose]);

  const progress = canClaim ? 1 : (requiredSeconds - secondsLeft) / Math.max(requiredSeconds, 1);

  // IFrame HTML — uses the "cover" technique so the video fills the portrait
  // screen edge-to-edge (cropping the sides) instead of being letterboxed with
  // black bars top and bottom. That black letterbox is the "dark bar" — it is
  // the YouTube player background, not an app overlay.
  const playerHtml = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden;background:#000}
    /* Scale the player so a 16:9 video covers the full portrait viewport:
       fill by height (100vh) and overflow the width (177.78vh = 100vh*16/9),
       centered — eliminating the top/bottom black letterbox bars. */
    #player{
      position:absolute;top:50%;left:50%;
      transform:translate(-50%,-50%);
      width:100vw;height:56.25vw;
      min-height:100vh;min-width:177.78vh;
    }
    iframe{width:100%!important;height:100%!important;border:none!important}
  </style>
</head><body>
  <div id="player"></div>
  <script>
    function send(obj){var m=JSON.stringify(obj);try{window.ReactNativeWebView.postMessage(m)}catch(e){}try{window.parent.postMessage(m,'*')}catch(e){}}
    var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
    function onYouTubeIframeAPIReady(){
      new YT.Player('player',{
        videoId:'${video.youtubeId}',
        playerVars:{autoplay:1,playsinline:1,loop:1,playlist:'${video.youtubeId}',rel:0,modestbranding:1,controls:0,origin:'https://www.youtube.com'},
        events:{
          onReady:function(e){e.target.playVideo();send({type:'ready'})},
          onError:function(e){send({type:'error',code:e.data})},
          onStateChange:function(e){send({type:'state',state:e.data})}
        }
      });
    }
  <\/script>
</body></html>`;

  return (
    <View style={{ width: '100%', height: itemHeight, backgroundColor: '#000', overflow: 'hidden' }}>

      {/* Video or thumbnail */}
      {isActive && embedError === null ? (
        Platform.OS === 'web' ? (
          // @ts-ignore
          React.createElement('iframe', {
            srcDoc: playerHtml,
            style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' },
            allow: 'autoplay; fullscreen; picture-in-picture',
            allowFullScreen: true,
            sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
            onLoad: () => setPlayerReady(true),
          })
        ) : (
          <WebView
            ref={videoRef}
            source={{ html: playerHtml, baseUrl: 'https://www.youtube.com' }}
            style={StyleSheet.absoluteFill}
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo={false}
            onLoad={() => setPlayerReady(true)}
            onMessage={(e) => handleMessage(e.nativeEvent.data)}
            onShouldStartLoadWithRequest={(req) => {
              const url = req.url;
              if (url.startsWith('vnd.youtube') || url.startsWith('youtube://') ||
                  url.startsWith('intent://') || url.startsWith('market://')) return false;
              return true;
            }}
          />
        )
      ) : (
        <LinearGradient
          colors={[video.thumbnailColor + 'ff', darken(darken(video.thumbnailColor))]}
          start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Embed error */}
      {isActive && embedError !== null && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }]}>
          <LinearGradient colors={[video.thumbnailColor + '33', '#000']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.7 }} />
          <Ionicons name="logo-youtube" size={44} color="#ff0000" />
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center' }}>Short can't play in-app</Text>
          <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#374151', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 })}>
            <Ionicons name="close" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Close</Text>
          </Pressable>
        </View>
      )}

      {/* Loading spinner */}
      {isActive && !playerReady && embedError === null && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' }]} pointerEvents="none">
          <ActivityIndicator size="large" color="#ff0000" />
          <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 10, fontSize: 12 }}>Loading Short…</Text>
        </View>
      )}

      {/* Bottom scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)', '#000']}
        locations={[0, 0.3, 0.65, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: itemHeight * 0.5 }}
        pointerEvents="none"
      />

      {/* Video info */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingBottom: bottomInset + 14, gap: 5 }} pointerEvents={isActive ? 'box-none' : 'none'}>
        {/* Category + duration */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} pointerEvents="none">
          <View style={{ backgroundColor: '#ff0033', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="logo-youtube" size={9} color="#fff" />
            <Text style={{ fontSize: 9, color: '#fff', fontWeight: '800' }}>Short</Text>
          </View>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>{video.durationSeconds}s · {video.category}</Text>
        </View>
        {/* Title */}
        <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff', lineHeight: 22 }} numberOfLines={2} pointerEvents="none">{video.title}</Text>
        {/* Channel + coins */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} pointerEvents="none">
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', flex: 1, marginRight: 10 }} numberOfLines={1}>{video.instructor}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(251,191,36,0.15)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' }}>
            <Ionicons name="heart" size={12} color="#fbbf24" />
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#fbbf24' }}>+{video.coins} LC</Text>
          </View>
        </View>

        {/* Progress (active only) */}
        {isActive && (
          <View pointerEvents="none" style={{ gap: 4, marginTop: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: canClaim ? '#4ade80' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {canClaim ? '✓ Ready to claim' : playerReady ? 'Watching…' : 'Loading…'}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: canClaim ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
                {canClaim ? 'Done!' : playerReady ? `${secondsLeft}s left` : ''}
              </Text>
            </View>
            <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round(progress * 100)}%` as any, backgroundColor: canClaim ? '#4ade80' : '#ff0033', borderRadius: 2 }} />
            </View>
          </View>
        )}

        {/* Claim button (active only) */}
        {isActive && (
          <Pressable
            onPress={canClaim && !claiming && adReady ? handleClaimPress : undefined}
            style={({ pressed }) => ({ opacity: !canClaim || claiming || !adReady ? 0.42 : pressed ? 0.82 : 1, marginTop: 4 })}
          >
            <LinearGradient
              colors={canClaim && adReady ? ['#16a34a', '#15803d'] : ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.04)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: canClaim && adReady ? 0 : 1, borderColor: 'rgba(255,255,255,0.1)' }}
            >
              {claiming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : canClaim && !adReady ? (
                <>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)' }}>Loading ad…</Text>
                </>
              ) : (
                <>
                  <Ionicons name={canClaim ? 'play-circle' : 'lock-closed-outline'} size={16} color={canClaim ? '#fbbf24' : 'rgba(255,255,255,0.3)'} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: canClaim ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                    {canClaim ? `Watch ad · Claim +${video.coins} LC` : 'Watch to unlock'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        )}

        {/* Swipe hint on inactive cards */}
        {!isActive && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 }} pointerEvents="none">
            <Ionicons name="chevron-up" size={11} color="rgba(255,255,255,0.3)" />
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>Swipe for next Short</Text>
            <Ionicons name="chevron-up" size={11} color="rgba(255,255,255,0.3)" />
          </View>
        )}
      </View>

      {/* No-ad overlay */}
      {noAdVisible && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-end', padding: 22, zIndex: 20 }]}>
          <View style={{ backgroundColor: '#111827', borderRadius: 22, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(251,191,36,0.1)', borderWidth: 1.5, borderColor: 'rgba(251,191,36,0.3)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="tv-outline" size={22} color="#fbbf24" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#f1f5f9', textAlign: 'center' }}>Ads Inventory Empty</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 17 }}>No ads right now. Try again later.</Text>
            <Pressable onPress={() => setNoAdVisible(false)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, width: '100%', paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', marginTop: 2 })}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>Try Again Later</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Ad slot — only when active */}
      {isActive && (
        <InterstitialAdSlot
          ref={adRef}
          onLoaded={() => { setAdReady(true); if (adFailTimeoutRef.current) clearTimeout(adFailTimeoutRef.current); }}
          onFailed={() => { setAdReady(false); setAdFailed(true); }}
          onDismissed={handleAdDismissed}
        />
      )}
    </View>
  );
});

// ── ShortPlayerModal — swipeable full-screen shorts player ───────────────────

function ShortPlayerModal({
  videos,
  initialIndex,
  onClose,
  onClaim,
  onWatchEvent,
  onRefresh,
}: {
  videos: ExploreVideo[];
  initialIndex: number;
  onClose: () => void;
  onClaim: (videoId: string) => Promise<void>;
  onWatchEvent: (videoId: string, category: string, watchSeconds: number, completed: boolean, isShort: boolean) => void;
  onRefresh?: () => Promise<void>;
}) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [refreshing, setRefreshing] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const listRef = useRef<FlatList<ExploreVideo>>(null);

  // First view preserves order (so the tapped short opens); after a pull, the
  // shorts are reshuffled.
  const displayVideos = useMemo(
    () => (shuffleSeed > 0 ? shuffleWithSeed(videos, shuffleSeed) : videos),
    [videos, shuffleSeed],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].isViewable) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  });

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: screenHeight, offset: screenHeight * index, index }),
    [screenHeight],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ExploreVideo; index: number }) => (
      <ShortItem
        video={item}
        isActive={index === activeIndex}
        itemHeight={screenHeight}
        onClaim={onClaim}
        onClose={onClose}
        onWatchEvent={onWatchEvent}
      />
    ),
    [activeIndex, screenHeight, onClaim, onClose, onWatchEvent],
  );

  // Pull-to-refresh: refetch fresh shorts, reshuffle, jump back to the top.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
    } catch {
      /* keep existing shorts on failure */
    }
    setShuffleSeed((seed) => seed + 1);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch {
        /* list may be empty */
      }
    });
    setRefreshing(false);
  }, [onRefresh]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          data={displayVideos}
          keyExtractor={(v) => v.id}
          renderItem={renderItem}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={getItemLayout}
          // initialScrollIndex only applies to the original order; once
          // reshuffled we always start at the top.
          initialScrollIndex={shuffleSeed > 0 ? 0 : initialIndex}
          onScrollToIndexFailed={(info) => {
            // Safety net: if the target row isn't laid out yet, retry after a tick.
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 100);
          }}
          ref={listRef}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig}
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={3}
          removeClippedSubviews={false}
          extraData={`${activeIndex}:${shuffleSeed}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#ff0033"
              colors={['#ff0033']}
              progressBackgroundColor="#0f172a"
              title="Refreshing Shorts…"
              titleColor="rgba(255,255,255,0.6)"
            />
          }
        />

        {/* Floating top bar: close + counter — transparent so the video shows
            through. A very faint top fade keeps the status bar / chips legible;
            the buttons carry their own translucent backgrounds for contrast. */}
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}
          pointerEvents="box-none"
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.22)', 'transparent']}
            style={{ paddingTop: insets.top + 10, paddingBottom: 24, paddingHorizontal: 16 }}
            pointerEvents="box-none"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} pointerEvents="box-none">
              <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
                  <Ionicons name="close" size={20} color="#fff" />
                </View>
              </Pressable>
              <View style={{ flex: 1 }} pointerEvents="none">
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Health Shorts</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                  {activeIndex + 1} / {displayVideos.length} · Pull to refresh
                </Text>
              </View>
              {/* Shorts badge */}
              <View style={{ backgroundColor: '#ff0033', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }} pointerEvents="none">
                <Ionicons name="logo-youtube" size={12} color="#fff" />
                <Text style={{ fontSize: 11, color: '#fff', fontWeight: '800' }}>Shorts</Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

// ── ShortsLane — horizontal strip of short video cards ───────────────────────

// Circle diameter + ring thickness — matches Snapchat/Facebook story sizing.
const SHORT_CIRCLE = 72;
const SHORT_RING   = 3;

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
        opacity: pressed ? 0.82 : 1,
        alignItems: 'center',
        width: SHORT_CIRCLE + 16, // extra horizontal room so labels don't clip
        marginRight: 6,
      })}
    >
      {/* Coloured ring — teal gradient when unwatched, muted grey when earned */}
      <LinearGradient
        colors={rewarded
          ? ['#374151', '#374151']
          : [video.thumbnailColor, darken(video.thumbnailColor) + 'cc', '#0AADA2']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={{
          width:  SHORT_CIRCLE + SHORT_RING * 2 + 2,
          height: SHORT_CIRCLE + SHORT_RING * 2 + 2,
          borderRadius: (SHORT_CIRCLE + SHORT_RING * 2 + 2) / 2,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 6,
        }}
      >
        {/* White gap between ring and circle */}
        <View
          style={{
            width:  SHORT_CIRCLE + 4,
            height: SHORT_CIRCLE + 4,
            borderRadius: (SHORT_CIRCLE + 4) / 2,
            backgroundColor: '#000',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Circle avatar */}
          <LinearGradient
            colors={[video.thumbnailColor + 'ff', darken(darken(video.thumbnailColor))]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={{
              width: SHORT_CIRCLE,
              height: SHORT_CIRCLE,
              borderRadius: SHORT_CIRCLE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {/* Watermark icon */}
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: 0.15 }]} pointerEvents="none">
              <Ionicons name={video.thumbnailIcon as keyof typeof Ionicons.glyphMap} size={44} color="#fff" />
            </View>

            {/* Rewarded dim */}
            {rewarded && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.48)' }]} />
            )}

            {/* Play / checkmark icon */}
            <View
              style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: rewarded ? 'rgba(22,163,74,0.9)' : 'rgba(0,0,0,0.38)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: rewarded ? '#4ade80' : 'rgba(255,255,255,0.6)',
              }}
            >
              <Ionicons
                name={rewarded ? 'checkmark' : 'play'}
                size={13}
                color="#fff"
                style={rewarded ? undefined : { marginLeft: 2 }}
              />
            </View>
          </LinearGradient>
        </View>
      </LinearGradient>

      {/* YouTube Shorts badge — centred below ring */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 3 }}>
        <View style={{ backgroundColor: '#ff0033', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Ionicons name="logo-youtube" size={8} color="#fff" />
          <Text style={{ fontSize: 8, color: '#fff', fontWeight: '800' }}>Short</Text>
        </View>
        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: '600' }}>
          {video.durationSeconds}s
        </Text>
      </View>

      {/* Channel name */}
      <Text
        style={{ fontSize: 10.5, fontWeight: '700', color: rewarded ? '#6b7280' : '#e2e8f0', textAlign: 'center', lineHeight: 14 }}
        numberOfLines={2}
      >
        {video.instructor}
      </Text>

      {/* Coins label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
        <Ionicons name="heart" size={9} color={rewarded ? '#6b7280' : '#fbbf24'} />
        <Text style={{ fontSize: 9, fontWeight: '800', color: rewarded ? '#6b7280' : '#fbbf24' }}>
          {rewarded ? 'Earned' : '+1 LC'}
        </Text>
      </View>
    </Pressable>
  );
});

// ── Main Screen ──────────────────────────────────────────────────────────────
// VideoPlayerModal removed — video now plays inline inside ReelCard.

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
    reportWatch,
  } = useExploreStore();

  const user = useAuthStore((s) => s.user);
  const patientTimeline = usePatientHealthStore((s) => s.patientTimeline);

  // Which card index is currently snapped into view — drives auto-play
  const [activeIndex, setActiveIndex]   = useState<number | null>(0);
  // True only while this screen is focused. Playback (and the WebView) is
  // gated on this so the active video is torn down BEFORE we navigate away —
  // abruptly unmounting a live react-native-webview during navigation crashes
  // on Android.
  const [screenFocused, setScreenFocused] = useState(true);
  // Index into shortsVideos for the short player modal (-1 = closed)
  const [activeShortIndex, setActiveShortIndex] = useState<number>(-1);
  const [toast,       setToast]       = useState<{ message: string; coins: number } | null>(null);
  const [adRewarded,  setAdRewarded]  = useState(false);
  const [viewedIds,   setViewedIds]   = useState<Set<string>>(new Set());
  const [isFetching,  setIsFetching]  = useState(false);
  // Pull-to-refresh state. shuffleSeed > 0 reshuffles the feed on each pull;
  // 0 preserves the backend's personalised order on first load.
  const [refreshing,  setRefreshing]  = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const reelListRef = useRef<FlatList<ExploreVideo>>(null);

  // Stable refs required by FlatList's viewability API
  const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].isViewable) {
      setActiveIndex(viewableItems[0].index ?? null);
    }
  });
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  // Height of a single reel card (full screen minus safe area top, keeps bottom inset inside card)
  // Full screen height — every card is exactly one page so pagingEnabled works
  // perfectly. Safe area is handled inside each card, not by shrinking it.
  const CARD_HEIGHT = screenHeight;

  const AD_BONUS_COINS = 5;

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  useFocusEffect(
    useCallback(() => {
      // Mark focused so the visible card resumes playback.
      setScreenFocused(true);
      if (initialized) {
        const today = new Date().toISOString().slice(0, 10);
        if (lastVideoFetchDate !== today) {
          setIsFetching(true);
          refreshVideos().finally(() => setIsFetching(false));
        }
      }
      // On blur (navigating away by any means), drop focus so every card's
      // WebView unmounts cleanly before this screen is destroyed.
      return () => setScreenFocused(false);
    }, [initialized, lastVideoFetchDate, refreshVideos]),
  );

  // Safe back: stop/unmount the active video first, then navigate on the next
  // tick so the WebView is gone before the screen unmounts (prevents Android
  // WebView teardown crash).
  const handleBack = useCallback(() => {
    setScreenFocused(false);
    setActiveIndex(null);
    setTimeout(() => router.replace('/(tab)/health'), 60);
  }, []);

  // Route the Android hardware back button through the same safe path so it
  // also tears the WebView down before navigating.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true; // consume — we handle navigation ourselves
    });
    return () => sub.remove();
  }, [handleBack]);

  // Pull-to-refresh: refetch fresh/personalised videos from the backend, then
  // reshuffle the feed and scroll back to the top.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshVideos();
    } catch {
      /* keep existing videos on failure */
    }
    setShuffleSeed((seed) => seed + 1);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      try {
        reelListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch {
        /* list may be empty */
      }
    });
    setRefreshing(false);
  }, [refreshVideos]);

  // First load preserves the backend's per-user personalised ranking. After a
  // pull-to-refresh, shuffleSeed > 0 reshuffles the fetched videos so the user
  // sees a fresh arrangement on demand.
  const shuffledVideos = useMemo(
    () => (shuffleSeed > 0 ? shuffleWithSeed(videos, shuffleSeed) : videos),
    [videos, shuffleSeed],
  );

  const showToast = useCallback((message: string, coins: number) => {
    setToast({ message, coins });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const handleAdRewarded = useCallback(() => {
    useLifecoinsWalletStore.getState().addCoins('ad_reward', AD_BONUS_COINS, 'Rewarded ad bonus');
    setAdRewarded(true);
    showToast(`+${AD_BONUS_COINS} bonus Lifecoins earned!`, AD_BONUS_COINS);
  }, [showToast]);

  const handleClaim = useCallback(async (videoId: string) => {
    const result = await claimReward(videoId);
    if (result.capReached) {
      showToast(`Daily limit reached — ${dailyCap} videos max`, 0);
    } else if (result.alreadyDone) {
      showToast('Already claimed today', 0);
    } else {
      showToast(`+${result.coinsEarned} Lifecoins earned!`, result.coinsEarned);
      setViewedIds((prev) => { const s = new Set(prev); s.add(videoId); return s; });
      refreshVideos();
    }
  }, [claimReward, showToast, dailyCap, refreshVideos]);

  const allFiltered = useMemo(() =>
    shuffledVideos
      // Hide videos the user has already claimed today — they're done
      .filter((v) => !isRewarded(v.id))
      // Within the remaining unwatched videos, sort session-viewed to bottom
      .sort((a, b) => {
        const aV = viewedIds.has(a.id);
        const bV = viewedIds.has(b.id);
        if (aV !== bV) return aV ? 1 : -1;
        return 0;
      }),
  [shuffledVideos, isRewarded, viewedIds]);

  // Split into Shorts lane and main reel feed
  const shortsVideos   = useMemo(() => allFiltered.filter((v) =>  v.isShort), [allFiltered]);
  const filteredVideos = useMemo(() => allFiltered.filter((v) => !v.isShort), [allFiltered]);

  // handleWatchShort must be declared AFTER shortsVideos (const TDZ rule)
  const handleWatchShort = useCallback((video: ExploreVideo) => {
    const idx = shortsVideos.findIndex((v) => v.id === video.id);
    setActiveShortIndex(idx >= 0 ? idx : 0);
  }, [shortsVideos]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: CARD_HEIGHT,
      offset: CARD_HEIGHT * index,
      index,
    }),
    [CARD_HEIGHT],
  );

  const renderReelCard = useCallback(
    ({ item: video, index }: { item: ExploreVideo; index: number }) => (
      <ReelCard
        video={video}
        isActive={screenFocused && index === activeIndex}
        rewarded={isRewarded(video.id)}
        cardHeight={CARD_HEIGHT}
        onClaim={handleClaim}
        onWatchEvent={reportWatch}
      />
    ),
    [isRewarded, handleClaim, CARD_HEIGHT, activeIndex, reportWatch, screenFocused],
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
      {/* Reel feed — pagingEnabled gives true one-card-per-swipe TikTok behaviour.
          No ListHeaderComponent: variable-height headers break pagingEnabled snap
          boundaries. The Shorts lane lives in the floating overlay instead. */}
      <FlatList
        ref={reelListRef}
        data={filteredVideos}
        keyExtractor={(v) => v.id}
        renderItem={renderReelCard}
        pagingEnabled
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={getItemLayout}
        // removeClippedSubviews defaults to true on Android and causes items to
        // not render when data arrives after mount (first-open shows only one
        // card until the screen is reopened). Disable it — only the active card
        // mounts a WebView anyway, so memory cost is minimal.
        removeClippedSubviews={false}
        windowSize={5}
        maxToRenderPerBatch={3}
        initialNumToRender={3}
        extraData={`${filteredVideos.length}:${activeIndex}:${shuffleSeed}`}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0AADA2"
            colors={['#0AADA2']}
            progressBackgroundColor="#0f172a"
            title="Refreshing videos…"
            titleColor="rgba(255,255,255,0.6)"
          />
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
                  No videos available yet
                </Text>
                <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                  Check back after the daily refresh.
                </Text>
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
            onPress={handleBack}
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

        {/* ── Shorts lane — sits below category pills in the floating overlay ── */}
        {shortsVideos.length > 0 && (
          <View style={{ paddingTop: 6, paddingBottom: 10 }}>
            {/* Label */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, marginBottom: 10 }}>
              <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: '#ff0033', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="logo-youtube" size={11} color="#fff" />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Shorts</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>
                · quick tips · +1 LC
              </Text>
            </View>
            {/* Circular story cards */}
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
                  onWatch={() => handleWatchShort(v)}
                />
              ))}
            </ScrollView>
            {/* Divider */}
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16, marginTop: 12 }} />
          </View>
        )}

      </View>

      {/* Active video modal */}
      {/* Swipeable shorts player modal */}
      {activeShortIndex >= 0 && shortsVideos.length > 0 && (
        <ShortPlayerModal
          videos={shortsVideos}
          initialIndex={activeShortIndex}
          onClose={() => setActiveShortIndex(-1)}
          onClaim={handleClaim}
          onWatchEvent={reportWatch}
          onRefresh={refreshVideos}
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
