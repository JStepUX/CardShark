import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory using ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 6969,  // Explicitly set frontend port
    strictPort: true,  // Force this port or fail
    proxy: {
      '/api': {
        target: 'http://localhost:9696',  // Backend port
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          // Put images in assets folder
          if (assetInfo.name && /\.(png|jpe?g|svg|gif|ico)$/.test(assetInfo.name)) {
            return 'assets/[name][extname]';
          }
          // Default handling for other assets
          return '[name][extname]';
        }
      }
    }
  }
});