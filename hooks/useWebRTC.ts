'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { DataConnection, MediaConnection } from 'peerjs';

export interface PeerInfo {
  peerId: string;
  userName: string;
}

export interface UseWebRTCOptions {
  roomId: string;
  userName: string;
  signalingUrl?: string;
  currentCode?: string;
  onCodeSync?: (code: string, sender: string) => void;
  onCursorSync?: (cursor: { line: number; column: number; selection?: string }, sender: string) => void;
  onLanguageChange?: (lang: string, sender: string) => void;
  onChatMessage?: (msg: { text: string; sender: string; time: string; isLocal?: boolean }) => void;
  onPeerLeft?: (peerId: string) => void;
}

// Low-latency Opus SDP tuning: 10ms frame size, FEC error correction, voice DTX
function tuneOpusSDP(sdp: string): string {
  return sdp.replace(
    /a=fmtp:(\d+)(.*)/g,
    (match, pt, params) => {
      if (sdp.includes(`a=rtpmap:${pt} opus/48000`)) {
        return `a=fmtp:${pt} minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=48000;stereo=0;sprop-stereo=0${params}`;
      }
      return match;
    }
  );
}

export function useWebRTC({
  roomId,
  userName,
  currentCode,
  onCodeSync,
  onCursorSync,
  onLanguageChange,
  onChatMessage,
  onPeerLeft
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'p2p-active'>('connecting');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Default speaker muted on same device to prevent acoustic feedback loop
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(true);
  const [remoteVolume, setRemoteVolume] = useState<number>(0.8);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [voiceActivity, setVoiceActivity] = useState<number>(0);

  const peerInstanceRef = useRef<any>(null);
  const activeConnRef = useRef<DataConnection | null>(null);
  const activeCallRef = useRef<MediaConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rawAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Keep callback refs fresh
  const onCodeSyncRef = useRef(onCodeSync);
  onCodeSyncRef.current = onCodeSync;
  const onCursorSyncRef = useRef(onCursorSync);
  onCursorSyncRef.current = onCursorSync;
  const onLanguageChangeRef = useRef(onLanguageChange);
  onLanguageChangeRef.current = onLanguageChange;
  const onChatMessageRef = useRef(onChatMessage);
  onChatMessageRef.current = onChatMessage;
  const onPeerLeftRef = useRef(onPeerLeft);
  onPeerLeftRef.current = onPeerLeft;
  const userNameRef = useRef(userName);
  userNameRef.current = userName;
  const currentCodeRef = useRef(currentCode);
  currentCodeRef.current = currentCode;

  // Studio Audio DSP: 90Hz Highpass + 3800Hz Lowpass (cuts metallic screech/hiss) + Compressor
  const setupAudioDSP = useCallback((rawTrack: MediaStreamTrack): MediaStreamTrack => {
    try {
      if (typeof window === 'undefined') return rawTrack;
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return rawTrack;

      const audioCtx = new AudioCtxClass({ sampleRate: 48000, latencyHint: 'interactive' });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(new MediaStream([rawTrack]));

      // 1. High-pass filter (90Hz): removes fan rumbling and desk knocks
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(90, audioCtx.currentTime);

      // 2. Low-pass filter (3800Hz): strictly cuts high-frequency coil whine, hiss, and acoustic feedback screech
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(3800, audioCtx.currentTime);
      lowpass.Q.setValueAtTime(0.707, audioCtx.currentTime); // Flat Butterworth passband

      // 3. Dynamics Compressor (normalizes speech, soft noise gate)
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-26, audioCtx.currentTime);
      compressor.knee.setValueAtTime(6, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(4, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.12, audioCtx.currentTime);

      // 4. Analyser for speech VU meter
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      // Connect: source -> highpass -> lowpass -> compressor -> analyser -> destination
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(analyser);

      const destination = audioCtx.createMediaStreamDestination();
      compressor.connect(destination);

      return destination.stream.getAudioTracks()[0];
    } catch (e) {
      console.warn('Web Audio DSP error, using raw audio:', e);
      return rawTrack;
    }
  }, []);

  // Voice activity polling for real-time speech meter
  useEffect(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const interval = setInterval(() => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i];
      }
      const avg = sum / data.length;
      setVoiceActivity(Math.min(100, Math.round((avg / 128) * 100)));
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Initialize Local Media Stream
  const initLocalMedia = useCallback(async (): Promise<MediaStream> => {
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: 48000,
          channelCount: 1
        }
      });

      const videoTrack = rawStream.getVideoTracks()[0];
      const rawAudioTrack = rawStream.getAudioTracks()[0];
      rawAudioTrackRef.current = rawAudioTrack || null;
      originalVideoTrackRef.current = videoTrack || null;

      // Apply studio-grade DSP noise suppression
      const cleanAudioTrack = rawAudioTrack ? setupAudioDSP(rawAudioTrack) : null;

      const finalTracks: MediaStreamTrack[] = [];
      if (videoTrack) finalTracks.push(videoTrack);
      if (cleanAudioTrack) finalTracks.push(cleanAudioTrack);

      const stream = new MediaStream(finalTracks);
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.warn('Camera/mic unavailable or locked. Creating fallback 30fps monogram stream:', err);

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      let frame = 0;
      let animId: number;
      const render = () => {
        if (!ctx) return;
        frame++;

        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, 640, 480);

        ctx.strokeStyle = '#18181b';
        ctx.lineWidth = 1;
        for (let x = 0; x < 640; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 480);
          ctx.stroke();
        }
        for (let y = 0; y < 480; y += 40) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(640, y);
          ctx.stroke();
        }

        ctx.fillStyle = '#121215';
        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(220, 140, 200, 200, 16);
        ctx.fill();
        ctx.stroke();

        const pulse = Math.sin(frame * 0.05) * 3;
        ctx.fillStyle = '#27272a';
        ctx.beginPath();
        ctx.arc(320, 215, 38 + pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f4f4f5';
        ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initials = (userNameRef.current || 'Dev').slice(0, 2).toUpperCase();
        ctx.fillText(initials, 320, 215);

        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#e4e4e7';
        ctx.fillText(userNameRef.current || 'Engineer', 320, 280);

        ctx.font = '500 11px ui-monospace, monospace';
        ctx.fillStyle = '#10b981';
        ctx.fillText('● WebRTC Peer Node', 320, 302);

        animId = requestAnimationFrame(render);
      };
      render();

      const stream = canvas.captureStream(30);

      // Silent buffer audio track to prevent audio negotiation errors
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          const audioCtx = new AudioCtxClass();
          const silentBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
          const src = audioCtx.createBufferSource();
          src.buffer = silentBuffer;
          src.loop = true;
          const gain = audioCtx.createGain();
          gain.gain.value = 0.0;
          src.connect(gain);
          const dst = audioCtx.createMediaStreamDestination();
          gain.connect(dst);
          src.start();
          const silentAudio = dst.stream.getAudioTracks()[0];
          silentAudio.enabled = false;
          stream.addTrack(silentAudio);
        }
      } catch (e) {
        console.warn('Silent audio track setup skipped:', e);
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      originalVideoTrackRef.current = stream.getVideoTracks()[0] || null;
      return stream;
    }
  }, [setupAudioDSP]);

  // Wire incoming/outgoing DataConnection
  const wireDataConnection = useCallback((conn: DataConnection, isHost: boolean) => {
    activeConnRef.current = conn;

    conn.on('open', () => {
      console.log('⚡ WebRTC RTCDataChannel OPEN with peer:', conn.peer);
      setConnectionState('p2p-active');
      setPeers([{ peerId: conn.peer, userName: 'Partner' }]);

      // Handshake identity
      conn.send({
        type: 'user-info',
        userName: userNameRef.current,
        timestamp: Date.now()
      });

      // If host, send initial code state to guest
      if (isHost && currentCodeRef.current) {
        conn.send({
          type: 'code-sync',
          payload: currentCodeRef.current,
          sender: userNameRef.current
        });
      }
    });

    conn.on('data', (raw: any) => {
      try {
        const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!msg || !msg.type) return;

        switch (msg.type) {
          case 'user-info':
            setPeers([{ peerId: conn.peer, userName: msg.userName || 'Partner' }]);
            break;

          case 'code-sync':
            onCodeSyncRef.current?.(msg.payload, msg.sender || 'Partner');
            break;

          case 'cursor-sync':
            onCursorSyncRef.current?.(msg.payload, msg.sender || 'Partner');
            break;

          case 'language-change':
            onLanguageChangeRef.current?.(msg.payload, msg.sender || 'Partner');
            break;

          case 'chat-message':
            onChatMessageRef.current?.({ ...msg.payload, isLocal: false });
            break;

          case 'ping':
            conn.send({ type: 'pong', timestamp: msg.timestamp });
            break;

          case 'pong':
            if (msg.timestamp) {
              const rtt = Math.max(1, Date.now() - msg.timestamp);
              setLatencyMs(rtt);
            }
            break;
        }
      } catch (e) {
        console.error('Error handling data channel message:', e);
      }
    });

    conn.on('close', () => {
      console.log('WebRTC DataChannel closed for peer:', conn.peer);
      activeConnRef.current = null;
      setPeers([]);
      setRemoteStream(null);
      setConnectionState('connected');
      onPeerLeftRef.current?.(conn.peer);
    });

    conn.on('error', (err) => {
      console.warn('Data connection error:', err);
    });
  }, []);

  // Wire incoming/outgoing MediaConnection (Audio & Video)
  const wireMediaCall = useCallback((call: MediaConnection) => {
    activeCallRef.current = call;

    call.on('stream', (incomingStream: MediaStream) => {
      console.log('🎥 Incoming remote media stream tracks:', incomingStream.getTracks().map(t => `${t.kind}:${t.id}`));
      setRemoteStream(incomingStream);
      setConnectionState('p2p-active');
    });

    call.on('close', () => {
      console.log('Remote media call closed');
      activeCallRef.current = null;
      setRemoteStream(null);
    });

    call.on('error', (err) => {
      console.warn('Media call error:', err);
    });
  }, []);

  // Main Self-Electing P2P Mesh Lifecycle via PeerJS Cloud
  useEffect(() => {
    if (typeof window === 'undefined' || !roomId) return;

    let isDestroyed = false;
    let peer: any = null;
    let pingTimer: any = null;

    const cleanRoom = roomId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hostId = `paircraft_${cleanRoom}_host`;
    const guestRand = Math.random().toString(36).substring(2, 7);
    const guestId = `paircraft_${cleanRoom}_guest_${guestRand}`;

    setConnectionState('connecting');

    const peerOptions = {
      host: '0.peerjs.com',
      port: 443,
      path: '/',
      secure: true,
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      }
    };

    async function startP2PMesh() {
      try {
        const stream = await initLocalMedia();
        if (isDestroyed) return;

        const { default: Peer } = await import('peerjs');

        // Helper to setup guest connection
        function initializeAsGuest() {
          if (isDestroyed) return;
          console.log(`[P2P] Host ID occupied. Registering as GUEST: ${guestId}`);
          setPeerId(guestId);

          const guestPeer = new Peer(guestId, peerOptions);
          peer = guestPeer;
          peerInstanceRef.current = guestPeer;

          guestPeer.on('open', (id) => {
            if (isDestroyed) return;
            console.log(`[P2P GUEST] Opened with ID: ${id}. Connecting to HOST: ${hostId}`);
            setConnectionState('connected');

            // 1. Establish RTCDataChannel
            const conn = guestPeer.connect(hostId, { reliable: true });
            wireDataConnection(conn, false);

            // 2. Establish MediaStream Audio/Video Call
            const call = guestPeer.call(hostId, stream);
            wireMediaCall(call);
          });

          guestPeer.on('error', (err: any) => {
            console.warn('[P2P GUEST] Peer error:', err?.type, err?.message);
            if (err?.type === 'peer-unavailable') {
              console.log('[P2P GUEST] Host is currently unavailable. Retrying or awaiting election...');
              setConnectionState('connected');
            }
          });
        }

        // 1. Attempt to register as HOST
        console.log(`[P2P] Attempting to register as HOST: ${hostId}`);
        setPeerId(hostId);
        const hostPeer = new Peer(hostId, peerOptions);
        peer = hostPeer;
        peerInstanceRef.current = hostPeer;

        hostPeer.on('open', (id) => {
          if (isDestroyed) return;
          console.log(`[P2P HOST] Registered successfully as session HOST: ${id}`);
          setConnectionState('connected');
        });

        // Listen for guest data channel connection
        hostPeer.on('connection', (conn) => {
          if (isDestroyed) return;
          console.log('[P2P HOST] Incoming data connection from guest:', conn.peer);
          wireDataConnection(conn, true);
        });

        // Listen for guest audio/video call
        hostPeer.on('call', (call) => {
          if (isDestroyed) return;
          console.log('[P2P HOST] Incoming media call from guest:', call.peer);
          call.answer(stream);
          wireMediaCall(call);
        });

        hostPeer.on('error', (err: any) => {
          if (isDestroyed) return;
          if (err?.type === 'unavailable-id') {
            // Host ID already exists -> We are the GUEST!
            hostPeer.destroy();
            initializeAsGuest();
          } else {
            console.warn('[P2P HOST] Peer error:', err?.type, err?.message);
          }
        });

        // Periodic RTT telemetry ping every 2.5 seconds
        pingTimer = setInterval(() => {
          if (activeConnRef.current && activeConnRef.current.open) {
            try {
              activeConnRef.current.send({ type: 'ping', timestamp: Date.now() });
            } catch (e) {
              // ignore transient error
            }
          }
        }, 2500);

      } catch (err) {
        console.error('[P2P] Failed to initialize P2P mesh:', err);
      }
    }

    startP2PMesh();

    return () => {
      isDestroyed = true;
      if (pingTimer) clearInterval(pingTimer);
      if (activeConnRef.current) {
        try { activeConnRef.current.close(); } catch (e) {}
      }
      if (activeCallRef.current) {
        try { activeCallRef.current.close(); } catch (e) {}
      }
      if (peer) {
        try { peer.destroy(); } catch (e) {}
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [roomId, initLocalMedia, wireDataConnection, wireMediaCall]);

  // Audio Toggle
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
    if (rawAudioTrackRef.current) {
      rawAudioTrackRef.current.enabled = !rawAudioTrackRef.current.enabled;
    }
  }, []);

  // Video Toggle
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  }, []);

  // Speaker Mute Toggle
  const toggleSpeakerMute = useCallback(() => {
    setIsSpeakerMuted(prev => !prev);
  }, []);

  // Screen Share Toggle
  const toggleScreenShare = useCallback(async () => {
    const activeCall = activeCallRef.current;

    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: false
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        if (activeCall && (activeCall as any).peerConnection) {
          const pc: RTCPeerConnection = (activeCall as any).peerConnection;
          const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          }
        }

        screenTrack.onended = () => {
          if (activeCall && (activeCall as any).peerConnection && originalVideoTrackRef.current) {
            const pc: RTCPeerConnection = (activeCall as any).peerConnection;
            const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender) {
              videoSender.replaceTrack(originalVideoTrackRef.current);
            }
          }
          setIsScreenSharing(false);
        };

        setIsScreenSharing(true);
      } catch (err) {
        console.error('Screen sharing canceled or failed:', err);
      }
    } else {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
      }
      if (activeCall && (activeCall as any).peerConnection && originalVideoTrackRef.current) {
        const pc: RTCPeerConnection = (activeCall as any).peerConnection;
        const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(originalVideoTrackRef.current);
        }
      }
      setIsScreenSharing(false);
    }
  }, [isScreenSharing]);

  // Broadcast helper over P2P DataChannel
  const broadcast = useCallback((type: string, payload: any) => {
    if (activeConnRef.current && activeConnRef.current.open) {
      try {
        activeConnRef.current.send({
          type,
          payload,
          sender: userNameRef.current,
          timestamp: Date.now()
        });
      } catch (e) {
        console.warn('Broadcast send error:', e);
      }
    }
  }, []);

  const syncCode = useCallback((code: string) => {
    broadcast('code-sync', code);
  }, [broadcast]);

  const syncCursor = useCallback((cursor: { line: number; column: number; selection?: string }) => {
    broadcast('cursor-sync', cursor);
  }, [broadcast]);

  const syncLanguage = useCallback((lang: string) => {
    broadcast('language-change', lang);
  }, [broadcast]);

  const sendChatMessage = useCallback((text: string) => {
    const msg = {
      text,
      sender: userNameRef.current,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    broadcast('chat-message', msg);
    onChatMessageRef.current?.({ ...msg, isLocal: true });
  }, [broadcast]);

  return {
    peerId,
    localStream,
    remoteStream,
    peers,
    connectionState,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isSpeakerMuted,
    remoteVolume,
    setRemoteVolume,
    toggleSpeakerMute,
    latencyMs,
    voiceActivity,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    syncCode,
    syncCursor,
    syncLanguage,
    sendChatMessage
  };
}
