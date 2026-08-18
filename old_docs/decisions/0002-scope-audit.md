# 0002 — Scope and architecture decisions from the 2026-08-06 audit

**Date:** 2026-08-06
**Status:** Accepted

## Context

A full audit of the design spec, roadmap, agents and skills found four places where the spec and the roadmap genuinely disagreed. Each was resolved by Alessandro; this ADR records the decisions so the two documents stop diverging. The spec and roadmap are amended to match.

## Decisions

| Question                                                                     | Decision                                                                                              | Consequence                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floors: spec assumes descending, roadmap said "multiple floors" out of scope | **Descend is core.** The vertical slice has one floor; descending lands before Milestone 5 ships      | `depth`, stairs, and the `<Activity>` next-floor prefetch stay meaningful. Roadmap gains descent items; "multiple floors" leaves Not-in-scope                                                                                          |
| Loot: in the core loop, UI and Server Actions, but no milestone built it     | **Minimal loot.** One consumable item type: engine rules in Milestone 1, inventory UI in Milestone 3  | Core loop stays honest. Equipment beyond the single consumable remains out of scope                                                                                                                                                    |
| Where the action transaction lives                                           | **`packages/db` exposes a transaction helper that takes a callback; each app injects `engine.apply`** | The `FOR UPDATE → insert → state write` shape is written once. `db` never imports `engine` — the spec's dependency matrix stays true. The three apps still differ at the transport layer, which is where the comparison is interesting |
| `players.github_id` and `traces.appraisals` columns for unbuilt features     | **Drop until real.** 2.1 creates only columns something writes                                        | Adding a column later is a routine migration — the skill 2.1 exists to teach. GitHub account linking joins Not-in-scope                                                                                                                |

## The boundary matrix (settles 0.3)

| From \ may import | engine | db  | apps                  |
| ----------------- | ------ | --- | --------------------- |
| `packages/engine` | —      | ✗   | ✗                     |
| `packages/db`     | **✗**  | —   | ✗                     |
| `apps/*`          | ✓      | ✓   | ✗ (never another app) |

The `db ✗ engine` cell is the one this audit decided: the transaction helper receives the apply function as an argument, so `db` stays rules-free and the lint zone enforces it.
