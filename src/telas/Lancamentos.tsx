import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Pencil, PlusCircle, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { Link } from '@/lib/router'
import { toast } from '@/lib/toast'
import { nomeFornecedor, useApp } from '@/lib/ctx'
import { dataBR, fimMes, inicioMes, mesAtual, reais } from '@/lib/fmt'
import { FORMAS, GASTO_SEL, rotuloForma, type Gasto } from '@/lib/gastos'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { IconeCategoria } from '@/ui/icones'
import { Confirmacao, EstadoVazio, Selo, SeletorMes } from '@/ui/kit'
import GastoEditor, { SelectCategoria } from './GastoEditor'

const TODOS = '_todos'
const filtroCls = 'h-12 min-w-[10rem] rounded-full border-2 border-border bg-card px-4 text-legenda font-semibold'
const STATUS: Record<string, { t: string; tom: 'ok' | 'alerta' | 'erro' }> = {
  Pending: { t: 'A pagar', tom: 'alerta' }, AwaitingConfirmation: { t: 'Confirmar', tom: 'erro' },
}

export default function Lancamentos() {
  const app = useApp()
  const { mes, setMes, podeEditar, catPorId } = app
  const [linhas, setLinhas] = useState<Gasto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [fCat, setFCat] = useState(TODOS)
  const [fForn, setFForn] = useState(TODOS)
  const [fForma, setFForma] = useState(TODOS)
  const [sel, setSel] = useState<string[]>([])
  const [lixeira, setLixeira] = useState(false)
  const [confirmar, setConfirmar] = useState<string[] | null>(null)
  const [editando, setEditando] = useState<Gasto | null>(null)

  const carregar = useCallback(async () => {
    let q = supabase.from('expenses').select(GASTO_SEL)
    if (lixeira) {
      const limite = new Date(Date.now() - 30 * 864e5).toISOString()
      q = q.not('deleted_at', 'is', null).gte('deleted_at', limite).order('deleted_at', { ascending: false })
    } else {
      q = q.is('deleted_at', null).gte('date', inicioMes(mes)).lte('date', fimMes(mes)).order('date', { ascending: false }).order('created_at', { ascending: false })
    }
    const { data, error } = await q
    if (error) toast.erro('Não consegui carregar os lançamentos.')
    else setLinhas((data as unknown as Gasto[]) ?? [])
    setCarregando(false)
  }, [mes, lixeira])

  useEffect(() => { setCarregando(true); carregar() }, [carregar])
  useEffect(() => {
    const ch = supabase.channel('lanc-' + app.companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `company_id=eq.${app.companyId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [app.companyId, carregar])

  const fornecedoresMes = useMemo(() => [...new Set(linhas.map((l) => nomeFornecedor(l.suppliers)))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [linhas])

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return linhas
      .filter((l) => (fCat === TODOS ? true : l.category_id === fCat || catPorId(l.category_id)?.parent_id === fCat))
      .filter((l) => (fForn === TODOS ? true : nomeFornecedor(l.suppliers) === fForn))
      .filter((l) => (fForma === TODOS ? true : l.payment_method === fForma))
      .filter((l) => !t || nomeFornecedor(l.suppliers).toLowerCase().includes(t) || reais(l.amount_cents).includes(t) || (l.invoice_number ?? '').includes(t) || (l.notes ?? '').toLowerCase().includes(t))
  }, [linhas, busca, fCat, fForn, fForma, catPorId])

  const contam = lista.filter((l) => l.status !== 'AwaitingConfirmation')
  const total = contam.reduce((s, l) => s + l.amount_cents, 0)
  const tudoSel = lista.length > 0 && sel.length === lista.length
  const temFiltro = !!busca || fCat !== TODOS || fForn !== TODOS || fForma !== TODOS
  const limparFiltros = () => { setBusca(''); setFCat(TODOS); setFForn(TODOS); setFForma(TODOS) }

  async function marcarExcluido(ids: string[], quando: string | null) {
    const { error } = await supabase.from('expenses').update({ deleted_at: quando }).in('id', ids)
    if (error) { toast.erro('Não consegui fazer isso.', 'Só dono e sócio podem apagar e restaurar.'); return false }
    carregar(); app.setMes(mes)
    return true
  }

  async function excluir(ids: string[]) {
    if (!(await marcarExcluido(ids, new Date().toISOString()))) return
    setSel([])
    toast.ok(ids.length > 1 ? `${ids.length} gastos foram para a lixeira` : 'Gasto foi para a lixeira', {
      descricao: 'Fica guardado por 30 dias.', acao: { rotulo: 'Desfazer', fn: () => marcarExcluido(ids, null) },
    })
  }

  async function duplicar(l: Gasto) {
    const { error } = await supabase.from('expenses').insert({
      company_id: app.companyId, date: l.date, supplier_id: l.supplier_id, category_id: l.category_id, amount_cents: l.amount_cents,
      payment_method: l.payment_method, status: l.status === 'Paid' ? 'Paid' : 'Pending', due_date: l.due_date, notes: l.notes, origin: 'Manual',
    })
    if (error) toast.erro('Não consegui duplicar.'); else { toast.ok('Gasto duplicado', { descricao: `${reais(l.amount_cents)} · ${nomeFornecedor(l.suppliers)}` }); carregar() }
  }

  async function mudarCategoria(cat: string) {
    const { error } = await supabase.from('expenses').update({ category_id: cat }).in('id', sel)
    if (error) return toast.erro('Não consegui trocar a categoria.')
    toast.ok('Categoria trocada'); setSel([]); carregar()
  }

  return (
    <AppShell
      titulo={lixeira ? 'Lixeira (30 dias)' : 'Lançamentos'}
      subtitulo={lixeira ? 'Gastos excluídos ficam aqui por 30 dias. Você pode trazer de volta.' : 'Todos os gastos do mês. Use a busca ou os filtros para achar um gasto.'}
      acoes={
        <>
          {podeEditar && (
            <Button variant="outline" onClick={() => { setLixeira(!lixeira); setSel([]) }}>
              {lixeira ? <><X /> Sair da lixeira</> : <><Trash2 /> Lixeira</>}
            </Button>
          )}
          <Link to="/" className="inline-flex h-14 items-center gap-2.5 rounded-campo bg-primary px-7 text-botao font-semibold text-primary-foreground shadow-suave hover:bg-primary/90"><PlusCircle className="size-6" /> Lançar gasto</Link>
        </>
      }
    >
      {!lixeira && (
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <SeletorMes mes={mes} onChange={(m) => { setMes(m); setSel([]) }} max={mesAtual()} />
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por fornecedor, valor ou nota…" aria-label="Buscar lançamentos"
              className="h-14 w-full rounded-campo border-[1.5px] border-input bg-card pr-4 pl-12 text-corpo focus-visible:border-2 focus-visible:border-foco" />
          </div>
        </div>
      )}

      {!lixeira && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="text-legenda font-semibold text-muted-foreground">Filtrar:</span>
          <select value={fCat} onChange={(e) => setFCat(e.target.value)} aria-label="Categoria" className={cn(filtroCls, fCat !== TODOS && 'border-laranja bg-mostarda/15')}>
            <option value={TODOS}>Todas as categorias</option>
            {app.grupos.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={fForn} onChange={(e) => setFForn(e.target.value)} aria-label="Fornecedor" className={cn(filtroCls, fForn !== TODOS && 'border-laranja bg-mostarda/15')}>
            <option value={TODOS}>Todos os fornecedores</option>
            {fornecedoresMes.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={fForma} onChange={(e) => setFForma(e.target.value)} aria-label="Forma de pagamento" className={cn(filtroCls, fForma !== TODOS && 'border-laranja bg-mostarda/15')}>
            <option value={TODOS}>Qualquer pagamento</option>
            {FORMAS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
          {temFiltro && <Button variant="link" onClick={limparFiltros}>Limpar filtros</Button>}
        </div>
      )}

      {sel.length > 0 && !lixeira && (
        <div className="sticky top-20 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-cartao bg-preto px-5 py-3 text-farinha shadow-lg lg:top-2">
          <b className="text-corpo">{sel.length} selecionado{sel.length > 1 && 's'}</b>
          <div className="min-w-[14rem]"><SelectCategoria valor="" onChange={(v) => v && mudarCategoria(v)} className="h-12 border-2 text-legenda text-foreground" /></div>
          {podeEditar && <Button variant="destructive" onClick={() => setConfirmar(sel)}><Trash2 /> Excluir</Button>}
          <Button variant="ghost" className="text-farinha hover:bg-farinha/15" onClick={() => setSel([])}>Cancelar</Button>
        </div>
      )}

      {carregando ? <p className="text-corpo text-muted-foreground">Carregando…</p> : lista.length === 0 ? (
        lixeira ? <EstadoVazio titulo="A lixeira está vazia" texto="Quando você excluir um gasto, ele fica aqui por 30 dias." />
          : temFiltro ? <EstadoVazio titulo="Nada encontrado com esses filtros" acao={<Button variant="outline" onClick={limparFiltros}>Limpar filtros</Button>} />
          : <EstadoVazio titulo="Nenhum gasto neste mês ainda." texto="Que tal lançar o primeiro?" acao={<Link to="/" className="inline-flex h-14 items-center gap-2.5 rounded-campo bg-primary px-7 text-botao font-semibold text-primary-foreground"><PlusCircle className="size-6" /> Lançar o primeiro gasto</Link>} />
      ) : (
        <div className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
          <div className="hidden h-14 items-center gap-4 border-b-2 border-border px-5 text-legenda font-bold text-muted-foreground md:flex">
            {!lixeira && <input type="checkbox" checked={tudoSel} onChange={(e) => setSel(e.target.checked ? lista.map((l) => l.id) : [])} aria-label="Selecionar todos" className="size-6 accent-[var(--laranja)]" />}
            <span className="w-14">Data</span><span className="flex-1">Fornecedor</span><span className="w-44">Categoria</span><span className="w-32 text-right">Valor</span><span className="w-40 text-right">Ações</span>
          </div>
          <ul>
            {lista.map((l, i) => {
              const marcado = sel.includes(l.id)
              const st = STATUS[l.status]
              return (
                <li key={l.id} className={cn('flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 md:flex-nowrap md:px-5', i % 2 === 1 && 'bg-zebra', marcado && 'bg-mostarda/20')}>
                  {!lixeira && <input type="checkbox" checked={marcado} onChange={(e) => setSel((x) => (e.target.checked ? [...x, l.id] : x.filter((k) => k !== l.id)))} aria-label={`Selecionar ${nomeFornecedor(l.suppliers)}`} className="size-6 accent-[var(--laranja)]" />}
                  <span className="numeros w-14 shrink-0">{dataBR(l.date).slice(0, 5)}</span>
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block truncate font-semibold">{nomeFornecedor(l.suppliers)}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-legenda text-muted-foreground">
                      <span className="md:hidden">{catPorId(l.category_id)?.name}</span>
                      {l.payment_method && <span>{rotuloForma(l.payment_method)}</span>}
                      {l.recurrence_id && <span>conta do mês</span>}
                      {st && <Selo tom={st.tom}>{st.t}</Selo>}
                    </span>
                  </span>
                  <span className="hidden w-44 shrink-0 items-center gap-2 md:flex">
                    <IconeCategoria icone={app.iconeDoGasto(l.category_id)} className="size-6 text-laranja" />
                    <span className="truncate">{catPorId(l.category_id)?.name}</span>
                  </span>
                  <span className="numeros w-32 shrink-0 text-right text-corpo font-bold">{reais(l.amount_cents)}</span>
                  <span className="flex w-full shrink-0 justify-end gap-0.5 md:w-40">
                    {lixeira ? (
                      <Button variant="ghost" size="sm" onClick={async () => { if (await marcarExcluido([l.id], null)) toast.ok('Gasto restaurado') }}><RotateCcw className="!size-5" /> Restaurar</Button>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon" aria-label={`Editar ${nomeFornecedor(l.suppliers)}`} onClick={() => setEditando(l)}><Pencil className="!size-5" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Duplicar ${nomeFornecedor(l.suppliers)}`} onClick={() => duplicar(l)}><Copy className="!size-5" /></Button>
                        {podeEditar && <Button variant="ghost" size="icon" className="text-erro" aria-label={`Excluir ${nomeFornecedor(l.suppliers)}`} onClick={() => setConfirmar([l.id])}><Trash2 className="!size-5" /></Button>}
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          {!lixeira && (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t-2 border-border bg-card px-5 py-4">
              <span className="text-corpo text-muted-foreground">{lista.length} gastos {temFiltro && '(filtrados)'}</span>
              <span className="text-secao">Total do período: <b className="numeros">{reais(total)}</b></span>
            </div>
          )}
        </div>
      )}

      <Confirmacao aberto={!!confirmar} onAberto={(v) => !v && setConfirmar(null)}
        titulo={confirmar && confirmar.length > 1 ? `Excluir ${confirmar.length} gastos?` : 'Excluir este gasto?'}
        descricao="Ele sai do total do mês e vai para a lixeira. Você pode trazer de volta em até 30 dias."
        confirmar="Sim, excluir" onConfirmar={() => { if (confirmar) excluir(confirmar); setConfirmar(null) }} />

      {editando && <GastoEditor gasto={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar() }} />}
    </AppShell>
  )
}
