// MODO DEMONSTRAÇÃO — só para desenvolvimento (npm run demo). Não entra no site publicado.
// Troca o Supabase por dados fictícios para conferir o visual das telas sem login.

export type Role = 'dono' | 'socio' | 'confianca'
export const ROLE_LABEL: Record<Role, string> = { dono: 'Dono', socio: 'Sócio', confianca: 'Cargo de confiança' }

const C = 'company-1'
const hoje = new Date()
const iso = (d: number) => { const x = new Date(hoje.getFullYear(), hoje.getMonth(), d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const mesPassado = (d: number) => { const x = new Date(hoje.getFullYear(), hoje.getMonth() - 1, d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }

const pais = [
  ['p1', 'Cozinha / Insumos', 'Cmv'], ['p2', 'Bebidas', 'Cmv'], ['p3', 'Pessoal', 'Fixed'], ['p4', 'Ocupação e contas', 'Fixed'],
  ['p5', 'Impostos e taxas', 'Tax'], ['p6', 'Máquinas e serviços', 'Fixed'], ['p7', 'Manutenção e limpeza', 'Variable'],
  ['p8', 'Marketing', 'Variable'], ['p9', 'Frete e transporte', 'Variable'], ['p10', 'Outros / Desperdício e perdas', 'Variable'],
]
const subs: [string, string, string, string][] = [
  ['c1', 'p1', 'Carnes e frutos do mar', 'Cmv'], ['c2', 'p1', 'Hortifruti', 'Cmv'], ['c3', 'p1', 'Dendê, azeites e temperos', 'Cmv'],
  ['c4', 'p2', 'Cervejas e chopp', 'Cmv'], ['c5', 'p2', 'Refrigerantes, águas e sucos', 'Cmv'],
  ['c6', 'p3', 'Salários', 'Fixed'], ['c7', 'p3', 'Diárias de garçom/barman', 'Variable'],
  ['c8', 'p4', 'Aluguel', 'Fixed'], ['c9', 'p4', 'Energia', 'Fixed'], ['c10', 'p4', 'Internet', 'Fixed'],
  ['c11', 'p5', 'Simples Nacional/DAS', 'Tax'], ['c12', 'p6', 'Aluguel de máquina de cartão', 'Fixed'],
  ['c13', 'p7', 'Material de limpeza', 'Variable'], ['c14', 'p8', 'Impressos e arte', 'Variable'], ['c15', 'p9', 'Motoboy', 'Variable'],
]
const categories = [
  ...pais.map(([id, name, g], i) => ({ id, name, parent_id: null, cost_group: g, icon: '', color: '#B8471A', active: true, sort_order: i })),
  ...subs.map(([id, p, name, g], i) => ({ id, name, parent_id: p, cost_group: g, icon: '', color: '#B8471A', active: true, sort_order: 20 + i })),
]
const sup = (id: string, nickname: string, cnpj: string | null, cat: string | null) => ({ id, nickname, trade_name: null, legal_name: nickname + ' Ltda', cnpj, default_category_id: cat, is_complete: true, registration_status: cnpj ? 'ATIVA' : null })
const suppliers = [
  sup('s1', 'Seu Raimundo (grãos)', '12345678000190', 'c3'), sup('s2', 'Peixaria Mar Azul', '23456789000101', 'c1'),
  sup('s3', 'Distribuidora Ribeira', '67890123000145', 'c4'), sup('s4', 'Imobiliária Pelourinho', '78901234000156', 'c8'),
  sup('s5', 'Companhia de Energia', '89012345000167', 'c9'), sup('s6', 'Motoboy Expresso', null, 'c15'),
  sup('s7', 'Folha de pagamento', null, 'c6'), sup('s8', 'Casa da Limpeza', '22333444000155', 'c13'),
]
const sref = (id: string) => { const s = suppliers.find((x) => x.id === id)!; return { nickname: s.nickname, trade_name: null, legal_name: s.legal_name } }
let n = 0
const ex = (date: string, s: string, c: string, v: number, status = 'Paid', extra: Record<string, unknown> = {}) => ({
  id: 'e' + ++n, date, supplier_id: s, category_id: c, amount_cents: v, payment_method: 'Pix', invoice_number: null, due_date: null,
  status, notes: null, origin: 'Manual', deleted_at: null, recurrence_id: null, suppliers: sref(s), ...extra,
})
const expenses = [
  ex(iso(2), 's1', 'c3', 124000), ex(iso(3), 's2', 'c1', 198000), ex(iso(4), 's3', 'c4', 168000, 'Paid', { payment_method: 'BankSlip' }),
  ex(iso(5), 's7', 'c6', 560000), ex(iso(6), 's6', 'c15', 9000, 'Paid', { payment_method: 'Cash' }), ex(iso(8), 's8', 'c13', 26000, 'Paid', { payment_method: 'Debit' }),
  ex(iso(10), 's4', 'c8', 450000, 'Pending', { due_date: iso(10), recurrence_id: 'r1', notes: 'Aluguel', origin: 'Recurring' }),
  ex(iso(15), 's5', 'c9', 178000, 'AwaitingConfirmation', { due_date: iso(15), recurrence_id: 'r2', notes: 'Energia', origin: 'Recurring' }),
  ex(mesPassado(3), 's1', 'c3', 118000), ex(mesPassado(4), 's2', 'c1', 182000), ex(mesPassado(5), 's3', 'c4', 150000), ex(mesPassado(5), 's7', 'c6', 540000),
  ex(mesPassado(10), 's4', 'c8', 450000), ex(mesPassado(15), 's5', 'c9', 150000),
]
const revenues = [
  { id: 'v1', date: iso(1), gross_cents: 320000, discounts_cents: 12000, orders: 64 }, { id: 'v2', date: iso(2), gross_cents: 410000, discounts_cents: 0, orders: 80 },
  { id: 'v3', date: iso(3), gross_cents: 365000, discounts_cents: 5000, orders: 71 }, { id: 'v4', date: mesPassado(10), gross_cents: 2900000, discounts_cents: 50000, orders: 560 },
]
const DB: Record<string, Record<string, unknown>[]> = {
  categories, suppliers, expenses, revenues,
  category_goals: [{ category_id: 'p1', monthly_limit_cents: 600000 }, { category_id: 'p2', monthly_limit_cents: 300000 }, { category_id: 'p4', monthly_limit_cents: 500000 }],
  recurrences: [
    { id: 'r1', description: 'Aluguel', supplier_id: 's4', category_id: 'c8', default_amount_cents: 450000, day_of_month: 10, start_date: '2026-01-01', end_date: null, active: true, needs_confirmation: false },
    { id: 'r2', description: 'Energia', supplier_id: 's5', category_id: 'c9', default_amount_cents: 178000, day_of_month: 15, start_date: '2026-01-01', end_date: null, active: true, needs_confirmation: true },
  ],
  company_members: [
    { user_id: 'u1', role: 'dono', company_id: C, companies: { id: C, trade_name: 'Cantinho do Acarajé' }, profiles: { email: 'comercial@cantinhodoacaraje.com' } },
    { user_id: 'u2', role: 'confianca', company_id: C, companies: { id: C, trade_name: 'Cantinho do Acarajé' }, profiles: { email: 'maria@exemplo.com' } },
  ],
  member_invites: [{ id: 'i1', email: 'novo@exemplo.com', role: 'socio' }],
  ingredients: [{ id: 'g1', name: 'Camarão seco', unit: 'kg', active: true }, { id: 'g2', name: 'Feijão-fradinho', unit: 'kg', active: true }, { id: 'g3', name: 'Azeite de dendê', unit: 'l', active: true }],
  ingredient_prices: [{ ingredient_id: 'g1', date: iso(2), unit_cost_cents: 9000 }, { ingredient_id: 'g2', date: iso(2), unit_cost_cents: 1000 }, { ingredient_id: 'g3', date: iso(2), unit_cost_cents: 2500 }],
  products: [{ id: 'f1', name: 'Acarajé completo', kind: 'cozinha', menu_category: 'Acarajés', sale_price_cents: 1800, target_cmv: 30, instructions: null, version: 1, active: true }],
  recipe_items: [{ product_id: 'f1', ingredient_id: 'g1', quantity: 30, unit: 'g' }, { product_id: 'f1', ingredient_id: 'g2', quantity: 80, unit: 'g' }, { product_id: 'f1', ingredient_id: 'g3', quantity: 20, unit: 'ml' }],
  stock_balance: [
    { ingredient_id: 'g1', name: 'Camarão seco', unit: 'kg', active: true, min_stock: 2, balance: 1.5, last_movement: iso(1), below_min: true, stock_value_cents: 13500 },
    { ingredient_id: 'g2', name: 'Feijão-fradinho', unit: 'kg', active: true, min_stock: 5, balance: 12, last_movement: iso(3), below_min: false, stock_value_cents: 12000 },
    { ingredient_id: 'g3', name: 'Azeite de dendê', unit: 'l', active: true, min_stock: null, balance: -0.5, last_movement: iso(2), below_min: false, stock_value_cents: 0 },
  ],
  stock_movements: [
    { id: 'm1', kind: 'Entrada', delta: 5, occurred_on: iso(6), notes: 'Compra semanal' },
    { id: 'm2', kind: 'Saida', delta: -3, occurred_on: iso(3), notes: null },
    { id: 'm3', kind: 'Perda', delta: -0.5, occurred_on: iso(1), notes: 'Venceu' },
  ],
  attachments: [],
}

type Q = { data: unknown; error: null; count: number }
function builder(table: string) {
  let rows = [...(DB[table] ?? [])]
  let one = false
  const ok = (): Q => ({ data: one ? rows[0] ?? null : rows, error: null, count: rows.length })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: (q: Q) => unknown) => res(ok())
      if (prop === 'single' || prop === 'maybeSingle') return () => { one = true; return api }
      if (prop === 'insert' || prop === 'upsert') return () => { rows = [{ id: 'novo-' + Date.now() }]; return api }
      if (prop === 'update' || prop === 'delete') return () => { rows = []; return api }
      return () => api // eq, is, in, gte, lte, neq, not, order, limit, select…
    },
  })
  return api
}

export const supabase = {
  from: builder,
  rpc: () => Promise.resolve({ data: 0, error: null }),
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c },
  removeChannel: () => undefined,
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({}), createSignedUrl: async () => ({ data: null }) }) },
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'comercial@cantinhodoacaraje.com' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => undefined, signInWithPassword: async () => ({ error: null }), signUp: async () => ({ data: {}, error: null }),
  },
}
