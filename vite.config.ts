import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativa: funciona na raiz de um domínio e também em um subendereço (GitHub Pages)
export default defineConfig({ base: './', plugins: [react()] })
