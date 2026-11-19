// Regras de entrada que valem em mais de uma tela.
// Atenção: isto melhora a experiência e barra erros de digitação. A proteção de verdade dos dados é do banco.

/** Tamanho mínimo da senha ao criar ou trocar. A política real (complexidade, senhas vazadas) é a do Supabase Auth. */
export const SENHA_MIN = 10
export const SENHA_MSG = `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`

/** Limites de texto (também usados em maxLength dos campos). */
export const LIMITE = { email: 254, nome: 120, nota: 60, observacao: 500, texto: 2000 } as const

/** E-mail em formato razoável (não prova que existe). */
export const emailValido = (s: string) => s.length <= LIMITE.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/** CNPJ com dígitos verificadores corretos. Aceita só os 14 números. */
export function cnpjValido(digitos: string): boolean {
  if (!/^\d{14}$/.test(digitos) || /^(\d)\1{13}$/.test(digitos)) return false
  const calc = (base: string) => {
    let peso = base.length - 7
    let soma = 0
    for (const ch of base) {
      soma += Number(ch) * peso--
      if (peso < 2) peso = 9
    }
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = calc(digitos.slice(0, 12))
  const d2 = calc(digitos.slice(0, 12) + d1)
  return digitos.endsWith(`${d1}${d2}`)
}
