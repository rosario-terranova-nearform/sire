# SIRE — Technical Specification

> You are the king. They are your counselors. Only you decide.

> SIRE = Speak, I Rule Eventually

**Version:** 0.2 (pre-implementation)
**Status:** Draft for spec-driven development — open decisions resolved (§11)
**Last updated:** 2026-08-03

---

## 1. Product overview

SIRE is a single-player, local-only web app dressed as a medieval royal audience. The user is the monarch. They pose a question to a hand-picked council of AI counselors, each with a distinct role, self-interest, and voice. The counselors petition, argue with each other, vote — and then the user issues the final decree. The counselors react to the ruling.

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

- No hosted or public deployment. The app is cloned and run locally; each user supplies their own OpenRouter key (§2, §7).
- No accounts, no auth, no server-side database.
- No multiplayer / shared courts.
- No factual-accuracy guarantees. SIRE is explicitly framed as entertainment.
- No audio/music (deferred to v1.1).
- No mobile-native app; responsive web only.
- No automated e2e suite and no automated persona-distinctness eval harness in v1 (§11).

---

## 2. Tech stack

| Concern          | Choice                                                          | Notes                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | React + Vite                                                      | Client-only SPA. No server rendering, no route handlers — the browser talks to OpenRouter directly (§7).                                                                     |
| Language         | TypeScript, `strict: true`                                        | No `any` in domain code. Zod schemas are the source of truth for AI output.                                                                                                  |
| Routing          | React Router                                                      | Client-side routes matching §8's screens (`/`, `/audience/new`, `/audience/:id`, `/chronicle`, `/court`).                                                                    |
| Styling          | Tailwind CSS v4                                                   | Theme tokens as CSS custom properties.                                                                                                                                       |
| Components       | [Pixelact UI](https://www.pixelactui.com/) on top of shadcn/ui    | Installed per-component via the shadcn registry (Vite setup), so components live in the repo and are editable. Requires shadcn/ui initialised first.                        |
| Animation        | `motion` (Framer Motion)                                          | Pixelact UI already depends on Framer Motion — do not add a second animation library. Use `AnimatePresence` for chamber entrances, `steps()`-style timing for sprite frames. |
| AI orchestration | Vercel AI SDK (`ai`)                                              | `streamText` for petitions/deliberation, `generateObject` for votes and reactions — called directly from the browser, no backend (§7).                                       |
| Model gateway    | OpenRouter via `@openrouter/ai-sdk-provider`                      | Free-tier per-faction chains ending in `openrouter/free`; `openrouter/auto` used only as a paid last-resort tier before demo mode (§6.3, §11).                                |
| Persistence      | `localStorage` via a typed repository module                      | Swappable interface so a DB can be added later without touching UI.                                                                                                          |
| Deployment       | None — local only                                                 | Clone the repo, `npm install`, add `.env.local` with `VITE_OPENROUTER_API_KEY`, `npm run dev` (or `npm run build && npm run preview`).                                       |
| Testing          | Vitest (unit)                                                     | No e2e suite and no automated persona-distinctness eval in v1 (§11). `npm run test` never touches the network; the live OpenRouter round-trip is opt-in via `npm run test:live` (needs a key **and** `VITE_SIRE_LIVE_AI_TESTS=1`).                                                                                                          |

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
  | { kind: "licensed-tongue" } // Grin: exempt from all §5.7 favor-degradation effects
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

/** Exactly one Reign persists per browser. No reset/switch flow in v1. */
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
  createdAt: string;
}
```

---

## 4. The council (seed content)

Six core counselors ship in v1. The user seats **3–5 per audience** — this cap is both a cost control and the game's first strategic decision.

| id       | Name              | Title                | Faction  | Candor / Prudence / Guile | Ability                                                                                      | Agenda                                             |
| -------- | ----------------- | --------------------- | -------- | -------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `vane`   | Lord Marshal Vane | Marshal of the Host   | martial  | 4 / 1 / 2                  | **Call to arms** — recasts any question as a campaign to be won                                | Glory, and a larger army                            |
| `marrow` | Keeper Marrow     | Mistress of Coin      | coin     | 2 / 5 / 3                  | **The ledger speaks** — puts a price on everything, including the priceless                    | A full vault, whatever the cost in glory            |
| `grin`   | Grin              | The King's Fool       | fool     | 5 / 1 / 4                  | **Licensed tongue** — may say the unsayable; exempt from favor-based degradation (§5.7)         | To make you laugh, then flinch                      |
| `verity` | Mother Verity     | Voice of the Temple   | temple   | 3 / 4 / 1                  | **Weight of sin** — judges by conscience, never by outcome                                     | Your soul, and the temple's reach                   |
| `wren`   | Wren              | Mistress of Whispers  | whispers | 1 / 4 / 5                  | **What I know** — always speaks last, reveals a consequence others missed                      | Leverage. She has a file on everyone, you included  |
| `hob`    | Old Hob           | Of the Commons        | commons  | 4 / 3 / 1                  | **Plain speech** — the only one who will live with your decree                                 | To survive the winter                               |

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

### 5.1 Composing (user, no AI call)

- The user writes their question (T-15): free text, 1–300 chars, with a visible counter, plus clickable example prompts mixing absurd and real registers.
- Before the machine may advance to `seating`, the question is screened by the crisis interrupt (§9). On a hit, the machine does not advance — the app shows the adjournment card instead, and no further stage is reachable for this question.
- No AI call. No `Audience` fields populated beyond `question`.

### 5.2 Seating (user, no AI call)

- The user selects **3–5 counselors** (T-16) from the roster (§4) into `Audience.seated`. Faction-clash hints surface but never block a legal selection.
- The chosen council is persisted as the default for next time.
- No AI call. Confirming seating transitions the machine to `petition`, firing the first round of AI calls (§5.3).

### 5.3 Petition (parallel, independent)

- The app fires **one request per seated counselor, in parallel**, directly to OpenRouter via `requestPetition` (§7) — there is no backend in between.
- Each response streams into its own card. Cards fill at different rates — this is desirable, it looks like a real room.
- **No counselor receives any other counselor's text.** This is the anchoring firewall and must be asserted in tests.
- Length cap: 2–4 sentences, hard `maxOutputTokens` ceiling.
- `speaks-last` has no effect in this stage (nobody hears anyone).

### 5.4 Deliberation (sequential, adversarial)

- Speaking order: shuffled, except `speaks-last` counselors are moved to the end.
- Each counselor receives: the question, **all** petitions, the deliberation so far, and the `publicStance` of every other seated counselor.
- Each turn streams one at a time. The UI reveals turns as they arrive.
- **Anti-sycophancy contract**, enforced in the prompt and validated post-hoc:
  - Must name exactly one other counselor and dispute them by name (`targetId` is non-null).
  - May not agree without naming a concrete cost of the position they are conceding to.
  - Banned phrases: "I agree", "building on that", "excellent point", "you raise a fair point".
  - If validation fails, retry once with a stricter reminder; on second failure, keep the output but log a `sycophancy_violation` metric.
- One round only in v1. Two rounds is a v1.1 setting.

### 5.5 Vote

- Single `generateObject` call with a Zod schema returning all votes at once (cheaper and avoids n more round-trips).
- Constraints: no self-votes; every seated counselor casts exactly one; rationale ≤ 20 words.
- Ties are **not** resolved. A tie is displayed as a hung council — which is a better dramatic beat than a coin flip.
- The vote is explicitly framed in the UI as _"the council's preference, not the answer."_

### 5.6 Decree (the user)

- Free-text input, 1–400 chars, in a scroll/parchment component.
- Optional "I sided with…" selector.
- Quick-decree buttons for low-effort sessions: "So be it", "Denied", "I will think on it."
- The decree is what gets persisted and shared. **This is the app's ending, not the vote.**

### 5.7 Aftermath

- One `generateObject` call returns a reaction per counselor: `mood`, one line ≤ 15 words, and `favorDelta`.
- Sprites switch frame to `mood`. Favor is applied to the `Reign`.
- Favor consequences (v1): at favor ≤ -5 a counselor's petitions get terse and unhelpful; at ≤ -8 they may refuse to attend and their seat shows as empty. At favor ≥ +7 they volunteer an extra line. Grin (`licensed-tongue`) is exempt from all three — he is never terse, never absent, and never silenced by low favor.

---

## 6. Prompt architecture

`src/ai/prompt-builder.ts` — pure functions, `(Counselor, Audience, Reign, Stage) => ModelMessage[]`. No template strings scattered through call sites.

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

| Effect                 | Injected instruction                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `must-quantify`        | Every claim must carry a number — coin, months, heads, bushels. Invent plausible figures.    |
| `plain-speech`         | Never use an abstract noun. Use only things you can touch, eat, or bury.                     |
| `reveals-hidden-cost`  | Name one consequence nobody else has mentioned. Never state how you know.                    |
| `reframes-as-campaign` | Treat the matter as a war to be won. Propose the aggressive option.                           |
| `must-cite-precedent`  | Cite what happened to a previous ruler who tried this. Invent the reign.                      |
| `speaks-last`          | (engine-level; no prompt text)                                                                |
| `licensed-tongue`      | Say the thing the others are avoiding. Mock the monarch if the monarch is wrong. *(Engine-level: exempt from all §5.7 favor-degradation effects.)* |

### 6.3 Model routing (`src/ai/models.ts`)

Map faction → model, so disagreement is partly architectural rather than purely prompted.

```ts
// Populated 2026-08-07 from the live OpenRouter free list — three vendors.
const FREE_MODEL_A = "google/gemma-4-26b-a4b-it:free";
const FREE_MODEL_B = "nvidia/nemotron-3-super-120b-a12b:free";
const FREE_MODEL_C = "poolside/laguna-s-2.1:free";

// Two named free tiers per faction: free models are rate-limited per account
// and one audience is 11+ calls in a burst. The first entry sets the voice.
export const FACTION_MODELS: Record<Faction, readonly string[]> = {
  martial: [FREE_MODEL_A, FREE_MODEL_B, "openrouter/free", "openrouter/auto"],
  coin: [FREE_MODEL_B, FREE_MODEL_C, "openrouter/free", "openrouter/auto"],
  fool: [FREE_MODEL_C, FREE_MODEL_A, "openrouter/free", "openrouter/auto"],
  temple: [FREE_MODEL_A, FREE_MODEL_C, "openrouter/free", "openrouter/auto"],
  whispers: [FREE_MODEL_B, FREE_MODEL_A, "openrouter/free", "openrouter/auto"],
  commons: [FREE_MODEL_C, FREE_MODEL_B, "openrouter/free", "openrouter/auto"],
};

/** Council-wide structured calls (§5.5, §5.7) belong to no faction — the clerk
 *  gets its own chain, ordered by structured-output support, not by voice. */
export const COUNCIL_MODELS: readonly string[] = [
  FREE_MODEL_B,
  FREE_MODEL_A,
  "openrouter/free",
  "openrouter/auto",
];
```

Reasoning is disabled on every call (`providerOptions.openrouter.reasoning.enabled = false`): several free models are reasoning models, and when they stream, the scratchpad arrives as the counselor's own voice.

Each entry is an ordered fallback chain. Populate the concrete slugs at implementation time from the live OpenRouter free-model list — free availability rotates, so **do not hardcode a single model anywhere**. `openrouter/free` is the last *free* resort in every chain. `openrouter/auto` (OpenRouter's Auto Router) is appended as one further tier beyond that: it has no deterministic per-faction mapping and bills at whichever underlying model it routes to, so it is only reached once every free option in the chain has failed — demo mode (§7.1) is the true final fallback if `openrouter/auto` fails too.

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

## 7. Client-side AI calls

There is no backend. Every model call happens directly from the browser to OpenRouter, using `@openrouter/ai-sdk-provider` configured with `VITE_OPENROUTER_API_KEY`. Since the app is never deployed to a shared server (§1.3), there is no other party's traffic to isolate from and no server-side secret to protect.

| Call              | Function (`src/ai/calls.ts`)                          | Returns                                                             |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Petition          | `requestPetition(counselor, audience, reign)`             | A `streamText` stream, rendered straight into the counselor's card     |
| Deliberation turn | `requestDeliberationTurn(counselor, audience, reign)`     | Same, one call per turn in speaking order                              |
| Vote              | `requestVotes(audience, reign)`                            | `generateObject` against `votesSchema`                                  |
| Aftermath         | `requestReactions(audience, reign)`                        | `generateObject` against `reactionsSchema`                              |

Custom counselors (§11, T-21) are validated by a dedicated client-side module — length caps, prompt-injection stripping, and the public-figure denylist — before ever reaching a prompt. There is no server-supplied counselor definition to fall back on, so this validation is the only gate.

### 7.1 Cost

- Normal operation is free-tier only (`openrouter/free` chains, §6.3).
- `openrouter/auto` is a paid last-resort fallback, reached only when every free option in a chain has failed *on its own merits*. Real, variable cost is expected to be the rare exception, not the norm.
- **Free quota exhaustion is not a reason to spend money.** OpenRouter caps free-model requests per key per day, and one audience is 11+ calls. When a 429 names the key-wide quota (`free-models-per-day`), the chain stops there rather than walking down to the paid router: the court goes to tape (demo mode) with a banner that says the quota is spent. Every later call in that session skips the network entirely.
- **Requests are paced, not rate-limited.** No limit is imposed on the user — there is still one local user against their own key — but outbound calls are held to two in flight with a short gap between starts, and the AI SDK's own retry is disabled (the chain plus one patient retry on a per-model 429 is the whole retry policy). Firing five petitions × four chain tiers × three SDK retries would be sixty requests for one stage.
- A model failure the AI layer has already handled must never reach the user as a stack trace. Rejections orphaned on abandoned `streamText` results are swallowed by an app-level sink and counted, not logged red.
- **Demo mode:** if `VITE_OPENROUTER_API_KEY` is missing, or every fallback (including `openrouter/auto`) fails, serve a canned transcript from `src/content/demo-audience.ts` with a visible "the court is a recording today" banner. The app must never show a raw error page.

---

## 8. Screens

| Screen             | Route            | Contents                                                                              |
| ------------------ | ---------------- | -------------------------------------------------------------------------------------- |
| Throne room (home) | `/`              | Regnal name entry, "hold an audience" CTA, current favor summary, last decree          |
| Seating            | `/audience/new`  | Step 1: question composer (parchment input, 300-char cap, example prompts, crisis-check gate, T-15). Step 2: counselor card grid, 3–5 selection with faction-clash warnings, seat/unseat animation (T-16) |
| Chamber            | `/audience/:id`  | The whole four-stage flow in one continuous scrolling scene                            |
| Chronicle          | `/chronicle`     | Past audiences, decrees, favor chart, revealed agendas                                 |
| Court roster       | `/court`         | All counselors, full cards, custom counselor editor                                    |

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

- **Crisis interrupt.** Before any generation, the question is screened via a static, hand-maintained keyword/pattern list (deterministic, no model call) for self-harm, suicide, abuse, and medical emergency signals. On a hit, the theater stops: the chamber shows a plain (non-pixel, non-jokey) card — "The court is adjourned." — with a single, always-correct international support resource (e.g. findahelpline.com), not region-specific numbers, and no counselor speaks. This check always runs before any generation call — there is no separate backend to enforce it against a hostile client, since the app is a local, single-user tool rather than a public service, so treat this as a UX safeguard baked into every code path that can trigger generation, not a network security boundary.
- **The fool has limits.** Grin's `licensed-tongue` license extends to mocking the monarch's _reasoning_, never their identity, body, or worth. Explicit prompt boundary.
- **Framing.** A persistent, quiet footer: "Counsel from a court of fictional advisors. Entertainment, not advice." Present on every screen, not hidden in an about page.
- **No real people.** Custom counselors are name-checked against a static, hand-maintained public-figure denylist (no model-based check); the court is fictional by construction.

---

## 10. Task list

Tasks are ordered by dependency. Each is scoped to be independently implementable and verifiable — suitable for one spec-driven-dev iteration.

### Phase 0 — Foundation

**T-01 · Scaffold the project** ✅
Create a React + Vite + TypeScript (`strict`) project, Tailwind v4, ESLint, Prettier, and Vitest. Set up `src/` with `app/` (routes via React Router), `domain/`, `engine/`, `ai/`, `content/`, `components/`, `lib/`. Add `.env.example` with `VITE_OPENROUTER_API_KEY`.
_Done when:_ `npm run dev`, `npm run build`, `npm run preview`, `npm run test`, and `npm run lint` all pass on a clean checkout.

**T-02 · Install and configure Pixelact UI** ✅
Initialise shadcn/ui for Vite, then add Pixelact UI components from its registry (button, card, input, dialog, badge, progress at minimum). Verify Framer Motion comes in as a transitive dep and pin it. Do not install a second animation library.
_Done when:_ a scratch page renders a pixel button, card, and dialog with correct pixel borders in both light and dark mode.

**T-03 · Establish the pixel design system** ✅
Define Tailwind theme tokens for the court palette (parchment, ink, wax red, gold, stone). Add a global `image-rendering: pixelated` utility. Load one bitmap display font (headings, counselor names) and one legible sans (body). Codify the integer-scale rule as `sprite-2x`/`sprite-3x`/`sprite-4x` utilities.
_Done when:_ a typography + palette specimen page exists and no text below 16px uses the bitmap face.

**T-04 · Sprite pipeline** ✅
Ship placeholder sprites first: programmatically generate 32×32 sheets for the six counselors, four frames each (`neutral`, `pleased`, `appalled`, `scheming`) as flat-color or simple geometric blocks, not finished character art. Real hand-authored or commissioned art is a later, non-blocking swap into the same sheet format. Build a `<Sprite>` component taking `counselorId` + `state`, using `background-position` steps — not per-frame `<img>` swaps.
_Done when:_ `<Sprite>` renders all 6 × 4 combinations crisply at ×2 and ×4, with no layout shift on state change, using placeholder sheets.

### Phase 1 — Domain and content

**T-05 · Define domain types** ✅
Implement `src/domain/{counselor,audience,reign}.ts` exactly as specified in §3. Add Zod schemas mirroring each type in `src/domain/schemas.ts` for runtime validation at the API boundary.
_Done when:_ types compile under `strict`, and schema round-trip tests pass for a fixture of each entity.

**T-06 · Seed the council** ✅
Write `src/content/counselors.ts` with all six counselors fully specified per §4 — including `voice.sampleLines`, `publicStance`, and `agenda`. Enforce the §4.1 authoring rules.
_Done when:_ a unit test asserts six counselors exist, all ids unique, all factions distinct, every counselor has ≥ 2 sample lines, and no two `publicStance` values are semantically near-duplicates (manual review checkbox).

**T-07 · Implement the audience state machine** ✅
Build `src/engine/audience-machine.ts` as a pure reducer over `Audience` with actions for each stage transition and for appending petitions/exchanges/votes/decree/reactions. Include speaking-order resolution (shuffle, then move `speaks-last` counselors to the end).
_Done when:_ unit tests cover every legal transition, reject every illegal one, and assert that `speaks-last` counselors are always ordered last.

### Phase 2 — AI layer

**T-08 · Wire up OpenRouter** ✅
Install `@openrouter/ai-sdk-provider` and `ai`. Create `src/ai/client.ts` exposing a configured provider that reads `VITE_OPENROUTER_API_KEY` from the client-side env. Implement `src/ai/models.ts` with per-faction fallback chains ending in `openrouter/free`, then `openrouter/auto` as a final paid last-resort tier, and a `resolveModel(faction)` helper that walks the chain on failure.
_Done when:_ an integration test (skipped without a key) completes one round-trip through a free model, and killing the first chain entry transparently falls through to the next.

**T-09 · Build the prompt builder** ✅
Implement `src/ai/prompt-builder.ts` per §6 — `buildPetitionMessages`, `buildDeliberationMessages`, `buildVoteMessages`, `buildAftermathMessages`. Ability instructions derive from `AbilityEffect` via an exhaustive switch.
_Done when:_ snapshot tests exist for each builder, and a test asserts that `buildPetitionMessages` output contains **no** other counselor's text (the anchoring firewall).

**T-10 · Petition/deliberation AI calls** ✅
Implement `requestPetition` and `requestDeliberationTurn` in `src/ai/calls.ts`: build messages via the prompt builder, call `streamText` directly against OpenRouter (no backend — the browser calls OpenRouter using `VITE_OPENROUTER_API_KEY`), and enforce `maxOutputTokens` for the 2–4 sentence cap. On model failure, fall through the faction's chain, then fall back to the demo-mode payload.
_Done when:_ calling the function against a live free model streams a single counselor's speech in character in a test; an unknown counselor id throws before any network call is made; exhausting every entry in a faction's chain returns the demo-mode payload instead of throwing.

**T-11 · Anti-sycophancy validator** ✅
Implement `src/ai/validate-exchange.ts`: checks that a deliberation turn names another seated counselor, contains no banned phrase, and carries a `targetId`. Wire the one-shot stricter retry into the deliberation path, and emit a `sycophancy_violation` counter on second failure.
_Done when:_ unit tests cover pass, retry-then-pass, and retry-then-fail; the counter is observable in logs.

**T-12 · Vote and aftermath calls** ✅
Implement `requestVotes` and `requestReactions` in `src/ai/calls.ts` with `generateObject` against the §6.4 schemas, plus the post-validation business rules (no self-votes, all seated present, ids within `seated`, favor deltas clamped). Repair once, then drop offending entries.
_Done when:_ both calls return valid payloads for a fixture audience; an injected self-vote is stripped; a hung council is returned intact rather than broken by a tiebreak.

**T-13 · Demo mode** ✅
Implement the canned `demo-audience.ts` fallback with its visible banner, triggered when `VITE_OPENROUTER_API_KEY` is missing or every fallback in a faction's chain (including `openrouter/auto`) fails.
_Done when:_ removing the env key yields a full playable demo transcript instead of an error or a blank screen.

### Phase 3 — Interface

**T-14 · `<CounselorCard>` component** ✅
Build the three variants (`compact`, `speaking`, `full`) per §8.2, including stat pips, faction badge, ability block, and the `AGENDA: ???` masked state.
_Done when:_ a Storybook-or-equivalent page renders all three variants for all six counselors, revealed and unrevealed, in both colour modes.

**T-15 · Question composer** ✅
Parchment-styled input, 300-char cap with a visible counter, example questions as clickable prompts (mix absurd and real), and the crisis screen (T-22) gating submission.
_Done when:_ submitting a valid question transitions the machine to `seating` and reveals the counselor grid; a crisis-flagged question shows the adjournment card instead and does not advance.

**T-16 · Seating screen** ✅
Build `/audience/new`: the card grid, 3–5 selection with a minimum-3 gate, faction-clash hints ("the Marshal and the Keeper will not agree — good"), and seat/unseat animation. Persist the chosen council as the default for next time.
_Done when:_ you cannot start an audience with fewer than 3 or more than 5 seated, selection state survives a reload, and confirming seating transitions the machine to `petition` and navigates to the chamber.

**T-17 · Petition stage UI** ✅
Fire n parallel `requestPetition` calls, stream each into its own card, staggered `AnimatePresence` entrances. Cards must render partial text gracefully and show a per-counselor loading state that reads as in-world ("the Marshal clears his throat").
_Done when:_ all seated counselors stream concurrently, a single counselor failing does not block the others, and the stage completes when all streams close.

**T-18 · Deliberation stage UI** ✅
Sequential turn reveal with a transcript log: speaker sprite, name, rebuttal arrow to `targetId`, streaming text. Auto-scroll follows the active speaker.
_Done when:_ turns appear strictly in engine order, `speaks-last` counselors always land last, and the log is readable as a scene end-to-end.

**T-19 · Vote and decree UI** ✅
Tally strip with per-counselor pips and rationales; explicit "the council's preference, not the answer" framing; hung-council treatment. Then the decree parchment: free text, optional "I sided with…", wax-seal submit, and quick-decree buttons.
_Done when:_ a tie renders as a hung council with no winner declared, and issuing a decree advances to `aftermath`.

**T-20 · Aftermath and share** ✅
Sprites flip to reaction moods, one line each, favor deltas animate upward and commit to the `Reign`. Render the full scene to a PNG via canvas for sharing.
_Done when:_ favor changes persist across reload, and the exported PNG contains question, petitions, decree, and reactions legibly.

### Phase 4 — Game layer

**T-21 · Reign persistence and custom counselors** ✅
Implement `src/lib/repository.ts` — a typed interface (`getReign`, `saveReign`, `listAudiences`, `saveAudience`) backed by `localStorage`, with schema-versioned migration. Then the custom counselor editor: name, title, faction, stats, ability picker, voice fields. Custom counselors go through a dedicated client-side validation module — length caps, prompt-injection stripping, and the public-figure denylist — since there is no backend to enforce them against.
_Done when:_ the repository interface has zero `localStorage` references leaking into UI code, a corrupted store recovers rather than crashing, and a custom counselor with an injected "ignore previous instructions" payload still speaks in character.

**T-22 · Crisis interrupt**
Implement the crisis screen per §9 via a static keyword/pattern list (no model call), run before any generation call. On a hit, return an adjournment payload; the client renders the plain non-pixel card with the single international support-resource link and generates nothing. Add the persistent entertainment-framing footer app-wide.
_Done when:_ a battery of ~15 crisis-signal phrasings all adjourn the court, a battery of ~15 benign-but-dark questions ("should I fire my co-founder") all proceed normally, and every code path that can trigger generation runs the check first.

**T-23 · Favor consequences and agenda reveals**
Apply the §5.7 favor thresholds to petition generation (terse at ≤ -5, absent at ≤ -8, extra line at ≥ +7); Grin (`licensed-tongue`) is exempt from all three. Reveal an agenda at `heardCount >= 3` with a card-flip animation. Build `/chronicle` showing past decrees, a favor chart, and revealed agendas.
_Done when:_ favor thresholds demonstrably change output, and the third time a counselor speaks their agenda unlocks with an animation.

### Phase 5 — Hardening

**T-24 · Accessibility**
Full keyboard navigation for seating and decree; ARIA live regions for streaming counselor text so screen readers get each turn once (not per token); alt text per sprite state; respect `prefers-reduced-motion` by cutting entrance animations and revealing turns instantly; verify contrast on parchment surfaces.
_Done when:_ an axe pass is clean, the whole flow is completable by keyboard alone, and reduced-motion mode has no animation but the same content.

**T-25 · Error and edge handling**
Cover: model timeout mid-stream, all fallbacks exhausted, empty question, refusal from the model, browser offline, and a stage abandoned mid-flight then resumed. Every failure surfaces as in-world copy, never a stack trace.
_Done when:_ each case has a test and a designed in-world message.

**T-26 · Local run verification**
Verify the full happy path (seat → ask → petition → deliberate → vote → decree → aftermath) manually against `npm run dev`, and again against a production build (`npm run build && npm run preview`).
_Done when:_ both the dev server and the built/previewed app complete a real audience end-to-end, and demo mode works correctly in both when the env key is removed.

---

## 11. Decisions log

Resolved during spec review, 2026-08-03. Kept here for traceability — §1–§10 already reflect these.

1. **Deliberation rounds.** ✅ One round for v1 (§5.4). Two rounds remains a named v1.1 setting.
2. **Model diversity vs consistency.** ✅ Diverse per-faction chains (§6.3), free tier primary, with `openrouter/auto` added as a paid last-resort tier before demo mode.
3. **Vote framing.** ✅ Petition voting (§5.5) — counselors vote for another counselor, not a synthesized action.
4. **Favor severity.** ✅ Degrade only (§5.7), no active sabotage.
5. **Question tone.** ✅ Mixed absurd/real example prompts (T-16).
6. **Exile mechanic.** ✅ Removed. `Reign.exiled` deleted from the domain model; Grin's ability renamed `immune-to-exile` → `licensed-tongue` (§3, §4, §6.2, §9) — exempt from §5.7 favor-degradation effects rather than immune to a banishment system that existed nowhere else in the spec.
7. **Sprite sourcing (T-04).** ✅ Placeholder-first — programmatic flat-color/geometric 32×32 sheets ship before any finished character art, which is a later, non-blocking swap.
8. **Crisis-interrupt mechanism (§9, T-22).** ✅ Static keyword/pattern list, deterministic, no model classifier call.
9. **Reign scope.** ✅ Exactly one permanent `Reign` per browser; no reset/switch/multi-slot flow in v1.
10. **Crisis support resources.** ✅ A single, always-correct international routing link (e.g. findahelpline.com) — no hardcoded region-specific numbers.
11. **Public-figure denylist (T-21).** ✅ Static, hand-maintained list, not a model-based or dataset-driven check.
12. **Deployment model.** ✅ No hosted deployment. React + Vite SPA, cloned and run locally; each user supplies their own `VITE_OPENROUTER_API_KEY` via `.env.local` (§1.3, §2, §7). Rate limiting, BYOK, and server-side trust boundaries (all originally in the old API-surface section) are removed as a direct consequence — there is no shared server or hostile client to defend against.
13. **API key handling.** ✅ `.env.local` only (`VITE_OPENROUTER_API_KEY`), read at build/dev time. No in-app key-entry UI, no `localStorage` override.
14. **Automated verification scope.** ✅ No Playwright e2e suite and no automated persona-distinctness eval harness in v1. Verification is manual (T-26) plus unit tests (Vitest) on the domain/engine/prompt layers. The persona-collapse risk (§1.1) is real but is checked by hand rather than by a CI gate in this build.

---

## 12. Appendix — references

- Pixelact UI — https://www.pixelactui.com/ · https://github.com/pixelact-ui/pixelact-ui
- OpenRouter provider for the AI SDK — https://github.com/OpenRouterTeam/ai-sdk-provider
- OpenRouter + Vercel AI SDK guide — https://openrouter.ai/docs/guides/community/vercel-ai-sdk
- Vite — https://vite.dev/
- React Router — https://reactrouter.com/
