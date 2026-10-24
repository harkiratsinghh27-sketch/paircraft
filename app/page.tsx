'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Code2, Users, Video, Zap, MonitorUp, Shield,
  ArrowRight, Terminal, Check
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

    let target = roomInput.trim();
    if (target.includes('/room/')) {
      target = target.split('/room/')[1].split('?')[0];
    }
    router.push(`/room/${target}`);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-zinc-800">
      {/* Navigation Header */}
      <header className="max-w-6xl mx-auto w-full px-6 py-5 flex items-center justify-between border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono font-bold text-xs text-zinc-200">
            P
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight text-zinc-100">
              PairCraft
            </span>
            <span className="px-1.5 py-0.2 text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 rounded">
              WebRTC Core
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
          <span>● P2P Direct Mesh</span>
          <span className="hidden sm:inline">● Sub-10ms DataChannels</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto w-full px-6 pt-20 pb-16 flex-1 flex flex-col items-center text-center">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Low-Latency Real-Time Pair Programming</span>
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-zinc-100 max-w-2xl leading-[1.2]">
          Collaborative coding with zero server relay delay.
        </h1>

        <p className="mt-4 text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed">
          Direct browser-to-browser WebRTC audio, video, screen sharing, and synchronized Monaco editor over reliable DataChannels.
        </p>

        {/* Action Card */}
        <div className="mt-10 w-full max-w-md bg-[#121215] border border-zinc-800 rounded-lg p-5 shadow-xl text-left">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Your Display Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Harkirat Singh"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition"
              />
            </div>

            <button
              onClick={handleStartNewSession}
              className="w-full py-2.5 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs rounded transition flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.99]"
            >
              <span>Create Instant Session</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-zinc-800"></div>
              <span className="flex-shrink mx-3 text-[11px] font-mono text-zinc-500">OR JOIN EXISTING</span>
              <div className="flex-grow border-t border-zinc-800"></div>
            </div>

            <form onSubmit={handleJoinSession} className="flex gap-2">
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                placeholder="Enter Session ID or URL..."
                className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition font-mono"
              />
              <button
                type="submit"
                disabled={!roomInput.trim()}
                className="px-3.5 py-2 bg-zinc-850 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-700 text-zinc-200 font-medium text-xs rounded transition"
              >
                Join
              </button>
            </form>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl text-left">
          <div className="p-3.5 bg-[#121215] border border-zinc-800/80 rounded-lg">
            <div className="flex items-center gap-2 mb-1.5 text-zinc-200 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5 text-zinc-400" />
              <span>Sub-10ms P2P Mesh</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
              RTCDataChannel keystroke sync with zero intermediary database latency.
            </p>
          </div>

          <div className="p-3.5 bg-[#121215] border border-zinc-800/80 rounded-lg">
            <div className="flex items-center gap-2 mb-1.5 text-zinc-200 text-xs font-semibold">
              <Shield className="w-3.5 h-3.5 text-zinc-400" />
              <span>DSP Voice Filter</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
              85Hz highpass + lowpass bandpass filter and dynamics compression for speech clarity.
            </p>
          </div>

          <div className="p-3.5 bg-[#121215] border border-zinc-800/80 rounded-lg">
            <div className="flex items-center gap-2 mb-1.5 text-zinc-200 text-xs font-semibold">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              <span>Monaco + Sucrase</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
              In-browser TypeScript compilation and sandboxed execution in sub-millisecond time.
            </p>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-zinc-850 py-4 text-center text-[11px] text-zinc-600 font-mono">
        PairCraft • Built for Real-Time Engineering Collaboration
      </footer>
    </div>
  );
}
