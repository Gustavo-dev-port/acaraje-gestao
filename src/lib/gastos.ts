import { supabase } from '@/supabase'

export interface Gasto {
  id: string
  date: string
  supplier_id: string
  category_id: string
  amount_cents: number
  payment_method: string | null
  invoice_number: string | null
  due_date: string | null
  status: string
  notes: string | null
  origin: string
  deleted_at: string | null
  recurrence_id: string | null
  suppliers: { nickname: string | null; trade_name: string | null; legal_name: string | null } | null
}

export const GASTO_SEL =
  'id,date,supplier_id,category_id,amount_cents,payment_method,invoice_number,due_date,status,notes,origin,deleted_at,recurrence_id,suppliers(nickname,trade_name,legal_name)'

// valores guardados no banco (compatíveis com o app antigo) e o texto mostrado
export const FORMAS: { valor: string; rotulo: string }[] = [
  { valor: 'Pix', rotulo: 'Pix' },
  { valor: 'Cash', rotulo: 'Dinheiro' },
  { valor: 'Debit', rotulo: 'Débito' },
  { valor: 'Credit', rotulo: 'Crédito' },
  { valor: 'BankSlip', rotulo: 'Boleto' },
]
export const rotuloForma = (v: string | null) =>
  v === 'Card' ? 'Cartão' : v === 'Transfer' ? 'Transferência' : FORMAS.find((f) => f.valor === v)?.rotulo ?? v ?? ''

// ---------- anexos (foto ou PDF da nota) ----------
const BUCKET = 'attachments'
export interface Anexo { id: string; path: string; kind: string }

export async function listarAnexos(expenseId: string): Promise<Anexo[]> {
  const { data } = await supabase.from('attachments').select('id,path,kind').eq('expense_id', expenseId)
  return (data as Anexo[]) ?? []
}

export async function enviarAnexo(companyId: string, expenseId: string, f: File): Promise<boolean> {
  if (f.size > 10 * 1024 * 1024) return false
  const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const d = new Date()
  const path = `${companyId}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined })
  if (up.error) return false
  const ins = await supabase.from('attachments').insert({ company_id: companyId, expense_id: expenseId, path, kind: f.type === 'application/pdf' ? 'pdf' : 'image' })
  return !ins.error
}

export async function abrirAnexo(a: Anexo) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 120)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
}

export async function removerAnexo(a: Anexo) {
  await supabase.storage.from(BUCKET).remove([a.path])
  await supabase.from('attachments').delete().eq('id', a.id)
}

// ---------- busca de CNPJ (BrasilAPI, base pública da Receita) ----------
export interface DadosCnpj {
  razao: string; fantasia: string; situacao: string; cnae: string; cidade: string; uf: string; endereco: string
}

export async function buscarCnpj(digitos: string): Promise<DadosCnpj | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`)
    if (!r.ok) return null
    const j = await r.json()
    return {
      razao: j.razao_social ?? '', fantasia: j.nome_fantasia ?? '', situacao: j.descricao_situacao_cadastral ?? '',
      cnae: j.cnae_fiscal_descricao ?? '', cidade: j.municipio ?? '', uf: j.uf ?? '',
      endereco: [j.logradouro, j.numero, j.bairro].filter(Boolean).join(', '),
    }
  } catch {
    return null
  }
}
