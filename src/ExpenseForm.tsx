import { useEffect, useMemo, useState } from 'react'
import { supabase, supplierName, PAYMENT_METHODS, type Category, type Supplier } from './supabase'
import { formatCents, todayIso } from './money'

const NEW = '__new__'
const BUCKET = 'attachments'

export interface ExpenseRecord {
  id: string
  date: string
  supplier_id: string
  category_id: string
  amount_cents: number
  payment_method: string | null
  invoice_number: string | null
  due_date: string | null
  status: string
  notes: string | null
}

interface Att { id: string; path: string; kind: string }

export default function ExpenseForm({ companyId, expense, onDone }: { companyId: string; expense?: ExpenseRecord; onDone: () => void }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [date, setDate] = useState(expense?.date ?? todayIso())
  const [cents, setCents] = useState(expense?.amount_cents ?? 0)
  const [supplierId, setSupplierId] = useState(expense?.supplier_id ?? '')
  const [newSupplier, setNewSupplier] = useState('')
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? '')
  const [method, setMethod] = useState(expense?.payment_method ?? 'Pix')
  const [paid, setPaid] = useState(expense ? expense.status === 'Paid' : true)
  const [dueDate, setDueDate] = useState(expense?.due_date ?? todayIso())
  const [invoice, setInvoice] = useState(expense?.invoice_number ?? '')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [atts, setAtts] = useState<Att[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    supabase.from('categories').select('id,name,parent_id,icon,active,sort_order').eq('active', true).order('sort_order')
      .then(({ data }) => setCategories((data as Category[]) ?? []))
    supabase.from('suppliers').select('id,nickname,trade_name,legal_name').then(({ data }) => {
      const list = (data as Supplier[]) ?? []
      list.sort((a, b) => supplierName(a).localeCompare(supplierName(b), 'pt-BR'))
      setSuppliers(list)
    })
    if (expense) {
      supabase.from('attachments').select('id,path,kind').eq('expense_id', expense.id)
        .then(({ data }) => setAtts((data as Att[]) ?? []))
    }
  }, [expense])

  const groups = useMemo(() => {
    const parents = categories.filter((c) => !c.parent_id)
    return parents.map((p) => ({ parent: p, children: categories.filter((c) => c.parent_id === p.id) }))
  }, [categories])

  async function openAtt(a: Att) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function removeAtt(a: Att) {
    if (!confirm('Remover este anexo?')) return
    await supabase.storage.from(BUCKET).remove([a.path])
    await supabase.from('attachments').delete().eq('id', a.id)
    setAtts((l) => l.filter((x) => x.id !== a.id))
  }

  async function upload(expenseId: string, f: File) {
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const d = new Date()
    const path = `${companyId}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined })
    if (up.error) return false
    const kind = f.type === 'application/pdf' ? 'pdf' : 'image'
    const ins = await supabase.from('attachments').insert({ company_id: companyId, expense_id: expenseId, path, kind })
    return !ins.error
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (cents <= 0) return setMsg({ text: 'Informe o valor.', error: true })
    if (!categoryId) return setMsg({ text: 'Escolha a categoria.', error: true })
    if (!supplierId) return setMsg({ text: 'Escolha o fornecedor.', error: true })
    if (supplierId === NEW && !newSupplier.trim()) return setMsg({ text: 'Digite o nome do fornecedor.', error: true })

    setBusy(true)
    let sid = supplierId
    if (supplierId === NEW) {
      const { data, error } = await supabase.from('suppliers')
        .insert({ company_id: companyId, nickname: newSupplier.trim(), is_complete: false }).select('id').single()
      if (error || !data) { setBusy(false); return setMsg({ text: 'Não consegui cadastrar o fornecedor.', error: true }) }
      sid = data.id
    }
    const payload = {
      date, supplier_id: sid, category_id: categoryId, amount_cents: cents, payment_method: method,
      invoice_number: invoice.trim() || null, due_date: paid ? null : dueDate,
      status: paid ? 'Paid' : 'Pending', // editar uma conta "a confirmar" já a confirma
      notes: notes.trim() || null,
    }
    let id = expense?.id
    if (expense) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', expense.id)
      if (error) { setBusy(false); return setMsg({ text: 'Não consegui salvar. Tente de novo.', error: true }) }
    } else {
      const { data, error } = await supabase.from('expenses')
        .insert({ ...payload, company_id: companyId, origin: 'Manual' }).select('id').single()
      if (error || !data) { setBusy(false); return setMsg({ text: 'Não consegui salvar o gasto. Tente de novo.', error: true }) }
      id = data.id
    }
    let failed = 0
    for (const f of files) if (!(await upload(id!, f))) failed++
    setBusy(false)
    if (failed) return setMsg({ text: `Gasto salvo, mas ${failed} anexo(s) não subiram. Abra o lançamento para tentar de novo.`, error: true })
    onDone()
  }

  return (
    <form className="form" onSubmit={save}>
      <div className="row">
        <div>
          <label className="label" htmlFor="valor">Valor</label>
          <input id="valor" className="money" inputMode="numeric" value={formatCents(cents)}
                 onChange={(e) => setCents(Number(e.target.value.replace(/\D/g, '')) || 0)} />
        </div>
        <div>
          <label className="label" htmlFor="data">Data</label>
          <input id="data" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>

      <label className="label" htmlFor="forn">Fornecedor</label>
      <select id="forn" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
        <option value="">Escolha…</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{supplierName(s)}</option>)}
        <option value={NEW}>➕ Novo fornecedor…</option>
      </select>
      {supplierId === NEW && <input placeholder="Nome do fornecedor" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />}

      <label className="label" htmlFor="cat">Categoria</label>
      <select id="cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Escolha…</option>
        {groups.map(({ parent, children }) =>
          children.length ? (
            <optgroup key={parent.id} label={`${parent.icon} ${parent.name}`}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ) : <option key={parent.id} value={parent.id}>{parent.icon} {parent.name}</option>,
        )}
      </select>

      <label className="label">Forma de pagamento</label>
      <div className="chips">
        {PAYMENT_METHODS.map((m) => (
          <button type="button" key={m.value} className={'chip' + (method === m.value ? ' on' : '')} onClick={() => setMethod(m.value)}>{m.label}</button>
        ))}
      </div>

      <label className="label">Situação</label>
      <div className="chips">
        <button type="button" className={'chip' + (paid ? ' on' : '')} onClick={() => setPaid(true)}>Já paguei</button>
        <button type="button" className={'chip' + (!paid ? ' on' : '')} onClick={() => setPaid(false)}>Vou pagar (conta)</button>
      </div>
      {!paid && (
        <>
          <label className="label" htmlFor="venc">Vencimento</label>
          <input id="venc" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </>
      )}

      <div className="row">
        <div>
          <label className="label" htmlFor="nf">Nota / documento (opcional)</label>
          <input id="nf" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="obs">Observação (opcional)</label>
          <input id="obs" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <label className="label" htmlFor="anexo">Foto ou PDF da nota (opcional)</label>
      <input id="anexo" type="file" accept="image/*,application/pdf" multiple capture={undefined}
             onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      {atts.length > 0 && (
        <ul className="att-list">
          {atts.map((a) => (
            <li key={a.id}>
              <button type="button" className="link inline" onClick={() => openAtt(a)}>{a.kind === 'pdf' ? '📄 PDF' : '🖼 Imagem'} — abrir</button>
              <button type="button" className="icon-btn" aria-label="Remover anexo" onClick={() => removeAtt(a)}>🗑</button>
            </li>
          ))}
        </ul>
      )}

      {msg && <p className={'msg' + (msg.error ? ' error' : '')} role="alert">{msg.text}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Salvando…' : '✔ SALVAR'}</button>
    </form>
  )
}
