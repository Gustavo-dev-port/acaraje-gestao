import { useState } from 'react'
import { supabase } from '@/supabase'
import { Button } from '@/ui/Button'
import { Logo } from '@/ui/Logo'
import { Aviso, campoCls, Rotulo } from '@/ui/kit'

// Tela mostrada depois que a pessoa abre o link de "esqueci minha senha" recebido por e-mail.
export default function NovaSenha({ onConcluir }: { onConcluir: () => void }) {
  const [senha, setSenha] = useState('')
  const [repete, setRepete] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    if (senha !== repete) return setErro('As duas senhas não são iguais.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setBusy(false)
    if (error) return setErro('Não consegui salvar a senha. Peça um novo link e tente de novo.')
    onConcluir()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Logo className="size-20" />
      <form onSubmit={salvar} className="w-full max-w-[26rem] space-y-5 rounded-cartao border border-border bg-card p-7 shadow-suave" noValidate>
        <h1 className="font-display text-secao font-semibold">Criar nova senha</h1>
        <div className="pesponto" aria-hidden />
        <div>
          <Rotulo htmlFor="ns1">Nova senha</Rotulo>
          <input id="ns1" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={`${campoCls} mt-2`} />
        </div>
        <div>
          <Rotulo htmlFor="ns2">Repita a nova senha</Rotulo>
          <input id="ns2" type="password" autoComplete="new-password" value={repete} onChange={(e) => setRepete(e.target.value)} className={`${campoCls} mt-2`} />
        </div>
        {erro && <Aviso tipo="erro" className="py-3">{erro}</Aviso>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Aguarde…' : 'Salvar nova senha'}</Button>
        <button type="button" className="mx-auto block h-12 text-legenda font-semibold text-primary underline underline-offset-4" onClick={async () => { try { sessionStorage.removeItem('ca-recuperando') } catch { /* sem armazenamento */ } await supabase.auth.signOut(); onConcluir() }}>
          Cancelar e sair
        </button>
      </form>
    </div>
  )
}
