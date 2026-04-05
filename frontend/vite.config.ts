import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Standard Vite port
    proxy: {
      // Route all /api requests to your FastAPI backend
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        // THIS IS THE MAGIC LINE TO FIX YOUR ERROR:
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});