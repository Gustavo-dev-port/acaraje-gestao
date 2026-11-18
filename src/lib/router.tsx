import { useEffect, useState, type AnchorHTMLAttributes } from 'react'

// Rotas por "#/caminho": funcionam em qualquer hospedagem estática e o botão voltar do navegador funciona.
const read = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0]

export function usePath() {
  const [path, setPath] = useState(read)
  useEffect(() => {
    const on = () => { setPath(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

export const navigate = (to: string) => { window.location.hash = to }

export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={`#${to}`} {...rest} />
}
