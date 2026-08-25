# deepdive — Player view plan

Decided 2026-08-18, last updated 2026-08-25. Covers the step from "the engine generates dungeons" to "a player walks through one". The generation work (rooms, floors, dungeons, difficulty profiles) is done and tested; this plan builds the play loop on top of it.

**Where it stands: slices 1 and 2 are done** — the engine can move a party and project what it sees, 62 tests green. Slice 3, the server, is next.

## Decisions

| Decision                 | Choice                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What the client receives | Only the tiles within the player's **visibility radius**, per response. Never the whole floor.                                                                                                                                | The server stays the only holder of the map: map-hacking is structurally impossible. A map-drawing skill and a visibility-range skill will extend this later — which is why the radius is a player stat from day one, not a constant.      |
| Explored-area memory     | **None for now.** The client renders the current view only.                                                                                                                                                                   | Remembering explored tiles is the future map-drawing skill's job. Building fog-of-war memory now would pre-empt a gameplay feature.                                                                                                        |
| Where game state lives   | On the server, keyed by run. Starts as an in-memory store; moves to `packages/db` in a later slice.                                                                                                                           | State must be authoritative and survive the request. In-memory keeps the first slices fast to build; the store sits behind one interface so the db swap is contained.                                                                      |
| Transport                | **Server Actions**, request/response. No WebSockets.                                                                                                                                                                          | Turn-based and single-player: every state change is a response to the player's own action. Nothing is server-initiated, so a socket buys nothing and complicates hosting.                                                                  |
| Idempotency              | Every action carries a per-run `seq` number; the server applies each `seq` once.                                                                                                                                              | Double keypresses and network retries must not walk the player two tiles.                                                                                                                                                                  |
| Client prediction        | The engine ships to the client too. `useOptimistic` uses the engine's `predictAction` as its reducer over the **visible view**; the Server Action confirms with `applyAction` in parallel and React rolls back on divergence. | The move renders in the same frame without giving up server authority. A one-tile move always targets a tile inside the current view, so local validation never lacks information.                                                         |
| Client state             | Server view + optimistic overlay. No Redux/Zustand.                                                                                                                                                                           | There is no external store; adding one would be decorative.                                                                                                                                                                                |
| Where dungeons come from | A curated set of pre-generated dungeons, stored server-side and shared by every player. No seeded determinism.                                                                                                                | Dungeons are content, not computation: generating a few good ones once and saving them is simpler than making generation reproducible. A player-facing "create random dungeon" runs the same generator and stores the result the same way. |
| Scope                    | `apps/next` only.                                                                                                                                                                                                             | The old three-app comparison is parked, not decided; nothing in this plan blocks it later since the engine stays framework-free.                                                                                                           |

## Rendering and art

**DOM + CSS, no canvas, no rendering library.** The view is bird's-eye, the avatar fixed at the center of the screen, the world sliding underneath it. A radius-limited turn-based view is at most a couple hundred tiles — the reconciler renders the game, which is the point of the React deep dive. The boundary that would change this choice: real-time ambitions (dozens of simultaneously animating entities, projectiles, particles) are canvas territory; a turn-based crawler is not.

- **Scale**: one CSS custom property (`--tile`) is the world unit — one tile = one square meter, the avatar one tile tall. Every size derives from it, so zooming is one variable.
- **Camera**: the avatar is a fixed element; the tile container gets a `transform: translate(…)` computed from the player position, with a CSS transition — a step is a ~150ms slide of the floor, animated by the compositor, off React's render path. The transform derives from the optimistic player position, so prediction, the slide, and rollback share one source of truth.
- **Radius edge**: the payload only contains in-radius tiles; a radial `mask-image` on the container gives the torchlight falloff.
- **Sprites, without a library**: one packed sprite-sheet PNG per tileset on a fixed grid; a tile is a div whose only React-controlled surface is a `data-tile` attribute — the attribute-to-sheet-coordinates mapping lives in CSS (`background-position`). `image-rendering: pixelated` keeps 16px art crisp at any `--tile` size; `animation-timing-function: steps(n)` does frame-by-frame sprite animation in pure CSS. Characters get their own sheets, one row per facing direction. Drawing pixels _in_ CSS (box-shadow art) is banned for world tiles — hundreds of 256-shadow paints against the optimization goal.

**Art pipeline: AI-generated, hand-finished** (researched 2026-08-18). Primary tool: **PixelLab** (pixellab.ai) — text-to-pixel characters with automatic 4/8-direction rotations, skeleton/text animation, top-down tileset generation, style-consistent editing, sprite-sheet export; $12/mo entry tier, free trial. Quality alternative: **Retro Diffusion** (retrodiffusion.ai) — best raw pixel-art model of the comparisons, ~$0.01/image on the site or a one-time $65 Aseprite extension, but no automatic rotations and manual sheet assembly. Validation path: PixelLab trial on one castle tileset plus one 4-direction walk cycle; if quality disappoints, the same prompt on Retro Diffusion credits before committing. Either way, finish frames in Aseprite — AI output smudges silhouettes and leaks palette colors; the manual pass is what makes 17 tilesets read as one style.

## Slices

Each slice is a PR: shippable, lint-green, tested.

### 1. Player and movement in the engine — done

`#world/index` holds `WorldState` (a `dungeonId`, a `playerParty` with position, level and floor indices and visibility radius, and a turn counter) and `applyAction(dungeon, world, action)`, returning `ActionResult`: `ok` with the next world, or a rejection carrying a `RejectionReason` code. The dungeon arrives as a parameter rather than living in the state, so the mutable part stays small enough to copy on every keystroke and to store per run. Walkability is `isWalkable(floor, position)` in `#dungeon/floor/index` — room tiles and corridors, entries needing no case of their own since every entry sits on a corridor cell. A missing level or floor throws: a corrupt world is not a move a player could attempt.

Tests pin legal moves, all four directions against a hand-built fixture floor, blocked moves, turn accumulation, immutability of the input world, and both corrupt-state throws. Falsified by flipping the axis table and by mutating in place; both went red.

### 2. Visibility in the engine — done

`#view/index` holds `getFloorView(floor, partyPosition, visibilityRadius)` returning a `FloorView`: `tiles`, a dense row-major `ViewTileKind[][]` square of side `2r + 1`, plus the party's absolute position as the anchor the client reconciles against. Kinds are `room | door | corridor | entry | void`, the more specific fact winning where a cell qualifies twice, and a lookup miss meaning `void` — which covers interior rock and off-grid cells with no bounds checks.

Prediction is `predictAction(view, from, action)` returning `moved | blocked | unknown`. It takes `from` separately because the predicted position drifts ahead of the last authoritative one while responses are in flight, and it returns a position rather than a synthesised view, since the newly revealed ring is genuinely unknown until the server answers.

The axis table that both sides depend on now lives once, as `Direction` and `step()` in `#coordinates/index`: a second copy could disagree, and the symptom — moving the wrong way only when predicted — would be near-invisible.

Tests pin window geometry across radii, row-major orientation, kind precedence, void handling at floor edges and negative coordinates, `unknown` never collapsing into `blocked`, prediction reaching exactly `radius` steps, and agreement with `applyAction` across 100+ moves on a generated floor. Falsified three ways — collapsing `unknown`, reversing precedence, transposing the grid — each caught.

Two rules this slice settled, which the client slices inherit:

**The wire never carries a tile the player could not see** — exactly the visibility radius, no margin. A predicted move therefore leaves the newly revealed outer ring unknown until the authoritative response lands, and the client renders it dark for those few milliseconds. Sending radius + 1 so prediction could cover the reveal was rejected: a reader of the response would know something the party does not. The square window _is_ the visibility rule; the round torchlight is a rendering effect over cells the party legitimately sees, dimming its corners rather than hiding them.

**`unknown` is not `blocked`.** Prediction reaches at most `visibilityRadius` steps ahead, so held-down keys eventually target a tile the client knows nothing about; there it stops predicting and waits for the server. Conflating the two would be a real bug rather than a cosmetic one: locally rejected moves are never dispatched, so a false rejection swallows a legal action outright.

### 3. Run lifecycle on the server

Start-run Server Action: picks a dungeon (generated on the spot while the store is in-memory; the stored catalog arrives with slice 5), places the player on the dungeon entrance — the reserved surface-door entry of the first floor — creates the run, returns the first view. Action-submit Server Action: validates `seq`, runs `applyAction` against the authoritative world, persists, returns the new view via `getFloorView` (or the rejection). Done when: two browser tabs on the same run cannot desync it, and a replayed `seq` applies once.

### 4. The playable client

The dungeon page becomes the game: an RSC shell, a client grid that renders the current view, keyboard movement through `useOptimistic` + `useTransition`, a subscribed-once listener via `useEffectEvent`, and visible rejection feedback. The debug dungeon viewer moves behind a separate route instead of being deleted. Done when: walking around a floor feels instant, a forced server rejection snaps back visibly, and the network tab shows view-sized payloads only.

### 5. Persistence

The in-memory store is replaced by `packages/db`: runs and actions tables, the action applied inside a transaction with a row lock. Done when: a server restart loses nothing and the concurrency test from slice 3 still passes against Postgres.

## Later, and why it is not in this plan

- **Stairs and inter-floor movement** — needs entry-to-entry traversal UX; the connections data already supports it.
- **Map-drawing skill** — introduces explored-tile memory per run; the view payload gains a "discovered" channel then, not before.
- **Visibility skill** — changes the radius stat the engine already reads.
- **Enemies, combat, turn order** — a second actor in `apply`, after movement is proven.
- **"Share this dungeon"** — a player who completes a random dungeon can publish it into the shared catalog; cheap once dungeons are stored rows.

## Known risks

- **The in-memory store only works on a single long-lived process.** Serverless hosting (Vercel) runs many short-lived instances with separate memories: runs would randomly vanish or fork between requests. Slices 1–4 are therefore local-dev only; slice 5 is a hard prerequisite for any deploy, not an optimization.

- A stored dungeon is large: a hard one serializes to hundreds of KB of JSON. But dungeons are stored **once** in the shared catalog and referenced by runs — a run row carries only the player state and the dungeon id, so run volume never multiplies the big payload.
- `engine.apply` on the client sees only the view, not the floor. Every one-step action is fully checkable, but any future action with longer reach (ranged attack, dash) must be designed against the view, or accepted as server-checked only.
