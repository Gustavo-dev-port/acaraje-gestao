import { useCallback, useEffect, useState } from 'react'
import { supabase, supplierName } from './supabase'
import { formatCents, formatDate, todayIso } from './money'
import ExpenseForm, { type ExpenseRecord } from './ExpenseForm'
import Modal from './Modal'

interface Row extends ExpenseRecord {
  suppliers: { nickname: string | null; trade_name: string | null; legal_name: string | null } | null
  categories: { name: string; icon: string } | null
}

export default function Contas({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('id,date,supplier_id,category_id,amount_cents,status,payment_method,invoice_number,due_date,notes,suppliers(nickname,trade_name,legal_name),categories(name,icon)')
      .is('deleted_at', null)
      .in('status', ['Pending', 'AwaitingConfirmation'])
      .order('due_date', { ascending: true, nullsFirst: false })
    if (error) setError('Não consegui carregar as contas.')
    else { setError(''); setRows((data as unknown as Row[]) ?? []) }
    setLoading(false)
  }, [])

  // ao abrir, garante que as contas fixas do mês já estão na lista
  useEffect(() => {
    supabase.rpc('generate_recurrences', { p_company: companyId, p_month: todayIso() }).then(() => load())
  }, [companyId, load])

  useEffect(() => {
    const ch = supabase.channel('contas-' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId, load])

  async function pay(id: string) {
    const { error } = await supabase.from('expenses').update({ status: 'Paid', date: todayIso() }).eq('id', id)
    if (error) setError('Não consegui marcar como paga.')
    else load()
  }

  const today = todayIso()
  const total = rows.reduce((s, r) => s + r.amount_cents, 0)

  return (
    <div>
      <h1 className="title">Contas a pagar</h1>
      <p className="muted">O que ainda não foi pago, da mais próxima para a mais distante.</p>
      <div className="stitch" />
      <div className="kpi">
        <span className="kpi-label">Total a pagar</span>
        <span className="kpi-value">{formatCents(total)}</span>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
      {loading ? <p className="muted">Carregando…</p> : rows.length === 0 ? (
        <div className="card empty">Nenhuma conta pendente. 🎉</div>
      ) : (
        <ul className="list">
          {rows.map((r) => {
            const late = !!r.due_date && r.due_date < today
            const confirm = r.status === 'AwaitingConfirmation'
            return (
              <li key={r.id} className="item">
                <button className="item-hit" onClick={() => setEditing(r)} aria-label="Abrir conta">
                  <div className="item-main">
                    <div className="item-title">{r.categories?.icon} {r.suppliers ? supplierName(r.suppliers) : '—'}</div>
                    <div className="muted small">
                      {r.categories?.name} · vence {r.due_date ? formatDate(r.due_date) : 'sem data'}
                      {late && <b className="late"> · ATRASADA</b>}
                      {confirm && <b className="late"> · CONFIRMAR VALOR</b>}
                    </div>
                  </div>
                  <div className="amount">{formatCents(r.amount_cents)}</div>
                </button>
                <button className="btn small" onClick={() => (confirm ? setEditing(r) : pay(r.id))}>
                  {confirm ? 'Confirmar' : '✔ Paguei'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {editing && (
        <Modal title={editing.status === 'AwaitingConfirmation' ? 'Confirmar conta' : 'Editar conta'} onClose={() => setEditing(null)}>
          <ExpenseForm companyId={companyId} expense={editing} onDone={() => { setEditing(null); load() }} />
        </Modal>
      )}
    </div>
  )
}
