# SIRE

> You are the king. They are your counselors. Only you decide.

A single-player, local-only web app dressed as a medieval royal audience. See `.claude/SIRE-SPEC.md` for the full technical specification.

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your VITE_OPENROUTER_API_KEY
npm run dev
```

Without a key the app still runs: it serves a canned transcript with a visible
"the court is a recording today" banner (demo mode, spec §7.1).

`npm run test` never touches the network. The live round-trip against real free
models is opt-in and needs both a key and the flag:

```bash
npm run test:live
```

## Scripts

| Command                | Purpose                             |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | Start the Vite dev server           |
| `npm run build`        | Type-check and build for production |
| `npm run preview`      | Preview the production build        |
| `npm run test`         | Run the Vitest suite (offline)      |
| `npm run test:live`    | Live OpenRouter round-trip (opt-in) |
| `npm run lint`         | Run ESLint                          |
| `npm run format`       | Format the codebase with Prettier   |
| `npm run format:check` | Check formatting without writing    |

## Scratch harnesses

Not part of the court's navigation — one page per phase, for verifying a layer
by hand before the real screens exist:

| Route             | Covers                                             |
| ----------------- | -------------------------------------------------- |
| `/design-system`  | T-02, T-03 — pixel components, palette, type       |
| `/engine-scratch` | T-07 — the stage engine, action by action          |
| `/ai-scratch`     | T-08 … T-13 — a real audience through the AI layer |
