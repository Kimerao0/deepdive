import { describe, expect, it } from "vitest";
import { step, type Coordinates, type Direction } from "#coordinates/index";
import { generateFloor, isWalkable, type Floor } from "#dungeon/floor/index";
import type { Dungeon } from "#dungeon/index";
import { applyAction, type WorldState } from "#world/index";
import { getFloorView, getViewTile, isWalkableKind, predictAction } from "#view/index";

const DIRECTIONS: Direction[] = ["north", "south", "east", "west"];

// A hand-built floor, so every classification below is exact.
//
//      x0 x1 x2 x3 x4 x5      C corridor    D room door
//  y0   .  .  .  .  .  .      E entry       R room tile
//  y1   .  .  E  .  .  .
//  y2   .  .  C  C  C  .
//  y3   .  .  .  .  D  R
//  y4   .  .  .  .  .  .
const PARTY: Coordinates = { x: 2, y: 2 };

const floor: Floor = {
  gridSize: 8,
  corridors: [{ x: 2, y: 1 }, PARTY, { x: 3, y: 2 }, { x: 4, y: 2 }],
  entries: [{ x: 2, y: 1 }],
  rooms: [
    {
      tileSet: "castle",
      tiles: [
        { position: { x: 4, y: 3 }, isEntrance: true },
        { position: { x: 5, y: 3 }, isEntrance: false },
      ],
    },
  ],
};

const move = (direction: Direction) => ({ type: "move" as const, direction });

describe("getFloorView", () => {
  it.each([0, 1, 6])("should return a dense square window at radius %i", (radius) => {
    const view = getFloorView(floor, PARTY, radius);

    expect(view.tiles.length).toBe(2 * radius + 1);
    for (const row of view.tiles) {
      expect(row.length).toBe(2 * radius + 1);
    }
  });

  it("should centre the window on the party", () => {
    const view = getFloorView(floor, PARTY, 2);

    expect(view.partyPosition).toEqual(PARTY);
    expect(view.tiles[2]![2]).toBe("corridor");
  });

  // Row-major with y downward: north is one row up, east one column right.
  it("should lay the window out row-major with y growing downward", () => {
    const view = getFloorView(floor, PARTY, 2);

    expect(view.tiles[1]![2]).toBe("entry"); // (2,1), north of the party
    expect(view.tiles[2]![3]).toBe("corridor"); // (3,2), east
    expect(view.tiles[3]![4]).toBe("door"); // (4,3), south-east
  });

  it("should let the more specific fact about a cell win", () => {
    const view = getFloorView(floor, PARTY, 2);

    // (2,1) is a corridor cell and the floor's entry; (4,3) is a room tile
    // and its door. The specific kind is the one worth knowing.
    expect(view.tiles[1]![2]).toBe("entry");
    expect(view.tiles[3]![4]).toBe("door");
  });

  it("should call both empty rock and off-grid cells void", () => {
    const view = getFloorView(floor, PARTY, 2);
    expect(view.tiles[2]![0]).toBe("void"); // (0,2), inside the grid, empty

    const corner = getFloorView(floor, { x: 0, y: 0 }, 2);
    expect(corner.tiles[0]![0]).toBe("void"); // (-2,-2), off the grid
    expect(corner.tiles[3]![4]).toBe("entry"); // (2,1) still lands correctly
  });

  it("should agree with isWalkable on every cell it reports", () => {
    const generated = generateFloor("small", "castle", "dense", 1);
    const start = generated.corridors[0]!;
    const radius = 6;
    const view = getFloorView(generated, start, radius);

    for (let y = start.y - radius; y <= start.y + radius; y++) {
      for (let x = start.x - radius; x <= start.x + radius; x++) {
        const kind = getViewTile(view, { x, y });
        expect(kind).toBeDefined();
        expect(isWalkableKind(kind!)).toBe(isWalkable(generated, { x, y }));
      }
    }
  });
});

describe("getViewTile", () => {
  it("should read a cell by its absolute position", () => {
    const view = getFloorView(floor, PARTY, 2);

    expect(getViewTile(view, PARTY)).toBe("corridor");
    expect(getViewTile(view, { x: 2, y: 1 })).toBe("entry");
    expect(getViewTile(view, { x: 0, y: 2 })).toBe("void");
  });

  it("should return undefined outside the window", () => {
    const view = getFloorView(floor, PARTY, 2);

    expect(getViewTile(view, { x: 5, y: 2 })).toBeUndefined();
    expect(getViewTile(view, { x: 2, y: -1 })).toBeUndefined();
  });
});

describe("predictAction", () => {
  it("should move the party onto a walkable neighbour", () => {
    const view = getFloorView(floor, PARTY, 2);
    const prediction = predictAction(view, PARTY, move("east"));

    expect(prediction).toEqual({ outcome: "moved", position: { x: 3, y: 2 } });
  });

  it("should block a move into a cell it knows is void", () => {
    const view = getFloorView(floor, PARTY, 2);

    expect(predictAction(view, PARTY, move("west")).outcome).toBe("blocked");
    expect(predictAction(view, PARTY, move("south")).outcome).toBe("blocked");
  });

  // The distinction matters: the client does not dispatch what it rejects
  // locally, so a wrong "blocked" would swallow a legal action outright.
  it("should report unknown, not blocked, past the edge of the window", () => {
    const view = getFloorView(floor, PARTY, 2);
    const onTheEdge = { x: PARTY.x + 2, y: PARTY.y };

    expect(predictAction(view, onTheEdge, move("east")).outcome).toBe("unknown");
    expect(predictAction(view, { x: PARTY.x + 1, y: PARTY.y }, move("east")).outcome).not.toBe("unknown");
  });

  it("should predict from a position ahead of the last authoritative one", () => {
    const view = getFloorView(floor, PARTY, 2);

    // the party optimistically stands one tile east already
    const prediction = predictAction(view, { x: 3, y: 2 }, move("east"));
    expect(prediction).toEqual({ outcome: "moved", position: { x: 4, y: 2 } });
  });

  it("should reach the window edge and no further", () => {
    const radius = 3;
    const view = getFloorView(floor, PARTY, radius);
    let position = PARTY;
    let steps = 0;

    // walking due east: predictable while inside the window, unknown after
    while (predictAction(view, position, move("east")).outcome !== "unknown") {
      position = step(position, "east");
      steps++;
      if (steps > 10) break;
    }
    expect(steps).toBe(radius);
  });

  it("should give the same verdict as applyAction across a generated floor", () => {
    const generated = generateFloor("medium", "castle", "normal", 2);
    const dungeon: Dungeon = {
      difficulty: "easy",
      levels: [[generated]],
      connections: [],
      entrance: { level: 0, floor: 0, entry: 0 },
    };
    const radius = 6;

    const starts = [...generated.corridors.slice(0, 30), ...generated.rooms.flatMap((room) => room.tiles.slice(0, 2).map((tile) => tile.position))];
    let checked = 0;

    for (const start of starts) {
      const view = getFloorView(generated, start, radius);
      const world: WorldState = {
        dungeonId: "test-dungeon",
        playerParty: { position: start, level: 0, floor: 0, visibilityRadius: radius },
        turnCounter: 0,
      };

      for (const direction of DIRECTIONS) {
        const prediction = predictAction(view, start, move(direction));
        const authoritative = applyAction(dungeon, world, move(direction));

        // one step from the centre is always inside the window
        expect(prediction.outcome).not.toBe("unknown");
        expect(prediction.outcome === "moved").toBe(authoritative.ok);
        if (prediction.outcome === "moved" && authoritative.ok) {
          expect(prediction.position).toEqual(authoritative.world.playerParty.position);
        }
        checked++;
      }
    }

    expect(checked).toBeGreaterThan(100);
  });
});
