<script lang="ts">
  import { page } from '$app/stores';
  import { createSession, generateRoomKey, type ChatMessage, type ChatSession } from '$lib/chat';
  import { onDestroy, onMount } from 'svelte';
  import { derived, get, writable } from 'svelte/store';
  import Button from 'flowbite-svelte/Button.svelte';
  import Checkbox from 'flowbite-svelte/Checkbox.svelte';
  import Label from 'flowbite-svelte/Label.svelte';
  import Badge from 'flowbite-svelte/Badge.svelte';
  import Spinner from 'flowbite-svelte/Spinner.svelte';

  const params = derived(page, ($p) => $p.url.searchParams);
  const hushIdStore = writable('');
  const alias = writable('');
  const roomKey = writable('');
  const reinforced = writable(false);
  const theme = writable<'light' | 'dark' | 'system'>('system');
  const roomHistory = writable<string[]>([]);
  const showSheet = writable(false);
  const joined = writable(false);
  const showProfile = writable(false);
  const searchQuery = writable('');
  const recoveryKey = writable('');

  const messages = writable<ChatMessage[]>([]);
  const connected = writable(false);
  const filteredMessages = derived([messages, searchQuery], ([$m, $q]) => {
    const term = $q.trim().toLowerCase();
    if (!term) return $m;
    return $m.filter((msg) => msg.text.toLowerCase().includes(term) || msg.alias.toLowerCase().includes(term));
  });

  let session: ChatSession | null = null;

  const applyTheme = (value: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;
    root.setAttribute('data-theme', value);
    theme.set(value);
  };

  onMount(() => {
    const stored = localStorage.getItem('hush-theme') as 'light' | 'dark' | 'system' | null;
    if (stored) {
      applyTheme(stored);
    } else {
      applyTheme('system');
    }
  });

  const bindSession = (s: ChatSession) => {
    s.messages.subscribe(messages.set);
    s.connected.subscribe(connected.set);
  };

  const ensureHushId = () => {
    const key = 'hush-id';
    const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const value = existing || crypto.randomUUID().slice(0, 12);
    if (typeof localStorage !== 'undefined' && !existing) {
      localStorage.setItem(key, value);
    }
    hushIdStore.set(value);
    return value;
  };

  const regenerateHushId = () => {
    const key = 'hush-id';
    const value = crypto.randomUUID().slice(0, 12);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    hushIdStore.set(value);
  };

  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    applyTheme(value);
    localStorage.setItem('hush-theme', value);
  };

  const handleThemeSelect = (event: Event) => {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    handleThemeChange(target.value as 'light' | 'dark' | 'system');
  };

  const ensureRecoveryKey = () => {
    const key = 'hush-recovery-key';
    const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const value = existing || crypto.randomUUID();
    if (typeof localStorage !== 'undefined' && !existing) {
      localStorage.setItem(key, value);
    }
    recoveryKey.set(value);
    return value;
  };

  const loadRoomHistory = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('hush-room-history');
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      roomHistory.set(parsed);
    } catch (err) {
      console.warn('Failed to load room history', err);
    }
  };

  const saveRoomHistory = (list: string[]) => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('hush-room-history', JSON.stringify(list.slice(0, 10)));
    } catch (err) {
      console.warn('Failed to save room history', err);
    }
  };

  const pushRoomHistory = (room: string) => {
    const val = room.trim().toUpperCase();
    if (!val) return;
    const current = get(roomHistory);
    const next = [val, ...current.filter((r) => r !== val)].slice(0, 10);
    roomHistory.set(next);
    saveRoomHistory(next);
  };

  onMount(async () => {
    const hid = ensureHushId();
    loadRoomHistory();
    ensureRecoveryKey();
    const s = await createSession('LOBBY', 'system', hid);
    session = s;
    bindSession(s);
    joined.set(false);
  });

  $: {
    const r = get(params).get('room');
    if (r) {
      roomKey.set(r.toUpperCase());
    }
  }

  const setRoom = (value: string) => {
    roomKey.set(value.toUpperCase());
  };

  const handleRoomInput = (event: Event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    setRoom(target.value);
  };

  const startRoom = () => {
    const key = generateRoomKey();
    roomKey.set(key);
  };

  const join = async () => {
    const keyVal = get(roomKey).trim();
    if (!keyVal) return;
    const aliasVal = (get(alias) || 'anon').trim() || 'anon';
    const hid = get(hushIdStore) || ensureHushId();
    if (session) {
      session.disconnect();
    }
    session = await createSession(keyVal, aliasVal, hid);
    bindSession(session);
    pushRoomHistory(keyVal);
    joined.set(true);
  };

  const send = (event: SubmitEvent) => {
    event.preventDefault();
    if (!session) return;
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const text = (formData.get('message') as string) || '';
    const reinforcedVal = get(reinforced);
    session.sendMessage(text, reinforcedVal);
    form.reset();
  };

  const openSheet = () => showSheet.set(true);
  const closeSheet = () => showSheet.set(false);
  const openProfile = () => showProfile.set(true);
  const closeProfile = () => showProfile.set(false);

  const copyText = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
    } catch (err) {
      console.warn('No se pudo copiar', err);
    }
  };

  const shareText = async (text: string) => {
    if (!text) return;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        console.warn('Share cancelado', e);
      }
    }
    copyText(text);
  };

  onDestroy(() => {
    if (session) {
      session.disconnect();
    }
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="min-h-screen bg-app text-[var(--text)]">
  <div class="mx-auto max-w-5xl px-4 py-10 space-y-6">
    <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div class="flex items-center gap-3">
        <div class="size-11 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center font-semibold text-lg shadow-sm">H</div>
        <div>
          <div class="text-lg font-semibold leading-tight">Hush</div>
          <div class="flex gap-2 text-xs muted mt-1">
            <span class="pill px-2 py-1 rounded-full">P2P</span>
            <span class="pill px-2 py-1 rounded-full">Privado</span>
            <span class="pill px-2 py-1 rounded-full">WASM</span>
          </div>
        </div>
      </div>

      <div class="flex flex-col md:flex-row gap-3 md:items-center">
        <div class="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-2 shadow-sm min-w-[220px]">
          <svg class="w-4 h-4 muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" /></svg>
          <input
            type="search"
            placeholder="Buscar en chat"
            class="bg-transparent text-sm focus:outline-none w-full"
            bind:value={$searchQuery}
          />
        </div>
        <div class="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-2 shadow-sm">
          <span class="text-sm muted">Tema</span>
          <select
            class="text-sm bg-transparent focus:outline-none"
            bind:value={$theme}
            on:change={handleThemeSelect}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>
        <button
          type="button"
          class="relative size-11 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-sm font-semibold"
          on:click={openProfile}
          aria-label="Abrir perfil"
        >
          {$alias ? $alias[0]?.toUpperCase() : 'P'}
          <span class="absolute -right-1 -top-1 size-2 rounded-full bg-[var(--accent)]"></span>
        </button>
      </div>
    </header>

    <div class="grid lg:grid-cols-[340px,1fr] gap-4 items-start">
      <div class="card-surface rounded-2xl p-5 space-y-4 hidden md:block">
        <div class="flex items-center gap-3">
          <div class="size-10 rounded-full bg-[var(--surface-muted)] flex items-center justify-center font-semibold text-[var(--accent)]">
            {$alias ? $alias[0]?.toUpperCase() : 'A'}
          </div>
          <div>
            <div class="text-sm muted">Hush ID</div>
            <div class="font-mono text-base">{$hushIdStore || '—'}</div>
            <button type="button" class="text-xs text-[var(--accent)] hover:underline" on:click={regenerateHushId}>Generar nuevo</button>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="room">Room key</Label>
          <div class="flex flex-col sm:flex-row gap-2">
            <input
              id="room"
              name="room"
              bind:value={$roomKey}
              on:input={handleRoomInput}
              placeholder="ABCDEF1234"
              required
              class="flex-1 rounded-xl input-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <Button color="light" on:click={startRoom} type="button" class="whitespace-nowrap w-full sm:w-auto">Generar</Button>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="alias">Alias</Label>
          <input
            id="alias"
            name="alias"
            bind:value={$alias}
            placeholder="anon"
            class="w-full rounded-xl input-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        <div class="flex items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-2 border border-[var(--border)]">
          <Checkbox bind:checked={$reinforced} id="reinforced" name="reinforced" />
          <div class="flex-1">
            <Label for="reinforced">Privacidad reforzada</Label>
            <div class="text-xs muted">Más lenta, más blindada</div>
          </div>
          <Badge color={$reinforced ? 'green' : 'dark'}>{$reinforced ? 'On' : 'Off'}</Badge>
        </div>

        <Button type="button" class="w-full" color="blue" on:click={join}>Unirse / Cambiar</Button>

        <div class="rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] p-3 space-y-2">
          <div class="text-xs uppercase tracking-[0.2em] muted">Estado</div>
          <div class="flex items-center gap-2 text-sm">
            {#if $connected}
              <span class="size-2 rounded-full bg-green-500"></span>
              <span>Conectado</span>
            {:else}
              <Spinner size="4" />
              <span class="muted">Esperando peers...</span>
            {/if}
          </div>
          <div class="text-xs muted">Room: {$roomKey || '—'}</div>
        </div>

        <div class="rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] p-3 space-y-3">
          <div class="text-xs uppercase tracking-[0.2em] muted">Historial</div>
          {#if $roomHistory.length === 0}
            <div class="text-xs muted">Sin rooms recientes.</div>
          {:else}
            <div class="flex flex-wrap gap-2">
              {#each $roomHistory as r}
                <button
                  type="button"
                  class="pill px-3 py-1 rounded-full text-sm hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  on:click={() => roomKey.set(r)}
                >
                  {r}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      {#if $joined}
      <div class="card-surface rounded-2xl p-0 flex flex-col min-h-[70vh] overflow-hidden">
        <div class="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="size-10 rounded-full bg-[var(--surface-muted)] flex items-center justify-center font-semibold text-[var(--accent)]">
              {($roomKey || 'R')[0]}
            </div>
            <div>
              <div class="text-lg font-semibold">{$roomKey || 'Room sin nombre'}</div>
              <div class="text-xs muted flex items-center gap-2">
                <span class="size-2 rounded-full" style={`background:${$connected ? '#22c55e' : '#facc15'}`}></span>
                {$connected ? 'Conectado' : 'Conectando'}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="pill px-3 py-1 rounded-full text-xs">{($messages.length || 0)} msgs</span>
            <button type="button" class="text-sm text-[var(--accent)] hover:underline" on:click={startRoom}>Nueva sala</button>
          </div>
        </div>

        <div class="flex-1 chat-bg space-y-3 overflow-y-auto p-5" style="max-height: 60vh;">
          {#each $filteredMessages as message (message.id)}
            <div class={`flex ${message.senderId === $hushIdStore ? 'justify-end' : 'justify-start'}`}>
              <div class={`max-w-[78%] rounded-2xl px-3 py-2 shadow-sm ${message.senderId === $hushIdStore ? 'bubble-self' : 'bubble-other'}`}>
                <div class="flex items-center gap-2 bubble-meta">
                  <span class="font-semibold">{message.alias}</span>
                  <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                {#if message.reinforced}
                  <span class="pill inline-block mt-2 px-2 py-1 rounded-full text-[11px]">Reforzado</span>
                {/if}
              </div>
            </div>
          {/each}

          {#if $filteredMessages.length === 0}
            <div class="text-center muted text-sm py-6">Sin mensajes aún. Envía el primero.</div>
          {/if}
        </div>

        <form class="px-5 py-4 border-t border-[var(--border)] bg-[var(--surface)]" on:submit={send}>
          <div class="flex items-center gap-3">
            <input
              name="message"
              placeholder="Mensaje"
              required
              class="flex-1 chat-input focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <Button type="submit">Enviar</Button>
          </div>
          <div class="text-xs muted mt-1">Mensajes no se guardan en servidor. Clave compartida = sala.</div>
        </form>
      </div>
      {:else}
      <div class="card-surface rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[70vh]">
        <div class="size-16 rounded-full bg-[var(--surface-muted)] flex items-center justify-center text-3xl text-[var(--accent)]">+</div>
        <div>
          <div class="text-xl font-semibold">Abre un chat</div>
          <div class="muted text-sm mt-1">Crea o únete a una sala para empezar a chatear.</div>
        </div>
        <div class="flex gap-2">
          <Button color="light" on:click={startRoom}>Generar clave</Button>
          <Button on:click={join}>Unirse</Button>
        </div>
      </div>
      {/if}
    </div>
  </div>

  <button
    class="fixed bottom-6 right-6 md:hidden rounded-full bg-[var(--accent)] text-white shadow-lg px-4 py-3 text-sm font-semibold flex items-center gap-2"
    on:click={openSheet}
    aria-label="Unirse o crear sala"
  >
    + Sala
  </button>

  {#if $showSheet}
    <div
      class="fixed inset-0 bg-black/40 flex items-end md:hidden"
      on:click|self={closeSheet}
      on:keydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && closeSheet()}
      role="presentation"
      tabindex="-1"
      aria-label="Cerrar panel"
    >
      <div
        class="w-full bg-[var(--surface)] border-t border-[var(--border)] rounded-t-2xl p-4 space-y-3 shadow-2xl"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
      >
        <div class="flex items-center justify-between">
          <div class="font-semibold">Unirse o crear sala</div>
          <button class="text-sm text-[var(--muted)]" on:click={closeSheet}>Cerrar</button>
        </div>

        <div class="space-y-2">
          <Label for="room-mobile">Room key</Label>
          <input
            id="room-mobile"
            name="room-mobile"
            bind:value={$roomKey}
            on:input={handleRoomInput}
            placeholder="ABCDEF1234"
            required
            class="w-full rounded-xl input-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        <div class="space-y-2">
          <Label for="alias-mobile">Alias</Label>
          <input
            id="alias-mobile"
            name="alias-mobile"
            bind:value={$alias}
            placeholder="anon"
            class="w-full rounded-xl input-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        <div class="flex items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-2 border border-[var(--border)]">
          <Checkbox bind:checked={$reinforced} id="reinforced-mobile" name="reinforced-mobile" />
          <div class="flex-1">
            <Label for="reinforced-mobile">Privacidad reforzada</Label>
            <div class="text-xs muted">Más lenta, más blindada</div>
          </div>
          <Badge color={$reinforced ? 'green' : 'dark'}>{$reinforced ? 'On' : 'Off'}</Badge>
        </div>

        <div class="flex gap-2">
          <Button type="button" class="flex-1" color="light" on:click={startRoom}>Generar</Button>
          <Button type="button" class="flex-1" color="blue" on:click={() => { join(); closeSheet(); }}>Unirse / Cambiar</Button>
        </div>
      </div>
    </div>
  {/if}

  {#if $showProfile}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div class="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm uppercase tracking-[0.2em] muted">Perfil</div>
            <div class="text-xl font-semibold">Ajustes y cuenta</div>
          </div>
          <button class="text-sm text-[var(--muted)]" on:click={closeProfile}>Cerrar</button>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <div class="space-y-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] p-3">
            <div class="text-xs uppercase tracking-[0.2em] muted">ID de cuenta</div>
            <div class="font-mono text-sm break-all">{$hushIdStore}</div>
            <div class="flex gap-2">
              <Button color="light" on:click={() => copyText($hushIdStore)}>Copiar</Button>
              <Button color="blue" on:click={() => shareText(`Hola! Estoy usando Hush para chatear con total privacidad y seguridad. Chatea conmigo! Mi ID de cuenta es ${$hushIdStore}`)}>Compartir</Button>
            </div>
            <div class="space-y-1 text-xs muted">
              <div>Invita a un amigo:</div>
              <div class="rounded-lg border border-[var(--border)] p-2 bg-[var(--surface)] text-[var(--text)]">
                Hola! Estoy usando Hush para chatear con total privacidad y seguridad. Chatea conmigo! Mi ID de cuenta es {$hushIdStore}
              </div>
            </div>
          </div>

          <div class="space-y-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] p-3">
            <div class="text-xs uppercase tracking-[0.2em] muted">Clave de recuperación</div>
            <div class="font-mono text-sm break-all">{$recoveryKey}</div>
            <div class="text-xs muted">Guárdala para reinstalar en otro dispositivo.</div>
            <Button color="light" on:click={() => copyText($recoveryKey)}>Copiar clave</Button>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <div class="space-y-2 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] p-3">
            <div class="text-xs uppercase tracking-[0.2em] muted">QR</div>
            <div class="text-xs muted">Escanea para agregar contacto. (Placeholder)</div>
            <div class="aspect-square rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-xs muted">
              QR pronto
            </div>
          </div>

          <div class="space-y-2 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] p-3">
            <div class="text-xs uppercase tracking-[0.2em] muted">Ruta (libtaior)</div>
            <p class="text-sm muted">Hush oculta tu IP enroutando tráfico P2P vía libtaior (repos: libtaior, taior-protocol, taior-URI, aorp-core, aorp-spec). No hay servidores de datos, solo señalización.</p>
            <div class="space-y-1 text-xs">
              <div>• WebRTC + Taior: canal cifrado extremo a extremo.</div>
              <div>• No logging: sin retención de mensajes.</div>
            </div>
            <Button color="light" on:click={() => shareText('Ruta Taior: tu IP se oculta vía libtaior con WebRTC P2P, sin servidores de datos.')}>Compartir ruta</Button>
          </div>
        </div>

        <div class="space-y-2 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] p-3">
          <div class="text-xs uppercase tracking-[0.2em] muted">Taior Network</div>
          <p class="text-sm muted">Taior es la red anónima que enruta paquetes sin revelar IP. Usa WASM (libtaior) y CRDT (Yjs) para chats locales-first. Señalización solo para handshake, sin contenido.</p>
        </div>
      </div>
    </div>
  {/if}
</div>
