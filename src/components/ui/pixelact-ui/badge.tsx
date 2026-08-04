import { type VariantProps, cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Badge as ShadcnBadge } from '@/components/ui/badge'

const badgeVariants = cva('border-none', {
  variants: {
    font: {
      normal: '',
      pixel: 'pixel-font',
    },
    variant: {
      default: 'bg-primary',
      destructive: 'bg-destructive',
      outline: 'bg-background',
      secondary: 'bg-secondary',
    },
  },
  defaultVariants: {
    // Badges render at text-xs (12px) — below the bitmap face's 16px floor,
    // so they default to the sans face. Pass font="pixel" only where the
    // badge is set at 16px or larger.
    font: 'normal',
    variant: 'default',
  },
})

export interface BadgeProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean
}

function Badge({ children, font, variant, ...props }: BadgeProps) {
  return (
    <div className={cn('relative inline-flex')}>
      <ShadcnBadge
        {...props}
        className={cn(
          'rounded-none shadow-(--pixel-box-shadow) box-shadow-margin',
          badgeVariants({ variant, font }),
        )}
        variant={variant}
      >
        {children}
      </ShadcnBadge>
    </div>
  )
}

export { Badge }
