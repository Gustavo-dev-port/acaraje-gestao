// Formatadores (dinheiro em centavos, datas ISO "AAAA-MM-DD", mês "AAAA-MM")

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const reais = (c: number) => brl.format(c / 100).replace(/ /g, ' ')
export const reaisCurto = (c: number) => {
  const v = c / 100
  return v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : reais(c)
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const pad = (n: number) => String(n).padStart(2, '0')

export const hojeIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const ontemIso = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const mesDe = (iso: string) => iso.slice(0, 7)
export const mesAtual = () => mesDe(hojeIso())
export const nomeMes = (m: string) => { const [y, mm] = m.split('-').map(Number); return `${cap(MESES[mm - 1])} de ${y}` }
export const nomeMesSo = (m: string) => cap(MESES[Number(m.split('-')[1]) - 1])
export const mudarMes = (m: string, delta: number) => {
  const [y, mm] = m.split('-').map(Number)
  const d = new Date(y, mm - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
export const mesAnterior = (m: string) => mudarMes(m, -1)
export const inicioMes = (m: string) => `${m}-01`
export const fimMes = (m: string) => {
  const [y, mm] = m.split('-').map(Number)
  return `${m}-${pad(new Date(y, mm, 0).getDate())}`
}
export const dataBR = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
export const dataCurta = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

/** Máscara de valor estilo caixa eletrônico: os dígitos entram pela direita. */
export const digitosParaCentavos = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 10)
  return d ? parseInt(d, 10) : 0
}
export const centavosParaCampo = (c: number) =>
  (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const mascararCnpj = (digits: string) => {
  const d = digits.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export const variacao = (atual: number, anterior: number) =>
  anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : 0
