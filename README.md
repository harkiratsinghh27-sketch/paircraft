# PairCraft

A low-latency, peer-to-peer pair programming environment built with WebRTC DataChannels, custom Web Audio DSP, and Monaco.

PairCraft establishes direct browser-to-browser data channels for keystroke and cursor synchronization, bypassing central databases and servers for editor state. Media streams (audio, webcam, screen share) travel directly between peers over encrypted SRTP/DTLS.

---

## Technical Highlights

### 1. Peer-to-Peer Data Channels (`RTCDataChannel`)
- Keystrokes, cursor positions, and chat messages transmit directly over unordered/reliable SCTP data channels.
- Round-trip latency is typically within 5–25ms on local/metro networks without relay hop overhead.
- Fallback WebSocket signaling relay triggers automatically only during initial ICE gathering or in restrictive NAT environments.

### 2. Web Audio DSP & Voice Processing Pipeline
Audio streams pass through an in-browser Web Audio API signal processing chain before WebRTC encoding:
- **Highpass Filter:** 90Hz cutoff (Butterworth response) to eliminate mechanical keyboard desk rumble.
- **Lowpass / Bandpass Filter:** 3.8kHz cutoff with $Q = 0.707$ to cut high-frequency metallic hiss and coil whine.
- **Dynamics Compressor:** Multi-stage compression acting as an Automatic Gain Control (AGC) and soft noise gate.
- **Echo Guard:** Remote loopback protection to prevent acoustic feedback during single-machine testing.
- **Opus SDP Tuning:** Injected session parameters (`minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=48000`) for low packetization delay and forward error correction.

### 3. Client-Side Code Execution Engine
- Monaco Editor running custom dark tokens matching a 9-step zinc scale.
- TypeScript transpilation executed on the client using `@sucrase` in sub-millisecond time (< 4ms), avoiding expensive remote container spin-up for rapid iterative testing.
- Multi-language syntax support: TypeScript, JavaScript, Python, Rust, Go.

---

## Architecture Overview

```
[ Peer A (Browser) ] <============ Encrypted WebRTC P2P Mesh ============> [ Peer B (Browser) ]
         |            - Video / Audio (Opus 48kHz / VP8)                           |
         |            - Low-Latency RTCDataChannel (Keystrokes, Cursors, Chat)      |
         |                                                                         |
         +------------------------+                     +--------------------------+
                                  |                     |
                                  v                     v
                        [ Node.js WebSocket Signaling Gateway (:3001) ]
                                  - SDP Offer/Answer Relay
                                  - STUN ICE Candidate Exchange
                                  - Heartbeat Telemetry & Room State
```

---

## Getting Started

### Prerequisites
- Node.js 18.17+ or 20+
- npm, pnpm, or bun

### Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/paircraft.git
   cd paircraft
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development servers:**
   ```bash
   npm run dev
   ```
   This concurrently boots:
   - Next.js Turbopack client: `http://localhost:3000`
   - Signaling gateway: `ws://localhost:3001` (Health: `http://localhost:3001/health`)

4. **Verify Split-Screen Collaboration:**
   - Open `http://localhost:3000` in Chrome and create a session.
   - Copy the room URL and open it in a second window or an incognito tab.
   - Verify low-latency peer connection (`P2P Direct` green pill), real-time typing sync, and chat alerts.

---

## Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SIGNALING_URL` | `ws://localhost:3001` | Public WebSocket endpoint for the signaling gateway in production |
| `PORT` | `3001` | Port for the standalone signaling server (`server.js`) |

---

## Production Deployment

### Frontend (Vercel)
The client is a standard Next.js 16 App Router application:
```bash
npx vercel
```
Or import the repository directly in the Vercel dashboard.

### Signaling Gateway (Render / Railway / Fly.io / VPS)
Run the lightweight signaling gateway:
```bash
node server.js
```
Then configure `NEXT_PUBLIC_SIGNALING_URL=wss://<your-signaling-host>` in your frontend environment settings.

---

## License
MIT
