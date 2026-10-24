'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useWebRTC } from '@/hooks/useWebRTC';
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff,
  Copy, Check, Users, MessageSquare, Zap, Shield,
  Volume2, VolumeX, ArrowLeft
} from 'lucide-react';

const CodeEditor = dynamic(() => import('@/components/CodeEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0c0c0e] text-zinc-500 font-mono text-xs">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading Monaco Engine...</span>
      </div>
    </div>
  )
});

const INITIAL_CODE = `// PairCraft Collaborative Workspace
// Low-Latency P2P Execution Engine

interface PeerSession {
  id: string;
  peers: string[];
  protocol: "WebRTC DataChannel" | "WebSocket Signaling";
  latencyMs: number;
}

function verifyP2PEngine(session: PeerSession): boolean {
  console.log("Validating low-latency P2P mesh...");
  console.log(\`Session \${session.id} active with \${session.peers.length} peers.\`);
  return session.latencyMs < 30;
}

const activeSession: PeerSession = {
  id: "pair-live-session",
  peers: ["Local Engineer", "Remote Partner"],
  protocol: "WebRTC DataChannel",
  latencyMs: 6
};

console.log("Execution Result:", verifyP2PEngine(activeSession));
`;

function RoomContent() {
  const params = useParams();
  const router = useRouter();
  const roomId = (params?.roomId as string) || 'default-room';

  const [userName, setUserName] = useState<string>('Engineer');
  const [code, setCode] = useState<string>(INITIAL_CODE);
  const [language, setLanguage] = useState<string>('typescript');
  const [remoteCursor, setRemoteCursor] = useState<{ line: number; column: number; sender?: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ text: string; sender: string; time: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [incomingToast, setIncomingToast] = useState<{ sender: string; text: string } | null>(null);
  const [systemToast, setSystemToast] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedName = localStorage.getItem('paircraft_username') || `Dev-${Math.floor(1000 + Math.random() * 9000)}`;
    setUserName(savedName);
  }, []);

  const {
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
  } = useWebRTC({
    roomId,
    userName,
    onCodeSync: (newCode) => {
      setCode((prev) => (prev === newCode ? prev : newCode));
    },
    onCursorSync: (cursor, sender) => {
      setRemoteCursor({ ...cursor, sender });
    },
    onLanguageChange: (newLang) => {
      setLanguage(newLang);
    },
    onChatMessage: (msg) => {
      setChatMessages((prev) => [...prev, msg]);

      // If message is from remote partner, trigger unread badge & on-screen toast!
      if (!msg.isLocal) {
        setUnreadMessages((prev) => prev + 1);
        setIncomingToast({ sender: msg.sender, text: msg.text });
        setTimeout(() => setIncomingToast(null), 4500);
      }
    },
    onPeerLeft: () => {
      setRemoteCursor(null);
      setSystemToast('Partner disconnected from session');
      setTimeout(() => setSystemToast(null), 3500);
    }
  });

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (isChatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  // Reset unread count when chat is opened
  const handleToggleChat = () => {
    if (!isChatOpen) {
      setUnreadMessages(0);
      setIncomingToast(null);
    }
    setIsChatOpen((prev) => !prev);
  };

  // Attach local media stream (strictly muted)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true;
    }
  }, [localStream]);

  // Attach remote media stream with volume control
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.volume = isSpeakerMuted ? 0 : remoteVolume;
      remoteVideoRef.current.play().catch(e => console.log('Remote stream playback triggered:', e));
      
      setSystemToast('Connected to peer via direct WebRTC mesh');
      const timer = setTimeout(() => setSystemToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [remoteStream, isSpeakerMuted, remoteVolume]);

  const handleCodeChange = (newCode: string) => {
    if (newCode === code) return;
    setCode(newCode);
    syncCode(newCode);
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    syncLanguage(newLang);
  };

  const handleCursorChange = (cursor: { line: number; column: number }) => {
    syncCursor(cursor);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const copyRoomLink = () => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const leaveRoom = () => {
    router.push('/');
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      {/* Top Header Navigation */}
      <header className="h-13 bg-[#121215] border-b border-zinc-800/80 px-4 flex items-center justify-between select-none shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={leaveRoom}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition"
            title="Leave Session"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Minimalist Monogram Brand */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700/80 flex items-center justify-center font-mono font-bold text-xs text-zinc-200">
              P
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs tracking-tight text-zinc-200">
                PairCraft
              </span>
              <span className="px-1.5 py-0.2 text-[9px] font-mono text-zinc-400 bg-zinc-800/80 border border-zinc-700/60 rounded">
                P2P
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

          {/* Room Pill with Copy */}
          <button
            onClick={copyRoomLink}
            className="flex items-center gap-2 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded text-xs font-mono text-zinc-300 transition"
            title="Copy invite URL"
          >
            <span className="text-zinc-500">session:</span>
            <span className="text-zinc-200 font-medium">{roomId}</span>
            {copiedLink ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-zinc-500" />
            )}
          </button>
        </div>

        {/* Telemetry and Controls */}
        <div className="flex items-center gap-2">
          {/* DSP Filter Badge */}
          <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400" title="Studio Audio DSP: 90Hz Highpass + 3.8kHz Lowpass Active">
            <Shield className="w-3 h-3 text-emerald-500" />
            <span>Studio Voice DSP</span>
          </div>

          {/* Latency Pill */}
          {latencyMs !== null && (
            <div className="flex items-center gap-1 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>{latencyMs}ms</span>
            </div>
          )}

          {/* Connection Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${
              connectionState === 'p2p-active'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : connectionState === 'connected'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionState === 'p2p-active'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionState === 'connected'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span className="hidden sm:inline font-mono text-[11px]">
              {connectionState === 'p2p-active'
                ? 'P2P Direct'
                : connectionState === 'connected'
                ? 'Signaling Active'
                : 'Connecting'}
            </span>
          </div>

          {/* Peers Badge */}
          <div className="flex items-center gap-1 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 font-mono">
            <Users className="w-3 h-3 text-zinc-400" />
            <span>{peers.length + 1}</span>
          </div>

          {/* Speaker Mute & Echo Feedback Guard */}
          <button
            onClick={toggleSpeakerMute}
            className={`p-1.5 rounded border transition flex items-center gap-1 text-xs ${
              isSpeakerMuted
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                : 'bg-zinc-900 text-zinc-300 hover:text-white border-zinc-800'
            }`}
            title={isSpeakerMuted ? 'Unmute Partner Audio (Currently muted to prevent acoustic feedback)' : 'Mute Partner Audio (Echo Guard)'}
          >
            {isSpeakerMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {isSpeakerMuted && <span className="hidden xl:inline text-[10px] font-mono">Echo Guard</span>}
          </button>

          {/* Chat Toggle with Unread Badge */}
          <button
            onClick={handleToggleChat}
            className={`relative p-1.5 rounded border transition ${
              isChatOpen
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border-zinc-800'
            }`}
            title="Toggle Session Chat"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {unreadMessages > 0 && !isChatOpen && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-emerald-500 text-zinc-950 font-mono text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg animate-bounce">
                {unreadMessages}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden p-2.5 gap-2.5">
        {/* Left Media Stream Column */}
        <div className="w-72 lg:w-80 flex flex-col gap-2 shrink-0">
          {/* Remote Video Tile */}
          <div className="relative flex-1 bg-[#121215] border border-zinc-800/80 rounded-lg overflow-hidden shadow flex flex-col items-center justify-center min-h-[170px]">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2 text-zinc-400">
                  <Users className="w-5 h-5 animate-pulse" />
                </div>
                <p className="text-xs font-medium text-zinc-300">Waiting for partner</p>
                <p className="text-[11px] text-zinc-500 mt-1 max-w-[200px]">
                  Share the session link above to pair program.
                </p>
                <button
                  onClick={copyRoomLink}
                  className="mt-3 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded text-xs font-medium transition"
                >
                  {copiedLink ? 'Link Copied' : 'Copy Invite URL'}
                </button>
              </div>
            )}

            {/* Remote Peer Name Label */}
            {remoteStream && (
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] font-mono text-zinc-300 border border-zinc-800/60">
                Partner Stream
              </div>
            )}
          </div>

          {/* Local Video Tile */}
          <div className="relative h-40 bg-[#121215] border border-zinc-800/80 rounded-lg overflow-hidden shadow">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoOff ? 'opacity-0' : 'opacity-100'}`}
            />

            {isVideoOff && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-zinc-500">
                <VideoOff className="w-6 h-6 mb-1 text-zinc-600" />
                <span className="text-xs font-mono">Camera Muted</span>
              </div>
            )}

            {/* Overlay indicators */}
            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] font-mono text-zinc-300 flex items-center gap-1.5 border border-zinc-800/60">
              <span>{userName} (You)</span>
              
              {/* Dynamic Voice Activity VU Meter */}
              {!isAudioMuted && voiceActivity > 5 && (
                <div className="flex items-center gap-0.5 ml-1">
                  <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className={`w-1 bg-emerald-400 rounded-full ${voiceActivity > 30 ? 'h-3' : 'h-1.5'}`} />
                  <span className={`w-1 bg-emerald-400 rounded-full ${voiceActivity > 60 ? 'h-3.5' : 'h-1'}`} />
                </div>
              )}

              {isScreenSharing && (
                <span className="px-1 py-0.2 text-[8px] bg-zinc-700 text-zinc-200 rounded font-bold font-mono">
                  SCREEN
                </span>
              )}
            </div>

            {isAudioMuted && (
              <div className="absolute top-2 right-2 p-1 bg-rose-500/90 text-white rounded">
                <MicOff className="w-3 h-3" />
              </div>
            )}
          </div>

          {/* Minimalist Media Action Dock */}
          <div className="bg-[#121215] border border-zinc-800/80 rounded-lg p-2 flex items-center justify-around shadow">
            {/* Mic Toggle */}
            <button
              onClick={toggleAudio}
              className={`p-2 rounded border transition ${
                isAudioMuted
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
              }`}
              title={isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {/* Video Toggle */}
            <button
              onClick={toggleVideo}
              className={`p-2 rounded border transition ${
                isVideoOff
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
              }`}
              title={isVideoOff ? 'Enable Camera' : 'Disable Camera'}
            >
              {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </button>

            {/* Screen Share Toggle */}
            <button
              onClick={toggleScreenShare}
              className={`p-2 rounded border transition ${
                isScreenSharing
                  ? 'bg-zinc-200 text-zinc-950 border-white'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
              }`}
              title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
            >
              <MonitorUp className="w-4 h-4" />
            </button>

            {/* Leave Room */}
            <button
              onClick={leaveRoom}
              className="p-2 bg-zinc-900 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-900 rounded transition"
              title="Leave Room"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: Collaborative Monaco Code Editor */}
        <div className="flex-1 h-full min-w-0">
          <CodeEditor
            code={code}
            language={language}
            onChange={handleCodeChange}
            onLanguageChange={handleLanguageChange}
            onCursorChange={handleCursorChange}
            remoteCursor={remoteCursor}
            remoteUserName={remoteCursor?.sender}
          />
        </div>

        {/* In-Call Text Chat Drawer */}
        {isChatOpen && (
          <div className="w-72 bg-[#121215] border border-zinc-800/80 rounded-lg overflow-hidden flex flex-col shadow-2xl shrink-0">
            <div className="px-3 py-2.5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                Session Notes & Chat
              </span>
              <button
                onClick={handleToggleChat}
                className="text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs font-mono">
              {chatMessages.length === 0 ? (
                <div className="text-zinc-600 text-center py-6 text-[11px]">
                  No messages yet. Send notes or snippets.
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded text-xs ${
                      msg.sender === userName
                        ? 'ml-auto bg-zinc-800 border border-zinc-700/60 text-zinc-200'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-0.5">
                      <span className="font-semibold text-zinc-400">{msg.sender}</span>
                      <span>{msg.time}</span>
                    </div>
                    <div className="break-words font-sans">{msg.text}</div>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleSendChat} className="p-2 border-t border-zinc-800 bg-zinc-950">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a note..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-700"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs rounded transition"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* On-Screen Incoming Message Toast Notification */}
      {incomingToast && !isChatOpen && (
        <div
          onClick={handleToggleChat}
          className="fixed top-15 right-4 z-50 flex items-start gap-2.5 p-3 bg-zinc-900/95 border border-zinc-700/90 text-zinc-200 rounded-lg shadow-2xl cursor-pointer hover:border-emerald-500/50 transition backdrop-blur animate-slide-down max-w-xs"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
              <span>{incomingToast.sender}</span>
              <span className="text-[10px] text-zinc-500">Click to reply</span>
            </div>
            <p className="text-xs text-zinc-100 truncate mt-0.5 font-sans">
              {incomingToast.text}
            </p>
          </div>
        </div>
      )}

      {/* System Status Toast */}
      {systemToast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-zinc-900/95 border border-zinc-700 text-zinc-200 text-xs font-mono rounded shadow-xl backdrop-blur">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{systemToast}</span>
        </div>
      )}
    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[#09090b] text-zinc-500 font-mono text-xs">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            <p>Initializing P2P Workspace...</p>
          </div>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
