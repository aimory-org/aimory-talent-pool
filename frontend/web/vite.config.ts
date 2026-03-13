import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // Listen on all interfaces (needed for dev containers)
    port: 5174,
    strictPort: true,
    hmr: {
      clientPort: 5174, // Use same port for HMR WebSocket
    },
  },
})
