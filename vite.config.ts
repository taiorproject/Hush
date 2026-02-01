import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';

const config: UserConfig = {
  plugins: [sveltekit()],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@taiorproject/taior']
  }
};

export default config;
