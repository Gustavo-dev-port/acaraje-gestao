import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supplierName, type Category, type Role } from './supabase'
import Modal from './Modal'

interface Sup {
  id: string; cnpj: string | null; legal_name: string | null; trade_name: string | null; nickname: string | null
  city: string | null; state: string | null; default_category_id: string | null; is_complete: boolean
}

const onlyDigits = (s: string) => s.replace(/\D/g, '')
const maskCnpj = (s: string) => {
  const d = onlyDigits(s).slice(0, 14)
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

export default function Fornecedores({ companyId, role }: { companyId: string; role: Role }) {
  const [rows, setRows] = useState<Sup[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Sup> | null>(null)
  const [msg, setMsg] = useState('')
  const canEdit = role === 'dono' || role === 'socio'

  const load = useCallback(async () => {
    const { data } = await supabase.from('suppliers')
      .select('id,cnpj,legal_name,trade_name,nickname,city,state,default_category_id,is_complete')
    const list = (data as Sup[]) ?? []
    list.sort((a, b) => supplierName(a).localeCompare(supplierName(b), 'pt-BR'))
    setRows(list)
  }, [])
  useEffect(() => {
    load()
    supabase.from('categories').select('id,name,parent_id,icon,active,sort_order').eq('active', true).order('sort_order')
      .then(({ data }) => setCats(((data as Category[]) ?? []).filter((c) => c.parent_id)))
  }, [load])
  useEffect(() => {
    const ch = supabase.channel('sup-' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers', filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId, load])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? rows.filter((r) => `${supplierName(r)} ${r.legal_name ?? ''} ${r.cnpj ?? ''}`.toLowerCase().includes(n)) : rows
  }, [rows, q])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    setMsg('')
    const cnpj = onlyDigits(edit.cnpj ?? '')
    if (cnpj && cnpj.length !== 14) return setMsg('O CNPJ precisa ter 14 números.')
    if (!(edit.nickname ?? '').trim() && !(edit.legal_name ?? '').trim()) return setMsg('Dê um nome ao fornecedor.')
    const payload = {
      nickname: (edit.nickname ?? '').trim() || null,
      legal_name: (edit.legal_name ?? '').trim() || null,
      cnpj: cnpj || null,
      default_category_id: edit.default_category_id || null,
      is_complete: true,
    }
    const r = edit.id
      ? await supabase.from('suppliers').update(payload).eq('id', edit.id)
      : await supabase.from('suppliers').insert({ ...payload, company_id: companyId })
    if (r.error) return setMsg(r.error.code === '23505' ? 'Já existe um fornecedor com esse CNPJ.' : 'Não consegui salvar.')
    setEdit(null)
    load()
  }

  async function remove(s: Sup) {
    if (!confirm(`Apagar "${supplierName(s)}"?`)) return
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    if (error) alert('Esse fornecedor já tem lançamentos, então não pode ser apagado.')
    else load()
  }

  return (
    <div>
      <div className="head">
        <div>
          <h1 className="title">Fornecedores</h1>
          <p className="muted">Quem você compra e paga.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => { setMsg(''); setEdit({}) }}>➕ Novo</button>}
      </div>
      <div className="stitch" />
      <input type="search" placeholder="Buscar fornecedor" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Buscar fornecedor" />
      {shown.length === 0 ? <div className="card empty">Nenhum fornecedor.</div> : (
        <ul className="list">
          {shown.map((s) => (
            <li key={s.id} className="item">
              <button className="item-hit" disabled={!canEdit} onClick={() => { setMsg(''); setEdit({ ...s, cnpj: s.cnpj ? maskCnpj(s.cnpj) : '' }) }}>
                <div className="item-main">
                  <div className="item-title">{supplierName(s)}</div>
                  <div className="muted small">
                    {s.cnpj ? maskCnpj(s.cnpj) : 'sem CNPJ'}{!s.is_complete && ' · cadastro incompleto'}
                  </div>
                </div>
              </button>
              {canEdit && <button className="icon-btn" aria-label="Apagar" onClick={() => remove(s)}>🗑</button>}
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <Modal title={edit.id ? 'Editar fornecedor' : 'Novo fornecedor'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={save}>
            <label className="label" htmlFor="sn">Nome de uso (como você chama)</label>
            <input id="sn" value={edit.nickname ?? ''} onChange={(e) => setEdit({ ...edit, nickname: e.target.value })} />
            <label className="label" htmlFor="sl">Razão social (opcional)</label>
            <input id="sl" value={edit.legal_name ?? ''} onChange={(e) => setEdit({ ...edit, legal_name: e.target.value })} />
            <label className="label" htmlFor="sc">CNPJ (opcional)</label>
            <input id="sc" inputMode="numeric" value={edit.cnpj ?? ''} onChange={(e) => setEdit({ ...edit, cnpj: maskCnpj(e.target.value) })} />
            <label className="label" htmlFor="sk">Categoria usual (opcional)</label>
            <select id="sk" value={edit.default_category_id ?? ''} onChange={(e) => setEdit({ ...edit, default_category_id: e.target.value || null })}>
              <option value="">—</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {msg && <p className="msg error" role="alert">{msg}</p>}
            <button className="btn primary block">✔ SALVAR</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
