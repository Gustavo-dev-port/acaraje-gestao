import { cn } from '@/lib/cn'

/** Logo provisório (círculo "CA"). Troque pelo logo oficial quando chegar. */
export function Logo({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="Logo do Cantinho do Acarajé"
      className={cn('relative flex shrink-0 items-center justify-center rounded-full bg-laranja font-display font-bold text-white ring-2 ring-mostarda ring-offset-2 ring-offset-transparent', className)}>
      <span className="leading-none" style={{ fontSize: '1.2rem' }}>CA</span>
    </span>
  )
}
