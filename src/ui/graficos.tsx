import { cn } from '@/lib/cn'
import { MESES_CURTOS, reais, reaisCurto } from '@/lib/fmt'
import { CORES_FUNDO } from './icones'

export interface Fatia { id: string; nome: string; valor: number; pct: number }

/** Cores fixas por posição para nunca repetir cor entre fatias vizinhas; "Outros" é sempre cinza. */
export const corPosicao = (i: number, f: Fatia) => (f.id === '_outros' ? 6 : (i % 5) + 1)

/** Rosca de categorias — no máximo 6 fatias, sempre com rótulo e legenda. */
export function Rosca({ fatias, tamanho = 240 }: { fatias: Fatia[]; tamanho?: number }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0) || 1
  const r = tamanho * 0.39
  const circ = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
        <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label="Gráfico de rosca dos gastos por categoria">
          <g transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}>
            {fatias.map((f, i) => {
              const len = (f.valor / total) * circ
              const el = (
                <circle key={f.id} cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" strokeWidth={tamanho * 0.18}
                  stroke={`var(--chart-${corPosicao(i, f)})`} strokeDasharray={`${Math.max(len - 3, 0)} ${circ}`} strokeDashoffset={-acc} />
              )
              acc += len
              return el
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-legenda text-muted-foreground">Total</span>
          <span className="numeros text-secao font-bold">{reaisCurto(fatias.reduce((s, f) => s + f.valor, 0))}</span>
        </div>
      </div>
      <ul className="min-w-[14rem] flex-1 space-y-2.5">
        {fatias.map((f, i) => (
          <li key={f.id} className="flex items-center gap-3 text-corpo">
            <span className={cn('size-5 shrink-0 rounded', CORES_FUNDO[corPosicao(i, f)])} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-semibold">{f.nome}</span>
            <span className="numeros font-bold">{reais(f.valor)}</span>
            <span className="numeros w-12 text-right text-muted-foreground">{Math.round(f.pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barras horizontais (ranking) com o valor escrito em cada barra. */
export function BarrasHorizontais({ itens, cor = 1, mostrarPct = true }: {
  itens: { nome: string; valor: number; pct: number }[]; cor?: number; mostrarPct?: boolean
}) {
  const max = Math.max(...itens.map((i) => i.valor), 1)
  return (
    <ul className="space-y-4">
      {itens.map((it, idx) => (
        <li key={it.nome}>
          <div className="flex items-baseline justify-between gap-3 text-corpo">
            <span className="min-w-0 truncate font-semibold">{idx + 1}. {it.nome}</span>
            <span className="numeros shrink-0 font-bold">
              {reais(it.valor)}{mostrarPct && <span className="ml-2 font-normal text-muted-foreground">{Math.round(it.pct)}%</span>}
            </span>
          </div>
          <div className="mt-1.5 h-3.5 rounded-full bg-zebra">
            <div className={cn('h-full rounded-full', CORES_FUNDO[cor])} style={{ width: `${(it.valor / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Barras verticais mês a mês, valor em cima, mês destacado em laranja. */
export function BarrasMensais({ dados, destaque, altura = 200 }: {
  dados: { mes: string; indice: number; valor: number }[]; destaque?: string; altura?: number
}) {
  const max = Math.max(...dados.map((d) => d.valor), 1)
  return (
    <div className="flex items-end gap-1.5" style={{ height: altura + 56 }} role="list" aria-label="Gastos mês a mês">
      {dados.map((d) => {
        const h = d.valor > 0 ? Math.max(6, (d.valor / max) * altura) : 0
        const on = d.mes === destaque
        return (
          <div key={d.mes} role="listitem" className="flex min-w-0 flex-1 flex-col items-center justify-end">
            {d.valor > 0 && (
              <span className={cn('numeros mb-1 text-[0.8rem] font-bold whitespace-nowrap', on && 'text-laranja')}>
                {d.valor >= 100000 ? `${Math.round(d.valor / 100000)}k` : '<1k'}
              </span>
            )}
            <div className={cn('w-full max-w-12 rounded-t-md', on ? 'bg-laranja' : 'bg-chart-6/45')} style={{ height: h }} title={reais(d.valor)} />
            <span className={cn('mt-1.5 text-legenda', on ? 'font-bold' : 'text-muted-foreground')}>{MESES_CURTOS[d.indice]}</span>
          </div>
        )
      })}
    </div>
  )
}
