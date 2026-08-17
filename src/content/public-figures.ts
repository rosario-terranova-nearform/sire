/**
 * §9 / decision §11.11 — the public-figure denylist for custom counselors
 * (T-21). Static and hand-maintained by design: no model call, no dataset, no
 * network. "The court is fictional by construction" is a content rule, and this
 * list is how the rule is enforced against a name typed into the editor.
 *
 * What belongs here: living or recently-living real people prominent enough
 * that a court sketch of them reads as a claim about a real person — heads of
 * state and government, religious leaders, the largest tech and business
 * figures, globally famous entertainers and athletes.
 *
 * What does not: historical figures long dead (Caesar, Charlemagne), mythic and
 * fictional names, and anyone private. The point is to stop the app being used
 * to puppet a real, identifiable public person — not to police fantasy names.
 *
 * Two kinds of entry:
 * - Multi-word entries match the whole phrase, so "Lady Charlotte Vance" is
 *   free while "King Charles" is not.
 * - Single-word entries are surnames distinctive enough that no plausible
 *   fantasy counselor wants them. Ambiguous surnames that double as English
 *   words ("musk", "swift", "west") are deliberately listed only in their
 *   full-name form, so the list does not eat legitimate invented names.
 */

export const PUBLIC_FIGURE_DENYLIST: readonly string[] = [
  // --- Heads of state and government ----------------------------------------
  'donald trump',
  'trump',
  'joe biden',
  'biden',
  'kamala harris',
  'barack obama',
  'obama',
  'hillary clinton',
  'jd vance',
  'vladimir putin',
  'putin',
  'volodymyr zelensky',
  'zelenskyy',
  'zelensky',
  'xi jinping',
  'kim jong un',
  'benjamin netanyahu',
  'netanyahu',
  'narendra modi',
  'modi',
  'emmanuel macron',
  'macron',
  'olaf scholz',
  'friedrich merz',
  'giorgia meloni',
  'meloni',
  'pedro sanchez',
  'keir starmer',
  'rishi sunak',
  'boris johnson',
  'mark carney',
  'justin trudeau',
  'trudeau',
  'javier milei',
  'milei',
  'luiz inacio lula da silva',
  'jair bolsonaro',
  'bolsonaro',
  'recep tayyip erdogan',
  'erdogan',
  'viktor orban',
  'orban',
  'mohammed bin salman',
  'ali khamenei',
  'khamenei',
  'benyamin netanyahu',
  'ursula von der leyen',
  'anthony albanese',
  'micheal martin',
  'mary lou mcdonald',
  // --- Monarchy and religious leaders ---------------------------------------
  'king charles',
  'queen elizabeth',
  'prince william',
  'prince harry',
  'princess kate',
  'pope francis',
  'pope leo',
  'the pope',
  'dalai lama',
  // --- Business and technology ----------------------------------------------
  'elon musk',
  'jeff bezos',
  'bezos',
  'mark zuckerberg',
  'zuckerberg',
  'bill gates',
  'warren buffett',
  'sam altman',
  'altman',
  'peter thiel',
  'thiel',
  'satya nadella',
  'nadella',
  'sundar pichai',
  'pichai',
  'tim cook',
  'jensen huang',
  'dario amodei',
  'amodei',
  'larry ellison',
  'rupert murdoch',
  'murdoch',
  // --- Entertainment, media and sport ---------------------------------------
  'taylor swift',
  'beyonce',
  'kanye west',
  'ye west',
  'oprah winfrey',
  'winfrey',
  'jk rowling',
  'j k rowling',
  'rowling',
  'cristiano ronaldo',
  'lionel messi',
  'messi',
  'lebron james',
  'tom brady',
  'joe rogan',
  'rogan',
  'tucker carlson',
  'jordan peterson',
  'andrew tate',
  'greta thunberg',
  'thunberg',
  'mrbeast',
]

/**
 * Fold a typed name to the shape the denylist is authored against: lower-case,
 * unaccented, punctuation dropped, whitespace collapsed. Diacritics and stray
 * punctuation are exactly how "Zelénsky" or "Z.elensky" would slip a naive
 * check, so they are flattened before matching, never after.
 */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The denylisted figure a value names, or null. Matched on whole words so
 * "Marrow" survives "murdoch" and "Wren" survives everything.
 */
export function matchPublicFigure(value: string): string | null {
  const normalized = normalizeName(value)
  if (normalized.length === 0) return null

  const words = normalized.split(' ')
  for (const entry of PUBLIC_FIGURE_DENYLIST) {
    const parts = entry.split(' ')
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((part, offset) => words[i + offset] === part)) {
        return entry
      }
    }
  }
  return null
}
