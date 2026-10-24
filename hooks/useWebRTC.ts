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
}

export function useWebRTC({
  roomId,
  userName,
  signalingUrl,
  onCodeSync,
  onCursorSync,
  onLanguageChange,
  onChatMessage
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'p2p-active'>('disconnected');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [peerId, setPeerId] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const targetPeerIdRef = useRef<string | null>(null);
  const queuedIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Keep callback refs fresh to avoid stale closures
  const onCodeSyncRef = useRef(onCodeSync);
  onCodeSyncRef.current = onCodeSync;
  const onCursorSyncRef = useRef(onCursorSync);
  onCursorSyncRef.current = onCursorSync;
  const onLanguageChangeRef = useRef(onLanguageChange);
  onLanguageChangeRef.current = onLanguageChange;
  const onChatMessageRef = useRef(onChatMessage);
  onChatMessageRef.current = onChatMessage;

  // Generate unique peer ID
  useEffect(() => {
    const id = `peer_${Math.random().toString(36).substring(2, 9)}`;
    setPeerId(id);
  }, []);

  // Helper to flush queued candidates once remoteDescription is set
  const flushQueuedCandidates = async (pc: RTCPeerConnection) => {
    while (queuedIceCandidatesRef.current.length > 0) {
      const cand = queuedIceCandidatesRef.current.shift();
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn('Error adding queued ICE candidate:', err);
        }
      }
    }
  };

  // Initialize Local Media Stream (with dynamic animated fallback if camera is locked/unavailable)
  const initLocalMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      originalVideoTrackRef.current = stream.getVideoTracks()[0] || null;
      return stream;
    } catch (err) {
      console.warn('Real camera/mic unavailable (likely in use by another tab). Generating live dynamic canvas stream:', err);
      
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      
      let frame = 0;
      const render = () => {
        if (!ctx) return;
        frame++;
        
        // Dark background
        const grad = ctx.createLinearGradient(0, 0, 640, 480);
        grad.addColorStop(0, '#0a0f1d');
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 640, 480);

        // Subtle animated wave ring
        const pulse = Math.sin(frame * 0.06) * 12;
        ctx.beginPath();
        ctx.arc(320, 210, 65 + pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(14, 165, 233, 0.15)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(320, 210, 52, 0, Math.PI * 2);
        ctx.fillStyle = '#0284c7';
        ctx.fill();

        // Initials avatar
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((userName || 'Dev').slice(0, 2).toUpperCase(), 320, 210);

        // Labels
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`${userName || 'Developer'} (Simulated Feed)`, 320, 305);

        ctx.font = '12px system-ui, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('⚡ PairCraft WebRTC Active', 320, 330);

        requestAnimationFrame(render);
      };
      render();

      const stream = canvas.captureStream(30);

      // Add dummy audio track so SDP has an audio media line
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const dst = audioCtx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        const silentAudioTrack = dst.stream.getAudioTracks()[0];
        silentAudioTrack.enabled = false;
        stream.addTrack(silentAudioTrack);
      } catch (e) {
        console.warn('AudioContext fallback creation error:', e);
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      originalVideoTrackRef.current = stream.getVideoTracks()[0] || null;
      return stream;
    }
  }, [userName]);

  // Setup DataChannel handlers
  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dataChannelRef.current = dc;

    dc.onopen = () => {
      console.log('⚡ WebRTC RTCDataChannel OPEN (Direct P2P Pipe Active)');
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

    // Attach all local media tracks (video & audio)
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
        setConnectionState('connected'); // Fallback to WebSocket signaling
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

              // If there are existing peers in the room, the newcomer initiates the WebRTC offer!
              if (currentPeers && currentPeers.length > 0) {
                const target = currentPeers[0];
                targetPeerIdRef.current = target.peerId;

                const pc = createPeerConnection(mediaStream, target.peerId);
                const dc = pc.createDataChannel('paircraft-data');
                setupDataChannel(dc);

                const offer = await pc.createOffer();
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

              // Offerer created data channel; answerer listens for it
              pc.ondatachannel = (e) => {
                console.log('WebRTC DataChannel received on peer');
                setupDataChannel(e.channel);
              };

              await pc.setRemoteDescription(new RTCSessionDescription(payload));
              await flushQueuedCandidates(pc);

              const answer = await pc.createAnswer();
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

    // Periodic ping to measure round-trip latency
    const pingInterval = setInterval(() => {
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        dataChannelRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', roomId, peerId, timestamp: Date.now() }));
      }
    }, 3000);

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

        // Replace track in peer connection senders
        const videoSender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        }

        // When user clicks "Stop Sharing" from browser banner
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
      // Revert back to webcam
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

  // Real-time broadcast helper (P2P DataChannel first, WebSocket fallback)
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
    latencyMs,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    syncCode,
    syncCursor,
    syncLanguage,
    sendChatMessage
  };
}
