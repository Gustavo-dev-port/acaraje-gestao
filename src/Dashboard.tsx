import { useEffect, useMemo, useState } from 'react'
import { supabase, supplierName } from './supabase'
import { formatCents, formatDate, todayIso } from './money'
import { computeDre, fmtPct, loadMonth, prevMonth, rootOf, spentBy, type MonthData } from './finance'

interface Due {
  id: string; amount_cents: number; due_date: string | null
  suppliers: { nickname: string | null; trade_name: string | null; legal_name: string | null } | null
}

export default function Dashboard({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7))
  const [cur, setCur] = useState<MonthData | null>(null)
  const [prev, setPrev] = useState<MonthData | null>(null)
  const [goals, setGoals] = useState<Record<string, number>>({})
  const [due, setDue] = useState<Due[]>([])
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setError('')
    Promise.all([loadMonth(month), loadMonth(prevMonth(month))])
      .then(([a, b]) => { if (alive) { setCur(a); setPrev(b) } })
      .catch(() => alive && setError('Não consegui carregar os números.'))
    supabase.from('category_goals').select('category_id,monthly_limit_cents').then(({ data }) => {
      const m: Record<string, number> = {}
      for (const r of (data as { category_id: string; monthly_limit_cents: number }[]) ?? []) m[r.category_id] = r.monthly_limit_cents
      if (alive) setGoals(m)
    })
    supabase.from('expenses').select('id,amount_cents,due_date,suppliers(nickname,trade_name,legal_name)')
      .is('deleted_at', null).eq('status', 'Pending').order('due_date', { ascending: true }).limit(5)
      .then(({ data }) => alive && setDue((data as unknown as Due[]) ?? []))
    return () => { alive = false }
  }, [month, tick])

  // tempo real: lançamento novo em qualquer aparelho atualiza o painel
  useEffect(() => {
    const ch = supabase.channel('dash-' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `company_id=eq.${companyId}` }, () => setTick((t) => t + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenues', filter: `company_id=eq.${companyId}` }, () => setTick((t) => t + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId])

  const dre = useMemo(() => (cur ? computeDre(cur) : null), [cur])
  const dreP = useMemo(() => (prev ? computeDre(prev) : null), [prev])

  const groups = useMemo(() => {
    if (!cur) return []
    const m = spentBy(cur, (c) => rootOf(cur.cats, c.id)?.id)
    return [...m.entries()].map(([id, v]) => ({ cat: cur.cats[id], v })).sort((a, b) => b.v - a.v)
  }, [cur])

  const goalRows = useMemo(() => {
    if (!cur) return []
    const m = spentBy(cur, (c) => c.id)
    return Object.entries(goals).map(([id, limit]) => ({ cat: cur.cats[id], spent: m.get(id) ?? 0, limit }))
      .filter((g) => g.cat).sort((a, b) => b.spent / b.limit - a.spent / a.limit)
  }, [cur, goals])

  const delta = (a: number, b: number | undefined) => {
    if (!b) return null
    const p = ((a - b) / b) * 100
    return `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}% vs mês anterior`
  }
  const maxGroup = groups[0]?.v ?? 1

  return (
    <div>
      <div className="head">
        <div>
          <h1 className="title">Dashboard</h1>
          <p className="muted">Como o mês está indo.</p>
        </div>
        <input type="month" className="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      <div className="stitch" />
      {error && <p className="msg error" role="alert">{error}</p>}
      {!dre ? <p className="muted">Carregando…</p> : (
        <>
          <div className="tiles">
            <Tile label="Faturamento líquido" value={formatCents(dre.net)} note={delta(dre.net, dreP?.net)} />
            <Tile label="Gastos" value={formatCents(dre.expenses)} note={delta(dre.expenses, dreP?.expenses)} />
            <Tile label="Resultado" value={formatCents(dre.result)} tone={dre.result < 0 ? 'bad' : 'good'} note={dre.net > 0 ? `${fmtPct((dre.result / dre.net) * 100)} do faturamento` : null} />
            <Tile label="CMV" value={fmtPct(dre.cmvPct)} note="custo da mercadoria sobre o faturamento" tone={dre.cmvPct != null && dre.cmvPct > 35 ? 'bad' : undefined} />
          </div>
          {dre.pending > 0 && <p className="muted" style={{ marginTop: 8 }}>Dos gastos, {formatCents(dre.pending)} ainda estão a pagar.</p>}

          <h2 className="subtitle">Para onde foi o dinheiro</h2>
          {groups.length === 0 ? <div className="card empty">Sem gastos neste mês.</div> : (
            <div className="card">
              {groups.map(({ cat, v }) => (
                <div key={cat.id} className="bar-row">
                  <div className="bar-label">{cat.icon} {cat.name}</div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(v / maxGroup) * 100}%`, background: cat.color }} /></div>
                  <div className="bar-val">{formatCents(v)}</div>
                </div>
              ))}
            </div>
          )}

          {goalRows.length > 0 && (
            <>
              <h2 className="subtitle">Metas do mês</h2>
              <div className="card">
                {goalRows.map(({ cat, spent, limit }) => {
                  const p = (spent / limit) * 100
                  const tone = p > 100 ? 'bad' : p >= 80 ? 'warn' : 'good'
                  return (
                    <div key={cat.id} className="bar-row">
                      <div className="bar-label">{cat.icon} {cat.name}</div>
                      <div className="bar-track"><div className={'bar-fill ' + tone} style={{ width: `${Math.min(p, 100)}%` }} /></div>
                      <div className="bar-val small">{formatCents(spent)} / {formatCents(limit)}</div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          <h2 className="subtitle">Próximas contas</h2>
          {due.length === 0 ? <div className="card empty">Nenhuma conta a pagar. 🎉</div> : (
            <ul className="list">
              {due.map((d) => (
                <li key={d.id} className="item">
                  <div className="item-main">
                    <div className="item-title">{d.suppliers ? supplierName(d.suppliers) : '—'}</div>
                    <div className="muted small">vence {d.due_date ? formatDate(d.due_date) : 'sem data'}{d.due_date && d.due_date < todayIso() && <b className="late"> · ATRASADA</b>}</div>
                  </div>
                  <div className="amount">{formatCents(d.amount_cents)}</div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string | null; tone?: 'good' | 'bad' }) {
  return (
    <div className={'tile' + (tone ? ' ' + tone : '')}>
      <div className="kpi-label">{label}</div>
      <div className="tile-value">{value}</div>
      {note && <div className="muted small">{note}</div>}
    </div>
  )
}
