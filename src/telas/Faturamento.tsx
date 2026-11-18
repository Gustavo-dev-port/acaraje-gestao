import { useCallback, useEffect, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { useApp } from '@/lib/ctx'
import { dataBR, fimMes, hojeIso, inicioMes, mesAtual, ontemIso, reais } from '@/lib/fmt'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { campoCls, CampoValor, CartaoKpi, Confirmacao, EstadoVazio, Rotulo, SeletorMes } from '@/ui/kit'

interface Rev { id: string; date: string; gross_cents: number; discounts_cents: number; orders: number | null }

export default function Faturamento() {
  const { companyId, podeEditar, mes, setMes } = useApp()
  const [linhas, setLinhas] = useState<Rev[]>([])
  const [data, setData] = useState(hojeIso())
  const [bruto, setBruto] = useState(0)
  const [desc, setDesc] = useState(0)
  const [pedidos, setPedidos] = useState('')
  const [erro, setErro] = useState('')
  const [apagar, setApagar] = useState<string | null>(null)
  const hoje = hojeIso()

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('revenues').select('id,date,gross_cents,discounts_cents,orders')
      .gte('date', inicioMes(mes)).lte('date', fimMes(mes)).order('date', { ascending: false })
    setLinhas((data as Rev[]) ?? [])
  }, [mes])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const ch = supabase.channel('fat-' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenues', filter: `company_id=eq.${companyId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId, carregar])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (bruto <= 0) return setErro('Digite o faturamento bruto do dia. Ex.: 2.500,00')
    if (desc > bruto) return setErro('O desconto não pode ser maior que o faturamento.')
    const { error } = await supabase.from('revenues').insert({ company_id: companyId, date: data, gross_cents: bruto, discounts_cents: desc, orders: pedidos ? Number(pedidos) : null, origin: 'Manual' })
    if (error) return setErro('Não consegui salvar. Tente de novo.')
    toast.ok('Faturamento lançado', { descricao: `${dataBR(data)} · ${reais(bruto - desc)}` })
    setBruto(0); setDesc(0); setPedidos('')
    if (data.slice(0, 7) !== mes) setMes(data.slice(0, 7)); else carregar()
  }

  async function excluir(id: string) {
    const { error } = await supabase.from('revenues').delete().eq('id', id)
    if (error) toast.erro('Não consegui apagar.', 'Só dono e sócio podem apagar.'); else { toast.ok('Faturamento apagado'); carregar() }
  }

  const liquido = linhas.reduce((s, r) => s + r.gross_cents - r.discounts_cents, 0)
  const totalPedidos = linhas.reduce((s, r) => s + (r.orders ?? 0), 0)

  return (
    <AppShell titulo="Faturamento" subtitulo="O que entrou no caixa, dia a dia.">
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <SeletorMes mes={mes} onChange={setMes} max={mesAtual()} />
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <CartaoKpi rotulo="Faturamento líquido do mês" valor={reais(liquido)} destaque />
        <CartaoKpi rotulo="Dias lançados" valor={linhas.length} />
        <CartaoKpi rotulo="Ticket médio" valor={totalPedidos > 0 ? reais(Math.round(liquido / totalPedidos)) : '—'}>
          <p className="mt-2 text-legenda text-muted-foreground">{totalPedidos > 0 ? `${totalPedidos} pedidos no mês` : 'Informe os pedidos para ver'}</p>
        </CartaoKpi>
      </div>

      <form onSubmit={salvar} noValidate className="mb-8 space-y-5 rounded-cartao border border-border bg-card p-4 shadow-suave sm:p-6">
        <h2 className="text-secao font-bold">Lançar faturamento do dia</h2>
        <fieldset>
          <legend className="text-rotulo font-semibold">Quando?</legend>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {[{ r: 'Hoje', v: hoje }, { r: 'Ontem', v: ontemIso() }].map((o) => (
              <button key={o.r} type="button" aria-pressed={data === o.v} onClick={() => setData(o.v)}
                className={cn('h-12 rounded-full border-2 px-6 text-rotulo font-semibold', data === o.v ? 'border-laranja bg-mostarda/20' : 'border-border bg-card hover:bg-accent')}>
                {data === o.v && <Check className="mr-1.5 inline size-5" aria-hidden />}{o.r}
              </button>
            ))}
            <input type="date" value={data} max={hoje} onChange={(e) => e.target.value && setData(e.target.value)} aria-label="Outra data" className="h-12 rounded-full border-2 border-border bg-card px-4 text-legenda font-semibold" />
          </div>
        </fieldset>
        <div className="grid gap-5 md:grid-cols-3">
          <div><Rotulo htmlFor="fg">Faturamento bruto</Rotulo><CampoValor id="fg" valor={bruto} onChange={setBruto} /></div>
          <div><Rotulo htmlFor="fx">Descontos (opcional)</Rotulo><CampoValor id="fx" valor={desc} onChange={setDesc} /></div>
          <div><Rotulo htmlFor="fp">Pedidos (opcional)</Rotulo><input id="fp" inputMode="numeric" value={pedidos} onChange={(e) => setPedidos(e.target.value.replace(/\D/g, '').slice(0, 5))} className={cn(campoCls, 'mt-2')} /></div>
        </div>
        {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
        <Button type="submit" size="lg" className="w-full sm:w-auto"><Check className="!size-7" /> Lançar faturamento</Button>
      </form>

      <h2 className="mb-3 text-secao font-bold">Lançamentos do mês</h2>
      {linhas.length === 0 ? <EstadoVazio titulo="Nada lançado neste mês." texto="Lance o faturamento de cada dia para ver o resultado no Dashboard." /> : (
        <ul className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
          {linhas.map((r, i) => (
            <li key={r.id} className={cn('flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2', i % 2 === 1 && 'bg-zebra')}>
              <span className="numeros w-24 font-semibold">{dataBR(r.date).slice(0, 5)}</span>
              <span className="min-w-0 flex-1 text-legenda text-muted-foreground">
                Bruto {reais(r.gross_cents)}{r.discounts_cents > 0 && ` · descontos ${reais(r.discounts_cents)}`}{r.orders ? ` · ${r.orders} pedidos` : ''}
              </span>
              <span className="numeros text-corpo font-bold">{reais(r.gross_cents - r.discounts_cents)}</span>
              {podeEditar && <Button variant="ghost" size="icon" className="text-erro" aria-label={`Apagar faturamento de ${dataBR(r.date)}`} onClick={() => setApagar(r.id)}><Trash2 className="!size-5" /></Button>}
            </li>
          ))}
        </ul>
      )}
      <Confirmacao aberto={!!apagar} onAberto={(v) => !v && setApagar(null)} titulo="Apagar este faturamento?" descricao="Ele sai do total do mês. Isso não pode ser desfeito." confirmar="Sim, apagar" onConfirmar={() => { if (apagar) excluir(apagar); setApagar(null) }} />
    </AppShell>
  )
}
