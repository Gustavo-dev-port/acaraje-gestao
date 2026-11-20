import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Role } from '@/supabase'
import { AppProvider } from '@/lib/ctx'
import { limparRecuperacao, marcarRecuperacao, recuperacaoPendente } from '@/lib/recuperacao'
import { usePath } from '@/lib/router'
import { Toaster } from '@/lib/toast'
import { Button } from '@/ui/Button'
import { Logo } from '@/ui/Logo'
import Login from './Login'
import NovaSenha from './NovaSenha'
import LancarGasto from './telas/LancarGasto'
import Lancamentos from './telas/Lancamentos'
import Contas from './telas/Contas'
import Faturamento from './telas/Faturamento'
import Importar from './telas/Importar'
import Relatorios from './telas/Relatorios'
import Dashboard from './telas/Dashboard'
import Fornecedores from './telas/Fornecedores'
import Categorias from './telas/Categorias'
import Fichas from './telas/Fichas'
import Equipe from './telas/Equipe'
import Configuracoes from './telas/Configuracoes'

interface Vinculo { companyId: string; companyName: string; role: Role }

const ROTAS: Record<string, () => JSX.Element> = {
  '/': LancarGasto, '/lancamentos': Lancamentos, '/contas': Contas, '/faturamento': Faturamento, '/importar': Importar,
  '/relatorios': Relatorios, '/dashboard': Dashboard, '/fornecedores': Fornecedores,
  '/categorias': Categorias, '/fichas': Fichas, '/equipe': Equipe, '/configuracoes': Configuracoes,
}

function Tela() {
  const path = usePath()
  const Comp = ROTAS[path] ?? LancarGasto
  return <Comp />
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [pronto, setPronto] = useState(false)
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [semVinculo, setSemVinculo] = useState(false)
  // Chegou pelo link de "esqueci a senha"? O supabase-js troca o código do link por uma sessão e avisa com o evento
  // PASSWORD_RECOVERY (antes de getSession responder). A marca fica guardada até a senha ser trocada ou a pessoa sair.
  const [recuperando, setRecuperando] = useState(recuperacaoPendente)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null)) // sem internet na abertura: mostra o login em vez de ficar em "Carregando…" para sempre
      .finally(() => setPronto(true))
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s)
      if (e === 'PASSWORD_RECOVERY') { marcarRecuperacao(); setRecuperando(true) }
      if (e === 'SIGNED_OUT') {
        // a próxima pessoa neste aparelho não herda a última tela nem a marca de recuperação
        limparRecuperacao(); setRecuperando(false)
        try { window.history.replaceState(null, '', window.location.pathname + window.location.search) } catch { /* sem history */ }
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    setVinculo(null); setSemVinculo(false)
    if (!userId) return
    let vivo = true // numa troca rápida de conta, a resposta da sessão anterior é descartada
    supabase.from('company_members').select('role, companies(id, trade_name)').eq('user_id', userId).limit(1)
      .then(({ data, error }) => {
        if (!vivo) return
        const row = data?.[0] as unknown as { role: Role; companies: { id: string; trade_name: string } } | undefined
        if (error || !row) return setSemVinculo(true)
        setVinculo({ companyId: row.companies.id, companyName: row.companies.trade_name, role: row.role })
      })
    return () => { vivo = false }
  }, [userId])

  const base = useMemo(() => (vinculo && session ? { ...vinculo, userId: session.user.id, email: session.user.email ?? '' } : null), [vinculo, session])

  let corpo
  if (!pronto) corpo = <div className="flex min-h-screen items-center justify-center text-corpo text-muted-foreground">Carregando…</div>
  else if (!session) corpo = <Login />
  else if (recuperando) corpo = <NovaSenha onConcluir={() => { limparRecuperacao(); setRecuperando(false) }} />
  else if (semVinculo) {
    corpo = (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
        <Logo className="size-16" />
        <p className="max-w-[28rem] text-corpo">Sua conta ainda não está vinculada a nenhuma empresa. Fale com o dono do Cantinho do Acarajé.</p>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sair</Button>
      </div>
    )
  } else if (!base) corpo = <div className="flex min-h-screen items-center justify-center text-corpo text-muted-foreground">Carregando…</div>
  else corpo = <AppProvider base={base}><Tela /></AppProvider>

  return <>{corpo}<Toaster /></>
}
