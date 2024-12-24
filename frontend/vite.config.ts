import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6969,
    proxy: {
      '/api': {
        target: 'http://localhost:9696',
        changeOrigin: true
      }
    }
  }
});