/**
 * VoiceCallScreen
 *
 * Google Meet "on-the-go" inspired voice-call UI.
 * Media is handled by a zero-size hidden WebView that manages an
 * RTCPeerConnection using the browser-native WebRTC API.
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
// Injected into a hidden WebView; handles RTCPeerConnection for audio.

const VOICE_WEBRTC_HTML = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;background:#000}</style>
</head><body>
<audio id="ra" autoplay></audio>
<script>
const ICE = {iceServers:[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'},
  {urls:'stun:stun2.l.google.com:19302'}
]};
let pc=null,ls=null;

function post(type,data){
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type,data}));}
  catch(e){window.parent&&window.parent.postMessage(JSON.stringify({type,data}),'*');}
}

async function startMedia(){
  ls=await navigator.mediaDevices.getUserMedia({
    audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
    video:false
  });
  post('media-ready',{});
}

function buildPC(){
  pc=new RTCPeerConnection(ICE);
  ls.getTracks().forEach(t=>pc.addTrack(t,ls));
  pc.onicecandidate=e=>{if(e.candidate)post('ice-candidate',e.candidate.toJSON());};
  pc.oniceconnectionstatechange=()=>post('ice-state',{state:pc.iceConnectionState});
  pc.onconnectionstatechange=()=>{
    post('connection-state',{state:pc.connectionState});
    if(pc.connectionState==='connected')post('connected',{});
    // 'disconnected' is a transient ICE state — do NOT treat it as terminal.
    // Only 'failed' is a permanent unrecoverable failure.
    if(pc.connectionState==='failed')post('disconnected',{});
  };
  pc.ontrack=e=>{document.getElementById('ra').srcObject=e.streams[0];post('remote-stream',{});};
}

async function handleStart(d){
  await startMedia();
  buildPC();
  if(d.isCaller){
    const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:false});
    await pc.setLocalDescription(offer);
    post('offer',{type:offer.type,sdp:offer.sdp});
  }
}

async function handleIncomingOffer(sdp){
  await startMedia();
  buildPC();
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer=await pc.createAnswer();
  await pc.setLocalDescription(answer);
  post('answer',{type:answer.type,sdp:answer.sdp});
}

async function handleAnswer(sdp){if(pc)await pc.setRemoteDescription(new RTCSessionDescription(sdp));}
async function handleIce(c){if(pc&&c){try{await pc.addIceCandidate(new RTCIceCandidate(c));}catch(e){}}}
function handleMute(m){if(ls)ls.getAudioTracks().forEach(t=>t.enabled=!m);}
function handleEnd(){
  if(ls){ls.getTracks().forEach(t=>t.stop());ls=null;}
  if(pc){pc.close();pc=null;}
}

[document,window].forEach(el=>el.addEventListener('message',async e=>{
  if(typeof e.data!=='string')return;
  try{
    const m=JSON.parse(e.data);
    if(m.type==='start')await handleStart(m.data);
    else if(m.type==='offer')await handleIncomingOffer(m.data);
    else if(m.type==='answer')await handleAnswer(m.data);
    else if(m.type==='ice-candidate')await handleIce(m.data);
    else if(m.type==='mute')handleMute(m.data.muted);
    else if(m.type==='end')handleEnd();
  }catch(err){post('error',{message:err.message});}
}));
post('webview-ready',{});
</script></body></html>`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const AVATAR_COLORS = ['#1a73e8', '#0d7377', '#8e44ad', '#c0392b', '#16a085'];

function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoiceCallScreen() {
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<WebView>(null);
  // Web-platform WebRTC refs (browser native APIs — no WebView needed on web)
  const pcWebRef   = useRef<any>(null);
  const lsWebRef   = useRef<any>(null);
  const audioElRef = useRef<any>(null);

  const activeCall       = useCallStore((s) => s.activeCall);
  const pendingSdpAnswer = useCallStore((s) => s.pendingSdpAnswer);
  const offerReady       = useCallStore((s) => s.offerReady);
  const answerReady      = useCallStore((s) => s.answerReady);
  const setCallActive    = useCallStore((s) => s.setCallActive);
  const endActiveCall    = useCallStore((s) => s.endActiveCall);
  const drainIceCandidates = useCallStore((s) => s.drainIceCandidates);
  const onIceCandidate   = useCallStore((s) => s.onIceCandidate);

  const [webviewReady, setWebviewReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulsing ring animation for "ringing" status
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (activeCall?.status === 'ringing' || activeCall?.status === 'calling') {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ringScale, { toValue: 1.6, duration: 1200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
            Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ringOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          ]),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    ringScale.setValue(1);
    ringOpacity.setValue(0);
  }, [activeCall?.status, ringScale, ringOpacity]);

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

  // Once WebView is ready, start the WebRTC peer connection.
  useEffect(() => {
    if (!webviewReady || !activeCall) return;
    const isCaller = activeCall.role === 'caller';
    sendToWebView(
      isCaller
        ? { type: 'start', data: { isCaller: true, callType: 'voice' } }
        : { type: 'offer', data: activeCall && 'sdpOffer' in (activeCall as any) ? (activeCall as any).sdpOffer : undefined },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webviewReady]);

  // Forward a pending SDP answer to the WebView once it is ready.
  // NOTE: pendingSdpAnswer is a raw SDP string, NOT JSON — wrap it in the
  // RTCSessionDescription-compatible object before passing to WebRTC.
  useEffect(() => {
    if (webviewReady && pendingSdpAnswer) {
      sendToWebView({ type: 'answer', data: { type: 'answer', sdp: pendingSdpAnswer } });
      useCallStore.setState({ pendingSdpAnswer: null });
    }
  }, [webviewReady, pendingSdpAnswer]);

  // Forward incoming ICE candidates queued in the store.
  const pendingIce = useCallStore((s) => s.pendingIceCandidates);
  useEffect(() => {
    if (!webviewReady || pendingIce.length === 0) return;
    const drained = drainIceCandidates();
    drained.forEach((c) => sendToWebView({ type: 'ice-candidate', data: c }));
  }, [webviewReady, pendingIce, drainIceCandidates]);

  // ── Web-platform WebRTC command handler ─────────────────────────────────────
  // On web the page IS already a browser, so we drive RTCPeerConnection directly
  // instead of going through a hidden WebView.
  const handleWebCommand = useCallback(async (msg: { type: string; data: any }) => {
    const W = globalThis as any;
    const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
    switch (msg.type) {
      case 'start':
      case 'offer': {
        const isCaller = msg.type === 'start' && !!msg.data?.isCaller;
        try {
          const stream = await (navigator as any).mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          lsWebRef.current = stream;
          const pc = new W.RTCPeerConnection(ICE);
          pcWebRef.current = pc;
          stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
          pc.onicecandidate = async (e: any) => {
            if (e.candidate) {
              // Read callId from the store directly to avoid a stale closure:
              // callId is null when the PC is first created (before offerReady
              // resolves) but will be set by the time ICE candidates fire.
              const callId = useCallStore.getState().activeCall?.callId;
              if (callId) {
                const { CallService } = await import('../services/call-service');
                CallService.sendIceCandidate(callId, e.candidate.toJSON()).catch(() => {});
              }
            }
          };
          pc.ontrack = (e: any) => {
            if (!audioElRef.current) {
              audioElRef.current = new W.Audio();
              audioElRef.current.autoplay = true;
            }
            audioElRef.current.srcObject = e.streams[0];
            audioElRef.current.play().catch(() => {});
          };
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') setCallActive();
            // 'disconnected' is a transient ICE state — only 'failed' is terminal.
            if (pc.connectionState === 'failed') endActiveCall();
          };
          if (isCaller) {
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await pc.setLocalDescription(offer);
            await offerReady(offer.sdp ?? '');
          } else if (msg.data) {
            await pc.setRemoteDescription(new W.RTCSessionDescription(msg.data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await answerReady(answer.sdp ?? '');
          }
        } catch (err: any) {
          console.error('[voice/web] start error:', err.message);
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
      case 'mute': {
        lsWebRef.current?.getAudioTracks().forEach((t: any) => { t.enabled = !msg.data.muted; });
        break;
      }
      case 'end': {
        lsWebRef.current?.getTracks().forEach((t: any) => t.stop());
        pcWebRef.current?.close();
        lsWebRef.current = null;
        pcWebRef.current = null;
        if (audioElRef.current) { audioElRef.current.srcObject = null; audioElRef.current = null; }
        break;
      }
      default: break;
    }
  }, [activeCall, offerReady, answerReady, setCallActive, endActiveCall]);

  // On web there is no WebView to fire 'webview-ready', so set it immediately.
  // Also clean up native WebRTC resources on unmount.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setWebviewReady(true);
    return () => {
      lsWebRef.current?.getTracks().forEach((t: any) => t.stop());
      pcWebRef.current?.close();
      if (audioElRef.current) { audioElRef.current.srcObject = null; }
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
            // Caller's WebView generated an SDP offer — send it to the server.
            await offerReady(msg.data.sdp);
            break;
          case 'answer':
            // Callee's WebView generated an SDP answer — send it to the server.
            await answerReady(msg.data.sdp);
            break;
          case 'ice-candidate':
            // Forward our ICE candidate to the peer via the store action
            // (which calls CallService.sendIceCandidate).
            if (activeCall?.callId) {
              const { CallService } = await import('../services/call-service');
              CallService.sendIceCandidate(activeCall.callId, msg.data).catch(() => {});
            }
            break;
          case 'connected':
            setCallActive();
            break;
          case 'disconnected':
            // Remote media dropped — show as ended.
            endActiveCall();
            break;
          default:
            break;
        }
      } catch {}
    },
    [activeCall, offerReady, answerReady, setCallActive, endActiveCall],
  );

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    sendToWebView({ type: 'mute', data: { muted: next } });
  }, [muted, sendToWebView]);

  const handleEndCall = useCallback(async () => {
    sendToWebView({ type: 'end', data: {} });
    await endActiveCall();
  }, [endActiveCall, sendToWebView]);

  const statusLabel = useMemo(() => {
    switch (activeCall?.status) {
      case 'calling':   return 'Calling…';
      case 'ringing':   return 'Ringing…';
      case 'connecting': return 'Connecting…';
      case 'active':    return formatDuration(duration);
      case 'ended':     return 'Call ended';
      case 'rejected':  return 'Call declined';
      case 'missed':    return 'No answer';
      default:          return '';
    }
  }, [activeCall?.status, duration]);

  if (!activeCall) return null;

  const peerName      = activeCall.peerName;
  const peerAvatarUrl = activeCall.peerAvatarUrl;
  const initials      = getInitials(peerName);
  const bgColor       = avatarColor(peerName);
  const isRinging     = activeCall.status === 'calling' || activeCall.status === 'ringing';

  // Play ringtone while the call is ringing / waiting to be answered
  useRingtone(isRinging);

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>

        {/* Hidden audio WebView — native only; web uses browser APIs directly */}
        {Platform.OS !== 'web' && (
          <WebView
            ref={webviewRef}
            source={{ html: VOICE_WEBRTC_HTML }}
            style={styles.hiddenWebView}
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
            onMessage={handleWebViewMessage}
            onError={() => {}}
          />
        )}

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>LifeGate · Voice Call</Text>
        </View>

        {/* Center content */}
        <View style={styles.center}>
          {/* Pulsing ring when ringing */}
          {isRinging && (
            <Animated.View
              style={[
                styles.ring,
                { backgroundColor: bgColor, transform: [{ scale: ringScale }], opacity: ringOpacity },
              ]}
            />
          )}

          {/* Avatar — shows profile photo when available, else coloured initials */}
          {peerAvatarUrl ? (
            <Image
              source={{ uri: peerAvatarUrl }}
              style={styles.avatarPhoto}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: bgColor }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}

          <Text style={styles.peerName}>{peerName}</Text>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>

        {/* Control bar */}
        <View style={styles.controls}>
          {/* Speaker toggle */}
          <Pressable
            onPress={() => setSpeakerOn((v) => !v)}
            style={[styles.ctrlBtn, speakerOn && styles.ctrlBtnActive]}
            accessibilityLabel={speakerOn ? 'Speaker on' : 'Speaker off'}
          >
            <Ionicons
              name={speakerOn ? 'volume-high' : 'volume-mute'}
              size={22}
              color={speakerOn ? '#fff' : '#9aa0a6'}
            />
          </Pressable>

          {/* End call */}
          <Pressable
            onPress={handleEndCall}
            style={styles.endBtn}
            accessibilityLabel="End call"
          >
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>

          {/* Mute */}
          <Pressable
            onPress={handleToggleMute}
            style={[styles.ctrlBtn, muted && styles.ctrlBtnActive]}
            accessibilityLabel={muted ? 'Unmute' : 'Mute'}
          >
            <Ionicons
              name={muted ? 'mic-off' : 'mic'}
              size={22}
              color={muted ? '#f28b82' : '#9aa0a6'}
            />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#202124',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hiddenWebView: {
    width: 0,
    height: 0,
    position: 'absolute',
  },
  header: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: 'center',
  },
  headerLabel: {
    color: '#9aa0a6',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 152,
    height: 152,
    borderRadius: 76,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  avatarPhoto: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  avatarText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  peerName: {
    marginTop: 20,
    color: '#e8eaed',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  statusText: {
    marginTop: 8,
    color: '#9aa0a6',
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingBottom: Platform.OS === 'android' ? 40 : 28,
    paddingHorizontal: 24,
    width: '100%',
  },
  ctrlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3c4043',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlBtnActive: {
    backgroundColor: '#5f6368',
  },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ea4335',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#ea4335',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
});
