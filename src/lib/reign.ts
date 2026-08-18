import type { Audience, Reaction } from '@/domain/audience'
import type { Counselor } from '@/domain/counselor'
import type { Reign } from '@/domain/reign'
import {
  AGENDA_REVEAL_AT,
  FAVOR_ABSENT_AT,
  FAVOR_GENEROUS_AT,
  FAVOR_TERSE_AT,
  MAX_FAVOR,
  MAX_HISTORY,
  MIN_FAVOR,
} from '@/domain/reign'

/**
 * A fresh, empty reign for a chamber to run against.
 *
 * The permanent, favor-accumulating, `localStorage`-backed reign is T-21; until
 * then the chamber (T-17/T-18) still needs *a* `Reign` to feed the prompt
 * builder, which reads `monarchName` and injects favor and decree memory. An
 * empty reign is legal input — no favor, no history — so the court sits without
 * waiting on a persistence layer that has not been built.
 */

/** Placeholder regnal name until the throne room (§8) captures a real one. */
export const DEFAULT_MONARCH_NAME = 'the Sovereign'

export function createDefaultReign(
  monarchName: string = DEFAULT_MONARCH_NAME,
): Reign {
  return {
    id: crypto.randomUUID(),
    monarchName,
    favor: {},
    heardCount: {},
    revealedAgendas: [],
    history: [],
    createdAt: new Date().toISOString(),
  }
}

/**
 * §5.7 — apply an aftermath's favor deltas to the reign. Every delta is folded
 * onto the counselor's standing and clamped to the `-10 … +10` band the domain
 * promises. Pure: the caller decides when to persist the result (T-20).
 */
export function applyReactions(reign: Reign, reactions: readonly Reaction[]): Reign {
  if (reactions.length === 0) return reign

  const favor = { ...reign.favor }
  for (const reaction of reactions) {
    const next = (favor[reaction.counselorId] ?? 0) + reaction.favorDelta
    favor[reaction.counselorId] = Math.max(MIN_FAVOR, Math.min(MAX_FAVOR, next))
  }

  return { ...reign, favor }
}

/**
 * §5.7 — how far a counselor's standing has bent their counsel.
 *
 * - `terse`    at favor ≤ -5: petitions come grudging and thin.
 * - `absent`   at favor ≤ -8: they refuse to attend; the seat sits empty.
 * - `generous` at favor ≥ +7: they volunteer an extra line.
 * - `normal`   otherwise.
 *
 * The fool's `licensed-tongue` (§4, decision §11.6) is exempt from all three:
 * he is never terse, never absent, and never silenced — nor is he made
 * generous by high favor. His posture is always `normal`.
 */
export type FavorPosture = 'normal' | 'terse' | 'absent' | 'generous'

export function favorPosture(counselor: Counselor, reign: Reign): FavorPosture {
  if (counselor.ability.effect.kind === 'licensed-tongue') return 'normal'

  const favor = reign.favor[counselor.id] ?? 0
  if (favor <= FAVOR_ABSENT_AT) return 'absent'
  if (favor <= FAVOR_TERSE_AT) return 'terse'
  if (favor >= FAVOR_GENEROUS_AT) return 'generous'
  return 'normal'
}

/** Whether a counselor is too far out of favor to attend at all (§5.7). */
export function refusesToAttend(counselor: Counselor, reign: Reign): boolean {
  return favorPosture(counselor, reign) === 'absent'
}

/**
 * The counselors who actually put words on the record this audience — a
 * non-empty petition or a floor turn. A held tongue or an empty seat does not
 * count as having been "heard" (§3), so it does not move `heardCount`.
 */
export function spokenInAudience(audience: Audience): string[] {
  const spoken = new Set<string>()
  for (const petition of audience.petitions) {
    if (petition.text.trim().length > 0) spoken.add(petition.counselorId)
  }
  for (const exchange of audience.deliberation) {
    if (exchange.text.trim().length > 0) spoken.add(exchange.counselorId)
  }
  return [...spoken]
}

/** What a completed audience does to the reign, and what it unmasks. */
export interface AudienceCommit {
  reign: Reign
  /** Agendas that crossed the reveal threshold *in this audience* — the ones
   *  the aftermath should flip open (§3, T-23). */
  newlyRevealed: string[]
}

/**
 * §3 / §5.7 / T-23 — fold a finished audience into the reign, in one pure step:
 *
 * 1. Favor deltas from the aftermath are applied and clamped (as `applyReactions`).
 * 2. Every counselor who spoke has their `heardCount` incremented, and any who
 *    reach `AGENDA_REVEAL_AT` have their agenda revealed — `newlyRevealed` names
 *    those that unmasked on this pass, so the UI can animate exactly them.
 * 3. The decree is appended to the last-N decree memory carried into later
 *    prompts (§3, §6.1).
 *
 * Pure: the caller decides when to persist the result and save the audience.
 */
export function commitAudience(
  reign: Reign,
  audience: Audience,
  reactions: readonly Reaction[],
): AudienceCommit {
  const withFavor = applyReactions(reign, reactions)

  const heardCount = { ...withFavor.heardCount }
  const revealed = new Set(withFavor.revealedAgendas)
  const newlyRevealed: string[] = []

  for (const id of spokenInAudience(audience)) {
    const next = (heardCount[id] ?? 0) + 1
    heardCount[id] = next
    if (next >= AGENDA_REVEAL_AT && !revealed.has(id)) {
      revealed.add(id)
      newlyRevealed.push(id)
    }
  }

  const history =
    audience.decree === undefined
      ? withFavor.history
      : [
          ...withFavor.history,
          {
            question: audience.question,
            decree: audience.decree.text,
            at: audience.decree.issuedAt,
          },
        ].slice(-MAX_HISTORY)

  return {
    reign: {
      ...withFavor,
      heardCount,
      revealedAgendas: [...revealed],
      history,
    },
    newlyRevealed,
  }
}
