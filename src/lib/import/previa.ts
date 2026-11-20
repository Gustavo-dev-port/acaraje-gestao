// Prévia da importação: lê as linhas do extrato pelo mapeamento de colunas, marca duplicadas e sugere a categoria de cada saída.
// Porte de ImportService.BuildPreview/Categorize/Commit (app desktop). Diferença: o web só usa o tipo de gasto padrão do
// fornecedor (suppliers.default_category_id); o desktop também olha o tipo mais usado por ele no histórico.
import { hojeIso } from '../fmt.ts'
import { cnpjValido } from '../validar.ts'
import { lerValorComSinal } from './dinheiro.ts'
import { hashDaLinha } from './hash.ts'
import { lerData, type ExtratoLido } from './parser.ts'
import { combinaPadrao, nomeFornecedorLimpo, normalizar, prepararTexto } from './texto.ts'

export interface Mapeamento { colData: string; colDescricao: string; colValor: string; formatoData: string; saidaPositiva: boolean }
export interface RegraImport { id?: string; pattern_text: string; category_id: string; priority?: number }
export interface FornecedorImport {
  id: string; cnpj: string | null; legal_name: string | null; trade_name: string | null; nickname: string | null; default_category_id: string | null
}

export interface LinhaImport {
  numero: number
  data: string // AAAA-MM-DD
  descricao: string
  centavos: number // com sinal
  ehSaida: boolean
  hash: string
  fornecedorId: string | null
  fornecedorNome: string | null
  categoriaId: string | null
  origem: 'nenhuma' | 'regra' | 'fornecedor'
  duplicada: boolean
  incluir: boolean
}

export interface Previa { linhas: LinhaImport[]; naoLidas: number; entradasIgnoradas: number }

export interface ContextoImport {
  hashesExistentes: Set<string>; regras: RegraImport[]; fornecedores: FornecedorImport[]
  /** hoje em AAAA-MM-DD (só os testes passam; o normal é a data do aparelho) */
  hoje?: string
}

/** O banco só aceita datas de 01/01/2000 até 1 ano à frente: fora disso a linha vira "não consegui ler", em vez de derrubar o arquivo todo. */
export function dataPlausivel(data: string, hoje: string = hojeIso()): boolean {
  const limite = new Date(hoje + 'T00:00:00Z')
  limite.setUTCDate(limite.getUTCDate() + 366)
  return data >= '2000-01-01' && data <= limite.toISOString().slice(0, 10)
}

const CNPJ_NO_TEXTO = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g
const nomeDe = (s: FornecedorImport) => s.nickname || s.trade_name || s.legal_name || '(sem nome)'

export function sugerirMapeamento(e: ExtratoLido): Mapeamento {
  return {
    colData: e.sugestao.data ?? '', colDescricao: e.sugestao.descricao ?? '', colValor: e.sugestao.valor ?? '',
    formatoData: e.sugestao.formatoData, saidaPositiva: e.sugestao.saidaPositiva,
  }
}

function indiceDaColuna(e: ExtratoLido, nome: string, rotulo: string): number {
  const i = e.cabecalhos.findIndex((h) => h.toLowerCase() === nome.toLowerCase())
  if (i < 0) throw new Error(`Escolha qual coluna é ${rotulo}.`)
  return i
}

export async function montarPrevia(e: ExtratoLido, m: Mapeamento, incluirEntradas: boolean, ctx: ContextoImport): Promise<Previa> {
  const cData = indiceDaColuna(e, m.colData, 'a data')
  const cDescricao = indiceDaColuna(e, m.colDescricao, 'a descrição')
  const cValor = indiceDaColuna(e, m.colValor, 'o valor')

  const regras = ctx.regras
    .map((r) => ({ r, padrao: normalizar(r.pattern_text) }))
    .filter((x) => x.padrao.length > 0)
    .sort((a, b) => (b.r.priority ?? 0) - (a.r.priority ?? 0) || b.padrao.length - a.padrao.length)
  const porCnpj = new Map(ctx.fornecedores.filter((f) => f.cnpj).map((f) => [f.cnpj!.replace(/\D/g, ''), f]))
  const porNome: { nome: string; f: FornecedorImport }[] = []
  for (const f of ctx.fornecedores)
    for (const n of [f.nickname, f.trade_name, f.legal_name]) {
      const norm = normalizar(n)
      if (norm.length >= 4) porNome.push({ nome: norm, f })
    }
  porNome.sort((a, b) => b.nome.length - a.nome.length) // o nome mais comprido vence

  const previa: Previa = { linhas: [], naoLidas: e.malformadas, entradasIgnoradas: 0 }
  const ocorrencias = new Map<string, number>()

  for (let i = 0; i < e.linhas.length; i++) {
    const linha = e.linhas[i]
    const data = lerData(linha[cData], m.formatoData)
    const centavos = lerValorComSinal(linha[cValor])
    if (data === null || centavos === null || centavos === 0 || !dataPlausivel(data, ctx.hoje)) { previa.naoLidas++; continue }
    const descricao = (linha[cDescricao] ?? '').trim()
    const ehSaida = m.saidaPositiva ? centavos > 0 : centavos < 0
    if (!ehSaida && !incluirEntradas) { previa.entradasIgnoradas++; continue }

    const chave = `${data}|${centavos}|${normalizar(descricao)}`
    const n = (ocorrencias.get(chave) ?? 0) + 1
    ocorrencias.set(chave, n)
    const hash = await hashDaLinha(data, centavos, descricao, n)
    const nova: LinhaImport = {
      numero: i + 1, data, descricao, centavos, ehSaida, hash, fornecedorId: null, fornecedorNome: null,
      categoriaId: null, origem: 'nenhuma', duplicada: ctx.hashesExistentes.has(hash), incluir: true,
    }
    nova.incluir = !nova.duplicada
    if (ehSaida) categorizar(nova, regras, porCnpj, porNome)
    // saída sem categoria não pode ser gravada: espera desmarcada até a pessoa escolher
    if (ehSaida && nova.categoriaId === null) nova.incluir = false
    previa.linhas.push(nova)
  }
  return previa
}

function categorizar(
  linha: LinhaImport, regras: { r: RegraImport; padrao: string }[], porCnpj: Map<string, FornecedorImport>,
  porNome: { nome: string; f: FornecedorImport }[],
) {
  const texto = ` ${normalizar(linha.descricao)} `

  // fornecedor: pelo CNPJ que aparece no texto, depois pelo nome
  let fornecedor: FornecedorImport | undefined
  for (const achado of linha.descricao.matchAll(CNPJ_NO_TEXTO)) {
    const digitos = achado[0].replace(/\D/g, '')
    if (cnpjValido(digitos) && (fornecedor = porCnpj.get(digitos))) break
  }
  fornecedor ??= porNome.find((x) => texto.includes(` ${x.nome} `))?.f
  if (fornecedor) { linha.fornecedorId = fornecedor.id; linha.fornecedorNome = nomeDe(fornecedor) }

  // 1. regras aprendidas (o trecho aparece na descrição, palavra por palavra)
  // (com ou sem as palavras genéricas: a regra sugerida por sugerirTrecho tira "DO", "PIX"… e precisa casar mesmo assim)
  const preparado = prepararTexto(linha.descricao)
  const regra = regras.find((x) => combinaPadrao(preparado, x.padrao))
  if (regra) { linha.categoriaId = regra.r.category_id; linha.origem = 'regra'; return }

  // 2. o tipo de gasto padrão do fornecedor
  if (fornecedor?.default_category_id) { linha.categoriaId = fornecedor.default_category_id; linha.origem = 'fornecedor' }
  // 3. senão fica "para revisar" (categoriaId nulo)
}

// ---- envio -------------------------------------------------------------------------------------

export interface PayloadImportacao {
  expenses: { date: string; supplier_id: string | null; supplier_name: string | null; category_id: string; amount_cents: number; notes: string; import_hash: string }[]
  revenues: { date: string; gross_cents: number; import_hash: string }[]
  duplicates: number
  to_review: number
}

/** Só o que a pessoa deixou marcado e pode ser gravado. Duplicadas e saídas sem categoria são contadas, não enviadas. */
export function montarEnvio(linhas: LinhaImport[]): PayloadImportacao {
  const payload: PayloadImportacao = { expenses: [], revenues: [], duplicates: 0, to_review: 0 }
  for (const l of linhas) {
    if (l.duplicada) { payload.duplicates++; continue }
    if (l.ehSaida && l.categoriaId === null) { payload.to_review++; continue }
    if (!l.incluir) continue
    if (l.ehSaida) {
      payload.expenses.push({
        date: l.data,
        supplier_id: l.fornecedorId,
        supplier_name: l.fornecedorId ? null : nomeFornecedorLimpo(l.descricao),
        category_id: l.categoriaId!,
        amount_cents: Math.abs(l.centavos),
        notes: l.descricao.slice(0, 200),
        import_hash: l.hash,
      })
    } else payload.revenues.push({ date: l.data, gross_cents: Math.abs(l.centavos), import_hash: l.hash })
  }
  return payload
}
