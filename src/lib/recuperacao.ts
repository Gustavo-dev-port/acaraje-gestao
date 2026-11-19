// Marca "esta pessoa abriu o link de recuperação e ainda não criou a nova senha".
// Fica no localStorage (e não no sessionStorage) de propósito: a sessão da recuperação também persiste no navegador.
// Se a aba fosse fechada no meio, sem esta marca a pessoa entraria no app sem nunca ter trocado a senha.
const CHAVE = 'ca-recuperando'

export const recuperacaoPendente = () => {
  try { return localStorage.getItem(CHAVE) === '1' } catch { return false }
}
export const marcarRecuperacao = () => {
  try { localStorage.setItem(CHAVE, '1') } catch { /* sem armazenamento: vale só nesta carga da página */ }
}
export const limparRecuperacao = () => {
  try { localStorage.removeItem(CHAVE) } catch { /* sem armazenamento */ }
  try { sessionStorage.removeItem(CHAVE) } catch { /* marca antiga, de versões anteriores */ }
}
