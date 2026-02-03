# Changelog

All notable changes to Hush will be documented in this file.

## [0.2.0] - 2026-02-02

### 🎉 Major Release: Native App with Real AORP Routing

This release represents a complete architectural overhaul from browser-based WebRTC to native Tauri application with genuine anonymous routing.

### Added
- **Native Tauri application** for Windows, macOS, Linux, Android (beta), iOS (beta)
- **QUIC transport layer** using quinn for low-latency, encrypted connections
- **Real AORP routing** with multi-hop relay nodes (3-5 hops)
- **IP privacy** - user IPs hidden behind relay network
- **Direct libtaior integration** without WASM overhead
- **Relay node infrastructure** with configurable relay discovery
- **Native cover traffic** generation (not simulated)
- Backend Rust modules:
  - `taior_bridge.rs` - Direct libtaior API
  - `quic_transport.rs` - QUIC client implementation
  - `relay_client.rs` - Relay discovery and management
- Frontend Tauri adapters:
  - `tauri-taior.ts` - Tauri API wrapper
  - `quic-transport.ts` - QUIC transport client
  - `chat-tauri.ts` - Chat logic for native app
- Comprehensive migration documentation (`MIGRATION_TAURI.md`)
- Setup automation script (`setup-tauri.sh`)

### Changed
- **Architecture**: Browser WebRTC → Native Tauri + QUIC
- **Transport**: P2P direct → Multi-hop relay network
- **Routing**: E2E encryption only → Full AORP anonymous routing
- **Platform**: Web only → Cross-platform native apps
- **Binary size**: N/A → ~5 MB optimized builds
- Version bumped from 0.1.0 to 0.2.0

### Fixed
- ✅ **IP exposure** - Now hidden behind relay nodes
- ✅ **No anonymous routing** - Now implements real AORP
- ✅ **WebRTC limitations** - Replaced with QUIC
- ✅ **Browser-only** - Now supports all major platforms

### Security Improvements
- Real IP addresses never exposed to peers
- Multi-hop routing prevents traffic correlation
- Cover traffic hides communication patterns
- TLS 1.3 encryption mandatory (QUIC built-in)
- Ephemeral relay connections with no persistent state

### Performance
- Latency: ~200-500ms (Fast mode: ~100ms, Mix mode: ~500ms)
- Throughput: Limited by relay network capacity
- Binary size: ~5 MB (vs 150+ MB for Electron)
- Memory usage: ~50-100 MB (vs 200+ MB for browser)

### Breaking Changes
- **API Changes**: `createTaiorClient()` → `createTauriTaiorClient()`
- **Session Creation**: `createSession()` → `createTauriSession()`
- **Transport**: WebRTC removed, QUIC required
- **Deployment**: Browser version deprecated for production use

### Migration Guide
See `MIGRATION_TAURI.md` for complete migration instructions.

### Known Issues
- Relay network limited to 2 public nodes (needs expansion)
- DHT discovery not yet implemented (hardcoded bootstrap)
- Mobile support in beta (Tauri 2.0-rc)
- No security audit yet

### Deprecations
- WebRTC transport (still available for development)
- WASM bindings for browser (native Rust preferred)
- Signaling server (replaced by relay nodes)

---

## [0.1.0] - 2025-12-15

### Initial Release - Browser Prototype

### Added
- Browser-based P2P messaging with WebRTC
- Yjs CRDT for conflict-free synchronization
- libtaior WASM integration for encryption
- BroadcastChannel for local testing
- Ephemeral identities (taior:// addresses)
- Basic UI with Svelte + Flowbite
- Room-based chat with key generation
- Local storage with encryption
- Cover traffic simulation

### Limitations
- ⚠️ WebRTC exposes real IP addresses
- ⚠️ No anonymous routing (E2E encryption only)
- ⚠️ Browser-only (no native apps)
- ⚠️ Cover traffic simulated (not real)
- ⚠️ Direct P2P (no relay nodes)

### Known Issues
- IP exposure during ICE handshake
- Signaling server sees connection metadata
- NAT traversal requires STUN/TURN
- Limited to browser environment

---

## Version Format

This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR**: Incompatible API changes
- **MINOR**: New functionality (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

## Links

- [Repository](https://github.com/taiorproject/Hush)
- [AORP Specification](https://github.com/taiorproject/aorp-spec)
- [libtaior](https://github.com/taiorproject/libtaior)
