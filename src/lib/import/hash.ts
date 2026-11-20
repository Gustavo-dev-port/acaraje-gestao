import { normalizar } from './texto.ts'

/**
 * Impressão digital de uma linha do extrato: SHA-256 de data + valor com sinal + descrição normalizada (+ "#n" na n-ésima
 * ocorrência idêntica no mesmo arquivo), 32 caracteres hexadecimais em maiúsculas. Mesma receita do app desktop, para os
 * dois lados reconhecerem a mesma linha. Reimportar um arquivo nunca grava duas vezes.
 * `data` em AAAA-MM-DD.
 */
export async function hashDaLinha(data: string, centavosComSinal: number, descricao: string, ocorrencia: number): Promise<string> {
  const chave = `${data}|${centavosComSinal}|${normalizar(descricao)}` + (ocorrencia > 1 ? `#${ocorrencia}` : '')
  const bytes = new TextEncoder().encode(chave)
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(resumo, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 32)
}
