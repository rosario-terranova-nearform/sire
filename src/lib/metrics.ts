/**
 * A counter bag for things that are worth noticing but never worth crashing
 * over: a model falling through its chain, a counselor caught being
 * sycophantic (§5.4), a malformed tally repaired (§6.4).
 *
 * Counters are process-local and log as they increment, so "the counter is
 * observable in logs" (T-11) holds without any telemetry backend.
 */

export type MetricName =
  /** §5.4 — a deliberation turn failed the anti-sycophancy contract twice. */
  | 'sycophancy_violation'
  /** A model in a faction chain failed and the next one was tried (§6.3). */
  | 'model_fallback'
  /** A per-model 429: waited, then tried the same model once more. */
  | 'rate_limited'
  /** The key's whole free-model quota is spent — no chain can dodge that. */
  | 'free_quota_exhausted'
  /** Every entry in a chain failed — demo mode is next (§7.1). */
  | 'model_chain_exhausted'
  /** Demo mode engaged, either for a missing key or an exhausted chain. */
  | 'demo_mode_engaged'
  /** A stream died after the counselor had already started speaking. */
  | 'stream_error'
  /** An already-handled model failure surfaced as an orphan rejection (§7.1). */
  | 'spent_model_rejection'
  /** A structured payload needed the one-shot repair retry (§6.4). */
  | 'structured_repair'
  /** An entry was dropped from a structured payload after repair (§6.4). */
  | 'structured_entry_dropped'
  /** A seat left without a valid vote/reaction was filled from demo content. */
  | 'structured_entry_filled'

const counts = new Map<MetricName, number>()

export function countMetric(
  name: MetricName,
  detail?: Readonly<Record<string, unknown>>,
): number {
  const next = (counts.get(name) ?? 0) + 1
  counts.set(name, next)

  const label = `[sire:metric] ${name} n=${next}`
  if (detail === undefined) {
    console.warn(label)
  } else {
    console.warn(label, detail)
  }

  return next
}

export function getMetric(name: MetricName): number {
  return counts.get(name) ?? 0
}

export function snapshotMetrics(): Record<string, number> {
  return Object.fromEntries(counts)
}

/** Test seam. Nothing in the app should need to forget a count. */
export function resetMetrics(): void {
  counts.clear()
}
