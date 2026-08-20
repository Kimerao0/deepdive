import { step, type Coordinates, type Direction } from "#coordinates/index";
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
  direction: Direction;
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

export const applyAction = (dungeon: Dungeon, world: WorldState, action: Action): ActionResult => {
  const currentLevel = dungeon.levels[world.playerParty.level];
  if (!currentLevel) {
    throw new Error(`Level ${world.playerParty.level} does not exist`);
  }
  const partyCurrentFloor = currentLevel[world.playerParty.floor];
  if (!partyCurrentFloor) {
    throw new Error(`Floor ${world.playerParty.floor} does not exist on level ${world.playerParty.level}`);
  }

  const target: Coordinates = step(world.playerParty.position, action.direction);

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
