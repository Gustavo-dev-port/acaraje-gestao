import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from './cn'

interface T { id: number; titulo: string; descricao?: string; erro?: boolean; acao?: { rotulo: string; fn: () => void } }
type Listener = (t: T) => void
let listener: Listener | null = null
let seq = 0

export const toast = {
  ok: (titulo: string, o?: { descricao?: string; acao?: { rotulo: string; fn: () => void } }) =>
    listener?.({ id: ++seq, titulo, ...o }),
  erro: (titulo: string, descricao?: string) => listener?.({ id: ++seq, titulo, descricao, erro: true }),
}

export function Toaster() {
  const [lista, setLista] = useState<T[]>([])
  useEffect(() => {
    listener = (t) => {
      setLista((l) => [...l.slice(-2), t])
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== t.id)), t.acao ? 9000 : 5000)
    }
    return () => { listener = null }
  }, [])
  return (
    <div className="no-print pointer-events-none fixed right-4 bottom-4 left-4 z-[100] flex flex-col items-end gap-3 sm:left-auto" aria-live="polite">
      {lista.map((t) => (
        <div key={t.id} role={t.erro ? 'alert' : 'status'}
          className={cn('pointer-events-auto flex w-full max-w-[28rem] items-center gap-3 rounded-cartao border-2 bg-card p-4 shadow-lg',
            t.erro ? 'border-erro' : 'border-folha')}>
          {t.erro ? <XCircle className="size-7 shrink-0 text-erro" aria-hidden /> : <CheckCircle2 className="size-7 shrink-0 text-folha" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="text-corpo font-bold">{t.titulo}</p>
            {t.descricao && <p className="text-legenda text-muted-foreground">{t.descricao}</p>}
          </div>
          {t.acao && (
            <button className="h-12 rounded-campo px-3 text-legenda font-bold text-primary underline"
              onClick={() => { t.acao!.fn(); setLista((l) => l.filter((x) => x.id !== t.id)) }}>
              {t.acao.rotulo}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
