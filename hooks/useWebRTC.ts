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

  // Keep callback refs fresh
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

  // Initialize Local Media Stream
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
      console.warn('Could not access real camera/mic, creating simulated audio/video track:', err);
      // Fallback: create empty canvas stream so WebRTC connection works seamlessly even without physical webcam
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '24px sans-serif';
        ctx.fillText('PairCraft Active', 230, 240);
      }
      const stream = canvas.captureStream(15);
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    }
  }, []);

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
  const createPeerConnection = useCallback((stream: MediaStream) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    pcRef.current = pc;

    // Attach local media tracks
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Remote track listener
    pc.ontrack = (event) => {
      console.log('Incoming remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        const inboundStream = new MediaStream([event.track]);
        setRemoteStream(inboundStream);
      }
    };

    // ICE Candidate generator
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          roomId,
          peerId,
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
        setConnectionState('connected'); // Fallback to signaling
      }
    };

    return pc;
  }, [roomId, peerId]);

  // Main lifecycle
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
          const { type, payload, senderPeerId, isInitiator, peers: currentPeers } = msg;

          switch (type) {
            case 'room-joined': {
              setPeers(currentPeers || []);
              const pc = createPeerConnection(mediaStream);

              // If initiator, create Offer and DataChannel
              if (isInitiator) {
                const dc = pc.createDataChannel('paircraft-data');
                setupDataChannel(dc);

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                ws.send(JSON.stringify({
                  type: 'webrtc-offer',
                  roomId,
                  peerId,
                  payload: offer
                }));
              }
              break;
            }

            case 'peer-joined': {
              setPeers((prev) => [...prev.filter(p => p.peerId !== msg.peerId), { peerId: msg.peerId, userName: msg.userName }]);
              // Existing peer prepares to receive offer or negotiates
              break;
            }

            case 'webrtc-offer': {
              let pc = pcRef.current;
              if (!pc) {
                pc = createPeerConnection(mediaStream);
              }

              // Listen for data channel created by offerer
              pc.ondatachannel = (e) => {
                setupDataChannel(e.channel);
              };

              await pc.setRemoteDescription(new RTCSessionDescription(payload));
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
              }
              break;
            }

            case 'ice-candidate': {
              const pc = pcRef.current;
              if (pc && payload) {
                await pc.addIceCandidate(new RTCIceCandidate(payload)).catch(e => console.warn('ICE add error:', e));
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
