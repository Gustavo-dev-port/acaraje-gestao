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

// Tipos aceitos: os mesmos que o bucket do Supabase aceita (imagem sem SVG, e PDF), até 10 MB.
// A triagem aqui melhora a mensagem para a pessoa; quem barra de verdade é o banco.
const TIPOS_POR_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
}
export const ANEXO_ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'
export const ANEXO_MAX_BYTES = 10 * 1024 * 1024
export const ANEXO_MAX_QTD = 5

const EXTENSAO_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf',
}

const extensaoDe = (nome: string) => (nome.includes('.') ? nome.split('.').pop()! : '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Tipo permitido do arquivo, ou null.
 * Vale o tipo que o navegador informa, se for um dos aceitos (o iPhone, por exemplo, converte HEIC em JPEG mas mantém o
 * nome .HEIC; alguns Androids mandam arquivo sem extensão). Sem tipo, vale a extensão. Imagem dizendo ser PDF (ou o
 * contrário), SVG e qualquer outro tipo são recusados. A extensão guardada no servidor sai do tipo, não do nome.
 */
function tipoPermitido(f: File): string | null {
  const porExt = TIPOS_POR_EXTENSAO[extensaoDe(f.name)]
  let t = f.type.toLowerCase()
  if (t === 'image/jpg') t = 'image/jpeg'
  if (!t) return porExt ?? null
  if (!(t in EXTENSAO_POR_TIPO)) return null
  if (porExt && (t === 'application/pdf') !== (porExt === 'application/pdf')) return null
  return t
}

/** Separa o que pode ser enviado do que não pode e diz o motivo, em palavras simples. */
export function triarArquivos(arquivos: File[]): { aceitos: File[]; motivo: { titulo: string; dica: string } | null } {
  const aceitos: File[] = []
  let semTipo = 0, grandes = 0, demais = 0
  for (const f of arquivos) {
    if (!tipoPermitido(f)) semTipo++
    else if (f.size > ANEXO_MAX_BYTES) grandes++
    else if (aceitos.length >= ANEXO_MAX_QTD) demais++
    else aceitos.push(f)
  }
  const motivo = semTipo ? { titulo: `${semTipo} arquivo(s) de tipo não aceito.`, dica: 'Envie foto (JPG, PNG, WEBP, HEIC) ou PDF.' }
    : grandes ? { titulo: `${grandes} arquivo(s) grande(s) demais.`, dica: 'O limite é 10 MB por arquivo.' }
    : demais ? { titulo: `Só ${ANEXO_MAX_QTD} arquivos por vez.`, dica: 'Os outros ficaram de fora.' }
    : null
  return { aceitos, motivo }
}

export async function enviarAnexo(companyId: string, expenseId: string, f: File): Promise<boolean> {
  const tipo = tipoPermitido(f)
  if (!tipo || f.size > ANEXO_MAX_BYTES) return false
  const ext = EXTENSAO_POR_TIPO[tipo]
  const d = new Date()
  const path = `${companyId}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: tipo })
  if (up.error) return false
  const ins = await supabase.from('attachments').insert({ company_id: companyId, expense_id: expenseId, path, kind: tipo === 'application/pdf' ? 'pdf' : 'image' })
  if (ins.error) {
    // sem o registro no banco o arquivo ficaria órfão: remove o que acabou de subir
    await supabase.storage.from(BUCKET).remove([path])
    return false
  }
  return true
}

export async function abrirAnexo(a: Anexo) {
  // abre a aba já no clique: no Safari/iPhone um window.open depois de aguardar a rede é bloqueado
  const aba = window.open('', '_blank')
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 120)
  if (data?.signedUrl && aba) { aba.opener = null; aba.location.href = data.signedUrl }
  else if (data?.signedUrl) window.location.href = data.signedUrl
  else aba?.close()
}

/** Apaga o registro primeiro: se falhar, nada mudou e o anexo continua abrindo. Só então remove o arquivo. */
export async function removerAnexo(a: Anexo): Promise<boolean> {
  const del = await supabase.from('attachments').delete().eq('id', a.id)
  if (del.error) return false
  await supabase.storage.from(BUCKET).remove([a.path]) // se falhar, sobra só um arquivo sem referência (inofensivo)
  return true
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
