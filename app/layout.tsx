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
  title: "PairCraft — Real-Time WebRTC Collaborative IDE",
  description: "Direct peer-to-peer low-latency video, studio audio, screen share, and synchronized Monaco code editor in your browser.",
  keywords: ["WebRTC", "Pair Programming", "Monaco Editor", "Collaborative Code", "Screen Share", "Next.js", "P2P"],
  authors: [{ name: "Harkirat Singh" }],
  openGraph: {
    title: "PairCraft — Real-Time WebRTC Collaborative IDE",
    description: "Direct peer-to-peer low-latency video, studio audio, screen share, and synchronized Monaco code editor.",
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
      <body className="min-h-full flex flex-col bg-[#09090b] text-zinc-100 font-sans selection:bg-zinc-800">
        {children}
      </body>
    </html>
  );
}
