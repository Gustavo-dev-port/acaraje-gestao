import { useState } from 'react'
import { LogOut, Moon, Sun } from 'lucide-react'
import { supabase, ROLE_LABEL } from '@/supabase'
import { cn } from '@/lib/cn'
import { useApp } from '@/lib/ctx'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/kit'

const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento: vale só nesta visita */ } }
const ler = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

export default function Configuracoes() {
  const { email, role, companyName } = useApp()
  const [texto, setTexto] = useState(ler('ca-texto') ?? 'normal')
  const [escuro, setEscuro] = useState(document.documentElement.classList.contains('dark'))

  const mudarTexto = (v: string) => {
    setTexto(v)
    if (v === 'normal') document.documentElement.removeAttribute('data-texto'); else document.documentElement.setAttribute('data-texto', v)
    guardar('ca-texto', v === 'normal' ? '' : v)
  }
  const mudarTema = (d: boolean) => {
    setEscuro(d)
    document.documentElement.classList.toggle('dark', d)
    guardar('ca-tema', d ? 'escuro' : 'claro')
  }

  const Bloco = ({ titulo, texto: t, children }: { titulo: string; texto?: string; children: React.ReactNode }) => (
    <section className="rounded-cartao border border-border bg-card p-6 shadow-suave">
      <h2 className="text-secao font-bold">{titulo}</h2>
      {t && <p className="mt-1 text-corpo text-muted-foreground">{t}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )

  return (
    <AppShell titulo="Configurações" subtitulo="Deixe o app do seu jeito. Vale só para este aparelho.">
      <div className="grid max-w-[46rem] gap-6">
        <Bloco titulo="Tamanho do texto" texto="Aumente se estiver difícil de ler. A tela inteira acompanha.">
          <div className="flex flex-wrap gap-3">
            {[['normal', 'Normal'], ['grande', 'Grande'], ['extra', 'Extra grande']].map(([v, r]) => (
              <Chip key={v} ativo={texto === v} onClick={() => mudarTexto(v)} className={cn('h-14 text-corpo')}>{r}</Chip>
            ))}
          </div>
        </Bloco>
        <Bloco titulo="Tema" texto="Claro de dia, escuro para ver melhor à noite.">
          <div className="flex flex-wrap gap-3">
            <Chip ativo={!escuro} onClick={() => mudarTema(false)} className="h-14 text-corpo"><Sun className="mr-2 inline size-5" aria-hidden /> Claro</Chip>
            <Chip ativo={escuro} onClick={() => mudarTema(true)} className="h-14 text-corpo"><Moon className="mr-2 inline size-5" aria-hidden /> Escuro</Chip>
          </div>
        </Bloco>
        <Bloco titulo="Minha conta">
          <dl className="space-y-1 text-corpo">
            <div className="flex gap-2"><dt className="text-muted-foreground">Empresa:</dt><dd className="font-semibold">{companyName}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground">E-mail:</dt><dd className="font-semibold break-all">{email}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground">Papel:</dt><dd className="font-semibold">{ROLE_LABEL[role]}</dd></div>
          </dl>
          <Button variant="outline" className="mt-4" onClick={() => supabase.auth.signOut()}><LogOut /> Sair deste aparelho</Button>
        </Bloco>
      </div>
    </AppShell>
  )
}
