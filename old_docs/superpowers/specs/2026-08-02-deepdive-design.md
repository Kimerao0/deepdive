# deepdive — Design

**Date:** 2026-08-02
**Amended:** 2026-08-03 — extended to three RSC implementations; stack decisions moved out
**Amended:** 2026-08-06 — audit decisions: descend confirmed core, minimal loot added to scope, action transaction moved to a `packages/db` helper, unbuilt-feature columns dropped from the schema. See `docs/decisions/0002-scope-audit.md`
**Status:** Approved
**Author:** Alessandro Ceruti

> **Authority note.** This document owns the _game and architecture_ design: the isomorphic engine, the action lifecycle, the data model, the social layer, and the testing strategy. It does **not** own stack choices or repository structure — `docs/decisions/0001-stack.md` supersedes it on those, and wins in any conflict. Where this document says "Next", read "the first of three apps".

---

## 1. Purpose

`deepdive` is a public portfolio repository with two jobs:

1. **Learning.** Deepen modern React (19.2) knowledge and strengthen backend skills — the author's weaker area — through server-authoritative state, transactions, and cache invalidation.
2. **Evidence.** Show a technical recruiter or engineer, in under two minutes, that the author can design a system, justify every dependency, and ship it green and deployed.

The design below is implemented **three times** — on Next, on React Router + Fastify, and on TanStack Start — sharing one engine and one database. The game is the fixture; the comparison of RSC implementations is the artifact. See `docs/roadmap.md` for sequencing, and note the gate: the Next app must be finished and deployed before the second begins.

**Guiding principle:** every modern React API in this project must solve a real problem in this project. APIs that would only be present as a showcase are explicitly rejected, and the rejections are documented — the cut list is part of the deliverable.

**Non-goal:** being a good game. It must be legible and playable, not deep or balanced.

---

## 2. The game

A turn-based grid dungeon crawler. The player descends floors generated from a seed, fights enemies in turn-based combat, collects loot, and dies.

When a player dies, their corpse persists **in other players' dungeons that share the same seed**, alongside short messages other players have left on the floor. No real-time multiplayer.

**Core loop:** move on a grid → encounter enemy → turn-based combat → loot → descend → die → leave a trace.

---

## 3. Architectural thesis

The centre of the project is a **pure, deterministic rules engine** that runs identically on client and server.

```ts
const [world, applyAction] = useOptimistic(serverWorld, (w, action) => {
  const result = engine.apply(w, action);
  return result.ok ? result.world : w; // illegal move: predict no change
});
```

The optimistic reducer _is_ the game's rulebook. The client predicts the player's move using the same rules the server uses to authorise it; if the server disagrees, React rolls back.

Note the adapter: `engine.apply` returns `Ok | Rejected`, while a `useOptimistic` reducer must return a state. The client collapses a rejection to "no change". This has a useful consequence — **an obviously illegal action (walking into a wall) is rejected locally and never reaches the network at all.** Only actions the client believes are legal are dispatched, so a server rejection means a genuine divergence (stale state, tampering, a race) and is worth surfacing in the log.

This is client-side prediction — a real, classic problem in game engineering — solved with the React primitive built for it. Everything else in the design hangs off this decision:

- The server is authoritative because `engine.apply` also runs there, inside a Postgres transaction.
- The client is instant because `engine.apply` also runs in the browser.

### Rejected alternatives

| Alternative                                 | Why rejected                                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server Actions only, no client engine       | Simpler and more "RSC-pure", but every step waits on the network and `useOptimistic` has nothing to compute. Laggy game, uninteresting architecture. |
| Client engine only, server stores snapshots | Responsive, but the server is not authoritative — it discards the point of the project.                                                              |

---

## 4. Modules and boundaries

One rule holds the design together: **`packages/engine` imports nothing from any other module.** No React, no Drizzle, no framework, no `Math.random`, no `Date.now`. Enforced by an ESLint import-boundary rule in CI, not by discipline.

That rule is also what makes the three-app plan possible: a framework-free engine can be consumed by any of them unchanged.

| Location          | Responsibility                                                                                                                                                                                                                          | Depends on  | Shared         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------- |
| `packages/engine` | `apply(world, action) → Ok(world') \| Rejected(reason)`. Seeded generation, combat, loot, rules. Pure and deterministic.                                                                                                                | nothing     | all three apps |
| `packages/db`     | Drizzle schema, repositories, and the action-transaction helper: it owns the `FOR UPDATE → insert → state write` shape and receives the apply function as a callback, so it never imports the engine (ADR 0002). Knows rows, not rules. | drizzle, pg | all three apps |
| `packages/ui`     | Presentational components. Do not know what a dungeon is. Extracted only once duplication proves what's genuinely common — not designed up front.                                                                                       | nothing     | eventually     |
| `apps/*/server`   | The transport and the only place with authority: it invokes the db transaction helper with `engine.apply` injected. Server Actions in Next, HTTP routes in React Router, server functions in TanStack.                                  | engine, db  | per app        |
| `apps/*/app`      | RSC tree and the few Client Components. Orchestration, not logic.                                                                                                                                                                       | server, ui  | per app        |

**`apps/*` may never import from another app.** Also lint-enforced — without it, the comparison quietly turns into shared code with three thin wrappers, which measures nothing.

Randomness and time enter the engine only as explicit inputs (seed, tick counter), never ambient. This is what makes determinism testable, and the determinism test is what makes three implementations comparable at all.

---

## 5. Action lifecycle

One step north:

1. Client: arrow key → `startTransition` → `applyOptimistic({ type: 'move', dir: 'N', seq: 42 })`
2. `engine.apply` runs **in the browser**; the grid updates in the same frame.
3. In parallel, Server Action `submitAction(runId, action)` is dispatched.
4. Server: `BEGIN` → load world → `engine.apply` → persist → `COMMIT`
5. Authoritative state returns; React discards the optimistic overlay.
6. On rejection (wall, zero HP, out-of-turn action): the overlay is dropped, the grid snaps back, and the reason is written to the log panel.

`seq` is a per-run **idempotency key**. Double clicks, network retries, and duplicated tabs must not apply an action twice — without it, a double keypress walks the player through a wall.

---

## 6. React API decisions

### In scope

| API                               | Problem it solves here                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useOptimistic`                   | Movement prediction and rollback. The reducer is `engine.apply`.                                                                                                                                        |
| `useTransition`                   | Input stays responsive while the action is in flight; `isPending` drives the "server thinking" indicator.                                                                                               |
| `useEffectEvent`                  | The keyboard listener subscribes **once** and always reads current world state. The stale-closure problem, and its intended cure.                                                                       |
| Server Actions + `useActionState` | Discrete commands: start run, descend, use item, leave a message. Pending and error state come for free.                                                                                                |
| RSC                               | Room descriptions, bestiary, lore, trace content. Text that never ships as client JS.                                                                                                                   |
| `use cache` + `cacheTag`          | Floors are deterministic from a seed, therefore genuinely cacheable. Tag `floor:{seed}:{depth}`. Trace queries are tagged and invalidated with `updateTag` on write. Real invalidation, not decorative. |
| `Suspense` + PPR                  | Dungeon shell prerendered, player state dynamic, traces streamed: the game is playable before the social layer loads.                                                                                   |
| `use()`                           | The traces promise is passed from RSC to a Client Component without awaiting, resolved inside Suspense.                                                                                                 |
| `<Activity>`                      | Two justified uses only: mobile tab panels (kept mounted so scroll/state survive), and prefetching the next floor while the player stands on the stairs.                                                |
| React Compiler                    | No hand-written `memo` / `useMemo` / `useCallback`. Backed by a profiler screenshot in the README.                                                                                                      |

### Explicitly cut, and documented in the README with rationale

- **`useSyncExternalStore`** — there is no external store. State is server plus optimistic overlay. It would be present purely for display.
- **Redux / Zustand** — same reason. Also the visible difference from the author's earlier `Liebyrinth` project.
- **`<ViewTransition>`** — verified on 2026-08-02: not exported from `react@19.2.8` (experimental channel only). CSS transitions instead, with an honest TODO.
- **`useDeferredValue`** — nothing is expensive enough to defer. Admitted only if the profiler says otherwise.
- **`forwardRef`** — in React 19 `ref` is an ordinary prop. Legacy.
- **WebSockets / real-time** — excluded by design; the social layer is asynchronous.
- **Canvas** — if the reconciler does not render the game, the project has no thesis. The grid is DOM.

---

## 7. Data model

Postgres (Neon) with Drizzle.

| Table     | Columns                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `players` | `id`, `session_id` (signed cookie), `display_name` (nullable), `created_at` — `github_id` dropped until the linking feature is roadmapped (ADR 0002)                                      |
| `runs`    | `id`, `player_id`, `seed`, `depth`, `status` (`active` \| `dead` \| `escaped`), `world` (jsonb), `last_seq`, `created_at`, `ended_at`                                                     |
| `actions` | **PK `(run_id, seq)`**, `payload` (jsonb), `created_at`                                                                                                                                   |
| `traces`  | `id`, `seed`, `depth`, `x`, `y`, `kind` (`corpse` \| `message`), `body`, `killed_by`, `author_run_id`, `created_at` — `appraisals` dropped: the voting feature is out of scope (ADR 0002) |

### The action transaction

```sql
BEGIN
  SELECT * FROM runs WHERE id = $1 FOR UPDATE;   -- row lock: concurrent tabs serialise
  INSERT INTO actions (run_id, seq, payload);     -- unique violation = already applied
  -- world' = engine.apply(world, action)
  UPDATE runs SET world = $2, last_seq = $3;
COMMIT;
```

Idempotency is a **database constraint**, not application code. If the INSERT conflicts, the action already ran: respond with current state and do nothing. `FOR UPDATE` serialises concurrent requests against the same run.

**Snapshot plus action log, deliberately both:** the `runs.world` snapshot is the read truth (fast); the `actions` log gives replay, debugging, and idempotency. Pure event sourcing (replaying the log) would be more elegant and slower; it is not built, but the log keeps the door open.

---

## 8. Asynchronous social layer

- **Corpses.** On death, a `corpse` trace is written at the death tile with the cause. Players on the same `seed` and `depth` see it.
- **Messages.** Composed from a **closed vocabulary** (template plus noun, Dark Souls style), never free text. This is a product decision, not laziness: it eliminates moderation, abuse, and XSS at the source, and makes the content translatable. Documented as such in the README.
- **Queries** by `(seed, depth)`, cached with `cacheTag`, invalidated with `updateTag` on write. Those two are **Next-proprietary**; the other two apps replace them with a hand-rolled tag-indexed cache, which is a better way to learn what that layer does than using it.
- **Rate limit** per session, otherwise the first bot fills the dungeon.
- **The seed lives in the URL** — a shareable link: _"replay the dungeon I died in."_

Traces displayed in-game are **contextual to the current room**, not a global feed.

---

## 9. UI layout

**Three columns (desktop):**

- **Left:** character (HP, XP, stats) and inventory — always visible.
- **Centre:** the dungeon grid, DOM elements, one node per tile.
- **Right:** event log, and the traces present in the current room.

Nothing is hidden behind a panel toggle on desktop. Immediate legibility was chosen over feature display.

**Mobile:** the side columns collapse into tabs below the grid, kept mounted via `<Activity>` so scroll position and state survive tab switches.

**Styling:** CSS Modules with custom properties in `:root` for tile size, colours and spacing — no UI kit, no utility framework. Zero runtime, so styling a static panel never forces a client boundary. Rationale and rejected alternatives in ADR 0001.

**Identity:** anonymous signed-cookie session — open the link and play, no registration. Optional GitHub link afterwards to make the save durable. Zero friction is a product feature here: a recruiter will not sign up for a portfolio game.

---

## 10. Testing strategy

Ordered by return on investment.

1. **`packages/engine` — unit tests (Vitest), high coverage, no excuses.** Pure and deterministic: no mocks, no setup, fast. Property-based tests (fast-check) on the invariant that matters: _applying the same action sequence to the same seed always yields the same world._ If that holds, client and server cannot diverge — and neither can the three apps. This is the test that justifies the architecture.
2. **The transport layer — integration tests against real Postgres** (local Docker Compose, not a mock). The required test: _two concurrent calls with the same `seq` apply exactly once._ Written once per app, since each has a different transport.
3. **Playwright — few and targeted.** One journey: start run → move → kill an enemy → die → confirm the corpse appears in a fresh run with the same seed.

**No tests on presentational components** — they prove nothing and break on their own.

---

## 11. CI/CD and deployment

- **GitHub Actions:** typecheck, lint (including both import-boundary rules), unit, integration, build. Branch protection on `main`.
- **Postgres:** Docker Compose locally and as a CI service container; **Neon** for deployed environments.
- **Hosting:** `apps/next` on Vercel. `apps/react-router` on a Node host, deliberately — deploying a server you wrote yourself is part of the point. `apps/tanstack` wherever its adapters reach.
- `main` is always green and always deployable — the standing commitment that comes with incremental development and no deadline.

**Pinned versions verified on npm:** `react@19.2.8`, `next@16.2.12` (2026-08-02); `react-router@8.3.0`, `@tanstack/react-start@1.168.34` (2026-08-03). Full stack rationale in ADR 0001.

---

## 12. README plan

The README is read more often than the code.

- A 10-second GIF at the top, and the playable link. If the reader has to read to understand what this is, it has failed.
- **"Why each React API is here"** — the table from section 6, _including the cut list and its reasoning_. Anyone can add a dependency; few can argue for what they removed.
- The transaction diagram, with `(run_id, seq)` explained as database-level idempotency.
- Short ADRs for the three load-bearing decisions: isomorphic engine, asynchronous social layer, closed message vocabulary.

---

## 13. First milestone — the vertical slice

Development is incremental with no deadline, but the first milestone is a complete vertical, not a broad skeleton:

- One generated floor (procedural layout, curated room set)
- Movement with optimistic prediction and server rollback
- One enemy type, turn-based combat
- Death, with a corpse trace written
- Traces from other runs visible on the same seed
- Anonymous session persistence
- Deployed, green CI, README with GIF

This slice is built **on `apps/next` only**. Everything else — multiple floors, classes, equipment, skill trees, appraisals — comes after, and only if the slice is genuinely finished.

**The gate:** `apps/react-router` does not begin until this slice is deployed, green, and playable by a stranger. A repo with one finished app and two half-built ones reads worse than one finished app, and the three-way comparison is void unless all three implement the same feature set.

---

## 14. Risks and open questions

| Risk                                                                                                    | Mitigation                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React Compiler behaviour under Next 16 is not fully predictable                                         | Verify early in the slice; the fallback is manual memoisation, which would need a README correction                                                                        |
| `<Activity>` on mobile may not preserve everything expected                                             | Verify with a real device before relying on it; if it fails, cut it and say so                                                                                             |
| Optimistic rollback may feel jarring when the server rejects                                            | Tune with a brief visual "rejected" state rather than a silent snap-back                                                                                                   |
| Cost of an always-on Neon instance                                                                      | Neon free tier plus scale-to-zero; monitor                                                                                                                                 |
| Procedural generation producing unplayable floors                                                       | Connectivity invariant in the generator, covered by property-based tests                                                                                                   |
| **Scope: three apps is the main threat to finishing at all**                                            | Hard gate above. If the second app stalls, the honest move is to delete it and ship the Next app alone rather than leave it half-built                                     |
| **React Router and TanStack RSC APIs are experimental** (`unstable_`-prefixed and `0.1.x` respectively) | They come last, when the engine and database are already proven, so breakage costs transport code and not the project. Pin exact versions; expect breaks in patch releases |
| **`packages/ui` shared across three bundlers**                                                          | Don't share it up front. Duplicate, then extract once duplication shows what is genuinely common                                                                           |

**Decided:** curated rooms are authored as **data** — JSON templates validated by a Zod schema at load time, placed by the generator. Not code. This keeps `engine/` pure (content is an input, not a branch), keeps authored content diffable in review, and makes the room set testable as fixtures.
