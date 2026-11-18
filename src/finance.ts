import { supabase } from './supabase'
import { monthEnd, monthStart } from './money'

export interface CatInfo {
  id: string; name: string; parent_id: string | null; cost_group: string; icon: string; color: string
}
export interface ExpenseLite { amount_cents: number; status: string; category_id: string; date: string; due_date: string | null }
export interface RevenueLite { gross_cents: number; discounts_cents: number; orders: number | null }

export interface MonthData {
  cats: Record<string, CatInfo>
  expenses: ExpenseLite[]
  revenues: RevenueLite[]
}

export async function loadMonth(ym: string): Promise<MonthData> {
  const [c, e, r] = await Promise.all([
    supabase.from('categories').select('id,name,parent_id,cost_group,icon,color'),
    supabase.from('expenses').select('amount_cents,status,category_id,date,due_date').is('deleted_at', null)
      .gte('date', monthStart(ym)).lte('date', monthEnd(ym)),
    supabase.from('revenues').select('gross_cents,discounts_cents,orders').gte('date', monthStart(ym)).lte('date', monthEnd(ym)),
  ])
  if (c.error || e.error || r.error) throw new Error('Falha ao carregar o mês')
  const cats: Record<string, CatInfo> = {}
  for (const x of (c.data as CatInfo[]) ?? []) cats[x.id] = x
  return { cats, expenses: (e.data as ExpenseLite[]) ?? [], revenues: (r.data as RevenueLite[]) ?? [] }
}

/** Gasto que conta nos números: pago ou a pagar. "Aguardando confirmação" ainda não tem valor certo. */
export const counts = (e: ExpenseLite) => e.status !== 'AwaitingConfirmation'

export interface Dre {
  gross: number; discounts: number; net: number; orders: number
  cmv: number; grossProfit: number; fixed: number; variable: number; tax: number
  expenses: number; result: number; cmvPct: number | null
  pending: number
}

export function computeDre(d: MonthData): Dre {
  const gross = d.revenues.reduce((s, r) => s + r.gross_cents, 0)
  const discounts = d.revenues.reduce((s, r) => s + r.discounts_cents, 0)
  const orders = d.revenues.reduce((s, r) => s + (r.orders ?? 0), 0)
  const net = gross - discounts
  const by: Record<string, number> = { Cmv: 0, Fixed: 0, Variable: 0, Tax: 0 }
  let pending = 0
  for (const e of d.expenses) {
    if (!counts(e)) continue
    by[d.cats[e.category_id]?.cost_group ?? 'Variable'] += e.amount_cents
    if (e.status === 'Pending') pending += e.amount_cents
  }
  const expenses = by.Cmv + by.Fixed + by.Variable + by.Tax
  return {
    gross, discounts, net, orders, cmv: by.Cmv, grossProfit: net - by.Cmv,
    fixed: by.Fixed, variable: by.Variable, tax: by.Tax, expenses, result: net - expenses,
    cmvPct: net > 0 ? (by.Cmv / net) * 100 : null, pending,
  }
}

export const rootOf = (cats: Record<string, CatInfo>, id: string): CatInfo | undefined => {
  const c = cats[id]
  return c?.parent_id ? cats[c.parent_id] ?? c : c
}

export function spentBy(d: MonthData, key: (c: CatInfo) => string | undefined) {
  const m = new Map<string, number>()
  for (const e of d.expenses) {
    if (!counts(e)) continue
    const c = d.cats[e.category_id]
    const k = c && key(c)
    if (k) m.set(k, (m.get(k) ?? 0) + e.amount_cents)
  }
  return m
}

export const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const pct = (v: number, base: number) => (base > 0 ? (v / base) * 100 : null)
export const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`)
