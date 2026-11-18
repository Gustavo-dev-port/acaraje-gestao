import { useEffect, useMemo, useState } from 'react'
import { formatCents, todayIso } from './money'
import { computeDre, fmtPct, loadMonth, pct, rootOf, type MonthData } from './finance'
import { GROUPS } from './Categorias'

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export default function Relatorios() {
  const [month, setMonth] = useState(todayIso().slice(0, 7))
  const [data, setData] = useState<MonthData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setData(null); setError('')
    loadMonth(month).then((d) => alive && setData(d)).catch(() => alive && setError('Não consegui carregar o relatório.'))
    return () => { alive = false }
  }, [month])

  const dre = useMemo(() => (data ? computeDre(data) : null), [data])

  const byCategory = useMemo(() => {
    if (!data) return []
    const m = new Map<string, number>()
    for (const e of data.expenses) {
      if (e.status === 'AwaitingConfirmation') continue
      m.set(e.category_id, (m.get(e.category_id) ?? 0) + e.amount_cents)
    }
    return [...m.entries()].map(([id, v]) => {
      const c = data.cats[id]
      return { name: c?.name ?? '?', parent: rootOf(data.cats, id)?.name ?? '', group: GROUPS[c?.cost_group ?? ''] ?? '', v }
    }).sort((a, b) => b.v - a.v)
  }, [data])

  function exportCsv() {
    if (!dre) return
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    const n = (c: number) => (c / 100).toFixed(2).replace('.', ',')
    const lines = [
      ['Linha', 'Valor (R$)'],
      ['Faturamento bruto', n(dre.gross)], ['Descontos', n(-dre.discounts)], ['Faturamento líquido', n(dre.net)],
      ['CMV', n(-dre.cmv)], ['Lucro bruto', n(dre.grossProfit)], ['Despesas fixas', n(-dre.fixed)],
      ['Despesas variáveis', n(-dre.variable)], ['Impostos', n(-dre.tax)], ['Resultado', n(dre.result)],
      [], ['Grupo', 'Categoria', 'Tipo de custo', 'Gasto (R$)'],
      ...byCategory.map((r) => [r.parent, r.name, r.group, n(r.v)]),
    ].map((l) => l.map((c) => q(String(c))).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `relatorio-${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const Line = ({ label, v, strong, minus, base }: { label: string; v: number; strong?: boolean; minus?: boolean; base?: number }) => (
    <tr className={strong ? 'strong' : ''}>
      <td>{label}</td>
      <td className="num">{minus && v > 0 ? '− ' : ''}{formatCents(v)}</td>
      <td className="num muted">{base ? fmtPct(pct(v, base)) : ''}</td>
    </tr>
  )

  return (
    <div>
      <div className="head noprint">
        <div>
          <h1 className="title">Relatórios</h1>
          <p className="muted">Resultado do mês (DRE) e gastos por categoria.</p>
        </div>
        <input type="month" className="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      <div className="stitch noprint" />
      {error && <p className="msg error" role="alert">{error}</p>}
      {!dre ? <p className="muted">Carregando…</p> : (
        <>
          <div className="actions noprint">
            <button className="btn" onClick={() => window.print()}>🖨 Imprimir / salvar PDF</button>
            <button className="btn" onClick={exportCsv}>⬇ Planilha (CSV)</button>
          </div>
          <h2 className="subtitle printonly">Cantinho do Acarajé — {monthLabel(month)}</h2>
          <h2 className="subtitle">Resultado do mês</h2>
          <div className="card">
            <table className="tbl">
              <tbody>
                <Line label="Faturamento bruto" v={dre.gross} />
                <Line label="Descontos" v={dre.discounts} minus />
                <Line label="Faturamento líquido" v={dre.net} strong base={dre.net} />
                <Line label="CMV (custo da mercadoria)" v={dre.cmv} minus base={dre.net} />
                <Line label="Lucro bruto" v={dre.grossProfit} strong base={dre.net} />
                <Line label="Despesas fixas" v={dre.fixed} minus base={dre.net} />
                <Line label="Despesas variáveis" v={dre.variable} minus base={dre.net} />
                <Line label="Impostos" v={dre.tax} minus base={dre.net} />
                <Line label="Resultado" v={dre.result} strong base={dre.net} />
              </tbody>
            </table>
            <p className="muted small">Contam gastos pagos e a pagar. Contas fixas ainda sem valor confirmado ficam de fora.</p>
          </div>

          <h2 className="subtitle">Gastos por categoria</h2>
          {byCategory.length === 0 ? <div className="card empty">Sem gastos neste mês.</div> : (
            <div className="card">
              <table className="tbl">
                <tbody>
                  {byCategory.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}<div className="muted small">{r.parent}</div></td>
                      <td className="num">{formatCents(r.v)}</td>
                      <td className="num muted">{fmtPct(pct(r.v, dre.expenses))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
