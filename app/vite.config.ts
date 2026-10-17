import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Klick',
        short_name: 'Klick',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#121110',
        theme_color: '#121110',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // O Worker responde na mesma origem (spec 8.1): uma navegação para /api/ (o link de um e-mail) vai a ele, não ao index.html. A política
        // de privacidade é uma página própria (public/privacidade): o service worker não troca nenhuma das duas pelo app.
        navigateFallbackDenylist: [/^\/privacidade/, /^\/api\//],
        // Parâmetros que não mudam o arquivo: a nova tentativa de carregar o cubing.js (cubing.js?r=N) acha o pré-cache offline.
        ignoreURLParametersMatching: [/^r$/, /^utm_/, /^fbclid$/],
      },
    }),
  ],
  worker: { format: 'es' },
});
