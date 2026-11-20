// Texto de extrato: normalização, trecho para regra e nome de fornecedor. Porte de ImportText (ImportService.cs do desktop).

const GENERICAS = new Set([
  'PIX', 'TED', 'DOC', 'COMPRA', 'COMPRAS', 'PAGAMENTO', 'PAG', 'PGTO', 'DEBITO', 'DEB', 'CREDITO', 'ENVIADO', 'ENVIADA',
  'RECEBIDO', 'RECEBIDA', 'TRANSF', 'TRANSFERENCIA', 'CARTAO', 'CONTA', 'BOLETO', 'PARCELA', 'SAQUE', 'NO', 'EM', 'DE',
  'DA', 'DO', 'DAS', 'DOS', 'PARA', 'POR', 'A', 'O', 'E', 'CPF', 'CNPJ', 'REF', 'NF', 'LTDA', 'ME', 'EPP', 'SA', 'EIRELI',
])

/** MAIÚSCULAS, sem acento, só letras e números separados por um espaço. */
export function normalizar(texto: string | null | undefined): string {
  if (!texto || texto.trim() === '') return ''
  let saida = ''
  for (const ch of texto.normalize('NFD')) {
    if (/\p{M}/u.test(ch)) continue
    saida += /[\p{L}\p{N}]/u.test(ch) ? ch.toUpperCase() : ' '
  }
  return saida.replace(/\s+/g, ' ').trim()
}

const significativas = (descricao: string) =>
  normalizar(descricao).split(' ').filter((t) => t && !GENERICAS.has(t) && !/\d/.test(t) && t.length >= 2)

/** Um trecho curto e característico da descrição, para lembrar como regra ("CEASA HORTI"). */
export function sugerirTrecho(descricao: string): string {
  let tokens = significativas(descricao).slice(0, 2)
  if (tokens.length === 0) tokens = normalizar(descricao).split(' ').filter(Boolean).slice(0, 1)
  return tokens.join(' ')
}

/** "PIX ENVIADO CEASA HORTIFRUTI 123456" vira "Ceasa Hortifruti". */
export function nomeFornecedorLimpo(descricao: string): string {
  const tokens = significativas(descricao).slice(0, 5)
  if (tokens.length === 0) return 'Fornecedor não identificado'
  const nome = tokens.join(' ').toLowerCase().replace(/(^|\s)(\S)/g, (_, sep: string, c: string) => sep + c.toUpperCase())
  return nome.length > 60 ? nome.slice(0, 60).trim() : nome
}

/** A descrição preparada uma vez só (a prévia compara cada linha com todas as regras). */
export interface TextoPreparado { cheio: string; sig: string }

export function prepararTexto(descricao: string): TextoPreparado {
  return { cheio: ` ${normalizar(descricao)} `, sig: ` ${significativas(descricao).join(' ')} ` }
}

/**
 * A regra vale quando o trecho aparece, palavra por palavra, na descrição completa OU na descrição sem as palavras genéricas e
 * os números. O segundo caso é o que faz funcionar uma regra sugerida por `sugerirTrecho`, que tira essas palavras:
 * "ACOUGUE ZE" tem de casar com "PIX ENVIADO ACOUGUE DO ZE". Regras antigas, com palavras genéricas, seguem valendo pelo primeiro caso.
 */
export function combinaPadrao(texto: TextoPreparado, padraoNormalizado: string): boolean {
  if (padraoNormalizado === '') return false
  const chave = ` ${padraoNormalizado} `
  return texto.cheio.includes(chave) || texto.sig.includes(chave)
}
