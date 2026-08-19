import { useSyncExternalStore } from 'react'
import { DEMO_BANNER_COPY } from '@/content/demo-audience'
import { getDemoState, subscribeDemoMode } from '@/ai/demo-mode'
import { cn } from '@/lib/utils'

const WHY = {
  'missing-api-key':
    'No OpenRouter key is configured, so the counsel below was written in advance.',
  'free-quota-spent':
    "This key's free counsel is spent for the day. The court sits from the record until the quota resets, and no coin has been spent to avoid it.",
  'all-models-failed':
    'Every model the court could reach refused, so the counsel below was written in advance.',
  offline:
    'The court cannot reach the wider world — you appear to be offline. It sits from the record until the connection returns.',
} as const

/**
 * §7.1 — the visible half of demo mode. Renders nothing while the court is
 * live, and says so plainly when it is not. Never a stack trace, never a
 * blank screen.
 */
export function DemoModeBanner({ className }: { className?: string }) {
  const demo = useSyncExternalStore(subscribeDemoMode, getDemoState)

  if (!demo.active) return null

  return (
    <aside
      role="status"
      className={cn(
        'border-4 border-ink bg-accent px-4 py-3 text-accent-foreground',
        className,
      )}
    >
      <p className="font-heading text-lg">{DEMO_BANNER_COPY}</p>
      <p className="mt-1 text-sm">
        {demo.reason === undefined
          ? WHY['all-models-failed']
          : WHY[demo.reason]}
      </p>
    </aside>
  )
}
