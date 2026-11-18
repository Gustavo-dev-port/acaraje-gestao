import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, ROLE_LABEL, type Role } from './supabase'
import Login from './Login'
import Dashboard from './Dashboard'
import LancarGasto from './LancarGasto'
import Lancamentos from './Lancamentos'
import Contas from './Contas'
import ContasFixas from './ContasFixas'
import Faturamento from './Faturamento'
import Fornecedores from './Fornecedores'
import Categorias from './Categorias'
import Fichas from './Fichas'
import Relatorios from './Relatorios'
import Equipe from './Equipe'

interface Membership { companyId: string; companyName: string; role: Role }

type Tab = 'dashboard' | 'lancar' | 'lancamentos' | 'contas' | 'fixas' | 'faturamento'
  | 'fornecedores' | 'categorias' | 'fichas' | 'relatorios' | 'equipe'

const NAV: { tab: Tab; label: string; roles?: Role[] }[] = [
  { tab: 'dashboard', label: '📊 Dashboard' },
  { tab: 'lancar', label: '➕ Lançar gasto' },
  { tab: 'lancamentos', label: '📋 Lançamentos' },
  { tab: 'contas', label: '🗓 Contas a pagar' },
  { tab: 'fixas', label: '🔁 Contas fixas', roles: ['dono', 'socio'] },
  { tab: 'faturamento', label: '💰 Faturamento' },
  { tab: 'fornecedores', label: '🚚 Fornecedores' },
  { tab: 'categorias', label: '🏷 Categorias', roles: ['dono', 'socio'] },
  { tab: 'fichas', label: '🍤 Ficha técnica' },
  { tab: 'relatorios', label: '📑 Relatórios' },
  { tab: 'equipe', label: '👥 Equipe', roles: ['dono'] },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [member, setMember] = useState<Membership | null>(null)
  const [memberError, setMemberError] = useState('')
  const [tab, setTab] = useState<Tab>('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setMember(null)
    setMemberError('')
    if (!session) return
    supabase
      .from('company_members')
      .select('role, companies(id, trade_name)')
      .eq('user_id', session.user.id)
      .limit(1)
      .then(({ data, error }) => {
        const row = data?.[0] as unknown as { role: Role; companies: { id: string; trade_name: string } } | undefined
        if (error || !row) {
          setMemberError('Sua conta ainda não está vinculada a nenhuma empresa. Fale com o dono.')
          return
        }
        setMember({ companyId: row.companies.id, companyName: row.companies.trade_name, role: row.role })
      })
  }, [session])

  if (!ready) return <div className="center muted">Carregando…</div>
  if (!session) return <Login />

  if (!member) {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <p className={memberError ? 'msg error' : 'muted'}>{memberError || 'Carregando…'}</p>
          {memberError && <button className="btn" onClick={() => supabase.auth.signOut()}>Sair</button>}
        </div>
      </div>
    )
  }

  const { companyId, role } = member
  const items = NAV.filter((n) => !n.roles || n.roles.includes(role))

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand"><span>🍤</span> {member.companyName}</div>
        <nav className="nav" aria-label="Menu">
          {items.map((n) => (
            <button key={n.tab} className={tab === n.tab ? 'on' : ''} aria-current={tab === n.tab ? 'page' : undefined} onClick={() => setTab(n.tab)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">{session.user.email}</div>
          <div className="role">{ROLE_LABEL[role]}</div>
          <button className="btn small" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </aside>
      <main className="main">
        {tab === 'dashboard' && <Dashboard companyId={companyId} />}
        {tab === 'lancar' && <LancarGasto companyId={companyId} onSaved={() => setTab('lancamentos')} />}
        {tab === 'lancamentos' && <Lancamentos companyId={companyId} role={role} />}
        {tab === 'contas' && <Contas companyId={companyId} />}
        {tab === 'fixas' && <ContasFixas companyId={companyId} />}
        {tab === 'faturamento' && <Faturamento companyId={companyId} role={role} />}
        {tab === 'fornecedores' && <Fornecedores companyId={companyId} role={role} />}
        {tab === 'categorias' && <Categorias companyId={companyId} />}
        {tab === 'fichas' && <Fichas companyId={companyId} role={role} />}
        {tab === 'relatorios' && <Relatorios />}
        {tab === 'equipe' && <Equipe companyId={companyId} myId={session.user.id} />}
      </main>
    </div>
  )
}
