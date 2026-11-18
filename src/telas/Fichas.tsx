import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { nomeFornecedor, useApp } from '@/lib/ctx'
import { dataBR, hojeIso, reais } from '@/lib/fmt'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { campoCls, CampoValor, Chip, Confirmacao, EstadoVazio, Janela, Rotulo } from '@/ui/kit'

type Un = 'kg' | 'g' | 'l' | 'ml' | 'un'
const UNIDADES: Un[] = ['kg', 'g', 'l', 'ml', 'un']

interface Ing { id: string; name: string; unit: Un; active: boolean }
interface Preco { ingredient_id: string; date: string; unit_cost_cents: number }
interface Prod { id: string; name: string; kind: string; menu_category: string | null; sale_price_cents: number | null; target_cmv: number | null; instructions: string | null; version: number; active: boolean }
interface Item { ingredient_id: string; quantity: number; unit: Un }

/** quantidade na unidade do insumo; null se as unidades não combinam (ex.: kg × ml) */
function converter(q: number, de: Un, para: Un): number | null {
  if (de === para) return q
  if (de === 'kg' && para === 'g') return q * 1000
  if (de === 'g' && para === 'kg') return q / 1000
  if (de === 'l' && para === 'ml') return q * 1000
  if (de === 'ml' && para === 'l') return q / 1000
  return null
}
const pctTxt = (v: number | null) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`)

export default function Fichas() {
  const { podeEditar } = useApp()
  const [aba, setAba] = useState<'fichas' | 'insumos'>('fichas')
  const [ings, setIngs] = useState<Ing[]>([])
  const [precos, setPrecos] = useState<Preco[]>([])
  const [prods, setProds] = useState<Prod[]>([])
  const [itens, setItens] = useState<Record<string, Item[]>>({})

  const carregar = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('ingredients').select('id,name,unit,active').order('name'),
      supabase.from('ingredient_prices').select('ingredient_id,date,unit_cost_cents').order('date', { ascending: false }),
      supabase.from('products').select('id,name,kind,menu_category,sale_price_cents,target_cmv,instructions,version,active').order('name'),
      supabase.from('recipe_items').select('product_id,ingredient_id,quantity,unit'),
    ])
    setIngs((a.data as Ing[]) ?? [])
    setPrecos(((b.data as Preco[]) ?? []).map((p) => ({ ...p, unit_cost_cents: Number(p.unit_cost_cents) })))
    setProds(((c.data as Prod[]) ?? []).map((p) => ({ ...p, target_cmv: p.target_cmv == null ? null : Number(p.target_cmv) })))
    const m: Record<string, Item[]> = {}
    for (const r of (d.data as (Item & { product_id: string })[]) ?? []) (m[r.product_id] ??= []).push({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity), unit: r.unit })
    setItens(m)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const ultimo = useMemo(() => { const m = new Map<string, Preco>(); for (const p of precos) if (!m.has(p.ingredient_id)) m.set(p.ingredient_id, p); return m }, [precos])
  const ingPorId = useMemo(() => new Map(ings.map((i) => [i.id, i])), [ings])

  const custoDe = useCallback((lista: Item[]) => {
    let total = 0, faltam = 0
    for (const it of lista) {
      const ing = ingPorId.get(it.ingredient_id), p = ultimo.get(it.ingredient_id)
      const q = ing ? converter(it.quantity, it.unit, ing.unit) : null
      if (!ing || !p || q == null) { faltam++; continue }
      total += q * p.unit_cost_cents
    }
    return { total, faltam }
  }, [ingPorId, ultimo])

  return (
    <AppShell titulo="Ficha técnica" subtitulo="Quanto custa cada prato e quanto sobra de lucro.">
      <div role="tablist" aria-label="Seção" className="mb-6 inline-flex rounded-cartao border-2 border-border bg-card p-1.5">
        {([['fichas', 'Fichas'], ['insumos', 'Insumos e preços']] as const).map(([v, r]) => (
          <button key={v} role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
            className={cn('h-14 rounded-campo px-6 text-botao font-bold transition-colors duration-150', aba === v ? 'bg-preto text-farinha' : 'text-muted-foreground hover:bg-accent')}>{r}</button>
        ))}
      </div>
      {aba === 'insumos'
        ? <Insumos ings={ings} ultimo={ultimo} podeEditar={podeEditar} recarregar={carregar} />
        : <Lista prods={prods} itens={itens} ings={ings} custoDe={custoDe} podeEditar={podeEditar} recarregar={carregar} />}
    </AppShell>
  )
}

function Insumos({ ings, ultimo, podeEditar, recarregar }: { ings: Ing[]; ultimo: Map<string, Preco>; podeEditar: boolean; recarregar: () => void }) {
  const app = useApp()
  const [edit, setEdit] = useState<Partial<Ing> | null>(null)
  const [preco, setPreco] = useState<Ing | null>(null)
  const [nome, setNome] = useState(''); const [un, setUn] = useState<Un>('kg'); const [ativo, setAtivo] = useState(true)
  const [qtd, setQtd] = useState(''); const [pago, setPago] = useState(0); const [forn, setForn] = useState(''); const [data, setData] = useState(hojeIso())
  const [erro, setErro] = useState('')

  const abrirIng = (i: Partial<Ing>) => { setErro(''); setEdit(i); setNome(i.name ?? ''); setUn(i.unit ?? 'kg'); setAtivo(i.active ?? true) }
  const abrirPreco = (i: Ing) => { setErro(''); setPreco(i); setQtd(''); setPago(0); setForn(''); setData(hojeIso()) }

  async function salvarIng() {
    if (!nome.trim()) return setErro('Dê um nome ao insumo.')
    // com preço registrado, mudar a unidade reinterpretaria o custo (kg → g multiplicaria por mil)
    if (edit?.id && edit.unit && un !== edit.unit && ultimo.has(edit.id)) return setErro(`Este insumo já tem preços em ${edit.unit}. Para trocar a unidade, cadastre um novo insumo.`)
    const payload = { name: nome.trim(), unit: un, active: ativo }
    const r = edit?.id ? await supabase.from('ingredients').update(payload).eq('id', edit.id) : await supabase.from('ingredients').insert({ ...payload, company_id: app.companyId })
    if (r.error) return setErro(r.error.code === '23514' ? 'Este insumo já está em fichas ou tem preços: a unidade não pode mudar.' : 'Não consegui salvar.')
    setEdit(null); toast.ok('Insumo salvo'); recarregar()
  }
  async function salvarPreco() {
    const q = Number(qtd.replace(',', '.'))
    if (!(q > 0)) return setErro('Informe a quantidade comprada.')
    if (pago <= 0) return setErro('Informe quanto você pagou.')
    const { error } = await supabase.from('ingredient_prices').insert({ company_id: app.companyId, ingredient_id: preco!.id, supplier_id: forn || null, date: data, quantity: q, paid_cents: pago })
    if (error) return setErro('Não consegui salvar o preço.')
    setPreco(null); toast.ok('Preço atualizado'); recarregar()
  }

  return (
    <>
      {podeEditar && <Button size="lg" className="mb-5" onClick={() => abrirIng({})}><Plus /> Novo insumo</Button>}
      {ings.length === 0 ? <EstadoVazio titulo="Nenhum insumo cadastrado." texto="Cadastre feijão, camarão, dendê… e o preço que você pagou." /> : (
        <ul className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
          {ings.map((i, k) => {
            const p = ultimo.get(i.id)
            return (
              <li key={i.id} className={cn('flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2', k % 2 === 1 && 'bg-zebra')}>
                <span className="min-w-0 flex-1 basis-40">
                  <span className={cn('block truncate font-semibold', !i.active && 'line-through opacity-60')}>{i.name}</span>
                  <span className="block text-legenda text-muted-foreground">{p ? `${reais(Math.round(p.unit_cost_cents))} por ${i.unit} · pago em ${dataBR(p.date)}` : 'sem preço ainda'}</span>
                </span>
                {podeEditar && <>
                  <Button variant="outline" size="sm" onClick={() => abrirPreco(i)}>Atualizar preço</Button>
                  <Button variant="ghost" size="icon" aria-label={`Editar ${i.name}`} onClick={() => abrirIng(i)}><Pencil className="!size-5" /></Button>
                </>}
              </li>
            )
          })}
        </ul>
      )}
      {edit && (
        <Janela titulo={edit.id ? 'Editar insumo' : 'Novo insumo'} onFechar={() => setEdit(null)} largura="30rem">
          <div className="space-y-5">
            <div><Rotulo htmlFor="i-nome">Nome</Rotulo><input id="i-nome" value={nome} onChange={(e) => setNome(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
            <fieldset><legend className="text-rotulo font-semibold">Você compra em</legend><div className="mt-2 flex flex-wrap gap-2">{UNIDADES.map((u) => <Chip key={u} ativo={un === u} onClick={() => setUn(u)}>{u}</Chip>)}</div></fieldset>
            <label className="flex min-h-12 items-center gap-3 text-corpo font-semibold"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="size-6 accent-[var(--laranja)]" /> Insumo ativo</label>
            {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
            <Button size="lg" className="w-full" onClick={salvarIng}>Salvar insumo</Button>
          </div>
        </Janela>
      )}
      {preco && (
        <Janela titulo={`Preço de ${preco.name}`} onFechar={() => setPreco(null)} largura="30rem">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Rotulo htmlFor="p-q">Quantidade comprada ({preco.unit})</Rotulo><input id="p-q" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
              <div><Rotulo htmlFor="p-v">Quanto pagou</Rotulo><CampoValor id="p-v" valor={pago} onChange={setPago} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Rotulo htmlFor="p-d">Data</Rotulo><input id="p-d" type="date" value={data} onChange={(e) => setData(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
              <div><Rotulo htmlFor="p-f">Fornecedor (opcional)</Rotulo>
                <select id="p-f" value={forn} onChange={(e) => setForn(e.target.value)} className={cn(campoCls, 'mt-2')}><option value="">—</option>{app.sups.map((s) => <option key={s.id} value={s.id}>{nomeFornecedor(s)}</option>)}</select></div>
            </div>
            {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
            <Button size="lg" className="w-full" onClick={salvarPreco}>Salvar preço</Button>
          </div>
        </Janela>
      )}
    </>
  )
}

function Lista({ prods, itens, ings, custoDe, podeEditar, recarregar }: {
  prods: Prod[]; itens: Record<string, Item[]>; ings: Ing[]; custoDe: (l: Item[]) => { total: number; faltam: number }; podeEditar: boolean; recarregar: () => void
}) {
  const app = useApp()
  const [edit, setEdit] = useState<Partial<Prod> | null>(null)
  const [lista, setLista] = useState<Item[]>([])
  const [venda, setVenda] = useState(0)
  const [erro, setErro] = useState('')
  const [apagar, setApagar] = useState<Prod | null>(null)

  const abrir = (p: Partial<Prod>) => { setErro(''); setEdit(p); setVenda(p.sale_price_cents ?? 0); setLista(p.id ? (itens[p.id] ?? []).map((x) => ({ ...x })) : []) }
  const custo = custoDe(lista)
  // com insumo sem preço ou com unidade incompatível o custo está incompleto: nada de CMV, lucro ou sugestão
  const completo = custo.faltam === 0
  const cmv = venda > 0 && completo ? (custo.total / venda) * 100 : null
  const sugerido = edit?.target_cmv && custo.total > 0 && completo ? Math.round(custo.total / (edit.target_cmv / 100)) : null
  const acima = cmv != null && edit?.target_cmv != null && cmv > edit.target_cmv

  async function salvar() {
    if (!edit) return
    if (!(edit.name ?? '').trim()) return setErro('Dê um nome à ficha.')
    if (lista.some((i) => !i.ingredient_id || !(i.quantity > 0))) return setErro('Complete os ingredientes (insumo e quantidade).')
    for (const i of lista) {
      const ing = ings.find((g) => g.id === i.ingredient_id)
      if (ing && converter(i.quantity, i.unit, ing.unit) == null) return setErro(`“${ing.name}” é comprado em ${ing.unit}; use ${ing.unit === 'un' ? 'un' : ing.unit === 'kg' || ing.unit === 'g' ? 'kg ou g' : 'l ou ml'} na quantidade.`)
    }
    // produto e ingredientes gravados juntos no banco: ou entra tudo, ou nada muda
    const { error } = await supabase.rpc('save_recipe', {
      p_company: app.companyId, p_id: edit.id ?? null,
      p_product: { name: edit.name!.trim(), kind: edit.kind ?? 'cozinha', menu_category: edit.menu_category?.trim() ?? '', sale_price_cents: venda ? String(venda) : '', target_cmv: edit.target_cmv == null ? '' : String(edit.target_cmv), instructions: edit.instructions?.trim() ?? '', active: edit.active ?? true },
      p_items: lista.map((i) => ({ ingredient_id: i.ingredient_id, quantity: i.quantity, unit: i.unit })),
    })
    if (error) return setErro('Não consegui salvar a ficha. Nada foi alterado, tente de novo.')
    setEdit(null); toast.ok('Ficha salva'); recarregar()
  }

  return (
    <>
      {podeEditar && <Button size="lg" className="mb-5" onClick={() => abrir({ kind: 'cozinha', active: true, target_cmv: 30 })}><Plus /> Nova ficha</Button>}
      {prods.length === 0 ? <EstadoVazio titulo="Nenhuma ficha ainda." texto="Cadastre os insumos primeiro e depois monte a ficha de cada prato." /> : (
        <ul className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
          {prods.map((p, k) => {
            const c = custoDe(itens[p.id] ?? [])
            const m = p.sale_price_cents && c.faltam === 0 ? (c.total / p.sale_price_cents) * 100 : null
            const sobe = m != null && p.target_cmv != null && m > p.target_cmv
            return (
              <li key={p.id} className={cn('flex min-h-[4.5rem] flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3', k % 2 === 1 && 'bg-zebra')}>
                <span className="min-w-0 flex-1 basis-48">
                  <span className={cn('block truncate font-semibold', !p.active && 'line-through opacity-60')}>{p.kind === 'bar' ? '🍹' : '🍤'} {p.name}</span>
                  <span className="block text-legenda text-muted-foreground">custo {reais(Math.round(c.total))}{p.sale_price_cents ? ` · venda ${reais(p.sale_price_cents)}` : ''}{c.faltam > 0 && <b className="text-erro"> · {c.faltam} insumo(s) sem preço</b>}</span>
                </span>
                <span className="text-right"><span className={cn('numeros block text-corpo font-bold', sobe && 'text-erro')}>{pctTxt(m)}</span><span className="block text-legenda text-muted-foreground">CMV{p.target_cmv != null ? ` (meta ${p.target_cmv}%)` : ''}</span></span>
                <Button variant="ghost" size="icon" aria-label={`${podeEditar ? 'Editar' : 'Ver'} ${p.name}`} onClick={() => abrir(p)}><Pencil className="!size-5" /></Button>
                {podeEditar && <Button variant="ghost" size="icon" className="text-erro" aria-label={`Apagar ${p.name}`} onClick={() => setApagar(p)}><Trash2 className="!size-5" /></Button>}
              </li>
            )
          })}
        </ul>
      )}
      {edit && (
        <Janela titulo={edit.id ? 'Ficha técnica' : 'Nova ficha'} onFechar={() => setEdit(null)} largura="40rem">
          <div className="space-y-5">
            <div><Rotulo htmlFor="fn">Nome do prato ou drink</Rotulo><input id="fn" value={edit.name ?? ''} disabled={!podeEditar} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={cn(campoCls, 'mt-2')} /></div>
            <fieldset><legend className="text-rotulo font-semibold">Tipo</legend><div className="mt-2 flex gap-2"><Chip ativo={edit.kind !== 'bar'} onClick={() => setEdit({ ...edit, kind: 'cozinha' })}>🍤 Cozinha</Chip><Chip ativo={edit.kind === 'bar'} onClick={() => setEdit({ ...edit, kind: 'bar' })}>🍹 Bar</Chip></div></fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Rotulo htmlFor="fv">Preço de venda</Rotulo><CampoValor id="fv" valor={venda} onChange={setVenda} disabled={!podeEditar} /></div>
              <div><Rotulo htmlFor="fm">CMV desejado (%)</Rotulo><input id="fm" type="number" min={1} max={100} value={edit.target_cmv ?? ''} onChange={(e) => setEdit({ ...edit, target_cmv: e.target.value ? Number(e.target.value) : null })} className={cn(campoCls, 'mt-2')} /></div>
            </div>
            <div>
              <h3 className="text-rotulo font-semibold">Ingredientes</h3>
              <div className="mt-2 space-y-2">
                {lista.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_5.5rem_4.5rem_3rem] items-center gap-2">
                    <select aria-label="Insumo" value={it.ingredient_id} onChange={(e) => setLista(lista.map((x, j) => (j === idx ? { ...x, ingredient_id: e.target.value, unit: ings.find((g) => g.id === e.target.value)?.unit ?? x.unit } : x)))} className={campoCls}>
                      <option value="">Insumo…</option>{ings.filter((g) => g.active || g.id === it.ingredient_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <input aria-label="Quantidade" inputMode="decimal" value={it.quantity || ''} onChange={(e) => setLista(lista.map((x, j) => (j === idx ? { ...x, quantity: Number(e.target.value.replace(',', '.')) || 0 } : x)))} className={cn(campoCls, 'px-2 text-center')} />
                    <select aria-label="Unidade" value={it.unit} onChange={(e) => setLista(lista.map((x, j) => (j === idx ? { ...x, unit: e.target.value as Un } : x)))} className={cn(campoCls, 'px-2')}>{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                    <Button variant="ghost" size="icon" aria-label="Tirar ingrediente" onClick={() => setLista(lista.filter((_, j) => j !== idx))}><X /></Button>
                  </div>
                ))}
              </div>
              {podeEditar && <Button variant="outline" size="sm" className="mt-3" onClick={() => setLista([...lista, { ingredient_id: '', quantity: 0, unit: 'g' }])}><Plus /> Ingrediente</Button>}
            </div>
            <div className="space-y-1 rounded-campo border-2 border-dashed border-mostarda/70 bg-zebra p-4 text-corpo">
              <p>Custo do prato: <b className="numeros">{reais(Math.round(custo.total))}</b></p>
              <p>CMV: <b className={cn('numeros', acima && 'text-erro')}>{pctTxt(cmv)}</b>{venda > 0 && completo && <> · lucro por prato: <b className="numeros">{reais(Math.round(venda - custo.total))}</b></>}</p>
              {sugerido != null && <p>Preço sugerido para CMV de {edit.target_cmv}%: <b className="numeros">{reais(sugerido)}</b></p>}
              {custo.faltam > 0 && <p className="font-semibold text-erro">Falta preço ou unidade compatível em {custo.faltam} ingrediente(s).</p>}
            </div>
            <div><Rotulo htmlFor="fi">Modo de preparo (opcional)</Rotulo><textarea id="fi" rows={4} value={edit.instructions ?? ''} disabled={!podeEditar} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} className={cn(campoCls, 'mt-2 h-auto py-3')} /></div>
            {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
            {podeEditar && <Button size="lg" className="w-full" onClick={salvar}>Salvar ficha</Button>}
          </div>
        </Janela>
      )}
      <Confirmacao aberto={!!apagar} onAberto={(v) => !v && setApagar(null)} titulo={`Apagar a ficha “${apagar?.name ?? ''}”?`} descricao="Os ingredientes dela também saem. Isso não pode ser desfeito." confirmar="Sim, apagar"
        onConfirmar={async () => { if (apagar) { await supabase.from('products').delete().eq('id', apagar.id); toast.ok('Ficha apagada'); recarregar() } setApagar(null) }} />
    </>
  )
}
