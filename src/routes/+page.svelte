<script lang="ts">
  import { page } from '$app/stores';
  import { createSession, generateRoomKey, type ChatMessage, type ChatSession } from '$lib/chat';
  import { onDestroy, onMount } from 'svelte';
  import { derived, get, writable } from 'svelte/store';
  import Button from 'flowbite-svelte/Button.svelte';
  import Card from 'flowbite-svelte/Card.svelte';
  import Checkbox from 'flowbite-svelte/Checkbox.svelte';
  import Label from 'flowbite-svelte/Label.svelte';
  import Badge from 'flowbite-svelte/Badge.svelte';
  import Spinner from 'flowbite-svelte/Spinner.svelte';

  const params = derived(page, ($p) => $p.url.searchParams);
  const hushId = crypto.randomUUID().slice(0, 12);
  const alias = writable('');
  const roomKey = writable('');
  const reinforced = writable(false);

  const messages = writable<ChatMessage[]>([]);
  const connected = writable(false);

  let session: ChatSession | null = null;

  const bindSession = (s: ChatSession) => {
    s.messages.subscribe(messages.set);
    s.connected.subscribe(connected.set);
  };

  onMount(async () => {
    const s = await createSession('LOBBY', 'system', 'system');
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
    if (session) {
      session.disconnect();
    }
    session = await createSession(keyVal, aliasVal, hushId);
    bindSession(session);
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

<div class="min-h-screen flex flex-col items-center px-4 py-10 text-white">
  <div class="max-w-3xl w-full space-y-6">
    <header class="text-center space-y-2">
      <p class="uppercase tracking-[0.35em] text-xs text-hush-muted">Hush Messenger</p>
      <h1 class="text-3xl md:text-4xl font-semibold">Private, small, human spaces</h1>
      <p class="text-sm md:text-base text-hush-muted">
        Create a room, share a 10-char key, chat with ephemeral IDs. No accounts, no owners.
      </p>
    </header>

    <div class="grid md:grid-cols-3 gap-4">
      <Card class="glass md:col-span-2">
        <form class="space-y-4" on:submit|preventDefault={join}>
          <div>
            <Label for="room">Room key</Label>
            <div class="flex gap-2 mt-2">
              <input
                id="room"
                name="room"
                bind:value={$roomKey}
                on:input={handleRoomInput}
                placeholder="ABCDEF1234"
                required
                class="flex-1 rounded-lg border border-white/10 bg-white/5 p-2 text-white placeholder:text-hush-muted focus:border-hush-accent focus:ring-2 focus:ring-hush-accent"
              />
              <Button color="light" on:click={startRoom} type="button">Generate</Button>
            </div>
          </div>
          <div>
            <Label for="alias">Alias</Label>
            <input
              id="alias"
              name="alias"
              bind:value={$alias}
              placeholder="anon"
              class="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-white placeholder:text-hush-muted focus:border-hush-accent focus:ring-2 focus:ring-hush-accent"
            />
          </div>
          <div class="flex items-center gap-2">
            <Checkbox bind:checked={$reinforced} id="reinforced" name="reinforced" />
            <Label for="reinforced">Reinforced privacy (slower)</Label>
            <Badge color={$reinforced ? 'green' : 'dark'}>{$reinforced ? 'On' : 'Off'}</Badge>
          </div>
          <div class="flex gap-2">
            <Button type="submit" class="flex-1" color="blue">Join / Switch</Button>
          </div>
        </form>
      </Card>

      <Card class="glass space-y-3">
        <div class="text-sm text-hush-muted">Hush ID</div>
        <div class="text-lg font-mono">{hushId}</div>
        <div class="text-sm text-hush-muted">Share only the room key. IDs are local and not accounts.</div>
      </Card>
    </div>

    <Card class="glass">
      <div class="flex justify-between items-center mb-3">
        <div>
          <div class="text-xs uppercase tracking-[0.2em] text-hush-muted">Room</div>
          <div class="text-lg font-semibold">{$roomKey || '—'}</div>
        </div>
        <div class="flex items-center gap-2 text-sm">
          {#if $connected}
            <Badge color="green">Connected</Badge>
          {:else}
            <Badge color="yellow" class="flex items-center gap-2">
              <Spinner size="4" /> Connecting
            </Badge>
          {/if}
        </div>
      </div>

      <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {#each $messages as message (message.id)}
          <div class="p-3 rounded-lg bg-white/5 border border-white/10">
            <div class="flex justify-between items-center text-xs text-hush-muted">
              <span class="font-semibold">{message.alias}</span>
              <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
            <p class="mt-1 whitespace-pre-wrap">{message.text}</p>
            {#if message.reinforced}
              <Badge color="purple" class="mt-2">Reinforced</Badge>
            {/if}
          </div>
        {/each}
      </div>

      <form class="mt-4 space-y-2" on:submit={send}>
        <input
          name="message"
          placeholder="Write a message"
          required
          class="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-white placeholder:text-hush-muted focus:border-hush-accent focus:ring-2 focus:ring-hush-accent"
        />
        <div class="flex justify-end">
          <Button type="submit">Send</Button>
        </div>
      </form>
    </Card>
  </div>
</div>
