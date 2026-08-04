# SIRE

> You are the king. They are your counselors. Only you decide.

A single-player, local-only web app dressed as a medieval royal audience. See `.claude/SIRE-SPEC.md` for the full technical specification.

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your VITE_OPENROUTER_API_KEY
npm run dev
```

## Scripts

| Command                | Purpose                             |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | Start the Vite dev server           |
| `npm run build`        | Type-check and build for production |
| `npm run preview`      | Preview the production build        |
| `npm run test`         | Run the Vitest suite                |
| `npm run lint`         | Run ESLint                          |
| `npm run format`       | Format the codebase with Prettier   |
| `npm run format:check` | Check formatting without writing    |
