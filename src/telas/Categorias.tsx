import { useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { GRUPOS, useApp, type Cat } from '@/lib/ctx'
import { reais } from '@/lib/fmt'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { IconeCategoria } from '@/ui/icones'
import { Aviso, campoCls, CampoValor, Chip, Janela, Rotulo, Selo } from '@/ui/kit'
import { LIMITE } from '@/lib/validar'

export default function Categorias() {
  const app = useApp()
  const { grupos, subsDe, podeEditar } = app
  const [metas, setMetas] = useState<Record<string, number>>({})
  const [edit, setEdit] = useState<Partial<Cat> | null>(null)

  const carregarMetas = () => supabase.from('category_goals').select('category_id,monthly_limit_cents').then(({ data }) => {
    const m: Record<string, number> = {}
    for (const r of (data as { category_id: string; monthly_limit_cents: number }[]) ?? []) m[r.category_id] = r.monthly_limit_cents
    setMetas(m)
  })
  useEffect(() => { carregarMetas() }, [])

  if (!podeEditar) {
    return <AppShell titulo="Categorias"><Aviso tipo="atencao">Só o dono e os sócios mexem nas categorias.</Aviso></AppShell>
  }

  return (
    <AppShell titulo="Categorias" subtitulo="Grupo, categoria e meta de gasto por mês. Categorias com gastos nunca são apagadas, só arquivadas."
      acoes={<>
        <Button variant="outline" onClick={() => setEdit({ parent_id: grupos[0]?.id ?? null, cost_group: 'Variable', active: true })}><Plus /> Nova subcategoria</Button>
        <Button size="lg" onClick={() => setEdit({ parent_id: null, cost_group: 'Variable', active: true })}><Plus /> Nova categoria</Button>
      </>}>
      <div className="grid gap-6 lg:grid-cols-2">
        {grupos.map((g) => (
          <section key={g.id} className={cn('rounded-cartao border border-border bg-card p-5 shadow-suave', !g.active && 'opacity-60')}>
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-campo bg-mostarda/20"><IconeCategoria icone={app.iconeDoGasto(g.id)} className="size-7 text-laranja" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-secao leading-tight font-bold">{g.name}{!g.active && ' (arquivada)'}</h2>
                <p className="text-legenda text-muted-foreground">{GRUPOS.find((x) => x.id === g.cost_group)?.nome}{metas[g.id] ? ` · meta ${reais(metas[g.id])}` : ''}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Editar ${g.name}`} onClick={() => setEdit(g)}><Pencil className="!size-5" /></Button>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {subsDe(g.id).map((s) => (
                <li key={s.id} className="flex min-h-12 items-center gap-3">
                  <span className={cn('min-w-0 flex-1 truncate', !s.active && 'line-through opacity-60')}>{s.name}</span>
                  {s.cost_group !== g.cost_group && <Selo tom="alerta">{GRUPOS.find((x) => x.id === s.cost_group)?.curto}</Selo>}
                  {metas[s.id] && <span className="numeros text-legenda text-muted-foreground">meta {reais(metas[s.id])}</span>}
                  <Button variant="ghost" size="icon" aria-label={`Editar ${s.name}`} onClick={() => setEdit(s)}><Pencil className="!size-5" /></Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {edit && <FormCat inicial={edit} meta={edit.id ? metas[edit.id] ?? 0 : 0} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); carregarMetas() }} />}
    </AppShell>
  )
}

function FormCat({ inicial, meta, onFechar, onSalvo }: { inicial: Partial<Cat>; meta: number; onFechar: () => void; onSalvo: () => void }) {
  const app = useApp()
  const [nome, setNome] = useState(inicial.name ?? '')
  const [pai, setPai] = useState(inicial.parent_id ?? '')
  const [tipo, setTipo] = useState(inicial.cost_group ?? 'Variable')
  const [alvo, setAlvo] = useState(meta)
  const [ativa, setAtiva] = useState(inicial.active ?? true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const ehGrupo = !inicial.parent_id && !pai
  // só há dois níveis: um grupo que já tem subcategorias não pode ir para dentro de outro grupo
  const temFilhos = !!inicial.id && app.subsDe(inicial.id).length > 0

  async function salvar() {
    setErro('')
    if (!nome.trim()) return setErro('Dê um nome à categoria.')
    setSalvando(true)
    const payload = { name: nome.trim(), parent_id: pai || null, cost_group: tipo, active: ativa }
    let id = inicial.id
    if (id) {
      const { error } = await supabase.from('categories').update(payload).eq('id', id)
      if (error) { setSalvando(false); return setErro(error.code === '23514' ? 'Só há dois níveis: grupo e detalhe. Essa mudança não é possível.' : error.code === '23505' ? 'Já existe uma categoria com esse nome nesse grupo.' : 'Não consegui salvar.') }
    } else {
      const { data, error } = await supabase.from('categories').insert({ ...payload, company_id: app.companyId, sort_order: app.cats.length, icon: '', color: '#6B6B6B' }).select('id').single()
      if (error || !data) { setSalvando(false); return setErro(error?.code === '23505' ? 'Já existe uma categoria com esse nome nesse grupo.' : 'Não consegui salvar.') }
      id = data.id as string
    }
    const meta = alvo > 0
      ? await supabase.from('category_goals').upsert({ company_id: app.companyId, category_id: id!, monthly_limit_cents: alvo })
      : await supabase.from('category_goals').delete().eq('category_id', id!)
    await app.recarregar()
    setSalvando(false)
    if (meta.error) { toast.erro('A categoria foi salva, mas não consegui salvar a meta.', 'Tente de novo.'); onSalvo(); return }
    toast.ok('Categoria salva'); onSalvo()
  }

  return (
    <Janela titulo={inicial.id ? 'Editar categoria' : ehGrupo ? 'Nova categoria' : 'Nova subcategoria'} onFechar={onFechar} lado largura="30rem">
      <div className="space-y-5">
        <div><Rotulo htmlFor="c-nome">Nome</Rotulo><input id="c-nome" maxLength={LIMITE.nome} value={nome} onChange={(e) => setNome(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
        <div>
          <Rotulo htmlFor="c-pai">Fica dentro de</Rotulo>
          <select id="c-pai" value={pai} disabled={temFilhos} onChange={(e) => setPai(e.target.value)} className={cn(campoCls, 'mt-2')}>
            <option value="">— (é um grupo principal)</option>
            {app.grupos.filter((g) => g.id !== inicial.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="text-rotulo font-semibold">Tipo de custo <span className="font-normal text-muted-foreground">(alimenta o CMV e o resultado)</span></legend>
          <div className="mt-2 flex flex-wrap gap-2">{GRUPOS.map((g) => <Chip key={g.id} ativo={tipo === g.id} onClick={() => setTipo(g.id)}>{g.nome}</Chip>)}</div>
        </fieldset>
        <div>
          <Rotulo htmlFor="c-meta">Meta de gasto por mês (opcional)</Rotulo>
          <CampoValor id="c-meta" valor={alvo} onChange={setAlvo} />
          <p className="mt-1 text-legenda text-muted-foreground">No Dashboard aparece uma barra: verde dentro da meta, amarela perto do limite, vermelha acima.</p>
        </div>
        <label className="flex min-h-12 items-center gap-3 text-corpo font-semibold"><input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="size-6 accent-[var(--laranja)]" /> Categoria ativa (aparece na hora de lançar)</label>
        {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
        <div className="flex gap-3">
          <Button size="lg" className="flex-1" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar categoria'}</Button>
          <Button size="lg" variant="outline" onClick={onFechar}>Cancelar</Button>
        </div>
      </div>
    </Janela>
  )
}
