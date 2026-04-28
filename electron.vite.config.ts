import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
    main: {
        build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/main/index.ts')
                }
            }
        }
    },

    preload: {
        build: {
            outDir: 'dist-electron/preload',
            lib: {
                entry: resolve(__dirname, 'src/preload/index.ts'),
                formats: ['cjs'],
                fileName: () => 'index.js'
            }
        }
    }
})