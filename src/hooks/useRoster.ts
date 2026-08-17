import { useCallback, useMemo, useState } from 'react'
import type { Counselor } from '@/domain/counselor'
import { buildRoster, type Roster } from '@/lib/roster'
import { repository, type Repository } from '@/lib/repository'

/**
 * T-21 — the live court: seed counselors plus the monarch's own, read through
 * the repository so no screen touches storage itself.
 *
 * The read is synchronous (the store is local), so a screen never renders an
 * empty roster on its first frame and then jumps. Mutations write through and
 * re-read, so what the UI shows is always what is on disk — including any entry
 * the store refused or repaired.
 */
export interface RosterState extends Roster {
  /** Just the custom seats, for the roster page's dismiss controls. */
  custom: readonly Counselor[]
  seat: (counselor: Counselor) => void
  dismiss: (counselorId: string) => void
}

export function useRoster(repo: Repository = repository): RosterState {
  const [custom, setCustom] = useState<readonly Counselor[]>(() =>
    repo.listCustomCounselors(),
  )

  const seat = useCallback(
    (counselor: Counselor) => {
      repo.saveCustomCounselor(counselor)
      setCustom(repo.listCustomCounselors())
    },
    [repo],
  )

  const dismiss = useCallback(
    (counselorId: string) => {
      repo.deleteCustomCounselor(counselorId)
      setCustom(repo.listCustomCounselors())
    },
    [repo],
  )

  const roster = useMemo(() => buildRoster(custom), [custom])

  return { ...roster, custom, seat, dismiss }
}
