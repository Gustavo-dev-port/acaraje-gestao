import { useState } from 'react'
import { supabase } from './supabase'

export default function Login() {
  const [first, setFirst] = useState(false) // true = primeiro acesso (criar senha)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (first) {
      if (password.length < 8) {
        setBusy(false)
        return setMsg({ text: 'A senha precisa ter pelo menos 8 caracteres.', error: true })
      }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
      if (error) {
        setMsg({ text: /convidado/i.test(error.message) ? 'Este e-mail não foi convidado. Peça ao dono.' : 'Não consegui criar o acesso.', error: true })
      } else if (!data.session) {
        setMsg({ text: 'Quase lá! Abra o e-mail que enviamos e confirme para poder entrar.', error: false })
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setMsg({ text: 'E-mail ou senha incorretos.', error: true })
    }
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand-mark">🍤</div>
        <h1 className="title">Cantinho do Acarajé</h1>
        <p className="muted">{first ? 'Crie sua senha com o e-mail que foi convidado.' : 'Entre para lançar e ver os números do dia.'}</p>
        <div className="stitch" />
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="username" required value={email}
               onChange={(e) => setEmail(e.target.value)} />
        <label className="label" htmlFor="pw">{first ? 'Crie uma senha' : 'Senha'}</label>
        <input id="pw" type="password" autoComplete={first ? 'new-password' : 'current-password'} required value={password}
               onChange={(e) => setPassword(e.target.value)} />
        {msg && <p className={'msg' + (msg.error ? ' error' : '')} role="alert">{msg.text}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Aguarde…' : first ? 'CRIAR ACESSO' : 'ENTRAR'}
        </button>
        <button type="button" className="link" onClick={() => { setFirst(!first); setMsg(null) }}>
          {first ? 'Já tenho acesso' : 'Primeiro acesso'}
        </button>
      </form>
    </div>
  )
}
