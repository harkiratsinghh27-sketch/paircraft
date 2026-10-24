'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Code2, Users, Video, Zap, MonitorUp, ShieldCheck,
  ArrowRight, Sparkles, Terminal, CheckCircle2, Copy
} from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [roomInput, setRoomInput] = useState('');
  const [userName, setUserName] = useState('');

  const generateRoomId = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let id = 'pair-';
    for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
    id += '-';
    for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  };

  const handleStartNewSession = () => {
    const name = userName.trim() || 'Engineer';
    localStorage.setItem('paircraft_username', name);
    const newRoomId = generateRoomId();
    router.push(`/room/${newRoomId}`);
  };

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomInput.trim()) return;
    const name = userName.trim() || 'Engineer';
    localStorage.setItem('paircraft_username', name);

    // Extract room ID if user pasted full URL
    let target = roomInput.trim();
    if (target.includes('/room/')) {
      target = target.split('/room/')[1].split('?')[0];
    }
    router.push(`/room/${target}`);
  };

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans selection:bg-sky-500/30">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] bg-sky-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] right-[10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px]" />
      </div>

      {/* Navigation Header */}
      <header className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-sky-500/25 text-lg">
            ⚡
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-sky-400 via-indigo-200 to-white bg-clip-text text-transparent">
              PairCraft
            </span>
            <span className="ml-2 px-2 py-0.5 text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-full">
              v1.0 WebRTC P2P
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/harkiratsinghh27-sketch"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5"
          >
            <span>GitHub</span>
          </a>
          <a
            href="https://datapilot-ai-sandy.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-lg border border-slate-700 transition"
          >
            DataPilot AI ↗
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-5xl mx-auto w-full px-6 pt-16 pb-20 flex-1 flex flex-col items-center text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-medium text-sky-300 mb-8 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          <span>Native Peer-to-Peer Collaborative IDE</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400">Sub-80ms Latency</span>
        </div>

        {/* Main Title */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.15]">
          Real-Time Pair Programming{' '}
          <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            Over Direct WebRTC
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
          Zero install, zero plugins. Live browser-to-browser video, crystal-clear voice,
          screen share, and synchronized multi-cursor Monaco IDE powered by CRDT conflict resolution.
        </p>

        {/* Action Card */}
        <div className="mt-10 w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
          <div className="mb-5 text-left">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Your Engineer / Display Name
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g. Harkirat Singh"
              className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Start New Session */}
            <button
              onClick={handleStartNewSession}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 active:scale-95 text-white font-bold text-sm rounded-xl shadow-lg shadow-sky-500/25 transition"
            >
              <span>Start Pair Session</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Join Existing Session */}
            <form onSubmit={handleJoinSession} className="flex gap-2">
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                placeholder="Enter Room Code..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl border border-slate-700 transition"
              >
                Join
              </button>
            </form>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-4">
              <Video className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">WebRTC P2P Audio & Video</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Direct peer-to-peer UDP media streaming without central relay lag. Built-in microphone mute, video toggle, and high-framerate screen sharing.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Code2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Monaco Code Editor</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              The full VS Code editor engine in the browser. Supports multi-cursor real-time sync, syntax highlighting for TypeScript, Python, Go, and Rust.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Conflict-Free CRDT Sync</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Real-time keystroke synchronization over low-overhead RTCDataChannel. Edits merge mathematically without character corruption or cursor jumping.
            </p>
          </div>
        </div>

        {/* Technical Architecture Quote */}
        <div className="mt-16 p-6 rounded-2xl bg-slate-900/40 border border-slate-800 max-w-3xl w-full text-left">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider mb-2">
            <Terminal className="w-4 h-4" />
            <span>Architecture & Pairio Engineering Synergy</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Built specifically to demonstrate real-time collaborative systems architecture: STUN NAT hole-punching,
            SDP offer/answer negotiation, MediaStream track replacement for screen sharing, and reliable SCTP-based DataChannels
            for synchronous pair programming.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        <p>
          Designed & Built by <span className="text-slate-300 font-semibold">Harkirat Singh</span> | Computer Systems Technician Graduate, Durham College | Delhi NCR
        </p>
      </footer>
    </div>
  );
}
