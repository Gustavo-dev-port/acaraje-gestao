import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supplierName, type Role, type Supplier } from './supabase'
import { formatCents, formatDate, todayIso } from './money'
import { fmtPct } from './finance'
import Modal from './Modal'

type Unit = 'kg' | 'g' | 'l' | 'ml' | 'un'
const UNITS: Unit[] = ['kg', 'g', 'l', 'ml', 'un']

interface Ing { id: string; name: string; unit: Unit; active: boolean }
interface Price { ingredient_id: string; date: string; unit_cost_cents: number; quantity: number; paid_cents: number }
interface Prod {
  id: string; name: string; kind: string; menu_category: string | null; sale_price_cents: number | null
  target_cmv: number | null; instructions: string | null; version: number; active: boolean
}
interface Item { id?: string; ingredient_id: string; quantity: number; unit: Unit }

/** quantidade na unidade do insumo; null se as unidades não combinam (ex.: kg × ml) */
function convert(q: number, from: Unit, to: Unit): number | null {
  if (from === to) return q
  if (from === 'kg' && to === 'g') return q * 1000
  if (from === 'g' && to === 'kg') return q / 1000
  if (from === 'l' && to === 'ml') return q * 1000
  if (from === 'ml' && to === 'l') return q / 1000
  return null
}

export default function Fichas({ companyId, role }: { companyId: string; role: Role }) {
  const [view, setView] = useState<'fichas' | 'insumos'>('fichas')
  const [ings, setIngs] = useState<Ing[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [prods, setProds] = useState<Prod[]>([])
  const [items, setItems] = useState<Record<string, Item[]>>({})
  const canEdit = role === 'dono' || role === 'socio'

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('ingredients').select('id,name,unit,active').order('name'),
      supabase.from('ingredient_prices').select('ingredient_id,date,unit_cost_cents,quantity,paid_cents').order('date', { ascending: false }),
      supabase.from('products').select('id,name,kind,menu_category,sale_price_cents,target_cmv,instructions,version,active').order('name'),
      supabase.from('recipe_items').select('id,product_id,ingredient_id,quantity,unit'),
    ])
    setIngs((a.data as Ing[]) ?? [])
    setPrices(((b.data as Price[]) ?? []).map((p) => ({ ...p, unit_cost_cents: Number(p.unit_cost_cents) })))
    setProds((c.data as Prod[]) ?? [])
    const m: Record<string, Item[]> = {}
    for (const r of (d.data as (Item & { product_id: string })[]) ?? []) (m[r.product_id] ??= []).push({ ...r, quantity: Number(r.quantity) })
    setItems(m)
  }, [])
  useEffect(() => { load() }, [load])

  const latest = useMemo(() => {
    const m = new Map<string, Price>()
    for (const p of prices) if (!m.has(p.ingredient_id)) m.set(p.ingredient_id, p) // já vem do mais novo para o mais antigo
    return m
  }, [prices])
  const ingById = useMemo(() => new Map(ings.map((i) => [i.id, i])), [ings])

  const costOf = useCallback((list: Item[]) => {
    let total = 0
    let missing = 0
    for (const it of list) {
      const ing = ingById.get(it.ingredient_id)
      const price = latest.get(it.ingredient_id)
      const q = ing ? convert(it.quantity, it.unit, ing.unit) : null
      if (!ing || !price || q == null) { missing++; continue }
      total += q * price.unit_cost_cents
    }
    return { total, missing }
  }, [ingById, latest])

  return (
    <div>
      <h1 className="title">Ficha técnica</h1>
      <p className="muted">Quanto custa cada prato e quanto sobra de lucro.</p>
      <div className="stitch" />
      <div className="chips" style={{ marginBottom: 14 }}>
        <button className={'chip' + (view === 'fichas' ? ' on' : '')} onClick={() => setView('fichas')}>Fichas</button>
        <button className={'chip' + (view === 'insumos' ? ' on' : '')} onClick={() => setView('insumos')}>Insumos e preços</button>
      </div>
      {view === 'insumos'
        ? <Insumos companyId={companyId} ings={ings} latest={latest} canEdit={canEdit} reload={load} />
        : <FichasLista companyId={companyId} prods={prods} items={items} ings={ings} costOf={costOf} canEdit={canEdit} reload={load} />}
    </div>
  )
}

function Insumos({ companyId, ings, latest, canEdit, reload }: {
  companyId: string; ings: Ing[]; latest: Map<string, Price>; canEdit: boolean; reload: () => void
}) {
  const [edit, setEdit] = useState<Partial<Ing> | null>(null)
  const [price, setPrice] = useState<Ing | null>(null)
  const [sups, setSups] = useState<Supplier[]>([])
  const [qty, setQty] = useState('')
  const [paid, setPaid] = useState(0)
  const [supId, setSupId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('suppliers').select('id,nickname,trade_name,legal_name').then(({ data }) => setSups((data as Supplier[]) ?? []))
  }, [])

  async function saveIng(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    if (!(edit.name ?? '').trim()) return setMsg('Dê um nome ao insumo.')
    const payload = { name: edit.name!.trim(), unit: edit.unit ?? 'kg', active: edit.active ?? true }
    const r = edit.id
      ? await supabase.from('ingredients').update(payload).eq('id', edit.id)
      : await supabase.from('ingredients').insert({ ...payload, company_id: companyId })
    if (r.error) return setMsg('Não consegui salvar.')
    setEdit(null); setMsg(''); reload()
  }

  async function savePrice(e: React.FormEvent) {
    e.preventDefault()
    if (!price) return
    const q = Number(qty.replace(',', '.'))
    if (!(q > 0)) return setMsg('Informe a quantidade comprada.')
    if (paid <= 0) return setMsg('Informe quanto você pagou.')
    const { error } = await supabase.from('ingredient_prices').insert({
      company_id: companyId, ingredient_id: price.id, supplier_id: supId || null, date, quantity: q, paid_cents: paid,
    })
    if (error) return setMsg('Não consegui salvar o preço.')
    setPrice(null); setMsg(''); reload()
  }

  return (
    <>
      {canEdit && <button className="btn primary" style={{ marginBottom: 12 }} onClick={() => { setMsg(''); setEdit({ unit: 'kg', active: true }) }}>➕ Novo insumo</button>}
      {ings.length === 0 ? <div className="card empty">Nenhum insumo cadastrado.</div> : (
        <ul className="list">
          {ings.map((i) => {
            const p = latest.get(i.id)
            return (
              <li key={i.id} className="item">
                <button className="item-hit" disabled={!canEdit} onClick={() => { setMsg(''); setEdit(i) }}>
                  <div className="item-main">
                    <div className={'item-title' + (i.active ? '' : ' off')}>{i.name}</div>
                    <div className="muted small">{p ? `${formatCents(Math.round(p.unit_cost_cents))} por ${i.unit} · pago em ${formatDate(p.date)}` : 'sem preço ainda'}</div>
                  </div>
                </button>
                {canEdit && <button className="btn small" onClick={() => { setMsg(''); setQty(''); setPaid(0); setSupId(''); setDate(todayIso()); setPrice(i) }}>Atualizar preço</button>}
              </li>
            )
          })}
        </ul>
      )}
      {edit && (
        <Modal title={edit.id ? 'Editar insumo' : 'Novo insumo'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={saveIng}>
            <label className="label" htmlFor="in">Nome</label>
            <input id="in" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <label className="label">Você compra em</label>
            <div className="chips">
              {UNITS.map((u) => <button type="button" key={u} className={'chip' + (edit.unit === u ? ' on' : '')} onClick={() => setEdit({ ...edit, unit: u })}>{u}</button>)}
            </div>
            <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Insumo ativo</label>
            {msg && <p className="msg error" role="alert">{msg}</p>}
            <button className="btn primary block">✔ SALVAR</button>
          </form>
        </Modal>
      )}
      {price && (
        <Modal title={`Preço de ${price.name}`} onClose={() => setPrice(null)}>
          <form className="form" onSubmit={savePrice}>
            <div className="row">
              <div>
                <label className="label" htmlFor="pq">Quantidade comprada ({price.unit})</label>
                <input id="pq" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="pp">Quanto pagou</label>
                <input id="pp" className="money" inputMode="numeric" value={formatCents(paid)} onChange={(e) => setPaid(Number(e.target.value.replace(/\D/g, '')) || 0)} />
              </div>
            </div>
            <div className="row">
              <div>
                <label className="label" htmlFor="pd">Data</label>
                <input id="pd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="ps">Fornecedor (opcional)</label>
                <select id="ps" value={supId} onChange={(e) => setSupId(e.target.value)}>
                  <option value="">—</option>
                  {sups.map((s) => <option key={s.id} value={s.id}>{supplierName(s)}</option>)}
                </select>
              </div>
            </div>
            {msg && <p className="msg error" role="alert">{msg}</p>}
            <button className="btn primary block">✔ SALVAR PREÇO</button>
          </form>
        </Modal>
      )}
    </>
  )
}

function FichasLista({ companyId, prods, items, ings, costOf, canEdit, reload }: {
  companyId: string; prods: Prod[]; items: Record<string, Item[]>; ings: Ing[]
  costOf: (l: Item[]) => { total: number; missing: number }; canEdit: boolean; reload: () => void
}) {
  const [edit, setEdit] = useState<Partial<Prod> | null>(null)
  const [list, setList] = useState<Item[]>([])
  const [sale, setSale] = useState(0)
  const [msg, setMsg] = useState('')

  function open(p: Partial<Prod>) {
    setMsg('')
    setEdit(p)
    setSale(p.sale_price_cents ?? 0)
    setList(p.id ? (items[p.id] ?? []).map((x) => ({ ...x })) : [])
  }

  const cost = costOf(list)
  const cmv = sale > 0 ? (cost.total / sale) * 100 : null
  const suggested = edit?.target_cmv && cost.total > 0 ? Math.round(cost.total / (edit.target_cmv / 100)) : null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    if (!(edit.name ?? '').trim()) return setMsg('Dê um nome à ficha.')
    if (list.some((i) => !i.ingredient_id || !(i.quantity > 0))) return setMsg('Complete os ingredientes (insumo e quantidade).')
    const payload = {
      name: edit.name!.trim(), kind: edit.kind ?? 'cozinha', menu_category: edit.menu_category?.trim() || null,
      sale_price_cents: sale || null, target_cmv: edit.target_cmv ?? null, instructions: edit.instructions?.trim() || null,
      active: edit.active ?? true,
    }
    let id = edit.id
    if (id) {
      const { error } = await supabase.from('products').update({ ...payload, version: (edit.version ?? 1) + 1 }).eq('id', id)
      if (error) return setMsg('Não consegui salvar.')
      await supabase.from('recipe_items').delete().eq('product_id', id)
    } else {
      const { data, error } = await supabase.from('products').insert({ ...payload, company_id: companyId }).select('id').single()
      if (error || !data) return setMsg('Não consegui salvar.')
      id = data.id
    }
    if (list.length) {
      const { error } = await supabase.from('recipe_items').insert(
        list.map((i) => ({ company_id: companyId, product_id: id!, ingredient_id: i.ingredient_id, quantity: i.quantity, unit: i.unit })))
      if (error) return setMsg('A ficha foi salva, mas os ingredientes não. Tente de novo.')
    }
    setEdit(null); reload()
  }

  async function remove(p: Prod) {
    if (!confirm(`Apagar a ficha "${p.name}"?`)) return
    await supabase.from('products').delete().eq('id', p.id)
    reload()
  }

  return (
    <>
      {canEdit && <button className="btn primary" style={{ marginBottom: 12 }} onClick={() => open({ kind: 'cozinha', active: true, target_cmv: 30 })}>➕ Nova ficha</button>}
      {prods.length === 0 ? <div className="card empty">Nenhuma ficha ainda. Cadastre os insumos primeiro.</div> : (
        <ul className="list">
          {prods.map((p) => {
            const c = costOf(items[p.id] ?? [])
            const m = p.sale_price_cents ? (c.total / p.sale_price_cents) * 100 : null
            const over = m != null && p.target_cmv != null && m > p.target_cmv
            return (
              <li key={p.id} className="item">
                <button className="item-hit" onClick={() => open(p)}>
                  <div className="item-main">
                    <div className={'item-title' + (p.active ? '' : ' off')}>{p.kind === 'bar' ? '🍹' : '🍤'} {p.name}</div>
                    <div className="muted small">
                      custo {formatCents(Math.round(c.total))}{p.sale_price_cents ? ` · venda ${formatCents(p.sale_price_cents)}` : ''}
                      {c.missing > 0 && <b className="late"> · {c.missing} insumo(s) sem preço</b>}
                    </div>
                  </div>
                  <div className="item-side">
                    <div className={'amount' + (over ? ' late' : '')}>{fmtPct(m)}</div>
                    <div className="muted small">CMV{p.target_cmv != null ? ` (meta ${p.target_cmv}%)` : ''}</div>
                  </div>
                </button>
                {canEdit && <button className="icon-btn" aria-label="Apagar" onClick={() => remove(p)}>🗑</button>}
              </li>
            )
          })}
        </ul>
      )}
      {edit && (
        <Modal title={edit.id ? 'Editar ficha' : 'Nova ficha'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={save}>
            <label className="label" htmlFor="fn">Nome do prato ou drink</label>
            <input id="fn" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} disabled={!canEdit} />
            <label className="label">Tipo</label>
            <div className="chips">
              <button type="button" className={'chip' + (edit.kind !== 'bar' ? ' on' : '')} onClick={() => setEdit({ ...edit, kind: 'cozinha' })}>🍤 Cozinha</button>
              <button type="button" className={'chip' + (edit.kind === 'bar' ? ' on' : '')} onClick={() => setEdit({ ...edit, kind: 'bar' })}>🍹 Bar</button>
            </div>
            <div className="row">
              <div>
                <label className="label" htmlFor="fv">Preço de venda</label>
                <input id="fv" className="money" inputMode="numeric" value={formatCents(sale)} onChange={(e) => setSale(Number(e.target.value.replace(/\D/g, '')) || 0)} />
              </div>
              <div>
                <label className="label" htmlFor="fm">CMV desejado (%)</label>
                <input id="fm" type="number" min={1} max={100} value={edit.target_cmv ?? ''} onChange={(e) => setEdit({ ...edit, target_cmv: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <label className="label" htmlFor="fc">Categoria no cardápio (opcional)</label>
            <input id="fc" value={edit.menu_category ?? ''} onChange={(e) => setEdit({ ...edit, menu_category: e.target.value })} />

            <h3 className="subtitle" style={{ fontSize: 17 }}>Ingredientes</h3>
            {list.map((it, idx) => (
              <div key={idx} className="ing-row">
                <select aria-label="Insumo" value={it.ingredient_id} onChange={(e) => setList(list.map((x, j) => (j === idx ? { ...x, ingredient_id: e.target.value, unit: ings.find((g) => g.id === e.target.value)?.unit ?? x.unit } : x)))}>
                  <option value="">Insumo…</option>
                  {ings.filter((g) => g.active || g.id === it.ingredient_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <input aria-label="Quantidade" inputMode="decimal" value={it.quantity || ''} onChange={(e) => setList(list.map((x, j) => (j === idx ? { ...x, quantity: Number(e.target.value.replace(',', '.')) || 0 } : x)))} />
                <select aria-label="Unidade" value={it.unit} onChange={(e) => setList(list.map((x, j) => (j === idx ? { ...x, unit: e.target.value as Unit } : x)))}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <button type="button" className="icon-btn" aria-label="Tirar ingrediente" onClick={() => setList(list.filter((_, j) => j !== idx))}>✖</button>
              </div>
            ))}
            <button type="button" className="btn small" onClick={() => setList([...list, { ingredient_id: '', quantity: 0, unit: 'g' }])}>➕ Ingrediente</button>

            <div className="summary">
              <div>Custo do prato: <b>{formatCents(Math.round(cost.total))}</b></div>
              <div>CMV: <b className={cmv != null && edit.target_cmv != null && cmv > edit.target_cmv ? 'late' : ''}>{fmtPct(cmv)}</b>
                {sale > 0 && <> · lucro por prato: <b>{formatCents(Math.round(sale - cost.total))}</b></>}</div>
              {suggested != null && <div>Preço sugerido para CMV de {edit.target_cmv}%: <b>{formatCents(suggested)}</b></div>}
              {cost.missing > 0 && <div className="late">Falta preço ou unidade compatível em {cost.missing} ingrediente(s).</div>}
            </div>

            <label className="label" htmlFor="fi">Modo de preparo (opcional)</label>
            <textarea id="fi" rows={4} value={edit.instructions ?? ''} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} />
            {msg && <p className="msg error" role="alert">{msg}</p>}
            {canEdit && <button className="btn primary block">✔ SALVAR FICHA</button>}
          </form>
        </Modal>
      )}
    </>
  )
}
