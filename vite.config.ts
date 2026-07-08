import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base = '/<repo>/' fuer GitHub-Pages-Projektseiten (saubere URLs ohne #).
// Bei anderem Repo-Namen NUR diese eine Zeile aendern (basename + 404.html
// leiten sich davon ab).
export default defineConfig({
  base: '/Gym-App/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Gym Tracker',
        short_name: 'Gym',
        description: 'Lokales Trainings-Tracking. Alle Daten bleiben auf deinem Geraet.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/Gym-App/',
        scope: '/Gym-App/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
