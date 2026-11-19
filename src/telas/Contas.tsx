import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CheckCheck, Hourglass, Pencil, Plus, Undo2 } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { nomeFornecedor, useApp } from '@/lib/ctx'
import { fimMes, hojeIso, inicioMes, mesAtual, nomeMes, reais } from '@/lib/fmt'
import { GASTO_SEL, type Gasto } from '@/lib/gastos'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { IconeCategoria } from '@/ui/icones'
import { Aviso, campoCls, CampoValor, Janela, Rotulo, EstadoVazio } from '@/ui/kit'
import { LIMITE } from '@/lib/validar'
import { SelectCategoria } from './GastoEditor'

interface Rec {
  id: string; description: string; supplier_id: string; category_id: string; default_amount_cents: number
  day_of_month: number; start_date: string; end_date: string | null; active: boolean; needs_confirmation: boolean
}

// mês de competência de uma conta: o do vencimento (ou, sem vencimento, o da data)
const mesDaConta = (g: Gasto) => (g.due_date ?? g.date).slice(0, 7)

export default function Contas() {
  const app = useApp()
  const { companyId, podeEditar } = app
  const [linhas, setLinhas] = useState<Gasto[]>([])
  const [recs, setRecs] = useState<Rec[]>([])
  const [valores, setValores] = useState<Record<string, number>>({})
  const [painel, setPainel] = useState<Partial<Rec> | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  const mes = mesAtual()
  const hoje = hojeIso()

  const carregar = useCallback(async () => {
    const [pend, doMes, r] = await Promise.all([
      supabase.from('expenses').select(GASTO_SEL).is('deleted_at', null).in('status', ['Pending', 'AwaitingConfirmation']).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('expenses').select(GASTO_SEL).is('deleted_at', null).not('recurrence_id', 'is', null)
        // competência pelo vencimento (ou pela data, quando não há vencimento), igual ao critério da tela
        .or(`and(due_date.gte.${inicioMes(mes)},due_date.lte.${fimMes(mes)}),and(due_date.is.null,date.gte.${inicioMes(mes)},date.lte.${fimMes(mes)})`),
      supabase.from('recurrences').select('id,description,supplier_id,category_id,default_amount_cents,day_of_month,start_date,end_date,active,needs_confirmation').order('day_of_month'),
    ])
    if (pend.error || doMes.error || r.error) { setErro(true); setCarregando(false); return }
    const mapa = new Map<string, Gasto>()
    for (const g of [...((pend.data as unknown as Gasto[]) ?? []), ...((doMes.data as unknown as Gasto[]) ?? [])]) mapa.set(g.id, g)
    setLinhas([...mapa.values()].sort((a, b) => (a.due_date ?? a.date).localeCompare(b.due_date ?? b.date)))
    setRecs((r.data as Rec[]) ?? [])
    setErro(false)
    setCarregando(false)
  }, [mes])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const ch = supabase.channel('contas-' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `company_id=eq.${companyId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [companyId, carregar])

  const valorDe = (g: Gasto) => valores[g.id] ?? g.amount_cents
  // o resumo e o "confirmar todas" valem só para o mês corrente; o resto aparece à parte
  const daMes = linhas.filter((g) => mesDaConta(g) === mes)
  const anteriores = linhas.filter((g) => mesDaConta(g) < mes && g.status !== 'Paid')
  const seguintes = linhas.filter((g) => mesDaConta(g) > mes && g.status !== 'Paid')
  const pendentes = daMes.filter((g) => g.status !== 'Paid')
  const previsto = daMes.reduce((t, g) => t + valorDe(g), 0)
  const venceu = (g: Gasto) => g.status !== 'Paid' && (g.due_date ?? g.date) < hoje

  async function confirmar(ids: string[]) {
    const alvos = linhas.filter((g) => ids.includes(g.id))
    // guarda a situação e o valor de antes, para o "Desfazer" devolver exatamente o que era
    const antes = alvos.map((g) => ({ id: g.id, status: g.status, amount_cents: g.amount_cents }))
    // uma única chamada no banco: todas as contas mudam juntas ou nenhuma muda
    const { error: erroLote } = await supabase.rpc('set_expenses_status', { p_items: alvos.map((g) => ({ id: g.id, status: 'Paid', amount_cents: valorDe(g) })) })
    if (erroLote) { carregar(); return toast.erro('Não confirmei nenhuma conta.', 'Nada foi alterado. Confira a lista e tente de novo.') }
    setValores({})
    toast.ok(ids.length > 1 ? `${ids.length} contas confirmadas!` : `${nomeFornecedor(alvos[0]?.suppliers)} confirmada`, {
      descricao: ids.length > 1 ? 'Elas já contam nos lançamentos do mês.' : reais(valorDe(alvos[0])),
      acao: { rotulo: 'Desfazer', fn: async () => {
        const { error: erroVolta } = await supabase.rpc('set_expenses_status', { p_items: antes })
        if (erroVolta) toast.erro('Não consegui desfazer.', 'Nada foi alterado. Confira a lista.'); else toast.ok('Confirmação desfeita.')
        carregar()
      } },
    })
    carregar()
  }

  async function desfazer(g: Gasto) {
    const { error } = await supabase.from('expenses').update({ status: 'Pending' }).eq('id', g.id)
    if (error) toast.erro('Não consegui desfazer.'); else carregar()
  }

  const cartao = (g: Gasto) => {
    const paga = g.status === 'Paid'
    const atrasada = venceu(g)
    const aConfirmar = g.status === 'AwaitingConfirmation'
    const v = valorDe(g)
    const st = paga ? { t: 'Pago', I: CheckCircle2, cls: 'bg-folha-bg text-folha' }
      : atrasada ? { t: 'Atrasada', I: AlertTriangle, cls: 'bg-erro-bg text-erro' }
      : { t: aConfirmar ? 'A confirmar' : 'A pagar', I: Hourglass, cls: 'bg-alerta-bg text-alerta' }
    return (
      <li key={g.id} className={cn('flex flex-col gap-4 rounded-cartao border-2 bg-card p-5 shadow-suave', atrasada ? 'border-erro/60' : paga ? 'border-folha/40' : 'border-border')}>
        <div className="flex items-start gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-campo bg-mostarda/20"><IconeCategoria icone={app.iconeDoGasto(g.category_id)} className="size-8 text-laranja" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-secao leading-tight font-bold">{g.notes && g.recurrence_id ? g.notes : nomeFornecedor(g.suppliers)}</p>
            <p className="truncate text-legenda text-muted-foreground">Vence {(g.due_date ?? g.date).split('-').reverse().slice(0, 2).join('/')} · {nomeFornecedor(g.suppliers)}</p>
          </div>
          <span className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-legenda font-bold', st.cls)}><st.I className="size-5" aria-hidden /> {st.t}</span>
        </div>
        <div>
          <Rotulo htmlFor={`v-${g.id}`}><span className="text-legenda font-semibold text-muted-foreground">{paga ? 'Valor pago' : 'Valor deste mês (pode mudar)'}</span></Rotulo>
          <CampoValor id={`v-${g.id}`} valor={v} disabled={paga} onChange={(c) => setValores((x) => ({ ...x, [g.id]: c }))} />
        </div>
        {paga ? (
          <Button variant="ghost" onClick={() => desfazer(g)}><Undo2 /> Desfazer confirmação</Button>
        ) : (
          <Button variant="sucesso" onClick={() => confirmar([g.id])}><CheckCircle2 /> Confirmar pagamento</Button>
        )}
      </li>
    )
  }

  const grade = 'grid gap-4 md:grid-cols-2 2xl:grid-cols-3'

  return (
    <AppShell titulo="Contas do mês" subtitulo={`${nomeMes(mes)} · Confira o valor de cada conta e confirme quando pagar.`}
      acoes={podeEditar ? <Button variant="outline" onClick={() => setPainel({ active: true, needs_confirmation: true, day_of_month: 10, start_date: hoje })}><Plus /> Nova conta fixa</Button> : undefined}>
      {erro && (
        <Aviso tipo="erro" className="mb-6" acao={<Button variant="outline" onClick={() => { setCarregando(true); carregar() }}>Tentar de novo</Button>}>
          Não consegui carregar as contas. Por segurança, não mostro valores incompletos.
        </Aviso>
      )}

      {!erro && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-5 rounded-cartao border border-border bg-card p-5 shadow-suave">
            <div className="flex-1">
              <p className="text-corpo text-muted-foreground">Previsto para o mês</p>
              <p className="numeros text-kpi font-bold">{reais(previsto)}</p>
            </div>
            <p className="text-corpo"><b>{daMes.length - pendentes.length}</b> de <b>{daMes.length}</b> confirmadas</p>
            <Button size="xl" onClick={() => confirmar(pendentes.map((g) => g.id))} disabled={pendentes.length === 0}>
              <CheckCheck className="!size-7" /> {pendentes.length ? `Confirmar todas (${pendentes.length})` : 'Tudo confirmado'}
            </Button>
          </div>

          {(anteriores.length > 0 || pendentes.some(venceu)) && (
            <Aviso tipo="erro" className="mb-6"><b>Tem conta atrasada.</b> Confira as marcadas em vermelho e confirme se já pagou.</Aviso>
          )}

          {carregando ? <p className="text-corpo text-muted-foreground">Carregando…</p> : linhas.length === 0 ? (
            <EstadoVazio titulo="Nenhuma conta para este mês." texto="Cadastre aluguel, luz, internet e outras contas fixas: elas aparecem aqui sozinhas todo mês." />
          ) : (
            <div className="space-y-8">
              {anteriores.length > 0 && (
                <section aria-labelledby="ant-t">
                  <h2 id="ant-t" className="text-secao font-bold">Em aberto de meses anteriores</h2>
                  <p className="mb-3 text-corpo text-muted-foreground">Não entram no previsto nem no “Confirmar todas” do mês. Confirme uma a uma.</p>
                  <ul className={grade}>{anteriores.map(cartao)}</ul>
                </section>
              )}
              {daMes.length > 0 && <ul className={grade}>{daMes.map(cartao)}</ul>}
              {seguintes.length > 0 && (
                <section aria-labelledby="seg-t">
                  <h2 id="seg-t" className="mb-3 text-secao font-bold">Meses seguintes</h2>
                  <ul className={grade}>{seguintes.map(cartao)}</ul>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {podeEditar && recs.length > 0 && (
        <section className="mt-10" aria-labelledby="fixas-titulo">
          <h2 id="fixas-titulo" className="text-secao font-bold">Contas fixas cadastradas</h2>
          <p className="mb-3 text-corpo text-muted-foreground">Elas entram sozinhas todo mês. Edite o valor usual ou desative quando acabar.</p>
          <ul className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
            {recs.map((r, i) => (
              <li key={r.id} className={cn('flex min-h-16 items-center gap-4 px-5 py-2', i % 2 === 1 && 'bg-zebra')}>
                <IconeCategoria icone={app.iconeDoGasto(r.category_id)} className="size-6 text-laranja" />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate font-semibold', !r.active && 'line-through opacity-60')}>{r.description}</span>
                  <span className="block truncate text-legenda text-muted-foreground">todo dia {r.day_of_month} · {nomeFornecedor(app.sups.find((s) => s.id === r.supplier_id))}{!r.active && ' · desativada'}</span>
                </span>
                <span className="numeros font-bold">{reais(r.default_amount_cents)}</span>
                <Button variant="ghost" size="icon" aria-label={`Editar ${r.description}`} onClick={() => setPainel(r)}><Pencil className="!size-5" /></Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {painel && <FormConta inicial={painel} onFechar={() => setPainel(null)} onSalvo={() => { setPainel(null); carregar() }} />}
    </AppShell>
  )
}

function FormConta({ inicial, onFechar, onSalvo }: { inicial: Partial<Rec>; onFechar: () => void; onSalvo: () => void }) {
  const app = useApp()
  const [nome, setNome] = useState(inicial.description ?? '')
  const [fornId, setFornId] = useState(inicial.supplier_id ?? '')
  const [novoForn, setNovoForn] = useState('')
  const [cat, setCat] = useState(inicial.category_id ?? '')
  const [dia, setDia] = useState(String(inicial.day_of_month ?? 10))
  const [valor, setValor] = useState(inicial.default_amount_cents ?? 0)
  const [muda, setMuda] = useState(inicial.needs_confirmation ?? true)
  const [ativa, setAtiva] = useState(inicial.active ?? true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setErro('')
    const d = Number(dia)
    if (!nome.trim()) return setErro('Escreva o nome da conta. Ex.: Aluguel, Internet.')
    if (!cat) return setErro('Escolha a categoria.')
    if (!fornId || (fornId === '_novo' && !novoForn.trim())) return setErro('Escolha para quem você paga.')
    if (!(d >= 1 && d <= 31)) return setErro('O dia do vencimento vai de 1 a 31.')
    if (valor <= 0) return setErro('Digite o valor previsto. Ex.: 250,00')
    setSalvando(true)
    let sid = fornId
    if (fornId === '_novo') {
      const { data, error } = await supabase.from('suppliers').insert({ company_id: app.companyId, nickname: novoForn.trim(), is_complete: false }).select('id').single()
      if (error || !data) { setSalvando(false); return setErro('Não consegui cadastrar o fornecedor.') }
      sid = data.id as string
    }
    const payload = { description: nome.trim(), supplier_id: sid, category_id: cat, default_amount_cents: valor, day_of_month: d, needs_confirmation: muda, active: ativa }
    const r = inicial.id
      ? await supabase.from('recurrences').update(payload).eq('id', inicial.id)
      : await supabase.from('recurrences').insert({ ...payload, company_id: app.companyId, start_date: hojeIso().slice(0, 7) + '-01' })
    if (r.error) { setSalvando(false); return setErro('Não consegui salvar a conta.') }
    const gerou = await supabase.rpc('generate_recurrences_range', { p_company: app.companyId, p_until: hojeIso() })
    await app.recarregar()
    setSalvando(false)
    if (gerou.error) toast.erro('Conta salva, mas não consegui lançá-la neste mês.', 'Abra “Contas do mês” de novo em instantes; ela é gerada ao entrar.')
    else toast.ok('Conta fixa salva', { descricao: `${nome} · todo dia ${d}` })
    onSalvo()
  }

  return (
    <Janela titulo={inicial.id ? 'Editar conta fixa' : 'Nova conta fixa'} onFechar={onFechar} lado largura="30rem">
      <div className="space-y-5">
        <div>
          <Rotulo htmlFor="nc-nome">Nome da conta</Rotulo>
          <input id="nc-nome" maxLength={LIMITE.nome} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Seguro do bar" className={cn(campoCls, 'mt-2')} />
        </div>
        <div>
          <Rotulo htmlFor="nc-forn">Para quem você paga</Rotulo>
          <select id="nc-forn" value={fornId} onChange={(e) => setFornId(e.target.value)} className={cn(campoCls, 'mt-2')}>
            <option value="">Escolha…</option>
            {app.sups.map((s) => <option key={s.id} value={s.id}>{nomeFornecedor(s)}</option>)}
            <option value="_novo">➕ Novo fornecedor…</option>
          </select>
          {fornId === '_novo' && <input maxLength={LIMITE.nome} value={novoForn} onChange={(e) => setNovoForn(e.target.value)} placeholder="Nome do fornecedor" aria-label="Nome do novo fornecedor" className={cn(campoCls, 'mt-2')} />}
        </div>
        <div>
          <Rotulo htmlFor="nc-cat">Tipo de gasto</Rotulo>
          <SelectCategoria id="nc-cat" valor={cat} onChange={setCat} className="mt-2" />
        </div>
        <div className="grid grid-cols-[8rem_1fr] gap-4">
          <div>
            <Rotulo htmlFor="nc-dia">Vence dia</Rotulo>
            <input id="nc-dia" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} className={cn(campoCls, 'mt-2')} />
          </div>
          <div>
            <Rotulo htmlFor="nc-valor">Valor previsto</Rotulo>
            <CampoValor id="nc-valor" valor={valor} onChange={setValor} />
          </div>
        </div>
        <label className="flex min-h-12 items-center gap-3 text-corpo font-semibold"><input type="checkbox" checked={muda} onChange={(e) => setMuda(e.target.checked)} className="size-6 accent-[var(--laranja)]" /> O valor muda todo mês (pedir para confirmar)</label>
        {inicial.id && <label className="flex min-h-12 items-center gap-3 text-corpo font-semibold"><input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="size-6 accent-[var(--laranja)]" /> Conta ativa</label>}
        {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
        <div className="flex gap-3">
          <Button size="lg" className="flex-1" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar conta'}</Button>
          <Button size="lg" variant="outline" onClick={onFechar}>Cancelar</Button>
        </div>
      </div>
    </Janela>
  )
}
