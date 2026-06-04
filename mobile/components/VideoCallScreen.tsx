/**
 * VideoCallScreen
 *
 * WhatsApp video call inspired UI.
 * A full-screen WebView handles both remote video (full-screen) and local
 * camera (picture-in-picture). A React Native overlay provides the control
 * bar and status header.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { useCallStore } from '../stores/call-store';
import { useRingtone } from '../hooks/useRingtone';

// ─── WebRTC HTML ──────────────────────────────────────────────────────────────

function buildVideoWebRTCHTML(iceServers: RTCIceServer[]): string {
  const iceJSON = JSON.stringify({ iceServers });
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;width:100vw;height:100vh;overflow:hidden}
#rv{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:none}
#lv{position:absolute;bottom:100px;right:12px;width:90px;height:130px;border-radius:12px;
    object-fit:cover;display:none;border:2px solid rgba(255,255,255,0.4);background:#111}
</style>
</head><body>
<video id="rv" autoplay playsinline></video>
<video id="lv" autoplay muted playsinline></video>
<script>
const ICE=${iceJSON};
let pc=null,ls=null,facingMode='user';

function post(type,data){
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type,data}));}
  catch(e){window.parent&&window.parent.postMessage(JSON.stringify({type,data}),'*');}
}

async function startMedia(vid){
  ls=await navigator.mediaDevices.getUserMedia({
    audio:{echoCancellation:true,noiseSuppression:true},
    video:vid?{facingMode,width:{ideal:640},height:{ideal:480}}:false
  });
  if(vid){const lv=document.getElementById('lv');lv.srcObject=ls;lv.style.display='block';}
  post('media-ready',{hasVideo:vid});
}

function buildPC(){
  pc=new RTCPeerConnection(ICE);
  ls.getTracks().forEach(t=>pc.addTrack(t,ls));
  pc.onicecandidate=e=>{if(e.candidate)post('ice-candidate',e.candidate.toJSON());};
  pc.onconnectionstatechange=()=>{
    post('connection-state',{state:pc.connectionState});
    if(pc.connectionState==='connected')post('connected',{});
    // 'disconnected' is a transient ICE state — do NOT treat it as terminal.
    // Only 'failed' is a permanent unrecoverable failure.
    if(pc.connectionState==='failed')post('disconnected',{});
  };
  pc.ontrack=e=>{
    // Play remote audio regardless of track kind.
    // Only update the video element and notify the app when a video track arrives,
    // so the physician avatar overlay stays visible for audio-only peers (e.g. AI physician).
    if(e.track.kind==='audio'){
      const au=document.createElement('audio');
      au.autoplay=true;
      au.srcObject=e.streams[0];
      document.body.appendChild(au);
      return;
    }
    const rv=document.getElementById('rv');
    rv.srcObject=e.streams[0];
    rv.style.display='block';
    post('remote-stream',{});
  };
}

async function handleStart(d){
  await startMedia(true);
  buildPC();
  if(d.isCaller){
    const o=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true});
    await pc.setLocalDescription(o);
    post('offer',{type:o.type,sdp:o.sdp});
  }
}

async function handleIncomingOffer(sdp){
  await startMedia(true);
  buildPC();
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const a=await pc.createAnswer();
  await pc.setLocalDescription(a);
  post('answer',{type:a.type,sdp:a.sdp});
}

async function handleAnswer(sdp){if(pc)await pc.setRemoteDescription(new RTCSessionDescription(sdp));}
async function handleIce(c){if(pc&&c)try{await pc.addIceCandidate(new RTCIceCandidate(c));}catch(e){}}
function handleMuteAudio(m){if(ls)ls.getAudioTracks().forEach(t=>t.enabled=!m);}
function handleMuteVideo(m){if(ls)ls.getVideoTracks().forEach(t=>t.enabled=!m);}
function handleEnd(){
  if(ls){ls.getTracks().forEach(t=>t.stop());ls=null;}
  if(pc){pc.close();pc=null;}
}

async function handleFlip(){
  if(!ls||!pc)return;
  const oldTrack=ls.getVideoTracks()[0];
  facingMode=facingMode==='user'?'environment':'user';
  try{
    const ns=await navigator.mediaDevices.getUserMedia({video:{facingMode},audio:false});
    const newTrack=ns.getVideoTracks()[0];
    const sender=pc.getSenders().find(s=>s.track&&s.track.kind==='video');
    if(sender)await sender.replaceTrack(newTrack);
    if(oldTrack){oldTrack.stop();ls.removeTrack(oldTrack);}
    ls.addTrack(newTrack);
    document.getElementById('lv').srcObject=ls;
  }catch(e){post('error',{message:e.message});}
}

[document,window].forEach(el=>el.addEventListener('message',async e=>{
  if(typeof e.data!=='string')return;
  try{
    const m=JSON.parse(e.data);
    if(m.type==='start')await handleStart(m.data);
    else if(m.type==='offer')await handleIncomingOffer(m.data);
    else if(m.type==='answer')await handleAnswer(m.data);
    else if(m.type==='ice-candidate')await handleIce(m.data);
    else if(m.type==='mute-audio')handleMuteAudio(m.data.muted);
    else if(m.type==='mute-video')handleMuteVideo(m.data.muted);
    else if(m.type==='flip')handleFlip();
    else if(m.type==='end')handleEnd();
  }catch(err){post('error',{message:err.message});}
}));
post('webview-ready',{});
</script></body></html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const AVATAR_COLORS = ['#128c7e', '#1a73e8', '#8e44ad', '#c0392b', '#e67e22'];

function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VideoCallScreen() {
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<WebView>(null);
  // Web-platform WebRTC refs (browser native APIs — no WebView needed on web)
  const pcWebRef          = useRef<any>(null);
  const lsWebRef          = useRef<any>(null);
  const videoContainerRef = useRef<any>(null); // <View> that hosts DOM <video> elements on web

  const activeCall         = useCallStore((s) => s.activeCall);
  const pendingSdpAnswer   = useCallStore((s) => s.pendingSdpAnswer);
  const offerReady         = useCallStore((s) => s.offerReady);
  const answerReady        = useCallStore((s) => s.answerReady);
  const setCallActive      = useCallStore((s) => s.setCallActive);
  const endActiveCall      = useCallStore((s) => s.endActiveCall);
  const drainIceCandidates = useCallStore((s) => s.drainIceCandidates);

  // ICE server config — fetched from backend on mount (includes TURN when configured).
  // Falls back to public Google STUN when the endpoint is unavailable.
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]);

  const [webviewReady, setWebviewReady] = useState(false);
  const [remoteStreamActive, setRemoteStreamActive] = useState(false);
  const [mutedAudio, setMutedAudio] = useState(false);
  const [mutedVideo, setMutedVideo] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch TURN servers from backend on mount.
  useEffect(() => {
    import('../services/call-service').then(({ CallService }) => {
      CallService.getIceServers().then((servers) => {
        if (servers.length > 0) setIceServers(servers);
      }).catch(() => {});
    });
  }, []);

  // Fade-in animation for the waiting avatar (shown before remote stream)
  const avatarOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (remoteStreamActive) {
      Animated.timing(avatarOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    } else {
      avatarOpacity.setValue(1);
    }
  }, [remoteStreamActive, avatarOpacity]);

  // Duration timer
  useEffect(() => {
    if (activeCall?.status === 'active') {
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setDuration(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeCall?.status]);

  // Start WebRTC once WebView is ready
  useEffect(() => {
    if (!webviewReady || !activeCall) return;
    const isCaller = activeCall.role === 'caller';
    sendToWebView(
      isCaller
        ? { type: 'start', data: { isCaller: true, callType: 'video' } }
        : { type: 'offer', data: activeCall.calleeSdpOffer
              ? { type: 'offer', sdp: activeCall.calleeSdpOffer }
              : undefined },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webviewReady]);

  // Forward pending SDP answer
  useEffect(() => {
    if (webviewReady && pendingSdpAnswer) {
      sendToWebView({ type: 'answer', data: { type: 'answer', sdp: pendingSdpAnswer } });
      useCallStore.setState({ pendingSdpAnswer: null });
    }
  }, [webviewReady, pendingSdpAnswer]);

  // Forward queued ICE candidates
  const pendingIce = useCallStore((s) => s.pendingIceCandidates);
  useEffect(() => {
    if (!webviewReady || pendingIce.length === 0) return;
    const drained = drainIceCandidates();
    drained.forEach((c) => sendToWebView({ type: 'ice-candidate', data: c }));
  }, [webviewReady, pendingIce, drainIceCandidates]);

  // ── Web-platform WebRTC command handler ───────────────────────────────────
  const handleWebCommand = useCallback(async (msg: { type: string; data: any }) => {
    const W = globalThis as any;
    const ICE = { iceServers };
    switch (msg.type) {
      case 'start':
      case 'offer': {
        const isCaller = msg.type === 'start' && !!msg.data?.isCaller;
        try {
          const stream = await (navigator as any).mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          });
          lsWebRef.current = stream;
          // Attach local video (PiP) to the video container div
          const container = videoContainerRef.current as unknown as HTMLElement;
          if (container) {
            const lv = W.document.createElement('video');
            lv.id = 'lifegate-local-video';
            lv.autoplay = true; lv.playsInline = true; lv.muted = true;
            lv.style.cssText = 'position:absolute;bottom:100px;right:12px;width:90px;height:130px;border-radius:12px;object-fit:cover;z-index:10;border:2px solid rgba(255,255,255,0.4);background:#111;';
            lv.srcObject = stream;
            container.appendChild(lv);
          }
          const pc = new W.RTCPeerConnection(ICE);
          pcWebRef.current = pc;
          stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
          pc.onicecandidate = async (e: any) => {
            if (e.candidate) {
              const callId = useCallStore.getState().activeCall?.callId;
              if (callId) {
                const { CallService } = await import('../services/call-service');
                CallService.sendIceCandidate(callId, e.candidate.toJSON()).catch(() => {});
              }
            }
          };
          pc.ontrack = (e: any) => {
            // Audio-only remote (e.g. AI physician): play the audio but keep
            // the physician avatar overlay visible (don't set remoteStreamActive).
            if (e.track.kind === 'audio') {
              const au = new W.Audio();
              au.autoplay = true;
              au.srcObject = e.streams[0];
              au.play().catch(() => {});
              return;
            }
            // Video track — show remote video and hide the waiting overlay.
            const c = videoContainerRef.current as unknown as HTMLElement;
            if (c && !W.document.getElementById('lifegate-remote-video')) {
              const rv = W.document.createElement('video');
              rv.id = 'lifegate-remote-video';
              rv.autoplay = true; rv.playsInline = true;
              rv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;';
              rv.srcObject = e.streams[0];
              c.insertBefore(rv, c.firstChild);
            }
            setRemoteStreamActive(true);
          };
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') setCallActive();
            // 'disconnected' is a transient ICE state — only 'failed' is terminal.
            if (pc.connectionState === 'failed') endActiveCall();
          };
          if (isCaller) {
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await pc.setLocalDescription(offer);
            await offerReady(offer.sdp ?? '');
          } else if (msg.data) {
            await pc.setRemoteDescription(new W.RTCSessionDescription(msg.data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await answerReady(answer.sdp ?? '');
          }
        } catch (err: any) {
          console.error('[video/web] start error:', err.message);
        }
        break;
      }
      case 'answer': {
        if (pcWebRef.current && msg.data) {
          try { await pcWebRef.current.setRemoteDescription(new W.RTCSessionDescription(msg.data)); } catch {}
        }
        break;
      }
      case 'ice-candidate': {
        if (pcWebRef.current && msg.data) {
          try { await pcWebRef.current.addIceCandidate(new W.RTCIceCandidate(msg.data)); } catch {}
        }
        break;
      }
      case 'mute-audio': {
        lsWebRef.current?.getAudioTracks().forEach((t: any) => { t.enabled = !msg.data.muted; });
        break;
      }
      case 'mute-video': {
        lsWebRef.current?.getVideoTracks().forEach((t: any) => { t.enabled = !msg.data.muted; });
        break;
      }
      case 'flip': {
        if (!lsWebRef.current || !pcWebRef.current) break;
        try {
          const oldTrack = lsWebRef.current.getVideoTracks()[0];
          const cur = oldTrack?.getSettings?.()?.facingMode;
          const next = cur === 'environment' ? 'user' : 'environment';
          const ns = await (navigator as any).mediaDevices.getUserMedia({ video: { facingMode: next }, audio: false });
          const newTrack = ns.getVideoTracks()[0];
          const sender = (pcWebRef.current.getSenders?.() ?? []).find((s: any) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(newTrack);
          oldTrack?.stop();
          const lv = W.document?.getElementById('lifegate-local-video');
          if (lv) { const ns2 = new W.MediaStream([newTrack, ...lsWebRef.current.getAudioTracks()]); lv.srcObject = ns2; lsWebRef.current = ns2; }
        } catch (err: any) { console.error('[video/web] flip error:', err.message); }
        break;
      }
      case 'end': {
        lsWebRef.current?.getTracks().forEach((t: any) => t.stop());
        pcWebRef.current?.close();
        lsWebRef.current = null; pcWebRef.current = null;
        ['lifegate-remote-video', 'lifegate-local-video'].forEach(id => {
          const el = W.document?.getElementById(id);
          if (el) { el.srcObject = null; el.parentNode?.removeChild(el); }
        });
        break;
      }
      default: break;
    }
  }, [activeCall, offerReady, answerReady, setCallActive, endActiveCall, setRemoteStreamActive, iceServers]);

  // On web there is no WebView to fire 'webview-ready', so set it immediately.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setWebviewReady(true);
    return () => {
      lsWebRef.current?.getTracks().forEach((t: any) => t.stop());
      pcWebRef.current?.close();
      const W = globalThis as any;
      ['lifegate-remote-video', 'lifegate-local-video'].forEach(id => {
        const el = W.document?.getElementById(id);
        if (el) { el.srcObject = null; el.parentNode?.removeChild(el); }
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendToWebView = useCallback((msg: object) => {
    if (Platform.OS === 'web') {
      handleWebCommand(msg as { type: string; data: any });
      return;
    }
    webviewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(JSON.stringify(msg))}}));true;`,
    );
  }, [handleWebCommand]);

  const handleWebViewMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as { type: string; data: any };
        switch (msg.type) {
          case 'webview-ready':
            setWebviewReady(true);
            break;
          case 'offer':
            await offerReady(msg.data.sdp);
            break;
          case 'answer':
            await answerReady(msg.data.sdp);
            break;
          case 'ice-candidate':
            if (activeCall?.callId) {
              const { CallService } = await import('../services/call-service');
              CallService.sendIceCandidate(activeCall.callId, msg.data).catch(() => {});
            }
            break;
          case 'remote-stream':
            setRemoteStreamActive(true);
            break;
          case 'connected':
            setCallActive();
            break;
          case 'disconnected':
            endActiveCall();
            break;
          default:
            break;
        }
      } catch {}
    },
    [activeCall, offerReady, answerReady, setCallActive, endActiveCall],
  );

  const handleToggleMuteAudio = useCallback(() => {
    const next = !mutedAudio;
    setMutedAudio(next);
    sendToWebView({ type: 'mute-audio', data: { muted: next } });
  }, [mutedAudio, sendToWebView]);

  const handleToggleMuteVideo = useCallback(() => {
    const next = !mutedVideo;
    setMutedVideo(next);
    sendToWebView({ type: 'mute-video', data: { muted: next } });
  }, [mutedVideo, sendToWebView]);

  const handleFlipCamera = useCallback(() => {
    sendToWebView({ type: 'flip', data: {} });
  }, [sendToWebView]);

  const handleEndCall = useCallback(async () => {
    sendToWebView({ type: 'end', data: {} });
    await endActiveCall();
  }, [endActiveCall, sendToWebView]);

  const statusLabel = useMemo(() => {
    switch (activeCall?.status) {
      case 'calling':    return 'Calling…';
      case 'ringing':    return 'Ringing…';
      case 'connecting': return 'Connecting…';
      case 'active':     return formatDuration(duration);
      case 'ended':      return 'Call ended';
      case 'rejected':   return 'Call declined';
      default:           return '';
    }
  }, [activeCall?.status, duration]);

  if (!activeCall) return null;

  const peerName      = activeCall.peerName;
  const peerAvatarUrl = activeCall.peerAvatarUrl;
  const initials      = getInitials(peerName);
  const bgColor       = avatarColor(peerName);
  const isWaiting     = !remoteStreamActive;
  const isRinging     = activeCall.status === 'calling' || activeCall.status === 'ringing';

  // Play ringtone while the call is ringing / waiting to be answered
  useRingtone(isRinging);

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={styles.container}>
        {/* Full-screen Video WebView — native only; web uses browser APIs + DOM video elements */}
        {Platform.OS === 'web' ? (
          <View ref={videoContainerRef} style={StyleSheet.absoluteFill} />
        ) : (
          <WebView
            ref={webviewRef}
            source={{ html: buildVideoWebRTCHTML(iceServers) }}
            style={StyleSheet.absoluteFill}
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
            onMessage={handleWebViewMessage}
            onError={() => {}}
            allowsFullscreenVideo={false}
            scrollEnabled={false}
          />
        )}

        {/* Waiting overlay — shown before remote stream arrives */}
        {isWaiting && (
          <Animated.View style={[styles.waitingOverlay, { opacity: avatarOpacity }]}>
            {peerAvatarUrl ? (
              <Image
                source={{ uri: peerAvatarUrl }}
                style={styles.waitingAvatarPhoto}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.waitingAvatar, { backgroundColor: bgColor }]}>
                <Text style={styles.waitingAvatarText}>{initials}</Text>
              </View>
            )}
            <Text style={styles.waitingName}>{peerName}</Text>
            <Text style={styles.waitingStatus}>{statusLabel}</Text>
          </Animated.View>
        )}

        {/* Top status bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.topName} numberOfLines={1}>{peerName}</Text>
          {activeCall.status === 'active' && (
            <Text style={styles.topStatus}>{statusLabel}</Text>
          )}
        </View>

        {/* Bottom control bar */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
          {/* Flip camera */}
          <Pressable onPress={handleFlipCamera} style={styles.ctrlBtn} accessibilityLabel="Flip camera">
            <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
          </Pressable>

          {/* Mute microphone */}
          <Pressable onPress={handleToggleMuteAudio} style={[styles.ctrlBtn, mutedAudio && styles.ctrlBtnRed]} accessibilityLabel={mutedAudio ? 'Unmute' : 'Mute'}>
            <Ionicons name={mutedAudio ? 'mic-off' : 'mic'} size={22} color="#fff" />
          </Pressable>

          {/* End call */}
          <Pressable onPress={handleEndCall} style={styles.endBtn} accessibilityLabel="End call">
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>

          {/* Camera on/off */}
          <Pressable onPress={handleToggleMuteVideo} style={[styles.ctrlBtn, mutedVideo && styles.ctrlBtnRed]} accessibilityLabel={mutedVideo ? 'Turn camera on' : 'Turn camera off'}>
            <Ionicons name={mutedVideo ? 'videocam-off' : 'videocam'} size={22} color="#fff" />
          </Pressable>

          {/* Spacer to balance the layout */}
          <View style={styles.ctrlBtn} />
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const DARK = 'rgba(0,0,0,0.5)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  waitingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingAvatarPhoto: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  waitingAvatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  waitingName: {
    marginTop: 16,
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  waitingStatus: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '400',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  topName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  topStatus: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Platform.OS === 'android' ? 16 : 20,
    paddingTop: 20,
    paddingHorizontal: 24,
    backgroundColor: DARK,
  },
  ctrlBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlBtnRed: {
    backgroundColor: 'rgba(234,67,53,0.85)',
  },
  endBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ea4335',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#ea4335',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
});
