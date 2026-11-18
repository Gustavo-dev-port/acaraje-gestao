import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

// Botões grandes e com texto: 56px o principal, 48px no mínimo para o resto.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-campo font-semibold cursor-pointer transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-6 [&_svg]:shrink-0 active:translate-y-px',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-suave hover:bg-primary/90 active:bg-primary/80',
        destructive: 'bg-destructive text-destructive-foreground shadow-suave hover:bg-destructive/90',
        outline: 'border-2 border-foreground/70 bg-card text-foreground hover:bg-accent hover:border-foreground',
        secondary: 'bg-secondary text-foreground border-2 border-border hover:bg-accent',
        ghost: 'text-foreground hover:bg-accent underline-offset-4',
        link: 'text-primary underline underline-offset-4 hover:text-primary/80 px-1',
        sucesso: 'bg-folha text-primary-foreground shadow-suave hover:bg-folha/90',
      },
      size: {
        default: 'h-12 px-5 text-rotulo',
        lg: 'h-14 px-7 text-botao',
        xl: 'h-16 px-8 text-botao',
        sm: 'h-12 px-4 text-legenda',
        icon: 'h-12 min-w-12 px-3 text-legenda',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />
))
Button.displayName = 'Button'
