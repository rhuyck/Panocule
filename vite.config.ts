import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Panocule/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
});
