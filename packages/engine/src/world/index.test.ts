import { describe, expect, it } from "vitest";
import type { Coordinates } from "#coordinates/index";
import type { Floor } from "#dungeon/floor/index";
import type { Dungeon } from "#dungeon/index";
import { applyAction, type Action, type WorldState } from "#world/index";

// A hand-built floor: generated dungeons are random, so predicting which
// direction is walkable would mean re-implementing the rules in the test.
//
//      x0 x1 x2 x3 x4 x5      C corridor    D room door
//  y0   .  .  .  .  .  .      S start       R room tile
//  y1   .  .  C  .  .  .
//  y2   .  .  S  C  C  .
//  y3   .  .  .  .  D  R
//  y4   .  .  .  .  R  R
//  y5   .  .  .  .  .  .
const START: Coordinates = { x: 2, y: 2 };

const floor: Floor = {
  gridSize: 8,
  corridors: [
    { x: 2, y: 1 },
    START,
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ],
  entries: [{ x: 2, y: 1 }],
  rooms: [
    {
      tileSet: "castle",
      tiles: [
        { position: { x: 4, y: 3 }, isEntrance: true },
        { position: { x: 5, y: 3 }, isEntrance: false },
        { position: { x: 4, y: 4 }, isEntrance: false },
        { position: { x: 5, y: 4 }, isEntrance: false },
      ],
    },
  ],
};

const dungeon: Dungeon = {
  difficulty: "easy",
  levels: [[floor]],
  connections: [],
  entrance: { level: 0, floor: 0, entry: 0 },
};

const worldAt = (position: Coordinates): WorldState => ({
  dungeonId: "test-dungeon",
  playerParty: { position, level: 0, floor: 0, visibilityRadius: 5 },
  turnCounter: 0,
});

const move = (direction: Action["direction"]): Action => ({ type: "move", direction });

describe("applyAction", () => {
  it("should move the party one tile and advance the turn", () => {
    const result = applyAction(dungeon, worldAt(START), move("east"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.world.playerParty.position).toEqual({ x: 3, y: 2 });
    expect(result.world.turnCounter).toBe(1);
  });

  // The fixture gives each direction from START a different outcome, so a
  // flipped axis fails here instead of silently moving the wrong way.
  it.each([
    { direction: "north" as const, target: { x: 2, y: 1 }, walkable: true },
    { direction: "south" as const, target: { x: 2, y: 3 }, walkable: false },
    { direction: "east" as const, target: { x: 3, y: 2 }, walkable: true },
    { direction: "west" as const, target: { x: 1, y: 2 }, walkable: false },
  ])("should send $direction to $target", ({ direction, target, walkable }) => {
    const result = applyAction(dungeon, worldAt(START), move(direction));

    expect(result.ok).toBe(walkable);
    if (result.ok) expect(result.world.playerParty.position).toEqual(target);
  });

  it("should let the party walk into a room", () => {
    const result = applyAction(dungeon, worldAt({ x: 4, y: 2 }), move("south"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.world.playerParty.position).toEqual({ x: 4, y: 3 });
  });

  it("should reject a move into the void as blocked", () => {
    const result = applyAction(dungeon, worldAt(START), move("west"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("blocked");
  });

  it("should accumulate a turn per successful move", () => {
    const first = applyAction(dungeon, worldAt(START), move("east"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyAction(dungeon, first.world, move("east"));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.world.playerParty.position).toEqual({ x: 4, y: 2 });
    expect(second.world.turnCounter).toBe(2);
  });

  it("should never mutate the world it is given", () => {
    const world = worldAt(START);
    const result = applyAction(dungeon, world, move("east"));

    expect(world.playerParty.position).toEqual(START);
    expect(world.turnCounter).toBe(0);
    if (!result.ok) return;
    expect(result.world).not.toBe(world);
    expect(result.world.playerParty).not.toBe(world.playerParty);
  });

  it("should carry the fields a move does not touch", () => {
    const result = applyAction(dungeon, worldAt(START), move("east"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.world.dungeonId).toBe("test-dungeon");
    expect(result.world.playerParty.visibilityRadius).toBe(5);
    expect(result.world.playerParty.level).toBe(0);
    expect(result.world.playerParty.floor).toBe(0);
  });

  // A missing floor is a corrupt world, not a move a player could attempt:
  // rejections are for legal attempts, broken invariants throw.
  it("should throw when the party stands on a level that does not exist", () => {
    const world = worldAt(START);
    const broken: WorldState = { ...world, playerParty: { ...world.playerParty, level: 7 } };

    expect(() => applyAction(dungeon, broken, move("east"))).toThrow(/Level 7/);
  });

  it("should throw when the party stands on a floor its level does not have", () => {
    const world = worldAt(START);
    const broken: WorldState = { ...world, playerParty: { ...world.playerParty, floor: 3 } };

    expect(() => applyAction(dungeon, broken, move("east"))).toThrow(/Floor 3/);
  });
});
