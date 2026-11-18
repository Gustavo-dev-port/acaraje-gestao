import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { Link } from '@/lib/router'
import { GRUPOS, nomeFornecedor, useApp } from '@/lib/ctx'
import { dataBR, mesAnterior, mesAtual, MESES_CURTOS, nomeMesSo, reais, variacao } from '@/lib/fmt'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { BarrasHorizontais, BarrasMensais, Rosca, type Fatia } from '@/ui/graficos'
import { Aviso, BarraMeta, CartaoGrafico, CartaoKpi, EstadoVazio, SeletorMes } from '@/ui/kit'

interface G { amount_cents: number; status: string; category_id: string; date: string; suppliers: { nickname: string | null; trade_name: string | null; legal_name: string | null } | null }
interface R { date: string; gross_cents: number; discounts_cents: number }

const soma = (l: G[]) => l.reduce((s, x) => s + x.amount_cents, 0)

export default function Dashboard() {
  const [aba, setAba] = useState<'mes' | 'ano'>('mes')
  return (
    <AppShell titulo="Dashboard" subtitulo="O resumo do dinheiro que saiu, em gráficos simples.">
      <div role="tablist" aria-label="Período" className="mb-6 inline-flex rounded-cartao border-2 border-border bg-card p-1.5">
        {(['mes', 'ano'] as const).map((a) => (
          <button key={a} role="tab" aria-selected={aba === a} onClick={() => setAba(a)}
            className={cn('h-14 min-w-[8rem] rounded-campo px-6 text-botao font-bold transition-colors duration-150 sm:min-w-[10rem]', aba === a ? 'bg-preto text-farinha' : 'text-muted-foreground hover:bg-accent')}>
            {a === 'mes' ? 'Mês' : 'Ano'}
          </button>
        ))}
      </div>
      <Painel aba={aba} />
    </AppShell>
  )
}

function Painel({ aba }: { aba: 'mes' | 'ano' }) {
  const app = useApp()
  const { mes, setMes, companyId, pendentes, raizDe, catPorId, grupos } = app
  const atual = mesAtual()
  const [ano, setAno] = useState(Number(atual.slice(0, 4)))
  const anoRef = aba === 'ano' ? ano : Number(mes.slice(0, 4))
  const [gastos, setGastos] = useState<G[]>([])
  const [recs, setRecs] = useState<R[]>([])
  const [metas, setMetas] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let vivo = true
    Promise.all([
      supabase.from('expenses').select('amount_cents,status,category_id,date,suppliers(nickname,trade_name,legal_name)').is('deleted_at', null).neq('status', 'AwaitingConfirmation').gte('date', `${anoRef - 1}-12-01`).lte('date', `${anoRef}-12-31`),
      supabase.from('revenues').select('date,gross_cents,discounts_cents').gte('date', `${anoRef - 1}-12-01`).lte('date', `${anoRef}-12-31`),
      supabase.from('category_goals').select('category_id,monthly_limit_cents'),
    ]).then(([g, r, m]) => {
      if (!vivo) return
      setGastos((g.data as unknown as G[]) ?? [])
      setRecs((r.data as R[]) ?? [])
      const mm: Record<string, number> = {}
      for (const x of (m.data as { category_id: string; monthly_limit_cents: number }[]) ?? []) mm[x.category_id] = x.monthly_limit_cents
      setMetas(mm)
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [anoRef, tick])

  useEffect(() => {
    const ch = supabase.channel('dash-' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `company_id=eq.${companyId}` }, () => setTick((t) => t + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenues', filter: `company_id=eq.${companyId}` }, () => setTick((t) => t + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId])

  const doMes = (m: string) => gastos.filter((g) => g.date.startsWith(m))
  const liquidoDo = (m: string) => recs.filter((r) => r.date.startsWith(m)).reduce((s, r) => s + r.gross_cents - r.discounts_cents, 0)

  const fatiasDe = (lista: G[], max = 6): Fatia[] => {
    const total = soma(lista) || 1
    const map = new Map<string, number>()
    for (const g of lista) { const raiz = raizDe(g.category_id)?.id ?? g.category_id; map.set(raiz, (map.get(raiz) ?? 0) + g.amount_cents) }
    const ord = [...map.entries()].map(([id, valor]) => ({ id, nome: catPorId(id)?.name ?? '?', valor, pct: (valor / total) * 100 })).sort((a, b) => b.valor - a.valor)
    if (ord.length <= max) return ord
    const resto = ord.slice(max - 1).reduce((s, x) => s + x.valor, 0)
    return [...ord.slice(0, max - 1), { id: '_outros', nome: 'Outros', valor: resto, pct: (resto / total) * 100 }]
  }

  if (carregando) return <p className="text-corpo text-muted-foreground">Carregando…</p>

  if (aba === 'mes') {
    const lista = doMes(mes)
    const total = soma(lista)
    const ant = soma(doMes(mesAnterior(mes)))
    const v = variacao(total, ant)
    const fatias = fatiasDe(lista)
    const porForn = (() => {
      const m = new Map<string, number>()
      for (const g of lista) { const n = nomeFornecedor(g.suppliers); m.set(n, (m.get(n) ?? 0) + g.amount_cents) }
      return [...m.entries()].map(([nome, valor]) => ({ nome, valor, pct: (valor / (total || 1)) * 100 })).sort((a, b) => b.valor - a.valor).slice(0, 5)
    })()
    const porTipo = GRUPOS.map((gr) => {
      const valor = soma(lista.filter((g) => catPorId(g.category_id)?.cost_group === gr.id))
      return { nome: gr.nome, valor, pct: (valor / (total || 1)) * 100 }
    })
    const gastoDeCat = (id: string, l: G[]) => soma(l.filter((g) => g.category_id === id || catPorId(g.category_id)?.parent_id === id))
    const alertas: { tipo: 'atencao' | 'erro' | 'ok'; texto: string }[] = []
    const lAnt = doMes(mesAnterior(mes))
    for (const gr of grupos) {
      const a = gastoDeCat(gr.id, lista), b = gastoDeCat(gr.id, lAnt), meta = metas[gr.id]
      if (meta && a > meta) alertas.push({ tipo: 'erro', texto: `${gr.name} passou da meta do mês em ${Math.round(((a - meta) / meta) * 100)}%.` })
      else if (a > 0 && b > 0 && variacao(a, b) >= 15) alertas.push({ tipo: 'atencao', texto: `${gr.name} subiu ${variacao(a, b)}% em relação ao mês passado.` })
    }
    if (!alertas.length) alertas.push({ tipo: 'ok', texto: 'Nenhuma categoria saiu do normal este mês. Tudo nos conformes!' })
    const metasLista = Object.entries(metas).filter(([id, m]) => m > 0 && catPorId(id))
    const liquido = liquidoDo(mes)
    const cmv = soma(lista.filter((g) => catPorId(g.category_id)?.cost_group === 'Cmv'))
    const nomeAnt = nomeMesSo(mesAnterior(mes)).toLowerCase()

    return (
      <div className="space-y-6">
        <SeletorMes mes={mes} onChange={setMes} max={atual} />
        {lista.length === 0 && liquido === 0 ? (
          <EstadoVazio titulo="Nenhum gasto neste mês ainda." texto="Que tal lançar o primeiro?" acao={<Link to="/" className="inline-flex h-14 items-center rounded-campo bg-primary px-7 text-botao font-semibold text-primary-foreground">Lançar gasto</Link>} />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              <CartaoKpi rotulo="Total gasto" valor={reais(total)} destaque />
              <CartaoKpi rotulo={`vs. ${nomeAnt}`} valor={ant > 0 ? `${v > 0 ? '+' : ''}${v}%` : '—'} variacao={ant > 0 ? v : undefined} textoVariacao={v > 0 ? `subiu ${v}% vs. ${nomeAnt}` : `caiu ${Math.abs(v)}% vs. ${nomeAnt}`} />
              <CartaoKpi rotulo="Maior categoria" valor={fatias[0]?.nome ?? '—'}>
                {fatias[0] && <p className="mt-2 text-legenda font-semibold text-muted-foreground">{reais(fatias[0].valor)} · {Math.round(fatias[0].pct)}% do total</p>}
              </CartaoKpi>
              <CartaoKpi rotulo="Contas pendentes" valor={pendentes}>
                <p className="mt-2 text-legenda font-semibold">{pendentes > 0 ? <Link to="/contas" className="text-primary underline underline-offset-4">Ver e confirmar</Link> : <span className="text-folha">Tudo em dia ✓</span>}</p>
              </CartaoKpi>
            </div>

            {liquido > 0 && (
              <div className="grid gap-4 md:grid-cols-3">
                <CartaoKpi rotulo="Faturamento líquido" valor={reais(liquido)} />
                <CartaoKpi rotulo="Resultado (faturamento − gastos)" valor={reais(liquido - total)}>
                  <p className={cn('mt-2 text-legenda font-semibold', liquido - total < 0 ? 'text-erro' : 'text-folha')}>{Math.round(((liquido - total) / liquido) * 100)}% do faturamento</p>
                </CartaoKpi>
                <CartaoKpi rotulo="CMV (custo da mercadoria)" valor={`${((cmv / liquido) * 100).toFixed(1).replace('.', ',')}%`}>
                  <p className="mt-2 text-legenda font-semibold text-muted-foreground">{reais(cmv)} do faturamento</p>
                </CartaoKpi>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
              <CartaoGrafico pergunta="Em que gastei mais este mês?"><Rosca fatias={fatias} /></CartaoGrafico>
              <CartaoGrafico pergunta="Para quem paguei mais?" detalhes="/fornecedores"><BarrasHorizontais itens={porForn} cor={1} /></CartaoGrafico>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <CartaoGrafico pergunta="Para onde foi o dinheiro?"><BarrasHorizontais mostrarPct cor={2} itens={porTipo} /></CartaoGrafico>
              <CartaoGrafico pergunta="Precisa de atenção?">
                <div className="space-y-3">{alertas.slice(0, 4).map((a, i) => <Aviso key={i} tipo={a.tipo === 'erro' ? 'erro' : a.tipo === 'ok' ? 'ok' : 'atencao'} className="py-3">{a.texto}</Aviso>)}</div>
              </CartaoGrafico>
            </div>

            {metasLista.length > 0 && (
              <CartaoGrafico pergunta="Estou dentro das metas?" detalhes="/categorias">
                <div className="grid gap-6 md:grid-cols-2">
                  {metasLista.map(([id, meta]) => <BarraMeta key={id} nome={catPorId(id)?.name ?? id} gasto={gastoDeCat(id, lista)} meta={meta} />)}
                </div>
              </CartaoGrafico>
            )}
          </>
        )}
      </div>
    )
  }

  // ---------- visão do ano ----------
  const doAno = gastos.filter((g) => g.date.startsWith(String(ano)))
  const meses = Array.from({ length: 12 }, (_, i) => { const m = `${ano}-${String(i + 1).padStart(2, '0')}`; return { mes: m, indice: i, valor: soma(doMes(m)), fat: liquidoDo(m) } })
  const comValor = meses.filter((m) => m.valor > 0)
  const maisCaro = [...comValor].sort((a, b) => b.valor - a.valor)[0]
  const maior = [...doAno].sort((a, b) => b.amount_cents - a.amount_cents)[0]
  const temFat = meses.some((m) => m.fat > 0)

  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-2 rounded-cartao border-2 border-border bg-card p-1.5 shadow-suave">
        <Button variant="ghost" size="icon" onClick={() => setAno(ano - 1)} aria-label="Ano anterior"><ChevronLeft className="!size-8" /></Button>
        <span className="min-w-[8rem] text-center font-display text-mes font-semibold">{ano}</span>
        <Button variant="ghost" size="icon" onClick={() => setAno(ano + 1)} disabled={ano >= Number(atual.slice(0, 4))} aria-label="Próximo ano"><ChevronRight className="!size-8" /></Button>
      </div>
      {comValor.length === 0 ? <EstadoVazio titulo={`Nenhum gasto em ${ano}.`} /> : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <CartaoKpi rotulo="Acumulado do ano" valor={reais(soma(doAno))} destaque />
            <CartaoKpi rotulo="Mês mais caro" valor={maisCaro ? nomeMesSo(maisCaro.mes) : '—'}>{maisCaro && <p className="mt-2 text-legenda font-semibold text-muted-foreground">{reais(maisCaro.valor)}</p>}</CartaoKpi>
            <CartaoKpi rotulo="Maior gasto do ano" valor={maior ? reais(maior.amount_cents) : '—'}>{maior && <p className="mt-2 text-legenda font-semibold text-muted-foreground">{nomeFornecedor(maior.suppliers)} · {dataBR(maior.date)}</p>}</CartaoKpi>
          </div>
          <CartaoGrafico pergunta="Quanto gastei em cada mês?">
            <BarrasMensais dados={meses} destaque={atual.startsWith(String(ano)) ? atual : undefined} />
            <p className="mt-2 text-legenda text-muted-foreground">Valores em milhares de reais (k = mil). O mês atual está em laranja{atual.startsWith(String(ano)) && ' e ainda não terminou'}.</p>
          </CartaoGrafico>
          <CartaoGrafico pergunta={temFat ? 'Gastos e faturamento mês a mês' : 'Gastos mês a mês'}>
            <div className="overflow-x-auto">
              <table className="w-full text-corpo">
                <thead><tr className="border-b-2 border-border text-left text-legenda text-muted-foreground"><th className="py-2 font-bold">Mês</th><th className="py-2 text-right font-bold">Gastos</th>{temFat && <><th className="py-2 text-right font-bold">Faturamento</th><th className="py-2 text-right font-bold">Resultado</th></>}</tr></thead>
                <tbody>
                  {meses.filter((m) => m.valor > 0 || m.fat > 0).map((m, i) => (
                    <tr key={m.mes} className={cn(i % 2 === 1 && 'bg-zebra')}>
                      <td className="px-1 py-2 font-semibold">{nomeMesSo(m.mes)} <span className="text-muted-foreground">{MESES_CURTOS[m.indice]}</span></td>
                      <td className="numeros py-2 text-right">{reais(m.valor)}</td>
                      {temFat && <><td className="numeros py-2 text-right">{reais(m.fat)}</td><td className={cn('numeros py-2 text-right font-bold', m.fat - m.valor < 0 ? 'text-erro' : 'text-folha')}>{reais(m.fat - m.valor)}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CartaoGrafico>
        </>
      )}
    </div>
  )
}
