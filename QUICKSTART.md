# Hush + libtaior: Guía rápida de inicio

## Setup en 5 minutos

### **Paso 1: Compilar libtaior WASM**

```bash
cd /Users/livrasand/Documents/GitHub/libtaior
chmod +x build-wasm.sh
./build-wasm.sh
```

### **Paso 2: Instalar en Hush**

```bash
cd /Users/livrasand/Documents/GitHub/Hush
npm install ../libtaior/pkg
npm install
```

### **Paso 3: Ejecutar**

```bash
npm run dev
```

Abrir http://localhost:5173

---

## Uso básico

### **Crear room**
1. Click "Generate" para generar key aleatoria
2. Click "Join / Switch"
3. Compartir key con otros usuarios

### **Unirse a room**
1. Pegar key compartida
2. Click "Join / Switch"
3. Empezar a chatear

### **Modo privado**
- ✅ Activar "Reinforced privacy" para routing multi-hop
- Latencia aumenta, privacidad mejora

---

## Testing P2P (opcional)

### **Iniciar signaling server**

```bash
cd /Users/livrasand/Documents/GitHub/Hush
npm install ws @types/ws
node src/lib/signaling-server.ts
```

### **Cambiar a WebRTC**

Editar `src/lib/chat.ts` línea 41:

```typescript
// Cambiar de:
const transport = new BroadcastChannelTransport({ roomKey, peerId });

// A:
import { WebRTCTransport } from './webrtc-transport';
const transport = new WebRTCTransport({
  roomKey,
  peerId,
  signalingServer: 'ws://localhost:8080'
});
```

Reiniciar `npm run dev` y probar en dos navegadores diferentes.

---

## Troubleshooting

### **Error: Cannot find module 'libtaior-wasm'**
- Compilar WASM primero (Paso 1)
- Verificar que existe `libtaior/pkg/`

### **Mensajes no sincronizan**
- Verificar que ambos usuarios están en el mismo room
- Revisar consola del navegador para errores

### **WebRTC no conecta**
- Verificar que signaling server está corriendo
- Revisar firewall/NAT
- Probar con STUN público: `stun:stun.l.google.com:19302`

---

## Siguiente nivel

Ver `INTEGRATION.md` para arquitectura completa y opciones avanzadas.
