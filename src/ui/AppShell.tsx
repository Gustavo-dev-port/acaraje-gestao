import { useEffect, useState, type ReactNode } from 'react'
import {
  BarChart3, BookOpen, CalendarCheck, Check, ClipboardList, FileText, FolderTree, LogOut, Menu, PlusCircle,
  Settings, Store, Upload, Users, Wheat, Banknote, X, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Link, usePath } from '@/lib/router'
import { useApp } from '@/lib/ctx'
import { supabase, ROLE_LABEL, type Role } from '@/supabase'
import { Logo } from './Logo'
import { Button } from './Button'

interface Item { to: string; rotulo: string; icone: LucideIcon; roles?: Role[] }

const ITENS: Item[] = [
  { to: '/', rotulo: 'Lançar gasto', icone: PlusCircle },
  { to: '/lancamentos', rotulo: 'Lançamentos', icone: ClipboardList },
  { to: '/contas', rotulo: 'Contas do mês', icone: CalendarCheck },
  { to: '/faturamento', rotulo: 'Faturamento', icone: Banknote },
  { to: '/importar', rotulo: 'Importar extrato', icone: Upload },
  { to: '/relatorios', rotulo: 'Relatórios', icone: FileText },
  { to: '/dashboard', rotulo: 'Dashboard', icone: BarChart3 },
  { to: '/fornecedores', rotulo: 'Fornecedores', icone: Store },
  { to: '/categorias', rotulo: 'Categorias', icone: FolderTree, roles: ['dono', 'socio'] },
  { to: '/fichas', rotulo: 'Ficha técnica', icone: BookOpen },
  { to: '/equipe', rotulo: 'Equipe', icone: Users, roles: ['dono'] },
  { to: '/configuracoes', rotulo: 'Configurações', icone: Settings },
]

const EM_BREVE: { rotulo: string; icone: LucideIcon }[] = [
  { rotulo: 'Estoque', icone: Wheat },
]

export function SeloEmBreve({ className }: { className?: string }) {
  return <span className={cn('rounded-full border border-current px-2 py-0.5 text-[0.8rem] leading-tight font-semibold opacity-90', className)}>Em breve</span>
}

function Menu_({ aoEscolher }: { aoEscolher?: () => void }) {
  const path = usePath()
  const { pendentes, role, email } = useApp()
  const itens = ITENS.filter((i) => !i.roles || i.roles.includes(role))
  return (
    <>
      <Link to="/" onClick={aoEscolher} className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Logo className="size-14" />
        <span className="font-script text-[1.65rem] leading-none text-mostarda">Cantinho do Acarajé</span>
      </Link>
      <div className="mx-5 mb-2 h-[2px] bg-[repeating-linear-gradient(90deg,var(--mostarda)_0_10px,transparent_10px_16px)] opacity-70" />
      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5">
          {itens.map((it) => {
            const ativo = it.to === '/' ? path === '/' : path.startsWith(it.to)
            const I = it.icone
            return (
              <li key={it.to}>
                <Link to={it.to} onClick={aoEscolher} aria-current={ativo ? 'page' : undefined}
                  className={cn('relative flex min-h-12 items-center gap-3 px-5 py-2 text-xl font-medium transition-colors duration-150 hover:bg-sidebar-accent focus-visible:outline-mostarda', ativo && 'bg-sidebar-accent font-bold')}>
                  {ativo && <span className="absolute inset-y-1 left-0 w-1.5 rounded-r bg-mostarda" />}
                  <I className="size-7 shrink-0" aria-hidden />
                  <span className="flex-1">{it.rotulo}</span>
                  {it.to === '/contas' && pendentes > 0 && (
                    <span className="flex min-w-8 items-center justify-center rounded-full bg-mostarda px-2 text-legenda font-bold text-preto" aria-label={`${pendentes} contas para confirmar`}>{pendentes}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
        <p className="mt-4 px-5 pb-1 text-legenda text-sidebar-foreground/70">Próxima versão</p>
        <ul aria-label="Módulos em breve">
          {EM_BREVE.map((it) => {
            const I = it.icone
            return (
              <li key={it.rotulo} aria-disabled className="flex min-h-11 items-center gap-3 px-5 text-lg text-sidebar-foreground/55">
                <I className="size-6 shrink-0" aria-hidden /><span className="flex-1">{it.rotulo}</span><SeloEmBreve />
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="flex items-center gap-2 text-legenda font-semibold text-[oklch(0.78_0.1_160)]"><Check className="size-5" aria-hidden /> Salvo na nuvem</p>
        <p className="mt-1 truncate text-legenda text-sidebar-foreground/75" title={email}>{email}</p>
        <p className="text-legenda font-semibold text-mostarda">{ROLE_LABEL[role]}</p>
        <button onClick={() => supabase.auth.signOut()} className="mt-1 flex h-11 items-center gap-2 text-legenda text-sidebar-foreground/85 underline-offset-4 hover:underline">
          <LogOut className="size-5" aria-hidden /> Sair
        </button>
      </div>
    </>
  )
}

export function AppShell({ titulo, subtitulo, acoes, children }: { titulo: string; subtitulo?: string; acoes?: ReactNode; children: ReactNode }) {
  const [aberto, setAberto] = useState(false)
  const path = usePath()
  useEffect(() => setAberto(false), [path])
  useEffect(() => { document.title = `${titulo} — Cantinho do Acarajé` }, [titulo])

  return (
    <div className="flex min-h-screen bg-background">
      {/* menu fixo no computador */}
      <aside className="no-print sticky top-0 hidden h-screen w-[16.25rem] shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <Menu_ />
      </aside>

      {/* barra de topo + gaveta no celular */}
      <div className="no-print fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-3 bg-sidebar px-4 text-sidebar-foreground lg:hidden">
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" aria-label="Abrir menu" aria-expanded={aberto} onClick={() => setAberto(true)}><Menu className="!size-8" /></Button>
        <Logo className="size-10" />
        <span className="font-script text-2xl leading-none text-mostarda">Cantinho do Acarajé</span>
      </div>
      {aberto && (
        <div className="no-print fixed inset-0 z-40 flex bg-preto/60 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setAberto(false)}>
          <aside className="flex h-full w-[17rem] max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground">
            <Button variant="ghost" size="icon" className="absolute top-3 left-[13.5rem] text-sidebar-foreground hover:bg-sidebar-accent" aria-label="Fechar menu" onClick={() => setAberto(false)}><X /></Button>
            <Menu_ aoEscolher={() => setAberto(false)} />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 pt-16 lg:pt-0">
        <div className="mx-auto max-w-[78rem] px-4 pt-6 pb-12 sm:px-8">
          <header className="mb-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-tela font-semibold tracking-tight">{titulo}</h1>
                {subtitulo && <p className="mt-1 text-corpo text-muted-foreground">{subtitulo}</p>}
              </div>
              {acoes && <div className="flex flex-wrap items-center gap-3">{acoes}</div>}
            </div>
            <div className="pesponto mt-4" aria-hidden />
          </header>
          {children}
        </div>
      </main>
    </div>
  )
}
