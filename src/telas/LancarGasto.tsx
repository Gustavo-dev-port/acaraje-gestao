import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Camera, Check, CheckCircle2, ChevronDown, Eraser, Loader2, Repeat2, Save, Search, UserPlus, WifiOff, CalendarDays } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { Link, navigate } from '@/lib/router'
import { toast } from '@/lib/toast'
import { nomeFornecedor, useApp, type Sup } from '@/lib/ctx'
import { dataBR, dataCurta, hojeIso, mascararCnpj, mesDe, ontemIso, reais } from '@/lib/fmt'
import { buscarCnpj, enviarAnexo, FORMAS, GASTO_SEL, rotuloForma, type DadosCnpj, type Gasto } from '@/lib/gastos'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { IconeCategoria } from '@/ui/icones'
import { Aviso, BotaoCategoria, campoCls, CampoValor, Chip, Rotulo } from '@/ui/kit'

type Busca = 'idle' | 'buscando' | 'encontrado' | 'offline'

export default function LancarGasto() {
  const app = useApp()
  const { grupos, subsDe, catPorId, sups, pendentes, companyId } = app

  const [data, setData] = useState(hojeIso())
  const [texto, setTexto] = useState('')
  const [forn, setForn] = useState<Sup | null>(null)
  const [listaAberta, setListaAberta] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const [busca, setBusca] = useState<Busca>('idle')
  const [achado, setAchado] = useState<DadosCnpj | null>(null)
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [subId, setSubId] = useState<string | null>(null)
  const [sugerida, setSugerida] = useState(false)
  const [valor, setValor] = useState(0)
  const [detalhes, setDetalhes] = useState(false)
  const [forma, setForma] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [erros, setErros] = useState<{ fornecedor?: string; categoria?: string; valor?: string }>({})
  const [duplicado, setDuplicado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [ultimos, setUltimos] = useState<Gasto[]>([])

  const refForn = useRef<HTMLInputElement>(null)
  const refValor = useRef<HTMLInputElement>(null)
  const refFoto = useRef<HTMLInputElement>(null)
  const travaRef = useRef(false)
  const criadoRef = useRef<{ nome: string; id: string } | null>(null) // fornecedor criado numa tentativa que não terminou

  const hoje = hojeIso()
  const ontem = ontemIso()
  const gruposAtivos = grupos.filter((g) => g.active)
  const grupo = grupoId ? catPorId(grupoId) : undefined
  const subs = grupo ? subsDe(grupo.id).filter((s) => s.active) : []

  const digitos = texto.replace(/\D/g, '')
  const pareceCnpj = digitos.length >= 8 && /^[\d./\-\s]+$/.test(texto)

  const sugestoes = useMemo(() => {
    const t = texto.trim().toLowerCase()
    if (!t || forn) return []
    return sups.filter((f) => nomeFornecedor(f).toLowerCase().includes(t) || (f.legal_name ?? '').toLowerCase().includes(t) ||
      (digitos.length >= 3 && (f.cnpj ?? '').replace(/\D/g, '').includes(digitos))).slice(0, 6)
  }, [texto, forn, sups, digitos])

  const carregarUltimos = () =>
    supabase.from('expenses').select(GASTO_SEL).is('deleted_at', null).order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => setUltimos((data as unknown as Gasto[]) ?? []))
  useEffect(() => { carregarUltimos() }, [])

  // busca do CNPJ na Receita (14 dígitos) quando ainda não está cadastrado
  useEffect(() => {
    if (forn || digitos.length !== 14 || sups.some((f) => (f.cnpj ?? '').replace(/\D/g, '') === digitos)) { setBusca('idle'); setAchado(null); return }
    let vivo = true
    setBusca('buscando')
    buscarCnpj(digitos).then((d) => { if (!vivo) return; if (d) { setAchado(d); setBusca('encontrado') } else setBusca('offline') })
    return () => { vivo = false }
  }, [digitos, forn, sups])

  const escolherCategoria = (catId: string) => {
    const c = catPorId(catId)
    if (!c) return
    if (c.parent_id) { setGrupoId(c.parent_id); setSubId(c.id) } else { setGrupoId(c.id); setSubId(null) }
  }

  const escolherFornecedor = (f: Sup) => {
    setForn(f); setTexto(nomeFornecedor(f)); setListaAberta(false)
    if (f.default_category_id) { escolherCategoria(f.default_category_id); setSugerida(true) }
    setErros((e) => ({ ...e, fornecedor: undefined, categoria: undefined }))
    setTimeout(() => refValor.current?.focus(), 0)
  }

  const usarAchado = async () => {
    if (!achado) return
    const { data: novo, error } = await supabase.from('suppliers').insert({
      company_id: companyId, cnpj: digitos, legal_name: achado.razao, trade_name: achado.fantasia || null,
      nickname: achado.fantasia || achado.razao, cnae: achado.cnae, registration_status: achado.situacao,
      address: achado.endereco, city: achado.cidade, state: achado.uf, is_complete: true,
    }).select('id,cnpj,legal_name,trade_name,nickname,default_category_id,is_complete').single()
    if (error || !novo) return toast.erro('Não consegui cadastrar o fornecedor.')
    await app.recarregar()
    setBusca('idle')
    escolherFornecedor(novo as Sup)
  }

  const limpar = () => {
    setData(hojeIso()); setTexto(''); setForn(null); setBusca('idle'); setAchado(null); setGrupoId(null); setSubId(null)
    setSugerida(false); setValor(0); setDetalhes(false); setForma(null); setNota(''); setVencimento(''); setFotos([])
    if (refFoto.current) refFoto.current.value = ''
    setErros({}); setDuplicado(false); criadoRef.current = null
    setTimeout(() => refForn.current?.focus(), 0)
  }

  // trava de duplo clique: a ref muda na hora (o estado `salvando` só muda no próximo desenho)
  async function salvar(modo: 'novo' | 'ver', ignorarDuplicado = false) {
    if (travaRef.current) return
    travaRef.current = true
    try { await salvarGasto(modo, ignorarDuplicado) } finally { travaRef.current = false }
  }

  async function salvarGasto(modo: 'novo' | 'ver', ignorarDuplicado: boolean) {
    if (salvando) return
    const nome = (forn ? nomeFornecedor(forn) : texto).trim()
    const e: typeof erros = {}
    if (!nome) e.fornecedor = 'Escreva para quem você pagou. Pode ser só o nome, ex.: “Feira do sábado”.'
    if (!grupoId) e.categoria = 'Escolha o tipo de gasto tocando em um dos botões acima.'
    if (valor <= 0) e.valor = 'Digite quanto você gastou. Ex.: 150,00'
    setErros(e)
    if (Object.keys(e).length) { if (e.fornecedor) refForn.current?.focus(); else if (e.valor) refValor.current?.focus(); return }

    setSalvando(true)
    let fid = forn?.id
    if (!fid) {
      // mesmo nome digitado já cadastrado (ou criado numa tentativa anterior que falhou): reaproveita, não duplica
      const nomeMin = nome.toLowerCase()
      const existente = sups.find((s) => nomeFornecedor(s).trim().toLowerCase() === nomeMin)
      if (existente) fid = existente.id
      else if (criadoRef.current?.nome === nomeMin) fid = criadoRef.current.id
      else {
        const { data: novo, error } = await supabase.from('suppliers')
          .insert({ company_id: companyId, nickname: nome, is_complete: false, default_category_id: subId ?? grupoId }).select('id').single()
        if (error || !novo) { setSalvando(false); return toast.erro('Não consegui cadastrar o fornecedor.') }
        fid = novo.id as string
        criadoRef.current = { nome: nomeMin, id: fid }
      }
    }
    if (!ignorarDuplicado) {
      const { count } = await supabase.from('expenses').select('id', { count: 'exact', head: true })
        .is('deleted_at', null).eq('supplier_id', fid).eq('amount_cents', valor).eq('date', data)
      if ((count ?? 0) > 0) { setSalvando(false); setDuplicado(true); return }
    }
    const { data: criado, error } = await supabase.from('expenses').insert({
      company_id: companyId, date: data, supplier_id: fid, category_id: subId ?? grupoId, amount_cents: valor,
      payment_method: forma, invoice_number: nota.trim() || null, due_date: vencimento || null,
      status: vencimento ? 'Pending' : 'Paid', origin: 'Manual',
    }).select('id').single()
    if (error || !criado) { setSalvando(false); return toast.erro('Não consegui salvar o gasto.', 'Confira a internet e tente de novo.') }
    let falhas = 0
    for (const f of fotos) if (!(await enviarAnexo(companyId, criado.id as string, f))) falhas++
    setSalvando(false)

    app.setMes(mesDe(data))
    await app.recarregar()
    toast.ok('Tudo certo, gasto salvo!', {
      descricao: falhas ? `${reais(valor)} · ${nome}. ${falhas} foto(s) não subiram.` : `${reais(valor)} · ${nome}`,
      acao: { rotulo: 'Desfazer', fn: async () => {
        const r = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', criado.id)
        if (r.error) toast.erro('Não deu para desfazer.', 'Peça ao dono ou a um sócio para apagar.'); else { toast.ok('Gasto desfeito.'); carregarUltimos() }
      } },
    })
    limpar()
    carregarUltimos()
    if (modo === 'ver') navigate('/lancamentos')
  }

  const onKeyGlobal = (ev: KeyboardEvent<HTMLFormElement>) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); salvar('novo') }
  }
  const onKeyForn = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (!listaAberta || sugestoes.length === 0) return
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setAtivo((a) => Math.min(a + 1, sugestoes.length - 1)) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)) }
    else if (ev.key === 'Enter' && !ev.ctrlKey) { ev.preventDefault(); escolherFornecedor(sugestoes[ativo]) }
    else if (ev.key === 'Escape') setListaAberta(false)
  }

  const repetir = (l: Gasto) => {
    const f = sups.find((x) => x.id === l.supplier_id) ?? null
    setForn(f); setTexto(f ? nomeFornecedor(f) : nomeFornecedor(l.suppliers))
    escolherCategoria(l.category_id); setSugerida(false)
    setValor(l.amount_cents); setForma(l.payment_method); setData(hojeIso()); setErros({})
    // repetir copia só fornecedor, tipo, valor e pagamento: vencimento, nota, fotos e aviso de duplicidade começam limpos
    setVencimento(''); setNota(''); setFotos([]); setDuplicado(false); criadoRef.current = null
    setTimeout(() => refValor.current?.focus(), 0)
  }

  const novoNome = !forn && texto.trim().length >= 3 && sugestoes.length === 0 && !pareceCnpj

  return (
    <AppShell titulo="Lançar gasto" subtitulo="Preencha de cima para baixo. Leva menos de 15 segundos.">
      {pendentes > 0 && (
        <Aviso tipo="atencao" className="mb-5 py-3" acao={<Link to="/contas" className="flex h-12 items-center rounded-campo border-2 border-foreground/70 bg-card px-5 text-rotulo font-semibold hover:bg-accent">Ver e confirmar</Link>}>
          Você tem <b>{pendentes} {pendentes === 1 ? 'conta' : 'contas'} do mês</b> para confirmar.
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,1fr)]">
        <form onKeyDown={onKeyGlobal} onSubmit={(e) => { e.preventDefault(); salvar('novo') }} noValidate
          className="space-y-5 rounded-cartao border border-border bg-card p-4 shadow-suave sm:p-6">
          {/* QUANDO */}
          <fieldset>
            <legend className="text-rotulo font-semibold">Quando?</legend>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {[{ r: 'Hoje', v: hoje }, { r: 'Ontem', v: ontem }].map((o) => (
                <button key={o.r} type="button" aria-pressed={data === o.v} onClick={() => setData(o.v)}
                  className={cn('h-12 rounded-full border-2 px-6 text-rotulo font-semibold transition-colors duration-150', data === o.v ? 'border-laranja bg-mostarda/20' : 'border-border bg-card hover:bg-accent')}>
                  {data === o.v && <Check className="mr-1.5 inline size-5" aria-hidden />}{o.r}
                </button>
              ))}
              <label className={cn('flex h-12 cursor-pointer items-center gap-2 rounded-full border-2 px-5 text-rotulo font-semibold transition-colors', data !== hoje && data !== ontem ? 'border-laranja bg-mostarda/20' : 'border-border bg-card hover:bg-accent')}>
                <CalendarDays className="size-6" aria-hidden /> Outra data
                <input type="date" value={data} max={hoje} onChange={(e) => e.target.value && setData(e.target.value)} className="w-[9.5rem] bg-transparent text-legenda font-semibold outline-none" aria-label="Escolher outra data" />
              </label>
              <span className="numeros ml-auto text-corpo font-bold">{dataBR(data)}</span>
            </div>
          </fieldset>

          {/* FORNECEDOR */}
          <div className="relative">
            <Rotulo htmlFor="fornecedor">Para quem você pagou?</Rotulo>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input id="fornecedor" ref={refForn} autoFocus autoComplete="off" role="combobox" aria-expanded={listaAberta && sugestoes.length > 0}
                aria-controls="lista-fornecedores" aria-invalid={!!erros.fornecedor} value={texto} placeholder="Digite o nome, apelido ou CNPJ…"
                onChange={(e) => { setTexto(e.target.value); setForn(null); setSugerida(false); setListaAberta(true); setAtivo(0) }}
                onFocus={() => setListaAberta(true)} onBlur={() => setTimeout(() => setListaAberta(false), 150)} onKeyDown={onKeyForn}
                className={cn(campoCls, 'pl-12')} />
            </div>
            {listaAberta && sugestoes.length > 0 && (
              <ul id="lista-fornecedores" role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-campo border-2 border-border bg-popover shadow-lg">
                {sugestoes.map((f, i) => (
                  <li key={f.id} role="option" aria-selected={i === ativo} onMouseDown={(e) => { e.preventDefault(); escolherFornecedor(f) }} onMouseEnter={() => setAtivo(i)}
                    className={cn('flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2', i === ativo && 'bg-accent')}>
                    <IconeCategoria icone={f.default_category_id ? app.iconeDoGasto(f.default_category_id) : 'outros'} className="text-laranja" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{nomeFornecedor(f)}</span>
                      <span className="block truncate text-legenda text-muted-foreground">{f.cnpj ? `CNPJ ${mascararCnpj(f.cnpj)}` : 'sem CNPJ'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div aria-live="polite">
              {erros.fornecedor && <p className="mt-2 text-legenda font-semibold text-erro">{erros.fornecedor}</p>}
              {forn && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-legenda">
                  <CheckCircle2 className="size-5 text-folha" aria-hidden /><b>{nomeFornecedor(forn)}</b>
                </p>
              )}
              {busca === 'buscando' && <p className="mt-2 flex items-center gap-2 text-legenda text-muted-foreground"><Loader2 className="size-5 animate-spin" aria-hidden /> Buscando CNPJ na Receita…</p>}
              {busca === 'encontrado' && achado && (
                <Aviso tipo="ok" className="mt-2 py-3" acao={<Button variant="sucesso" onClick={usarAchado}>Usar este</Button>}>
                  Encontrado: <b>{achado.fantasia || achado.razao}</b> · CNPJ {mascararCnpj(digitos)} · <span className="font-semibold text-folha">{achado.situacao}</span>
                </Aviso>
              )}
              {busca === 'offline' && (
                <Aviso tipo="atencao" className="mt-2 py-3">
                  <span className="flex items-center gap-2"><WifiOff className="size-5 shrink-0" aria-hidden /> Não consegui buscar esse CNPJ agora. Confira o número ou salve só com o nome, depois a gente completa.</span>
                </Aviso>
              )}
              {novoNome && <p className="mt-2 flex items-center gap-2 text-legenda text-muted-foreground"><UserPlus className="size-5" aria-hidden /> Não achei “{texto.trim()}”. Vou cadastrar só o nome quando você salvar.</p>}
            </div>
          </div>

          {/* TIPO */}
          <fieldset>
            <legend className="text-rotulo font-semibold">Tipo de gasto?</legend>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {gruposAtivos.map((c) => (
                <BotaoCategoria key={c.id} nome={c.name} icone={app.iconeDoGasto(c.id)} selecionado={grupoId === c.id} sugerido={sugerida && grupoId === c.id} erro={!!erros.categoria}
                  onClick={() => { setGrupoId(c.id); setSubId(null); setSugerida(false); setErros((e) => ({ ...e, categoria: undefined })) }} />
              ))}
            </div>
            {erros.categoria && <p className="mt-2 text-legenda font-semibold text-erro">{erros.categoria}</p>}
            {grupo && subs.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={`Detalhe de ${grupo.name}`}>
                <span className="text-legenda text-muted-foreground">Qual?</span>
                {subs.map((sc) => (
                  <Chip key={sc.id} ativo={subId === sc.id} onClick={() => setSubId(subId === sc.id ? null : sc.id)}>
                    {subId === sc.id && <Check className="mr-1 inline size-4" aria-hidden />}{sc.name}
                  </Chip>
                ))}
              </div>
            )}
          </fieldset>

          {/* VALOR */}
          <div>
            <Rotulo htmlFor="valor">Quanto você gastou?</Rotulo>
            <div className="max-w-[26rem]">
              <CampoValor id="valor" inputRef={refValor} grande valor={valor} invalido={!!erros.valor} onChange={(c) => { setValor(c); setErros((x) => ({ ...x, valor: undefined })) }} />
            </div>
            {erros.valor && <p className="mt-2 text-legenda font-semibold text-erro">{erros.valor}</p>}
          </div>

          {/* DETALHES */}
          <div>
            <button type="button" aria-expanded={detalhes} onClick={() => setDetalhes(!detalhes)} className="flex min-h-12 items-center gap-2 rounded-campo px-1 text-left text-rotulo font-semibold text-primary hover:underline">
              <ChevronDown className={cn('size-6 shrink-0 transition-transform duration-150', detalhes && 'rotate-180')} aria-hidden />
              <span>Mais detalhes <span className="font-normal text-muted-foreground">(pagamento, nota, vencimento, foto)</span></span>
            </button>
            {detalhes && (
              <div className="mt-3 grid gap-5 rounded-campo bg-zebra p-4 sm:grid-cols-2 sm:p-5">
                <fieldset className="sm:col-span-2">
                  <legend className="text-rotulo font-semibold">Como você pagou?</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {FORMAS.map((f) => <Chip key={f.valor} ativo={forma === f.valor} onClick={() => setForma(forma === f.valor ? null : f.valor)} className="bg-card">{f.rotulo}</Chip>)}
                  </div>
                </fieldset>
                <div>
                  <Rotulo htmlFor="nota">Número da nota</Rotulo>
                  <input id="nota" value={nota} onChange={(e) => setNota(e.target.value)} className={cn(campoCls, 'mt-2')} />
                </div>
                <div>
                  <Rotulo htmlFor="venc">Vencimento</Rotulo>
                  <input id="venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={cn(campoCls, 'mt-2')} />
                  <p className="mt-1 text-legenda text-muted-foreground">Preencha só se ainda não pagou: vai para “Contas do mês”.</p>
                </div>
                <div className="sm:col-span-2">
                  <input ref={refFoto} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => setFotos(Array.from(e.target.files ?? []))} />
                  <Button variant="outline" onClick={() => refFoto.current?.click()}><Camera /> {fotos.length ? 'Trocar foto ou PDF da nota' : 'Anexar foto ou PDF da nota'}</Button>
                  {fotos.length > 0 && <span className="ml-3 text-legenda text-muted-foreground">{fotos.length} arquivo(s)</span>}
                </div>
              </div>
            )}
          </div>

          {duplicado && (
            <Aviso tipo="atencao" acao={<div className="flex gap-2"><Button variant="outline" onClick={() => setDuplicado(false)}>Não salvar</Button><Button onClick={() => salvar('novo', true)}>Salvar mesmo assim</Button></div>}>
              <b>Parece repetido.</b> Já existe um gasto igual ({reais(valor)} · {forn ? nomeFornecedor(forn) : texto}) neste dia.
            </Aviso>
          )}

          <div className="pesponto-sutil" aria-hidden />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-[19rem]" disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Check className="!size-7" />} Salvar e novo
              <kbd className="hidden rounded-md border border-current/40 px-1.5 py-0.5 font-sans text-[0.9rem] font-semibold opacity-90 sm:inline">Ctrl+Enter</kbd>
            </Button>
            <Button size="lg" variant="outline" onClick={() => salvar('ver')} disabled={salvando}><Save /> Salvar</Button>
            <Button size="lg" variant="ghost" onClick={limpar}><Eraser /> Limpar</Button>
          </div>
        </form>

        {/* ÚLTIMOS */}
        <aside aria-labelledby="ultimos-titulo">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="ultimos-titulo" className="text-secao font-bold">Últimos lançamentos</h2>
            <Link to="/lancamentos" className="text-legenda font-semibold text-primary underline-offset-4 hover:underline">Ver todos</Link>
          </div>
          {ultimos.length === 0 ? <p className="text-corpo text-muted-foreground">Nada lançado ainda.</p> : (
            <ul className="space-y-2">
              {ultimos.map((l) => (
                <li key={l.id} className="flex min-h-[4.5rem] items-center gap-3 rounded-campo border border-border bg-card px-4 py-2 shadow-suave">
                  <IconeCategoria icone={app.iconeDoGasto(l.category_id)} className="text-laranja" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate leading-tight font-semibold">{nomeFornecedor(l.suppliers)}</p>
                    <p className="truncate text-legenda text-muted-foreground">{dataCurta(l.date)} · {catPorId(l.category_id)?.name}{l.payment_method ? ` · ${rotuloForma(l.payment_method)}` : ''}</p>
                  </div>
                  <span className="numeros font-bold">{reais(l.amount_cents)}</span>
                  <Button variant="ghost" size="sm" onClick={() => repetir(l)} className="px-2" aria-label={`Repetir gasto de ${nomeFornecedor(l.suppliers)}`}><Repeat2 className="!size-5" /><span className="hidden sm:inline">Repetir</span></Button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </AppShell>
  )
}
