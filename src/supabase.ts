import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined
// Falha cedo e com mensagem clara, em vez de um app que "carrega" para sempre.
if (!url || !key) throw new Error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_KEY (URL e chave PUBLICÁVEL do Supabase). Veja o README.')

export const supabase = createClient(url, key, {
  auth: {
    // PKCE: o link do e-mail traz um código de uso único, e não o token da sessão na barra de endereço.
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export type Role = 'dono' | 'socio' | 'confianca'

export interface Category {
  id: string
  name: string
  parent_id: string | null
  icon: string
  active: boolean
  sort_order: number
}

export interface Supplier {
  id: string
  nickname: string | null
  trade_name: string | null
  legal_name: string | null
}

export const supplierName = (s: Pick<Supplier, 'nickname' | 'trade_name' | 'legal_name'>) =>
  s.nickname || s.trade_name || s.legal_name || '(sem nome)'

export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'Pix', label: 'Pix' },
  { value: 'Cash', label: 'Dinheiro' },
  { value: 'Card', label: 'Cartão' },
  { value: 'BankSlip', label: 'Boleto' },
  { value: 'Transfer', label: 'Transferência' },
]

export const ROLE_LABEL: Record<Role, string> = {
  dono: 'Dono',
  socio: 'Sócio',
  confianca: 'Cargo de confiança',
}
