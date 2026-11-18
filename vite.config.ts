import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// base relativa: funciona na raiz de um domínio e também em um subendereço.
// `npm run demo` (modo "demo") troca o Supabase por dados fictícios, só para conferir o visual.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      ...(mode === 'demo' ? [{ find: '@/supabase', replacement: path.resolve(__dirname, 'demo/supabase.ts') }] : []),
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
}))
