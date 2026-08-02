# deepdive — Roadmap

Every item below runs through the four-phase loop in `.claude/skills/guided-build/SKILL.md`:

1. **Frame** — goal, options, traps. Claude writes it, Alessandro picks.
2. **Plan** — files, contracts, tests to satisfy, order. Claude writes it, Alessandro approves.
3. **Build** — Alessandro writes the code. Claude answers questions, never writes.
4. **Review** — the `code-mentor` agent, then this file gets ticked.

This document deliberately contains **no code**. Contracts and signatures arrive at phase 2, per item, when they're about to be used.

Design authority: `docs/superpowers/specs/2026-08-02-deepdive-design.md`.

---

## Milestone 0 — Foundations

Deliverable: an empty app that builds, lints, tests, and goes red in CI when the architecture is violated.

| # | Item | Done when | Teaches |
|---|---|---|---|
| 0.1 | Project scaffold | Next 16.2 + React 19.2 + TS app boots; `reactCompiler` and `cacheComponents` on | Next 16 config surface, why PPR now rides on `cacheComponents` |
| 0.2 | Test runner | Vitest runs, one real assertion passes | Test config without a framework doing it for you |
| 0.3 | Module boundary rule | A deliberate `import` from `engine/` into `db/` fails lint | ESLint import boundaries — the rule that keeps the thesis honest |
| 0.4 | CI pipeline | GitHub Actions runs typecheck, lint, test, build on PR; `main` protected | The green-bar contract you're committing to |

## Milestone 1 — The engine

Pure TypeScript. No React, no database, no I/O. This is the heart of the project and the part worth being slow about.

| # | Item | Done when | Teaches |
|---|---|---|---|
| 1.1 | Core types | `WorldState`, `Action`, `ApplyResult` exist and make illegal states hard to build | Modelling with discriminated unions instead of booleans |
| 1.2 | Deterministic RNG | Same (seed, cursor) always yields the same number; no ambient randomness anywhere | Why `Math.random()` would silently destroy the whole architecture |
| 1.3 | Floor layout generation | A seed produces a connected, walkable floor | Procedural generation, and connectivity as an invariant |
| 1.4 | Curated rooms | Hand-authored room templates validated on load and placed by the generator | Content as data, schema validation at the boundary |
| 1.5 | Movement rules | Legal moves advance the world; illegal ones return a typed rejection | Result types over exceptions |
| 1.6 | Combat and death | Attacking, enemy turns, HP, and a run that can end | Turn ordering as pure state, not as side effects |
| 1.7 | The determinism property test | Property test proves: same seed + same action sequence ⇒ identical world, always | Property-based testing, and the invariant that justifies the isomorphic engine |

**1.7 is the keystone.** Until it passes, nothing downstream is trustworthy.

## Milestone 2 — The authoritative server

The part you said you wanted to get stronger at. Expect to go slower here, deliberately.

| # | Item | Done when | Teaches |
|---|---|---|---|
| 2.1 | Schema and migrations | `players`, `runs`, `actions`, `traces` exist; migration runs clean from empty | Drizzle, and schema as a versioned artifact |
| 2.2 | Local database | Postgres runs locally; integration tests hit a real database, not a mock | Why mocking a database hides exactly the bugs you care about |
| 2.3 | Anonymous session | First visit issues a signed cookie; tampering with it is detected | HMAC signing, and why a bare UUID cookie is forgeable |
| 2.4 | Start a run | A server action creates a run and returns a playable world | Server Actions as an RPC boundary |
| 2.5 | The action transaction | Row lock → action insert → state write, atomically | `FOR UPDATE`, isolation levels, what "atomic" actually buys you |
| 2.6 | Idempotency | Replaying the same `seq` applies once; the constraint enforces it, not an `if` | Unique constraints as concurrency control |
| 2.7 | Concurrency test | Two simultaneous identical actions provably apply once | Testing races on purpose instead of hoping |

## Milestone 3 — The client

| # | Item | Done when | Teaches |
|---|---|---|---|
| 3.1 | Dungeon page | An RSC page loads a run and renders the three-column shell | Server Components, and what never reaches the bundle |
| 3.2 | The grid | The floor renders as DOM nodes and reads clearly at a glance | Rendering a game board without canvas |
| 3.3 | Optimistic movement | Your move lands in the same frame; a server rejection rolls it back | **The centerpiece.** `useOptimistic` with the rules engine as its reducer |
| 3.4 | Keyboard control | Keys move you; the listener subscribes once and never goes stale | `useEffectEvent`, and the stale-closure bug it exists to kill |
| 3.5 | Rejection feedback | A server rejection is visible and explains itself | Divergence as a first-class UI state |

## Milestone 4 — The social layer

| # | Item | Done when | Teaches |
|---|---|---|---|
| 4.1 | Corpses | Dying writes a trace at the death tile with its cause | Write-on-terminal-state, and modelling the dead |
| 4.2 | Cached trace query | Traces for a floor are cached and tagged | `use cache` and `cacheTag` — caching something genuinely cacheable |
| 4.3 | Invalidation | A new trace invalidates exactly the right tag, and nothing else | `updateTag`, and why over-invalidating is a silent performance bug |
| 4.4 | The trace panel | Traces for the current room stream in without blocking play | `Suspense`, `use()`, and passing a promise from server to client |
| 4.5 | Leaving a message | Closed-vocabulary composer, rate-limited per session | Designing a feature so abuse is impossible rather than moderated |
| 4.6 | Shareable seeds | The seed lives in the URL; the link reproduces the dungeon | Determinism paying off as a product feature |

## Milestone 5 — Ship

| # | Item | Done when | Teaches |
|---|---|---|---|
| 5.1 | Mobile | Columns collapse to tabs; switching tabs preserves their state | `<Activity>`, used where it's actually justified |
| 5.2 | End-to-end journey | Playwright: start → move → kill → die → corpse appears in a fresh run on the same seed | One test that proves the whole system, instead of many that prove none |
| 5.3 | Deploy | Live on Vercel with Neon; preview deployments on PRs | Managed Postgres, environment separation |
| 5.4 | The README | GIF, playable link, the "why each API is here" table, the cut list, ADRs | Arguing for what you removed — the part most portfolios skip |

---

## Not in scope

Multiple floors, character classes, equipment, skill trees, appraisal voting on traces, real-time multiplayer, sound. Revisit only once Milestone 5 is genuinely finished.

## Progress

Nothing built yet. Next item: **0.1 — Project scaffold**.
