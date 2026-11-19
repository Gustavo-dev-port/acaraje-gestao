import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Hospedagens como o GitHub Pages não aplicam os cabeçalhos do netlify.toml. Este plugin copia a CSP de lá (uma só
 * fonte da verdade) para um <meta http-equiv> no index.html gerado, só no build.
 * Limites do <meta>: `frame-ancestors` não funciona (por isso sai da cópia), e X-Frame-Options, HSTS, COOP/CORP e
 * Permissions-Policy não existem em <meta>. No Pages, portanto, o site NÃO tem proteção contra ser embutido em outro
 * site (clickjacking). Para ter todos os cabeçalhos, use o Netlify.
 */
function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const toml = fs.readFileSync(path.resolve(__dirname, 'netlify.toml'), 'utf8')
      const m = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(toml)
      if (!m) throw new Error('csp-meta: não achei Content-Security-Policy no netlify.toml.')
      // upgrade-insecure-requests fica só no cabeçalho do Netlify: no meta, atrapalharia o `vite preview` em http://localhost
      const csp = m[1].split(';').map((d) => d.trim()).filter((d) => d && !d.startsWith('frame-ancestors') && d !== 'upgrade-insecure-requests').join('; ')
      const tag = `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}" />`
      // logo depois do charset (que precisa ficar nos primeiros 1024 bytes) e antes de qualquer script ou estilo
      const alvo = /<meta charset="[^"]*"\s*\/?>/i
      if (!alvo.test(html)) throw new Error('csp-meta: o index.html precisa ter <meta charset> no início do <head>.')
      return html.replace(alvo, (c) => `${c}\n    ${tag}`)
    },
  }
}

// base relativa: funciona na raiz de um domínio e também em um subendereço.
// `npm run demo` (modo "demo") troca o Supabase por dados fictícios, só para conferir o visual.
export default defineConfig(({ mode, command }) => {
  // O modo demo troca o Supabase por dados fictícios. Nunca pode virar um build publicado.
  if (mode === 'demo' && command === 'build') {
    throw new Error('O modo "demo" é só para o servidor de desenvolvimento (npm run demo). Não gere build com --mode demo.')
  }
  return {
    base: './',
    plugins: [react(), tailwindcss(), cspMeta()],
    resolve: {
      alias: [
        ...(mode === 'demo' ? [{ find: '@/supabase', replacement: path.resolve(__dirname, 'demo/supabase.ts') }] : []),
        { find: '@', replacement: path.resolve(__dirname, 'src') },
      ],
    },
  }
})
