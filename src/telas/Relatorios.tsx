import { useEffect, useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { GRUPOS, useApp } from '@/lib/ctx'
import { fimMes, inicioMes, mesAtual, nomeMes, reais } from '@/lib/fmt'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { SeletorMes } from '@/ui/kit'

interface G { amount_cents: number; category_id: string; status: string }
interface R { gross_cents: number; discounts_cents: number; orders: number | null }

const pct = (v: number, base: number) => (base > 0 ? `${((v / base) * 100).toFixed(1).replace('.', ',')}%` : '—')

export default function Relatorios() {
  const { mes, setMes, catPorId, raizDe } = useApp()
  const [gastos, setGastos] = useState<G[] | null>(null)
  const [recs, setRecs] = useState<R[]>([])

  useEffect(() => {
    let vivo = true
    setGastos(null)
    Promise.all([
      supabase.from('expenses').select('amount_cents,category_id,status').is('deleted_at', null).neq('status', 'AwaitingConfirmation').gte('date', inicioMes(mes)).lte('date', fimMes(mes)),
      supabase.from('revenues').select('gross_cents,discounts_cents,orders').gte('date', inicioMes(mes)).lte('date', fimMes(mes)),
    ]).then(([g, r]) => { if (vivo) { setGastos((g.data as G[]) ?? []); setRecs((r.data as R[]) ?? []) } })
    return () => { vivo = false }
  }, [mes])

  const dre = useMemo(() => {
    const lista = gastos ?? []
    const por = (g: string) => lista.filter((x) => catPorId(x.category_id)?.cost_group === g).reduce((s, x) => s + x.amount_cents, 0)
    const bruto = recs.reduce((s, r) => s + r.gross_cents, 0)
    const desc = recs.reduce((s, r) => s + r.discounts_cents, 0)
    const liquido = bruto - desc
    const cmv = por('Cmv'), fixo = por('Fixed'), variavel = por('Variable'), imposto = por('Tax')
    const total = cmv + fixo + variavel + imposto
    return { bruto, desc, liquido, cmv, fixo, variavel, imposto, total, lucroBruto: liquido - cmv, resultado: liquido - total }
  }, [gastos, recs, catPorId])

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of gastos ?? []) m.set(g.category_id, (m.get(g.category_id) ?? 0) + g.amount_cents)
    return [...m.entries()].map(([id, v]) => ({
      nome: catPorId(id)?.name ?? '?', grupo: raizDe(id)?.name ?? '',
      tipo: GRUPOS.find((x) => x.id === catPorId(id)?.cost_group)?.nome ?? '', v,
    })).sort((a, b) => b.v - a.v)
  }, [gastos, catPorId, raizDe])

  function exportarCsv() {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    const n = (c: number) => (c / 100).toFixed(2).replace('.', ',')
    const linhas: (string | number)[][] = [
      ['Linha', 'Valor (R$)'],
      ['Faturamento bruto', n(dre.bruto)], ['Descontos', n(-dre.desc)], ['Faturamento líquido', n(dre.liquido)],
      ['CMV', n(-dre.cmv)], ['Lucro bruto', n(dre.lucroBruto)], ['Despesas fixas', n(-dre.fixo)],
      ['Despesas variáveis', n(-dre.variavel)], ['Impostos', n(-dre.imposto)], ['Resultado', n(dre.resultado)],
      [], ['Grupo', 'Categoria', 'Tipo de custo', 'Gasto (R$)'], ...porCategoria.map((r) => [r.grupo, r.nome, r.tipo, n(r.v)]),
    ]
    const csv = '﻿' + linhas.map((l) => l.map((c) => q(String(c))).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `relatorio-${mes}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const Linha = ({ rotulo, v, forte, menos }: { rotulo: string; v: number; forte?: boolean; menos?: boolean }) => (
    <tr className={cn(forte && 'bg-zebra font-bold')}>
      <td className={cn('px-4 py-3', forte && 'border-t-2 border-foreground/60')}>{rotulo}</td>
      <td className={cn('numeros px-4 py-3 text-right', forte && 'border-t-2 border-foreground/60', forte && v < 0 && 'text-erro')}>{menos && v > 0 ? '− ' : ''}{reais(v)}</td>
      <td className={cn('numeros px-4 py-3 text-right text-muted-foreground', forte && 'border-t-2 border-foreground/60')}>{dre.liquido > 0 && rotulo !== 'Faturamento bruto' && rotulo !== 'Descontos' ? pct(v, dre.liquido) : ''}</td>
    </tr>
  )

  return (
    <AppShell titulo="Relatórios" subtitulo="O resultado do mês (DRE) e os gastos por categoria."
      acoes={gastos ? <><Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir / PDF</Button><Button variant="outline" onClick={exportarCsv}><Download /> Planilha (CSV)</Button></> : undefined}>
      <div className="no-print mb-6"><SeletorMes mes={mes} onChange={setMes} max={mesAtual()} /></div>
      <h2 className="mb-4 hidden font-display text-secao font-semibold print:block">Cantinho do Acarajé — {nomeMes(mes)}</h2>
      {!gastos ? <p className="text-corpo text-muted-foreground">Carregando…</p> : (
        <div className="space-y-8">
          <section aria-labelledby="dre-t">
            <h2 id="dre-t" className="mb-3 text-secao font-bold">Resultado do mês</h2>
            <div className="overflow-x-auto rounded-cartao border border-border bg-card shadow-suave">
              <table className="w-full text-corpo">
                <thead><tr className="border-b-2 border-border text-legenda text-muted-foreground"><th className="px-4 py-3 text-left font-bold">Linha</th><th className="px-4 py-3 text-right font-bold">Valor</th><th className="px-4 py-3 text-right font-bold">% do faturamento</th></tr></thead>
                <tbody>
                  <Linha rotulo="Faturamento bruto" v={dre.bruto} />
                  <Linha rotulo="Descontos" v={dre.desc} menos />
                  <Linha rotulo="Faturamento líquido" v={dre.liquido} forte />
                  <Linha rotulo="CMV (custo da mercadoria)" v={dre.cmv} menos />
                  <Linha rotulo="Lucro bruto" v={dre.lucroBruto} forte />
                  <Linha rotulo="Despesas fixas" v={dre.fixo} menos />
                  <Linha rotulo="Despesas variáveis" v={dre.variavel} menos />
                  <Linha rotulo="Impostos" v={dre.imposto} menos />
                  <Linha rotulo="Resultado" v={dre.resultado} forte />
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-legenda text-muted-foreground">Contam gastos pagos e a pagar. Contas fixas ainda sem valor confirmado ficam de fora.</p>
          </section>

          <section aria-labelledby="cat-t">
            <h2 id="cat-t" className="mb-3 text-secao font-bold">Gastos por categoria</h2>
            {porCategoria.length === 0 ? <p className="rounded-cartao border-2 border-dashed border-mostarda/70 bg-card p-6 text-center text-corpo text-muted-foreground">Sem gastos neste mês.</p> : (
              <ul className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
                {porCategoria.map((r, i) => (
                  <li key={i} className={cn('flex min-h-14 items-center gap-4 px-5 py-2', i % 2 === 1 && 'bg-zebra')}>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.nome}</span><span className="block truncate text-legenda text-muted-foreground">{r.grupo} · {r.tipo}</span></span>
                    <span className="numeros font-bold">{reais(r.v)}</span>
                    <span className="numeros w-16 text-right text-muted-foreground">{pct(r.v, dre.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  )
}
