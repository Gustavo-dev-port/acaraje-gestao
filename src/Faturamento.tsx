import { useCallback, useEffect, useState } from 'react'
import { supabase, type Role } from './supabase'
import { formatCents, formatDate, monthEnd, monthStart, todayIso } from './money'

interface Rev { id: string; date: string; gross_cents: number; discounts_cents: number; orders: number | null }

const toCents = (v: string) => Number(v.replace(/\D/g, '')) || 0

export default function Faturamento({ companyId, role }: { companyId: string; role: Role }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7))
  const [rows, setRows] = useState<Rev[]>([])
  const [date, setDate] = useState(todayIso())
  const [gross, setGross] = useState(0)
  const [disc, setDisc] = useState(0)
  const [orders, setOrders] = useState('')
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)
  const canDelete = role === 'dono' || role === 'socio'

  const load = useCallback(async () => {
    const { data } = await supabase.from('revenues').select('id,date,gross_cents,discounts_cents,orders')
      .gte('date', monthStart(month)).lte('date', monthEnd(month)).order('date', { ascending: false })
    setRows((data as Rev[]) ?? [])
  }, [month])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('rev-' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenues', filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId, load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (gross <= 0) return setMsg({ text: 'Informe o faturamento bruto.', error: true })
    if (disc > gross) return setMsg({ text: 'O desconto não pode ser maior que o faturamento.', error: true })
    const { error } = await supabase.from('revenues').insert({
      company_id: companyId, date, gross_cents: gross, discounts_cents: disc,
      orders: orders ? Number(orders) : null, origin: 'Manual',
    })
    if (error) return setMsg({ text: 'Não consegui salvar.', error: true })
    setGross(0); setDisc(0); setOrders('')
    setMsg({ text: 'Faturamento lançado.', error: false })
    load()
  }

  async function remove(id: string) {
    if (!confirm('Apagar este faturamento?')) return
    await supabase.from('revenues').delete().eq('id', id)
    load()
  }

  const net = rows.reduce((s, r) => s + r.gross_cents - r.discounts_cents, 0)

  return (
    <div>
      <div className="head">
        <div>
          <h1 className="title">Faturamento</h1>
          <p className="muted">O que entrou no caixa, dia a dia.</p>
        </div>
        <input type="month" className="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      <div className="stitch" />
      <div className="kpi">
        <span className="kpi-label">Líquido do mês</span>
        <span className="kpi-value">{formatCents(net)}</span>
      </div>

      <form className="card form" onSubmit={save}>
        <div className="row">
          <div>
            <label className="label" htmlFor="fd">Data</label>
            <input id="fd" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="fp">Pedidos (opcional)</label>
            <input id="fp" inputMode="numeric" value={orders} onChange={(e) => setOrders(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <div className="row">
          <div>
            <label className="label" htmlFor="fg">Faturamento bruto</label>
            <input id="fg" className="money" inputMode="numeric" value={formatCents(gross)} onChange={(e) => setGross(toCents(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="fx">Descontos (opcional)</label>
            <input id="fx" className="money" inputMode="numeric" value={formatCents(disc)} onChange={(e) => setDisc(toCents(e.target.value))} />
          </div>
        </div>
        {msg && <p className={'msg' + (msg.error ? ' error' : '')} role="alert">{msg.text}</p>}
        <button className="btn primary block">✔ LANÇAR FATURAMENTO</button>
      </form>

      <h2 className="subtitle">Lançamentos do mês</h2>
      {rows.length === 0 ? <div className="card empty">Nada lançado neste mês.</div> : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} className="item">
              <div className="item-main">
                <div className="item-title">{formatDate(r.date)}</div>
                <div className="muted small">
                  Bruto {formatCents(r.gross_cents)}
                  {r.discounts_cents > 0 && ` · descontos ${formatCents(r.discounts_cents)}`}
                  {r.orders ? ` · ${r.orders} pedidos` : ''}
                </div>
              </div>
              <div className="amount">{formatCents(r.gross_cents - r.discounts_cents)}</div>
              {canDelete && <button className="icon-btn" aria-label="Apagar" onClick={() => remove(r.id)}>🗑</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
