import * as React from 'react'
import { Progress as ShadcnProgress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import '@/components/ui/pixelact-ui/styles/styles.css'

// Pixelact UI's registry has no progress component (verified against
// https://www.pixelactui.com/r/registry.json — button/card/input/dialog/badge
// exist, progress does not). This wraps shadcn's own Progress with the same
// pixel-border and stepped-fill treatment used by the rest of the pixelact-ui
// set, so favor bars and vote tallies (T-19, T-23) stay visually consistent.
const Progress = React.forwardRef<
  React.ComponentRef<typeof ShadcnProgress>,
  React.ComponentProps<typeof ShadcnProgress>
>(({ className, ...props }, ref) => {
  return (
    <ShadcnProgress
      ref={ref}
      className={cn(
        'pixel__progress h-4 w-full rounded-none bg-muted shadow-(--pixel-box-shadow) box-shadow-margin [&>div]:rounded-none [&>div]:bg-primary [&>div]:transition-[transform] [&>div]:duration-300 [&>div]:ease-[steps(8)]',
        className,
      )}
      {...props}
    />
  )
})
Progress.displayName = 'PixelProgress'

export { Progress }
