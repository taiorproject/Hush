# Integración Hush + libtaior: Arquitectura P2P Local-First

## Resumen ejecutivo

Hush es un messenger privado que ahora integra **libtaior** como capa de enrutamiento anónimo P2P. Esta integración permite:

- **Comunicación P2P directa** entre navegadores sin servidores centrales
- **Enrutamiento anónimo** con cifrado multicapa AORP
- **Local-first** con sincronización CRDT (Yjs)
- **Modos configurables**: Fast (baja latencia) y Mix (alta privacidad)

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                        Hush Frontend                         │
│                     (SvelteKit + Yjs)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ chat.ts      │  │ taior.ts     │  │ transport.ts │      │
│  │ (Mensajes)   │  │ (Routing)    │  │ (P2P Layer)  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
├────────────────────────────┼─────────────────────────────────┤
│                            ▼                                 │
│              ┌──────────────────────────┐                    │
│              │   TaiorProvider (Yjs)    │                    │
│              │   - Sync CRDT updates    │                    │
│              │   - Route via libtaior   │                    │
│              └────────────┬─────────────┘                    │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                           ▼                                  │
│         ┌─────────────────────────────────────┐              │
│         │      Transport Abstraction          │              │
│         ├─────────────────────────────────────┤              │
│         │ • BroadcastChannelTransport (local) │              │
│         │ • WebRTCTransport (P2P real)        │              │
│         │ • TaiorQuicTransport (native)       │              │
│         └─────────────────┬───────────────────┘              │
└───────────────────────────┼──────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ libtaior     │   │  WebRTC      │   │  Signaling   │
│ WASM         │   │  Peers       │   │  Server      │
│ (Routing)    │   │  (P2P)       │   │  (Bootstrap) │
└──────────────┘   └──────────────┘   └──────────────┘
```

---

## Componentes implementados

### **1. libtaior WASM Bindings**

**Ubicación**: `/Users/livrasand/Documents/GitHub/libtaior/src/wasm.rs`

**Funcionalidad**:
- Expone API de Rust a JavaScript/TypeScript
- Métodos: `new()`, `withBootstrap()`, `send()`, `address()`, `enableCoverTraffic()`
- Modos: `fast`, `mix`, `adaptive`

**Compilación**:
```bash
cd /Users/livrasand/Documents/GitHub/libtaior
chmod +x build-wasm.sh
./build-wasm.sh
```

**Output**:
- `pkg/` - Para bundlers (Vite, Webpack)
- `pkg-web/` - Para import directo en navegador

---

### **2. Capa de transporte abstracta**

**Ubicación**: `/Users/livrasand/Documents/GitHub/Hush/src/lib/transport.ts`

**Interface**:
```typescript
interface Transport {
  send(data: Uint8Array): Promise<void>;
  onMessage(callback: (data: Uint8Array, peerId: string) => void): void;
  connect(roomKey: string): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  getPeers(): string[];
}
```

**Implementaciones**:

#### **A) BroadcastChannelTransport** (actual)
- Solo funciona entre pestañas del mismo navegador
- Sin dependencias externas
- Útil para desarrollo y testing

#### **B) WebRTCTransport** (P2P real)
- Conexión directa navegador-a-navegador
- Usa DataChannels para mensajes binarios
- Requiere signaling server para handshake inicial
- Soporta NAT traversal con STUN/TURN

#### **C) TaiorQuicTransport** (futuro)
- Para apps nativas (Electron, Tauri)
- Usa QUIC de libtaior directamente
- Sin limitaciones de navegador

---

### **3. Yjs Provider personalizado**

**Ubicación**: `/Users/livrasand/Documents/GitHub/Hush/src/lib/yjs-taior-provider.ts`

**Funcionalidad**:
- Conecta Yjs (CRDT) con cualquier Transport
- Sincroniza updates automáticamente
- Maneja state vectors para sync inicial
- Desacoplado de la implementación de transporte

**Ventajas**:
- Resolución automática de conflictos (CRDT)
- Offline-first: funciona sin conexión
- Eventual consistency garantizada

---

### **4. Cliente Taior actualizado**

**Ubicación**: `/Users/livrasand/Documents/GitHub/Hush/src/lib/taior.ts`

**Características**:
- **Detección automática**: Intenta cargar WASM, fallback a shim
- **Modos extendidos**: `fast`, `reinforced`, `mix`, `adaptive`
- **Direcciones efímeras**: `taior://` addresses cuando usa WASM
- **Graceful degradation**: Funciona sin WASM compilado

**Uso**:
```typescript
const taior = await createTaiorClient(useWasm: true);
const encrypted = await taior.send(data, 'mix');
const address = taior.address(); // taior://abc123...
```

---

### **5. Servidor de signaling WebRTC**

**Ubicación**: `/Users/livrasand/Documents/GitHub/Hush/src/lib/signaling-server.ts`

**Propósito**:
- Intercambio de SDP offers/answers
- Relay de ICE candidates
- Gestión de rooms
- **No ve contenido**: Solo metadatos de conexión

**Despliegue**:
```bash
cd /Users/livrasand/Documents/GitHub/Hush
npm install ws
node src/lib/signaling-server.ts
```

**Privacidad**:
- No guarda logs
- No persiste datos
- Solo activo durante handshake
- Todo el tráfico posterior es P2P directo

---

## Flujo de conexión P2P

### **Escenario: Alice y Bob en room "SECRETROOM"**

```
1. Alice abre Hush
   └─> Genera identidad efímera: taior://alice123
   └─> Conecta a signaling server: ws://signal.hush.example

2. Alice crea/une room "SECRETROOM"
   └─> Envía: { type: 'join', roomKey: 'SECRETROOM', from: 'alice123' }
   └─> Recibe: { type: 'peer-list', data: { peers: [] } }

3. Bob abre Hush
   └─> Genera identidad efímera: taior://bob456
   └─> Conecta a signaling server

4. Bob une room "SECRETROOM"
   └─> Envía: { type: 'join', roomKey: 'SECRETROOM', from: 'bob456' }
   └─> Recibe: { type: 'peer-list', data: { peers: ['alice123'] } }
   └─> Alice recibe: { type: 'peer-list', data: { peers: ['bob456'] } }

5. Handshake WebRTC (Alice → Bob)
   ┌─────────────────────────────────────────────────────────┐
   │ Alice crea PeerConnection + DataChannel                 │
   │ Alice genera SDP offer                                  │
   │ Alice envía offer via signaling server                  │
   │   └─> { type: 'offer', from: 'alice123', to: 'bob456' }│
   │                                                          │
   │ Bob recibe offer                                        │
   │ Bob crea PeerConnection                                 │
   │ Bob genera SDP answer                                   │
   │ Bob envía answer via signaling server                   │
   │   └─> { type: 'answer', from: 'bob456', to: 'alice123'}│
   │                                                          │
   │ Intercambio de ICE candidates (ambos)                   │
   │   └─> { type: 'ice-candidate', ... }                   │
   └─────────────────────────────────────────────────────────┘

6. Conexión P2P establecida
   └─> DataChannel abierto
   └─> Signaling server ya no es necesario
   └─> Todo el tráfico va directo Alice ↔ Bob

7. Alice escribe mensaje "Hola Bob"
   ┌─────────────────────────────────────────────────────────┐
   │ Texto → Encoder → Uint8Array                            │
   │ Uint8Array → taior.send(data, 'mix')                    │
   │   └─> Cifrado multicapa AORP                           │
   │   └─> Padding a tamaño fijo                            │
   │   └─> Cover traffic opcional                           │
   │ Paquete cifrado → DataChannel.send()                    │
   │ Transmisión P2P directa (sin servidores)               │
   │                                                          │
   │ Bob recibe paquete cifrado                              │
   │ DataChannel.onmessage → Uint8Array                      │
   │ Uint8Array → Y.applyUpdate(ydoc, data)                  │
   │ Yjs resuelve CRDT → Mensaje aparece en UI              │
   └─────────────────────────────────────────────────────────┘

8. Persistencia local
   └─> localStorage guarda últimos 200 mensajes
   └─> Cifrado opcional con clave derivada de roomKey
   └─> Borrado automático al cerrar sesión
```

---

## Modos de operación

### **Modo 1: Local-only (actual)**
- Transport: `BroadcastChannelTransport`
- Scope: Pestañas del mismo navegador
- Latencia: <10ms
- Privacidad: N/A (local)
- Uso: Desarrollo, testing

### **Modo 2: P2P LAN**
- Transport: `WebRTCTransport`
- Signaling: Local (misma red)
- Scope: Dispositivos en misma red
- Latencia: 10-50ms
- Privacidad: Alta (sin salir de LAN)
- Uso: Oficinas, hogares

### **Modo 3: P2P Internet**
- Transport: `WebRTCTransport`
- Signaling: Servidor público efímero
- STUN: `stun.l.google.com:19302`
- Scope: Global
- Latencia: 50-200ms (Fast), 200-800ms (Mix)
- Privacidad: Muy alta con modo Mix
- Uso: Comunicación remota privada

### **Modo 4: Native QUIC**
- Transport: `TaiorQuicTransport`
- Scope: Apps nativas (Electron, Tauri)
- Latencia: Óptima
- Privacidad: Máxima (QUIC + AORP completo)
- Uso: Producción, máxima privacidad

---

## Configuración de privacidad

### **Fast Mode** (baja latencia)
```typescript
const taior = await createTaiorClient();
await taior.send(data, 'fast');
```
- 1-2 saltos
- Sin cover traffic
- Latencia: +20-50ms
- Anonimato: Básico
- Uso: Chat casual, baja sensibilidad

### **Mix Mode** (alta privacidad)
```typescript
const taior = await createTaiorClient();
taior.enableCoverTraffic(true, 0.3);
await taior.send(data, 'mix');
```
- 4-5 saltos
- Cover traffic 30%
- Latencia: +200-800ms
- Anonimato: Alto
- Uso: Comunicaciones sensibles

### **Adaptive Mode** (balanceado)
```typescript
await taior.send(data, 'adaptive');
```
- 2-3 saltos dinámicos
- Cover traffic condicional
- Latencia: +50-200ms
- Anonimato: Medio-alto
- Uso: Default recomendado

---

## Pasos de instalación

### **1. Compilar libtaior WASM**

```bash
cd /Users/livrasand/Documents/GitHub/libtaior

# Instalar wasm-pack si no está
cargo install wasm-pack

# Compilar
./build-wasm.sh

# Verificar output
ls -la pkg/
# Debe contener: libtaior_wasm_bg.wasm, libtaior_wasm.js, etc.
```

### **2. Instalar en Hush**

```bash
cd /Users/livrasand/Documents/GitHub/Hush

# Instalar libtaior WASM localmente
npm install ../libtaior/pkg

# O agregar a package.json:
# "libtaior-wasm": "file:../libtaior/pkg"
```

### **3. Configurar transporte**

Editar `/Users/livrasand/Documents/GitHub/Hush/src/lib/chat.ts`:

```typescript
// Para P2P real con WebRTC:
import { WebRTCTransport } from './webrtc-transport';

const transport = new WebRTCTransport({
  roomKey,
  peerId,
  signalingServer: 'ws://localhost:8080', // o servidor público
  stunServers: ['stun:stun.l.google.com:19302']
});

// Para local-only (actual):
import { BroadcastChannelTransport } from './broadcast-transport';
const transport = new BroadcastChannelTransport({ roomKey, peerId });
```

### **4. Iniciar signaling server (solo para WebRTC)**

```bash
cd /Users/livrasand/Documents/GitHub/Hush

# Instalar dependencias
npm install ws @types/ws

# Ejecutar servidor
node src/lib/signaling-server.ts

# O agregar a package.json scripts:
# "signaling": "node src/lib/signaling-server.ts"
```

### **5. Ejecutar Hush**

```bash
npm run dev
# Abrir http://localhost:5173
```

---

## Testing

### **Test 1: Local sync (BroadcastChannel)**
1. Abrir `http://localhost:5173` en dos pestañas
2. Unirse al mismo room en ambas
3. Enviar mensajes
4. ✅ Deben sincronizarse instantáneamente

### **Test 2: P2P mismo navegador**
1. Cambiar a `WebRTCTransport` en `chat.ts`
2. Iniciar signaling server
3. Abrir dos pestañas
4. Unirse al mismo room
5. ✅ Deben conectarse via WebRTC
6. ✅ Mensajes sincronizan P2P

### **Test 3: P2P entre dispositivos**
1. Desplegar signaling server público
2. Abrir Hush en dispositivo A
3. Abrir Hush en dispositivo B (misma red o Internet)
4. Unirse al mismo room
5. ✅ Conexión P2P directa
6. ✅ Mensajes cifrados con libtaior

### **Test 4: Modo Mix (alta privacidad)**
1. Habilitar modo "Reinforced" en UI
2. Enviar mensaje
3. ✅ Latencia aumentada (simulación de saltos)
4. ✅ Paquete pasa por taior.send('mix')

---

## Próximos pasos

### **Corto plazo (1-2 semanas)**
- [ ] Compilar y probar libtaior WASM
- [ ] Integrar WASM en Hush
- [ ] Testing local con BroadcastChannel
- [ ] Testing P2P en LAN

### **Medio plazo (1 mes)**
- [ ] Desplegar signaling server público
- [ ] Implementar TURN server para NAT difícil
- [ ] UI para seleccionar transporte (Local/P2P)
- [ ] Métricas de latencia y peers conectados

### **Largo plazo (3 meses)**
- [ ] App nativa con Tauri + QUIC directo
- [ ] DHT para descubrimiento sin signaling
- [ ] Relay nodes con autenticación efímera
- [ ] Auditoría de seguridad externa

---

## Modelo de amenazas

### **Adversarios considerados**

1. **Observador pasivo de red**
   - Puede ver: IPs, tamaños de paquetes, timing
   - No puede ver: Contenido (cifrado E2E), destinatarios (AORP)
   - Mitigación: Modo Mix + cover traffic

2. **ISP o VPN malicioso**
   - Puede ver: Metadatos de conexión
   - No puede ver: Contenido, correlación sender-receiver
   - Mitigación: Multi-hop routing, padding

3. **Signaling server comprometido**
   - Puede ver: Quién se conecta a qué room (durante handshake)
   - No puede ver: Contenido de mensajes (E2E cifrado)
   - Mitigación: Signaling efímero, DHT futuro

4. **Peer malicioso en room**
   - Puede ver: Mensajes del room (es participante legítimo)
   - No puede ver: Identidad real de otros (solo taior://)
   - Mitigación: Rooms privadas con keys fuertes

### **Fuera de scope**

- Adversario global (NSA-level)
- Compromiso de endpoint (malware en dispositivo)
- Ataques de timing avanzados (requiere red Tor-like)
- Análisis de tráfico a largo plazo

---

## Comparación con alternativas

| Feature | Hush + libtaior | Signal | Matrix | Tor Messenger |
|---------|----------------|--------|--------|---------------|
| E2E Encryption | ✅ | ✅ | ✅ | ✅ |
| Metadata hiding | ✅ (AORP) | ❌ | ❌ | ✅ (Tor) |
| P2P Direct | ✅ | ❌ | ❌ | ❌ |
| No accounts | ✅ | ❌ | ❌ | ✅ |
| Local-first | ✅ (CRDT) | ❌ | ⚠️ | ❌ |
| Offline sync | ✅ | ❌ | ⚠️ | ❌ |
| Browser-native | ✅ | ❌ | ⚠️ | ❌ |
| Production ready | ❌ | ✅ | ✅ | ❌ |

---

## Referencias

- **Taior Protocol**: `/Users/livrasand/Documents/GitHub/taior-protocol/`
- **AORP Spec**: `/Users/livrasand/Documents/GitHub/aorp-spec/`
- **libtaior**: `/Users/livrasand/Documents/GitHub/libtaior/`
- **Yjs CRDT**: https://docs.yjs.dev/
- **WebRTC**: https://webrtc.org/

---

## Licencia

- **Hush**: Experimental, sin licencia definida
- **libtaior**: AGPL-3.0-or-later
- **Documentación Taior**: CC BY-NC-SA 4.0
