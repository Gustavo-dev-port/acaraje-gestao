import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, History, Pencil, Plus } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { useApp } from '@/lib/ctx'
import { dataBR, hojeIso, reais } from '@/lib/fmt'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { Aviso, campoCls, Chip, EstadoVazio, Janela, Rotulo, Selo } from '@/ui/kit'
import { LIMITE } from '@/lib/validar'

type Un = 'kg' | 'g' | 'l' | 'ml' | 'un'
type Tipo = 'Entrada' | 'Saida' | 'Perda'

interface Saldo {
  ingredient_id: string; name: string; unit: Un; active: boolean; min_stock: number | null
  balance: number; last_movement: string | null; below_min: boolean; stock_value_cents: number
}
interface Mov { id: string; kind: Tipo | 'Ajuste'; delta: number; occurred_on: string; notes: string | null }

const TIPOS: { v: Tipo; rotulo: string; sinal: 1 | -1; dica: string }[] = [
  { v: 'Entrada', rotulo: 'Entrada', sinal: 1, dica: 'Chegou mercadoria (compra).' },
  { v: 'Saida', rotulo: 'Saída', sinal: -1, dica: 'Foi usado na cozinha ou no bar.' },
  { v: 'Perda', rotulo: 'Perda', sinal: -1, dica: 'Estragou, caiu ou venceu.' },
]
const ROTULO_MOV: Record<Mov['kind'], string> = { Entrada: 'Entrada', Saida: 'Saída', Perda: 'Perda', Ajuste: 'Ajuste' }

const qtdTxt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const numero = (s: string) => Number(s.trim().replace(',', '.'))
const arred3 = (n: number) => Math.round(n * 1000) / 1000
const LIMITE_QTD = 999_999

export default function Estoque() {
  const { companyId, podeEditar } = useApp()
  const [saldos, setSaldos] = useState<Saldo[]>([])
  const [carregou, setCarregou] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [soBaixo, setSoBaixo] = useState(false)
  const [lancar, setLancar] = useState<Saldo | null>(null)
  const [historico, setHistorico] = useState<Saldo | null>(null)
  const [minimo, setMinimo] = useState<Saldo | null>(null)
  const [contando, setContando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('stock_balance').select('*').order('name')
    setFalhou(!!error)
    setSaldos(((data as Saldo[]) ?? []).map((s) => ({
      ...s, balance: Number(s.balance), stock_value_cents: Number(s.stock_value_cents),
      min_stock: s.min_stock == null ? null : Number(s.min_stock),
    })))
    setCarregou(true)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const ativos = useMemo(() => saldos.filter((s) => s.active || s.balance !== 0), [saldos])
  const baixos = useMemo(() => ativos.filter((s) => s.below_min), [ativos])
  const valorTotal = useMemo(() => ativos.reduce((t, s) => t + s.stock_value_cents, 0), [ativos])
  const lista = soBaixo ? baixos : ativos

  return (
    <AppShell titulo="Estoque" subtitulo="Quanto você tem de cada insumo e o que está acabando."
      acoes={podeEditar && ativos.length > 0 ? <Button size="lg" variant="outline" onClick={() => setContando(true)}><ClipboardCheck /> Fazer contagem</Button> : undefined}>
      {falhou && <Aviso tipo="erro" className="mb-5">Não consegui carregar o estoque. Verifique a internet e abra a tela de novo.</Aviso>}

      {carregou && !falhou && ativos.length === 0 ? (
        <EstadoVazio titulo="Nenhum insumo para controlar." texto="Cadastre os insumos em Ficha técnica › Insumos e preços. Depois eles aparecem aqui para você lançar entradas, saídas e perdas." />
      ) : (
        <>
          {baixos.length > 0 && (
            <Aviso tipo="atencao" className="mb-5">
              <b>{baixos.length}</b> {baixos.length === 1 ? 'insumo está abaixo do mínimo' : 'insumos estão abaixo do mínimo'}: {baixos.slice(0, 4).map((b) => b.name).join(', ')}{baixos.length > 4 ? '…' : ''}.
            </Aviso>
          )}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Chip ativo={!soBaixo} onClick={() => setSoBaixo(false)}>Todos ({ativos.length})</Chip>
            <Chip ativo={soBaixo} onClick={() => setSoBaixo(true)}>Abaixo do mínimo ({baixos.length})</Chip>
            <span className="ml-auto text-corpo text-muted-foreground">Valor em estoque: <b className="numeros text-foreground">{reais(valorTotal)}</b></span>
          </div>

          {lista.length === 0 ? (
            <EstadoVazio titulo="Nada abaixo do mínimo." texto="Todos os insumos com mínimo definido estão em dia." />
          ) : (
            <ul className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
              {lista.map((s, k) => {
                const negativo = s.balance < 0
                return (
                  <li key={s.ingredient_id} className={cn('flex min-h-[4.5rem] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3', k % 2 === 1 && 'bg-zebra')}>
                    <span className="min-w-0 flex-1 basis-48">
                      <span className={cn('block truncate font-semibold', !s.active && 'line-through opacity-60')}>{s.name}</span>
                      <span className="block text-legenda text-muted-foreground">
                        {s.min_stock != null ? `mínimo ${qtdTxt(s.min_stock)} ${s.unit}` : 'sem mínimo definido'}
                        {s.last_movement ? ` · último lançamento em ${dataBR(s.last_movement)}` : ' · sem lançamentos'}
                      </span>
                    </span>
                    {negativo ? <Selo tom="erro">Saldo negativo</Selo> : s.below_min ? <Selo tom="alerta">Abaixo do mínimo</Selo> : null}
                    <span className="text-right">
                      <span className={cn('numeros block text-secao font-bold', (negativo || s.below_min) && 'text-erro')}>{qtdTxt(s.balance)} {s.unit}</span>
                      <span className="block text-legenda text-muted-foreground">{s.stock_value_cents > 0 ? reais(s.stock_value_cents) : 'sem valor'}</span>
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setLancar(s)}><Plus /> Lançar</Button>
                    <Button variant="ghost" size="icon" aria-label={`Histórico de ${s.name}`} onClick={() => setHistorico(s)}><History className="!size-5" /></Button>
                    {podeEditar && <Button variant="ghost" size="icon" aria-label={`Definir mínimo de ${s.name}`} onClick={() => setMinimo(s)}><Pencil className="!size-5" /></Button>}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {lancar && <JanelaLancar insumo={lancar} companyId={companyId} podeEditar={podeEditar} onFechar={() => setLancar(null)} aoSalvar={() => { setLancar(null); carregar() }} />}
      {historico && <JanelaHistorico insumo={historico} onFechar={() => setHistorico(null)} />}
      {minimo && <JanelaMinimo insumo={minimo} onFechar={() => setMinimo(null)} aoSalvar={() => { setMinimo(null); carregar() }} />}
      {contando && <JanelaContagem itens={ativos.filter((s) => s.active)} companyId={companyId} onFechar={() => setContando(false)} aoSalvar={() => { setContando(false); carregar() }} />}
    </AppShell>
  )
}

function JanelaLancar({ insumo, companyId, podeEditar, onFechar, aoSalvar }: {
  insumo: Saldo; companyId: string; podeEditar: boolean; onFechar: () => void; aoSalvar: () => void
}) {
  const [tipo, setTipo] = useState<Tipo>('Entrada')
  const [qtd, setQtd] = useState('')
  const [data, setData] = useState(hojeIso())
  const [nota, setNota] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const def = TIPOS.find((t) => t.v === tipo)!
  const q = numero(qtd)
  const novoSaldo = q > 0 ? arred3(insumo.balance + def.sinal * q) : null

  async function salvar() {
    if (ocupado) return
    if (!(q > 0) || q > LIMITE_QTD) return setErro(`Informe uma quantidade maior que zero (até ${LIMITE_QTD.toLocaleString('pt-BR')}).`)
    if (!data || data > hojeIso()) return setErro('A data não pode ser no futuro.')
    setErro(''); setOcupado(true)
    const { error } = await supabase.from('stock_movements').insert({
      company_id: companyId, ingredient_id: insumo.ingredient_id, kind: tipo,
      delta: def.sinal * arred3(q), occurred_on: data, notes: nota.trim() || null,
    })
    setOcupado(false)
    if (error) return setErro(error.code === '42501' ? 'Seu cargo não pode fazer esse lançamento.' : 'Não consegui salvar. Tente de novo.')
    toast.ok('Estoque atualizado')
    aoSalvar()
  }

  return (
    <Janela titulo={`Lançar: ${insumo.name}`} onFechar={onFechar} largura="30rem">
      <div className="space-y-5">
        <fieldset>
          <legend className="text-rotulo font-semibold">O que aconteceu?</legend>
          <div className="mt-2 flex flex-wrap gap-2">{TIPOS.map((t) => <Chip key={t.v} ativo={tipo === t.v} onClick={() => setTipo(t.v)}>{t.rotulo}</Chip>)}</div>
          <p className="mt-2 text-legenda text-muted-foreground">{def.dica}</p>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Rotulo htmlFor="e-q">Quantidade ({insumo.unit})</Rotulo><input id="e-q" inputMode="decimal" autoComplete="off" value={qtd} onChange={(e) => setQtd(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
          <div><Rotulo htmlFor="e-d">Data</Rotulo><input id="e-d" type="date" max={hojeIso()} value={data} onChange={(e) => setData(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
        </div>
        <div><Rotulo htmlFor="e-n">Observação (opcional)</Rotulo><input id="e-n" maxLength={LIMITE.observacao} value={nota} onChange={(e) => setNota(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
        <p className="text-corpo text-muted-foreground">
          Saldo atual: <b className="numeros text-foreground">{qtdTxt(insumo.balance)} {insumo.unit}</b>
          {novoSaldo != null && <> · depois: <b className={cn('numeros', novoSaldo < 0 ? 'text-erro' : 'text-foreground')}>{qtdTxt(novoSaldo)} {insumo.unit}</b></>}
        </p>
        {novoSaldo != null && novoSaldo < 0 && <p className="text-legenda font-semibold text-erro">O saldo vai ficar negativo. Confira se faltou lançar uma entrada.</p>}
        {!podeEditar && <p className="text-legenda text-muted-foreground">Para corrigir um lançamento errado, peça ao dono ou sócio para fazer uma contagem.</p>}
        {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
        <Button size="lg" className="w-full" disabled={ocupado} onClick={salvar}>{ocupado ? 'Aguarde…' : 'Salvar lançamento'}</Button>
      </div>
    </Janela>
  )
}

function JanelaHistorico({ insumo, onFechar }: { insumo: Saldo; onFechar: () => void }) {
  const [movs, setMovs] = useState<Mov[] | null>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    let vivo = true
    supabase.from('stock_movements').select('id,kind,delta,occurred_on,notes').eq('ingredient_id', insumo.ingredient_id)
      .order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (!vivo) return
        setFalhou(!!error)
        setMovs(((data as Mov[]) ?? []).map((m) => ({ ...m, delta: Number(m.delta) })))
      })
    return () => { vivo = false }
  }, [insumo.ingredient_id])

  return (
    <Janela titulo={`Histórico: ${insumo.name}`} onFechar={onFechar} largura="34rem">
      {falhou ? <p role="alert" className="text-corpo font-semibold text-erro">Não consegui carregar o histórico.</p>
        : movs == null ? <p className="text-corpo text-muted-foreground">Carregando…</p>
        : movs.length === 0 ? <p className="text-corpo text-muted-foreground">Nenhum lançamento ainda.</p> : (
          <>
            <ul className="divide-y divide-border rounded-cartao border border-border">
              {movs.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{ROTULO_MOV[m.kind]} <span className="font-normal text-muted-foreground">· {dataBR(m.occurred_on)}</span></span>
                    {m.notes && <span className="block truncate text-legenda text-muted-foreground">{m.notes}</span>}
                  </span>
                  <span className={cn('numeros font-bold', m.delta < 0 ? 'text-erro' : 'text-folha')}>{m.delta > 0 ? '+' : ''}{qtdTxt(m.delta)} {insumo.unit}</span>
                </li>
              ))}
            </ul>
            {movs.length === 50 && <p className="mt-3 text-legenda text-muted-foreground">Mostrando os 50 lançamentos mais recentes.</p>}
          </>
        )}
    </Janela>
  )
}

function JanelaMinimo({ insumo, onFechar, aoSalvar }: { insumo: Saldo; onFechar: () => void; aoSalvar: () => void }) {
  const [valor, setValor] = useState(insumo.min_stock == null ? '' : String(insumo.min_stock).replace('.', ','))
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function salvar() {
    if (ocupado) return
    const v = valor.trim() === '' ? null : numero(valor)
    if (v != null && (!(v >= 0) || v > LIMITE_QTD)) return setErro('Informe um número válido ou deixe vazio para não ter mínimo.')
    setErro(''); setOcupado(true)
    const { error } = await supabase.from('ingredients').update({ min_stock: v == null ? null : arred3(v) }).eq('id', insumo.ingredient_id)
    setOcupado(false)
    if (error) return setErro('Não consegui salvar o mínimo.')
    toast.ok('Mínimo salvo')
    aoSalvar()
  }

  return (
    <Janela titulo={`Mínimo de ${insumo.name}`} onFechar={onFechar} largura="26rem">
      <div className="space-y-5">
        <div>
          <Rotulo htmlFor="m-v">Avisar quando ficar abaixo de ({insumo.unit})</Rotulo>
          <input id="m-v" inputMode="decimal" autoComplete="off" value={valor} onChange={(e) => setValor(e.target.value)} className={cn(campoCls, 'mt-2')} />
          <p className="mt-2 text-legenda text-muted-foreground">Deixe vazio para não receber aviso deste insumo.</p>
        </div>
        {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
        <Button size="lg" className="w-full" disabled={ocupado} onClick={salvar}>{ocupado ? 'Aguarde…' : 'Salvar mínimo'}</Button>
      </div>
    </Janela>
  )
}

function JanelaContagem({ itens, companyId, onFechar, aoSalvar }: { itens: Saldo[]; companyId: string; onFechar: () => void; aoSalvar: () => void }) {
  const [contado, setContado] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function salvar() {
    if (ocupado) return
    const preenchidos = itens.filter((s) => (contado[s.ingredient_id] ?? '').trim() !== '')
    if (preenchidos.length === 0) return setErro('Preencha a quantidade contada de pelo menos um insumo.')
    const lista: { ingredient_id: string; counted: number }[] = []
    for (const s of preenchidos) {
      const n = numero(contado[s.ingredient_id])
      if (!(n >= 0) || n > LIMITE_QTD) return setErro(`Quantidade inválida em “${s.name}”.`)
      lista.push({ ingredient_id: s.ingredient_id, counted: arred3(n) })
    }
    setErro(''); setOcupado(true)
    // todas as diferenças são gravadas juntas no banco: ou entram todas, ou nenhuma
    const { data, error } = await supabase.rpc('record_stock_counts', { p_company: companyId, p_items: lista })
    setOcupado(false)
    if (error) return setErro(error.code === '42501' ? 'Só dono ou sócio fazem contagem.' : 'Não consegui salvar a contagem. Nada foi alterado, tente de novo.')
    const n = Number(data ?? 0)
    toast.ok(n === 0 ? 'Contagem conferida: nenhuma diferença' : `${n} ${n === 1 ? 'ajuste registrado' : 'ajustes registrados'}`)
    aoSalvar()
  }

  return (
    <Janela titulo="Contagem de estoque" onFechar={onFechar} largura="38rem">
      <div className="space-y-4">
        <p className="text-corpo text-muted-foreground">Digite o que você contou na prateleira. O sistema registra só a diferença. Deixe em branco o que não contou.</p>
        <ul className="divide-y divide-border rounded-cartao border border-border">
          {itens.map((s) => (
            <li key={s.ingredient_id} className="grid grid-cols-[1fr_7rem] items-center gap-3 px-4 py-2">
              <label htmlFor={`c-${s.ingredient_id}`} className="min-w-0">
                <span className="block truncate font-semibold">{s.name}</span>
                <span className="block text-legenda text-muted-foreground">no sistema: {qtdTxt(s.balance)} {s.unit}</span>
              </label>
              <input id={`c-${s.ingredient_id}`} inputMode="decimal" autoComplete="off" placeholder={s.unit} value={contado[s.ingredient_id] ?? ''}
                onChange={(e) => setContado({ ...contado, [s.ingredient_id]: e.target.value })} className={cn(campoCls, 'px-3 text-right')} />
            </li>
          ))}
        </ul>
        {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
        <Button size="lg" className="w-full" disabled={ocupado} onClick={salvar}>{ocupado ? 'Aguarde…' : 'Salvar contagem'}</Button>
      </div>
    </Janela>
  )
}
