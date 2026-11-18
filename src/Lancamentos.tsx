import { useCallback, useEffect, useState } from 'react'
import { supabase, supplierName, PAYMENT_METHODS, type Role } from './supabase'
import { formatCents, formatDate, monthEnd, monthStart, todayIso } from './money'
import ExpenseForm, { type ExpenseRecord } from './ExpenseForm'
import Modal from './Modal'

interface Row extends ExpenseRecord {
  suppliers: { nickname: string | null; trade_name: string | null; legal_name: string | null } | null
  categories: { name: string; icon: string } | null
}

const STATUS: Record<string, string> = { Paid: 'Pago', Pending: 'A pagar', AwaitingConfirmation: 'Confirmar' }
const methodLabel = (v: string | null) => PAYMENT_METHODS.find((m) => m.value === v)?.label ?? v ?? ''

export default function Lancamentos({ companyId, role }: { companyId: string; role: Role }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7))
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const [q, setQ] = useState('')
  const canDelete = role === 'dono' || role === 'socio'

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('id,date,supplier_id,category_id,amount_cents,status,payment_method,invoice_number,due_date,notes,suppliers(nickname,trade_name,legal_name),categories(name,icon)')
      .is('deleted_at', null)
      .gte('date', monthStart(month))
      .lte('date', monthEnd(month))
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) setError('Não consegui carregar os lançamentos.')
    else { setError(''); setRows((data as unknown as Row[]) ?? []) }
    setLoading(false)
  }, [month])

  useEffect(() => { setLoading(true); load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel('expenses-' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId, load])

  async function remove(id: string) {
    if (!confirm('Apagar este lançamento? Ele vai para a lixeira.')) return
    const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) setError('Não consegui apagar.')
    else load()
  }

  const needle = q.trim().toLowerCase()
  const shown = needle
    ? rows.filter((r) => `${r.suppliers ? supplierName(r.suppliers) : ''} ${r.categories?.name ?? ''} ${r.notes ?? ''}`.toLowerCase().includes(needle))
    : rows
  const total = shown.reduce((s, r) => s + r.amount_cents, 0)

  return (
    <div>
      <div className="head">
        <div>
          <h1 className="title">Lançamentos</h1>
          <p className="muted">Atualiza sozinho quando alguém lança em outro aparelho.</p>
        </div>
        <input type="month" className="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      <div className="stitch" />
      <div className="kpi">
        <span className="kpi-label">Total {needle ? 'da busca' : 'do mês'}</span>
        <span className="kpi-value">{formatCents(total)}</span>
        <span className="muted">{shown.length} lançamento{shown.length === 1 ? '' : 's'}</span>
      </div>
      <input type="search" placeholder="Buscar por fornecedor, categoria ou observação" value={q}
             onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Buscar lançamentos" />
      {error && <p className="msg error" role="alert">{error}</p>}
      {loading ? <p className="muted">Carregando…</p> : shown.length === 0 ? (
        <div className="card empty">Nenhum gasto {needle ? 'encontrado' : 'neste mês'}. Use <b>Lançar gasto</b> para começar.</div>
      ) : (
        <ul className="list">
          {shown.map((r) => (
            <li key={r.id} className="item">
              <button className="item-hit" onClick={() => setEditing(r)} aria-label="Abrir lançamento">
                <div className="item-main">
                  <div className="item-title">{r.categories?.icon} {r.suppliers ? supplierName(r.suppliers) : '—'}</div>
                  <div className="muted small">
                    {formatDate(r.date)} · {r.categories?.name} · {methodLabel(r.payment_method)}{r.notes ? ` · ${r.notes}` : ''}
                  </div>
                </div>
                <div className="item-side">
                  <div className="amount">{formatCents(r.amount_cents)}</div>
                  <span className={'badge ' + r.status}>{STATUS[r.status] ?? r.status}</span>
                </div>
              </button>
              {canDelete && <button className="icon-btn" aria-label="Apagar" onClick={() => remove(r.id)}>🗑</button>}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <Modal title="Editar lançamento" onClose={() => setEditing(null)}>
          <ExpenseForm companyId={companyId} expense={editing} onDone={() => { setEditing(null); load() }} />
        </Modal>
      )}
    </div>
  )
}
