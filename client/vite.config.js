import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    // Same-origin API calls keep the httpOnly session cookie simple in development.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
