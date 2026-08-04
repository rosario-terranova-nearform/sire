import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Button as ShadcnButton } from '@/components/ui/button'
import '@/components/ui/pixelact-ui/styles/styles.css'
import './button.css'

const pixelButtonVariants = cva(
  // Button labels carry the bitmap face, so every size floors at text-base (16px) — never smaller.
  'pixel__button pixel-font cursor-pointer rounded-none w-fit items-center justify-center whitespace-nowrap text-base transition-colors transition-all duration-100',
  {
    variants: {
      variant: {
        default:
          'pixel-default__button box-shadow-margin bg-background text-foreground',
        secondary: 'pixel-secondary__button box-shadow-margin',
        warning: 'pixel-warning__button box-shadow-margin',
        success: 'pixel-success__button box-shadow-margin',
        destructive: 'pixel-destructive__button box-shadow-margin',
        link: 'pixel-link__button bg-transparent text-link underline-offset-4 underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface PixelButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof pixelButtonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<
  React.ComponentRef<typeof ShadcnButton>,
  PixelButtonProps
>(({ className, variant, size, ...props }, ref) => {
  return (
    <ShadcnButton
      {...props}
      className={cn(pixelButtonVariants({ variant, size }), className)}
      ref={ref}
    />
  )
})

export { Button }
