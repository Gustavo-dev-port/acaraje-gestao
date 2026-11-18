import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, type Role } from '@/supabase'
import { mesAtual as mesAtualFn, hojeIso } from './fmt'

export interface Cat {
  id: string; name: string; parent_id: string | null; cost_group: string
  icon: string; color: string; active: boolean; sort_order: number
}
export interface Sup {
  id: string; cnpj: string | null; legal_name: string | null; trade_name: string | null; nickname: string | null
  default_category_id: string | null; is_complete: boolean
}

export type IconeKey = 'cozinha' | 'bebidas' | 'pessoal' | 'contas' | 'impostos' | 'maquinas' | 'limpeza' | 'marketing' | 'frete' | 'outros'

export const GRUPOS: { id: string; nome: string; curto: string; descricao: string }[] = [
  { id: 'Cmv', nome: 'Mercadoria (CMV)', curto: 'CMV', descricao: 'O que vira acarajé e bebida' },
  { id: 'Fixed', nome: 'Gastos fixos', curto: 'Fixo', descricao: 'Aluguel, contas e pessoal' },
  { id: 'Variable', nome: 'Gastos variáveis', curto: 'Variável', descricao: 'Limpeza, frete, divulgação' },
  { id: 'Tax', nome: 'Impostos', curto: 'Imposto', descricao: 'Simples, taxas e alvará' },
]

export const nomeFornecedor = (s: Pick<Sup, 'nickname' | 'trade_name' | 'legal_name'> | null | undefined) =>
  s ? s.nickname || s.trade_name || s.legal_name || '(sem nome)' : '—'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Ícone do grupo de categoria, escolhido pelo nome (o banco guarda emoji; o desenho usa ícones de traço). */
export function iconeDe(nome: string): IconeKey {
  const n = norm(nome)
  if (n.startsWith('cozinha')) return 'cozinha'
  if (n.startsWith('bebida')) return 'bebidas'
  if (n.startsWith('pessoal')) return 'pessoal'
  if (n.startsWith('ocupa')) return 'contas'
  if (n.startsWith('impost')) return 'impostos'
  if (n.startsWith('maquina')) return 'maquinas'
  if (n.startsWith('manuten') || n.startsWith('limpeza')) return 'limpeza'
  if (n.startsWith('market')) return 'marketing'
  if (n.startsWith('frete')) return 'frete'
  return 'outros'
}

interface Ctx {
  companyId: string
  companyName: string
  role: Role
  userId: string
  email: string
  podeEditar: boolean // dono ou sócio
  cats: Cat[]
  grupos: Cat[] // categorias principais, ativas ou não
  subsDe: (id: string) => Cat[]
  catPorId: (id: string) => Cat | undefined
  raizDe: (id: string) => Cat | undefined
  iconeDoGasto: (catId: string) => IconeKey
  corDoGrupo: (catId: string) => number
  sups: Sup[]
  recarregar: () => Promise<void>
  mes: string
  setMes: (m: string) => void
  pendentes: number
}

const C = createContext<Ctx | null>(null)
export const useApp = () => {
  const v = useContext(C)
  if (!v) throw new Error('useApp fora do provedor')
  return v
}

export function AppProvider({ base, children }: {
  base: { companyId: string; companyName: string; role: Role; userId: string; email: string }
  children: ReactNode
}) {
  const [cats, setCats] = useState<Cat[]>([])
  const [sups, setSups] = useState<Sup[]>([])
  const [mes, setMes] = useState(mesAtualFn())
  const [pendentes, setPendentes] = useState(0)

  const recarregar = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('categories').select('id,name,parent_id,cost_group,icon,color,active,sort_order').order('sort_order'),
      supabase.from('suppliers').select('id,cnpj,legal_name,trade_name,nickname,default_category_id,is_complete'),
    ])
    setCats((c.data as Cat[]) ?? [])
    const lista = ((s.data as Sup[]) ?? []).sort((a, b) => nomeFornecedor(a).localeCompare(nomeFornecedor(b), 'pt-BR'))
    setSups(lista)
  }, [])

  const contarPendentes = useCallback(async () => {
    const { count } = await supabase.from('expenses').select('id', { count: 'exact', head: true })
      .is('deleted_at', null).in('status', ['Pending', 'AwaitingConfirmation'])
    setPendentes(count ?? 0)
  }, [])

  useEffect(() => {
    // garante que as contas fixas do mês já estão lançadas, depois carrega tudo
    supabase.rpc('generate_recurrences', { p_company: base.companyId, p_month: hojeIso() }).then(() => contarPendentes())
    recarregar()
  }, [base.companyId, recarregar, contarPendentes])

  useEffect(() => {
    const ch = supabase.channel('app-' + base.companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `company_id=eq.${base.companyId}` }, () => contarPendentes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers', filter: `company_id=eq.${base.companyId}` }, () => recarregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [base.companyId, contarPendentes, recarregar])

  const value = useMemo<Ctx>(() => {
    const byId = new Map(cats.map((c) => [c.id, c]))
    const grupos = cats.filter((c) => !c.parent_id)
    const raizDe = (id: string) => { const c = byId.get(id); return c?.parent_id ? byId.get(c.parent_id) ?? c : c }
    return {
      ...base,
      podeEditar: base.role === 'dono' || base.role === 'socio',
      cats, grupos,
      subsDe: (id) => cats.filter((c) => c.parent_id === id),
      catPorId: (id) => byId.get(id),
      raizDe,
      iconeDoGasto: (id) => iconeDe(raizDe(id)?.name ?? ''),
      corDoGrupo: (id) => { const r = raizDe(id); return r ? (grupos.indexOf(r) % 5) + 1 : 6 },
      sups, recarregar, mes, setMes, pendentes,
    }
  }, [base, cats, sups, recarregar, mes, pendentes])

  return <C.Provider value={value}>{children}</C.Provider>
}
