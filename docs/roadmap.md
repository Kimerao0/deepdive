# deepdive — Roadmap

Every item below runs through the four-phase loop in `.claude/skills/guided-build/SKILL.md`:

1. **Frame** — goal, options, traps. Claude writes it, Alessandro picks.
2. **Plan** — files, contracts, tests to satisfy, order. Claude writes it, Alessandro approves.
3. **Build** — Alessandro writes the code. Claude answers questions, never writes.
4. **Review** — the `code-mentor` agent, then this file gets ticked.

This document deliberately contains **no code**. Contracts and signatures arrive at phase 2, per item, when they're about to be used.

Design authority: `docs/superpowers/specs/2026-08-02-deepdive-design.md`. Stack decisions: `docs/decisions/0001-stack.md`.

---

## What this repo is

A turn-based dungeon crawler whose rules engine is pure and framework-free, then **the same game built on three different RSC implementations** — Next, React Router + Fastify, and TanStack Start — sharing one engine and one database.

The game is the fixture. The comparison is the artifact.

```
deepdive/
├── packages/
│   ├── engine/          pure rules, zero dependencies
│   ├── db/              Drizzle schema + repositories
│   └── ui/              presentational components (extracted later, not up front)
└── apps/
    ├── next/            Server Actions, use cache, PPR
    ├── react-router/    Fastify server + RSC (experimental APIs)
    └── tanstack/        server functions
```

**Order matters.** `apps/next` gets finished and deployed before `apps/react-router` starts. A repo with one finished app and two half-built ones is worse than one finished app — and the comparison is void unless all three implement the same feature set.

---

## Milestone 0 — Workspace and foundations

Deliverable: an empty monorepo that builds, lints, tests, and goes red in CI when the architecture is violated.

| #   | Item                      | Done when                                                                                                                  | Teaches                                                                            |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0.1 | pnpm workspace + Next app | `apps/next` boots; `packages/engine` and `packages/db` resolve as workspace deps; `reactCompiler` and `cacheComponents` on | Workspace protocol, Next 16 config surface, why PPR now rides on `cacheComponents` |
| 0.2 | Test runner               | Vitest runs from the root across packages; one real assertion passes                                                       | Test config in a workspace, without a framework hiding it                          |
| 0.3 | Boundary rules            | A deliberate import from `engine/` into `db/` fails lint; so does `apps/*` importing another app                           | ESLint import boundaries — the rule that makes the three-app plan possible         |
| 0.4 | CI                        | GitHub Actions runs typecheck, lint, test, build on PR; `main` protected                                                   | The green-bar contract you're committing to                                        |

## Milestone 1 — `packages/engine`

Pure TypeScript. No React, no database, no I/O. The heart of the project, and the part worth being slow about. Shared by all three apps unchanged.

| #   | Item                      | Done when                                                                         | Teaches                                                                        |
| --- | ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1.1 | Core types                | `WorldState`, `Action`, `ApplyResult` exist and make illegal states hard to build | Discriminated unions instead of booleans                                       |
| 1.2 | Deterministic RNG         | Same (seed, cursor) always yields the same number; no ambient randomness anywhere | Why `Math.random()` would silently destroy the architecture                    |
| 1.3 | Floor layout generation   | A seed produces a connected, walkable floor                                       | Procedural generation, connectivity as an invariant                            |
| 1.4 | Curated rooms             | Hand-authored room templates validated on load, placed by the generator           | Content as data, schema validation at the boundary                             |
| 1.5 | Movement rules            | Legal moves advance the world; illegal ones return a typed rejection              | Result types over exceptions                                                   |
| 1.6 | Combat and death          | Attacking, enemy turns, HP, and a run that can end                                | Turn ordering as pure state, not side effects                                  |
| 1.7 | Determinism property test | Property test proves: same seed + same action sequence ⇒ identical world, always  | Property-based testing, and the invariant that justifies everything downstream |

**1.7 is the keystone.** Until it passes, nothing downstream is trustworthy — and the three-app comparison is meaningless.

## Milestone 2 — `packages/db` and the Next server

The part you want to get stronger at. Expect to go slower here, deliberately.

| #   | Item                   | Done when                                                                      | Teaches                                                      |
| --- | ---------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 2.1 | Schema and migrations  | `players`, `runs`, `actions`, `traces` exist; migration runs clean from empty  | Drizzle, schema as a versioned artifact                      |
| 2.2 | Local database         | Docker Compose Postgres; integration tests hit a real database, not a mock     | Why mocking a database hides exactly the bugs you care about |
| 2.3 | Anonymous session      | First visit issues a signed cookie; tampering is detected                      | HMAC signing, why a bare UUID cookie is forgeable            |
| 2.4 | Start a run            | A server action creates a run and returns a playable world                     | Server Actions as an RPC boundary                            |
| 2.5 | The action transaction | Row lock → action insert → state write, atomically                             | `FOR UPDATE`, isolation levels, what "atomic" actually buys  |
| 2.6 | Idempotency            | Replaying the same `seq` applies once; the constraint enforces it, not an `if` | Unique constraints as concurrency control                    |
| 2.7 | Concurrency test       | Two simultaneous identical actions provably apply once                         | Testing races on purpose instead of hoping                   |

## Milestone 3 — `apps/next` client

| #   | Item                | Done when                                                           | Teaches                                                                   |
| --- | ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 3.1 | Dungeon page        | An RSC page loads a run and renders the three-column shell          | Server Components, and what never reaches the bundle                      |
| 3.2 | The grid            | The floor renders as DOM nodes and reads clearly at a glance        | A game board without canvas; CSS Grid and custom properties               |
| 3.3 | Optimistic movement | Your move lands in the same frame; a server rejection rolls it back | **The centerpiece.** `useOptimistic` with the rules engine as its reducer |
| 3.4 | Keyboard control    | Keys move you; the listener subscribes once and never goes stale    | `useEffectEvent`, and the stale-closure bug it exists to kill             |
| 3.5 | Rejection feedback  | A server rejection is visible and explains itself                   | Divergence as a first-class UI state                                      |

## Milestone 4 — `apps/next` social layer

| #   | Item               | Done when                                                       | Teaches                                                                                                  |
| --- | ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 4.1 | Corpses            | Dying writes a trace at the death tile with its cause           | Write-on-terminal-state                                                                                  |
| 4.2 | Cached trace query | Traces for a floor are cached and tagged                        | `use cache` and `cacheTag` — **Next-proprietary**, replaced by hand-rolled caching in Milestones 6 and 7 |
| 4.3 | Invalidation       | A new trace invalidates exactly the right tag, and nothing else | `updateTag`, and why over-invalidating is a silent performance bug                                       |
| 4.4 | The trace panel    | Traces for the current room stream in without blocking play     | `Suspense`, `use()`, passing a promise from server to client                                             |
| 4.5 | Leaving a message  | Closed-vocabulary composer, rate-limited per session            | Designing so abuse is impossible rather than moderated                                                   |
| 4.6 | Shareable seeds    | The seed lives in the URL; the link reproduces the dungeon      | Determinism paying off as a product feature                                                              |

## Milestone 5 — Ship `apps/next`

| #   | Item               | Done when                                                                              | Teaches                                          |
| --- | ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 5.1 | Mobile             | Columns collapse to tabs; switching tabs preserves their state                         | `<Activity>`, used where it's actually justified |
| 5.2 | End-to-end journey | Playwright: start → move → kill → die → corpse appears in a fresh run on the same seed | One test that proves the whole system            |
| 5.3 | Deploy             | Live on Vercel with Neon; preview deployments on PRs                                   | Managed Postgres, environment separation         |
| 5.4 | README             | GIF, playable link, the "why each API is here" table, the cut list, ADRs               | Arguing for what you removed                     |

**Gate:** Milestone 5 must be genuinely finished — deployed, green, playable by a stranger — before Milestone 6 begins.

## Milestone 6 — `apps/react-router`

The port. `packages/engine` and `packages/db` are already proven, so this is transport plus RSC composition — the most interesting 30%.

| #   | Item               | Done when                                                           | Teaches                                                   |
| --- | ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------- |
| 6.1 | Fastify + RSC boot | A Fastify server you wrote renders a React Router RSC route         | What a framework was doing for you all along              |
| 6.2 | Transport          | HTTP routes replace Server Actions; same engine, same transaction   | Status codes, serialization, an explicit API contract     |
| 6.3 | Hand-rolled cache  | A tag-indexed cache replaces `use cache` / `cacheTag` / `updateTag` | What Next's caching layer actually does, by rebuilding it |
| 6.4 | Parity             | The Milestone 1–5 vertical slice is playable here, identically      | Nothing — this is where you find out what you got wrong   |
| 6.5 | Deploy             | Live on a Node host, not Vercel                                     | Deploying a server you own                                |

## Milestone 7 — `apps/tanstack`

| #   | Item                | Done when                            | Teaches                                                        |
| --- | ------------------- | ------------------------------------ | -------------------------------------------------------------- |
| 7.1 | TanStack Start boot | App boots with RSC enabled           | A third opinion on the same problem                            |
| 7.2 | Transport           | Server functions replace HTTP routes | Where server functions sit between Server Actions and raw HTTP |
| 7.3 | Parity              | Same vertical slice, playable        | —                                                              |
| 7.4 | Deploy              | Live                                 | Nitro-style deploy targets                                     |

## Milestone 8 — The comparison

This is the actual portfolio artifact.

| #   | Item          | Done when                                                                     | Teaches                             |
| --- | ------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| 8.1 | Parity matrix | Documented proof all three implement the same features                        | Honest comparison discipline        |
| 8.2 | Measurements  | Bundle size, TTFB, lines of code, and where each framework's complexity lives | Measuring instead of asserting      |
| 8.3 | The writeup   | "Same game, three RSC implementations, here's what each costs you"            | The thing that gets read and shared |

---

## Not in scope

Multiple floors, character classes, equipment, skill trees, appraisal voting on traces, real-time multiplayer, sound. Revisit only once Milestone 8 is finished.

## Progress

Nothing built yet. Next item: **0.1 — pnpm workspace + Next app**.
