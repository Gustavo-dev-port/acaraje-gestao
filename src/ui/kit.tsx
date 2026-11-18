import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, TrendingDown, TrendingUp, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Link } from '@/lib/router'
import { centavosParaCampo, digitosParaCentavos, mudarMes, nomeMes, reais } from '@/lib/fmt'
import { Button } from './Button'
import { IconeCategoria } from './icones'
import type { IconeKey } from '@/lib/ctx'

/* ---------- Seletor de mês ---------- */
export function SeletorMes({ mes, onChange, max }: { mes: string; onChange: (m: string) => void; max?: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-cartao border-2 border-border bg-card p-1.5 shadow-suave">
      <Button variant="ghost" size="icon" onClick={() => onChange(mudarMes(mes, -1))} aria-label="Mês anterior"><ChevronLeft className="!size-8" /></Button>
      <span className="min-w-[11rem] text-center font-display text-mes font-semibold sm:min-w-[15rem]" aria-live="polite">{nomeMes(mes)}</span>
      <Button variant="ghost" size="icon" onClick={() => onChange(mudarMes(mes, 1))} disabled={!!max && mes >= max} aria-label="Próximo mês"><ChevronRight className="!size-8" /></Button>
    </div>
  )
}

/* ---------- Cartão de KPI ---------- */
export function CartaoKpi({ rotulo, valor, variacao, textoVariacao, destaque, bom, children }: {
  rotulo: string; valor: ReactNode; variacao?: number; textoVariacao?: string; destaque?: boolean; bom?: 'sobe' | 'desce'; children?: ReactNode
}) {
  const subiu = (variacao ?? 0) > 0
  // para gasto, subir é ruim; para faturamento, subir é bom
  const ruim = bom === 'sobe' ? !subiu : subiu
  return (
    <div className={cn('rounded-cartao border border-border bg-card p-6 shadow-suave', destaque && 'costura')}>
      <p className="text-rotulo font-semibold text-muted-foreground">{rotulo}</p>
      <p className="numeros mt-2 text-kpi font-bold tracking-tight break-words">{valor}</p>
      {variacao !== undefined && (
        <p className={cn('mt-2 flex items-center gap-1.5 text-legenda font-semibold', ruim ? 'text-erro' : 'text-folha')}>
          {subiu ? <TrendingUp className="size-5" aria-hidden /> : <TrendingDown className="size-5" aria-hidden />}
          {subiu ? '▲' : '▼'} {textoVariacao}
        </p>
      )}
      {children}
    </div>
  )
}

/* ---------- Barra de meta ---------- */
export const statusMeta = (gasto: number, meta: number) => (gasto > meta ? 'acima' : gasto >= meta * 0.85 ? 'atencao' : 'dentro')

export function BarraMeta({ nome, gasto, meta }: { nome: string; gasto: number; meta: number }) {
  const st = statusMeta(gasto, meta)
  const pct = Math.min(100, (gasto / meta) * 100)
  const cfg = {
    dentro: { texto: 'Dentro da meta', cor: 'bg-folha', txt: 'text-folha', I: CheckCircle2 },
    atencao: { texto: 'Atenção, perto do limite', cor: 'bg-alerta', txt: 'text-alerta', I: AlertTriangle },
    acima: { texto: 'Acima da meta', cor: 'bg-erro', txt: 'text-erro', I: XCircle },
  }[st]
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-rotulo font-semibold">{nome}</span>
        <span className="numeros text-corpo"><b>{reais(gasto)}</b> <span className="text-muted-foreground">de {reais(meta)}</span></span>
      </div>
      <div className="mt-2 h-4 overflow-hidden rounded-full bg-zebra" role="progressbar" aria-valuenow={Math.round((gasto / meta) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${nome}: ${cfg.texto}`}>
        <div className={cn('h-full rounded-full transition-[width] duration-200', cfg.cor)} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn('mt-1.5 flex items-center gap-1.5 text-legenda font-semibold', cfg.txt)}>
        <cfg.I className="size-5" aria-hidden /> {cfg.texto} · {Math.round((gasto / meta) * 100)}%
      </p>
    </div>
  )
}

/* ---------- Aviso ---------- */
export function Aviso({ tipo = 'info', children, acao, className }: {
  tipo?: 'info' | 'atencao' | 'erro' | 'ok'; children: ReactNode; acao?: ReactNode; className?: string
}) {
  const cfg = {
    info: { c: 'border-foco/40 bg-card', I: Info, ic: 'text-foco' },
    atencao: { c: 'border-alerta/50 bg-alerta-bg', I: AlertTriangle, ic: 'text-alerta' },
    erro: { c: 'border-erro/50 bg-erro-bg', I: XCircle, ic: 'text-erro' },
    ok: { c: 'border-folha/40 bg-folha-bg', I: CheckCircle2, ic: 'text-folha' },
  }[tipo]
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={cn('flex flex-wrap items-center gap-4 rounded-cartao border-2 px-5 py-4', cfg.c, className)}>
      <cfg.I className={cn('size-7 shrink-0', cfg.ic)} aria-hidden />
      <div className="min-w-0 flex-1 text-corpo">{children}</div>
      {acao}
    </div>
  )
}

/* ---------- Estado vazio ---------- */
export function EstadoVazio({ titulo, texto, acao }: { titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-cartao border-2 border-dashed border-mostarda/70 bg-card px-6 py-12 text-center">
      <svg viewBox="0 0 120 80" className="h-24 w-36" aria-hidden>
        <ellipse cx="60" cy="62" rx="44" ry="8" className="fill-zebra" />
        <path d="M18 46c6-22 78-22 84 0-6 14-78 14-84 0z" className="fill-mostarda" />
        <path d="M24 44c8-14 64-14 72 0" className="fill-none stroke-laranja" strokeWidth="3" strokeDasharray="6 4" />
        <circle cx="44" cy="40" r="3" className="fill-laranja" /><circle cx="60" cy="36" r="3" className="fill-laranja" /><circle cx="76" cy="40" r="3" className="fill-laranja" />
      </svg>
      <p className="mt-4 font-display text-secao font-semibold">{titulo}</p>
      {texto && <p className="mt-2 max-w-[38rem] text-corpo text-muted-foreground">{texto}</p>}
      {acao && <div className="mt-6">{acao}</div>}
    </div>
  )
}

/* ---------- Botão de categoria ---------- */
export function BotaoCategoria({ nome, icone, selecionado, sugerido, onClick, erro }: {
  nome: string; icone: IconeKey; selecionado: boolean; sugerido?: boolean; onClick: () => void; erro?: boolean
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selecionado}
      className={cn('relative flex h-24 min-w-0 flex-col items-center justify-center gap-1.5 rounded-campo border-2 bg-card px-2 text-rotulo font-semibold transition-colors duration-150 hover:border-laranja/70 hover:bg-accent active:bg-mostarda/25',
        selecionado ? 'border-[3px] border-laranja bg-mostarda/15' : erro ? 'border-erro' : 'border-border')}>
      {selecionado && <CheckCircle2 className="absolute top-1.5 right-1.5 size-6 fill-laranja text-card" aria-hidden />}
      {sugerido && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-folha px-2 text-[0.85rem] leading-6 font-bold text-white">sugerido</span>}
      <IconeCategoria icone={icone} className="size-10 text-laranja" />
      <span className="max-w-full truncate">{nome}</span>
    </button>
  )
}

/* ---------- Cartão de gráfico ---------- */
export function CartaoGrafico({ pergunta, children, detalhes, className }: { pergunta: string; children: ReactNode; detalhes?: string; className?: string }) {
  return (
    <section className={cn('rounded-cartao border border-border bg-card p-6 shadow-suave', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-secao font-bold">{pergunta}</h2>
        {detalhes && <Link to={detalhes} className="flex h-12 shrink-0 items-center text-legenda font-semibold text-primary underline underline-offset-4">Ver detalhes</Link>}
      </div>
      {children}
    </section>
  )
}

/* ---------- Janela (diálogo central ou painel lateral) ---------- */
export function Janela({ titulo, onFechar, children, lado, largura = '34rem' }: {
  titulo: string; onFechar: () => void; children: ReactNode; lado?: boolean; largura?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // o pai costuma criar uma função nova a cada digitação; guardá-la numa ref evita
  // reexecutar o efeito (que roubava o foco do campo que a pessoa estava preenchendo)
  const fecharRef = useRef(onFechar)
  fecharRef.current = onFechar
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && fecharRef.current()
    window.addEventListener('keydown', onKey)
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // foca a janela só se nenhum campo dentro dela já tiver pedido o foco (autoFocus)
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflowAntes
      anterior?.focus?.()
    }
  }, [])
  // Tab não sai da janela: do último campo volta ao primeiro (e Shift+Tab ao contrário)
  const prenderFoco = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return
    const itens = Array.from(ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null)
    if (itens.length === 0) { e.preventDefault(); return }
    const primeiro = itens[0], ultimo = itens[itens.length - 1]
    if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === ref.current)) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
  }
  return (
    <div className="no-print fixed inset-0 z-50 flex bg-preto/55" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={titulo} onKeyDown={prenderFoco} style={{ maxWidth: largura }}
        className={cn('relative w-full overflow-y-auto bg-card p-6 shadow-2xl outline-none sm:p-8',
          lado ? 'ml-auto h-full' : 'm-auto max-h-[94vh] rounded-cartao')}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="font-display text-secao font-semibold">{titulo}</h2>
          <Button variant="ghost" size="icon" onClick={onFechar} aria-label="Fechar"><X /></Button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ---------- Confirmação ---------- */
export function Confirmacao({ aberto, onAberto, titulo, descricao, confirmar, onConfirmar }: {
  aberto: boolean; onAberto: (v: boolean) => void; titulo: string; descricao: string; confirmar: string; onConfirmar: () => void
}) {
  if (!aberto) return null
  return (
    <Janela titulo={titulo} onFechar={() => onAberto(false)} largura="30rem">
      <p className="text-corpo text-muted-foreground">{descricao}</p>
      <div className="mt-6 flex gap-3">
        <Button autoFocus className="h-14 flex-1 border-2 border-foreground bg-foreground text-botao font-bold text-background hover:bg-foreground/90" onClick={() => onAberto(false)}>Cancelar</Button>
        <Button className="h-14 flex-1 border-2 border-erro bg-card text-botao font-semibold text-erro hover:bg-erro-bg" onClick={onConfirmar}>{confirmar}</Button>
      </div>
    </Janela>
  )
}

/* ---------- Campos ---------- */
export const campoCls = 'h-14 w-full rounded-campo border-[1.5px] border-input bg-card px-4 text-corpo text-foreground placeholder:text-muted-foreground focus-visible:border-2 focus-visible:border-foco aria-[invalid=true]:border-2 aria-[invalid=true]:border-erro disabled:opacity-50'

export function Rotulo({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="text-rotulo font-semibold">{children}</label>
}

/** Campo de valor em reais: os dígitos entram pela direita, como no caixa eletrônico. */
export function CampoValor({ id, valor, onChange, grande, invalido, disabled, inputRef }: {
  id?: string; valor: number; onChange: (c: number) => void; grande?: boolean; invalido?: boolean; disabled?: boolean
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div className={cn('mt-2 flex items-center rounded-campo border-[1.5px] border-input bg-card px-4 focus-within:border-2 focus-within:border-foco',
      grande ? 'h-[4.5rem] px-5' : 'h-14', invalido && 'border-2 border-erro', disabled && 'bg-zebra')}>
      <span className={cn('mr-3 font-semibold text-muted-foreground', grande ? 'text-valor' : 'text-secao')}>R$</span>
      <input id={id} ref={inputRef} inputMode="numeric" autoComplete="off" disabled={disabled} aria-invalid={invalido}
        value={centavosParaCampo(valor)} onChange={(e) => onChange(digitosParaCentavos(e.target.value))}
        onFocus={(e) => { const el = e.currentTarget; requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length)) }}
        className={cn('numeros w-full min-w-0 bg-transparent text-right font-bold outline-none focus-visible:outline-none', grande ? 'text-valor' : 'text-secao')} />
    </div>
  )
}

export function Chip({ ativo, onClick, children, className }: { ativo: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick}
      className={cn('h-12 rounded-full border-2 px-5 text-legenda font-semibold transition-colors duration-150',
        ativo ? 'border-laranja bg-mostarda/20' : 'border-border bg-card hover:bg-accent', className)}>
      {children}
    </button>
  )
}

export function Selo({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'ok' | 'alerta' | 'erro' | 'neutro' }) {
  const c = { ok: 'bg-folha-bg text-folha', alerta: 'bg-alerta-bg text-alerta', erro: 'bg-erro-bg text-erro', neutro: 'bg-zebra text-muted-foreground' }[tom]
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-legenda font-bold', c)}>{children}</span>
}
