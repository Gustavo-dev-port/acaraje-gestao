import { useCallback, useEffect, useState } from 'react'
import { supabase, ROLE_LABEL, type Role } from './supabase'

interface Member { user_id: string; role: Role; profiles: { email: string | null } | null }
interface Invite { id: string; email: string; role: Role; accepted_at: string | null }

export default function Equipe({ companyId, myId }: { companyId: string; myId: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('confianca')
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    const m = await supabase.from('company_members').select('user_id, role, profiles(email)').eq('company_id', companyId)
    setMembers((m.data as unknown as Member[]) ?? [])
    const i = await supabase.from('member_invites').select('id,email,role,accepted_at').eq('company_id', companyId).is('accepted_at', null)
    setInvites((i.data as Invite[]) ?? [])
  }, [companyId])

  useEffect(() => { load() }, [load])

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const mail = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(mail)) return setMsg({ text: 'Digite um e-mail válido.', error: true })
    const { error } = await supabase.from('member_invites')
      .insert({ company_id: companyId, email: mail, role, invited_by: myId })
    if (error) return setMsg({ text: error.code === '23505' ? 'Esse e-mail já foi convidado.' : 'Não consegui convidar.', error: true })
    setEmail('')
    setMsg({ text: `Convite criado. Peça para ${mail} abrir o app e tocar em "Primeiro acesso".`, error: false })
    load()
  }

  async function cancelInvite(id: string) {
    await supabase.from('member_invites').delete().eq('id', id)
    load()
  }

  async function removeMember(userId: string) {
    if (!confirm('Remover esta pessoa da empresa? Ela perde o acesso na hora.')) return
    const { error } = await supabase.from('company_members').delete().eq('company_id', companyId).eq('user_id', userId)
    if (error) setMsg({ text: 'Não consegui remover.', error: true })
    load()
  }

  return (
    <div>
      <h1 className="title">Equipe</h1>
      <p className="muted">Quem pode entrar no app e o que cada um pode fazer.</p>
      <div className="stitch" />

      <ul className="list">
        {members.map((m) => (
          <li key={m.user_id} className="item">
            <div className="item-main">
              <div className="item-title">{m.profiles?.email ?? m.user_id}{m.user_id === myId ? ' (você)' : ''}</div>
              <div className="muted small">{ROLE_LABEL[m.role]}</div>
            </div>
            {m.user_id !== myId && (
              <button className="icon-btn" aria-label="Remover pessoa" onClick={() => removeMember(m.user_id)}>🗑</button>
            )}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="item">
            <div className="item-main">
              <div className="item-title">{i.email}</div>
              <div className="muted small">{ROLE_LABEL[i.role]} · convite pendente</div>
            </div>
            <button className="icon-btn" aria-label="Cancelar convite" onClick={() => cancelInvite(i.id)}>✖</button>
          </li>
        ))}
      </ul>

      <h2 className="subtitle">Convidar alguém</h2>
      <form className="card form" onSubmit={invite}>
        <label className="label" htmlFor="mail">E-mail da pessoa</label>
        <input id="mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="label">O que ela pode fazer</label>
        <div className="chips">
          <button type="button" className={'chip' + (role === 'confianca' ? ' on' : '')} onClick={() => setRole('confianca')}>Cargo de confiança</button>
          <button type="button" className={'chip' + (role === 'socio' ? ' on' : '')} onClick={() => setRole('socio')}>Sócio</button>
        </div>
        <p className="muted small">
          {role === 'confianca'
            ? 'Vê os números, lança gastos e faturamento. Não apaga nem mexe em cadastros.'
            : 'Vê e edita tudo, inclusive apagar. Não gerencia pessoas.'}
        </p>
        {msg && <p className={'msg' + (msg.error ? ' error' : '')} role="alert">{msg.text}</p>}
        <button className="btn primary block">CONVIDAR</button>
      </form>
    </div>
  )
}
