import { useEffect, useRef, useState } from 'react'
import { Camera, ExternalLink, Trash2 } from 'lucide-react'
import { supabase } from '@/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { nomeFornecedor, useApp } from '@/lib/ctx'
import { abrirAnexo, enviarAnexo, FORMAS, listarAnexos, removerAnexo, rotuloForma, type Anexo, type Gasto } from '@/lib/gastos'
import { Button } from '@/ui/Button'
import { campoCls, CampoValor, Chip, Janela, Rotulo } from '@/ui/kit'

/** Seletor de categoria: grupo → detalhe, como <select> agrupado. */
export function SelectCategoria({ id, valor, onChange, className }: { id?: string; valor: string; onChange: (v: string) => void; className?: string }) {
  const { grupos, subsDe } = useApp()
  return (
    <select id={id} value={valor} onChange={(e) => onChange(e.target.value)} className={cn(campoCls, className)}>
      <option value="">Escolha…</option>
      {grupos.map((g) => {
        const subs = subsDe(g.id).filter((s) => s.active || s.id === valor)
        return subs.length ? (
          <optgroup key={g.id} label={g.name}>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
        ) : <option key={g.id} value={g.id}>{g.name}</option>
      })}
    </select>
  )
}

export default function GastoEditor({ gasto, titulo = 'Editar gasto', onFechar, onSalvo }: {
  gasto: Gasto; titulo?: string; onFechar: () => void; onSalvo: () => void
}) {
  const { sups, companyId } = useApp()
  const [valor, setValor] = useState(gasto.amount_cents)
  const [data, setData] = useState(gasto.date)
  const [cat, setCat] = useState(gasto.category_id)
  const [fornId, setFornId] = useState(gasto.supplier_id)
  const [forma, setForma] = useState(gasto.payment_method)
  // a situação só muda se a pessoa mudar de propósito (editar a nota não "confirma" uma conta)
  const [situacao, setSituacao] = useState(gasto.status)
  const [venc, setVenc] = useState(gasto.due_date ?? gasto.date)
  const [nota, setNota] = useState(gasto.invoice_number ?? '')
  const [obs, setObs] = useState(gasto.notes ?? '')
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [novos, setNovos] = useState<File[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const refFoto = useRef<HTMLInputElement>(null)

  useEffect(() => { listarAnexos(gasto.id).then(setAnexos) }, [gasto.id])

  async function salvar() {
    setErro('')
    if (valor <= 0) return setErro('Digite o valor. Ex.: 150,00')
    if (!cat) return setErro('Escolha a categoria.')
    setSalvando(true)
    const { error } = await supabase.from('expenses').update({
      amount_cents: valor, date: data, category_id: cat, supplier_id: fornId, payment_method: forma,
      status: situacao, due_date: situacao === 'Paid' ? gasto.due_date : venc,
      invoice_number: nota.trim() || null, notes: obs.trim() || null,
    }).eq('id', gasto.id)
    if (error) { setSalvando(false); return setErro('Não consegui salvar. Tente de novo.') }
    let falhas = 0
    for (const f of novos) if (!(await enviarAnexo(companyId, gasto.id, f))) falhas++
    setSalvando(false)
    if (falhas) toast.erro(`${falhas} anexo(s) não subiram.`, 'O limite é 10 MB por arquivo.')
    else toast.ok('Alteração salva')
    onSalvo()
  }

  return (
    <Janela titulo={titulo} onFechar={onFechar} largura="36rem">
      <div className="space-y-5">
        <div>
          <Rotulo htmlFor="ed-forn">Fornecedor</Rotulo>
          <select id="ed-forn" value={fornId} onChange={(e) => setFornId(e.target.value)} className={cn(campoCls, 'mt-2')}>
            {sups.map((s) => <option key={s.id} value={s.id}>{nomeFornecedor(s)}</option>)}
          </select>
        </div>
        <div>
          <Rotulo htmlFor="ed-valor">Valor</Rotulo>
          <CampoValor id="ed-valor" valor={valor} onChange={setValor} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="ed-data">Data</Rotulo>
            <input id="ed-data" type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} className={cn(campoCls, 'mt-2')} />
          </div>
          <div>
            <Rotulo htmlFor="ed-cat">Categoria</Rotulo>
            <SelectCategoria id="ed-cat" valor={cat} onChange={setCat} className="mt-2" />
          </div>
        </div>
        <fieldset>
          <legend className="text-rotulo font-semibold">Situação</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip ativo={situacao === 'Paid'} onClick={() => setSituacao('Paid')}>Já paguei</Chip>
            <Chip ativo={situacao === 'Pending'} onClick={() => setSituacao('Pending')}>Ainda não paguei</Chip>
            {gasto.status === 'AwaitingConfirmation' && (
              <Chip ativo={situacao === 'AwaitingConfirmation'} onClick={() => setSituacao('AwaitingConfirmation')}>Valor a confirmar</Chip>
            )}
          </div>
          {situacao !== 'Paid' && (
            <div className="mt-3 max-w-[16rem]">
              <Rotulo htmlFor="ed-venc">Vencimento</Rotulo>
              <input id="ed-venc" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={cn(campoCls, 'mt-2')} />
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend className="text-rotulo font-semibold">Como pagou</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {/* mantém a forma antiga já gravada (Cartão, Transferência) como opção, para não perdê-la ao editar */}
            {[...FORMAS, ...(gasto.payment_method && !FORMAS.some((f) => f.valor === gasto.payment_method) ? [{ valor: gasto.payment_method, rotulo: rotuloForma(gasto.payment_method) }] : [])]
              .map((f) => <Chip key={f.valor} ativo={forma === f.valor} onClick={() => setForma(forma === f.valor ? null : f.valor)}>{f.rotulo}</Chip>)}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="ed-nota">Número da nota</Rotulo>
            <input id="ed-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={cn(campoCls, 'mt-2')} />
          </div>
          <div>
            <Rotulo htmlFor="ed-obs">Observação</Rotulo>
            <input id="ed-obs" value={obs} onChange={(e) => setObs(e.target.value)} className={cn(campoCls, 'mt-2')} />
          </div>
        </div>
        <div>
          <span className="text-rotulo font-semibold">Foto ou PDF da nota</span>
          {anexos.length > 0 && (
            <ul className="mt-2 space-y-1">
              {anexos.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-campo bg-zebra px-4 py-1">
                  <button type="button" className="flex h-12 items-center gap-2 text-corpo font-semibold text-primary underline underline-offset-4" onClick={() => abrirAnexo(a)}>
                    <ExternalLink className="size-5" aria-hidden /> {a.kind === 'pdf' ? 'Abrir PDF' : 'Abrir imagem'}
                  </button>
                  <Button variant="ghost" size="icon" aria-label="Remover anexo" className="text-erro" onClick={async () => { if (confirm('Remover este anexo?')) { if (await removerAnexo(a)) setAnexos((l) => l.filter((x) => x.id !== a.id)); else toast.erro('Não consegui remover o anexo.', 'Só dono e sócio removem anexos.') } }}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2">
            <input ref={refFoto} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => setNovos(Array.from(e.target.files ?? []))} />
            <Button variant="outline" onClick={() => refFoto.current?.click()}><Camera /> Adicionar arquivo</Button>
            {novos.length > 0 && <span className="ml-3 text-legenda text-muted-foreground">{novos.length} para enviar ao salvar</span>}
          </div>
        </div>
        {erro && <p role="alert" className="text-legenda font-semibold text-erro">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Button variant="outline" size="lg" onClick={onFechar}>Cancelar</Button>
          <Button size="lg" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar alteração'}</Button>
        </div>
      </div>
    </Janela>
  )
}
