# SIRE — Technical Specification

> You are the king. They are your counselors. Only you decide.

> SIRE = Speak, I Rule Eventually

**Version:** 0.1 (pre-implementation)
**Status:** Draft for spec-driven development
**Last updated:** 2026-08-03

---

## 1. Product overview

SIRE is a single-player web app dressed as a medieval royal audience. The user is the monarch. They pose a question to a hand-picked council of AI counselors, each with a distinct role, self-interest, and voice. The counselors petition, argue with each other, vote — and then the user issues the final decree. The counselors react to the ruling.

The output is not "an answer." It is a **transcript of disagreement** plus the user's own ruling — a scene, screenshot-able, that also happens to have mapped the real trade-offs of the question.

### 1.1 Why this shape

The obvious failure mode for a multi-persona LLM app is **persona collapse**: all personas share one base model, so "the critic" and "the optimist" differ in tone while saying the same thing. SIRE defends against this in three ways:

1. **Roles with conflicting interests, not conflicting personalities.** The General wants the war; the Treasurer cannot fund it; the Priest calls it sin; the Peasant dies in it. Disagreement is structural, so it survives a weak prompt.
2. **Model diversity.** Each faction is mapped to a _different_ OpenRouter model where availability permits. Different weights produce genuinely uncorrelated opinions rather than one model wearing hats.
3. **Independent written positions before any discussion.** Petitions are generated in parallel, with no counselor seeing another's text. This prevents anchoring — the first speaker cannot set the frame for everyone.

### 1.2 Design pillars

| Pillar                 | Meaning                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Spectacle over utility | This is a game first. If a choice makes it funnier or more dramatic, it wins over a choice that makes it marginally more accurate. |
| The user rules         | The app never gives a final answer. It presents counsel; the decree is always the user's.                                          |
| Brevity is the joke    | Counselors speak in 2–4 sentences. Long output kills the pacing and turns the game into homework.                                  |
| Latency is theater     | Counselors "enter the chamber" and speak in turn. Waiting is staged, not apologised for.                                           |
| Consequences persist   | Favor, memory of past decrees, and revealed agendas turn a toy into a game worth reopening.                                        |

### 1.3 Non-goals (v1)

- No accounts, no auth, no server-side database.
- No multiplayer / shared courts.
- No factual-accuracy guarantees. SIRE is explicitly framed as entertainment.
- No audio/music (deferred to v1.1).
- No mobile-native app; responsive web only.

---

## 2. Tech stack

| Concern          | Choice                                                         | Notes                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | Next.js 15+ (App Router)                                       | React Server Components for static shell, route handlers for AI streaming.                                                                                                   |
| Language         | TypeScript, `strict: true`                                     | No `any` in domain code. Zod schemas are the source of truth for AI output.                                                                                                  |
| Styling          | Tailwind CSS v4                                                | Theme tokens as CSS custom properties.                                                                                                                                       |
| Components       | [Pixelact UI](https://www.pixelactui.com/) on top of shadcn/ui | Installed per-component via the shadcn registry, so components live in the repo and are editable. Requires shadcn/ui initialised first.                                      |
| Animation        | `motion` (Framer Motion)                                       | Pixelact UI already depends on Framer Motion — do not add a second animation library. Use `AnimatePresence` for chamber entrances, `steps()`-style timing for sprite frames. |
| AI orchestration | Vercel AI SDK (`ai`)                                           | `streamText` for petitions/deliberation, `generateObject` for votes and reactions.                                                                                           |
| Model gateway    | OpenRouter via `@openrouter/ai-sdk-provider`                   | Free-tier models. `openrouter/free` as the fallback alias.                                                                                                                   |
| Persistence      | `localStorage` via a typed repository module                   | Swappable interface so a DB can be added later without touching UI.                                                                                                          |
| Deployment       | Vercel                                                         | Route handlers run on the Node runtime (needed for longer streaming).                                                                                                        |
| Testing          | Vitest (unit)                                                  |                                                                                                                                                                              |

### 2.1 Pixel-art constraints

- Fixed pixel grid: all sprites authored at 32×32, rendered at integer scales only (×2, ×3, ×4). Never fractional.
- Global CSS: `image-rendering: pixelated` on all sprite elements.
- Type: one bitmap display face for headings/counselor names, one legible sans for body copy. Pixel fonts below 16px are unreadable — body text is **not** a pixel font.
- No anti-aliased shadows, no CSS `blur`, no gradients. Depth comes from dithering patterns baked into sprites.

---

## 3. Domain model

All types live in `src/domain/`. This is the contract every other layer depends on.

```ts
// src/domain/counselor.ts

export type Faction =
  | "martial" // war, action, decisive force
  | "coin" // cost, budget, solvency
  | "fool" // truth via mockery
  | "temple" // conscience, principle
  | "whispers" // second-order consequences, politics
  | "commons"; // who actually bears the cost

export type StatKey = "candor" | "prudence" | "guile";

/** 1–5, rendered as pips on the card. Purely cosmetic EXCEPT where an
 *  ability references a stat. Do not use stats to weight the prompt. */
export type Stats = Record<StatKey, 1 | 2 | 3 | 4 | 5>;

export type AbilityEffect =
  | { kind: "speaks-last" } // Wren
  | { kind: "immune-to-exile" } // Grin
  | { kind: "must-quantify" } // Marrow: every claim gets a number
  | { kind: "must-cite-precedent" } // Vell
  | { kind: "reveals-hidden-cost" } // Wren, Hob
  | { kind: "plain-speech" } // Hob: banned from abstraction
  | { kind: "reframes-as-campaign" }; // Vane

export interface Ability {
  name: string;
  /** Card copy, ≤ 90 chars. */
  description: string;
  /** Mechanical hook consumed by the prompt builder and the stage engine. */
  effect: AbilityEffect;
}

export interface Voice {
  /** e.g. "clipped military imperatives, no hedging" */
  register: string;
  /** Recurring verbal habits, 2–4 items. */
  tics: string[];
  /** 2–3 few-shot lines. Critical for voice distinctness. */
  sampleLines: string[];
}

export type SpriteState = "neutral" | "pleased" | "appalled" | "scheming";

export interface Counselor {
  id: string;
  name: string;
  /** e.g. "Mistress of Coin" */
  title: string;
  faction: Faction;
  stats: Stats;
  ability: Ability;
  /** What they actually want, independent of the user's question.
   *  Hidden in the UI until `Reign.revealedAgendas` includes this id. */
  agenda: string;
  voice: Voice;
  /** One-line motive summary injected into other counselors' context
   *  during deliberation, so they can attack each other's interests. */
  publicStance: string;
  sprite: {
    sheet: string; // /sprites/vane.png
    frames: Record<SpriteState, number>;
  };
  isCustom: boolean;
}
```

```ts
// src/domain/audience.ts

export type Stage =
  | "composing" // user writing the question
  | "seating" // user picking the council
  | "petition" // parallel independent opinions
  | "deliberation" // sequential argument
  | "vote" // counselors vote
  | "decree" // user rules
  | "aftermath"; // counselors react

export interface Petition {
  counselorId: string;
  text: string;
  /** true once the stream for this counselor has closed */
  complete: boolean;
}

export interface Exchange {
  counselorId: string;
  /** Who they are rebutting. Enforced non-null by the prompt. */
  targetId: string;
  text: string;
  order: number;
}

export interface Vote {
  voterId: string;
  /** Never equal to voterId — enforced in schema validation. */
  forId: string;
  /** ≤ 20 words. */
  rationale: string;
}

export interface Decree {
  /** The user's own words. Free text, 1–400 chars. */
  text: string;
  /** Optional: which counselor the user says they sided with. */
  sidedWithId?: string;
  issuedAt: string;
}

export interface Reaction {
  counselorId: string;
  mood: SpriteState;
  /** ≤ 15 words. */
  line: string;
  /** -2 … +2, applied to Reign.favor */
  favorDelta: number;
}

export interface Audience {
  id: string;
  question: string;
  seated: string[]; // 3–5 counselor ids
  stage: Stage;
  petitions: Petition[];
  deliberation: Exchange[];
  votes: Vote[];
  decree?: Decree;
  reactions: Reaction[];
  createdAt: string;
}
```

```ts
// src/domain/reign.ts

export interface Reign {
  id: string;
  /** User-chosen regnal name, e.g. "Rosario the Unbothered" */
  monarchName: string;
  /** counselorId -> favor, clamped -10 … +10 */
  favor: Record<string, number>;
  /** counselorId -> how many times they have spoken across all audiences */
  heardCount: Record<string, number>;
  /** Agendas unlocked at heardCount >= 3 */
  revealedAgendas: string[];
  /** Last 10 decrees, injected as memory into later prompts. */
  history: Array<{ question: string; decree: string; at: string }>;
  exiled: string[];
  createdAt: string;
}
```

---

## 4. The council (seed content)

Six core counselors ship in v1. The user seats **3–5 per audience** — this cap is both a cost control and the game's first strategic decision.

| id       | Name              | Title                | Faction  | Candor / Prudence / Guile | Ability                                                                     | Agenda                                             |
| -------- | ----------------- | -------------------- | -------- | ------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `vane`   | Lord Marshal Vane | Marshal of the Host  | martial  | 4 / 1 / 2                 | **Call to arms** — recasts any question as a campaign to be won             | Glory, and a larger army                           |
| `marrow` | Keeper Marrow     | Mistress of Coin     | coin     | 2 / 5 / 3                 | **The ledger speaks** — puts a price on everything, including the priceless | A full vault, whatever the cost in glory           |
| `grin`   | Grin              | The King's Fool      | fool     | 5 / 1 / 4                 | **Licensed tongue** — may say the unsayable; cannot be exiled               | To make you laugh, then flinch                     |
| `verity` | Mother Verity     | Voice of the Temple  | temple   | 3 / 4 / 1                 | **Weight of sin** — judges by conscience, never by outcome                  | Your soul, and the temple's reach                  |
| `wren`   | Wren              | Mistress of Whispers | whispers | 1 / 4 / 5                 | **What I know** — always speaks last, reveals a consequence others missed   | Leverage. She has a file on everyone, you included |
| `hob`    | Old Hob           | Of the Commons       | commons  | 4 / 3 / 1                 | **Plain speech** — the only one who will live with your decree              | To survive the winter                              |

**Bench (v1.1 unlockables, defined but not seeded):** Archivist Vell (precedent), the Court Physician, the Foreign Envoy, the Queen Mother, and the Dragon (costs 10 favor to seat, speaks one line per reign).

### 4.1 Content rules for authoring a counselor

- `publicStance` must state an _interest_, not a temperament. "Wants the treasury intact" — not "is cautious."
- No two seated counselors may share a faction.
- `sampleLines` must be mutually unmistakable. If you can swap two counselors' sample lines without noticing, the roster is broken.
- Agendas must be able to conflict with the user's own interest. A counselor who only wants what's best for you is dead weight.

---

## 5. Stage engine

`src/engine/audience-machine.ts` — a pure reducer. No fetches, no React. Fully unit-testable.

```
composing → seating → petition → deliberation → vote → decree → aftermath
```

### 5.1 Petition (parallel, independent)

- Client fires **one request per seated counselor, in parallel**, to `POST /api/counsel`.
- Each response streams into its own card. Cards fill at different rates — this is desirable, it looks like a real room.
- **No counselor receives any other counselor's text.** This is the anchoring firewall and must be asserted in tests.
- Length cap: 2–4 sentences, hard `maxOutputTokens` ceiling.
- `speaks-last` has no effect in this stage (nobody hears anyone).

### 5.2 Deliberation (sequential, adversarial)

- Speaking order: shuffled, except `speaks-last` counselors are moved to the end.
- Each counselor receives: the question, **all** petitions, the deliberation so far, and the `publicStance` of every other seated counselor.
- Each turn streams one at a time. The UI reveals turns as they arrive.
- **Anti-sycophancy contract**, enforced in the prompt and validated post-hoc:
  - Must name exactly one other counselor and dispute them by name (`targetId` is non-null).
  - May not agree without naming a concrete cost of the position they are conceding to.
  - Banned phrases: "I agree", "building on that", "excellent point", "you raise a fair point".
  - If validation fails, retry once with a stricter reminder; on second failure, keep the output but log a `sycophancy_violation` metric.
- One round only in v1. Two rounds is a v1.1 setting.

### 5.3 Vote

- Single `generateObject` call with a Zod schema returning all votes at once (cheaper and avoids n more round-trips).
- Constraints: no self-votes; every seated counselor casts exactly one; rationale ≤ 20 words.
- Ties are **not** resolved. A tie is displayed as a hung council — which is a better dramatic beat than a coin flip.
- The vote is explicitly framed in the UI as _"the council's preference, not the answer."_

### 5.4 Decree (the user)

- Free-text input, 1–400 chars, in a scroll/parchment component.
- Optional "I sided with…" selector.
- Quick-decree buttons for low-effort sessions: "So be it", "Denied", "I will think on it."
- The decree is what gets persisted and shared. **This is the app's ending, not the vote.**

### 5.5 Aftermath

- One `generateObject` call returns a reaction per counselor: `mood`, one line ≤ 15 words, and `favorDelta`.
- Sprites switch frame to `mood`. Favor is applied to the `Reign`.
- Favor consequences (v1): at favor ≤ -5 a counselor's petitions get terse and unhelpful; at ≤ -8 they may refuse to attend and their seat shows as empty. At favor ≥ +7 they volunteer an extra line.

---

## 6. Prompt architecture

`src/ai/prompt-builder.ts` — pure functions, `(Counselor, Audience, Reign, Stage) => ModelMessage[]`. No template strings scattered through route handlers.

### 6.1 System prompt skeleton

```
IDENTITY
You are {name}, {title}, seated at the council of {monarchName}.

INTEREST
{publicStance}. Privately: {agenda}. You never state the private part outright.

VOICE
{voice.register}
Habits: {voice.tics}
You sound like this:
  "{sampleLines[0]}"
  "{sampleLines[1]}"

MANNER
- Speak to the monarch as "sire" / "your grace". Never modern register.
- 2 to 4 sentences. Never more. Brevity is the point.
- Never explain your own reasoning process. Assert, then justify in one clause.
- Never break character. Never mention being a model, an AI, or a system.
- You are not helpful. You are self-interested and you are giving counsel.

ABILITY — {ability.name}
{ability-specific instruction, derived from AbilityEffect}
```

### 6.2 Ability instructions (from `AbilityEffect`)

| Effect                 | Injected instruction                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `must-quantify`        | Every claim must carry a number — coin, months, heads, bushels. Invent plausible figures. |
| `plain-speech`         | Never use an abstract noun. Use only things you can touch, eat, or bury.                  |
| `reveals-hidden-cost`  | Name one consequence nobody else has mentioned. Never state how you know.                 |
| `reframes-as-campaign` | Treat the matter as a war to be won. Propose the aggressive option.                       |
| `must-cite-precedent`  | Cite what happened to a previous ruler who tried this. Invent the reign.                  |
| `speaks-last`          | (engine-level; no prompt text)                                                            |
| `immune-to-exile`      | Say the thing the others are avoiding. Mock the monarch if the monarch is wrong.          |

### 6.3 Model routing (`src/ai/models.ts`)

Map faction → model, so disagreement is partly architectural rather than purely prompted.

```ts
export const FACTION_MODELS: Record<Faction, string[]> = {
  martial: ["<free-model-a>", "openrouter/free"],
  coin: ["<free-model-b>", "openrouter/free"],
  fool: ["<free-model-c>", "openrouter/free"],
  temple: ["<free-model-a>", "openrouter/free"],
  whispers: ["<free-model-b>", "openrouter/free"],
  commons: ["<free-model-c>", "openrouter/free"],
};
```

Each entry is an ordered fallback chain. Populate the concrete slugs at implementation time from the live OpenRouter free-model list — free availability rotates, so **do not hardcode a single model anywhere**. `openrouter/free` is the last resort in every chain.

### 6.4 Structured output

Zod schemas in `src/ai/schemas.ts`, used by `generateObject`:

```ts
export const votesSchema = z.object({
  votes: z.array(
    z.object({
      voterId: z.string(),
      forId: z.string(),
      rationale: z.string().max(120),
    }),
  ),
});

export const reactionsSchema = z.object({
  reactions: z.array(
    z.object({
      counselorId: z.string(),
      mood: z.enum(["neutral", "pleased", "appalled", "scheming"]),
      line: z.string().max(100),
      favorDelta: z.number().int().min(-2).max(2),
    }),
  ),
});
```

Post-validate business rules the schema can't express (no self-votes, all seated present, ids in `seated`). On violation: one repair retry, then drop the offending entry rather than failing the stage.

---

## 7. API surface

All route handlers in `src/app/api/`, Node runtime, `maxDuration = 60`.

| Route                | Method | Body                                                                    | Returns                                                                        |
| -------------------- | ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/api/counsel`       | POST   | `{ counselorId, phase: 'petition' \| 'deliberation', audience, reign }` | `text/event-stream` — a single counselor's speech                              |
| `/api/vote`          | POST   | `{ audience, reign }`                                                   | JSON `{ votes: Vote[] }`                                                       |
| `/api/aftermath`     | POST   | `{ audience, reign }`                                                   | JSON `{ reactions: Reaction[] }`                                               |
| `/api/models/health` | GET    | —                                                                       | Which fallback models are currently reachable (used to pick chains at runtime) |

**Trust boundary:** the client sends game state, so the server must never trust it blindly. Validate every request body with Zod, cap `seated.length` at 5, cap `question.length` at 300, and re-derive counselor definitions **server-side from the seed data by id** — never accept a client-supplied `systemPrompt` or counselor object. Custom counselors are the one exception and get their own hardened path (see T-21).

### 7.1 Rate limiting and cost

- API key lives server-side only (`OPENROUTER_API_KEY`). Never shipped to the client.
- Per-IP limit: 10 audiences/hour, 60 counsel calls/hour, via an in-memory token bucket (`@upstash/ratelimit` if a KV store is added later).
- Optional BYOK: user may paste their own OpenRouter key, held in `sessionStorage`, forwarded per-request and never persisted server-side. BYOK bypasses the IP limit.
- Concurrency cap of 5 in-flight model calls per session — matches the max council size exactly.
- **Demo mode:** if the key is missing or all fallbacks fail, serve a canned transcript from `src/content/demo-audience.ts` with a visible "the court is a recording today" banner. The app must never show a raw error page.

---

## 8. Screens

| Screen             | Route            | Contents                                                                              |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------- |
| Throne room (home) | `/`              | Regnal name entry, "hold an audience" CTA, current favor summary, last decree         |
| Seating            | `/audience/new`  | Counselor card grid, 3–5 selection with faction-clash warnings, seat/unseat animation |
| Chamber            | `/audience/[id]` | The whole four-stage flow in one continuous scrolling scene                           |
| Chronicle          | `/chronicle`     | Past audiences, decrees, favor chart, revealed agendas                                |
| Court roster       | `/court`         | All counselors, full cards, custom counselor editor                                   |

### 8.1 Chamber layout

A single vertical scene, not tabs. Stages append downward and auto-scroll:

1. The question, as a heading on a parchment banner.
2. Petition row — one card per counselor, sprites at the top, text streaming in below. Cards animate in with a staggered `AnimatePresence` entrance ("enters the chamber").
3. Deliberation — a transcript log. Each entry shows the speaker's sprite at 32px, the name, and an arrow to whom they're rebutting.
4. Vote — a tally strip with pips per counselor. Hung councils get a distinct treatment.
5. Decree — parchment input, sealed with a wax-stamp button.
6. Aftermath — sprites flip to their reaction mood; one line each; favor deltas float up.
7. Share — renders the scene to a PNG via canvas.

### 8.2 Counselor card component

The card is the app's signature object and gets its own reusable component (`<CounselorCard>`) with three variants: `compact` (seating grid), `speaking` (petition stage, with streaming text), `full` (roster page).

Contents: pixel portrait, name, title, faction badge, three stat pip rows, ability name + description, agenda (or `AGENDA: ???` when unrevealed), favor indicator.

---

## 9. Content safety

Non-negotiable, because people will bring real dilemmas to a fantasy court.

- **Crisis interrupt.** Before any generation, the question is screened for self-harm, suicide, abuse, and medical emergency signals. On a hit, the theater stops: the chamber shows a plain (non-pixel, non-jokey) card — "The court is adjourned." — with real support resources, and no counselor speaks. This check runs server-side and cannot be bypassed by the client.
- **The fool has limits.** Grin's `immune-to-exile` license extends to mocking the monarch's _reasoning_, never their identity, body, or worth. Explicit prompt boundary.
- **Framing.** A persistent, quiet footer: "Counsel from a court of fictional advisors. Entertainment, not advice." Present on every screen, not hidden in an about page.
- **No real people.** Custom counselors are name-checked against a public-figure denylist; the court is fictional by construction.

---

## 10. Verification strategy

The single biggest technical risk is persona collapse, so it gets a real test, not a vibe check.

`scripts/eval-distinctness.ts` runs a fixed battery of 10 questions through a full council and reports:

- **Lexical overlap** — pairwise Jaccard similarity of content words between counselors' petitions. Flag any pair > 0.35.
- **Blind attribution** — feed each petition to a judge model without labels and ask which counselor said it. Target ≥ 80% correct attribution.
- **Stance divergence** — did at least two counselors recommend materially opposed actions? Target: ≥ 8 of 10 questions.
- **Sycophancy rate** — share of deliberation turns that failed the anti-sycophancy contract. Target < 10%.

These four numbers are the project's health dashboard. A refactor that improves the UI but pushes attribution below 80% is a regression.

---

## 11. Task list

Tasks are ordered by dependency. Each is scoped to be independently implementable and verifiable — suitable for one spec-driven-dev iteration.

### Phase 0 — Foundation

**T-01 · Scaffold the project**
Create a Next.js 15 App Router project with TypeScript `strict`, Tailwind v4, ESLint, Prettier, and Vitest. Set up `src/` with `app/`, `domain/`, `engine/`, `ai/`, `content/`, `components/`, `lib/`. Add `.env.example` with `OPENROUTER_API_KEY`.
_Done when:_ `pnpm dev`, `pnpm build`, `pnpm test`, and `pnpm lint` all pass on a clean checkout.

**T-02 · Install and configure Pixelact UI**
Initialise shadcn/ui, then add Pixelact UI components from its registry (button, card, input, dialog, badge, progress at minimum). Verify Framer Motion comes in as a transitive dep and pin it. Do not install a second animation library.
_Done when:_ a scratch page renders a pixel button, card, and dialog with correct pixel borders in both light and dark mode.

**T-03 · Establish the pixel design system**
Define Tailwind theme tokens for the court palette (parchment, ink, wax red, gold, stone). Add a global `image-rendering: pixelated` utility. Load one bitmap display font (headings, counselor names) and one legible sans (body). Codify the integer-scale rule as `sprite-2x`/`sprite-3x`/`sprite-4x` utilities.
_Done when:_ a typography + palette specimen page exists and no text below 16px uses the bitmap face.

**T-04 · Sprite pipeline**
Author or source 32×32 sprites for the six counselors, four frames each (`neutral`, `pleased`, `appalled`, `scheming`), as one sheet per counselor. Build a `<Sprite>` component taking `counselorId` + `state`, using `background-position` steps — not per-frame `<img>` swaps.
_Done when:_ `<Sprite>` renders all 6 × 4 combinations crisply at ×2 and ×4, with no layout shift on state change.

### Phase 1 — Domain and content

**T-05 · Define domain types**
Implement `src/domain/{counselor,audience,reign}.ts` exactly as specified in §3. Add Zod schemas mirroring each type in `src/domain/schemas.ts` for runtime validation at the API boundary.
_Done when:_ types compile under `strict`, and schema round-trip tests pass for a fixture of each entity.

**T-06 · Seed the council**
Write `src/content/counselors.ts` with all six counselors fully specified per §4 — including `voice.sampleLines`, `publicStance`, and `agenda`. Enforce the §4.1 authoring rules.
_Done when:_ a unit test asserts six counselors exist, all ids unique, all factions distinct, every counselor has ≥ 2 sample lines, and no two `publicStance` values are semantically near-duplicates (manual review checkbox).

**T-07 · Implement the audience state machine**
Build `src/engine/audience-machine.ts` as a pure reducer over `Audience` with actions for each stage transition and for appending petitions/exchanges/votes/decree/reactions. Include speaking-order resolution (shuffle, then move `speaks-last` counselors to the end).
_Done when:_ unit tests cover every legal transition, reject every illegal one, and assert that `speaks-last` counselors are always ordered last.

### Phase 2 — AI layer

**T-08 · Wire up OpenRouter**
Install `@openrouter/ai-sdk-provider` and `ai`. Create `src/ai/client.ts` exposing a configured provider that reads the server-side key, plus an optional BYOK override. Implement `src/ai/models.ts` with per-faction fallback chains ending in `openrouter/free`, and a `resolveModel(faction)` helper that walks the chain on failure.
_Done when:_ an integration test (skipped without a key) completes one round-trip through a free model, and killing the first chain entry transparently falls through to the next.

**T-09 · Build the prompt builder**
Implement `src/ai/prompt-builder.ts` per §6 — `buildPetitionMessages`, `buildDeliberationMessages`, `buildVoteMessages`, `buildAftermathMessages`. Ability instructions derive from `AbilityEffect` via an exhaustive switch.
_Done when:_ snapshot tests exist for each builder, and a test asserts that `buildPetitionMessages` output contains **no** other counselor's text (the anchoring firewall).

**T-10 · `/api/counsel` streaming route**
Implement the route per §7: validate the body with Zod, re-derive the counselor server-side by id, build messages, `streamText`, return a streaming response. Enforce `maxOutputTokens` for the 2–4 sentence cap. Handle model failure by falling through the chain, then by returning a demo-mode payload.
_Done when:_ curl-ing the route streams a single counselor's speech in character; a malformed body returns 400; a client-supplied `systemPrompt` field is ignored.

**T-11 · Anti-sycophancy validator**
Implement `src/ai/validate-exchange.ts`: checks that a deliberation turn names another seated counselor, contains no banned phrase, and carries a `targetId`. Wire the one-shot stricter retry into the deliberation path, and emit a `sycophancy_violation` counter on second failure.
_Done when:_ unit tests cover pass, retry-then-pass, and retry-then-fail; the counter is observable in logs.

**T-12 · Vote and aftermath routes**
Implement `/api/vote` and `/api/aftermath` with `generateObject` against the §6.4 schemas, plus the post-validation business rules (no self-votes, all seated present, ids within `seated`, favor deltas clamped). Repair once, then drop offending entries.
_Done when:_ both routes return valid payloads for a fixture audience; an injected self-vote is stripped; a hung council is returned intact rather than broken by a tiebreak.

**T-13 · Rate limiting, BYOK, and demo mode**
Implement the per-IP token bucket, the 5-call concurrency cap, the BYOK passthrough (`sessionStorage`, never persisted server-side), and the canned `demo-audience.ts` fallback with its visible banner.
_Done when:_ exceeding the limit returns 429 with an in-world message; removing the env key yields a full playable demo transcript instead of an error.

### Phase 3 — Interface

**T-14 · `<CounselorCard>` component**
Build the three variants (`compact`, `speaking`, `full`) per §8.2, including stat pips, faction badge, ability block, and the `AGENDA: ???` masked state.
_Done when:_ a Storybook-or-equivalent page renders all three variants for all six counselors, revealed and unrevealed, in both colour modes.

**T-15 · Seating screen**
Build `/audience/new`: the card grid, 3–5 selection with a minimum-3 gate, faction-clash hints ("the Marshal and the Keeper will not agree — good"), and seat/unseat animation. Persist the chosen council as the default for next time.
_Done when:_ you cannot start an audience with fewer than 3 or more than 5 seated, and selection state survives a reload.

**T-16 · Question composer**
Parchment-styled input, 300-char cap with a visible counter, example questions as clickable prompts (mix absurd and real), and the server-side crisis screen (T-22) gating submission.
_Done when:_ submitting transitions the machine to `petition` and navigates to the chamber.

**T-17 · Petition stage UI**
Fire n parallel `/api/counsel` requests, stream each into its own card, staggered `AnimatePresence` entrances. Cards must render partial text gracefully and show a per-counselor loading state that reads as in-world ("the Marshal clears his throat").
_Done when:_ all seated counselors stream concurrently, a single counselor failing does not block the others, and the stage completes when all streams close.

**T-18 · Deliberation stage UI**
Sequential turn reveal with a transcript log: speaker sprite, name, rebuttal arrow to `targetId`, streaming text. Auto-scroll follows the active speaker.
_Done when:_ turns appear strictly in engine order, `speaks-last` counselors always land last, and the log is readable as a scene end-to-end.

**T-19 · Vote and decree UI**
Tally strip with per-counselor pips and rationales; explicit "the council's preference, not the answer" framing; hung-council treatment. Then the decree parchment: free text, optional "I sided with…", wax-seal submit, and quick-decree buttons.
_Done when:_ a tie renders as a hung council with no winner declared, and issuing a decree advances to `aftermath`.

**T-20 · Aftermath and share**
Sprites flip to reaction moods, one line each, favor deltas animate upward and commit to the `Reign`. Render the full scene to a PNG via canvas for sharing.
_Done when:_ favor changes persist across reload, and the exported PNG contains question, petitions, decree, and reactions legibly.

### Phase 4 — Game layer

**T-21 · Reign persistence and custom counselors**
Implement `src/lib/repository.ts` — a typed interface (`getReign`, `saveReign`, `listAudiences`, `saveAudience`) backed by `localStorage`, with schema-versioned migration. Then the custom counselor editor: name, title, faction, stats, ability picker, voice fields. Custom counselors go through a hardened server path — server-side length caps, prompt-injection stripping, and the public-figure denylist.
_Done when:_ the repository interface has zero `localStorage` references leaking into UI code, a corrupted store recovers rather than crashing, and a custom counselor with an injected "ignore previous instructions" payload still speaks in character.

**T-22 · Crisis interrupt**
Implement the server-side screen per §9. On a hit, return an adjournment payload; the client renders the plain non-pixel card with real support resources and generates nothing. Add the persistent entertainment-framing footer app-wide.
_Done when:_ a battery of ~15 crisis-signal phrasings all adjourn the court, a battery of ~15 benign-but-dark questions ("should I fire my co-founder") all proceed normally, and the client cannot bypass the check.

**T-23 · Favor consequences and agenda reveals**
Apply the §5.5 favor thresholds to petition generation (terse at ≤ -5, absent at ≤ -8, extra line at ≥ +7). Reveal an agenda at `heardCount >= 3` with a card-flip animation. Build `/chronicle` showing past decrees, a favor chart, and revealed agendas.
_Done when:_ favor thresholds demonstrably change output, and the third time a counselor speaks their agenda unlocks with an animation.

### Phase 5 — Hardening

**T-24 · Persona distinctness eval harness**
Implement `scripts/eval-distinctness.ts` per §10 — lexical overlap, blind attribution, stance divergence, sycophancy rate — printing a table and exiting non-zero when thresholds are breached.
_Done when:_ the script runs end-to-end against the live council and reports all four metrics; current values are recorded in the README as the baseline.

**T-25 · Accessibility**
Full keyboard navigation for seating and decree; ARIA live regions for streaming counselor text so screen readers get each turn once (not per token); alt text per sprite state; respect `prefers-reduced-motion` by cutting entrance animations and revealing turns instantly; verify contrast on parchment surfaces.
_Done when:_ an axe pass is clean, the whole flow is completable by keyboard alone, and reduced-motion mode has no animation but the same content.

**T-26 · Error and edge handling**
Cover: model timeout mid-stream, all fallbacks exhausted, 429, empty question, refusal from the model, browser offline, and a stage abandoned mid-flight then resumed. Every failure surfaces as in-world copy, never a stack trace.
_Done when:_ each case has a test and a designed in-world message.

**T-27 · E2E test and deploy**
Playwright test covering the full happy path (seat → ask → petition → deliberate → vote → decree → aftermath) against a mocked AI layer. Deploy to Vercel with the key set, `maxDuration` configured, and demo mode verified in production.
_Done when:_ the e2e suite passes in CI and a production URL completes a real audience.

---

## 12. Open decisions

Resolve these before or during T-05 — each changes downstream work.

1. **Deliberation rounds.** One round (spec default, cheaper, tighter) vs two (more heat, ~2× cost and latency).
2. **Model diversity vs consistency.** Different free models per faction gives real disagreement but uneven quality and voice drift. A single model gives polish and risks collapse. Recommendation: ship diverse, and let T-24's numbers decide.
3. **Vote framing.** Counselors vote for another's _petition_ (spec default) vs vote on a _proposed action_. The second is more useful, less legible.
4. **Favor severity.** Should a counselor at very low favor be able to actively sabotage — give deliberately bad counsel? Great game, real risk of the user not realising.
5. **Question tone.** Do example prompts lean absurd ("should I marry the dragon") or real ("should I take the job")? This sets user expectations permanently and is hard to change later.

---

## 13. Appendix — references

- Pixelact UI — https://www.pixelactui.com/ · https://github.com/pixelact-ui/pixelact-ui
- OpenRouter provider for the AI SDK — https://github.com/OpenRouterTeam/ai-sdk-provider
- OpenRouter + Vercel AI SDK guide — https://openrouter.ai/docs/guides/community/vercel-ai-sdk
