# Hush Messenger

**Private P2P messaging with anonymous routing**

Small private rooms, ephemeral identities, no accounts. Built with SvelteKit + Yjs + libtaior.

## Features

✅ **P2P Direct**: WebRTC connections, no central servers  
✅ **Anonymous Routing**: libtaior AORP multi-hop encryption  
✅ **Local-First**: Yjs CRDT, works offline  
✅ **Ephemeral IDs**: `taior://` addresses, no persistent accounts  
✅ **Configurable Privacy**: Fast mode (low latency) or Mix mode (high privacy)  
✅ **No Metadata Leakage**: Cover traffic, padding, timing obfuscation

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
- Syncs between tabs in same browser
- No network traffic
- Good for: Development, testing

### **P2P WebRTC** (production)
- Direct browser-to-browser connections
- Requires signaling server for handshake
- All messages encrypted end-to-end
- Good for: Real private communication

To enable P2P, see `INTEGRATION.md` → "Configuración de transporte"

## Privacy modes

- **Fast**: 1-2 hops, ~50ms latency, basic anonymity
- **Mix** (Reinforced): 4-5 hops, ~500ms latency, high anonymity + cover traffic
- **Adaptive**: Dynamic 2-3 hops based on network conditions

Toggle "Reinforced privacy" in UI to switch between Fast and Mix.

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

⚠️ **Experimental prototype**: Not audited, not production-ready  
⚠️ **Threat model**: See `INTEGRATION.md` → "Modelo de amenazas"  
⚠️ **Signaling server**: Sees connection metadata during WebRTC handshake  
⚠️ **Local storage**: Messages stored unencrypted in browser localStorage

## Status

- [x] Local sync with Yjs + BroadcastChannel
- [x] libtaior WASM bindings
- [x] WebRTC P2P transport
- [x] Taior routing integration
- [ ] WASM compilation tested
- [ ] P2P tested between devices
- [ ] Public signaling server
- [ ] DHT-based peer discovery
- [ ] Native app (Tauri + QUIC)

## License

Experimental research project. See individual component licenses:
- libtaior: AGPL-3.0-or-later
- Taior docs: CC BY-NC-SA 4.0
