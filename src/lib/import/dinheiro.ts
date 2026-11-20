// Valores de extrato bancário. Porte de Money.TryParse e SignedMoney.TryParse do app desktop (Money.cs): mesmas entradas, mesmos centavos.

/** "340", "340,5", "1.234,56", "R$ 12,00" e "12.50" viram centavos (inteiro). Negativo e lixo viram null. */
export function lerDinheiro(texto: string | null | undefined): number | null {
  if (texto == null) return null
  let s = texto.replace(/R\$/g, '').replace(/[\s ]/g, '')
  if (s.length === 0 || s.startsWith('-')) return null

  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes('.')) {
    const decimais = s.length - s.lastIndexOf('.') - 1
    const ehDecimal = s.split('.').length === 2 && decimais >= 1 && decimais <= 2
    if (!ehDecimal) s = s.replace(/\./g, '')
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null

  // arredonda em texto (meio vai para cima), sem passar por ponto flutuante: 1,005 tem de dar 101 centavos
  const [inteiro = '0', fracao = ''] = s.split('.')
  if (inteiro.replace(/^0+/, '').length > 10) return null // acima de 1 bilhão (o limite do app desktop)
  const centavos = Number(inteiro || '0') * 100 + Number((fracao + '00').slice(0, 2)) + (Number(fracao.charAt(2) || '0') >= 5 ? 1 : 0)
  return centavos > 100_000_000_000 ? null : centavos
}

/**
 * Valor com sinal, como os bancos imprimem: "-1.234,56", "1.234,56-", "(12,00)", "R$ -5,00", "12,00 D" (débito), "12,00 C" (crédito).
 * Devolve centavos com sinal (negativo = dinheiro que saiu), ou null se não for um valor.
 */
export function lerValorComSinal(texto: string | null | undefined): number | null {
  if (texto == null || texto.trim() === '') return null
  let s = texto.replace(/R\$/gi, '').replace(/ /g, ' ').trim()
  let negativo = false

  if (s.startsWith('(') && s.endsWith(')')) { negativo = true; s = s.slice(1, -1).trim() }
  if (/[Dd]$/.test(s)) { negativo = true; s = s.slice(0, -1).trim() }
  else if (/[Cc]$/.test(s)) s = s.slice(0, -1).trim()
  if (s.endsWith('-')) { negativo = !negativo; s = s.slice(0, -1).trim() }
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1).trim() }
  else if (s.startsWith('+')) s = s.slice(1).trim()

  const centavos = lerDinheiro(s)
  if (centavos == null) return null
  return negativo ? -centavos : centavos
}
