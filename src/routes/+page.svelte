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

<div class="h-screen flex flex-col bg-app text-[var(--text)] overflow-hidden">
  <!-- Header compacto estilo Signal -->
  <header class="flex-shrink-0 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="size-9 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center font-bold text-base shadow-sm">H</div>
        <h1 class="text-lg font-semibold">Hush</h1>
      </div>

      <div class="flex items-center gap-2">
        <div class="hidden md:flex items-center gap-2 bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-1.5">
          <svg class="w-4 h-4 muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" /></svg>
          <input
            type="search"
            placeholder="Buscar"
            class="bg-transparent text-sm focus:outline-none w-32"
            bind:value={$searchQuery}
          />
        </div>
        
        <button
          type="button"
          class="p-2 hover:bg-[var(--surface-muted)] rounded-lg transition-colors"
          on:click={openProfile}
          aria-label="Configuración"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  </header>

  <!-- Layout principal: Sidebar + Chat -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Sidebar de conversaciones (estilo Signal/Session) -->
    <aside class="hidden md:flex flex-col w-80 bg-[var(--surface)] border-r border-[var(--border)]">
      <!-- Nueva conversación -->
      <div class="p-3 border-b border-[var(--border)]">
        <button
          type="button"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] transition-colors font-medium"
          on:click={openSheet}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Nueva conversación
        </button>
      </div>

      <!-- Lista de conversaciones -->
      <div class="flex-1 overflow-y-auto">
        {#if $roomHistory.length === 0}
          <div class="p-4 text-center">
            <div class="text-sm muted">No hay conversaciones</div>
            <div class="text-xs muted mt-1">Crea o únete a una sala</div>
          </div>
        {:else}
          {#each $roomHistory as room}
            <button
              type="button"
              class="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-muted)] transition-colors border-b border-[var(--border)] {$roomKey === room ? 'bg-[var(--surface-muted)]' : ''}"
              on:click={() => { roomKey.set(room); join(); }}
            >
              <div class="size-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center font-semibold text-[var(--accent)] flex-shrink-0">
                {room[0]}
              </div>
              <div class="flex-1 text-left min-w-0">
                <div class="font-medium truncate">{room}</div>
                <div class="text-xs muted truncate">Sala P2P</div>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      <!-- Info de conexión en sidebar -->
      <div class="p-3 border-t border-[var(--border)] bg-[var(--surface-muted)]">
        <div class="flex items-center gap-2 text-xs">
          {#if $connected}
            <span class="size-2 rounded-full bg-green-500"></span>
            <span class="text-green-600 dark:text-green-400 font-medium">Conectado</span>
          {:else}
            <Spinner size="3" />
            <span class="muted">Conectando...</span>
          {/if}
        </div>
      </div>
    </aside>

    <!-- Área de chat principal -->
    <main class="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
      {#if $joined}
        <!-- Header del chat activo -->
        <div class="flex-shrink-0 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="md:hidden p-2 -ml-2 hover:bg-[var(--surface-muted)] rounded-lg"
                on:click={openSheet}
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div class="size-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center font-semibold text-[var(--accent)]">
                {($roomKey || 'R')[0]}
              </div>
              <div>
                <div class="font-semibold">{$roomKey || 'Sala'}</div>
                <div class="text-xs muted flex items-center gap-1.5">
                  <span class="size-1.5 rounded-full" style={`background:${$connected ? '#22c55e' : '#facc15'}`}></span>
                  {$connected ? 'Activo' : 'Conectando'}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="p-2 hover:bg-[var(--surface-muted)] rounded-lg transition-colors"
                on:click={startRoom}
                aria-label="Nueva sala"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Mensajes -->
        <div class="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {#each $filteredMessages as message (message.id)}
            <div class={`flex ${message.senderId === $hushIdStore ? 'justify-end' : 'justify-start'}`}>
              <div class={`flex gap-2 max-w-[75%] ${message.senderId === $hushIdStore ? 'flex-row-reverse' : 'flex-row'}`}>
                {#if message.senderId !== $hushIdStore}
                  <div class="size-8 rounded-full bg-[var(--surface-muted)] flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-1">
                    {message.alias[0]?.toUpperCase()}
                  </div>
                {/if}
                <div class="flex flex-col gap-1">
                  {#if message.senderId !== $hushIdStore}
                    <div class="text-xs font-medium px-3">{message.alias}</div>
                  {/if}
                  <div class={`rounded-2xl px-4 py-2 ${message.senderId === $hushIdStore ? 'bubble-self rounded-tr-sm' : 'bubble-other rounded-tl-sm'}`}>
                    <p class="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-[11px] opacity-70">{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {#if message.reinforced}
                        <span class="text-[10px] opacity-60">🔒</span>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/each}

          {#if $filteredMessages.length === 0}
            <div class="flex items-center justify-center h-full">
              <div class="text-center">
                <div class="size-16 rounded-full bg-[var(--surface-muted)] flex items-center justify-center mx-auto mb-3">
                  <svg class="w-8 h-8 muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div class="text-sm muted">No hay mensajes</div>
                <div class="text-xs muted mt-1">Envía el primer mensaje</div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Input de mensaje -->
        <form class="flex-shrink-0 bg-[var(--surface)] border-t border-[var(--border)] px-4 py-3" on:submit={send}>
          <div class="flex items-end gap-2">
            <div class="flex-1 bg-[var(--surface-muted)] rounded-2xl border border-[var(--border)] px-4 py-2.5 focus-within:border-[var(--accent)] transition-colors">
              <input
                name="message"
                placeholder="Escribe un mensaje..."
                required
                class="w-full bg-transparent text-[15px] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              class="p-3 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white rounded-full transition-colors flex-shrink-0"
              aria-label="Enviar mensaje"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          {#if $reinforced}
            <div class="flex items-center gap-1.5 mt-2 text-xs text-green-600 dark:text-green-400">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
              </svg>
              <span>Privacidad reforzada activada</span>
            </div>
          {/if}
        </form>
      {:else}
        <!-- Estado vacío -->
        <div class="flex-1 flex items-center justify-center p-8">
          <div class="text-center max-w-md">
            <div class="size-20 rounded-full bg-[var(--surface)] border-2 border-[var(--border)] flex items-center justify-center mx-auto mb-4">
              <svg class="w-10 h-10 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 class="text-xl font-semibold mb-2">Bienvenido a Hush</h2>
            <p class="text-sm muted mb-6">Mensajería privada y segura con cifrado P2P. Crea o únete a una sala para comenzar.</p>
            <div class="flex flex-col sm:flex-row gap-3 justify-center">
              <Button color="light" on:click={openSheet} class="flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Nueva sala
              </Button>
              <Button on:click={openSheet} class="flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Unirse
              </Button>
            </div>
          </div>
        </div>
      {/if}
    </main>
  </div>

  <button
    class="fixed bottom-6 right-6 md:hidden rounded-full bg-[var(--accent)] text-white shadow-lg size-14 flex items-center justify-center"
    on:click={openSheet}
    aria-label="Nueva conversación"
  >
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
    </svg>
  </button>

  {#if $showSheet}
    <div
      class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      on:click|self={closeSheet}
      on:keydown={(e) => e.key === 'Escape' && closeSheet()}
      role="presentation"
      tabindex="-1"
    >
      <div
        class="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Nueva conversación</h3>
          <button
            type="button"
            class="p-2 hover:bg-[var(--surface-muted)] rounded-lg transition-colors"
            on:click={closeSheet}
            aria-label="Cerrar"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-3">
          <div class="space-y-2">
            <Label for="room-modal" class="text-sm font-medium">Clave de sala</Label>
            <div class="flex gap-2">
              <input
                id="room-modal"
                name="room-modal"
                bind:value={$roomKey}
                on:input={handleRoomInput}
                placeholder="ABCDEF1234"
                required
                class="flex-1 rounded-lg input-surface px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
              />
              <Button type="button" color="light" on:click={startRoom} class="whitespace-nowrap">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="alias-modal" class="text-sm font-medium">Tu nombre</Label>
            <input
              id="alias-modal"
              name="alias-modal"
              bind:value={$alias}
              placeholder="anon"
              class="w-full rounded-lg input-surface px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div class="flex items-center gap-3 rounded-lg bg-[var(--surface-muted)] px-4 py-3 border border-[var(--border)]">
            <Checkbox bind:checked={$reinforced} id="reinforced-modal" name="reinforced-modal" />
            <div class="flex-1">
              <Label for="reinforced-modal" class="text-sm font-medium">Privacidad reforzada</Label>
              <div class="text-xs muted mt-0.5">Mayor protección, menor velocidad</div>
            </div>
            <Badge color={$reinforced ? 'green' : 'dark'} class="text-xs">{$reinforced ? 'On' : 'Off'}</Badge>
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <Button type="button" class="flex-1" color="light" on:click={closeSheet}>Cancelar</Button>
          <Button type="button" class="flex-1" color="blue" on:click={() => { join(); closeSheet(); }}>
            Unirse
          </Button>
        </div>
      </div>
    </div>
  {/if}

  {#if $showProfile}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4 z-50" role="dialog" aria-modal="true">
      <div class="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold">Configuración</h2>
            <p class="text-sm muted mt-1">Ajustes y cuenta</p>
          </div>
          <button
            type="button"
            class="p-2 hover:bg-[var(--surface-muted)] rounded-lg transition-colors"
            on:click={closeProfile}
            aria-label="Cerrar"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
