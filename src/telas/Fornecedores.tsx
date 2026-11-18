import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, CircleAlert, MinusCircle, Pencil, Plus, Search, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { nomeFornecedor, useApp } from '@/lib/ctx'
import { mascararCnpj, reais } from '@/lib/fmt'
import { buscarCnpj } from '@/lib/gastos'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { IconeCategoria } from '@/ui/icones'
import { campoCls, Confirmacao, EstadoVazio, Janela, Rotulo, Selo } from '@/ui/kit'
import { SelectCategoria } from './GastoEditor'

interface Forn {
  id: string; cnpj: string | null; legal_name: string | null; trade_name: string | null; nickname: string | null
  registration_status: string | null; default_category_id: string | null; is_complete: boolean
}

function SeloSituacao({ f }: { f: Forn }) {
  if (!f.cnpj) return <Selo tom="neutro"><MinusCircle className="size-5" aria-hidden /> Sem CNPJ</Selo>
  const s = (f.registration_status ?? '').toUpperCase()
  if (s && s !== 'ATIVA') return <Selo tom="erro"><CircleAlert className="size-5" aria-hidden /> {f.registration_status}</Selo>
  return <Selo tom="ok"><BadgeCheck className="size-5" aria-hidden /> {s ? 'Ativa' : 'Com CNPJ'}</Selo>
}

export default function Fornecedores() {
  const app = useApp()
  const { companyId, podeEditar, catPorId } = app
  const [lista, setLista] = useState<Forn[]>([])
  const [gasto, setGasto] = useState<Map<string, number>>(new Map())
  const [busca, setBusca] = useState('')
  const [edit, setEdit] = useState<Partial<Forn> | null>(null)
  const [apagar, setApagar] = useState<Forn | null>(null)
  const ano = new Date().getFullYear()

  const carregar = useCallback(async () => {
    const [s, g] = await Promise.all([
      supabase.from('suppliers').select('id,cnpj,legal_name,trade_name,nickname,registration_status,default_category_id,is_complete'),
      supabase.from('expenses').select('supplier_id,amount_cents').is('deleted_at', null).neq('status', 'AwaitingConfirmation').gte('date', `${ano}-01-01`).lte('date', `${ano}-12-31`),
    ])
    setLista(((s.data as Forn[]) ?? []).sort((a, b) => nomeFornecedor(a).localeCompare(nomeFornecedor(b), 'pt-BR')))
    const m = new Map<string, number>()
    for (const r of (g.data as { supplier_id: string; amount_cents: number }[]) ?? []) m.set(r.supplier_id, (m.get(r.supplier_id) ?? 0) + r.amount_cents)
    setGasto(m)
  }, [ano])
  useEffect(() => { carregar() }, [carregar])

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const d = busca.replace(/\D/g, '')
    return t ? lista.filter((f) => `${nomeFornecedor(f)} ${f.legal_name ?? ''}`.toLowerCase().includes(t) || (d.length >= 3 && (f.cnpj ?? '').includes(d))) : lista
  }, [lista, busca])

  async function excluir(f: Forn) {
    const { error } = await supabase.from('suppliers').delete().eq('id', f.id)
    if (error) toast.erro('Esse fornecedor já tem lançamentos.', 'Ele não pode ser apagado, só editado.')
    else { toast.ok('Fornecedor apagado'); carregar(); app.recarregar() }
  }

  return (
    <AppShell titulo="Fornecedores" subtitulo="Quem você compra e paga."
      acoes={podeEditar ? <Button size="lg" onClick={() => setEdit({})}><Plus /> Novo fornecedor</Button> : undefined}>
      <div className="relative mb-5 max-w-[32rem]">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CNPJ…" aria-label="Buscar fornecedor" className={cn(campoCls, 'pl-12')} />
      </div>
      {filtrada.length === 0 ? <EstadoVazio titulo="Nenhum fornecedor encontrado." texto="Eles são cadastrados na hora em que você lança um gasto." /> : (
        <ul className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
          {filtrada.map((f, i) => (
            <li key={f.id} className={cn('flex min-h-[4.5rem] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3', i % 2 === 1 && 'bg-zebra')}>
              <IconeCategoria icone={f.default_category_id ? app.iconeDoGasto(f.default_category_id) : 'outros'} className="size-7 text-laranja" />
              <span className="min-w-0 flex-1 basis-48">
                <span className="block truncate font-semibold">{nomeFornecedor(f)}</span>
                <span className="block truncate text-legenda text-muted-foreground">
                  {f.cnpj ? `CNPJ ${mascararCnpj(f.cnpj)}` : 'sem CNPJ'}{f.default_category_id && ` · ${catPorId(f.default_category_id)?.name ?? ''}`}{!f.is_complete && ' · cadastro incompleto'}
                </span>
              </span>
              <SeloSituacao f={f} />
              <span className="numeros w-40 text-right"><span className="block text-legenda text-muted-foreground">Gasto em {ano}</span><b>{reais(gasto.get(f.id) ?? 0)}</b></span>
              {podeEditar && (
                <span className="flex">
                  <Button variant="ghost" size="icon" aria-label={`Editar ${nomeFornecedor(f)}`} onClick={() => setEdit(f)}><Pencil className="!size-5" /></Button>
                  <Button variant="ghost" size="icon" className="text-erro" aria-label={`Apagar ${nomeFornecedor(f)}`} onClick={() => setApagar(f)}><Trash2 className="!size-5" /></Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {edit && <FormForn inicial={edit} companyId={companyId} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); carregar(); app.recarregar() }} />}
      <Confirmacao aberto={!!apagar} onAberto={(v) => !v && setApagar(null)} titulo={`Apagar “${apagar ? nomeFornecedor(apagar) : ''}”?`} descricao="Só dá para apagar um fornecedor que nunca recebeu lançamentos." confirmar="Sim, apagar" onConfirmar={() => { if (apagar) excluir(apagar); setApagar(null) }} />
    </AppShell>
  )
}

function FormForn({ inicial, companyId, onFechar, onSalvo }: { inicial: Partial<Forn>; companyId: string; onFechar: () => void; onSalvo: () => void }) {
  const [apelido, setApelido] = useState(inicial.nickname ?? '')
  const [razao, setRazao] = useState(inicial.legal_name ?? '')
  const [cnpj, setCnpj] = useState(inicial.cnpj ? mascararCnpj(inicial.cnpj) : '')
  const [cat, setCat] = useState(inicial.default_category_id ?? '')
  const [extra, setExtra] = useState<{ cnae?: string; situacao?: string; cidade?: string; uf?: string; endereco?: string; fantasia?: string }>({})
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const digitos = cnpj.replace(/\D/g, '')

  async function consultar() {
    setBuscando(true); setErro('')
    const d = await buscarCnpj(digitos)
    setBuscando(false)
    if (!d) return setErro('Não encontrei esse CNPJ agora. Confira o número ou preencha à mão.')
    setRazao(d.razao); if (!apelido.trim()) setApelido(d.fantasia || d.razao)
    setExtra({ cnae: d.cnae, situacao: d.situacao, cidade: d.cidade, uf: d.uf, endereco: d.endereco, fantasia: d.fantasia })
    toast.ok('Dados preenchidos pela Receita', { descricao: d.razao })
  }

  async function salvar() {
    setErro('')
    if (digitos && digitos.length !== 14) return setErro('O CNPJ precisa ter 14 números.')
    if (!apelido.trim() && !razao.trim()) return setErro('Dê um nome ao fornecedor.')
    setSalvando(true)
    const payload: Record<string, unknown> = {
      nickname: apelido.trim() || null, legal_name: razao.trim() || null, cnpj: digitos || null, default_category_id: cat || null, is_complete: true,
    }
    if (extra.situacao) Object.assign(payload, { registration_status: extra.situacao, cnae: extra.cnae, city: extra.cidade, state: extra.uf, address: extra.endereco, trade_name: extra.fantasia || null })
    const r = inicial.id ? await supabase.from('suppliers').update(payload).eq('id', inicial.id) : await supabase.from('suppliers').insert({ ...payload, company_id: companyId })
    setSalvando(false)
    if (r.error) return setErro(r.error.code === '23505' ? 'Já existe um fornecedor com esse CNPJ.' : 'Não consegui salvar.')
    toast.ok('Fornecedor salvo'); onSalvo()
  }

  return (
    <Janela titulo={inicial.id ? 'Editar fornecedor' : 'Novo fornecedor'} onFechar={onFechar} lado largura="30rem">
      <div className="space-y-5">
        <div>
          <Rotulo htmlFor="f-cnpj">CNPJ (opcional)</Rotulo>
          <div className="mt-2 flex gap-2">
            <input id="f-cnpj" inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(mascararCnpj(e.target.value))} className={campoCls} />
            <Button variant="outline" onClick={consultar} disabled={digitos.length !== 14 || buscando}>{buscando ? <Loader2 className="animate-spin" /> : <Search />} Buscar</Button>
          </div>
          <p className="mt-1 text-legenda text-muted-foreground">Com os 14 números, a gente busca o nome e a situação na Receita.</p>
        </div>
        <div><Rotulo htmlFor="f-ap">Nome de uso (como você chama)</Rotulo><input id="f-ap" value={apelido} onChange={(e) => setApelido(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
        <div><Rotulo htmlFor="f-rz">Razão social (opcional)</Rotulo><input id="f-rz" value={razao} onChange={(e) => setRazao(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
        <div><Rotulo htmlFor="f-cat">Tipo de gasto usual (opcional)</Rotulo><SelectCategoria id="f-cat" valor={cat} onChange={setCat} className="mt-2" /></div>
        {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
        <div className="flex gap-3">
          <Button size="lg" className="flex-1" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
          <Button size="lg" variant="outline" onClick={onFechar}>Cancelar</Button>
        </div>
      </div>
    </Janela>
  )
}
