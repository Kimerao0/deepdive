# 0001 — Stack

**Date:** 2026-08-03
**Status:** Accepted

## Context

deepdive is a learning project and a public portfolio repo, with two goals that partly conflict: learn modern React deeply, and strengthen backend skills. Every dependency has to justify itself, and the rejections are part of the deliverable.

## Decisions

| Area | Choice | Why |
|---|---|---|
| Package manager | **pnpm** workspaces | Workspace support for the three-app plan. Its strictness about phantom dependencies mechanically reinforces the `engine/` boundary rule. |
| Frontend framework (first app) | **Next 16.2.12** | The only mature RSC implementation. See "RSC maturity" below. |
| React | **19.2.8** | Stable. `Activity`, `useEffectEvent`, `useOptimistic`, `use`, `cacheSignal` all confirmed exported. |
| Styling | **CSS Modules + custom properties** | Zero runtime, RSC-native, no client boundary needed to style a static panel. A tile grid is a real CSS problem worth solving. Custom properties in `:root` make tile size and theming changeable from one place. |
| UI kit | **none** | Counted the components: tile grid, two stat bars, a log, a trace list, some buttons, mobile tabs. MUI or Ant would ship a DataGrid and 300kb of theming to render none of it, on Emotion, which fights RSC. |
| Database | **Postgres** | Transactions and row locks are the architecture, not a detail. |
| ORM | **Drizzle** | Typed schema, real migrations, SQL stays visible. |
| Driver | **`pg` + `drizzle-orm/node-postgres`** | See "The driver trap" below. |
| Local database | **Docker Compose Postgres** | Matches the CI service container. Real locking semantics. |
| Hosted database | **Neon** | Branch per PR, scale to zero. |
| Validation | **Zod** | Room templates and API boundaries. |
| Unit tests | **Vitest + fast-check** | The engine is pure, so property-based testing is cheap and the determinism invariant is expressible. |
| E2E | **Playwright** | One journey through the whole system. |
| Hosting (first app) | **Vercel** | Zero-config for Next. Later apps deploy to a Node host on purpose. |

## The driver trap

`drizzle-orm/neon-http` is the default nearly every tutorial reaches for, and **it cannot run transactions.** This project's entire server design is one transaction containing a row lock, an insert that may conflict, and a state write.

Choosing that driver would produce a build where the idempotency test passes locally and the invariant is quietly false in production. `pg` + `drizzle-orm/node-postgres` works identically against local Docker and against Neon, and teaches ordinary Postgres that transfers anywhere.

`@neondatabase/serverless` + `drizzle-orm/neon-serverless` also supports transactions and was the rejected alternative: it is Neon-specific knowledge, and the goal is transferable backend skill.

## RSC maturity — why Next first

Investigated 2026-08-03, from the packages themselves rather than documentation claims:

| | Framework | RSC layer | Weekly downloads |
|---|---|---|---|
| Next | 16.2.12 stable | stable, reference implementation | 54.8M |
| React Router | 8.3.0 stable | **experimental** — all 30 RSC exports `unstable_`-prefixed | 51.4M |
| TanStack Start | 1.168.34 stable | **`@tanstack/react-start-rsc@0.1.33`** | 16.5M |
| Waku | 1.0.0-beta.8 | RSC-first by design | 26K |
| `@vitejs/plugin-rsc` | 0.5.32 | the raw layer the others build on | 2.17M |

React Router's own documentation: *"React Server Components support is experimental and subject to breaking changes in minor/patch releases."* Breaking changes in patch releases.

`react-server-dom-webpack` is published at `19.2.8`, in lockstep with React itself — confirming RSC is a React feature, not a Next feature. But React ships only the plumbing; a framework must wire it up.

**Consequence:** Next goes first because it is where RSC works, so the learning goal is served rather than spent debugging bundlers. The other two follow as ports, once the engine and database are proven.

## Next-proprietary surface

`use cache`, `cacheTag`, `updateTag` and PPR (now via top-level `cacheComponents: true`) are Next-only. Nothing else has them.

This is accepted deliberately and quarantined: the Next-specific surface stays confined to a small number of files so the coupling is measurable, and `apps/react-router` replaces it with a hand-rolled tag-indexed cache in Milestone 6.3 — which is a better way to learn what that layer does than using it.

`experimental.ppr` is deprecated in Next 16; PPR arrives through top-level `cacheComponents`. Both `reactCompiler` and `cacheComponents` are **top-level** `NextConfig` keys, not under `experimental` — verified against `next@16.2.12` typings.

## Rejected

- **Fastify + React SPA as the only app** — would cut RSC, `use cache`, PPR and `use()` promise-passing, roughly 40% of the React surface the project exists to explore. Retained instead as `apps/react-router`, where RSC survives *and* the HTTP layer is hand-written.
- **Tailwind** — a tile grid in utility classes is unreadable, and it says nothing about CSS ability.
- **shadcn/ui** — works by copying components into the repo, which contradicts the rule that Alessandro writes every line.
- **Redux / Zustand / `useSyncExternalStore`** — state is server plus optimistic overlay. Nothing to store.
- **`<ViewTransition>`** — not exported from `react@19.2.8`; experimental channel only.
- **Canvas** — if the reconciler doesn't render the game, the project has no thesis.
- **PGlite for tests** — WASM Postgres, and row-locking semantics are exactly where a subtle difference would be invisible and fatal.
