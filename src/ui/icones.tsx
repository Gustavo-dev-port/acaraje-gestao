import { Beer, CookingPot, House, Megaphone, Package, Receipt, Settings2, SprayCan, Truck, Users, type LucideIcon } from 'lucide-react'
import type { IconeKey } from '@/lib/ctx'
import { cn } from '@/lib/cn'

export const ICONES: Record<IconeKey, LucideIcon> = {
  cozinha: CookingPot, bebidas: Beer, pessoal: Users, contas: House, impostos: Receipt,
  maquinas: Settings2, limpeza: SprayCan, marketing: Megaphone, frete: Truck, outros: Package,
}

export const CORES_FUNDO = ['', 'bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-6']

export function IconeCategoria({ icone, className }: { icone: IconeKey; className?: string }) {
  const I = ICONES[icone] ?? Package
  return <I aria-hidden className={cn('size-7 shrink-0', className)} strokeWidth={2} />
}
