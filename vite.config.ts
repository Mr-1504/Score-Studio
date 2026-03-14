import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'form-data', 'adm-zip', 'axios', 'dotenv']
            }
          }
        }
      },
      {
        // Preload script entry
        entry: 'src/preload/index.ts',
        onstart(args) {
          // Notify the Renderer process to reload the page when the Preload scripts build is complete
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs'
              }
            }
          }
        }
      }
    ])
  ],
  base: './',
  build: {
    outDir: 'dist-electron/renderer'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer')
    }
  }
})
