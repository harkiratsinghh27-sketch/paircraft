'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWebRTC } from '@/hooks/useWebRTC';
import CodeEditor from '@/components/CodeEditor';
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff,
  Copy, Check, Users, MessageSquare, Zap, ShieldCheck,
  Sparkles, Globe, Terminal, Settings, ArrowLeft
} from 'lucide-react';
import confetti from 'canvas-confetti';

const INITIAL_CODE = `// ⚡ PairCraft Real-Time WebRTC IDE
// Peer-to-Peer Pair Programming & Live Audio/Video

interface PairSession {
  roomId: string;
  engineers: string[];
  protocol: "WebRTC DataChannel" | "WebSocket Signaling";
  latencyMs: number;
}

function verifyCollaborativeSync(session: PairSession): boolean {
  console.log("Analyzing P2P Media Streams...");
  console.log(\`Room \${session.roomId} connected with \${session.engineers.length} active peers.\`);
  return session.latencyMs < 50;
}

const currentSession: PairSession = {
  roomId: "webrtc-pair-live",
  engineers: ["Local Engineer", "Remote Partner"],
  protocol: "WebRTC DataChannel",
  latencyMs: 14
};

console.log("Live Execution Result:", verifyCollaborativeSync(currentSession));
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
  const [copiedLink, setCopiedLink] = useState(false);
  const [hasCelebrated, setHasCelebrated] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Set user name from localStorage or random
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
    latencyMs,
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
    onCodeSync: (newCode, sender) => {
      setCode(newCode);
    },
    onCursorSync: (cursor, sender) => {
      setRemoteCursor({ ...cursor, sender });
    },
    onLanguageChange: (newLang) => {
      setLanguage(newLang);
    },
    onChatMessage: (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    }
  });

  // Attach local media stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote media stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.log('Remote stream playback triggered:', e));
      if (!hasCelebrated) {
        confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
        setHasCelebrated(true);
      }
    }
  }, [remoteStream, hasCelebrated]);

  // Handle local code edits and broadcast to peer
  const handleCodeChange = (newCode: string) => {
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
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const leaveRoom = () => {
    router.push('/');
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#070b13] text-slate-100 overflow-hidden font-sans">
      {/* Top Header Navigation */}
      <header className="h-14 bg-slate-900/90 border-b border-slate-800/80 px-4 flex items-center justify-between backdrop-blur-md z-30 select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={leaveRoom}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/70 rounded-lg transition"
            title="Leave Session"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-sky-500/20">
              ⚡
            </div>
            <div>
              <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-sky-400 to-indigo-300 bg-clip-text text-transparent">
                PairCraft
              </span>
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded">
                WebRTC IDE
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* Room Pill with Copy */}
          <button
            onClick={copyRoomLink}
            className="flex items-center gap-2 px-3 py-1 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-lg text-xs font-mono text-slate-300 transition"
            title="Click to copy invite link"
          >
            <span className="text-slate-400">Room:</span>
            <span className="text-sky-300 font-semibold">{roomId}</span>
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Latency Pill */}
          {latencyMs !== null && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs font-mono text-slate-300">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>{latencyMs}ms</span>
            </div>
          )}

          {/* Connection Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
              connectionState === 'p2p-active'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : connectionState === 'connected'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connectionState === 'p2p-active'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionState === 'connected'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span className="hidden sm:inline">
              {connectionState === 'p2p-active'
                ? 'P2P Direct'
                : connectionState === 'connected'
                ? 'Signaling Active'
                : 'Connecting...'}
            </span>
          </div>

          {/* Peers Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-300">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            <span>{peers.length + 1}</span>
          </div>

          {/* Chat Toggle */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`p-2 rounded-lg border transition ${
              isChatOpen
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                : 'bg-slate-800/60 text-slate-400 hover:text-white border-slate-700/50'
            }`}
            title="Toggle In-Call Chat"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* Left Video / Media Stream Drawer */}
        <div className="w-72 lg:w-80 flex flex-col gap-3 shrink-0">
          {/* Remote Video Tile */}
          <div className="relative flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col items-center justify-center min-h-[160px]">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-2 text-slate-400">
                  <Users className="w-6 h-6 animate-pulse" />
                </div>
                <p className="text-xs font-semibold text-slate-300">Waiting for partner...</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-[180px]">
                  Share the room link above to pair program together.
                </p>
                <button
                  onClick={copyRoomLink}
                  className="mt-3 px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 rounded-lg text-xs font-medium transition"
                >
                  {copiedLink ? 'Link Copied!' : 'Copy Invite Link'}
                </button>
              </div>
            )}

            {/* Remote Peer Name Label */}
            {remoteStream && (
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[11px] font-medium text-slate-200">
                Partner Stream
              </div>
            )}
          </div>

          {/* Local Video Tile */}
          <div className="relative h-44 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoOff ? 'opacity-0' : 'opacity-100'}`}
            />

            {isVideoOff && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 text-slate-400">
                <VideoOff className="w-8 h-8 text-slate-500 mb-1" />
                <span className="text-xs font-medium">Camera Off</span>
              </div>
            )}

            {/* Overlay indicators */}
            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[11px] font-medium text-slate-200 flex items-center gap-1.5">
              <span>{userName} (You)</span>
              {isScreenSharing && (
                <span className="px-1 py-0.2 text-[9px] bg-indigo-500 text-white rounded font-bold">
                  SCREEN
                </span>
              )}
            </div>

            {isAudioMuted && (
              <div className="absolute top-2 right-2 p-1 bg-rose-500/90 text-white rounded-full">
                <MicOff className="w-3 h-3" />
              </div>
            )}
          </div>

          {/* Media Action Control Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex items-center justify-around shadow-xl">
            {/* Mic Toggle */}
            <button
              onClick={toggleAudio}
              className={`p-2.5 rounded-xl border transition active:scale-95 ${
                isAudioMuted
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-slate-800/80 text-slate-200 border-slate-700/60 hover:bg-slate-700'
              }`}
              title={isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {/* Video Toggle */}
            <button
              onClick={toggleVideo}
              className={`p-2.5 rounded-xl border transition active:scale-95 ${
                isVideoOff
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-slate-800/80 text-slate-200 border-slate-700/60 hover:bg-slate-700'
              }`}
              title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
            >
              {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </button>

            {/* Screen Share Toggle */}
            <button
              onClick={toggleScreenShare}
              className={`p-2.5 rounded-xl border transition active:scale-95 ${
                isScreenSharing
                  ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/30'
                  : 'bg-slate-800/80 text-slate-200 border-slate-700/60 hover:bg-slate-700'
              }`}
              title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
            >
              <MonitorUp className="w-4 h-4" />
            </button>

            {/* End Call */}
            <button
              onClick={leaveRoom}
              className="p-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-lg shadow-rose-600/20 active:scale-95 transition"
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

        {/* In-Call Text Chat Drawer (Optional Side Drawer) */}
        {isChatOpen && (
          <div className="w-72 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-2xl shrink-0 animate-in slide-in-from-right duration-200">
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                In-Call Chat & Notes
              </span>
              <button
                onClick={() => setIsChatOpen(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
              {chatMessages.length === 0 ? (
                <div className="text-slate-500 text-center py-6 italic text-[11px]">
                  No messages yet. Send code snippets, links, or notes to your partner!
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg max-w-[90%] ${
                      msg.sender === userName
                        ? 'ml-auto bg-sky-600/30 border border-sky-500/30 text-sky-100'
                        : 'bg-slate-800/80 border border-slate-700/50 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span className="font-semibold">{msg.sender}</span>
                      <span>{msg.time}</span>
                    </div>
                    <div className="break-words">{msg.text}</div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendChat} className="p-2 border-t border-slate-800 bg-slate-950">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a note or message..."
                  className="flex-1 bg-slate-900 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs rounded-lg transition"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[#070b13] text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Entering collaborative room...</p>
          </div>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
