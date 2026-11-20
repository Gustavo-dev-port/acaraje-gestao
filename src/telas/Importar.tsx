import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { useApp } from '@/lib/ctx'
import { dataBR, reais } from '@/lib/fmt'
import { ErroImportacao, FORMATOS_DATA, lerExtrato, type ExtratoLido } from '@/lib/import/parser'
import { montarEnvio, montarPrevia, sugerirMapeamento, type LinhaImport, type Mapeamento, type RegraImport } from '@/lib/import/previa'
import { combinaPadrao, normalizar, prepararTexto, sugerirTrecho } from '@/lib/import/texto'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { Aviso, campoCls, Rotulo, Selo } from '@/ui/kit'

const POR_PAGINA = 100

interface Resultado { imported: number; revenue_imported: number; duplicates: number; to_review: number; new_suppliers: number }
interface FormatoSalvo {
  bank: string; delimiter: string; col_date: string; col_description: string; col_amount: string
  date_format: string; outflow_positive: boolean; ignore_incoming: boolean
}

/** Hashes que já estão gravados (despesas e receitas, inclusive as apagadas: o índice único conta todas). */
async function hashesGravados(hashes: string[], companyId: string): Promise<Set<string>> {
  const achados = new Set<string>()
  for (let i = 0; i < hashes.length; i += 150) {
    const lote = hashes.slice(i, i + 150)
    const [a, b] = await Promise.all([
      supabase.from('expenses').select('import_hash').eq('company_id', companyId).in('import_hash', lote),
      supabase.from('revenues').select('import_hash').eq('company_id', companyId).in('import_hash', lote),
    ])
    if (a.error || b.error) throw new Error('Não consegui conferir o que já foi importado. Confira a internet e tente de novo.')
    for (const r of [...(a.data ?? []), ...(b.data ?? [])]) if (r.import_hash) achados.add(r.import_hash as string)
  }
  return achados
}

function OpcoesCategoria() {
  const { grupos, subsDe } = useApp()
  return (
    <>
      <option value="">Escolha o tipo de gasto…</option>
      {grupos.filter((g) => g.active).map((g) => {
        const subs = subsDe(g.id).filter((s) => s.active)
        return subs.length === 0
          ? <option key={g.id} value={g.id}>{g.name}</option>
          : (
            <optgroup key={g.id} label={g.name}>
              <option value={g.id}>{g.name} (geral)</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          )
      })}
    </>
  )
}

export default function Importar() {
  const { companyId, podeEditar, sups, recarregar, catPorId } = useApp()
  const [extrato, setExtrato] = useState<ExtratoLido | null>(null)
  const [mapa, setMapa] = useState<Mapeamento | null>(null)
  const [incluirEntradas, setIncluirEntradas] = useState(false)
  // Regras e fornecedores ficam em ref de propósito: a prévia só é refeita quando o ARQUIVO, as colunas ou a opção de entradas
  // mudam. Se dependesse deles, "Lembrar para sempre" ou um fornecedor alterado por outra pessoa em tempo real refaria tudo
  // e apagaria as categorias que a pessoa já escolheu à mão.
  const regrasRef = useRef<RegraImport[]>([])
  const supsRef = useRef(sups)
  supsRef.current = sups
  const [linhas, setLinhas] = useState<LinhaImport[]>([])
  const [contagens, setContagens] = useState({ naoLidas: 0, entradasIgnoradas: 0 })
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [lendo, setLendo] = useState(false)
  const [montando, setMontando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [mostrar, setMostrar] = useState(POR_PAGINA)
  const [nomeFormato, setNomeFormato] = useState('')
  const trava = useRef(false) // duplo clique em "Importar" não pode gravar duas vezes
  const seq = useRef(0)

  // refaz a prévia sempre que o arquivo, o mapeamento de colunas ou a opção de entradas mudam
  useEffect(() => {
    if (!extrato || !mapa) return
    const minha = ++seq.current
    setMontando(true)
    setAviso('')
    ;(async () => {
      try {
        const base = { regras: regrasRef.current, fornecedores: supsRef.current }
        const sem = await montarPrevia(extrato, mapa, incluirEntradas, { ...base, hashesExistentes: new Set() })
        const gravados = await hashesGravados(sem.linhas.map((l) => l.hash), companyId)
        const previa = await montarPrevia(extrato, mapa, incluirEntradas, { ...base, hashesExistentes: gravados })
        if (minha !== seq.current) return // chegou depois de uma mudança mais nova: descarta
        setLinhas(previa.linhas)
        setContagens({ naoLidas: previa.naoLidas, entradasIgnoradas: previa.entradasIgnoradas })
        setMostrar(POR_PAGINA)
      } catch (e) {
        if (minha !== seq.current) return
        setLinhas([])
        setAviso(e instanceof Error ? e.message : 'Não consegui montar a prévia.')
      } finally {
        if (minha === seq.current) setMontando(false)
      }
    })()
  }, [extrato, mapa, incluirEntradas, companyId])

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(''); setAviso(''); setResultado(null); setLendo(true)
    try {
      const lido = lerExtrato(new Uint8Array(await arquivo.arrayBuffer()), arquivo.name)
      const [r, f] = await Promise.all([
        supabase.from('categorization_rules').select('id,pattern_text,category_id,priority'),
        supabase.from('csv_mappings').select('bank,delimiter,col_date,col_description,col_amount,date_format,outflow_positive,ignore_incoming'),
      ])
      regrasRef.current = (r.data as RegraImport[] | null) ?? []
      let sugerido = sugerirMapeamento(lido)
      let entradas = false
      // formato já guardado para este banco: mesmo separador e as mesmas colunas
      const tem = (c: string) => lido.cabecalhos.some((h) => h.toLowerCase() === c.toLowerCase())
      const salvo = ((f.data as FormatoSalvo[] | null) ?? []).find((m) => lido.tipo === 'csv' && m.delimiter === lido.separador && tem(m.col_date) && tem(m.col_description) && tem(m.col_amount))
      if (salvo) {
        sugerido = { colData: salvo.col_date, colDescricao: salvo.col_description, colValor: salvo.col_amount, formatoData: salvo.date_format, saidaPositiva: salvo.outflow_positive }
        entradas = !salvo.ignore_incoming
        setNomeFormato(salvo.bank)
      } else setNomeFormato('')
      setIncluirEntradas(entradas)
      setMapa(sugerido)
      setExtrato(lido)
    } catch (e) {
      setExtrato(null); setMapa(null); setLinhas([])
      setErro(e instanceof ErroImportacao ? e.message : 'Não consegui ler esse arquivo. Confira se é um extrato em CSV ou OFX.')
    } finally {
      setLendo(false)
    }
  }

  const envio = useMemo(() => montarEnvio(linhas), [linhas])
  const aGravar = envio.expenses.length + envio.revenues.length
  const paraRevisar = linhas.filter((l) => l.ehSaida && l.categoriaId === null && !l.duplicada).length

  const mudarLinha = (numero: number, mudanca: Partial<LinhaImport>) =>
    setLinhas((ls) => ls.map((l) => (l.numero === numero ? { ...l, ...mudanca } : l)))

  const escolherCategoria = (l: LinhaImport, categoriaId: string) =>
    mudarLinha(l.numero, categoriaId
      ? { categoriaId, origem: 'nenhuma', incluir: !l.duplicada }
      : { categoriaId: null, incluir: false })

  async function lembrar(l: LinhaImport) {
    const trecho = sugerirTrecho(l.descricao)
    if (trecho.length < 3 || !l.categoriaId) return
    const categoriaId = l.categoriaId
    // o mesmo trecho já guardado? troca a categoria dele em vez de criar uma regra repetida
    const existente = regrasRef.current.find((r) => normalizar(r.pattern_text) === normalizar(trecho))
    if (existente?.id) {
      const { error } = await supabase.from('categorization_rules').update({ category_id: categoriaId }).eq('id', existente.id)
      if (error) return toast.erro('Não consegui guardar essa regra.')
      regrasRef.current = regrasRef.current.map((r) => (r === existente ? { ...r, category_id: categoriaId } : r))
    } else {
      const { data, error } = await supabase.from('categorization_rules').insert({ company_id: companyId, pattern_text: trecho, category_id: categoriaId }).select('id').single()
      if (error) return toast.erro('Não consegui guardar essa regra.')
      regrasRef.current = [...regrasRef.current, { id: (data as { id: string } | null)?.id, pattern_text: trecho, category_id: categoriaId }]
    }
    // já aplica nas outras linhas ainda sem categoria que combinam (corrigir uma vez, não vinte)
    const padrao = normalizar(trecho)
    const combina = (x: LinhaImport) =>
      x.numero !== l.numero && x.ehSaida && x.categoriaId === null && !x.duplicada && combinaPadrao(prepararTexto(x.descricao), padrao)
    const outras = linhas.filter(combina).length // contado fora do atualizador: o StrictMode o executa duas vezes
    setLinhas((ls) => ls.map((x) => (combina(x) ? { ...x, categoriaId, origem: 'regra' as const, incluir: true } : x)))
    toast.ok(`Vou lembrar “${trecho}”`, { descricao: outras > 0 ? `Já arrumei mais ${outras} linha(s) iguais.` : 'Nos próximos extratos já vem pronto.' })
  }

  async function guardarFormato() {
    if (!mapa || !extrato || extrato.tipo !== 'csv') return
    if (nomeFormato.trim() === '') return toast.erro('Dê um nome para esse formato.', 'Exemplo: Itaú. Da próxima vez o app já sabe ler o arquivo.')
    const { error } = await supabase.from('csv_mappings').insert({
      company_id: companyId, bank: nomeFormato.trim(), delimiter: extrato.separador, encoding: extrato.codificacao,
      col_date: mapa.colData, col_description: mapa.colDescricao, col_amount: mapa.colValor, date_format: mapa.formatoData,
      ignore_incoming: !incluirEntradas, has_header: extrato.temCabecalho, outflow_positive: mapa.saidaPositiva,
    })
    if (error) return toast.erro('Não consegui guardar esse formato.')
    toast.ok('Formato guardado', { descricao: 'Da próxima vez o app já escolhe as colunas.' })
  }

  async function importar() {
    if (trava.current || !extrato || aGravar === 0) return
    trava.current = true
    setImportando(true); setErro('')
    try {
      const { data, error } = await supabase.rpc('import_statement', { p_company: companyId, p_file: extrato.nomeArquivo.slice(0, 255), p_payload: envio })
      if (error || !data) {
        const faltaFuncao = error?.code === 'PGRST202' || error?.code === '42883'
        const dadoInvalido = error?.code === '22023' || error?.code === '22007' || error?.code === '22003'
        setErro(faltaFuncao
          ? 'A importação ainda não foi liberada no banco (falta aplicar uma atualização). Nada foi gravado.'
          : dadoInvalido
            ? 'Alguma linha do arquivo tem data, valor ou fornecedor fora do normal. Nada foi gravado. Confira o arquivo.'
            // com a internet caindo no fim, a resposta pode se perder depois de gravar: por isso a orientação de conferir
            : 'Não consegui concluir a importação. Confira em Lançamentos o que entrou. Importar o mesmo arquivo de novo é seguro: nada é lançado em dobro.')
        return
      }
      setResultado(data as Resultado)
      await recarregar()
    } finally {
      trava.current = false
      setImportando(false)
    }
  }

  function recomecar() {
    seq.current++ // uma prévia ainda em andamento do arquivo antigo não pode reaparecer
    setExtrato(null); setMapa(null); setLinhas([]); setResultado(null); setErro(''); setAviso(''); setIncluirEntradas(false)
  }

  // ---- resultado ----
  if (resultado) {
    return (
      <AppShell titulo="Importar extrato" subtitulo="Pronto.">
        <div className="max-w-2xl space-y-5">
          <Aviso tipo="ok">
            <b>{resultado.imported}</b> gasto(s) importado(s)
            {resultado.revenue_imported > 0 && <> e <b>{resultado.revenue_imported}</b> entrada(s) guardada(s) como faturamento</>}.
          </Aviso>
          <ul className="space-y-1 text-corpo">
            {resultado.duplicates > 0 && <li>{resultado.duplicates} já tinha(m) sido importada(s) e foi(ram) pulada(s).</li>}
            {resultado.to_review > 0 && <li>{resultado.to_review} sem tipo de gasto ficou(aram) de fora. Importe o arquivo de novo depois de escolher o tipo: nada é duplicado.</li>}
            {resultado.new_suppliers > 0 && <li>{resultado.new_suppliers} fornecedor(es) novo(s) cadastrado(s). Complete os dados depois, em Fornecedores.</li>}
          </ul>
          <Button size="lg" onClick={recomecar}>Importar outro arquivo</Button>
        </div>
      </AppShell>
    )
  }

  // ---- escolher o arquivo ----
  if (!extrato || !mapa) {
    return (
      <AppShell titulo="Importar extrato" subtitulo="Traga o extrato do banco e o app lança os gastos de uma vez.">
        <div className="max-w-2xl space-y-5">
          <label className={cn('flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-cartao border-2 border-dashed border-mostarda/70 bg-card px-6 py-10 text-center focus-within:border-foco focus-within:ring-4 focus-within:ring-foco/40',
            lendo && 'opacity-60')}>
            {lendo ? <Loader2 className="size-10 animate-spin" aria-hidden /> : <FileUp className="size-10 text-laranja" aria-hidden />}
            <span className="text-secao font-bold">{lendo ? 'Lendo o arquivo…' : 'Escolher o arquivo do extrato'}</span>
            <span className="text-corpo text-muted-foreground">CSV ou OFX, até 2 MB e 5.000 movimentações.</span>
            <input type="file" accept=".csv,.txt,.ofx,text/csv,text/plain" className="sr-only" disabled={lendo}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void escolherArquivo(f) }} />
          </label>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <p className="text-legenda text-muted-foreground">
            O app descobre sozinho as colunas e o tipo de gasto de cada linha. Você confere tudo antes de gravar, e importar o mesmo arquivo duas vezes
            nunca lança nada em dobro.
          </p>
        </div>
      </AppShell>
    )
  }

  // ---- conferir ----
  const csv = extrato.tipo === 'csv'
  const visiveis = linhas.slice(0, mostrar)
  return (
    <AppShell titulo="Importar extrato" subtitulo={extrato.nomeArquivo}>
      <div className="space-y-6">
        {csv && (
          <section aria-labelledby="colunas" className="space-y-4 rounded-cartao border border-border bg-card p-5 shadow-suave">
            <h2 id="colunas" className="text-secao font-bold">Quais colunas são quais?</h2>
            <div className="grid gap-4 md:grid-cols-4">
              {([['colData', 'Data', 'c-data'], ['colDescricao', 'Descrição', 'c-desc'], ['colValor', 'Valor', 'c-valor']] as const).map(([campo, rotulo, id]) => (
                <div key={campo}>
                  <Rotulo htmlFor={id}>{rotulo}</Rotulo>
                  <select id={id} value={mapa[campo]} onChange={(e) => setMapa({ ...mapa, [campo]: e.target.value })} className={cn(campoCls, 'mt-2')}>
                    <option value="">Escolha…</option>
                    {extrato.cabecalhos.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <Rotulo htmlFor="c-formato">Formato da data</Rotulo>
                <select id="c-formato" value={mapa.formatoData} onChange={(e) => setMapa({ ...mapa, formatoData: e.target.value })} className={cn(campoCls, 'mt-2')}>
                  {FORMATOS_DATA.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <label className="flex min-h-12 items-center gap-3 text-corpo font-semibold">
              <input type="checkbox" checked={mapa.saidaPositiva} onChange={(e) => setMapa({ ...mapa, saidaPositiva: e.target.checked })} className="size-6 accent-[var(--laranja)]" />
              No meu banco os pagamentos vêm com valor positivo
            </label>
            {podeEditar && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1">
                  <Rotulo htmlFor="c-banco">Guardar este formato como</Rotulo>
                  <input id="c-banco" maxLength={60} placeholder="Exemplo: Itaú" value={nomeFormato} onChange={(e) => setNomeFormato(e.target.value)} className={cn(campoCls, 'mt-2')} />
                </div>
                <Button variant="outline" onClick={guardarFormato}>Guardar formato</Button>
              </div>
            )}
          </section>
        )}

        <label className="flex min-h-12 items-center gap-3 text-corpo font-semibold">
          <input type="checkbox" checked={incluirEntradas} onChange={(e) => setIncluirEntradas(e.target.checked)} className="size-6 accent-[var(--laranja)]" />
          Guardar as entradas do extrato como faturamento
        </label>

        {aviso && <Aviso tipo="atencao">{aviso}</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-corpo" aria-live="polite">
          {montando && <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" aria-hidden /> Montando a prévia…</span>}
          <span><b>{aGravar}</b> para importar</span>
          <span>{envio.duplicates} já importada(s)</span>
          <span className={cn(paraRevisar > 0 && 'font-bold text-erro')}>{paraRevisar} sem tipo de gasto</span>
          {contagens.naoLidas > 0 && <span className="font-bold text-erro">{contagens.naoLidas} não consegui ler</span>}
          {contagens.entradasIgnoradas > 0 && <span className="text-muted-foreground">{contagens.entradasIgnoradas} entrada(s) ignorada(s)</span>}
        </p>

        {linhas.length === 0 && !montando && !aviso && <Aviso tipo="atencao">Nenhuma movimentação para importar com essas escolhas.</Aviso>}

        {linhas.length > 0 && (
          <ul className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
            {visiveis.map((l, k) => {
              const bloqueada = l.duplicada || (l.ehSaida && l.categoriaId === null)
              return (
                <li key={l.numero} className={cn('grid gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[auto_6rem_1fr_9rem_16rem] md:items-center', k % 2 === 1 && 'bg-zebra')}>
                  <input type="checkbox" checked={l.incluir && !bloqueada} disabled={bloqueada} aria-label={`Importar a linha de ${dataBR(l.data)}: ${l.descricao}`}
                    onChange={(e) => mudarLinha(l.numero, { incluir: e.target.checked })} className="size-6 accent-[var(--laranja)]" />
                  <span className="text-legenda text-muted-foreground">{dataBR(l.data)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold" title={l.descricao}>{l.descricao || '(sem descrição)'}</span>
                    <span className="block text-legenda text-muted-foreground">
                      {l.duplicada
                        ? <Selo tom="neutro"><CheckCircle2 className="mr-1 inline size-4" aria-hidden />Já importada</Selo>
                        : l.ehSaida
                          ? (l.fornecedorNome ? `Fornecedor: ${l.fornecedorNome}` : 'Fornecedor novo (completar depois)')
                          : <Selo tom="ok">Entrada → faturamento</Selo>}
                    </span>
                  </span>
                  <span className={cn('numeros text-right font-bold', !l.ehSaida && 'text-folha')}>{reais(Math.abs(l.centavos))}</span>
                  {l.ehSaida && !l.duplicada ? (
                    <span className="space-y-1">
                      <select aria-label={`Tipo de gasto de ${l.descricao || 'linha ' + l.numero}`} value={l.categoriaId ?? ''} onChange={(e) => escolherCategoria(l, e.target.value)} className={cn(campoCls, 'h-12 px-2', l.categoriaId === null && 'border-erro')}>
                        <OpcoesCategoria />
                      </select>
                      {l.categoriaId === null
                        ? <span className="flex items-center gap-1 text-legenda font-semibold text-erro"><AlertTriangle className="size-4" aria-hidden /> Escolha o tipo para importar</span>
                        : podeEditar && l.origem === 'nenhuma' && sugerirTrecho(l.descricao).length >= 3 && (
                          <button type="button" onClick={() => lembrar(l)} className="text-legenda font-semibold text-primary underline underline-offset-4">
                            Lembrar “{sugerirTrecho(l.descricao)}” para sempre
                          </button>
                        )}
                      {l.categoriaId !== null && l.origem !== 'nenhuma' && <span className="block text-legenda text-muted-foreground">{l.origem === 'regra' ? 'Pela regra aprendida' : 'Pelo fornecedor'}: {catPorId(l.categoriaId)?.name}</span>}
                    </span>
                  ) : <span />}
                </li>
              )
            })}
          </ul>
        )}
        {linhas.length > mostrar && <Button variant="outline" onClick={() => setMostrar((m) => m + POR_PAGINA)}>Mostrar mais ({linhas.length - mostrar} restantes)</Button>}

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={importar} disabled={importando || montando || aGravar === 0}>
            {importando ? <Loader2 className="animate-spin" /> : <FileUp />} Importar {aGravar > 0 ? `${aGravar} lançamento(s)` : ''}
          </Button>
          <Button size="lg" variant="outline" onClick={recomecar} disabled={importando}>Escolher outro arquivo</Button>
        </div>
        <p className="text-legenda text-muted-foreground">
          Tudo é gravado de uma vez: se der qualquer erro, nada é lançado. Linhas sem tipo de gasto não são importadas; você pode importar o arquivo de novo depois, sem duplicar.
        </p>
      </div>
    </AppShell>
  )
}
