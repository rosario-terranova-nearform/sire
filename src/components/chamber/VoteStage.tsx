import { Sprite } from '@/components/Sprite'
import type { Tally } from '@/ai/sanitize'
import type { Vote } from '@/domain/audience'
import type { CounselorRoster } from '@/domain/counselor'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { cn } from '@/lib/utils'

/**
 * §5.5 / §8.1 (4) / T-19 — the tally strip. Each seated counselor shows the
 * votes they drew as pips, and every voter's rationale is read out. The strip
 * is framed, in the UI, as the council's *preference* and not the answer — the
 * decree is the monarch's. A tie is a hung council, shown as such and never
 * broken by a coin flip.
 */
export interface VoteStageProps {
  votes: readonly Vote[]
  tally: Tally | null
  seated: readonly string[]
  roster?: CounselorRoster
  /** The clerk is still counting — show the wait, not an empty strip. */
  loading?: boolean
}

export function VoteStage({
  votes,
  tally,
  seated,
  roster = COUNSELORS_BY_ID,
  loading = false,
}: VoteStageProps) {
  return (
    <section aria-label="The vote" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl">The tally</h2>
        <p className="text-sm italic text-muted-foreground">
          The council&rsquo;s preference, not the answer.
        </p>
      </div>

      {loading || tally === null ? (
        <p className="text-sm italic text-muted-foreground" role="status">
          The clerk counts the hands…
        </p>
      ) : (
        <>
          {tally.hung ? (
            <p
              role="status"
              className="border-4 border-wax bg-card px-4 py-3 font-heading text-lg text-wax"
            >
              A hung council. No preference carries, sire &mdash; the decision is
              yours alone.
            </p>
          ) : (
            <p className="text-base">
              The council leans toward{' '}
              <span className="font-heading text-foreground">
                {tally.leaders.map((id) => roster[id]?.name ?? id).join(' and ')}
              </span>
              .
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {seated.map((id) => {
              const counselor = roster[id]
              if (counselor === undefined) return null
              const count = tally.counts[id] ?? 0
              const isLeader = !tally.hung && tally.leaders.includes(id)
              return (
                <li key={id} className="flex items-center gap-3">
                  <Sprite
                    counselorId={id}
                    name={counselor.name}
                    state="neutral"
                    scale={2}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-sm">
                      {counselor.name}
                      {isLeader && (
                        <span className="ml-2 text-xs uppercase tracking-wide text-gold">
                          leads
                        </span>
                      )}
                    </p>
                    <div
                      className="mt-1 flex gap-1"
                      role="img"
                      aria-label={`${count} ${count === 1 ? 'vote' : 'votes'}`}
                    >
                      {seated.map((_, pip) => (
                        <span
                          key={pip}
                          aria-hidden="true"
                          className={cn(
                            'size-3 border-2 border-ink',
                            pip < count ? 'bg-gold' : 'bg-transparent',
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <ol className="flex flex-col gap-2 border-t-2 border-stone pt-4">
            {votes.map((vote) => (
              <li key={vote.voterId} className="text-sm">
                <span className="font-heading">
                  {roster[vote.voterId]?.name ?? vote.voterId}
                </span>{' '}
                backs{' '}
                <span className="text-wax">
                  {roster[vote.forId]?.name ?? vote.forId}
                </span>{' '}
                &mdash;{' '}
                <span className="italic text-muted-foreground">
                  &ldquo;{vote.rationale}&rdquo;
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
