import { useCallback, useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { supabase, ROLE_LABEL, type Role } from '@/supabase'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { useApp } from '@/lib/ctx'
import { AppShell } from '@/ui/AppShell'
import { Button } from '@/ui/Button'
import { Aviso, campoCls, Chip, Confirmacao, Rotulo, Selo } from '@/ui/kit'

interface Membro { user_id: string; role: Role; profiles: { email: string | null } | null }
interface Convite { id: string; email: string; role: Role }

export default function Equipe() {
  const { companyId, userId, role: meuPapel } = useApp()
  const [membros, setMembros] = useState<Membro[]>([])
  const [convites, setConvites] = useState<Convite[]>([])
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Role>('confianca')
  const [aviso, setAviso] = useState<{ t: string; tipo: 'ok' | 'erro' } | null>(null)
  const [remover, setRemover] = useState<Membro | null>(null)

  const carregar = useCallback(async () => {
    const m = await supabase.from('company_members').select('user_id, role, profiles(email)').eq('company_id', companyId)
    setMembros((m.data as unknown as Membro[]) ?? [])
    const i = await supabase.from('member_invites').select('id,email,role').eq('company_id', companyId).is('accepted_at', null)
    setConvites((i.data as Convite[]) ?? [])
  }, [companyId])
  useEffect(() => { carregar() }, [carregar])

  if (meuPapel !== 'dono') return <AppShell titulo="Equipe"><Aviso tipo="atencao">Só o dono gerencia a equipe.</Aviso></AppShell>

  async function convidar(e: React.FormEvent) {
    e.preventDefault()
    setAviso(null)
    const mail = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(mail)) return setAviso({ t: 'Digite um e-mail válido.', tipo: 'erro' })
    const { error } = await supabase.from('member_invites').insert({ company_id: companyId, email: mail, role: papel, invited_by: userId })
    if (error) return setAviso({ t: error.code === '23505' ? 'Esse e-mail já foi convidado.' : 'Não consegui convidar.', tipo: 'erro' })
    setEmail('')
    setAviso({ t: `Convite criado. Peça para ${mail} abrir o app e tocar em “Primeiro acesso”.`, tipo: 'ok' })
    carregar()
  }

  return (
    <AppShell titulo="Equipe" subtitulo="Quem pode entrar no app e o que cada um pode fazer.">
      <div className="grid gap-8 xl:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="quem">
          <h2 id="quem" className="mb-3 text-secao font-bold">Quem tem acesso</h2>
          <ul className="overflow-hidden rounded-cartao border border-border bg-card shadow-suave">
            {membros.map((m, i) => (
              <li key={m.user_id} className={cn('flex min-h-16 items-center gap-3 px-5 py-2', i % 2 === 1 && 'bg-zebra')}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{m.profiles?.email ?? m.user_id}{m.user_id === userId && ' (você)'}</span>
                  <span className="block text-legenda text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                </span>
                {m.user_id !== userId && <Button variant="ghost" size="icon" className="text-erro" aria-label={`Remover ${m.profiles?.email ?? 'pessoa'}`} onClick={() => setRemover(m)}><Trash2 className="!size-5" /></Button>}
              </li>
            ))}
            {convites.map((c) => (
              <li key={c.id} className="flex min-h-16 items-center gap-3 border-t border-border px-5 py-2">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.email}</span><span className="block text-legenda text-muted-foreground">{ROLE_LABEL[c.role]}</span></span>
                <Selo tom="alerta">Convite pendente</Selo>
                <Button variant="ghost" size="icon" aria-label={`Cancelar convite de ${c.email}`} onClick={async () => { await supabase.from('member_invites').delete().eq('id', c.id); carregar() }}><X /></Button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="conv">
          <h2 id="conv" className="mb-3 text-secao font-bold">Convidar alguém</h2>
          <form onSubmit={convidar} noValidate className="space-y-5 rounded-cartao border border-border bg-card p-5 shadow-suave">
            <div><Rotulo htmlFor="mail">E-mail da pessoa</Rotulo><input id="mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cn(campoCls, 'mt-2')} /></div>
            <fieldset>
              <legend className="text-rotulo font-semibold">O que ela pode fazer?</legend>
              <div className="mt-2 flex flex-wrap gap-2"><Chip ativo={papel === 'confianca'} onClick={() => setPapel('confianca')}>Cargo de confiança</Chip><Chip ativo={papel === 'socio'} onClick={() => setPapel('socio')}>Sócio</Chip></div>
              <p className="mt-2 text-legenda text-muted-foreground">{papel === 'confianca' ? 'Vê os números, lança gastos e faturamento. Não apaga nem mexe em cadastros.' : 'Vê e edita tudo, inclusive apagar. Não gerencia pessoas.'}</p>
            </fieldset>
            {aviso && <Aviso tipo={aviso.tipo} className="py-3">{aviso.t}</Aviso>}
            <Button type="submit" size="lg" className="w-full">Convidar</Button>
          </form>
        </section>
      </div>
      <Confirmacao aberto={!!remover} onAberto={(v) => !v && setRemover(null)} titulo="Remover esta pessoa?" descricao="Ela perde o acesso na hora. Os lançamentos que ela fez continuam." confirmar="Sim, remover"
        onConfirmar={async () => {
          if (remover) {
            const { error } = await supabase.from('company_members').delete().eq('company_id', companyId).eq('user_id', remover.user_id)
            if (error) toast.erro('Não consegui remover.'); else toast.ok('Pessoa removida')
            carregar()
          }
          setRemover(null)
        }} />
    </AppShell>
  )
}
