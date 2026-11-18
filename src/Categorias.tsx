import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { formatCents } from './money'
import Modal from './Modal'

interface Cat {
  id: string; name: string; parent_id: string | null; cost_group: string
  icon: string; color: string; active: boolean; sort_order: number
}

export const GROUPS: Record<string, string> = {
  Cmv: 'Custo da mercadoria (CMV)', Fixed: 'Despesa fixa', Variable: 'Despesa variável', Tax: 'Impostos',
}

export default function Categorias({ companyId }: { companyId: string }) {
  const [cats, setCats] = useState<Cat[]>([])
  const [goals, setGoals] = useState<Record<string, number>>({})
  const [edit, setEdit] = useState<Partial<Cat> | null>(null)
  const [goalText, setGoalText] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const c = await supabase.from('categories').select('id,name,parent_id,cost_group,icon,color,active,sort_order').order('sort_order')
    setCats((c.data as Cat[]) ?? [])
    const g = await supabase.from('category_goals').select('category_id,monthly_limit_cents')
    const map: Record<string, number> = {}
    for (const r of (g.data as { category_id: string; monthly_limit_cents: number }[]) ?? []) map[r.category_id] = r.monthly_limit_cents
    setGoals(map)
  }, [])
  useEffect(() => { load() }, [load])

  const parents = cats.filter((c) => !c.parent_id)

  function open(c: Partial<Cat>) {
    setMsg('')
    setEdit(c)
    setGoalText(c.id && goals[c.id] ? formatCents(goals[c.id]) : '')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    setMsg('')
    const name = (edit.name ?? '').trim()
    if (!name) return setMsg('Dê um nome à categoria.')
    if (edit.color && !/^#[0-9a-fA-F]{6}$/.test(edit.color)) return setMsg('Cor inválida. Exemplo: #B8471A')
    const payload = {
      name, parent_id: edit.parent_id || null, cost_group: edit.cost_group ?? 'Variable',
      icon: edit.icon ?? '', color: edit.color || '#6B6B6B', active: edit.active ?? true,
    }
    let id = edit.id
    if (id) {
      const { error } = await supabase.from('categories').update(payload).eq('id', id)
      if (error) return setMsg('Não consegui salvar.')
    } else {
      const { data, error } = await supabase.from('categories')
        .insert({ ...payload, company_id: companyId, sort_order: cats.length }).select('id').single()
      if (error || !data) return setMsg('Não consegui salvar.')
      id = data.id
    }
    const cents = Number(goalText.replace(/\D/g, '')) || 0
    if (cents > 0) await supabase.from('category_goals').upsert({ company_id: companyId, category_id: id!, monthly_limit_cents: cents })
    else await supabase.from('category_goals').delete().eq('category_id', id!)
    setEdit(null)
    load()
  }

  return (
    <div>
      <div className="head">
        <div>
          <h1 className="title">Categorias</h1>
          <p className="muted">Grupo, categoria e meta de gasto por mês.</p>
        </div>
        <button className="btn primary" onClick={() => open({ cost_group: 'Variable', active: true, icon: '📦', color: '#6B6B6B' })}>➕ Nova</button>
      </div>
      <div className="stitch" />
      {parents.map((p) => (
        <div key={p.id} className="cat-group">
          <button className="cat-parent" onClick={() => open(p)}>
            <span>{p.icon} <b>{p.name}</b></span><span className="muted small">{GROUPS[p.cost_group]}</span>
          </button>
          <ul className="list">
            {cats.filter((c) => c.parent_id === p.id).map((c) => (
              <li key={c.id} className="item">
                <button className="item-hit" onClick={() => open(c)}>
                  <div className="item-main">
                    <div className={'item-title' + (c.active ? '' : ' off')}>{c.name}{!c.active && ' (arquivada)'}</div>
                    <div className="muted small">{GROUPS[c.cost_group]}</div>
                  </div>
                  {goals[c.id] && <div className="muted small">meta {formatCents(goals[c.id])}</div>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {edit && (
        <Modal title={edit.id ? 'Editar categoria' : 'Nova categoria'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={save}>
            <label className="label" htmlFor="cn">Nome</label>
            <input id="cn" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <label className="label" htmlFor="cp">Fica dentro de</label>
            <select id="cp" value={edit.parent_id ?? ''} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value || null })}>
              <option value="">— (é um grupo principal)</option>
              {parents.filter((p) => p.id !== edit.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label className="label" htmlFor="cg">Tipo de custo (alimenta o CMV e o resultado)</label>
            <select id="cg" value={edit.cost_group ?? 'Variable'} onChange={(e) => setEdit({ ...edit, cost_group: e.target.value })}>
              {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="row">
              <div>
                <label className="label" htmlFor="ci">Ícone (emoji)</label>
                <input id="ci" value={edit.icon ?? ''} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="cc">Cor (exemplo: #B8471A)</label>
                <input id="cc" value={edit.color ?? ''} onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
              </div>
            </div>
            <label className="label" htmlFor="cm">Meta de gasto por mês (opcional)</label>
            <input id="cm" className="money" inputMode="numeric" value={goalText}
                   onChange={(e) => { const c = Number(e.target.value.replace(/\D/g, '')) || 0; setGoalText(c ? formatCents(c) : '') }} />
            <label className="check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Categoria ativa (aparece na hora de lançar)</label>
            {msg && <p className="msg error" role="alert">{msg}</p>}
            <button className="btn primary block">✔ SALVAR</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
