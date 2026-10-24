'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface PeerInfo {
  peerId: string;
  userName: string;
}

export interface UseWebRTCOptions {
  roomId: string;
  userName: string;
  signalingUrl?: string;
  onCodeSync?: (code: string, sender: string) => void;
  onCursorSync?: (cursor: { line: number; column: number; selection?: string }, sender: string) => void;
  onLanguageChange?: (lang: string, sender: string) => void;
  onChatMessage?: (msg: { text: string; sender: string; time: string }) => void;
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
  signalingUrl,
  onCodeSync,
  onCursorSync,
  onLanguageChange,
  onChatMessage,
  onPeerLeft
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'p2p-active'>('disconnected');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Default speaker muted on localhost to prevent ear-piercing acoustic feedback loop on same laptop
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(true);
  const [remoteVolume, setRemoteVolume] = useState<number>(0.8);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [voiceActivity, setVoiceActivity] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rawAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const targetPeerIdRef = useRef<string | null>(null);
  const queuedIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
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

  // Generate unique peer ID
  useEffect(() => {
    const id = `peer_${Math.random().toString(36).substring(2, 9)}`;
    setPeerId(id);
  }, []);

  // Flush queued candidates once remoteDescription is set
  const flushQueuedCandidates = async (pc: RTCPeerConnection) => {
    while (queuedIceCandidatesRef.current.length > 0) {
      const cand = queuedIceCandidatesRef.current.shift();
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn('Queued ICE candidate ignored:', err);
        }
      }
    }
  };

  // Studio Audio DSP: 90Hz Highpass + 3800Hz Lowpass (cuts metallic screech/hiss) + Compressor
  const setupAudioDSP = useCallback((rawTrack: MediaStreamTrack): MediaStreamTrack => {
    try {
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
  const initLocalMedia = useCallback(async () => {
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
      console.warn('Camera/mic locked by other process. Creating simulated 30fps canvas stream:', err);

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      let frame = 0;
      const render = () => {
        if (!ctx) return;
        frame++;

        // Deep charcoal background matching zinc-950
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, 640, 480);

        // Subtle architectural grid
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

        // Center card
        ctx.fillStyle = '#121215';
        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(220, 140, 200, 200, 16);
        ctx.fill();
        ctx.stroke();

        // Monogram Avatar
        const pulse = Math.sin(frame * 0.05) * 3;
        ctx.fillStyle = '#27272a';
        ctx.beginPath();
        ctx.arc(320, 215, 38 + pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f4f4f5';
        ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initials = (userName || 'Dev').slice(0, 2).toUpperCase();
        ctx.fillText(initials, 320, 215);

        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#e4e4e7';
        ctx.fillText(userName || 'Engineer', 320, 280);

        ctx.font = '500 11px ui-monospace, monospace';
        ctx.fillStyle = '#10b981';
        ctx.fillText('● WebRTC Peer Node', 320, 302);

        requestAnimationFrame(render);
      };
      render();

      const stream = canvas.captureStream(30);

      // PURE SILENT BUFFER AUDIO (Zero oscillator, zero tone, zero ping sound!)
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          const audioCtx = new AudioCtxClass();
          const silentBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
          const src = audioCtx.createBufferSource();
          src.buffer = silentBuffer;
          src.loop = true;
          const gain = audioCtx.createGain();
          gain.gain.value = 0.0; // Strictly 0 amplitude
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
  }, [userName, setupAudioDSP]);

  // Setup DataChannel handlers
  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dataChannelRef.current = dc;

    dc.onopen = () => {
      console.log('⚡ WebRTC RTCDataChannel OPEN (Sub-10ms Direct P2P Channel)');
      setConnectionState('p2p-active');
    };

    dc.onclose = () => {
      console.log('WebRTC DataChannel closed');
    };

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'code-sync') {
          onCodeSyncRef.current?.(msg.payload, msg.sender);
        } else if (msg.type === 'cursor-sync') {
          onCursorSyncRef.current?.(msg.payload, msg.sender);
        } else if (msg.type === 'language-change') {
          onLanguageChangeRef.current?.(msg.payload, msg.sender);
        } else if (msg.type === 'chat-message') {
          onChatMessageRef.current?.(msg.payload);
        } else if (msg.type === 'ping') {
          dc.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }));
        } else if (msg.type === 'pong') {
          const rtt = Date.now() - msg.timestamp;
          setLatencyMs(rtt);
        }
      } catch (e) {
        console.error('Error parsing data channel message:', e);
      }
    };
  }, []);

  // Setup RTCPeerConnection
  const createPeerConnection = useCallback((stream: MediaStream, targetPeerId?: string) => {
    if (targetPeerId) {
      targetPeerIdRef.current = targetPeerId;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    });

    pcRef.current = pc;

    // Attach local media tracks
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Remote track listener
    pc.ontrack = (event) => {
      console.log('Incoming remote track:', event.track.kind, event.streams);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        setRemoteStream((prev) => {
          const existing = prev ? prev.getTracks() : [];
          const hasTrack = existing.some(t => t.id === event.track.id);
          const newTracks = hasTrack ? existing : [...existing, event.track];
          return new MediaStream(newTracks);
        });
      }
      setConnectionState('p2p-active');
    };

    // ICE Candidate generator
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          roomId,
          peerId,
          targetPeerId: targetPeerIdRef.current || undefined,
          payload: event.candidate
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('RTCPeerConnection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnectionState('p2p-active');
      } else if (pc.connectionState === 'connecting') {
        setConnectionState('connecting');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionState('connected');
      }
    };

    return pc;
  }, [roomId, peerId]);

  // Main WebRTC & WebSocket lifecycle
  useEffect(() => {
    if (!peerId || !roomId) return;

    let isMounted = true;
    const wsUrl = signalingUrl || (typeof window !== 'undefined' 
      ? `ws://${window.location.hostname}:3001` 
      : 'ws://localhost:3001');

    initLocalMedia().then((mediaStream) => {
      if (!isMounted) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to signaling server:', wsUrl);
        setConnectionState('connected');
        ws.send(JSON.stringify({
          type: 'join-room',
          roomId,
          peerId,
          userName
        }));
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          const { type, payload, senderPeerId, peers: currentPeers } = msg;

          switch (type) {
            case 'room-joined': {
              setPeers(currentPeers || []);

              // Newcomer initiates offer to existing peer
              if (currentPeers && currentPeers.length > 0) {
                const target = currentPeers[0];
                targetPeerIdRef.current = target.peerId;

                const pc = createPeerConnection(mediaStream, target.peerId);
                const dc = pc.createDataChannel('paircraft-data');
                setupDataChannel(dc);

                const rawOffer = await pc.createOffer();
                const tunedSdp = tuneOpusSDP(rawOffer.sdp || '');
                const offer = new RTCSessionDescription({ type: 'offer', sdp: tunedSdp });

                await pc.setLocalDescription(offer);

                ws.send(JSON.stringify({
                  type: 'webrtc-offer',
                  roomId,
                  peerId,
                  targetPeerId: target.peerId,
                  payload: offer
                }));
              }
              break;
            }

            case 'peer-joined': {
              setPeers((prev) => [
                ...prev.filter(p => p.peerId !== msg.peerId),
                { peerId: msg.peerId, userName: msg.userName }
              ]);
              targetPeerIdRef.current = msg.peerId;
              break;
            }

            case 'webrtc-offer': {
              targetPeerIdRef.current = senderPeerId;
              
              if (pcRef.current) {
                pcRef.current.close();
              }
              const pc = createPeerConnection(mediaStream, senderPeerId);

              pc.ondatachannel = (e) => {
                console.log('WebRTC DataChannel received on peer');
                setupDataChannel(e.channel);
              };

              await pc.setRemoteDescription(new RTCSessionDescription(payload));
              await flushQueuedCandidates(pc);

              const rawAnswer = await pc.createAnswer();
              const tunedSdp = tuneOpusSDP(rawAnswer.sdp || '');
              const answer = new RTCSessionDescription({ type: 'answer', sdp: tunedSdp });

              await pc.setLocalDescription(answer);

              ws.send(JSON.stringify({
                type: 'webrtc-answer',
                roomId,
                peerId,
                targetPeerId: senderPeerId,
                payload: answer
              }));
              break;
            }

            case 'webrtc-answer': {
              const pc = pcRef.current;
              if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(payload));
                await flushQueuedCandidates(pc);
              }
              break;
            }

            case 'ice-candidate': {
              const pc = pcRef.current;
              if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
                queuedIceCandidatesRef.current.push(payload);
              } else {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(payload));
                } catch (e) {
                  console.warn('ICE add error:', e);
                }
              }
              break;
            }

            case 'code-sync': {
              onCodeSyncRef.current?.(payload, msg.senderUserName);
              break;
            }

            case 'cursor-sync': {
              onCursorSyncRef.current?.(payload, msg.senderUserName);
              break;
            }

            case 'language-change': {
              onLanguageChangeRef.current?.(payload, msg.senderUserName);
              break;
            }

            case 'chat-message': {
              onChatMessageRef.current?.(payload);
              break;
            }

            case 'peer-left': {
              setPeers((prev) => prev.filter(p => p.peerId !== msg.peerId));
              setRemoteStream(null);
              setConnectionState('connected');
              onPeerLeftRef.current?.(msg.peerId);
              if (pcRef.current) {
                pcRef.current.close();
                pcRef.current = null;
              }
              break;
            }

            case 'pong': {
              const latency = Date.now() - msg.timestamp;
              setLatencyMs(latency);
              break;
            }
          }
        } catch (err) {
          console.error('Error in signaling message processing:', err);
        }
      };

      ws.onerror = (e) => {
        console.warn('Signaling WebSocket error:', e);
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
      };
    });

    // High frequency RTT telemetry
    const pingInterval = setInterval(() => {
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        dataChannelRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', roomId, peerId, timestamp: Date.now() }));
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(pingInterval);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [peerId, roomId, userName, signalingUrl, initLocalMedia, createPeerConnection, setupDataChannel]);

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
    if (!pcRef.current) return;

    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: false
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        const videoSender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        }

        screenTrack.onended = () => {
          if (videoSender && originalVideoTrackRef.current) {
            videoSender.replaceTrack(originalVideoTrackRef.current);
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
      const videoSender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender && originalVideoTrackRef.current) {
        videoSender.replaceTrack(originalVideoTrackRef.current);
      }
      setIsScreenSharing(false);
    }
  }, [isScreenSharing]);

  // Broadcast helper
  const broadcast = useCallback((type: string, payload: any) => {
    const msg = JSON.stringify({
      type,
      roomId,
      peerId,
      userName,
      payload,
      timestamp: Date.now()
    });

    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(msg);
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    }
  }, [roomId, peerId, userName]);

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
      sender: userName,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    broadcast('chat-message', msg);
    onChatMessageRef.current?.(msg);
  }, [broadcast, userName]);

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
