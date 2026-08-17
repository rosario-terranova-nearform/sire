import { useState } from 'react'
import { CounselorCard } from '@/components/CounselorCard'
import { CustomCounselorEditor } from '@/components/CustomCounselorEditor'
import { Button } from '@/components/ui/pixelact-ui/button'
import type { Counselor } from '@/domain/counselor'
import { useRoster } from '@/hooks/useRoster'

/**
 * `/court` (§8) — the full roster: the six seed counselors (§4) and every
 * counselor the monarch has invented, each on a full card. This is also the
 * home of the custom counselor editor (§7, T-21).
 *
 * The page owns no storage of its own. It reads and writes the court through
 * `useRoster`, which sits on the repository, so nothing here touches
 * `localStorage`. Invented counselors are validated, sanitised and denylisted
 * before they ever reach this list — that gate lives in the editor's
 * `validateCounselorDraft`, not here.
 *
 * Agendas stay masked on this page. They unlock only once a counselor has been
 * heard enough at audience (§3, T-23); the roster is a place to read who sits at
 * court, not to spoil what they secretly want.
 */
export function Court() {
  const { counselors, custom, seat, dismiss } = useRoster()
  const [editing, setEditing] = useState(false)

  const customIds = new Set(custom.map((counselor) => counselor.id))

  function handleSeat(counselor: Counselor) {
    // The editor keeps showing its confirmation card; seating just commits the
    // counselor to the court so it also appears in the grid below.
    seat(counselor)
  }

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-4 border-ink pb-6">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl">The Court</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Every counselor who may be seated at an audience — the six who came
              with the crown, and any you have invented since.
            </p>
          </div>
          <Button onClick={() => setEditing((open) => !open)}>
            {editing ? 'Close the rolls' : 'Invent a counselor'}
          </Button>
        </header>

        {editing && (
          <CustomCounselorEditor
            existing={counselors}
            onSeat={handleSeat}
            onCancel={() => setEditing(false)}
          />
        )}

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {counselors.map((counselor) => (
            <li key={counselor.id} className="flex flex-col gap-3">
              <CounselorCard counselor={counselor} variant="full" />
              {customIds.has(counselor.id) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => dismiss(counselor.id)}
                >
                  Dismiss from court
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
