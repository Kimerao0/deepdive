import type { EntityId, Seed, Seq } from "./brands.js";

type Direction = "N" | "S" | "E" | "W";

interface Position {
  readonly x: number;
  readonly y: number;
}
interface Player {
  readonly id: EntityId;
  readonly pos: Position;
  readonly hp: number;
}

type RunStatus = { readonly kind: "active" } | { readonly kind: "dead" };

interface WorldState {
  readonly seed: Seed;
  readonly depth: number;
  readonly rngCursor: number;
  readonly status: RunStatus;
  readonly player: Player;
}

type RejectionReason = "out-of-bounds" | "blocked";

interface MoveAction {
  readonly type: "move";
  readonly dir: Direction;
  readonly seq: Seq;
}

type Action = MoveAction;

type ApplyResult = { readonly ok: true; readonly world: WorldState } | { readonly ok: false; readonly reason: RejectionReason };
