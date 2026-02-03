# Hush Messenger

**Experimental P2P messaging with AORP integration**

⚠️ **EXPERIMENTAL PROTOTYPE – DO NOT USE FOR REAL ANONYMITY** ⚠️

Small private rooms, ephemeral identities, no accounts. Built with SvelteKit + Yjs + libtaior.

**Read `LIMITATIONS.md` before using.**

## Features

✅ **P2P Direct**: WebRTC connections, no central servers  
⚠️ **AORP Integration**: libtaior WASM for encryption (routing limited by WebRTC)  
✅ **Local-First**: Yjs CRDT, works offline  
✅ **Ephemeral IDs**: `taior://` addresses, no persistent accounts  
⚠️ **Privacy Modes**: Fast/Mix (variable encryption, DOES NOT hide IP)  
⚠️ **Cover Traffic**: Simulated (no real mixing)

### ⚠️ Critical Limitations

- **WebRTC exposes your real IP** during ICE handshake
- **No relay nodes** – direct P2P connections (no anonymous routing)
- **Signaling server sees connection metadata**
- **Only E2E encryption, NO route anonymity**

**See `LIMITATIONS.md` for full details.**

## Quick start

```bash
# 1. Compile libtaior WASM (first time only)
cd ../libtaior
./build-wasm.sh

# 2. Install and run Hush
cd ../Hush
npm install ../libtaior/pkg
npm install
npm run dev

# 3. Open http://localhost:5173
```

## Architecture

- **Frontend**: SvelteKit + Flowbite + Tailwind
- **Sync**: Yjs CRDT (conflict-free replicated data)
- **Transport**: BroadcastChannel (local) or WebRTC (P2P)
- **Routing**: libtaior WASM (AORP anonymous routing)
- **Crypto**: ChaCha20-Poly1305 + X25519 (via libtaior)

## Transport modes

### **Local-only** (default)
- Uses BroadcastChannel
- Syncs between tabs in the same browser
- No network traffic
- Good for: Development, testing

### **P2P WebRTC** (production)
- Direct browser-to-browser connections
- Requires signaling server for handshake
- All messages encrypted end-to-end
- Good for: Real private communication

To enable P2P, see `INTEGRATION.md` → "Transport configuration"

## Privacy modes

- **Fast**: 1–2 hops, ~50ms latency, basic anonymity
- **Mix** (Reinforced): 4–5 hops, ~500ms latency, high anonymity + cover traffic
- **Adaptive**: Dynamic 2–3 hops based on network conditions

Toggle "Reinforced privacy" in the UI to switch between Fast and Mix.

## Documentation

- **`QUICKSTART.md`**: 5-minute setup guide
- **`INTEGRATION.md`**: Complete architecture and P2P setup
- **`../libtaior/README.md`**: libtaior routing library
- **`../taior-protocol/`**: Protocol specification

## Controls

- **Generate**: Create random room key
- **Join/Switch**: Connect to room
- **Reinforced privacy**: Enable Mix mode (multi-hop + cover traffic)

## Security notes

🔴 **EXPERIMENTAL PROTOTYPE – DO NOT USE FOR REAL PRIVACY**

### What Hush does NOT do:
- ❌ **Does NOT hide your IP** (WebRTC exposes it)
- ❌ **Does NOT provide route anonymity** (only E2E encryption)
- ❌ **Does NOT have relay nodes** (direct P2P connections)
- ❌ **Has NOT been audited** by security experts

### What Hush DOES do:
- ✅ **E2E encryption** with libtaior (ChaCha20-Poly1305)
- ✅ **Direct P2P** without a central message server
- ✅ **Ephemeral identities** without persistent accounts
- ✅ **CRDT sync** for conflict resolution

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

### Implemented (✅)
- [x] Local sync with Yjs + BroadcastChannel
- [x] libtaior WASM bindings and encryption
- [x] WebRTC P2P transport
- [x] Real integration of libtaior.send()
- [x] Basic DHT for discovery
- [x] Cover traffic (simulated)

### Current limitations (⚠️)
- [ ] Relay nodes (requires native QUIC)
- [ ] Real multi-hop anonymous routing
- [ ] IP hiding (blocked by WebRTC)
- [ ] Distributed DHT (hardcoded bootstrap)
- [ ] Cover traffic with real mixing

### Future roadmap (🛣️)
- [ ] Native app (Tauri + QUIC)
- [ ] Relay node network
- [ ] Security audit
- [ ] Full AORP spec compliance

## License

**Experimental research project – NOT production ready**

See individual component licenses:
- **Hush**: MIT (experimental, no guarantees)
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
