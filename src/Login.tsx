import { useState } from 'react'
import { supabase } from '@/supabase'
import { Button } from '@/ui/Button'
import { Logo } from '@/ui/Logo'
import { Aviso, campoCls, Rotulo } from '@/ui/kit'

// dica para o gerenciador de senhas do navegador
const DICA_SENHA = { novo: 'new-password', atual: 'current-password' }

export default function Login() {
  const [primeiro, setPrimeiro] = useState(false) // primeiro acesso: criar a senha
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ texto: string; tipo: 'erro' | 'ok' } | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (primeiro) {
      if (senha.length < 8) {
        setBusy(false)
        return setMsg({ texto: 'A senha precisa ter pelo menos 8 caracteres.', tipo: 'erro' })
      }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha })
      if (error) setMsg({ texto: /convidado/i.test(error.message) ? 'Este e-mail não foi convidado. Peça ao dono.' : 'Não consegui criar o acesso.', tipo: 'erro' })
      else if (!data.session) setMsg({ texto: 'Quase lá! Abra o e-mail que enviamos e confirme para poder entrar.', tipo: 'ok' })
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) setMsg({ texto: 'E-mail ou senha incorretos.', tipo: 'erro' })
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo className="size-20" />
        <p className="font-script text-5xl leading-none text-laranja">Cantinho do Acarajé</p>
        <p className="text-corpo text-muted-foreground">Gestão do bar, no celular e no computador.</p>
      </div>
      <form onSubmit={enviar} className="w-full max-w-[26rem] space-y-5 rounded-cartao border border-border bg-card p-7 shadow-suave" noValidate>
        <h1 className="font-display text-secao font-semibold">{primeiro ? 'Primeiro acesso' : 'Entrar'}</h1>
        <div className="pesponto" aria-hidden />
        {primeiro && <p className="text-legenda text-muted-foreground">Use o e-mail que o dono convidou e crie uma senha.</p>}
        <div>
          <Rotulo htmlFor="email">E-mail</Rotulo>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${campoCls} mt-2`} />
        </div>
        <div>
          <Rotulo htmlFor="senha">{primeiro ? 'Crie uma senha' : 'Senha'}</Rotulo>
          <input id="senha" type="password" autoComplete={DICA_SENHA[primeiro ? 'novo' : 'atual']} required value={senha} onChange={(e) => setSenha(e.target.value)} className={`${campoCls} mt-2`} />
        </div>
        {msg && <Aviso tipo={msg.tipo === 'erro' ? 'erro' : 'ok'} className="py-3">{msg.texto}</Aviso>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Aguarde…' : primeiro ? 'Criar acesso' : 'Entrar'}</Button>
        <button type="button" className="mx-auto block h-12 text-legenda font-semibold text-primary underline underline-offset-4" onClick={() => { setPrimeiro(!primeiro); setMsg(null) }}>
          {primeiro ? 'Já tenho acesso' : 'Primeiro acesso'}
        </button>
      </form>
    </div>
  )
}
