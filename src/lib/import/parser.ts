// Leitura de extratos CSV e OFX. Porte de StatementParser.cs (app desktop): separador e codificação detectados,
// título antes da tabela ignorado, colunas sugeridas. O arquivo é dado NÃO confiável: só vira texto (nunca HTML).
import { lerValorComSinal } from './dinheiro.ts'

export class ErroImportacao extends Error {}

export const LIMITE_BYTES = 2 * 1024 * 1024
export const LIMITE_LINHAS = 5000

export interface ExtratoLido {
  nomeArquivo: string
  tipo: 'csv' | 'ofx'
  separador: string
  codificacao: string
  temCabecalho: boolean
  cabecalhos: string[]
  linhas: string[][]
  /** linhas de título antes da tabela (CSV) */
  descartadas: number
  /** linhas com cara de movimentação, mas com número de colunas errado: aparecem como "não consegui ler" */
  malformadas: number
  sugestao: { data?: string; descricao?: string; valor?: string; formatoData: string; saidaPositiva: boolean }
}

// ---- datas -------------------------------------------------------------------------------------

export const FORMATOS_DATA = ['dd/MM/yyyy', 'dd/MM/yy', 'yyyy-MM-dd', 'dd-MM-yyyy', 'dd.MM.yyyy', 'yyyyMMdd', 'yyyy/MM/dd']

const regexDoFormato = new Map<string, { re: RegExp; ordem: ('y' | 'yy' | 'M' | 'd')[] }>()
function formatoParaRegex(formato: string) {
  let achado = regexDoFormato.get(formato)
  if (!achado) {
    const ordem: ('y' | 'yy' | 'M' | 'd')[] = []
    const fonte = formato.replace(/yyyy|yy|MM|dd|[^yMd]/g, (t) => {
      if (t === 'yyyy') { ordem.push('y'); return '(\\d{4})' }
      if (t === 'yy') { ordem.push('yy'); return '(\\d{2})' }
      if (t === 'MM') { ordem.push('M'); return '(\\d{2})' }
      if (t === 'dd') { ordem.push('d'); return '(\\d{2})' }
      return t.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
    })
    achado = { re: new RegExp(`^${fonte}$`), ordem }
    regexDoFormato.set(formato, achado)
  }
  return achado
}

/** Lê uma data no formato dado e devolve AAAA-MM-DD, ou null. Ignora a hora que alguns bancos colam depois ("23/10/2026 14:05:00"). */
export function lerData(texto: string | null | undefined, formato: string): string | null {
  if (!texto || texto.trim() === '') return null
  let t = texto.trim()
  const espaco = t.indexOf(' ')
  if (espaco > 0) t = t.slice(0, espaco)
  t = t.split('T')[0]
  const { re, ordem } = formatoParaRegex(formato)
  const m = re.exec(t)
  if (!m) return null
  let ano = 0, mes = 0, dia = 0
  ordem.forEach((campo, i) => {
    const n = Number(m[i + 1])
    if (campo === 'y') ano = n
    else if (campo === 'yy') ano = n <= 29 ? 2000 + n : 1900 + n // mesma regra do .NET (TwoDigitYearMax 2029)
    else if (campo === 'M') mes = n
    else dia = n
  })
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia || ano < 1900) return null
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// ---- entrada -----------------------------------------------------------------------------------

export function decodificar(bytes: Uint8Array): { texto: string; codificacao: string } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { texto: new TextDecoder('utf-8').decode(bytes.subarray(3)), codificacao: 'utf-8' }
  try {
    return { texto: new TextDecoder('utf-8', { fatal: true }).decode(bytes), codificacao: 'utf-8' }
  } catch {
    return { texto: new TextDecoder('windows-1252').decode(bytes), codificacao: 'latin1' }
  }
}

/** Lê os bytes de um arquivo de extrato (.csv, .txt ou .ofx). Lança ErroImportacao com mensagem em português simples. */
export function lerExtrato(bytes: Uint8Array, nomeArquivo: string): ExtratoLido {
  if (bytes.length === 0) throw new ErroImportacao('O arquivo está vazio. Confira se escolheu o extrato certo.')
  if (bytes.length > LIMITE_BYTES) throw new ErroImportacao('O arquivo é grande demais (o limite é 2 MB). Peça ao banco um extrato de um período menor.')
  const { texto, codificacao } = decodificar(bytes)
  if (texto.includes('\u0000')) throw new ErroImportacao('Esse arquivo não parece um extrato em texto (CSV ou OFX).')
  const pareceOfx = /\.ofx$/i.test(nomeArquivo) || /<OFX>/i.test(texto) || /^OFXHEADER/i.test(texto)
  const extrato = pareceOfx ? lerOfx(texto, nomeArquivo) : lerCsv(texto, nomeArquivo)
  extrato.codificacao = codificacao
  if (extrato.linhas.length > LIMITE_LINHAS)
    throw new ErroImportacao(`O arquivo tem ${extrato.linhas.length} movimentações; o limite é ${LIMITE_LINHAS}. Peça um período menor.`)
  return extrato
}

// ---- CSV ---------------------------------------------------------------------------------------

const CANDIDATOS = [';', ',', '\t', '|']

function contarForaDeAspas(linha: string, sep: string): number {
  let dentro = false
  let n = 0
  for (const ch of linha) {
    if (ch === '"') dentro = !dentro
    else if (ch === sep && !dentro) n++
  }
  return n
}

export function detectarSeparador(texto: string): string {
  const linhas = texto.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.length > 0).slice(0, 30)
  let melhor = ';'
  let melhorPontos = -1
  for (const sep of CANDIDATOS) {
    const contagens = linhas.map((l) => contarForaDeAspas(l, sep)).filter((c) => c > 0)
    if (contagens.length === 0) continue
    const porValor = new Map<number, number>()
    for (const c of contagens) porValor.set(c, (porValor.get(c) ?? 0) + 1)
    // a moda: o número de separadores que mais se repete entre as linhas
    const [valor, vezes] = [...porValor.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    const pontos = vezes * 1000 + valor
    if (pontos > melhorPontos) { melhorPontos = pontos; melhor = sep }
  }
  return melhor
}

/** Divide o texto em registros e campos (aspas, aspas duplas escapadas e quebras de linha dentro do campo). Campos aparados; linhas em branco somem. */
function lerRegistros(texto: string, sep: string): string[][] {
  const registros: string[][] = []
  let campo = ''
  let registro: string[] = []
  let dentro = false
  const fechaCampo = () => { registro.push(campo.trim()); campo = '' }
  const fechaRegistro = () => {
    fechaCampo()
    if (!registro.every((c) => c === '')) registros.push(registro)
    registro = []
  }
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (dentro) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else dentro = false
      } else campo += ch
    } else if (ch === '"' && campo.trim() === '') dentro = true
    else if (ch === sep) fechaCampo()
    else if (ch === '\n') fechaRegistro()
    else if (ch !== '\r') campo += ch
  }
  if (dentro) throw new ErroImportacao('Esse arquivo parece estar com defeito (aspas sem fechar). Abra no Excel, salve de novo como CSV e tente outra vez.')
  if (campo !== '' || registro.length > 0) fechaRegistro()

  // separador no fim de toda linha cria uma última coluna sempre vazia: sai
  const ultimaVazia = registros.length > 0 && registros.every((r) => r.length > 0 && r[r.length - 1] === '')
  return ultimaVazia ? registros.map((r) => r.slice(0, -1)) : registros
}

function parecemDados(linha: string[]): boolean {
  const temData = linha.some((c) => FORMATOS_DATA.some((f) => lerData(c, f) !== null))
  const temValor = linha.some((c) => lerValorComSinal(c) !== null)
  return temData && temValor
}

function tornarUnicos(cabecalhos: string[]) {
  const vistos = new Map<string, number>()
  cabecalhos.forEach((h, i) => {
    const chave = h.toLowerCase()
    const n = vistos.get(chave)
    if (n !== undefined) { vistos.set(chave, n + 1); cabecalhos[i] = `${h} (${n + 1})` } else vistos.set(chave, 1)
  })
}

export function lerCsv(texto: string, nomeArquivo: string): ExtratoLido {
  const separador = detectarSeparador(texto)
  const registros = lerRegistros(texto, separador)
  if (registros.length > LIMITE_LINHAS + 200)
    throw new ErroImportacao(`O arquivo tem mais de ${LIMITE_LINHAS} linhas; o limite é ${LIMITE_LINHAS}. Peça ao banco um período menor.`)
  if (registros.length === 0) throw new ErroImportacao('O arquivo está vazio. Confira se escolheu o extrato certo.')

  // Bancos costumam imprimir títulos antes da tabela: fica só o que tem o número de colunas mais comum.
  const porTamanho = new Map<number, number>()
  for (const r of registros) if (r.length >= 2) porTamanho.set(r.length, (porTamanho.get(r.length) ?? 0) + 1)
  const moda = [...porTamanho.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0
  if (moda < 2)
    throw new ErroImportacao('Não consegui separar as colunas desse arquivo. Ele precisa ser um extrato em CSV (colunas separadas por ; ou vírgula).')
  let tabela = registros.filter((r) => r.length === moda)

  // linhas com cara de movimentação mas com colunas a mais ou a menos: contadas, para a prévia avisar
  const primeiroDado = registros.findIndex((r) => r.length === moda && parecemDados(r))
  const malformadas = primeiroDado < 0 ? 0 : registros.slice(primeiroDado).filter((r) => r.length !== moda && r.length >= 2 && parecemDados(r)).length

  // a tabela começa na primeira linha que parece movimentação; a de cima, se houver, é o cabeçalho
  const primeira = tabela.findIndex(parecemDados)
  if (primeira < 0) throw new ErroImportacao('Não achei datas e valores nesse arquivo. Confira se é o extrato certo.')
  const temCabecalho = primeira > 0
  const antes = Math.max(0, primeira - 1)
  const linhaCabecalho = temCabecalho ? tabela[primeira - 1] : null
  tabela = tabela.slice(antes)
  const cabecalhos = linhaCabecalho
    ? linhaCabecalho.map((h, i) => (h.trim() === '' ? `Coluna ${i + 1}` : h.trim()))
    : Array.from({ length: moda }, (_, i) => `Coluna ${i + 1}`)
  tornarUnicos(cabecalhos)
  const linhas = (temCabecalho ? tabela.slice(1) : tabela).filter((r) => r.some((c) => c.trim() !== ''))

  const extrato: ExtratoLido = {
    nomeArquivo, tipo: 'csv', separador, codificacao: 'utf-8', temCabecalho, cabecalhos, linhas,
    descartadas: registros.length - tabela.length, malformadas,
    sugestao: { formatoData: 'dd/MM/yyyy', saidaPositiva: false },
  }
  sugerirColunas(extrato)
  return extrato
}

function sugerirColunas(e: ExtratoLido) {
  const amostra = e.linhas.slice(0, 200)
  if (amostra.length === 0) return
  const colunas = e.cabecalhos.length

  // coluna de data + formato: o par com mais valores legíveis
  let colData = -1, acertosData = 0
  let formato = 'dd/MM/yyyy'
  for (let c = 0; c < colunas; c++)
    for (const f of FORMATOS_DATA) {
      const acertos = amostra.filter((r) => lerData(r[c], f) !== null).length
      if (acertos > acertosData) { acertosData = acertos; colData = c; formato = f }
    }
  if (colData >= 0 && acertosData >= amostra.length * 0.6) { e.sugestao.data = e.cabecalhos[colData]; e.sugestao.formatoData = formato }
  else colData = -1

  // coluna de valor: quase tudo número, fora a data; o nome do cabeçalho desempata
  let colValor = -1
  let melhorValor = 0
  for (let c = 0; c < colunas; c++) {
    if (c === colData) continue
    const acertos = amostra.filter((r) => lerValorComSinal(r[c]) !== null && /\d/.test(r[c])).length
    if (acertos < amostra.length * 0.6) continue
    const pontos = acertos + (/valor|value|amount|quantia|montante|total/i.test(e.cabecalhos[c]) ? 1000 : 0) - (/saldo|balance/i.test(e.cabecalhos[c]) ? 500 : 0)
    if (pontos > melhorValor) { melhorValor = pontos; colValor = c }
  }
  if (colValor >= 0) {
    e.sugestao.valor = e.cabecalhos[colValor]
    // se nenhum valor é negativo, no banco os pagamentos vêm positivos
    e.sugestao.saidaPositiva = !amostra.some((r) => (lerValorComSinal(r[colValor]) ?? 0) < 0)
  }

  // descrição: a coluna restante com mais letras
  let colDescricao = -1
  let melhorDescricao = -1
  for (let c = 0; c < colunas; c++) {
    if (c === colData || c === colValor) continue
    const letras = amostra.reduce((soma, r) => soma + (r[c].match(/\p{L}/gu)?.length ?? 0), 0) / amostra.length
    const pontos = letras + (/descri|hist|memo|lan[cç]amento|estabelecimento|detalhe|nome|title/i.test(e.cabecalhos[c]) ? 1000 : 0)
    if (pontos > melhorDescricao) { melhorDescricao = pontos; colDescricao = c }
  }
  if (colDescricao >= 0 && melhorDescricao > 0) e.sugestao.descricao = e.cabecalhos[colDescricao]
}

// ---- OFX ---------------------------------------------------------------------------------------

/**
 * OFX sempre usa ponto decimal ("-340.00", "-340.000"). Vira "-340,00" (vírgula, 2 casas, meio para cima), para o leitor de
 * valores brasileiro nunca tomar o ponto por separador de milhar. Se não for número, devolve como veio (a linha será "não lida").
 */
function ofxParaBrasileiro(valor: string): string {
  const m = /^\s*([+-]?)(\d*)\.?(\d*)\s*$/.exec(valor)
  if (!m || (m[2] === '' && m[3] === '')) return valor
  const [, sinal, inteiro, fracao] = m
  const base = BigInt((inteiro || '0') + (fracao + '00').slice(0, 2)) + (Number(fracao.charAt(2) || '0') >= 5 ? 1n : 0n)
  const texto = base.toString().padStart(3, '0')
  return `${sinal === '-' ? '-' : ''}${texto.slice(0, -2)},${texto.slice(-2)}`
}

function tag(corpo: string, nome: string): string | null {
  const m = new RegExp(`<${nome}>\\s*([^<\\r\\n]*)`, 'i').exec(corpo)
  const v = m ? m[1].trim() : ''
  return v === '' ? null : v
}

export function lerOfx(texto: string, nomeArquivo: string): ExtratoLido {
  const movimentos = texto.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>|$)/gi)
  const linhas: string[][] = []
  let malformadas = 0
  for (const m of movimentos) {
    const corpo = m[1]
    const data = tag(corpo, 'DTPOSTED')
    const valor = tag(corpo, 'TRNAMT')
    if (data === null || valor === null || data.length < 8) { malformadas++; continue }
    const partes = [tag(corpo, 'NAME'), tag(corpo, 'MEMO')].filter((x): x is string => !!x && x.trim() !== '')
    const descricao = [...new Set(partes)].join(' - ')
    linhas.push([`${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}`, descricao, ofxParaBrasileiro(valor)])
  }
  if (linhas.length === 0) throw new ErroImportacao('Não achei nenhuma movimentação nesse arquivo OFX.')
  return {
    nomeArquivo, tipo: 'ofx', separador: '', codificacao: 'utf-8', temCabecalho: true,
    cabecalhos: ['Data', 'Descrição', 'Valor'], linhas, descartadas: 0, malformadas,
    sugestao: { data: 'Data', descricao: 'Descrição', valor: 'Valor', formatoData: 'yyyy-MM-dd', saidaPositiva: false },
  }
}
