# Hush Messenger

**Native P2P messaging with real AORP anonymous routing**

⚠️ **EXPERIMENTAL – Security audit pending** ⚠️

Private rooms, ephemeral identities, no accounts. Built with Tauri + SvelteKit + Yjs + libtaior.

**Version 0.2.0 - Now with native QUIC transport and real IP privacy**

## What's New in v0.2.0

✅ **IP Privacy**: Your real IP is now hidden behind relay nodes  
✅ **Real AORP Routing**: Multi-hop anonymous routing (3-5 hops)  
✅ **Native Apps**: Windows, macOS, Linux, Android (beta), iOS (beta)  
✅ **QUIC Transport**: Fast, encrypted connections with TLS 1.3  
✅ **Real Cover Traffic**: Not simulated anymore  

### Migration from v0.1.0

The browser-based WebRTC version (v0.1.0) is deprecated. See `MIGRATION_TAURI.md` for migration guide.

## Features

✅ **IP Anonymity**: Real IP hidden behind relay network  
✅ **AORP Routing**: Multi-hop routing with 3-5 relay nodes  
✅ **Native Apps**: Cross-platform (5 platforms)  
✅ **Local-First**: Yjs CRDT, works offline  
✅ **Ephemeral IDs**: `taior://` addresses, no persistent accounts  
✅ **Privacy Modes**: Fast/Mix with real cover traffic  
✅ **E2E Encryption**: ChaCha20-Poly1305 + X25519

## Quick Start

### Prerequisites

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Tauri CLI
cargo install tauri-cli --version 2.0.0-rc
```

### Setup and Run

```bash
# 1. Run setup script (compiles libtaior, installs dependencies)
cd Hush
./setup-tauri.sh

# 2. Run Hush (opens native window)
npm run tauri:dev

# 3. Build for production
npm run tauri:build
```

### For Web Version (v0.1.0 - Deprecated)

See `MIGRATION_TAURI.md` for the old WebRTC-based version.

## Architecture

```
┌─────────────────────────────────────────┐
│         Hush Native App (Tauri)         │
│      Frontend: SvelteKit + Svelte      │
├─────────────────────────────────────────┤
│         Backend: Rust + libtaior        │
│  ├─ AORP routing (multi-hop)            │
│  ├─ QUIC transport (TLS 1.3)            │
│  └─ ChaCha20-Poly1305 encryption        │
└─────────────────────────────────────────┘
                    ↓
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   Relay Node 1  Relay 2  Relay Node 3
   (QUIC)        (QUIC)   (QUIC)
```

- **Frontend**: SvelteKit + Flowbite + Tailwind
- **Backend**: Rust with direct libtaior integration
- **Sync**: Yjs CRDT (conflict-free replicated data)
- **Transport**: QUIC (quinn) with relay nodes
- **Routing**: libtaior native (AORP multi-hop routing)
- **Crypto**: ChaCha20-Poly1305 + X25519 + HKDF-SHA256

## Privacy modes

- **Fast**: 1–2 hops, ~50ms latency, basic anonymity
- **Mix** (Reinforced): 4–5 hops, ~500ms latency, high anonymity + cover traffic
- **Adaptive**: Dynamic 2–3 hops based on network conditions

Toggle "Reinforced privacy" in the UI to switch between Fast and Mix.

## Documentation

- **`README-TAURI.md`**: Complete guide for v0.2.0 native app
- **`MIGRATION_TAURI.md`**: Migration guide from v0.1.0 to v0.2.0
- **`CHANGELOG.md`**: Version history and changes
- **`INTEGRATION.md`**: Technical architecture (legacy WebRTC)
- **`../libtaior/README.md`**: libtaior routing library
- **`../aorp-spec/`**: AORP protocol specification
- **`../taior-protocol/`**: Taior protocol documentation

## Controls

- **Generate**: Create random room key
- **Join/Switch**: Connect to room
- **Reinforced privacy**: Enable Mix mode (multi-hop + cover traffic)

## Security Notes

⚠️ **EXPERIMENTAL – Security audit pending**

### What Hush v0.2.0 DOES provide:

- ✅ **IP Anonymity**: Real IP hidden behind relay nodes
- ✅ **Route Anonymity**: Multi-hop AORP routing (3-5 hops)
- ✅ **E2E Encryption**: ChaCha20-Poly1305 with X25519 key exchange
- ✅ **Metadata Protection**: AORP prevents traffic correlation
- ✅ **Cover Traffic**: Real dummy packets hide patterns
- ✅ **Ephemeral Identities**: No persistent accounts or tracking
- ✅ **CRDT Sync**: Conflict-free offline-first messaging

### What Hush v0.2.0 does NOT provide:

- ❌ **Global Adversary Resistance**: Not designed for nation-state threats
- ❌ **Tor-level Anonymity**: Smaller relay network than Tor
- ❌ **Security Audit**: No external security audit yet
- ❌ **Production Guarantees**: Experimental research project

### Security documentation:
- **`LIMITATIONS.md`**: Detailed limitations and threat model
- **`INTEGRATION.md`**: Full technical architecture
- **`../aorp-spec/`**: AORP specification (ideal protocol)
- **`../libtaior/`**: libtaior implementation

### Alternatives for real privacy:
- **Signal**: Metadata hiding, audited, production
- **Briar**: P2P + Tor, censorship resistant
- **Session**: Onion routing without phone numbers

## Status

### v0.2.0 - Implemented (✅)
- [x] Native Tauri application (Windows, macOS, Linux)
- [x] QUIC transport with relay nodes
- [x] Real AORP multi-hop routing
- [x] IP privacy via relay network
- [x] Direct libtaior integration (no WASM)
- [x] Real cover traffic generation
- [x] Local sync with Yjs CRDT
- [x] E2E encryption with ChaCha20-Poly1305

### Beta (⚠️)
- [x] Android support (Tauri 2.0-rc beta)
- [x] iOS support (Tauri 2.0-rc beta)

### Roadmap (🛣️)
- [ ] Expand relay network (currently 2 nodes)
- [ ] DHT for relay discovery
- [ ] Security audit
- [ ] Voice/video calls with AORP routing
- [ ] Full AORP spec compliance
- [ ] Production-ready release (v1.0)

## Comparison: v0.1.0 vs v0.2.0

| Feature | v0.1.0 (WebRTC) | v0.2.0 (Tauri + QUIC) |
|---------|-----------------|------------------------|
| **IP Privacy** | ❌ Exposed | ✅ Hidden |
| **Anonymous Routing** | ❌ No | ✅ Yes (AORP) |
| **Relay Nodes** | ❌ No | ✅ Yes |
| **Platform** | Browser only | Native (5 platforms) |
| **Binary Size** | N/A | ~5 MB |
| **Latency** | ~50ms | ~200-500ms |
| **Cover Traffic** | ⚠️ Simulated | ✅ Real |

## License

**Experimental research project – Security audit pending**

See individual component licenses:
- **Hush**: AGPL-3.0-or-later
- **libtaior**: AGPL-3.0-or-later
- **Taior docs**: CC BY-NC-SA 4.0

## Disclaimer

Hush is an **educational prototype** to demonstrate concepts of:
- End-to-end encryption
- P2P architecture
- WASM integration
- AORP protocol

**Do NOT use for communications requiring real privacy or anonymity.**

The developers are NOT responsible for:
- Loss of privacy
- Metadata exposure
- Information leakage
- Any damage resulting from use

For sensitive communications, use audited tools like Signal, Briar, or Session.
