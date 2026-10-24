import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PairCraft — Real-Time WebRTC Collaborative Pair Programming IDE",
  description: "Peer-to-peer low-latency video, crystal-clear voice, screen share, and synchronized multi-cursor Monaco code editor in your browser. Built for engineering teams and technical interviews.",
  keywords: ["WebRTC", "Pair Programming", "Monaco Editor", "Collaborative Code", "Screen Share", "Next.js", "P2P"],
  authors: [{ name: "Harkirat Singh" }],
  openGraph: {
    title: "PairCraft — Real-Time WebRTC Collaborative Pair Programming IDE",
    description: "Peer-to-peer low-latency video, voice, screen share, and synchronized multi-cursor Monaco IDE.",
    type: "website"
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#070b13] text-slate-100">{children}</body>
    </html>
  );
}
