import type { Counselor, Faction } from '@/domain/counselor'

/**
 * §5.2 / §8 / T-16 — faction-clash hints. These never block a legal seating;
 * they *celebrate* it. SIRE's whole defence against persona collapse (§1.1) is
 * seating conflicting interests, so a clash is the good outcome — the hint says
 * so out loud ("the Marshal and the Keeper will not agree — good").
 *
 * A clash is keyed by an unordered pair of factions. `line` receives the two
 * seated counselors' titles in the order the pair is declared, so the copy
 * reads naturally whoever fills the roles (a custom counselor of the same
 * faction, T-21, still lands the right line).
 */
export interface FactionClash {
  /** Unordered pair; `line` is passed the titles in this order. */
  pair: readonly [Faction, Faction]
  line: (titleA: string, titleB: string) => string
}

export const FACTION_CLASHES: readonly FactionClash[] = [
  {
    pair: ['martial', 'coin'],
    line: (marshal, keeper) =>
      `${marshal} wants the war; ${keeper} cannot fund it. They will not agree — good.`,
  },
  {
    pair: ['martial', 'commons'],
    line: (marshal, commons) =>
      `${marshal} spends the lives ${commons} must live. Let them argue — good.`,
  },
  {
    pair: ['martial', 'temple'],
    line: (marshal, temple) =>
      `${marshal} calls it victory; ${temple} calls it sin. Sparks, sire — good.`,
  },
  {
    pair: ['coin', 'commons'],
    line: (keeper, commons) =>
      `${keeper} saves coin that never reaches ${commons}. They will clash — good.`,
  },
  {
    pair: ['temple', 'fool'],
    line: (temple, fool) =>
      `${temple} guards your soul while ${fool} makes sport of it — good.`,
  },
  {
    pair: ['whispers', 'martial'],
    line: (whispers, marshal) =>
      `${whispers} knows what ${marshal}'s war will really cost. Let it out — good.`,
  },
]

/**
 * Every clash active for a seated council, as ready-to-render copy. A pair
 * fires only when both its factions are at the table; the first seated
 * counselor of each faction supplies the title.
 */
export function clashHints(seated: readonly Counselor[]): string[] {
  const byFaction = new Map<Faction, Counselor>()
  for (const counselor of seated) {
    if (!byFaction.has(counselor.faction)) byFaction.set(counselor.faction, counselor)
  }

  const hints: string[] = []
  for (const clash of FACTION_CLASHES) {
    const [factionA, factionB] = clash.pair
    const a = byFaction.get(factionA)
    const b = byFaction.get(factionB)
    if (a === undefined || b === undefined) continue
    hints.push(clash.line(a.title, b.title))
  }
  return hints
}
