import { useCallback, useEffect, useState } from 'react'
import { supabase, supplierName, type Category, type Supplier } from './supabase'
import { formatCents, todayIso } from './money'
import Modal from './Modal'

interface Rec {
  id: string; description: string; supplier_id: string; category_id: string; default_amount_cents: number
  day_of_month: number; start_date: string; end_date: string | null; active: boolean; needs_confirmation: boolean
  suppliers: { nickname: string | null; trade_name: string | null; legal_name: string | null } | null
}

export default function ContasFixas({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<Rec[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [sups, setSups] = useState<Supplier[]>([])
  const [edit, setEdit] = useState<Partial<Rec> | null>(null)
  const [cents, setCents] = useState(0)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('recurrences')
      .select('id,description,supplier_id,category_id,default_amount_cents,day_of_month,start_date,end_date,active,needs_confirmation,suppliers(nickname,trade_name,legal_name)')
      .order('day_of_month')
    setRows((data as unknown as Rec[]) ?? [])
  }, [])
  useEffect(() => {
    load()
    supabase.from('categories').select('id,name,parent_id,icon,active,sort_order').eq('active', true).order('sort_order')
      .then(({ data }) => setCats(((data as Category[]) ?? []).filter((c) => c.parent_id)))
    supabase.from('suppliers').select('id,nickname,trade_name,legal_name').then(({ data }) => {
      const l = (data as Supplier[]) ?? []
      l.sort((a, b) => supplierName(a).localeCompare(supplierName(b), 'pt-BR'))
      setSups(l)
    })
  }, [load])

  function open(r: Partial<Rec>) {
    setMsg('')
    setEdit(r)
    setCents(r.default_amount_cents ?? 0)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    setMsg('')
    if (!(edit.description ?? '').trim()) return setMsg('Dê um nome à conta (ex.: Aluguel).')
    if (!edit.supplier_id) return setMsg('Escolha o fornecedor.')
    if (!edit.category_id) return setMsg('Escolha a categoria.')
    const day = Number(edit.day_of_month)
    if (!(day >= 1 && day <= 31)) return setMsg('O dia do vencimento vai de 1 a 31.')
    if (edit.end_date && edit.start_date && edit.end_date < edit.start_date) return setMsg('O fim não pode ser antes do início.')
    const payload = {
      description: edit.description!.trim(), supplier_id: edit.supplier_id, category_id: edit.category_id,
      default_amount_cents: cents, day_of_month: day, start_date: edit.start_date || todayIso(),
      end_date: edit.end_date || null, active: edit.active ?? true, needs_confirmation: edit.needs_confirmation ?? true,
    }
    const r = edit.id
      ? await supabase.from('recurrences').update(payload).eq('id', edit.id)
      : await supabase.from('recurrences').insert({ ...payload, company_id: companyId })
    if (r.error) return setMsg('Não consegui salvar.')
    await supabase.rpc('generate_recurrences', { p_company: companyId, p_month: todayIso() })
    setEdit(null)
    load()
  }

  async function remove(r: Rec) {
    if (!confirm(`Apagar a conta fixa "${r.description}"? Os lançamentos já feitos continuam.`)) return
    const { error } = await supabase.from('recurrences').delete().eq('id', r.id)
    if (error) alert('Essa conta já gerou lançamentos. Desative-a em vez de apagar.')
    else load()
  }

  return (
    <div>
      <div className="head">
        <div>
          <h1 className="title">Contas fixas</h1>
          <p className="muted">Aluguel, luz, internet… entram sozinhas todo mês em Contas a pagar.</p>
        </div>
        <button className="btn primary" onClick={() => open({ active: true, needs_confirmation: true, day_of_month: 5, start_date: todayIso() })}>➕ Nova</button>
      </div>
      <div className="stitch" />
      {rows.length === 0 ? <div className="card empty">Nenhuma conta fixa ainda.</div> : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} className="item">
              <button className="item-hit" onClick={() => open(r)}>
                <div className="item-main">
                  <div className={'item-title' + (r.active ? '' : ' off')}>{r.description}</div>
                  <div className="muted small">
                    {r.suppliers ? supplierName(r.suppliers) : ''} · todo dia {r.day_of_month}
                    {r.needs_confirmation ? ' · confirmar valor' : ''}{!r.active && ' · desativada'}
                  </div>
                </div>
                <div className="amount">{formatCents(r.default_amount_cents)}</div>
              </button>
              <button className="icon-btn" aria-label="Apagar" onClick={() => remove(r)}>🗑</button>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <Modal title={edit.id ? 'Editar conta fixa' : 'Nova conta fixa'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={save}>
            <label className="label" htmlFor="rd">Nome da conta</label>
            <input id="rd" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <label className="label" htmlFor="rs">Fornecedor</label>
            <select id="rs" value={edit.supplier_id ?? ''} onChange={(e) => setEdit({ ...edit, supplier_id: e.target.value })}>
              <option value="">Escolha…</option>
              {sups.map((s) => <option key={s.id} value={s.id}>{supplierName(s)}</option>)}
            </select>
            <label className="label" htmlFor="rc">Categoria</label>
            <select id="rc" value={edit.category_id ?? ''} onChange={(e) => setEdit({ ...edit, category_id: e.target.value })}>
              <option value="">Escolha…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="row">
              <div>
                <label className="label" htmlFor="ra">Valor usual</label>
                <input id="ra" className="money" inputMode="numeric" value={formatCents(cents)} onChange={(e) => setCents(Number(e.target.value.replace(/\D/g, '')) || 0)} />
              </div>
              <div>
                <label className="label" htmlFor="rm">Dia do vencimento</label>
                <input id="rm" type="number" min={1} max={31} value={edit.day_of_month ?? ''} onChange={(e) => setEdit({ ...edit, day_of_month: Number(e.target.value) })} />
              </div>
            </div>
            <div className="row">
              <div>
                <label className="label" htmlFor="ri">Começa em</label>
                <input id="ri" type="date" value={edit.start_date ?? ''} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="rf">Termina em (opcional)</label>
                <input id="rf" type="date" value={edit.end_date ?? ''} onChange={(e) => setEdit({ ...edit, end_date: e.target.value || null })} />
              </div>
            </div>
            <label className="check"><input type="checkbox" checked={edit.needs_confirmation ?? true} onChange={(e) => setEdit({ ...edit, needs_confirmation: e.target.checked })} /> O valor muda todo mês (pedir para confirmar)</label>
            <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Conta ativa</label>
            {msg && <p className="msg error" role="alert">{msg}</p>}
            <button className="btn primary block">✔ SALVAR</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
