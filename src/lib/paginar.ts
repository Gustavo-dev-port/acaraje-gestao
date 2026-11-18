const PAGINA = 1000 // limite de linhas por resposta do Supabase

interface Resposta<T> { data: T[] | null; error: unknown }

/**
 * Lê TODAS as linhas de uma consulta, página a página.
 * Sem isso, o Supabase corta a resposta em 1.000 linhas e os totais ficariam errados sem aviso.
 * A consulta precisa ter ordem fixa (ex.: .order('id')) para as páginas não se misturarem.
 */
export async function todasLinhas<T>(consulta: (de: number, ate: number) => PromiseLike<Resposta<T>>): Promise<T[]> {
  const todas: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1)
    if (error) throw error
    const lote = data ?? []
    todas.push(...lote)
    if (lote.length < PAGINA) return todas
  }
}
