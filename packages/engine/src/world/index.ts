import type { Coordinates } from "#coordinates/index";
import { isWalkable } from "#dungeon/floor/index";
import type { Dungeon } from "#dungeon/index";

interface PlayerParty {
  position: Coordinates;
  level: number;
  floor: number;
  visibilityRadius: number;
}

export interface WorldState {
  dungeonId: string;
  playerParty: PlayerParty;
  turnCounter: number;
}

export interface Action {
  type: "move";
  direction: "north" | "south" | "east" | "west";
}

export type RejectionReason = "blocked";

interface ActionSuccess {
  ok: true;
  world: WorldState;
}
interface ActionFailure {
  ok: false;
  reason: RejectionReason;
}

export type ActionResult = ActionSuccess | ActionFailure;

// The grid is drawn with y = 0 as its top row, so north decreases y.
const DIRECTION_DELTAS: Record<Action["direction"], Coordinates> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

export const applyAction = (dungeon: Dungeon, world: WorldState, action: Action): ActionResult => {
  const currentLevel = dungeon.levels[world.playerParty.level];
  if (!currentLevel) {
    throw new Error(`Level ${world.playerParty.level} does not exist`);
  }
  const partyCurrentFloor = currentLevel[world.playerParty.floor];
  if (!partyCurrentFloor) {
    throw new Error(`Floor ${world.playerParty.floor} does not exist on level ${world.playerParty.level}`);
  }

  const delta = DIRECTION_DELTAS[action.direction];
  const target: Coordinates = {
    x: world.playerParty.position.x + delta.x,
    y: world.playerParty.position.y + delta.y,
  };

  if (!isWalkable(partyCurrentFloor, target)) {
    return { ok: false, reason: "blocked" };
  }

  return {
    ok: true,
    world: {
      ...world,
      playerParty: { ...world.playerParty, position: target },
      turnCounter: world.turnCounter + 1,
    },
  };
};
