<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';

  onMount(() => {
    // Flowbite registers components that rely on the DOM.
    import('flowbite');
  });
</script>

<svelte:head>
  <title>Hush Messenger</title>
  <meta name="theme-color" content="#0b1727" />
  <meta name="description" content="Small private rooms with ephemeral keys" />
</svelte:head>

<slot />
