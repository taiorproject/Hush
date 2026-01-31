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

  const messages = writable<ChatMessage[]>([]);
  const connected = writable(false);

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
    const s = await createSession('LOBBY', 'system', hid);
    session = s;
    bindSession(s);
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
      <div>
        <p class="uppercase tracking-[0.3em] text-xs muted">Hush Messenger</p>
        <h1 class="text-3xl md:text-4xl font-semibold leading-tight">Conversaciones privadas, efímeras y directas</h1>
        <p class="text-sm md:text-base muted mt-1">Comparte un room key de 10 caracteres. Sin cuentas, sin dueño.</p>
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
    </header>

    <div class="grid lg:grid-cols-[340px,1fr] gap-4 items-start">
      <div class="card-surface rounded-2xl p-5 space-y-4">
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

      <div class="card-surface rounded-2xl p-5 flex flex-col gap-4 min-h-[70vh]">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs uppercase tracking-[0.25em] muted">Chat</div>
            <div class="text-lg font-semibold">{$roomKey || 'Room sin nombre'}</div>
          </div>
          <div class="pill px-3 py-1 rounded-full text-xs flex items-center gap-2">
            <span class="size-2 rounded-full" style={`background:${$connected ? '#22c55e' : '#facc15'}`}></span>
            {$connected ? 'En línea' : 'Conectando'}
          </div>
        </div>

        <div class="flex-1 space-y-3 overflow-y-auto pr-1" style="max-height: 60vh;">
          {#each $messages as message (message.id)}
            <div class={`flex ${message.senderId === $hushIdStore ? 'justify-end' : 'justify-start'}`}>
              <div class={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${message.senderId === $hushIdStore ? 'bubble-self' : 'bubble-other'}`}>
                <div class="flex items-center gap-2 text-xs opacity-80">
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

          {#if $messages.length === 0}
            <div class="text-center muted text-sm py-6">Sin mensajes aún. Envía el primero.</div>
          {/if}
        </div>

        <form class="space-y-2" on:submit={send}>
          <input
            name="message"
            placeholder="Escribe un mensaje..."
            required
            class="w-full rounded-xl input-surface px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <div class="flex justify-between items-center gap-3">
            <div class="text-xs muted">Mensajes no se guardan en servidor. Clave compartida = sala.</div>
            <Button type="submit">Enviar</Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
